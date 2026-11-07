"""Same-event tuning acceptance, boundary semantics, and durable version history."""

import copy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.request import urlopen

from app.api import make_server
from app.baseline import score_baseline
from app.db import PROJECT_ROOT, connect, migrate
from app.evaluate import load_scorecard
from app.import_events import import_eve
from app import siem
from app.tuning.flow import search
from app.tuning.guardrail import check
from app.tuning.model import DeterministicProposer, ResponsesProposer
from app.tuning.policy import load_document, initial_rules, validate_policy
from app.tuning.replay import replay
from app.tuning.runner import tune, load_baseline, replay_version
from app.tuning.scorecard import Scorecard, define_attack_groups


def policy():
    result = load_document(PROJECT_ROOT / 'config/tuning_policy.json')
    result['benign_evaluation'] = 'any-benign-member-raised'
    result['scanner_attack_types'] = ['scan']
    result['immediate_attack_types'] = ['exploit']
    return result


def event(i, seconds, *, attack='web', service='lan', base=5, benign=False):
    return {'id': i, 'source_line': i + 1, 'timestamp_us': int(seconds * 1_000_000),
            'timestamp': (datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=seconds)).isoformat(),
            'src_ip': '192.0.2.1', 'dest_ip': '192.0.2.2', 'attack_type': attack,
            'service': service, 'rule_id': attack + '|' + service,
            'base_score': base, 'benign_rule': benign}


def base_rules(events):
    result = {}
    for e in events:
        result[e['rule_id']] = {name: e[name] for name in ('attack_type', 'service', 'base_score', 'benign_rule')}
    return result


