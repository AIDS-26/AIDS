"""Repeatable EVE ingestion with ground truth kept out of the runtime file."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re

from app.db import connect, database_path
from app.labels import resolve_label_path, store_labels


def import_eve(source: str | Path, path: str | Path | None = None, *,
               labels_path: str | Path | None = None, split: str | None = None,
               suricata_version: str | None = None, et_open_version: str | None = None) -> dict:
    """Validate first, commit labels, then runtime events. Retry repairs either copy.

    Original source bytes stay external; runtime JSON omits the demo block.
    WAL cannot promise atomic commits across files. An interrupted operation may
    leave orphan labels, which cannot join to runtime data until retry succeeds.
    """
    source = Path(source).resolve()
    main = Path(path).resolve() if path is not None else database_path()
    target = resolve_label_path(main, labels_path)
    if source in (main, target):
        raise ValueError("Source must be distinct from the database files")
    if split is not None and split not in ("unassigned", "tune", "heldout"):
        raise ValueError("split must be unassigned, tune, or heldout")
    digest = hashlib.sha256()
    events, labels = [], []
    with source.open("rb") as handle:
        for line_number, binary_line in enumerate(handle, 1):
            digest.update(binary_line)
            if not binary_line.strip():
                continue
            try:
                event = json.loads(binary_line.decode("utf-8-sig"))
                if not isinstance(event, dict):
                    raise ValueError("Each EVE line must be a JSON object")
                if event.get("event_type") != "alert":
                    continue
                timestamp = event["timestamp"]
                normalized = re.sub(r"([+-]\d{2})(\d{2})$", r"\1:\2", timestamp)
                instant = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
                if instant.tzinfo is None:
                    raise ValueError("Event timestamp needs a timezone")
                delta = instant.astimezone(timezone.utc) - datetime(1970, 1, 1, tzinfo=timezone.utc)
                timestamp_us = (delta.days * 86400 + delta.seconds) * 1000000 + delta.microseconds
                demo = event.pop("demo", {})
                if not isinstance(demo, dict):
                    raise ValueError("demo metadata must be an object")
                if "label" in demo:
                    if demo["label"] not in ("attack", "benign", "unconfirmed"):
                        raise ValueError("Unsupported demo label")
                    labels.append(dict(source_line=line_number, label=demo["label"],
                                       phase=demo.get("phase"), original_timestamp=demo.get("original_timestamp"),
                                       provenance="source demo.label (curated)", metadata=demo))
                elif demo:
                    labels.append(dict(source_line=line_number, label="unconfirmed",
                                       phase=demo.get("phase"), original_timestamp=demo.get("original_timestamp"),
                                       provenance="source demo metadata (no explicit label)", metadata=demo))
                alert = event["alert"]
                events.append((line_number, timestamp, timestamp_us, event.get("src_ip"),
                               event.get("dest_ip"), alert.get("signature_id"),
                               alert.get("signature"), json.dumps(event)))
            except (ValueError, KeyError, TypeError, AttributeError) as error:
                raise ValueError(f"Invalid EVE alert at line {line_number}: {error}") from error
    checksum = digest.hexdigest()
    with connect(main) as connection:
        connection.execute("BEGIN IMMEDIATE")
        existing = connection.execute("SELECT * FROM datasets WHERE sha256 = ?", (checksum,)).fetchone()
        if existing:
            if existing["event_count"] != len(events):
                raise ValueError("Existing dataset count does not match this source")
            for key, value in (("split", split), ("suricata_version", suricata_version),
                               ("et_open_version", et_open_version)):
                if value is not None and existing[key] != value:
                    raise ValueError(f"Existing {key} differs; use dataset-metadata to change it explicitly")
            dataset_id = existing["id"]
        else:
            dataset_id = connection.execute("""INSERT INTO datasets
                (name, sha256, source_path, event_count, split, suricata_version, et_open_version)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (source.name, checksum, str(source), len(events), split or "unassigned",
                 suricata_version, et_open_version)).lastrowid
            connection.executemany("""INSERT INTO events
                (dataset_id, source_line, timestamp, timestamp_us, src_ip, dest_ip,
                 signature_id, signature, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                ((dataset_id, *event) for event in events))
        store_labels(checksum, len(events), labels, target)
    return dict(dataset_id=dataset_id, events=len(events), imported=existing is None,
                sha256=checksum, labels=len(labels), label_database=str(target))
