"""Immutable SQLite history for YAML snapshots and evaluation attempts."""

import hashlib
import sqlite3
from datetime import datetime, timezone


def initialize(connection):
    connection.execute("""CREATE TABLE IF NOT EXISTS rule_versions (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER REFERENCES rule_versions(id),
        created_at TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('base', 'tuned')),
        status TEXT NOT NULL CHECK(status IN ('proposed', 'passed', 'failed')),
        yaml_text TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        evaluation_json TEXT,
        CHECK ((kind = 'base' AND status = 'passed') OR kind = 'tuned')
    )""")
    connection.execute("""CREATE TRIGGER IF NOT EXISTS rule_versions_no_update
        BEFORE UPDATE ON rule_versions BEGIN
        SELECT RAISE(ABORT, 'rule versions are immutable'); END""")
    connection.execute("""CREATE TRIGGER IF NOT EXISTS rule_versions_no_delete
        BEFORE DELETE ON rule_versions BEGIN
        SELECT RAISE(ABORT, 'rule versions are immutable'); END""")
    connection.commit()


def record(connection, yaml_text, *, kind, status, parent_id=None,
           evaluation_json=None):
    """Append one snapshot; caller must validate YAML and evaluation first."""
    if kind not in ("base", "tuned") or status not in ("proposed", "passed", "failed"):
        raise ValueError("invalid kind or status")
    if kind == "base" and (status != "passed" or parent_id is not None):
        raise ValueError("base must be a root passed snapshot")
    if kind == "tuned" and parent_id is None:
        raise ValueError("tuned snapshot requires a parent")
    digest = hashlib.sha256(yaml_text.encode("utf-8")).hexdigest()
    with connection:
        cursor = connection.execute(
            "INSERT INTO rule_versions (parent_id, created_at, kind, status, yaml_text, sha256, evaluation_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (parent_id, datetime.now(timezone.utc).isoformat(), kind, status,
             yaml_text, digest, evaluation_json),
        )
    return cursor.lastrowid


def list_versions(connection):
    return connection.execute(
        "SELECT id, parent_id, created_at, kind, status, sha256, evaluation_json FROM rule_versions ORDER BY id"
    ).fetchall()


def get_version(connection, version_id):
    """Return the complete YAML and evaluation for human review."""
    return connection.execute(
        "SELECT id, parent_id, created_at, kind, status, yaml_text, sha256, evaluation_json FROM rule_versions WHERE id = ?",
        (version_id,),
    ).fetchone()