class ReplayTests(unittest.TestCase):
    def test_session_lifetime_rolling_boundary_and_stable_ties(self):
        events = [event(i, t) for i, t in enumerate([0, 59, 118, 178, 178])]
        p, base = policy(), base_rules(events)
        rules = {'web|lan': {'window_minutes': 1, 'n_sat': 4}}
        result = replay(list(reversed(events)), rules, base, p)
        self.assertEqual([g['event_ids'] for g in result], [[0, 1, 2], [3, 4]])
        self.assertEqual([[t['n'] for t in g['timeline']] for g in result], [[1, 2, 2], [1, 2]])
        self.assertGreater(result[0]['last_timestamp_us'] - result[0]['first_timestamp_us'], 60_000_000)
        # Equal timestamps are included in source-line order; exactly W of silence closes.
        events = [event(i, t) for i, t in enumerate([0, 30, 60])]
        self.assertEqual([t['n'] for t in replay(events, rules, base_rules(events), p)[0]['timeline']], [1, 2, 2])

    def test_mixed_service_scanner_uses_strictest_settings_without_losing_floors(self):
        events = [event(0, 0, attack='scan', base=8),
                  event(1, 1, attack='scan', service='other', base=3),
                  event(2, 61, attack='scan', service='other', base=3)]
        events[1]['dest_ip'] = '198.51.100.3'
        p, base = policy(), base_rules(events)
        rules = {'scan|lan': {'window_minutes': 5, 'n_sat': 60},
                 'scan|other': {'window_minutes': 1, 'n_sat': 2}}
        groups = replay(events, rules, base, p)
        self.assertEqual([g['event_count'] for g in groups], [2, 1])
        self.assertEqual(groups[0]['group_key'], ['source', '192.0.2.1', 'scan'])
        self.assertEqual((groups[0]['window_minutes'], groups[0]['n_sat']), (1, 2))
        self.assertEqual([t['base_score'] for t in groups[0]['timeline']], [8, 3])
        self.assertEqual([t['score'] for t in groups[0]['timeline']], [8, 10])

    def test_scanner_service_floor_can_be_lower_than_group_floor(self):
        events = [event(0, 0, attack='scan', base=10), event(1, 1, attack='scan', service='other', base=1)]
        rules = {key: {'window_minutes': 1, 'n_sat': 10000} for key in base_rules(events)}
        result = replay(events, rules, base_rules(events), policy())[0]
        self.assertEqual(result['base_score'], 10)
        self.assertLess(result['timeline'][1]['score'], 10)
        self.assertEqual(result['timeline'][1]['alert_score'], 10)

    def test_immediate_exploits_and_rule_benign_behavior(self):
        events = [event(i, i, attack='exploit', base=9) for i in range(3)]
        p, base = policy(), base_rules(events)
        self.assertEqual(len(replay(events, initial_rules(base, p), base, p)), 3)
        benign = [event(i, i, benign=True) for i in range(20)]
        base = base_rules(benign)
        groups = replay(benign, initial_rules(base, p), base, p)
        self.assertTrue(all(t['score'] == 5 for t in groups[0]['timeline']))
        for e in benign:
            e['label'], e['demo'] = 'attack', {'label': 'attack'}
        self.assertEqual(groups, replay(benign, initial_rules(base, p), base, p))

    def test_explicit_policy_bounds_and_unknown_rules(self):
        p = policy()
        for field, value in [('n_sat_max', 1), ('budget_per_hour', 0), ('candidate_windows_minutes', [2, 1]),
                             ('max_window_high', float('nan')), ('group_lifetime', 'guess')]:
            broken = {**p, field: value}
            with self.assertRaises(ValueError, msg=field):
                validate_policy(broken)
        events = [event(0, 0, base=8)]
        base = base_rules(events)
        with self.assertRaises(ValueError):
            replay(events, {'web|lan': {'window_minutes': 10, 'n_sat': 1}}, base, p)
        p['max_window_high'] = 5
        with self.assertRaises(ValueError):
            replay(events, {'web|lan': {'window_minutes': 10, 'n_sat': 2}}, base, p)
        with self.assertRaises(ValueError):
            replay(events, {}, base, p)
        with self.assertRaises(ValueError):
            replay(events, {'web|lan': {'window_minutes': 1, 'n_sat': 2, 'attack_weight': 0}}, base, p)

    def test_flow_recomputes_candidate_p95_budget_and_unmet_gap(self):
        events = [event(i, t) for i, t in enumerate([0, 70, 140])]
        p, base = policy(), base_rules(events)
        flow, suggestion = search(events, base, initial_rules(base, p), p, {'web|lan': 1}, 3600)
        row = flow['rules'][0]
        self.assertEqual((flow['observed_per_hour'], flow['burn_rate']), (3, .15))
        self.assertEqual((row['allowed_per_hour'], row['delta_gap']), (20, -17))
        self.assertEqual([t['p95_n'] for t in row['candidates']], [1, 2, 3, 3])
        self.assertEqual(suggestion['web|lan'], {'window_minutes': 1, 'n_sat': 2})
        p['budget_per_hour'] = .1
        flow, suggestion = search(events, base, initial_rules(base, p), p, {'web|lan': 1}, 3600)
        self.assertEqual(suggestion['web|lan']['window_minutes'], 2)
        self.assertAlmostEqual(flow['rules'][0]['suggested_remaining_gap'], .9)
        flow, _ = search(events, base, initial_rules(base, p), p, {'web|lan': 0}, 3600)
        self.assertEqual(flow['allocation_status'], 'zero_priority_weight')
        self.assertIsNone(flow['rules'][0]['delta_gap'])
        for duration, evidence in ((0, {'web|lan': 1}), (float('nan'), {'web|lan': 1}),
                                   (3600, {}), (3600, {'web|lan': float('nan')})):
            with self.assertRaises(ValueError):
                search(events, base, initial_rules(base, p), p, evidence, duration)


