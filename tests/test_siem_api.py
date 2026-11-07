"""Exercise EVE -> runtime database -> HTTP with no calculation installed."""

import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from app.api import make_server
from app.db import connect, migrate
from app.import_events import import_eve


class SiemApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = self.root / "runtime.sqlite3"
        migrate(self.path)
        self.source = self.root / "eve.json"
        event = {"event_type": "alert", "timestamp": "2026-11-05T09:00:08Z",
                 "src_ip": "192.168.10.9", "dest_ip": "192.168.10.3",
                 "flow_id": 9007199254740993, "dest_port": 53, "proto": "UDP",
                 "alert": {"signature_id": 1, "signature": "test", "severity": 2},
                 "demo": {"label": "attack", "phase": "secret"}}
        self.source.write_text("\n".join(json.dumps(event) for _ in range(3)), encoding="utf-8")
        self.dataset = import_eve(self.source, self.path)["dataset_id"]
        self.server = make_server(self.path, port=0, allowed_origin="http://localhost:5173")
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def get(self, route, origin=None):
        request = Request(self.base + route, headers={"Origin": origin} if origin else {})
        with urlopen(request, timeout=5) as response:
            return json.load(response), response.headers

    def test_import_to_paginated_feed_preserves_all_source_lines(self):
        self.assertFalse(import_eve(self.source, self.path)["imported"])
        payload, _ = self.get("/api/datasets")
        self.assertEqual(payload["items"][0]["event_count"], 3)
        self.assertNotIn("source_path", payload["items"][0])
        first, _ = self.get(f"/api/datasets/{self.dataset}/alerts?limit=2")
        second, _ = self.get(f"/api/datasets/{self.dataset}/alerts?limit=2&after_id={first['next_after_id']}")
        items = first["items"] + second["items"]
        self.assertEqual([item["source_line"] for item in items], [1, 2, 3])
        self.assertIsNone(second["next_after_id"])
        for item in items:
            self.assertIsNone(item["score"])
            self.assertIsNone(item["severity"])
            self.assertEqual(item["suricata_severity"], 2)
            self.assertEqual(item["flow_id"], "9007199254740993")
        self.assertNotIn("secret", json.dumps(items))
        self.assertNotIn("demo", json.dumps(items))
        with connect(self.path, read_only=True) as db:
            self.assertEqual(len(db.execute("PRAGMA database_list").fetchall()), 1)
            self.assertEqual(db.execute("SELECT count(*) FROM runs").fetchone()[0], 0)

    def test_bad_queries_missing_resources_and_exact_cors(self):
        for route, status in (("/api/datasets?limit=501", 400),
                              ("/api/datasets?after_id=-1", 400),
                              ("/api/datasets?limit=no", 400),
                              ("/api/datasets?limit=1&limit=2", 400),
                              ("/api/datasets?sql=anything", 400),
                              ("/api/datasets/999/alerts", 404),
                              ("/api/runs/999/alerts", 404), ("/nope", 404)):
            with self.subTest(route=route), self.assertRaises(HTTPError) as raised:
                self.get(route)
            self.assertEqual(raised.exception.code, status)
            raised.exception.close()
        _, headers = self.get("/api/datasets", "http://localhost:5173")
        self.assertEqual(headers["Access-Control-Allow-Origin"], "http://localhost:5173")
        _, headers = self.get("/api/datasets", "http://example.com")
        self.assertIsNone(headers.get("Access-Control-Allow-Origin"))

    def test_completed_calculation_results_and_evidence_are_separate(self):
        with connect(self.path) as db:
            db.execute("INSERT INTO rule_versions (id, rules_json, rationale, created_by) VALUES ('test', '{}', 'fixture', 'test')")
            db.execute("INSERT INTO rules VALUES ('r', 'test', 'test')")
            run = db.execute("""INSERT INTO runs (dataset_id, mode, rule_version,
                rule_version_id, rules_json, observation_seconds) VALUES (?, 'baseline',
                'test', 'test', '{}', 60)""", (self.dataset,)).lastrowid
            alert = db.execute("""INSERT INTO alerts (run_id, rule_id, group_key,
                attack_type, service, first_timestamp_us, last_timestamp_us, base_score, score)
                VALUES (?, 'r', 'target:test', 'test', 'test', 0, 0, 5, 7)""", (run,)).lastrowid
            event = db.execute("SELECT id FROM events ORDER BY id LIMIT 1").fetchone()[0]
            db.execute("INSERT INTO alert_events VALUES (?, ?, ?, ?, 1, 7)",
                       (alert, event, run, self.dataset))
        with self.assertRaises(HTTPError) as raised:
            self.get(f"/api/runs/{run}/alerts")
        self.assertEqual(raised.exception.code, 400)
        raised.exception.close()
        with connect(self.path) as db:
            db.execute("UPDATE runs SET status='completed' WHERE id=?", (run,))
        result, _ = self.get(f"/api/runs/{run}/alerts")
        self.assertEqual(result["items"][0]["score"], 7)
        self.assertEqual(result["items"][0]["event_count"], 1)
        self.assertEqual(result["items"][0]["severity"], "Medium")
        result, _ = self.get(f"/api/runs/{run}/alerts/{alert}/events")
        self.assertEqual(result["items"][0]["id"], event)
        result, _ = self.get(f"/api/datasets/{self.dataset}/runs")
        self.assertEqual(result["items"][0]["id"], run)

    def test_server_does_not_create_missing_database(self):
        missing = self.root / "missing.sqlite3"
        import sqlite3
        with self.assertRaises(sqlite3.OperationalError):
            make_server(missing, port=0)
        self.assertFalse(missing.exists())


if __name__ == "__main__":
    unittest.main()
