"""Trusted ingestion/migration writers for the separate evaluation label store.

No labels are attached to processing connections. Identity is source hash + line.
"""

import json
from pathlib import Path
import sqlite3

from app.db import MIGRATIONS_DIR, connect, label_database_path, migrate


def resolve_label_path(main_path: str | Path, labels_path: str | Path | None = None) -> Path:
    main = Path(main_path).resolve()
    target = Path(labels_path).resolve() if labels_path is not None else label_database_path(main)
    if target == main or (target.exists() and main.exists() and target.samefile(main)):
        raise ValueError("Label database must be separate from the runtime database")
    return target


def store_labels(checksum: str, event_count: int, records: list[dict], target: Path) -> None:
    """Commit/verify a complete label set before committing runtime events.

    An interrupted import may leave orphan labels; retry safely reconciles by
    source identity. The two WAL files are deliberately not one transaction.
    """
    migrate(target, MIGRATIONS_DIR / "labels")
    with connect(target) as connection:
        connection.execute("BEGIN IMMEDIATE")
        existing = connection.execute(
            "SELECT event_count, label_count FROM label_datasets WHERE sha256 = ?", (checksum,)
        ).fetchone()
        if existing and tuple(existing) != (event_count, len(records)):
            raise ValueError("Label counts conflict with an existing source checksum")
        connection.execute(
            "INSERT OR IGNORE INTO label_datasets (sha256, event_count, label_count) VALUES (?, ?, ?)",
            (checksum, event_count, len(records)),
        )
        for record in records:
            values = (checksum, record["source_line"], record["label"], record.get("phase"),
                      record.get("original_timestamp"), record["provenance"],
                      json.dumps(record["metadata"], sort_keys=True))
            old = connection.execute(
                "SELECT * FROM event_labels WHERE dataset_sha256 = ? AND source_line = ?", values[:2]
            ).fetchone()
            if old and tuple(old) != values:
                raise ValueError("Labels conflict with an existing immutable source record")
            connection.execute("INSERT OR IGNORE INTO event_labels VALUES (?, ?, ?, ?, ?, ?, ?)", values)
        if connection.execute("SELECT count(*) FROM event_labels WHERE dataset_sha256 = ?", (checksum,)).fetchone()[0] != len(records):
            raise ValueError("Label copy verification failed")
    with connect(target, read_only=True) as verification:
        if verification.execute("SELECT count(*) FROM event_labels WHERE dataset_sha256 = ?", (checksum,)).fetchone()[0] != len(records):
            raise ValueError("Committed label copy could not be verified")


def export_legacy_labels(connection: sqlite3.Connection, main: Path,
                         labels_path: str | Path | None = None) -> None:
    target = resolve_label_path(main, labels_path)
    for dataset in connection.execute("SELECT id, sha256, event_count FROM datasets").fetchall():
        records = []
        for row in connection.execute("""SELECT e.source_line, e.raw_json, l.*
            FROM events e JOIN event_labels l ON l.event_id = e.id
            WHERE e.dataset_id = ? ORDER BY e.source_line""", (dataset["id"],)):
            metadata = json.loads(row["raw_json"]).get("demo", {})
            records.append(dict(source_line=row["source_line"], label=row["label"],
                                phase=row["phase"], original_timestamp=row["original_timestamp"],
                                provenance=row["provenance"], metadata=metadata))
        store_labels(dataset["sha256"], dataset["event_count"], records, target)
