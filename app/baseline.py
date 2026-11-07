"""Bridge sanitized database events to original-rule scoring and SIEM results."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import traceback

from app.db import PROJECT_ROOT, connect
from app.calculation_base.siem_1_calculation_base import score_events, validate_mappings


def score_baseline(dataset_id: int, path: str | Path | None = None, *,
                   observation_seconds: float,
                   attack_rules: str | Path = PROJECT_ROOT / 'config/attack_rules.json',
                   service_rules: str | Path = PROJECT_ROOT / 'config/service_rules.json') -> dict:
    """Create a fresh run, calculate outside write locks, then commit all results.

    Baseline emits one alert per event, n=1 and score=S. Runtime never reads the
    label store. An exception rolls back partial alerts and records a failed run.
    Observation duration is operator supplied, never inferred as one second.
    """
    if (isinstance(observation_seconds, bool) or not isinstance(observation_seconds, (int, float))
            or not math.isfinite(observation_seconds) or observation_seconds <= 0):
        raise ValueError('observation_seconds must be finite and positive')
    attack = json.loads(Path(attack_rules).read_text(encoding='utf-8-sig'))
    service = json.loads(Path(service_rules).read_text(encoding='utf-8-sig'))
    validate_mappings(attack, service)
    snapshot = json.dumps({'attack_mapping': attack, 'service_mapping': service,
                           'engine': 'original-v1', 'attack_matching': 'ordered-case-insensitive-or',
                           'service_matching': 'destination-longest-prefix-default',
                           'event_order': ['timestamp_us', 'source_line'],
                           'baseline_grouping': 'one-alert-per-event'}, sort_keys=True)
    version = 'baseline/' + hashlib.sha256(snapshot.encode()).hexdigest()
    with connect(path, read_only=True) as db:
        dataset = db.execute('SELECT * FROM datasets WHERE id=?', (dataset_id,)).fetchone()
        if dataset is None:
            raise LookupError('Dataset not found')
        rows = db.execute('SELECT id, source_line, timestamp_us, raw_json FROM events '
                          'WHERE dataset_id=? ORDER BY timestamp_us, source_line', (dataset_id,)).fetchall()
    if len(rows) != dataset['event_count']:
        raise ValueError('Dataset event count is inconsistent')
    if rows and rows[-1]['timestamp_us'] - rows[0]['timestamp_us'] > observation_seconds * 1_000_000:
        raise ValueError('Observation duration is shorter than the event span')
    with connect(path) as db:
        db.execute('INSERT INTO rule_versions (id, rules_json, rationale, created_by) '
                   'VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
                   (version, snapshot, 'Original-rule deterministic replay', 'baseline-worker'))
        run_id = db.execute('''INSERT INTO runs (dataset_id, mode, status, rule_version,
            rule_version_id, rules_json, observation_seconds)
            VALUES (?, 'baseline', 'running', ?, ?, ?, ?)''',
            (dataset_id, version, version, snapshot, observation_seconds)).lastrowid
    try:
        events = []
        for row in rows:
            event = json.loads(row['raw_json'])
            event.update(id=row['id'], source_line=row['source_line'], timestamp_us=row['timestamp_us'])
            events.append(event)
        scored = score_events(events, attack, service)
        with connect(path) as db:
            for event in scored:
                identity = (event['attack_type'], event['service'])
                rule = db.execute('SELECT id FROM rules WHERE attack_type=? AND service=?', identity).fetchone()
                if rule:
                    rule_id = rule['id']
                else:
                    rule_id = 'rule/' + hashlib.sha256(json.dumps(identity).encode()).hexdigest()
                    db.execute('INSERT INTO rules (id, attack_type, service) VALUES (?, ?, ?)', (rule_id, *identity))
                scanner = 'scan' in event['attack_type'] or 'reconnaissance' in event['attack_type']
                host = event['src_ip'] if scanner else event['dest_ip']
                group_key = json.dumps(['source' if scanner else 'target', host, event['attack_type']])
                alert_id = db.execute('''INSERT INTO alerts (run_id, rule_id, group_key,
                    attack_type, service, first_timestamp_us, last_timestamp_us, base_score, score)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                    (run_id, rule_id, group_key, *identity, event['timestamp_us'],
                     event['timestamp_us'], event['base_score'], event['base_score'])).lastrowid
                db.execute('''INSERT INTO alert_events (alert_id, event_id, run_id, dataset_id,
                    n_in_window, raised_score) VALUES (?, ?, ?, ?, 1, ?)''',
                    (alert_id, event['id'], run_id, dataset_id, event['base_score']))
            db.execute("UPDATE runs SET status='completed', completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", (run_id,))
    except Exception as error:
        with connect(path) as db:
            db.execute("UPDATE runs SET status='failed', error_message=?, error_traceback=?, "
                       "failed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
                       (str(error), traceback.format_exc(), run_id))
        raise
    return {'run_id': run_id, 'dataset_id': dataset_id, 'alerts': len(scored),
            'rule_version_id': version, 'status': 'completed'}
