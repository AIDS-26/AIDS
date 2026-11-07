"""Read models for SIEM clients. Runtime connections never attach labels."""

from __future__ import annotations

from pathlib import Path

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
            observation_seconds, budget_per_hour, created_at, completed_at
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
            ae.n_in_window, ae.raised_score FROM alert_events ae
            JOIN events e ON e.id = ae.event_id
            WHERE ae.run_id = ? AND ae.alert_id = ? AND e.id > ?
            ORDER BY e.id LIMIT ?""", (run_id, alert_id, after_id, limit + 1)).fetchall(), limit)
