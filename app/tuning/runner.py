"""Offline proposal/evaluation loop, immutable rule lineage, and SQLite audit."""

from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

from app.db import connect
from app.evaluate import load_scorecard
from app.tuning.flow import search, window_statistics
from app.tuning.guardrail import check
from app.tuning.policy import initial_rules, proposal_rules, validate_policy
from app.tuning.replay import replay


def encoded(value):
    return json.dumps(value, sort_keys=True, allow_nan=False)


def load_baseline(run_id, path=None):
    """Read the actual scored baseline and frozen metadata; never rescore it."""
    with connect(path, read_only=True) as db:
        row = db.execute('SELECT * FROM runs WHERE id=?', (run_id,)).fetchone()
        if row is None:
            raise LookupError('Baseline run not found')
        run = dict(row)
        if run['mode'] != 'baseline' or run['status'] != 'completed':
            raise ValueError('Tuning requires a completed original-rule baseline')
        dataset = dict(db.execute('SELECT * FROM datasets WHERE id=?', (run['dataset_id'],)).fetchone())
        if dataset['split'] != 'tune':
            raise ValueError('Tuning requires dataset split=tune')
        snapshot = json.loads(run['rules_json'])
        if snapshot.get('engine') != 'original-v1':
            raise ValueError('Baseline snapshot lacks supported runtime rule metadata')
        metadata = {cfg['attack_type']: cfg for cfg in
                    [*snapshot['attack_mapping']['rules'], snapshot['attack_mapping']['fallback']]}
        rows = db.execute('''SELECT e.id, e.source_line, e.timestamp, e.timestamp_us,
            e.src_ip, e.dest_ip, a.rule_id, a.attack_type, a.service, a.base_score, a.score
            FROM alerts a JOIN alert_events ae ON ae.alert_id=a.id
            JOIN events e ON e.id=ae.event_id WHERE a.run_id=?
            ORDER BY e.timestamp_us, e.source_line''', (run_id,)).fetchall()
        if (len(rows) != dataset['event_count'] or len({r['id'] for r in rows}) != len(rows)
                or db.execute('SELECT count(*) FROM alerts WHERE run_id=?', (run_id,)).fetchone()[0] != len(rows)):
            raise ValueError('Baseline must contain exactly one alert for every dataset event')
        actual_ids = {r[0] for r in db.execute('SELECT id FROM events WHERE dataset_id=?', (run['dataset_id'],))}
        if actual_ids != {r['id'] for r in rows}:
            raise ValueError('Baseline evidence differs from dataset')
    events, base = [], {}
    for row in rows:
        event = dict(row)
        if event.pop('score') != event['base_score']:
            raise ValueError('Original-rule baseline score is inconsistent')
        cfg = metadata[event['attack_type']]
        event['benign_rule'] = cfg.get('benign_rule', cfg.get('severity_override') == 'S')
        events.append(event)
        identity = event['rule_id']
        old = base.get(identity, {'base_score': 0})
        base[identity] = {'attack_type': event['attack_type'], 'service': event['service'],
                          'base_score': max(old['base_score'], event['base_score']),
                          'benign_rule': event['benign_rule']}
    return run, dataset, snapshot, events, base


def _changes(previous, candidate, flow, reasons):
    gaps = {r['rule_id']: r['delta_gap'] for r in flow['rules']}
    return [{'rule_id': key, 'parameter': name, 'old_value': previous[key][name],
             'new_value': cfg[name], 'delta_gap': gaps[key], 'rationale': reasons[key]}
            for key, cfg in candidate.items() for name in ('window_minutes', 'n_sat')
            if previous[key][name] != cfg[name]]


