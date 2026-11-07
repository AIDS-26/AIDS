"""Calculation contracts and the persisted original-rules replay."""

import copy
import json
from pathlib import Path
import tempfile
import unittest

from app.baseline import score_baseline
from app.db import connect, migrate
from app.import_events import import_eve
from app import siem
from app.calculation_base.siem_1_calculation_base import score_events, map_service
from app.calculation_base.siem2_calculation_base import adjusted_score, group_events
from app.calculation_base.flow_analyzer import analyze
from app.calculation_base.evaluate import evaluate
from app.calculation_base.guardrail import validate_rules


class CalculationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = self.root / 'runtime.sqlite3'
        migrate(self.path)
        self.attack = {'rules': [{'attack_type': 'web', 'weight': 5,
                                 'match': {'signature_contains': ['exploit']}}],
                       'fallback': {'attack_type': 'info', 'weight': 1, 'benign_rule': True}}
        self.service = {'rules': [{'cidr': '192.168.1.0/24', 'weight': 2, 'service': 'lan'},
                                  {'cidr': '192.168.1.1/32', 'weight': 5, 'service': 'host'}],
                        'default': {'weight': 0, 'service': 'default'}}
        self.attack_file, self.service_file = self.root / 'attack.json', self.root / 'service.json'
        self.attack_file.write_text(json.dumps(self.attack))
        self.service_file.write_text(json.dumps(self.service))

    def events(self):
        return [{'event_type': 'alert', 'timestamp': f'2026-11-05T00:0{i}:00Z',
                 'src_ip': '10.0.0.1', 'dest_ip': '192.168.1.2',
                 'alert': {'signature_id': 42, 'signature': 'exploit'},
                 'demo': {'label': 'attack'}} for i in (0, 1, 2)]

    def import_source(self):
        source = self.root / 'eve.json'
        # Reverse source order to verify chronological persistence preserves source IDs.
        source.write_text('\n'.join(json.dumps(e) for e in reversed(self.events())))
        return import_eve(source, self.path)['dataset_id']

    def run_baseline(self, dataset):
        return score_baseline(dataset, self.path, observation_seconds=180,
                              attack_rules=self.attack_file, service_rules=self.service_file)

    def test_baseline_database_and_api_use_scored_evidence(self):
        dataset = self.import_source()
        result = self.run_baseline(dataset)
        replay = self.run_baseline(dataset)
        self.assertNotEqual(result['run_id'], replay['run_id'])
        self.assertEqual(result['rule_version_id'], replay['rule_version_id'])
        page = siem.calculated_alerts(result['run_id'], self.path)
        self.assertEqual([e['source_line'] for e in page['items']], [3, 2, 1])
        for alert in page['items']:
            self.assertEqual((alert['base_score'], alert['score'], alert['severity'], alert['event_count']),
                             (7, 7, 'Medium', 1))
            self.assertEqual(alert['signature'], 'exploit')
            evidence = siem.evidence(result['run_id'], alert['id'], self.path)['items'][0]
            self.assertEqual(evidence['id'], alert['first_event_id'])
            self.assertEqual((evidence['n_in_window'], evidence['raised_score']), (1, 7))
        with connect(self.path, read_only=True) as db:
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
            self.assertEqual(db.execute('SELECT count(*) FROM rule_versions').fetchone()[0], 1)

    def test_failed_persistence_has_no_partial_results_and_records_error(self):
        dataset = self.import_source()
        with connect(self.path) as db:
            db.execute("CREATE TRIGGER reject_second BEFORE INSERT ON alerts WHEN "
                       "(SELECT count(*) FROM alerts) > 0 BEGIN SELECT RAISE(ABORT, 'test failure'); END")
        with self.assertRaisesRegex(Exception, 'test failure'):
            self.run_baseline(dataset)
        with connect(self.path, read_only=True) as db:
            run = db.execute('SELECT * FROM runs').fetchone()
            self.assertEqual(run['status'], 'failed')
            self.assertIn('test failure', run['error_message'])
            self.assertEqual(db.execute('SELECT count(*) FROM alerts').fetchone()[0], 0)
            self.assertEqual(db.execute('SELECT count(*) FROM alert_events').fetchone()[0], 0)

    def test_labels_cannot_affect_runtime_scores_or_grouping(self):
        events = self.events()
        original = score_events(events, self.attack, self.service)
        changed = copy.deepcopy(events)
        for e in changed:
            e['demo']['label'] = 'benign'
        self.assertEqual(original, score_events(changed, self.attack, self.service))
        self.assertTrue(all('label' not in e and 'evidence' not in e for e in original))
        attack_groups = group_events(original, {})
        for e in original:
            e['label'] = 'benign'
        self.assertEqual(attack_groups, group_events(original, {}))
        self.assertEqual(sum(g['event_count'] for g in attack_groups), 3)

    def test_service_default_specific_host_validation_and_benign_rule(self):
        self.assertEqual(map_service('192.168.1.1', self.service)['service'], 'host')
        self.assertEqual(map_service('8.8.8.8', self.service)['service'], 'default')
        with self.assertRaises(ValueError):
            map_service('bad-address', self.service)
        events = self.events()
        for e in events:
            e['alert']['signature'] = 'info'
        groups = group_events(score_events(events, self.attack, self.service), {})
        self.assertTrue(all(g['score'] == g['base_score'] for g in groups))
        self.service['rules'][0]['weight'] = -1
        with self.assertRaises(ValueError):
            score_events(self.events(), self.attack, self.service)

    def test_score_formula_rounding_singletons_and_invalid_saturation(self):
        self.assertEqual([adjusted_score(5, n, 60) for n in (1, 8, 60)], [5, 8, 10])
        self.assertEqual(adjusted_score(3, 2, 60), 4)
        self.assertEqual(adjusted_score(1, 2, 4), 6)  # exact 5.5 -> 6
        self.assertEqual(adjusted_score(7, 100, 2, benign=True), 7)
        for n_sat in (0, 1, -1, 2.5, True):
            with self.assertRaises(ValueError):
                adjusted_score(5, 1, n_sat)

    def test_prototype_fixed_windows_and_scanner_source_keys(self):
        events = score_events(self.events(), self.attack, self.service)
        for e in events:
            e['attack_type'] = 'port_scan'
        events[0]['timestamp'] = '2026-11-05T07:04:59+07:00'
        events[1]['timestamp'] = '2026-11-05T00:05:00Z'
        events[2]['timestamp'] = '2026-11-05T00:05:01Z'
        events[2]['dest_ip'] = '192.168.1.3'
        groups = group_events(events, {})
        self.assertEqual([g['event_count'] for g in groups], [1, 2])
        self.assertTrue(all(g['host'] == '10.0.0.1' for g in groups))

    def test_flow_explicit_duration_budget_percentiles_and_zero_weight(self):
        events = score_events(self.events(), self.attack, self.service)
        options = dict(observation_seconds=3600, window_minutes=1, evidence_by_rule={'web|lan': 1.0})
        report = analyze(events, 2, **options)
        row = report['rules'][0]
        self.assertEqual((report['alerts_per_hour'], report['burn_rate']), (3, 1.5))
        self.assertEqual((row['peak_n'], row['p95_n']), (1, 1))  # exactly W is excluded
        self.assertEqual(row['delta_gap'], 1)
        options['evidence_by_rule']['web|lan'] = 0
        self.assertIsNone(analyze(events, 2, **options)['rules'][0]['allowed_per_hour'])
        with self.assertRaises(ValueError):
            analyze(events, 0, **options)
        with self.assertRaises(ValueError):
            score_baseline(self.import_source(), self.path, observation_seconds=1)

    def test_evaluation_is_not_a_recall_claim_and_can_detect_benign_raised(self):
        events = score_events(self.events(), self.attack, self.service)
        report = evaluate(events, {}, labels={e['id']: 'benign' for e in events})
        self.assertIsNone(report['attack_event_coverage'])
        self.assertIsNone(report['attack_group_recall'])
        self.assertEqual(report['acceptance_status'], 'not_certified')
        self.assertGreater(report['benign_groups_raised'], 0)
        self.assertIsNone(evaluate([], {}, labels={})['reduction_pct'])

    def test_guardrail_rejects_unknown_changes_and_requires_operator_limit(self):
        base = {'web|lan': {'base_score': 8}}
        self.assertTrue(validate_rules(base, {}))
        for cfg in ({'window_minutes': 10, 'n_sat': 2},
                    {'window_minutes': 1, 'n_sat': 1},
                    {'window_minutes': 1, 'n_sat': 2, 'attack_weight': 0},
                    {'window_minutes': 'oops', 'n_sat': 2}):
            self.assertTrue(validate_rules(base, {'web|lan': cfg}, max_window_high=5))
        self.assertEqual(validate_rules(base, {'web|lan': {'window_minutes': 1, 'n_sat': 2}}, max_window_high=5), [])


if __name__ == '__main__':
    unittest.main()
