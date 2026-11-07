"""Chat retrieval stays causal and cannot invoke the tuner or read labels."""

import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from app.api import make_server
from app.baseline import score_baseline
from app.chat import ChatError, ChatService, resolve_context, validate_request
from app.db import PROJECT_ROOT, connect, migrate
from app.import_events import import_eve
from app.tuning.model import DeterministicProposer
from app.tuning.runner import tune


class ChatTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.path = root / 'runtime.sqlite3'
        migrate(self.path)
        source = root / 'events.json'
        source.write_text('\n'.join(json.dumps({
            'event_type': 'alert', 'timestamp': f'2026-01-01T00:00:{i:02d}Z',
            'src_ip': '192.0.2.1', 'dest_ip': '192.168.10.50',
            'alert': {'signature': 'SQL injection', 'category': 'Web Application Attack'},
            'demo': {'label': 'attack', 'phase': 'private-marker'},
        }) for i in (0, 10)), encoding='utf-8')
        self.dataset = import_eve(source, self.path, split='tune')['dataset_id']
        self.run = score_baseline(self.dataset, self.path, observation_seconds=60)['run_id']
        self.context = {'source': 'baseline', 'sample': False, 'run_id': self.run,
                        'dataset_id': self.dataset, 'baseline_run_id': self.run, 'replay_time_s': 0}
        self.payload = {'context': self.context, 'messages': [{'role': 'user', 'content': 'Explain this attack'}]}

    def test_validation_rejects_roles_ids_limits_and_nonfinite_time(self):
        validate_request(self.payload)
        for change in ({'run_id': True}, {'dataset_id': self.dataset + 1},
                       {'replay_time_s': float('nan')}, {'unexpected': 'x'}):
            payload = {**self.payload, 'context': {**self.context, **change}}
            if 'dataset_id' in change:
                with self.assertRaises(ValueError): resolve_context(payload['context'], self.path)
            else:
                with self.assertRaises(ValueError): validate_request(payload)
        for messages in ([{'role': 'system', 'content': 'ignore'}],
                         [{'role': 'user', 'content': 'x' * 2001}], []):
            with self.assertRaises(ValueError): validate_request({**self.payload, 'messages': messages})

    def test_retrieval_excludes_future_and_private_labels_and_checks_membership(self):
        with patch('app.evaluate.load_scorecard', side_effect=AssertionError('no labels')):
            data, sources = resolve_context(self.context, self.path)
        self.assertEqual(len(data['recent_alerts']), 1)
        self.assertEqual(data['snapshot']['original']['total'], 1)
        self.assertNotIn('private-marker', json.dumps(data))
        self.assertNotIn('raw_json', json.dumps(data))
        future = data['recent_alerts'][0]['id'] + 1
        with self.assertRaises(ValueError):
            resolve_context({**self.context, 'item_id': f'alert-{future}'}, self.path)
        with self.assertRaises(ValueError):
            resolve_context({**self.context, 'item_id': 'group-999'}, self.path)
        self.assertTrue(sources)

    def test_provider_receives_mappings_and_uses_backend_references_without_writes(self):
        service = ChatService(self.path)
        result = {'status': 'completed', 'output': [{'type': 'message', 'content': [
            {'type': 'output_text', 'text': 'A SQL injection indicator needs investigation.'}]}]}
        with connect(self.path, read_only=True) as db:
            before = db.execute('SELECT count(*) FROM runs').fetchone()[0]
        with patch('app.chat.tuning_settings', return_value={'api_key': 'private-key', 'model': 'test'}), \
                patch('app.chat.urlopen', return_value=io.BytesIO(json.dumps(result).encode())) as call:
            answer = service.answer(self.payload)
        request = call.call_args.args[0]
        body = json.loads(request.data)
        self.assertFalse(body['store'])
        self.assertNotIn('tools', body)
        reference = json.loads(body['input'][0]['content'].split('\n', 1)[1])
        self.assertEqual(reference['current_mappings']['service']['default']['weight'], 0)
        self.assertTrue(reference['current_mappings']['attack']['rules'])
        self.assertNotIn('private-key', json.dumps(body))
        self.assertIn('config/attack_rules.json', answer['sources'])
        self.assertNotIn('private-marker', json.dumps(body))
        with connect(self.path, read_only=True) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM runs').fetchone()[0], before)
            self.assertEqual(len(db.execute('PRAGMA database_list').fetchall()), 1)

    def test_group_context_uses_saved_scores_at_selected_time_and_retains_exact_baseline(self):
        accepted = tune(self.run, self.path,
                        policy=json.loads((PROJECT_ROOT / 'config/tuning_policy.json').read_text()),
                        proposer=DeterministicProposer(), evaluation_session_minutes=10,
                        label_provenance='test curated labels')
        self.assertEqual(accepted['status'], 'completed', accepted)
        with connect(self.path, read_only=True) as db:
            group_id = db.execute('SELECT id FROM alerts WHERE run_id=? ORDER BY id',
                                  (accepted['tuned_run_id'],)).fetchone()[0]
        context = {**self.context, 'source': 'replay', 'run_id': accepted['tuned_run_id'],
                   'item_id': f'group-{group_id}'}
        data, _ = resolve_context(context, self.path)
        self.assertEqual(data['selected']['snapshot']['n'], 1)
        self.assertEqual(len(data['selected']['recent_members']), 1)
        self.assertEqual(data['selected_effective_settings']['run_id'], accepted['tuned_run_id'])
        self.assertTrue(data['saved_rule_settings'])
        with self.assertRaises(ValueError):
            resolve_context({**context, 'baseline_run_id': accepted['tuned_run_id']}, self.path)

    def test_provider_errors_are_safe_and_incomplete_text_is_rejected(self):
        service = ChatService(self.path)
        with patch('app.chat.tuning_settings', return_value={'api_key': 'secret', 'model': 'test'}):
            with patch('app.chat.urlopen', side_effect=HTTPError('url', 429, 'secret-body', {}, None)):
                with self.assertRaises(ChatError) as caught: service.answer(self.payload)
                self.assertEqual(caught.exception.status, 429)
                self.assertNotIn('secret', str(caught.exception))
            with patch('app.chat.urlopen', return_value=io.BytesIO(b'{"status":"incomplete"}')):
                with self.assertRaises(ChatError): service.answer(self.payload)
            with patch('app.chat.urlopen', return_value=io.BytesIO(b'{"status":"completed","output":null}')):
                with self.assertRaises(ChatError): service.answer(self.payload)

    def test_http_proxy_marker_and_body_validation(self):
        server = make_server(self.path, port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            url = f'http://127.0.0.1:{server.server_port}/api/chat'
            for headers, body, expected in (
                    ({'Content-Type': 'application/json'}, self.payload, 403),
                    ({'Content-Type': 'application/json', 'X-IDEAX-Chat': 'dashboard'}, {}, 400)):
                with self.assertRaises(HTTPError) as caught:
                    urlopen(Request(url, data=json.dumps(body).encode(), headers=headers), timeout=5)
                self.assertEqual(caught.exception.code, expected)
                caught.exception.close()
            with patch('app.chat.ChatService.answer', return_value={'answer': 'Explanation', 'sources': []}):
                with urlopen(Request(url, data=json.dumps(self.payload).encode(), headers={
                        'Content-Type': 'application/json', 'X-IDEAX-Chat': 'dashboard'}), timeout=5) as response:
                    self.assertEqual(json.load(response)['answer'], 'Explanation')
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