def _persist_replay(db, run_id, dataset_id, groups):
    for group in groups:
        alert_id = db.execute('''INSERT INTO alerts (run_id, rule_id, group_key, attack_type,
            service, first_timestamp_us, last_timestamp_us, base_score, score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (run_id, group['rule_id'], encoded(group['group_key']), group['attack_type'],
             group['service'], group['first_timestamp_us'], group['last_timestamp_us'],
             group['base_score'], group['score'])).lastrowid
        for point in group['timeline']:
            db.execute('''INSERT INTO tuned_event_scores
                (run_id, event_id, rule_id, base_score, window_minutes, n_sat, alert_score)
                VALUES (?, ?, ?, ?, ?, ?, ?)''',
                (run_id, point['event_id'], point['rule_id'], point['base_score'],
                 group['window_minutes'], group['n_sat'], point['alert_score']))
            db.execute('''INSERT INTO alert_events
                (alert_id,event_id,run_id,dataset_id,n_in_window,raised_score) VALUES (?,?,?,?,?,?)''',
                (alert_id, point['event_id'], run_id, dataset_id, point['n'], point['score']))


def _persist_flow(db, run_id, flow, observation_seconds):
    for row in flow['rules']:
        key = row['rule_id']
        for candidate in row['candidates']:
            # Candidate search statistics are stored per tested W. The final joint
            # per-rule counts (possibly including cross-service repeats) live in report_text.
            db.execute('''INSERT INTO rule_flow_stats
                (run_id,rule_id,window_minutes,observed_count,observation_seconds,peak_n,p95_n,
                 base_score,evidence_weight,allowed_share,percentile_method) VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
                (run_id, key, candidate['window_minutes'], row['event_count'], observation_seconds,
                 candidate['peak_n'], candidate['p95_n'], row['base_score'], row['evidence'],
                 row['allowed_per_hour'], row['percentile_method'] + '; isolated candidate search'))


def _write_document(directory, name, value):
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / name
    # Unique attempt directories, no shared tuned_rules.yaml to overwrite on failure.
    with destination.open('x', encoding='utf-8', newline='\n') as stream:
        stream.write(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + '\n')
    return str(destination)


def _validated_version(version_id, baseline_run_id, path):
    with connect(path, read_only=True) as db:
        version = db.execute('''SELECT v.* FROM rule_versions v
            JOIN tuning_attempts t ON t.selected_version_id=v.id
            WHERE v.id=? AND v.guardrail_status='passed' AND v.status IN ('active','retired')
            AND t.status='completed' AND t.baseline_run_id=?''', (version_id, baseline_run_id)).fetchone()
        if version is None:
            raise ValueError('Version must have passed tuning on this exact baseline run')
        return dict(version)


def replay_version(baseline_run_id, version_id, path=None):
    """Fresh same-event replay of a previously accepted snapshot; no label/model calls."""
    baseline, _, _, events, base = load_baseline(baseline_run_id, path)
    version = _validated_version(version_id, baseline_run_id, path)
    snapshot = json.loads(version['rules_json'])
    policy = snapshot['policy']
    rules, _ = proposal_rules(snapshot['proposal'], base, policy)
    with connect(path) as db:
        run_id = db.execute('''INSERT INTO runs
            (dataset_id,mode,status,rule_version,rule_version_id,rules_json,budget_per_hour,observation_seconds)
            VALUES (?,'tuned','running',?,?,?,?,?)''',
            (baseline['dataset_id'], version_id, version_id, version['rules_json'],
             policy['budget_per_hour'], baseline['observation_seconds'])).lastrowid
    try:
        groups = replay(events, rules, base, policy)
        with connect(path) as db:
            _persist_replay(db, run_id, baseline['dataset_id'], groups)
            db.execute("UPDATE runs SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", (run_id,))
    except Exception as error:
        with connect(path) as db:
            db.execute("UPDATE runs SET status='failed',error_message=?,failed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", (str(error), run_id))
        raise
    return {'run_id': run_id, 'rule_version_id': version_id, 'baseline_run_id': baseline_run_id,
            'status': 'completed', 'alerts': len(groups), 'events': len(events)}


