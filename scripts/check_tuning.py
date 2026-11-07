"""Reproducible frozen-demo check in a temporary local DB; never calls a model."""

import json
from pathlib import Path
import tempfile

from app.baseline import score_baseline
from app.db import PROJECT_ROOT, connect, migrate
from app.import_events import import_eve
from app import siem
from app.tuning.model import DeterministicProposer
from app.tuning.policy import load_document
from app.tuning.runner import tune


def main():
    with tempfile.TemporaryDirectory(prefix='ideax-tuning-') as root:
        path = Path(root) / 'runtime.sqlite3'
        migrate(path)
        imported = import_eve(PROJECT_ROOT / 'demo_freeze/eve_demo_FINAL.json', path, split='tune')
        baseline = score_baseline(imported['dataset_id'], path, observation_seconds=9600)
        outcome = tune(baseline['run_id'], path,
                       policy=load_document(PROJECT_ROOT / 'config/tuning_policy.json'),
                       proposer=DeterministicProposer(), evaluation_session_minutes=10,
                       label_provenance='Curated demo.label; manifest preparation uses Suricata ATTACK_RE, not independent ground truth')
        detail = siem.tuning_detail(outcome['attempt_id'], path)
        with connect(path, read_only=True) as db:
            health = {'integrity': db.execute('PRAGMA integrity_check').fetchone()[0],
                      'foreign_key_errors': len(db.execute('PRAGMA foreign_key_check').fetchall())}
            counts = [dict(row) for row in db.execute('''SELECT r.id,r.mode,r.status,
                count(DISTINCT a.id) alerts,count(ae.event_id) memberships FROM runs r
                LEFT JOIN alerts a ON a.run_id=r.id LEFT JOIN alert_events ae ON ae.alert_id=a.id GROUP BY r.id''')]
            assert health == {'integrity': 'ok', 'foreign_key_errors': 0}, health
            assert all(r['memberships'] == imported['events'] for r in counts)
            selected = db.execute("SELECT id FROM rule_versions WHERE status='active'").fetchall()
            assert bool(selected) == (outcome['status'] == 'completed')
        summary = {'dataset_sha256': imported['sha256'], 'observation_seconds': 9600,
                   'proposer': 'deterministic-search (no model)', 'outcome': outcome, 'health': health,
                   'run_counts': counts, 'iterations': detail['iterations']['items'],
                   'policy': detail['attempt']['policy'], 'flow': detail['attempt']['flow'],
                   'database_lifetime': 'temporary local database removed after verification'}
        destination = PROJECT_ROOT / 'output/tuning-integration-check.json'
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
        fields = ('baseline_alerts', 'grouped_alerts', 'reduction_pct', 'attack_groups_total',
                  'attack_groups_retained', 'benign_groups_raised', 'remaining_budget_gap')
        metrics = [{key: i['report']['evaluation'][key] for key in fields}
                   if i['report'] else i['error_message'] for i in detail['iterations']['items']]
        print(json.dumps({'report': str(destination), 'outcome': outcome, 'health': health,
                          'metrics': metrics}, indent=2))


if __name__ == '__main__':
    main()
