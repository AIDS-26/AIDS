"""Read models for SIEM clients. Runtime connections never attach labels."""

from __future__ import annotations

from pathlib import Path
import json

from app.db import connect


def page_bounds(limit: int, after_id: int) -> None:
    if type(limit) is not int or not 1 <= limit <= 500:
        raise ValueError("limit must be an integer from 1 to 500")
    if type(after_id) is not int or after_id < 0:
        raise ValueError("after_id must be a nonnegative integer")


def _page(rows: list, limit: int) -> dict:
    more = len(rows) > limit
    items = [dict(row) for row in rows[:limit]]
    return {"items": items, "next_after_id": items[-1]["id"] if more else None}


def datasets(path: str | Path | None = None, *, limit: int = 100, after_id: int = 0) -> dict:
    page_bounds(limit, after_id)
    with connect(path, read_only=True) as db:
        return _page(db.execute("""SELECT id, name, sha256, event_count, split,
            suricata_version, et_open_version, imported_at FROM datasets
            WHERE id > ? ORDER BY id LIMIT ?""", (after_id, limit + 1)).fetchall(), limit)


def source_alerts(dataset_id: int, path: str | Path | None = None, *,
                  limit: int = 100, after_id: int = 0) -> dict:
    """One imported Suricata alert per source line; no invented application scores.

    ID ordering is a stable transport cursor, not replay time ordering.
    Calculation workers must use (timestamp_us, source_line) ordering instead.
    """
    page_bounds(limit, after_id)
    with connect(path, read_only=True) as db:
        if not db.execute("SELECT 1 FROM datasets WHERE id = ?", (dataset_id,)).fetchone():
            raise LookupError("Dataset not found")
        result = _page(db.execute("""SELECT id, dataset_id, source_line, timestamp,
            timestamp_us, src_ip, dest_ip, dest_port, proto, signature_id, signature,
            category, flow_id, json_extract(raw_json, '$.src_port') AS src_port,
            json_extract(raw_json, '$.alert.severity') AS suricata_severity
            FROM events WHERE dataset_id = ? AND id > ? ORDER BY id LIMIT ?""",
            (dataset_id, after_id, limit + 1)).fetchall(), limit)
    for item in result["items"]:
        item.update(score=None, severity=None, calculation_status="pending")
        # Suricata flow IDs can exceed JavaScript's exact integer range.
        if item["flow_id"] is not None:
            item["flow_id"] = str(item["flow_id"])
    return {"dataset_id": dataset_id, "kind": "source_alerts", **result}


def runs(dataset_id: int, path: str | Path | None = None, *,
         limit: int = 100, after_id: int = 0) -> dict:
    page_bounds(limit, after_id)
    with connect(path, read_only=True) as db:
        if not db.execute("SELECT 1 FROM datasets WHERE id = ?", (dataset_id,)).fetchone():
            raise LookupError("Dataset not found")
        return _page(db.execute("""SELECT id, dataset_id, mode, status, rule_version_id,
            observation_seconds, budget_per_hour, created_at, completed_at, error_message, failed_at
            FROM runs WHERE dataset_id = ? AND id > ? ORDER BY id LIMIT ?""",
            (dataset_id, after_id, limit + 1)).fetchall(), limit)


def calculated_alerts(run_id: int, path: str | Path | None = None, *,
                      limit: int = 100, after_id: int = 0) -> dict:
    page_bounds(limit, after_id)
    with connect(path, read_only=True) as db:
        run = db.execute("SELECT status, mode FROM runs WHERE id = ?", (run_id,)).fetchone()
        if run is None:
            raise LookupError("Run not found")
        # Partially written/failed results must not look like a completed baseline.
        if run["status"] != "completed":
            raise ValueError("Run is not completed")
        return {"run_id": run_id, "mode": run["mode"], "kind": "calculated_alerts",
                **_page(db.execute("""SELECT a.id, a.run_id, a.rule_id, a.group_key, a.attack_type,
                    a.service, a.first_timestamp_us, a.last_timestamp_us, a.base_score, a.score,
                    a.severity, a.event_count, e.id AS first_event_id, e.source_line,
                    e.timestamp, e.src_ip, e.dest_ip, e.dest_port, e.signature_id, e.signature
                    FROM alerts a LEFT JOIN events e ON e.id = (
                        SELECT ae.event_id FROM alert_events ae JOIN events member ON member.id=ae.event_id
                        WHERE ae.alert_id=a.id ORDER BY member.timestamp_us, member.source_line LIMIT 1)
                    WHERE a.run_id = ? AND a.id > ?
                    ORDER BY a.id LIMIT ?""", (run_id, after_id, limit + 1)).fetchall(), limit)}