def tune(baseline_run_id, path=None, *, policy, proposer, labels_path=None,
         evaluation_manifest=None, evaluation_session_minutes=None, label_provenance=None,
         output_directory=None, from_version_id=None):
    """Try at most three proposals. Only a passing child version becomes active.

    Each model request and replay happens outside write transactions. Failed
    candidate result writes roll back completely; their run/iteration survives.
    Baseline remains the caller's fallback if no candidate passes. An unrelated
    previously active version is never changed on failure.
    """
    validate_policy(policy)
    run, _, baseline_snapshot, events, base = load_baseline(baseline_run_id, path)
    current = initial_rules(base, policy)
    if from_version_id:
        starting = _validated_version(from_version_id, baseline_run_id, path)
        current, _ = proposal_rules(json.loads(starting['rules_json'])['proposal'], base, policy)
    evaluation_policy = {'manifest_supplied': evaluation_manifest is not None,
                         'session_minutes': evaluation_session_minutes, 'provenance': label_provenance}
    model_name = proposer.model_name
    with connect(path) as db:
        attempt_id = db.execute('''INSERT INTO tuning_attempts
            (baseline_run_id,created_by,policy_json,evaluation_policy_json)
            VALUES (?,?,?,?)''', (baseline_run_id, model_name, encoded(policy), encoded(evaluation_policy))).lastrowid
    directory = Path(output_directory) / f'attempt-{attempt_id}-{uuid4().hex[:12]}' if output_directory is not None else None
    outcome = {'attempt_id': attempt_id, 'baseline_run_id': baseline_run_id,
               'status': 'failed', 'selected_version_id': None, 'attempts': 0,
               'fallback_run_id': baseline_run_id,
               'artifact_directory': str(directory) if directory else None}
    parent = from_version_id or run['rule_version_id']
    try:
        scorecard = load_scorecard(events, run['dataset_id'], path, labels_path=labels_path,
                                   manifest=evaluation_manifest, session_minutes=evaluation_session_minutes,
                                   provenance=label_provenance)
        evidence = scorecard.evidence(events, policy)
        flow, suggested = search(events, base, current, policy, evidence, run['observation_seconds'])
        with connect(path) as db:
            db.execute('UPDATE tuning_attempts SET flow_json=? WHERE id=?', (encoded(flow), attempt_id))
        if directory:
            _write_document(directory, 'flow_table.json', flow)
        if flow['allocation_status'] != 'allocated':
            raise ValueError('Zero total priority; allocation is undefined and tuning cannot be accepted')
        feedback = []
        for iteration in range(1, 4):
            outcome['attempts'] = iteration
            with connect(path) as db:
                iteration_id = db.execute('''INSERT INTO tuning_iterations
                    (attempt_id,iteration,model_name) VALUES (?,?,?)''',
                    (attempt_id, iteration, model_name)).lastrowid
            version, tuned_run_id, candidate = None, None, None
            try:
                # This allowlist is the complete model interface. No event payloads,
                # individual labels, endpoints, timestamps, or attack-group members.
                context = {'iteration': iteration, 'policy': policy, 'flow': flow,
                           'current_rules': current, 'suggested_rules': suggested, 'feedback': feedback}
                proposal = proposer(json.loads(encoded(context)))
                proposal_json = encoded(proposal)
                version = 'tuned/' + uuid4().hex
                snapshot = {**baseline_snapshot, 'engine': 'tuned-session-v1',
                            'parent_version_id': parent, 'policy': policy, 'proposal': proposal}
                try:
                    candidate, reasons = proposal_rules(proposal, base, policy)
                    changes = _changes(current, candidate, flow, reasons)
                    validation_error = None
                except ValueError as error:
                    changes, validation_error = [], str(error)
                # A malformed proposal never becomes the effective configuration.
                # Keep its raw text and the unchanged effective rules in the version
                # so subsequent old/new diffs still agree with their parent's inputs.
                snapshot['effective_rules'] = candidate if validation_error is None else current
                snapshot['proposal_valid'] = validation_error is None
                snapshot_json = encoded(snapshot)
                with connect(path) as db:
                    db.execute('''INSERT INTO rule_versions
                        (id,parent_id,rules_json,changes_json,rationale,created_by)
                        VALUES (?,?,?,?,?,?)''',
                        (version, parent, snapshot_json, encoded(changes), 'Offline alert-load tuning proposal', model_name))
                    db.execute('UPDATE tuning_iterations SET rule_version_id=?,proposal_json=? WHERE id=?',
                               (version, proposal_json, iteration_id))
                parent = version
                if validation_error:
                    raise ValueError(validation_error)
                # Proposal lineage follows validated parameter snapshots even if
                # replay/persistence later fails. Runtime still uses only accepted
                # versions, while the next diff must match this actual parent.
                current = candidate
                with connect(path) as db:
                    tuned_run_id = db.execute('''INSERT INTO runs
                        (dataset_id,mode,status,rule_version,rule_version_id,rules_json,budget_per_hour,observation_seconds)
                        VALUES (?,'tuned','running',?,?,?,?,?)''',
                        (run['dataset_id'], version, version, snapshot_json,
                         policy['budget_per_hour'], run['observation_seconds'])).lastrowid
                    db.execute('UPDATE tuning_iterations SET tuned_run_id=? WHERE id=?', (tuned_run_id, iteration_id))
                groups = replay(events, candidate, base, policy)
                evaluation = scorecard.evaluate(events, groups, observation_seconds=run['observation_seconds'],
                                                budget=policy['budget_per_hour'])
                guardrail = check(events, groups, candidate, base, policy, evaluation)
                stats = window_statistics(events, candidate, base, policy)
                shares = {r['rule_id']: r['allowed_per_hour'] for r in flow['rules']}
                joint = {key: {**values, 'grouped_per_hour': values['grouped_count'] * 3600 / run['observation_seconds'],
                              'remaining_gap': max(0, values['grouped_count'] * 3600 / run['observation_seconds'] - shares[key])}
                         for key, values in stats.items()}
                report = {'evaluation': evaluation, 'guardrail': guardrail, 'changes': changes,
                          'joint_rule_statistics': joint}
                if directory:
                    _write_document(directory, f'iteration-{iteration}.json', report)
                    _write_document(directory, f'candidate-{iteration}.yaml',
                                    {'schema_version': 1, 'rule_version_id': version,
                                     'parent_version_id': snapshot['parent_version_id'],
                                     'rules': candidate, 'audit': {'changes': changes, 'guardrail': guardrail}})
                with connect(path) as db:
                    _persist_replay(db, tuned_run_id, run['dataset_id'], groups)
                    _persist_flow(db, tuned_run_id, flow, run['observation_seconds'])
                    evaluation_id = db.execute('''INSERT INTO evaluations
                        (baseline_run_id,tuned_run_id,dataset_id,iteration,alert_reduction,attack_groups_total,
                         attack_groups_retained,benign_groups_raised,details_json,baseline_alert_count,tuned_alert_count)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
                        (baseline_run_id, tuned_run_id, run['dataset_id'], iteration, evaluation['alert_reduction'],
                         evaluation['attack_groups_total'], evaluation['attack_groups_retained'],
                         evaluation['benign_groups_raised'], encoded(evaluation), len(events), len(groups))).lastrowid
                    if not guardrail['passed']:
                        db.execute("UPDATE runs SET status='failed',error_message=?,failed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
                                   ('Guardrail rejected: ' + '; '.join(guardrail['errors']), tuned_run_id))
                    db.execute("UPDATE tuning_iterations SET status='evaluated',evaluation_id=?,guardrail_json=?,report_text=? WHERE id=?",
                               (evaluation_id, encoded(guardrail), encoded(report), iteration_id))
                    db.execute('UPDATE rule_versions SET guardrail_status=?,status=? WHERE id=?',
                               ('passed' if guardrail['passed'] else 'failed', 'proposed' if guardrail['passed'] else 'rejected', version))
                feedback.append({'iteration': iteration, 'evaluation': evaluation, 'guardrail': guardrail})
                if guardrail['passed']:
                    rules_file = None
                    if directory:
                        rules_file = _write_document(directory, 'tuned_rules.yaml',
                            {'schema_version': 1, 'rule_version_id': version, 'rules': candidate,
                             'audit': {'changes': changes, 'evaluation': evaluation, 'guardrail': guardrail}})
                    accepted = {**outcome, 'status': 'completed', 'selected_version_id': version,
                                'tuned_run_id': tuned_run_id, 'evaluation': evaluation,
                                'budget_met': guardrail['budget_met']}
                    if rules_file:
                        accepted['rules_file'] = rules_file
                    # Activation and attempt result are atomic. No approval states.
                    with connect(path) as db:
                        db.execute("UPDATE rule_versions SET status='retired' WHERE status='active'")
                        db.execute("UPDATE rule_versions SET status='active' WHERE id=? AND guardrail_status='passed'", (version,))
                        db.execute("UPDATE runs SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", (tuned_run_id,))
                        db.execute("UPDATE tuning_attempts SET status='completed',selected_version_id=?,outcome_json=? WHERE id=?",
                                   (version, encoded(accepted), attempt_id))
                    return accepted
            except Exception as error:
                message = str(error)
                with connect(path) as db:
                    if tuned_run_id is not None:
                        db.execute("UPDATE runs SET status='failed',error_message=?,failed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", (message, tuned_run_id))
                    if version:
                        db.execute("UPDATE rule_versions SET status='rejected',guardrail_status='failed' WHERE id=?", (version,))
                    db.execute("UPDATE tuning_iterations SET status='failed',error_message=?,guardrail_json=? WHERE id=?",
                               (message, encoded({'passed': False, 'errors': [message]}), iteration_id))
                feedback.append({'iteration': iteration, 'error': message})
        outcome['error'] = 'No candidate passed within three proposal/evaluation iterations'
    except Exception as error:
        outcome['error'] = str(error)
    with connect(path) as db:
        db.execute("UPDATE tuning_attempts SET status='failed',error_message=?,outcome_json=? WHERE id=?",
                   (outcome['error'], encoded(outcome), attempt_id))
    return outcome
