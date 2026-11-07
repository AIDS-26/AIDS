"""Trusted read access to evaluation labels; scoring/recall logic comes later."""

from contextlib import contextmanager
from pathlib import Path

from app.db import connect, database_path
from app.labels import resolve_label_path


@contextmanager
def evaluation_connection(path: str | Path | None = None, *, labels_path: str | Path | None = None):
    """Only evaluation attaches ground truth, read-only, on a fresh connection.

    This is data separation, not an OS security boundary. Runtime tools must not
    be given this file or the original labeled EVE source. No multi-file writes.
    """
    main = Path(path).resolve() if path is not None else database_path()
    target = resolve_label_path(main, labels_path)
    if not target.is_file():
        raise FileNotFoundError("Evaluation labels are missing; import the labeled source first")
    with connect(main, read_only=True) as connection:
        connection.execute("ATTACH DATABASE ? AS ground_truth", (target.as_uri() + "?mode=ro",))
        connection.execute("PRAGMA query_only = ON")
        connection.execute("BEGIN")
        missing = connection.execute("""SELECT d.id FROM datasets d
            LEFT JOIN ground_truth.label_datasets l ON l.sha256 = d.sha256
            WHERE l.sha256 IS NULL OR l.event_count != d.event_count LIMIT 1""").fetchone()
        if missing:
            raise ValueError("Label store does not match runtime datasets; reimport the original sources")
        yield connection
