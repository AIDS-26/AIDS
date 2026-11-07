"""Shared SQLite connections and ordered, transactional SQL migrations."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
import sqlite3
from contextlib import contextmanager
from collections.abc import Iterator


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = PROJECT_ROOT / "migrations"


def _configured_path(key_name: str, default: str | Path) -> Path:
    """Environment overrides .env; relative database paths use the project root.

    Only the requested path setting is read. No credentials are loaded or logged.
    This intentionally supports plain and quoted values, not shell expansion.
    """
    value = os.environ.get(key_name)
    if value is None:
        env_file = PROJECT_ROOT / ".env"
        if env_file.exists():
            for line in env_file.read_text(encoding="utf-8-sig").splitlines():
                key, separator, candidate = line.partition("=")
                if separator and key.strip() == key_name:
                    value = candidate.strip()
                    break
    if value is None:
        value = str(default)
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1]
    if not value or value == ":memory:":
        raise ValueError(f"{key_name} must name a persistent SQLite file")
    path = Path(value).expanduser()
    return (path if path.is_absolute() else PROJECT_ROOT / path).resolve()


def database_path() -> Path:
    return _configured_path("DATABASE_PATH", "data/aids.sqlite3")


def label_database_path(main_path: str | Path | None = None) -> Path:
    main = Path(main_path).resolve() if main_path is not None else database_path()
    target = _configured_path("LABEL_DATABASE_PATH", main.with_name(main.stem + ".labels.sqlite3"))
    if target == main:
        raise ValueError("Label database must be separate from the runtime database")
    return target


@contextmanager
def connect(path: str | Path | None = None, *, read_only: bool = False) -> Iterator[sqlite3.Connection]:
    """Open one connection per operation/process; always close it on exit.

    Successful operations commit, exceptions roll back. WAL permits readers
    alongside one writer. Keep write transactions short and on the same host.
    """
    target = Path(path).resolve() if path is not None else database_path()
    if not read_only:
        target.parent.mkdir(parents=True, exist_ok=True)
    uri = target.as_uri() + ("?mode=ro" if read_only else "?mode=rwc")
    connection = sqlite3.connect(uri, timeout=10, uri=True)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 10000")
        mode = connection.execute("PRAGMA journal_mode" if read_only else "PRAGMA journal_mode = WAL").fetchone()[0]
        if mode.lower() != "wal":
            raise RuntimeError("The shared database requires SQLite WAL mode")
        with connection:
            yield connection
    finally:
        connection.close()


def _statements(sql: str) -> Iterator[str]:
    """Split complete SQL statements, including multiline triggers.

    Do not use executescript(): it can commit a pending transaction before
    running, which would break atomic migrations.
    """
    pending = ""
    for line in sql.splitlines(keepends=True):
        pending += line
        if sqlite3.complete_statement(pending):
            yield pending
            pending = ""
    if any(line.strip() and not line.lstrip().startswith("--")
           for line in pending.splitlines()):
        raise ValueError("Migration ends with an incomplete SQL statement")


def migrate(path: str | Path | None = None,
            directory: Path = MIGRATIONS_DIR, *, labels_path: str | Path | None = None) -> list[str]:
    """Apply pending numbered SQL files once; detect edited/missing migrations.

    A database write lock serializes concurrent migration invocations. All
    pending migrations and their history records commit or roll back together.
    """
    files = sorted(directory.glob("[0-9][0-9][0-9][0-9]_*.sql"))
    if not files:
        raise ValueError(f"No numbered SQL migrations found in {directory}")
    versions = [file.name.split("_", 1)[0] for file in files]
    if len(versions) != len(set(versions)):
        raise ValueError("Migration version numbers must be unique")
    applied = []
    with connect(path) as connection:
        connection.execute("PRAGMA secure_delete = ON")
        connection.execute("BEGIN IMMEDIATE")
        connection.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                name TEXT PRIMARY KEY,
                sha256 TEXT NOT NULL,
                applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            )
        """)
        history = dict(connection.execute("SELECT name, sha256 FROM schema_migrations"))
        missing = set(history) - {file.name for file in files}
        if missing:
            raise ValueError(f"Applied migration files are missing: {sorted(missing)}")
        for file in files:
            # Normalize CRLF so a Windows checkout does not change the checksum.
            sql = file.read_text(encoding="utf-8-sig")
            digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()
            if file.name in history:
                if history[file.name] != digest:
                    raise ValueError(f"Applied migration was edited: {file.name}")
                continue
            if history and file.name < max(history):
                raise ValueError(f"Cannot insert an older migration: {file.name}")
            if file.name == "0004_separate_labels.sql":
                # WAL does not provide atomic commits across database files.
                # Commit/verify labels first; rollback retains the original copy.
                from app.labels import export_legacy_labels
                main = Path(connection.execute("PRAGMA database_list").fetchone()[2])
                export_legacy_labels(connection, main, labels_path)
            for statement in _statements(sql):
                connection.execute(statement)
            connection.execute(
                "INSERT INTO schema_migrations (name, sha256) VALUES (?, ?)",
                (file.name, digest),
            )
            applied.append(file.name)
    _finish_label_cleanup(path)
    return applied


def _finish_label_cleanup(path: str | Path | None) -> None:
    """Compact old label pages and truncate WAL; resume interrupted maintenance.

    Run with workers stopped. Original sources/backups remain labeled data.
    """
    with connect(path) as connection:
        if not connection.execute(
            "SELECT 1 FROM sqlite_master WHERE name = 'database_maintenance'"
        ).fetchone():
            return
        if not connection.execute(
            "SELECT 1 FROM database_maintenance WHERE task = 'remove_legacy_labels' AND completed_at IS NULL"
        ).fetchone():
            return
        if connection.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()[0]:
            raise RuntimeError("Stop database workers and rerun migrate to finish label cleanup")
        connection.execute("VACUUM")
        if connection.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()[0]:
            raise RuntimeError("Label cleanup checkpoint was busy; rerun migrate with workers stopped")
        connection.execute("""UPDATE database_maintenance
            SET completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE task = 'remove_legacy_labels'""")
