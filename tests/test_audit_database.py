import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from app.db import MIGRATIONS_DIR, connect, migrate
from app.evaluate import evaluation_connection
from app.import_events import import_eve


class AuditDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.main = self.root / "runtime.sqlite3"
        self.labels = self.root / "runtime.labels.sqlite3"
        migrate(self.main)

    def eve(self):
        return dict(event_type="alert", timestamp="2026-11-05T09:00:08+0000",
                    src_ip="192.0.2.1", dest_ip="192.0.2.2", dest_port=443,
                    proto="TCP", flow_id=1154329619893551,
                    alert=dict(signature_id=123, signature="test", category="Test category"),
                    demo=dict(label="attack", phase="private-phase-marker",
                              original_timestamp="2017-07-04T19:17:08+0700"))

    def import_fixture(self, **kwargs):
        source = self.root / "eve.json"
        source.write_text(json.dumps(self.eve()) + "\n", encoding="utf-8")
        return source, import_eve(source, self.main, **kwargs)

    def seed(self, db):
        db.execute("INSERT INTO datasets (id, name, sha256, source_path) VALUES (1, 'test', ?, 'test')", ("a" * 64,))
        db.execute("""INSERT INTO rule_versions (id, rules_json, rationale, created_by)
            VALUES ('base', '{}', 'baseline configuration', 'operator')""")
        db.execute("INSERT INTO rules VALUES ('brute/web', 'brute', 'web')")
        for run_id, mode in ((1, "baseline"), (2, "tuned")):
            db.execute("""INSERT INTO runs
                (id, dataset_id, mode, rule_version, rule_version_id, rules_json, observation_seconds)
                VALUES (?, 1, ?, 'base', 'base', '{}', 60)""", (run_id, mode))

    def alert(self, db):
        db.execute("""INSERT INTO alerts
            (id, run_id, rule_id, group_key, attack_type, service, first_timestamp_us,
             last_timestamp_us, base_score, score)
            VALUES (1, 1, 'brute/web', 'target/brute', 'brute', 'web', 0, 100, 5, 8)""")

    def test_runtime_has_no_labels_and_evaluation_is_read_only(self):
        source, result = self.import_fixture(split="tune")
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), result["sha256"])
        with connect(self.main) as db:
            self.assertEqual([row[1] for row in db.execute("PRAGMA database_list")], ["main"])
            self.assertEqual(db.execute("SELECT json_type(raw_json, '$.demo') FROM events").fetchone()[0], None)
            with self.assertRaises(sqlite3.OperationalError):
                db.execute("SELECT * FROM event_labels")
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE events SET raw_json = ?", (json.dumps(self.eve()),))
        self.assertNotIn(b"private-phase-marker", self.main.read_bytes())
        with evaluation_connection(self.main) as db:
            row = db.execute("""SELECT l.label, l.original_timestamp FROM events e
                JOIN datasets d ON d.id = e.dataset_id
                JOIN ground_truth.event_labels l
                  ON l.dataset_sha256 = d.sha256 AND l.source_line = e.source_line""").fetchone()
            self.assertEqual(tuple(row), ("attack", "2017-07-04T19:17:08+0700"))
            with self.assertRaises(sqlite3.OperationalError):
                db.execute("DELETE FROM ground_truth.event_labels")
        # Even a DB copy without its label store cannot access ground truth.
        exported = self.root / "tools.sqlite3"
        with connect(self.main) as db, sqlite3.connect(exported) as destination:
            db.backup(destination)
        with connect(exported, read_only=True) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM events").fetchone()[0], 1)
            self.assertIsNone(db.execute("SELECT name FROM sqlite_master WHERE name='event_labels'").fetchone())

    def test_generated_fields_and_provenance(self):
        self.import_fixture(split="tune", suricata_version="7.0.0", et_open_version="test-snapshot")
        with connect(self.main) as db:
            row = db.execute("SELECT dest_port, proto, category, flow_id FROM events").fetchone()
            self.assertEqual(tuple(row), (443, "TCP", "Test category", 1154329619893551))
            row = db.execute("SELECT split, suricata_version, et_open_version FROM datasets").fetchone()
            self.assertEqual(tuple(row), ("tune", "7.0.0", "test-snapshot"))
            columns = {row[1]: row[6] for row in db.execute("PRAGMA table_xinfo(events)")}
            self.assertEqual(columns["dest_port"], 2)  # VIRTUAL, not STORED.

    def test_reimport_repairs_missing_label_file(self):
        source, _ = self.import_fixture()
        self.labels.unlink()
        result = import_eve(source, self.main)
        self.assertFalse(result["imported"])
        with evaluation_connection(self.main) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM ground_truth.event_labels").fetchone()[0], 1)

    def test_label_write_failure_never_commits_runtime_rows(self):
        with patch("app.import_events.store_labels", side_effect=OSError("disk full")):
            with self.assertRaisesRegex(OSError, "disk full"):
                self.import_fixture()
        with connect(self.main) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM events").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT count(*) FROM datasets").fetchone()[0], 0)

    def test_labels_cannot_use_main_path(self):
        with self.assertRaisesRegex(ValueError, "separate"):
            self.import_fixture(labels_path=self.main)

    def test_evaluation_rejects_missing_dataset_labels(self):
        self.import_fixture()
        with connect(self.labels) as db:
            db.execute("DELETE FROM event_labels")
            db.execute("DELETE FROM label_datasets")
        with self.assertRaisesRegex(ValueError, "does not match"):
            with evaluation_connection(self.main):
                self.fail("Incomplete label store must not become an empty-attack evaluation")

    def test_rule_lineage_snapshots_and_iteration_reports(self):
        with connect(self.main) as db:
            self.seed(db)
            changes = [dict(parameter="W", old_value=5, new_value=10, delta_gap=12, rationale="Group repeated alerts")]
            db.execute("""INSERT INTO rule_versions
                (id, parent_id, rules_json, changes_json, rationale, created_by)
                VALUES ('candidate', 'base', '{"W":10}', ?, 'Reduce load', 'codex')""", (json.dumps(changes),))
            row = db.execute("SELECT parent_id, status, changes_json FROM rule_versions WHERE id='candidate'").fetchone()
            self.assertEqual(tuple(row)[:2], ("base", "proposed"))
            self.assertEqual(json.loads(row[2]), changes)
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE rule_versions SET rules_json='{}' WHERE id='candidate'")
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE runs SET rule_version_id='candidate' WHERE id=1")
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE rule_versions SET status='active' WHERE id='candidate'")
            db.execute("INSERT INTO tuning_attempts (id, baseline_run_id, created_by) VALUES (1, 1, 'operator')")
            db.execute("""INSERT INTO tuning_iterations
                (attempt_id, iteration, rule_version_id, model_name, report_text)
                VALUES (1, 1, 'candidate', 'actual-model-name', 'Measured gap and proposed changes')""")
            self.assertEqual(db.execute("SELECT model_name FROM tuning_iterations").fetchone()[0], "actual-model-name")

    def test_counts_and_score_trajectory(self):
        with connect(self.main) as db:
            self.seed(db)
            self.alert(db)
            for event_id, score in ((1, 5), (2, 8)):
                db.execute("""INSERT INTO events
                    (id, dataset_id, source_line, timestamp, timestamp_us, raw_json)
                    VALUES (?, 1, ?, 'test', ?, '{}')""", (event_id, event_id, event_id))
                db.execute("INSERT INTO alert_events VALUES (1, ?, 1, 1, ?, ?)", (event_id, event_id, score))
            self.assertEqual(db.execute("SELECT event_count FROM alerts").fetchone()[0], 2)
            self.assertEqual([tuple(row) for row in db.execute(
                "SELECT n_in_window, raised_score FROM alert_events ORDER BY event_id")], [(1, 5), (2, 8)])
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE alerts SET event_count=99")
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE alert_events SET raised_score=4")
            db.execute("DELETE FROM alert_events WHERE event_id=2")
            self.assertEqual(db.execute("SELECT event_count FROM alerts").fetchone()[0], 1)

    def test_flow_arithmetic_and_observation_duration(self):
        with connect(self.main) as db:
            self.seed(db)
            insert = """INSERT INTO rule_flow_stats
                (run_id, rule_id, window_minutes, observed_count, observation_seconds,
                 peak_n, p95_n, base_score, evidence_weight, allowed_share, percentile_method)
                VALUES (1, 'brute/web', ?, 10, ?, 10, 8, 5, 0.2, 20, 'nearest-rank')"""
            db.execute(insert, (5, 60))
            row = db.execute("SELECT observed_per_hour, priority_weight, delta_gap FROM rule_flow_stats").fetchone()
            self.assertEqual(tuple(row), (600.0, 1.0, 580.0))
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute(insert, (10, 120))

    def test_empty_baseline_and_empty_attack_metrics(self):
        with connect(self.main) as db:
            self.seed(db)
            db.execute("""INSERT INTO evaluations
                (baseline_run_id, tuned_run_id, dataset_id, iteration, alert_reduction,
                 attack_groups_total, attack_groups_retained, benign_groups_raised, details_json,
                 baseline_alert_count, tuned_alert_count)
                VALUES (1, 2, 1, 1, NULL, 0, 0, 0, '{"reason":"empty baseline"}', 0, 0)""")
            row = db.execute("SELECT alert_reduction, attack_group_recall FROM evaluations").fetchone()
            self.assertEqual(tuple(row), (None, None))
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE evaluations SET alert_reduction=1")

    def test_run_inputs_are_frozen_but_errors_can_be_recorded(self):
        with connect(self.main) as db:
            self.seed(db)
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE runs SET observation_seconds=120 WHERE id=1")
            db.execute("""UPDATE runs SET status='failed', error_message='replay failed',
                error_traceback='recorded diagnostic', failed_at='test-time' WHERE id=1""")
            row = db.execute("SELECT status, error_message, failed_at FROM runs WHERE id=1").fetchone()
            self.assertEqual(tuple(row), ("failed", "replay failed", "test-time"))

    def test_migration_keeps_legacy_labels_if_export_fails(self):
        legacy = self.root / "failed_legacy.sqlite3"
        directory = self.root / "before_labels"
        directory.mkdir()
        for file in sorted(MIGRATIONS_DIR.glob("000[123]_*.sql")):
            shutil.copyfile(file, directory / file.name)
        migrate(legacy, directory)
        with connect(legacy) as db:
            db.execute("INSERT INTO datasets (id,name,sha256,source_path,event_count) VALUES (1,'old',?,'missing',1)", ("c"*64,))
            db.execute("""INSERT INTO events
                (id,dataset_id,source_line,timestamp,timestamp_us,raw_json)
                VALUES (1,1,1,'test',0,?)""", (json.dumps(self.eve()),))
            db.execute("""INSERT INTO event_labels VALUES
                (1,'attack','private-phase-marker','old-time','source demo.label (curated)')""")
        with patch("app.labels.store_labels", side_effect=OSError("label disk unavailable")):
            with self.assertRaises(OSError):
                migrate(legacy)
        with connect(legacy) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM event_labels").fetchone()[0], 1)
            self.assertIsNotNone(db.execute("SELECT json_type(raw_json,'$.demo') FROM events").fetchone()[0])
            self.assertEqual(db.execute("SELECT count(*) FROM schema_migrations").fetchone()[0], 3)

    def test_legacy_labels_migrate_without_source_or_losing_evidence(self):
        legacy = self.root / "legacy.sqlite3"
        directory = self.root / "old_migrations"
        directory.mkdir()
        for name in ("0001_initial.sql", "0002_evaluation_bounds.sql"):
            shutil.copyfile(MIGRATIONS_DIR / name, directory / name)
        migrate(legacy, directory)
        with connect(legacy) as db:
            db.execute("INSERT INTO datasets (id,name,sha256,source_path,event_count) VALUES (1,'old',?,'missing',1)", ("b"*64,))
            db.execute("""INSERT INTO events
                (id,dataset_id,source_line,timestamp,timestamp_us,raw_json)
                VALUES (1,1,1,'test',0,?)""", (json.dumps(self.eve()),))
            db.execute("""INSERT INTO event_labels VALUES
                (1,'attack','private-phase-marker','2017-07-04T19:17:08+0700','source demo.label (curated)')""")
            db.execute("""INSERT INTO runs
                (id,dataset_id,mode,rule_version,rules_json,observation_seconds)
                VALUES (1,1,'baseline','old-v1','{}',60)""")
            db.execute("""INSERT INTO alerts
                (id,run_id,group_key,attack_type,service,first_timestamp_us,last_timestamp_us,base_score,score)
                VALUES (1,1,'key','brute','web',0,0,5,8)""")
            db.execute("INSERT INTO alert_events VALUES (1,1,1,1)")
        migrate(legacy)
        with connect(legacy) as db:
            row = db.execute("SELECT rule_version_id, rule_version FROM runs").fetchone()
            self.assertEqual(tuple(row), ("legacy/run/1", "old-v1"))
            self.assertEqual(db.execute("SELECT event_count FROM alerts").fetchone()[0], 1)
            self.assertIsNone(db.execute("SELECT raised_score FROM alert_events").fetchone()[0])
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
        self.assertNotIn(b"private-phase-marker", legacy.read_bytes())
        with evaluation_connection(legacy) as db:
            self.assertEqual(db.execute("SELECT label FROM ground_truth.event_labels").fetchone()[0], "attack")
