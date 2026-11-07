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
    baseline = commands.add_parser('score-baseline', help='Score an imported dataset and persist SIEM I results')
    baseline.add_argument('dataset_id', type=int)
    baseline.add_argument('--observation-seconds', type=float, required=True)
    baseline.add_argument('--attack-rules', type=Path)
    baseline.add_argument('--service-rules', type=Path)
    tuning = commands.add_parser('tune', help='Offline tuning, deterministic replay, and guarded rule versioning')
    tuning.add_argument('baseline_run_id', type=int)
    tuning.add_argument('--policy', type=Path, default=Path('config/tuning_policy.json'))
    tuning.add_argument('--proposer', choices=['model', 'deterministic'], default='model')
    tuning.add_argument('--model', help='Explicit Responses API model; alternatively CODEX_MODEL')
    evaluation = tuning.add_mutually_exclusive_group()
    evaluation.add_argument('--evaluation-manifest', type=Path)
    evaluation.add_argument('--evaluation-session-minutes', type=float,
                            help='Explicit curated demo evaluation policy; approved demo value: 10')
    tuning.add_argument('--label-provenance', required=True)
    tuning.add_argument('--output-directory', type=Path, default=Path('output/tuning'))
    tuning.add_argument('--from-version', help='Continue from a version previously accepted on this baseline')
    replay = commands.add_parser('replay-tuned', help='Replay a validated rule version without labels or a model')
    replay.add_argument('baseline_run_id', type=int)
    replay.add_argument('--rule-version', required=True)
    args = parser.parse_args()
    path = args.database.resolve() if args.database else database_path()
    if args.command == "migrate":
        result = {"database": str(path), "applied": migrate(path, labels_path=args.labels_database)}
    elif args.command == "import-eve":
        migrate(path, labels_path=args.labels_database)
        result = {"database": str(path), **import_eve(
            args.source, path, labels_path=args.labels_database, split=args.split,
            suricata_version=args.suricata_version, et_open_version=args.et_open_version)}
    elif args.command == 'score-baseline':
        from app.baseline import score_baseline
        options = {key: value for key, value in {
            'attack_rules': args.attack_rules, 'service_rules': args.service_rules}.items() if value is not None}
        result = score_baseline(args.dataset_id, path,
                                observation_seconds=args.observation_seconds, **options)
    elif args.command == 'tune':
        import os
        from app.tuning.model import ResponsesProposer, DeterministicProposer
        from app.tuning.policy import load_document
        from app.tuning.runner import tune
        proposer = (ResponsesProposer(args.model or os.environ.get('CODEX_MODEL'))
                    if args.proposer == 'model' else DeterministicProposer())
        result = tune(args.baseline_run_id, path, policy=load_document(args.policy), proposer=proposer,
                      labels_path=args.labels_database,
                      evaluation_manifest=load_document(args.evaluation_manifest) if args.evaluation_manifest else None,
                      evaluation_session_minutes=args.evaluation_session_minutes,
                      label_provenance=args.label_provenance, output_directory=args.output_directory,
                      from_version_id=args.from_version)
        print(json.dumps(result, indent=2))
        if result['status'] != 'completed':
            raise SystemExit(1)
        return
    elif args.command == 'replay-tuned':
        from app.tuning.runner import replay_version
        result = replay_version(args.baseline_run_id, args.rule_version, path)
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
