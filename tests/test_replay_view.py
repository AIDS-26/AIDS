"""Saved playback must keep identities, causal scores, and accepted lineage."""

import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import urlopen

from app.api import make_server
from app.baseline import score_baseline
from app.db import PROJECT_ROOT, connect, migrate
from app.import_events import import_eve
from app.replay_view import replay_view
from app.tuning.model import DeterministicProposer
from app.tuning.runner import replay_version, tune


class SavedReplayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = self.root / 'runtime.sqlite3'
        migrate(self.path)
        self.attack = self.root / 'attack.json'
        self.service = self.root / 'service.json'
        self.attack.write_text(json.dumps({'rules': [
            {'attack_type': 'web', 'weight': 5, 'match': {'signature_contains': ['attack']}}],
            'fallback': {'attack_type': 'info', 'weight': 1, 'benign_rule': True}}))
        self.service.write_text(json.dumps({'rules': [], 'default': {'weight': 0, 'service': 'lan'}}))
        self.source = self.root / 'eve.json'
        # Deliberately nonchronological source order with a simultaneous timestamp.
        self.source.write_text('\n'.join(json.dumps({
            'event_type': 'alert', 'timestamp': f'2026-01-01T00:00:0{i}Z',
            'src_ip': '192.0.2.1', 'dest_ip': '192.0.2.2',
            'alert': {'signature': 'attack', 'signature_id': 1},
            'demo': {'label': 'attack', 'phase': 'private-marker'},
        }) for i in [2, 0, 0]))
        self.dataset = import_eve(self.source, self.path, split='tune')['dataset_id']
        self.run = self.baseline()

    def baseline(self):
        return score_baseline(self.dataset, self.path, observation_seconds=3600,
                              attack_rules=self.attack, service_rules=self.service)['run_id']

    def accepted(self, run=None):
        result = tune(run or self.run, self.path,
                      policy=json.loads((PROJECT_ROOT / 'config/tuning_policy.json').read_text()),
                      proposer=DeterministicProposer(), evaluation_session_minutes=10,
                      label_provenance='test signature-derived labels')
        self.assertEqual(result['status'], 'completed', result)
        return result

    def test_baseline_counts_ties_and_no_synthetic_tuned_fallback(self):
        with patch('app.evaluate.load_scorecard', side_effect=AssertionError('labels forbidden')):
            view = replay_view(self.run, self.path)
        self.assertEqual(view['total_alerts'], 3)
        self.assertEqual([a['source_line'] for a in view['alerts']], [2, 3, 1])
        self.assertEqual(view['frames'][0]['original']['total'], 2)
        self.assertEqual(view['frames'][-1]['original']['total'], 3)
        self.assertEqual(view['frames'][-1]['t'], 3600)
        self.assertIsNone(view['tuned_run_id'])
        self.assertIsNone(view['frames'][-1]['tuned'])
        self.assertEqual(view['frames'][-1]['reduction'], 'N/A')
        self.assertNotIn('private-marker', json.dumps(view))
        self.assertNotIn('raw_json', json.dumps(view))

    def test_saved_tuned_trajectory_is_causal_and_preserves_all_evidence(self):
        accepted = self.accepted()
        view = replay_view(self.run, self.path)
        self.assertEqual(view['tuned_run_id'], accepted['tuned_run_id'])
        self.assertEqual(view['frames'][-1]['tuned']['total'], 1)
        self.assertEqual(view['frames'][-1]['reduction'], '66.7%')
        self.assertEqual(sorted(view['groups'][0]['alert_ids']), sorted(a['id'] for a in view['alerts']))
        timeline = view['groups'][0]['timeline']
        self.assertEqual(timeline[0]['score'], 5)
        self.assertEqual([p['n'] for p in timeline], [1, 2, 3])
        self.assertEqual(view['frames'][0]['tuned']['total'], 1)
        with connect(self.path, read_only=True) as db:
            scores = [r[0] for r in db.execute('''SELECT tes.alert_score FROM tuned_event_scores tes
                JOIN events e ON e.id=tes.event_id WHERE tes.run_id=?
                ORDER BY e.timestamp_us,e.source_line,e.id''', (accepted['tuned_run_id'],))]
        self.assertEqual([p['score'] for p in timeline], scores)

    def test_pairing_uses_exact_baseline_and_supports_accepted_version_replay(self):
        accepted = self.accepted()
        newer_baseline = self.baseline()
        self.assertIsNone(replay_view(newer_baseline, self.path)['tuned_run_id'])
        replayed = replay_version(self.run, accepted['selected_version_id'], self.path)
        view = replay_view(self.run, self.path)
        self.assertEqual(view['tuned_run_id'], replayed['run_id'])
        self.assertEqual(view['evaluation']['tuned_run_id'], accepted['tuned_run_id'])

    def test_incomplete_results_and_unaccepted_versions_cannot_appear_valid(self):
        accepted = self.accepted()
        with connect(self.path) as db:
            db.execute('DELETE FROM tuned_event_scores WHERE run_id=? AND event_id=(SELECT min(event_id) FROM tuned_event_scores WHERE run_id=?)',
                       (accepted['tuned_run_id'], accepted['tuned_run_id']))
        with self.assertRaisesRegex(ValueError, 'score history'):
            replay_view(self.run, self.path)
        with connect(self.path) as db:
            db.execute("UPDATE runs SET status='failed' WHERE id=?", (accepted['tuned_run_id'],))
        self.assertIsNone(replay_view(self.run, self.path)['tuned_run_id'])
        with connect(self.path) as db:
            db.execute('DELETE FROM alert_events WHERE run_id=? AND event_id=(SELECT min(event_id) FROM alert_events WHERE run_id=?)',
                       (self.run, self.run))
        with self.assertRaisesRegex(ValueError, 'every dataset event'):
            replay_view(self.run, self.path)

    def test_http_snapshot_has_no_paging_truncation_and_rejects_paging_parameters(self):
        server = make_server(self.path, port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            route = f'http://127.0.0.1:{server.server_port}/api/runs/{self.run}/replay'
            with urlopen(route) as response:
                self.assertEqual(len(json.load(response)['alerts']), 3)
                self.assertEqual(response.headers['Cache-Control'], 'no-store')
            with self.assertRaises(HTTPError) as error:
                urlopen(route + '?limit=1')
            self.assertEqual(error.exception.code, 400)
            error.exception.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