def evidence(run_id: int, alert_id: int, path: str | Path | None = None, *,
             limit: int = 100, after_id: int = 0) -> dict:
    page_bounds(limit, after_id)
    with connect(path, read_only=True) as db:
        if not db.execute("""SELECT 1 FROM alerts a JOIN runs r ON r.id = a.run_id
            WHERE a.id = ? AND r.id = ? AND r.status = 'completed'""",
            (alert_id, run_id)).fetchone():
            raise LookupError("Completed alert not found")
        return _page(db.execute("""SELECT e.id, e.dataset_id, e.source_line, e.timestamp,
            e.timestamp_us, e.src_ip, e.dest_ip, e.signature_id, e.signature,
            ae.n_in_window, ae.raised_score, tes.base_score AS event_base_score,
            tes.rule_id AS event_rule_id, tes.window_minutes, tes.n_sat, tes.alert_score
            FROM alert_events ae
            JOIN events e ON e.id = ae.event_id
            LEFT JOIN tuned_event_scores tes ON tes.run_id=ae.run_id AND tes.event_id=ae.event_id
            WHERE ae.run_id = ? AND ae.alert_id = ? AND e.id > ?
            ORDER BY e.id LIMIT ?""", (run_id, alert_id, after_id, limit + 1)).fetchall(), limit)


def tuning_attempts(dataset_id, path=None, *, limit=100, after_id=0):
    page_bounds(limit, after_id)
    with connect(path, read_only=True) as db:
        if not db.execute('SELECT 1 FROM datasets WHERE id=?', (dataset_id,)).fetchone():
            raise LookupError('Dataset not found')
        return _page(db.execute('''SELECT t.id,t.baseline_run_id,t.created_by,t.status,t.error_message,
            t.created_at,t.selected_version_id,t.outcome_json FROM tuning_attempts t
            JOIN runs r ON r.id=t.baseline_run_id WHERE r.dataset_id=? AND t.id>?
            ORDER BY t.id LIMIT ?''', (dataset_id, after_id, limit + 1)).fetchall(), limit)


def tuning_detail(attempt_id, path=None, *, limit=100, after_id=0):
    page_bounds(limit, after_id)
    with connect(path, read_only=True) as db:
        row = db.execute('SELECT * FROM tuning_attempts WHERE id=?', (attempt_id,)).fetchone()
        if row is None:
            raise LookupError('Tuning attempt not found')
        attempt = dict(row)
        for field in ('policy', 'flow', 'outcome', 'evaluation_policy'):
            value = attempt.pop(field + '_json')
            attempt[field] = json.loads(value) if value else None
        page = _page(db.execute('''SELECT id,iteration,rule_version_id,evaluation_id,model_name,
            report_text,status,error_message,proposal_json,guardrail_json,tuned_run_id
            FROM tuning_iterations WHERE attempt_id=? AND id>? ORDER BY id LIMIT ?''',
            (attempt_id, after_id, limit + 1)).fetchall(), limit)
        for item in page['items']:
            for field in ('proposal', 'guardrail'):
                value = item.pop(field + '_json')
                item[field] = json.loads(value) if value else None
            report = item.pop('report_text')
            try:
                item['report'] = json.loads(report) if report else None
            except ValueError:
                item['report'] = report  # historical prose is not a fabricated JSON report
        return {'attempt': attempt, 'iterations': page}


def rule_history(run_id, path=None, *, limit=100, after_id=0):
    """Lineage from the run's version to its ancestors, with immutable diffs."""
    page_bounds(limit, after_id)
    with connect(path, read_only=True) as db:
        row = db.execute('SELECT rule_version_id FROM runs WHERE id=?', (run_id,)).fetchone()
        if row is None:
            raise LookupError('Run not found')
        # Recursive depth is a stable cursor within an immutable version lineage.
        rows = db.execute('''WITH RECURSIVE history(id,parent_id,depth) AS (
            SELECT id,parent_id,0 FROM rule_versions WHERE id=? UNION ALL
            SELECT v.id,v.parent_id,h.depth+1 FROM rule_versions v JOIN history h ON v.id=h.parent_id)
            SELECT v.*,h.depth+1 AS cursor FROM history h JOIN rule_versions v ON v.id=h.id
            WHERE h.depth+1>? ORDER BY h.depth LIMIT ?''',
            (row['rule_version_id'], after_id, limit + 1)).fetchall()
        items = [dict(r) for r in rows[:limit]]
        for item in items:
            item['rules'] = json.loads(item.pop('rules_json'))
            item['changes'] = json.loads(item.pop('changes_json'))
        return {'items': items, 'next_after_id': items[-1]['cursor'] if len(rows) > limit else None}