class ScorecardTests(unittest.TestCase):
    def test_warning_policy_preserves_evidence_and_reports_benign_escalation(self):
        events = [event(i, i) for i in range(3)]
        card = Scorecard(events, {0: 'attack', 1: 'benign', 2: 'attack'},
                         [{'id': 'a', 'event_ids': [0, 2]}], provenance='test', definition='fixed')
        p, base = policy(), base_rules(events)
        p['benign_evaluation'] = 'warn-any-benign-member-raised'
        validate_policy(p)
        rules = initial_rules(base, p)
        groups = replay(events, rules, base, p)
        report = card.evaluate(events, groups, observation_seconds=3600, budget=20,
                               benign_evaluation=p['benign_evaluation'])
        gate = check(events, groups, rules, base, p, report)
        self.assertTrue(gate['passed'], gate)
        self.assertEqual(report['benign_groups_raised'], 1)
        self.assertTrue(gate['warnings'])
        self.assertEqual(sorted(i for g in groups for i in g['event_ids']), [0, 1, 2])
        p['benign_evaluation'] = 'any-benign-member-raised'
        self.assertFalse(check(events, groups, rules, base, p, report)['passed'])
        p['benign_evaluation'] = 'warn-any-benign-member-raised'
        groups[0]['event_ids'].pop()
        report = card.evaluate(events, groups, observation_seconds=3600, budget=20,
                               benign_evaluation=p['benign_evaluation'])
        self.assertFalse(check(events, groups, rules, base, p, report)['passed'])

    def test_independent_denominator_merges_splits_and_empty_attacks(self):
        events = [event(i, t) for i, t in enumerate([0, 10, 600, 1200])]
        labels = {e['id']: 'attack' for e in events}
        independent = define_attack_groups(events, labels, silence_minutes=10)
        self.assertEqual([g['event_ids'] for g in independent], [[0, 1, 2], [3]])
        p, base = policy(), base_rules(events)
        card = Scorecard(events, labels, independent, provenance='test curated', definition='fixed sessions')
        for window in (1, 10):
            rules = {'web|lan': {'window_minutes': window, 'n_sat': 2}}
            report = card.evaluate(events, replay(events, rules, base, p), observation_seconds=3600, budget=20)
            self.assertEqual((report['attack_groups_total'], report['attack_groups_retained']), (2, 2))
        card = Scorecard(events, {e['id']: 'benign' for e in events}, [], provenance='test', definition='none')
        result = card.evaluate(events, replay(events, rules, base, p), observation_seconds=3600, budget=20)
        self.assertIsNone(result['attack_group_recall'])
        self.assertEqual(result['acceptance_status'], 'not_certified')

    def test_conservative_mixed_benign_checks_and_score_tampering(self):
        events = [event(i, i) for i in range(3)]
        labels = {0: 'attack', 1: 'benign', 2: 'attack'}
        card = Scorecard(events, labels, [{'id': 'a', 'event_ids': [0, 2]}], provenance='test', definition='fixed')
        p, base = policy(), base_rules(events)
        rules = initial_rules(base, p)
        groups = replay(events, rules, base, p)
        report = card.evaluate(events, groups, observation_seconds=3600, budget=20)
        self.assertEqual(report['benign_groups_raised'], 1)
        self.assertFalse(check(events, groups, rules, base, p, report)['passed'])
        groups[0]['timeline'][0]['score'] = 1
        report = card.evaluate(events, groups, observation_seconds=3600, budget=20)
        self.assertEqual(report['attack_groups_retained'], 0)
        self.assertTrue(report['integrity_errors'])
        for definitions in ([{'id': 'a', 'event_ids': [0]}], [{'id': 'a', 'event_ids': [0, 1, 2]}]):
            with self.assertRaises(ValueError):
                Scorecard(events, labels, definitions, provenance='test', definition='fixed')

    def test_missing_or_unconfirmed_labels_cannot_certify(self):
        events = [event(0, 0), event(1, 1)]
        p, base = policy(), base_rules(events)
        groups = replay(events, initial_rules(base, p), base, p)
        card = Scorecard(events, {0: 'attack', 1: 'unconfirmed'}, [{'id': 'a', 'event_ids': [0]}],
                         provenance='test', definition='fixed')
        report = card.evaluate(events, groups, observation_seconds=3600, budget=20)
        self.assertEqual(report['acceptance_status'], 'not_certified')
        card = Scorecard(events, {0: 'attack', 1: 'attack'}, None, provenance='test', definition='unavailable')
        self.assertIsNone(card.evaluate(events, groups, observation_seconds=3600, budget=20)['attack_group_recall'])

    def test_no_reduction_and_missing_evidence_fail_the_gate(self):
        events = [event(0, 0)]
        p, base = policy(), base_rules(events)
        rules = initial_rules(base, p)
        card = Scorecard(events, {0: 'attack'}, [{'id': 'a', 'event_ids': [0]}], provenance='test', definition='fixed')
        groups = replay(events, rules, base, p)
        report = card.evaluate(events, groups, observation_seconds=3600, budget=20)
        self.assertFalse(check(events, groups, rules, base, p, report)['passed'])
        report = card.evaluate(events, [], observation_seconds=3600, budget=20)
        self.assertEqual(report['attack_groups_retained'], 0)
        self.assertTrue(report['integrity_errors'])


class TuningDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = self.root / 'runtime.sqlite3'
        migrate(self.path)
        self.attack = {'rules': [{'attack_type': 'web', 'weight': 5,
                                 'match': {'signature_contains': ['attack']}}],
                       'fallback': {'attack_type': 'info', 'weight': 1, 'benign_rule': True}}
        self.service = {'rules': [], 'default': {'weight': 0, 'service': 'lan'}}
        self.attack_file = self.root / 'attack.json'
        self.service_file = self.root / 'service.json'
        self.attack_file.write_text(json.dumps(self.attack))
        self.service_file.write_text(json.dumps(self.service))

    def baseline(self, *, attack_labels=True, split='tune'):
        source = self.root / 'eve.json'
        events = [{'event_type': 'alert', 'timestamp': f'2026-01-01T00:00:0{i}Z',
                   'src_ip': '192.0.2.1', 'dest_ip': '192.0.2.2',
                   'alert': {'signature': 'attack' if attack_labels else 'info', 'signature_id': 1},
                   'demo': {'label': 'attack' if attack_labels else 'benign', 'phase': 'private-marker'}}
                  for i in range(3)]
        source.write_text('\n'.join(json.dumps(e) for e in events))
        dataset = import_eve(source, self.path, split=split)['dataset_id']
        return score_baseline(dataset, self.path, observation_seconds=3600,
                              attack_rules=self.attack_file, service_rules=self.service_file)['run_id']

    def tune(self, run, proposer=None, **options):
        return tune(run, self.path, policy=policy(), proposer=proposer or DeterministicProposer(),
                    evaluation_session_minutes=10, label_provenance='test signature-derived labels', **options)

    def test_success_persists_immutable_child_version_metrics_trajectory_and_api(self):
        run = self.baseline()
        result = self.tune(run, output_directory=self.root / 'out')
        self.assertEqual(result['status'], 'completed', result)
        self.assertEqual(result['attempts'], 1)
        self.assertEqual(result['evaluation']['grouped_alerts'], 1)
        version = result['selected_version_id']
        with connect(self.path) as db:
            row = db.execute('SELECT * FROM rule_versions WHERE id=?', (version,)).fetchone()
            self.assertEqual((row['status'], row['guardrail_status']), ('active', 'passed'))
            self.assertEqual(row['parent_id'], db.execute('SELECT rule_version_id FROM runs WHERE id=?', (run,)).fetchone()[0])
            self.assertTrue(json.loads(row['changes_json']))
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE rule_versions SET rules_json='{}' WHERE id=?", (version,))
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
            self.assertEqual(db.execute('SELECT count(*) FROM rule_flow_stats').fetchone()[0], 4)
        alerts = siem.calculated_alerts(result['tuned_run_id'], self.path)['items']
        self.assertEqual(alerts[0]['event_count'], 3)
        evidence = siem.evidence(result['tuned_run_id'], alerts[0]['id'], self.path)['items']
        self.assertEqual([e['n_in_window'] for e in evidence], [1, 2, 3])
        self.assertEqual([e['event_base_score'] for e in evidence], [5, 5, 5])
        detail = siem.tuning_detail(result['attempt_id'], self.path)
        self.assertEqual(detail['iterations']['items'][0]['report']['evaluation'], result['evaluation'])
        self.assertEqual(len(siem.rule_history(result['tuned_run_id'], self.path)['items']), 2)
        self.assertEqual(load_document(result['rules_file'])['rule_version_id'], version)
        server = make_server(self.path, port=0)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            for route in (f'/api/tuning-attempts/{result["attempt_id"]}',
                          f'/api/datasets/1/tuning-attempts', f'/api/runs/{result["tuned_run_id"]}/rule-history'):
                with urlopen(f'http://127.0.0.1:{server.server_port}' + route) as response:
                    self.assertEqual(response.status, 200)
        finally:
            server.shutdown()
            server.server_close()
            worker.join()

    def test_invalid_then_valid_proposals_keep_lineage_and_aggregate_feedback(self):
        run = self.baseline()
        class Proposer(DeterministicProposer):
            def __init__(self):
                self.inputs = []
            def __call__(self, context):
                self.inputs.append(context)
                result = super().__call__(context)
                if len(self.inputs) == 1:
                    next(iter(result['rules'].values()))['n_sat'] = 1
                return result
        proposer = Proposer()
        result = self.tune(run, proposer)
        self.assertEqual(result['status'], 'completed', result)
        self.assertEqual(result['attempts'], 2)
        self.assertTrue(proposer.inputs[1]['feedback'])
        request = json.dumps(proposer.inputs)
        for private in ('private-marker', '192.0.2.1', 'event_ids', 'source_line', 'raw_json'):
            self.assertNotIn(private, request)
        history = siem.rule_history(result['tuned_run_id'], self.path)['items']
        self.assertEqual([v['status'] for v in history], ['active', 'rejected', 'proposed'])
        self.assertEqual(history[0]['parent_id'], history[1]['id'])

    def test_replay_accepted_version_needs_no_labels_or_model_and_continues_lineage(self):
        run = self.baseline()
        accepted = self.tune(run)
        continued = self.tune(run, from_version_id=accepted['selected_version_id'])
        self.assertEqual(continued['status'], 'completed', continued)
        history = siem.rule_history(continued['tuned_run_id'], self.path)['items']
        self.assertEqual(history[0]['parent_id'], accepted['selected_version_id'])
        self.assertEqual(history[1]['status'], 'retired')
        with patch('app.tuning.runner.load_scorecard', side_effect=AssertionError('runtime label access')):
            replayed = replay_version(run, accepted['selected_version_id'], self.path)
        self.assertNotEqual(replayed['run_id'], accepted['tuned_run_id'])
        self.assertEqual((replayed['alerts'], replayed['events']), (1, 3))
        with self.assertRaises(ValueError):
            replay_version(run, history[-1]['id'], self.path)

    def test_rejected_candidate_is_not_available_as_a_completed_replay(self):
        run = self.baseline(attack_labels=False)
        result = self.tune(run)
        iteration = siem.tuning_detail(result['attempt_id'], self.path)['iterations']['items'][0]
        with self.assertRaisesRegex(ValueError, 'not completed'):
            siem.calculated_alerts(iteration['tuned_run_id'], self.path)
        with self.assertRaises(ValueError):
            replay_version(run, iteration['rule_version_id'], self.path)

    def test_mixed_service_database_memberships_keep_their_own_base_scores(self):
        self.attack['rules'][0]['attack_type'] = 'scan'
        self.attack['rules'][0]['weight'] = 1
        self.service['rules'] = [{'cidr': '192.0.2.2/32', 'weight': 9, 'service': 'critical'}]
        self.attack_file.write_text(json.dumps(self.attack))
        self.service_file.write_text(json.dumps(self.service))
        run = self.baseline()
        # Build a second source with different services in the same scanner session.
        source = self.root / 'mixed.json'
        items = [json.loads(line) for line in (self.root / 'eve.json').read_text().splitlines()]
        items[1]['dest_ip'] = '192.0.2.3'
        source.write_text('\n'.join(json.dumps(e) for e in items))
        dataset = import_eve(source, self.path, split='tune')['dataset_id']
        run = score_baseline(dataset, self.path, observation_seconds=3600,
                             attack_rules=self.attack_file, service_rules=self.service_file)['run_id']
        class Quiet(DeterministicProposer):
            def __call__(self, context):
                proposal = super().__call__(context)
                for cfg in proposal['rules'].values():
                    cfg['n_sat'] = 10000
                return proposal
        result = self.tune(run, Quiet())
        self.assertEqual(result['status'], 'completed', result)
        alert = siem.calculated_alerts(result['tuned_run_id'], self.path)['items'][0]
        evidence = siem.evidence(result['tuned_run_id'], alert['id'], self.path)['items']
        self.assertEqual(alert['base_score'], 10)
        self.assertEqual([e['event_base_score'] for e in evidence], [10, 1, 10])
        self.assertEqual(evidence[1]['raised_score'], 2)
        self.assertEqual(evidence[1]['alert_score'], 10)

    def test_three_failures_keep_previous_active_version_and_failed_runs(self):
        run = self.baseline()
        good = self.tune(run)
        class Bad(DeterministicProposer):
            def __call__(self, context):
                raise RuntimeError('provider unavailable')
        failed = self.tune(run, Bad())
        self.assertEqual((failed['status'], failed['attempts']), ('failed', 3))
        with connect(self.path) as db:
            self.assertEqual(db.execute("SELECT id FROM rule_versions WHERE status='active'").fetchone()[0], good['selected_version_id'])
            rows = db.execute('SELECT * FROM tuning_iterations WHERE attempt_id=?', (failed['attempt_id'],)).fetchall()
            self.assertEqual(len(rows), 3)
            self.assertTrue(all(r['status'] == 'failed' and r['error_message'] for r in rows))

    def test_result_write_failure_rolls_back_and_remains_in_audit(self):
        run = self.baseline()
        with connect(self.path) as db:
            db.execute("CREATE TRIGGER reject_tuned BEFORE INSERT ON alerts WHEN "
                       "(SELECT mode FROM runs WHERE id=NEW.run_id)='tuned' BEGIN SELECT RAISE(ABORT,'disk simulation'); END")
        result = self.tune(run)
        self.assertEqual((result['status'], result['attempts']), ('failed', 3))
        with connect(self.path) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM runs WHERE mode='tuned' AND status='failed'").fetchone()[0], 3)
            self.assertEqual(db.execute('SELECT count(*) FROM alerts').fetchone()[0], 3)
            self.assertEqual(db.execute('SELECT count(*) FROM tuned_event_scores').fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT count(*) FROM rule_versions WHERE status='active'").fetchone()[0], 0)
            versions = db.execute("SELECT changes_json FROM rule_versions WHERE id LIKE 'tuned/%' ORDER BY created_at,rowid").fetchall()
            self.assertTrue(json.loads(versions[0]['changes_json']))
            self.assertEqual(json.loads(versions[1]['changes_json']), [])
        self.assertIn('disk simulation', siem.tuning_detail(result['attempt_id'], self.path)['iterations']['items'][0]['error_message'])

    def test_empty_attack_slice_is_na_and_never_activates(self):
        result = self.tune(self.baseline(attack_labels=False))
        self.assertEqual((result['status'], result['attempts']), ('failed', 3))
        detail = siem.tuning_detail(result['attempt_id'], self.path)
        for iteration in detail['iterations']['items']:
            report = iteration['report']['evaluation']
            self.assertEqual(report['attack_groups_total'], 0)
            self.assertIsNone(report['attack_group_recall'])
        with connect(self.path) as db:
            self.assertEqual(db.execute('SELECT attack_group_recall FROM evaluations').fetchone()[0], None)

    def test_heldout_labels_rejected_and_missing_labels_record_failure(self):
        run = self.baseline(split='heldout')
        with self.assertRaisesRegex(ValueError, 'split=tune'):
            self.tune(run)
        with connect(self.path) as db:
            db.execute("UPDATE datasets SET split='tune'")
        self.path.with_name('runtime.labels.sqlite3').unlink()
        result = self.tune(run)
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['attempts'], 0)
        self.assertIn('missing', result['error'])

    def test_manifest_hash_and_group_membership_are_checked(self):
        run = self.baseline()
        baseline, dataset, _, events, _ = load_baseline(run, self.path)
        manifest = {'dataset_sha256': dataset['sha256'], 'provenance': 'curated test',
                    'groups': [{'id': 'a', 'event_ids': [e['id'] for e in events]}]}
        card = load_scorecard(events, dataset['id'], self.path, manifest=manifest)
        self.assertEqual(card.definition['method'], 'operator-manifest')
        manifest['dataset_sha256'] = 'f' * 64
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            load_scorecard(events, dataset['id'], self.path, manifest=manifest)


