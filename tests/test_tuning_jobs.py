"""Control jobs use the real guardrail, private credentials and one worker lock."""

import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from app.api import make_server
from app.baseline import score_baseline
from app.db import PROJECT_ROOT, connect, migrate
from app.import_events import import_eve
from app.tuning.jobs import JobError, TuningJobs
from app.tuning.model import DeterministicProposer
from app.tuning.settings import tuning_settings


class TuningJobTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = self.root / 'runtime.sqlite3'
        migrate(self.path)
        (self.root / 'config').mkdir()
        (self.root / 'config/tuning_policy.json').write_text((PROJECT_ROOT / 'config/tuning_policy.json').read_text())
        attack = self.root / 'attack.json'
        service = self.root / 'service.json'
        attack.write_text(json.dumps({'rules': [{'attack_type': 'web', 'weight': 5,
            'match': {'signature_contains': ['attack']}}], 'fallback': {'attack_type': 'info', 'weight': 1, 'benign_rule': True}}))
        service.write_text(json.dumps({'rules': [], 'default': {'weight': 0, 'service': 'lan'}}))
        source = self.root / 'eve.json'
        source.write_text('\n'.join(json.dumps({'event_type': 'alert', 'timestamp': f'2026-01-01T00:00:0{i}Z',
            'src_ip': '192.0.2.1', 'dest_ip': '192.0.2.2', 'alert': {'signature': 'attack', 'signature_id': 1},
            'demo': {'label': 'attack'}}) for i in range(3)))
        dataset = import_eve(source, self.path, split='tune')['dataset_id']
        self.run = score_baseline(dataset, self.path, observation_seconds=3600, attack_rules=attack, service_rules=service)['run_id']
        self.addCleanup(patch.stopall)
        patch('app.tuning.jobs.PROJECT_ROOT', self.root).start()
        patch('app.tuning.jobs.tuning_settings', return_value={'api_key': 'private-test-key', 'model': 'test-model'}).start()

    def wait(self, jobs, job_id):
        for _ in range(300):
            job = jobs.get(job_id)
            if job['status'] != 'running':
                return job
            time.sleep(0.01)
        self.fail('Tuning worker did not finish')

    def test_settings_load_only_backend_keys_and_environment_wins(self):
        (self.root / '.env').write_text('CODEX_API_KEY="file-test-key"\nCODEX_MODEL=file-model\nUNRELATED=do-not-import\n')
        with patch('app.tuning.settings.PROJECT_ROOT', self.root), patch.dict(os.environ, {}, clear=True):
            self.assertEqual(tuning_settings(), {'api_key': 'file-test-key', 'model': 'file-model'})
            self.assertNotIn('UNRELATED', os.environ)
            with patch.dict(os.environ, {'CODEX_API_KEY': 'process-test-key'}):
                self.assertEqual(tuning_settings()['api_key'], 'process-test-key')

    def test_accepted_job_uses_existing_evaluation_and_never_returns_credentials(self):
        with patch('app.tuning.model.ResponsesProposer', return_value=DeterministicProposer()):
            jobs = TuningJobs(self.path)
            started = jobs.start(self.run, 'a' * 32)
            completed = self.wait(jobs, started['id'])
        self.assertEqual(completed['status'], 'completed')
        self.assertIsNotNone(completed['tuned_run_id'])
        self.assertIsNotNone(completed['attempt_id'])
        self.assertNotIn('private-test-key', json.dumps(completed))
        with connect(self.path, read_only=True) as db:
            self.assertEqual(db.execute('SELECT status FROM runs WHERE id=?', (completed['tuned_run_id'],)).fetchone()[0], 'completed')
            self.assertEqual(db.execute('SELECT count(*) FROM evaluations').fetchone()[0], 1)

    def test_duplicate_clicks_and_other_process_manager_cannot_start_overlapping_jobs(self):
        entered, release = threading.Event(), threading.Event()
        class Blocking(DeterministicProposer):
            def __call__(self, context):
                entered.set()
                release.wait(5)
                return super().__call__(context)
        with patch('app.tuning.model.ResponsesProposer', return_value=Blocking()):
            jobs = TuningJobs(self.path)
            started = jobs.start(self.run, 'b' * 32)
            try:
                self.assertTrue(entered.wait(3))
                self.assertEqual(jobs.start(self.run, 'b' * 32)['id'], started['id'])
                self.assertEqual(jobs.start(self.run, 'c' * 32)['id'], started['id'])
                with self.assertRaises(JobError) as error:
                    TuningJobs(self.path).start(self.run, 'd' * 32)
                self.assertEqual(error.exception.status, 409)
            finally:
                release.set()
            self.assertEqual(self.wait(jobs, started['id'])['status'], 'completed')
        with connect(self.path, read_only=True) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM tuning_attempts').fetchone()[0], 1)

    def test_rejected_proposals_keep_baseline_and_finish_after_three_iterations(self):
        class Invalid(DeterministicProposer):
            def __call__(self, context):
                proposal = super().__call__(context)
                for rule in proposal['rules'].values():
                    rule['n_sat'] = 1
                return proposal
        with patch('app.tuning.model.ResponsesProposer', return_value=Invalid()):
            jobs = TuningJobs(self.path)
            failed = self.wait(jobs, jobs.start(self.run, 'e' * 32)['id'])
        self.assertEqual(failed['status'], 'failed')
        self.assertEqual(failed['iteration'], 3)
        self.assertIsNone(failed['tuned_run_id'])
        with connect(self.path, read_only=True) as db:
            self.assertEqual(db.execute('SELECT status FROM runs WHERE id=?', (self.run,)).fetchone()[0], 'completed')
            self.assertEqual(db.execute("SELECT count(*) FROM rule_versions WHERE status='active'").fetchone()[0], 0)

    def test_http_requires_local_control_and_rejects_model_or_policy_in_request(self):
        server = make_server(self.path, port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        url = f'http://127.0.0.1:{server.server_port}/api/tuning-jobs'
        try:
            payload = {'baseline_run_id': self.run, 'request_id': 'f' * 32}
            for headers, data, status in [
                ({}, payload, 403),
                ({'X-IDEAX-Control': 'local-tuning', 'Origin': 'https://example.test'}, payload, 403),
                ({'X-IDEAX-Control': 'local-tuning', 'X-Forwarded-For': '203.0.113.1'}, payload, 403),
                ({'X-IDEAX-Control': 'local-tuning'}, {**payload, 'model': 'untrusted'}, 400),
                ({'X-IDEAX-Control': 'local-tuning'}, {**payload, 'baseline_run_id': True}, 400),
            ]:
                request = Request(url, data=json.dumps(data).encode(), headers={'Content-Type': 'application/json', **headers})
                with self.assertRaises(HTTPError) as error:
                    urlopen(request)
                self.assertEqual(error.exception.code, status)
                error.exception.close()
            with urlopen(url) as response:
                self.assertEqual(json.load(response)['model'], 'test-model')
        finally:
            server.shutdown(); server.server_close(); thread.join()


if __name__ == '__main__':
    unittest.main()
