"""Run from the repository root: python -m scripts.manage_db --help."""

import argparse
import json
from pathlib import Path

from app.db import connect, database_path, migrate
from app.import_events import import_eve


def main() -> None:
    parser = argparse.ArgumentParser(description="Shared processing app / SIEM SQLite database")
    parser.add_argument("--database", type=Path, help="Explicit DB file; overrides DATABASE_PATH")
    parser.add_argument("--labels-database", type=Path, help="Separate label file; overrides LABEL_DATABASE_PATH")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("migrate", help="Apply pending migrations")
    importer = commands.add_parser("import-eve", help="Migrate and import EVE JSON Lines atomically")
    importer.add_argument("source", type=Path)
    importer.add_argument("--split", choices=("unassigned", "tune", "heldout"))
    importer.add_argument("--suricata-version")
    importer.add_argument("--et-open-version")
    metadata = commands.add_parser("dataset-metadata", help="Explicitly update source provenance")
    metadata.add_argument("dataset_id", type=int)
    metadata.add_argument("--split", choices=("unassigned", "tune", "heldout"))
    metadata.add_argument("--suricata-version")
    metadata.add_argument("--et-open-version")
    commands.add_parser("status", help="Show applied migrations and row counts")
    args = parser.parse_args()
    path = args.database.resolve() if args.database else database_path()
    if args.command == "migrate":
        result = {"database": str(path), "applied": migrate(path, labels_path=args.labels_database)}
    elif args.command == "import-eve":
        migrate(path, labels_path=args.labels_database)
        result = {"database": str(path), **import_eve(
            args.source, path, labels_path=args.labels_database, split=args.split,
            suricata_version=args.suricata_version, et_open_version=args.et_open_version)}
    elif args.command == "dataset-metadata":
        values = {key: value for key, value in {
            "split": args.split, "suricata_version": args.suricata_version,
            "et_open_version": args.et_open_version}.items() if value is not None}
        if not values:
            parser.error("Supply at least one metadata field")
        if not path.is_file():
            parser.error("Database does not exist; run migrate first")
        with connect(path) as connection:
            # Keys are from the fixed mapping above, never user-supplied SQL.
            assignment = ", ".join(key + " = ?" for key in values)
            cursor = connection.execute(f"UPDATE datasets SET {assignment} WHERE id = ?",
                                        (*values.values(), args.dataset_id))
            if not cursor.rowcount:
                parser.error("Dataset not found")
        result = {"dataset_id": args.dataset_id, "updated": values}
    else:
        if not path.is_file():
            parser.error("Database does not exist; run migrate first")
        with connect(path, read_only=True) as connection:
            tables = ("datasets", "events", "rule_versions", "rules", "runs", "alerts",
                      "alert_events", "rule_flow_stats", "evaluations", "tuning_attempts", "tuning_iterations")
            result = {
                "database": str(path),
                "journal_mode": connection.execute("PRAGMA journal_mode").fetchone()[0],
                "foreign_keys": bool(connection.execute("PRAGMA foreign_keys").fetchone()[0]),
                "datasets": [dict(row) for row in connection.execute(
                    "SELECT id, name, event_count, split, suricata_version, et_open_version FROM datasets")],
                "migrations": [dict(row) for row in connection.execute(
                    "SELECT name, applied_at FROM schema_migrations ORDER BY name")],
                "counts": {table: connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                           for table in tables},
            }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
