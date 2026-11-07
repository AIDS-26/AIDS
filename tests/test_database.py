import hashlib
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from app.db import connect, database_path, migrate
from app.import_events import import_eve
from app.evaluate import evaluation_connection


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = self.root / "test.sqlite3"

    def event(self, label="attack"):
        return {
            "event_type": "alert", "timestamp": "2026-11-05T09:00:08.000000+0000",
            "src_ip": "192.0.2.1", "dest_ip": "192.0.2.2",
            "alert": {"signature_id": 123, "signature": "test"},
            "demo": {"label": label, "phase": "attack_1", "original_timestamp": "original"},
        }

    def source(self, content):
        source = self.root / "eve.json"
        source.write_text(content, encoding="utf-8")
        return source

    def test_migration_is_repeatable_and_schema_is_healthy(self):
        self.assertEqual(migrate(self.path), ["0001_initial.sql", "0002_evaluation_bounds.sql",
                                            "0003_rule_audit_and_metrics.sql", "0004_separate_labels.sql",
                                            "0005_tuning_replay.sql"])
        self.assertEqual(migrate(self.path), [])
        with connect(self.path) as connection:
            self.assertEqual(connection.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
            self.assertEqual(connection.execute("PRAGMA foreign_keys").fetchone()[0], 1)

    def test_failed_migration_rolls_back_schema_and_history(self):
        migrations = self.root / "migrations"
        migrations.mkdir()
        initial = Path(__file__).resolve().parents[1] / "migrations" / "0001_initial.sql"
        (migrations / initial.name).write_bytes(initial.read_bytes())
        migrate(self.path, migrations)
        broken = migrations / "0002_broken.sql"
        broken.write_text("CREATE TABLE temporary_result (id INTEGER);\nINVALID SQL;\n", encoding="utf-8")
        with self.assertRaises(sqlite3.OperationalError):
            migrate(self.path, migrations)
        with connect(self.path) as connection:
            self.assertIsNone(connection.execute(
                "SELECT name FROM sqlite_master WHERE name = 'temporary_result'"
            ).fetchone())
            self.assertEqual(connection.execute("SELECT count(*) FROM schema_migrations").fetchone()[0], 1)
        (migrations / initial.name).write_text("-- edited\n" + initial.read_text(), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "was edited"):
            migrate(self.path, migrations)

    def test_import_preserves_duplicates_labels_and_source(self):
        migrate(self.path)
        line = json.dumps(self.event())
        source = self.source(line + "\n" + line + "\n")
        before = source.read_bytes()
        result = import_eve(source, self.path)
        self.assertEqual(result["events"], 2)
        self.assertEqual(result["sha256"], hashlib.sha256(before).hexdigest())
        self.assertFalse(import_eve(source, self.path)["imported"])
        self.assertEqual(source.read_bytes(), before)
        with connect(self.path) as connection:
            self.assertEqual(connection.execute("SELECT count(*) FROM events").fetchone()[0], 2)
            self.assertIsNone(connection.execute(
                "SELECT name FROM sqlite_master WHERE name = 'event_labels'").fetchone())
            event = connection.execute("SELECT * FROM events ORDER BY source_line LIMIT 1").fetchone()
            sanitized = self.event()
            del sanitized["demo"]
            self.assertEqual(json.loads(event["raw_json"]), sanitized)
            self.assertEqual(event["timestamp_us"], 1793869208000000)
        with evaluation_connection(self.path) as evaluation:
            self.assertEqual(evaluation.execute("SELECT count(*) FROM ground_truth.event_labels").fetchone()[0], 2)

    def test_invalid_import_rolls_back_all_rows(self):
        migrate(self.path)
        source = self.source(json.dumps(self.event()) + "\nnot-json\n")
        with self.assertRaisesRegex(ValueError, "line 2"):
            import_eve(source, self.path)
        with connect(self.path) as connection:
            self.assertEqual(connection.execute("SELECT count(*) FROM datasets").fetchone()[0], 0)
            self.assertEqual(connection.execute("SELECT count(*) FROM events").fetchone()[0], 0)

    def test_reader_can_read_while_another_connection_writes(self):
        migrate(self.path)
        with connect(self.path) as writer:
            writer.execute("INSERT INTO datasets (name, sha256, source_path) VALUES ('pending', ?, 'test')",
                           ("a" * 64,))
            with connect(self.path) as reader:
                self.assertEqual(reader.execute("PRAGMA journal_mode").fetchone()[0], "wal")
                self.assertEqual(reader.execute("SELECT count(*) FROM datasets").fetchone()[0], 0)
        with connect(self.path) as reader:
            self.assertEqual(reader.execute("SELECT count(*) FROM datasets").fetchone()[0], 1)

    def test_score_floor_and_cross_dataset_membership_are_enforced(self):
        migrate(self.path)
        with connect(self.path) as connection:
            for number in (1, 2):
                connection.execute(
                    "INSERT INTO datasets (id, name, sha256, source_path) VALUES (?, 'test', ?, 'test')",
                    (number, str(number) * 64),
                )
            connection.execute("INSERT INTO rule_versions (id, rules_json, rationale, created_by) VALUES ('v1', '{}', 'test', 'test')")
            connection.execute("INSERT INTO rules VALUES ('rule1', 'test', 'test')")
            connection.execute("""INSERT INTO runs
                (id, dataset_id, mode, rule_version, rules_json, observation_seconds, rule_version_id)
                VALUES (1, 1, 'baseline', 'v1', '{}', 60, 'v1')""")
            connection.execute("""INSERT INTO events
                (id, dataset_id, source_line, timestamp, timestamp_us, raw_json)
                VALUES (1, 2, 1, 'test', 0, '{}')""")
            insert = """INSERT INTO alerts
                (id, run_id, group_key, attack_type, service, first_timestamp_us,
                 last_timestamp_us, base_score, score, rule_id)
                 VALUES (1, 1, 'key', 'test', 'test', 0, 0, 5, ?, 'rule1')"""
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(insert, (4,))
            connection.execute(insert, (8,))
            self.assertEqual(connection.execute("SELECT severity FROM alerts").fetchone()[0], "High")
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute("INSERT INTO alert_events VALUES (1, 1, 1, 1, 1, 8)")

    def test_database_config_uses_root_and_environment_precedence(self):
        (self.root / ".env").write_text('DATABASE_PATH="data/shared.sqlite3"\n', encoding="utf-8")
        with patch("app.db.PROJECT_ROOT", self.root), patch.dict(os.environ, {}, clear=True):
            self.assertEqual(database_path(), self.root / "data" / "shared.sqlite3")
            with patch.dict(os.environ, {"DATABASE_PATH": "override.sqlite3"}):
                self.assertEqual(database_path(), self.root / "override.sqlite3")
            with patch.dict(os.environ, {"DATABASE_PATH": ""}):
                with self.assertRaises(ValueError):
                    database_path()

    def seed_evaluation_runs(self, connection):
        connection.execute(
            "INSERT INTO datasets (id, name, sha256, source_path) VALUES (1, 'test', ?, 'test')",
            ("a" * 64,),
        )
        has_version_fk = any(row[1] == 'rule_version_id' for row in connection.execute('PRAGMA table_info(runs)'))
        if has_version_fk:
            connection.execute("INSERT INTO rule_versions (id, rules_json, rationale, created_by) VALUES ('v1', '{}', 'test', 'test')")
        for run_id, mode in ((1, "baseline"), (2, "tuned")):
            columns = ", rule_version_id" if has_version_fk else ""
            value = ", 'v1'" if has_version_fk else ""
            connection.execute(f"""INSERT INTO runs
                (id, dataset_id, mode, rule_version, rules_json, observation_seconds{columns})
                VALUES (?, 1, ?, 'v1', '{{}}', 60{value})""", (run_id, mode))

    def test_evaluation_bounds_upgrade_preserves_existing_data(self):
        old_migrations = self.root / "old_migrations"
        old_migrations.mkdir()
        initial = Path(__file__).resolve().parents[1] / "migrations" / "0001_initial.sql"
        (old_migrations / initial.name).write_bytes(initial.read_bytes())
        migrate(self.path, old_migrations)
        with connect(self.path) as connection:
            self.seed_evaluation_runs(connection)
            connection.execute("""INSERT INTO evaluations
                (id, baseline_run_id, tuned_run_id, dataset_id, iteration, alert_reduction,
                 attack_groups_total, attack_groups_retained, benign_groups_raised,
                 details_json, created_at)
                VALUES (7, 1, 2, 1, 1, 0.5, 2, 2, 0, '{"audit":"kept"}', 'saved-time')""")
            before = tuple(connection.execute("SELECT * FROM evaluations").fetchone())
        self.assertEqual(migrate(self.path), ["0002_evaluation_bounds.sql", "0003_rule_audit_and_metrics.sql",
                                            "0004_separate_labels.sql", "0005_tuning_replay.sql"])
        with connect(self.path) as connection:
            self.assertEqual(tuple(connection.execute("SELECT * FROM evaluations").fetchone())[:len(before)], before)
            self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_evaluations_accept_zero_attacks_and_later_iterations(self):
        migrate(self.path)
        with connect(self.path) as connection:
            self.seed_evaluation_runs(connection)
            insert = """INSERT INTO evaluations
                (baseline_run_id, tuned_run_id, dataset_id, iteration, alert_reduction,
                 attack_groups_total, attack_groups_retained, benign_groups_raised, details_json)
                VALUES (1, 2, 1, ?, 0, ?, ?, 0, '{}')"""
            connection.execute(insert, (4, 0, 0))
            for values in ((0, 0, 0), (5, -1, 0), (5, 0, 1), (5, 1, 2)):
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(insert, values)

    def test_each_connection_enables_foreign_keys_and_timeout(self):
        migrate(self.path)
        for _ in range(2):
            with connect(self.path) as connection:
                self.assertEqual(connection.execute("PRAGMA foreign_keys").fetchone()[0], 1)
                self.assertEqual(connection.execute("PRAGMA busy_timeout").fetchone()[0], 10000)
                self.assertEqual(connection.execute("PRAGMA journal_mode").fetchone()[0], "wal")
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute("""INSERT INTO events
                        (dataset_id, source_line, timestamp, timestamp_us, raw_json)
                        VALUES (999, 1, 'test', 0, '{}')""")


if __name__ == "__main__":
    unittest.main()