class ModelTests(unittest.TestCase):
    def test_responses_schema_transport_and_credentials_not_in_payload(self):
        context = {'current_rules': {'web|lan': {'window_minutes': 1, 'n_sat': 2}}}
        response = {'status': 'completed', 'output': [{'type': 'message', 'content':
                    [{'type': 'output_text', 'text': '{"rules": {}}'}]}]}
        class Response:
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            def read(self, *args):
                return json.dumps(response).encode()
        with patch.dict('os.environ', {'CODEX_API_KEY': 'private-test-token'}):
            with patch('app.tuning.model.urlopen', return_value=Response()) as transport:
                self.assertEqual(ResponsesProposer('test-model')(context), {'rules': {}})
        request = transport.call_args.args[0]
        self.assertNotIn(b'private-test-token', request.data)
        body = json.loads(request.data)
        self.assertFalse(body['store'])
        self.assertTrue(body['text']['format']['strict'])
        self.assertNotIn('tools', body)

    def test_yaml_subset_rejects_duplicate_keys_and_nonfinite_numbers(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'rules.yaml'
            for value in ('{"rules":{},"rules":{}}', '{"x":NaN}', '!!python/object:bad {}'):
                path.write_text(value)
                with self.assertRaises(ValueError):
                    load_document(path)


if __name__ == '__main__':
    unittest.main()
