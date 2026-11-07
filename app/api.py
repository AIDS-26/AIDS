"""Local SIEM read API and tuning control: python -m app.api --help."""

from __future__ import annotations

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import sqlite3
from urllib.parse import parse_qs, urlsplit

from app.db import connect, database_path
from app import siem
from app.replay_view import replay_view
from app.tuning.jobs import JobError, TuningJobs


def make_server(path: str | Path | None = None, *, host: str = "127.0.0.1",
                port: int = 8000, allowed_origin: str | None = None) -> ThreadingHTTPServer:
    """Read routes plus a local-only tuning control; scoring runs in a worker."""
    target = Path(path).resolve() if path is not None else database_path()
    jobs = TuningJobs(target)
    # Fail before listening if setup has not completed; never create an empty DB.
    with connect(target, read_only=True) as db:
        db.execute("SELECT dest_port FROM events LIMIT 0")
        db.execute("SELECT rule_version_id FROM runs LIMIT 0")
        db.execute("SELECT alert_score FROM tuned_event_scores LIMIT 0")

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            # Avoid logging request text supplied by clients.
            pass

        def reply(self, status: int, payload: dict):
            body = json.dumps(payload, allow_nan=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            if allowed_origin:
                self.send_header("Vary", "Origin")
                if self.headers.get("Origin") == allowed_origin:
                    self.send_header("Access-Control-Allow-Origin", allowed_origin)
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            url = urlsplit(self.path)
            try:
                query = parse_qs(url.query, keep_blank_values=True, max_num_fields=10)
                if set(query) - {"limit", "after_id"} or any(len(v) != 1 for v in query.values()):
                    raise ValueError("Supported query parameters: limit, after_id (once each)")
                paging = {key: int(values[0]) for key, values in query.items()}
                siem.page_bounds(paging.get("limit", 100), paging.get("after_id", 0))
                if url.path == '/api/tuning-jobs':
                    if paging:
                        raise ValueError('Tuning settings do not accept pagination')
                    result = jobs.settings()
                elif match := re.fullmatch(r'/api/tuning-jobs/([a-f0-9]{32})', url.path):
                    if paging:
                        raise ValueError('Tuning jobs do not accept pagination')
                    result = jobs.get(match[1])
                elif url.path in ("/api/health", "/health"):
                    with connect(target, read_only=True) as db:
                        db.execute("SELECT 1").fetchone()
                    result = {"status": "ok", "database": "ok"}
                elif url.path == "/api/datasets":
                    result = siem.datasets(target, **paging)
                elif match := re.fullmatch(r"/api/datasets/([1-9][0-9]*)/(alerts|runs|tuning-attempts)", url.path):
                    reader = {'alerts': siem.source_alerts, 'runs': siem.runs,
                              'tuning-attempts': siem.tuning_attempts}[match[2]]
                    result = reader(int(match[1]), target, **paging)
                elif match := re.fullmatch(r"/api/runs/([1-9][0-9]*)/replay", url.path):
                    if paging:
                        raise ValueError('Replay returns a complete snapshot; pagination parameters are not supported')
                    result = replay_view(int(match[1]), target)
                elif match := re.fullmatch(r"/api/runs/([1-9][0-9]*)/alerts", url.path):
                    result = siem.calculated_alerts(int(match[1]), target, **paging)
                elif match := re.fullmatch(r"/api/runs/([1-9][0-9]*)/alerts/([1-9][0-9]*)/events", url.path):
                    result = siem.evidence(int(match[1]), int(match[2]), target, **paging)
                elif match := re.fullmatch(r"/api/tuning-attempts/([1-9][0-9]*)", url.path):
                    result = siem.tuning_detail(int(match[1]), target, **paging)
                elif match := re.fullmatch(r"/api/runs/([1-9][0-9]*)/rule-history", url.path):
                    result = siem.rule_history(int(match[1]), target, **paging)
                else:
                    self.reply(404, {"error": "Route not found"})
                    return
                self.reply(200, result)
            except JobError as error:
                self.reply(error.status, {'error': str(error)})
            except LookupError as error:
                self.reply(404, {"error": str(error)})
            except (ValueError, OverflowError) as error:
                self.reply(400, {"error": str(error)})
            except sqlite3.Error:
                self.reply(503, {"error": "Database unavailable"})

        def do_POST(self):
            if self.path != '/api/tuning-jobs':
                self.reply(404, {'error': 'Route not found'})
                return
            # This demo control is for the same-host Next.js server. Browsers use
            # its same-origin proxy; ordinary read routes are unchanged.
            if (self.client_address[0] not in ('127.0.0.1', '::1')
                    or self.headers.get('X-IDEAX-Control') != 'local-tuning'
                    or self.headers.get('Origin')
                    or any(self.headers.get(name) for name in
                           ('Forwarded', 'X-Forwarded-For', 'X-Forwarded-Host', 'X-Forwarded-Proto'))):
                self.reply(403, {'error': 'Tuning control requires the local dashboard proxy'})
                return
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 1024 or self.headers.get('Content-Type') != 'application/json':
                    raise ValueError('Expected a small JSON tuning request')
                payload = json.loads(self.rfile.read(size))
                if not isinstance(payload, dict) or set(payload) != {'baseline_run_id', 'request_id'}:
                    raise ValueError('Expected baseline_run_id and request_id')
                if not isinstance(payload['request_id'], str) or not re.fullmatch('[a-f0-9]{32}', payload['request_id']):
                    raise ValueError('Invalid tuning request ID')
                self.reply(202, jobs.start(payload['baseline_run_id'], payload['request_id']))
            except JobError as error:
                self.reply(error.status, {'error': str(error)})
            except (ValueError, UnicodeError) as error:
                self.reply(400, {'error': str(error) if not isinstance(error, json.JSONDecodeError) else 'Invalid JSON'})
            except sqlite3.Error:
                self.reply(503, {'error': 'Database unavailable'})

    return ThreadingHTTPServer((host, port), Handler)


def main() -> None:
    parser = argparse.ArgumentParser(description="Local SIEM read API; migrate/import separately")
    parser.add_argument("--database", type=Path)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--allowed-origin", help="Exact frontend origin, e.g. http://localhost:5173")
    args = parser.parse_args()
    with make_server(args.database, host=args.host, port=args.port,
                     allowed_origin=args.allowed_origin) as server:
        print(f"SIEM API listening on http://{args.host}:{server.server_port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
