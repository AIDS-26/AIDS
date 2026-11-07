"""Read-only playback of persisted results. No scoring, tuning, or label access."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
import json

from app.db import connect


def _summary():
    return {'total': 0, 'high': 0, 'medium': 0, 'low': 0}


def _reduction(before, after):
    if not before or after is None:
        return 'N/A'
    value = (Decimal(before - after) * 100 / Decimal(before)).quantize(
        Decimal('0.1'), rounding=ROUND_HALF_UP)
    return f'{value}%'


def replay_view(baseline_run_id, path=None):
    """Return a complete snapshot, with compact per-group score histories.

    Original alerts and effective group scores come from saved rows. Frames are
    presentation aggregates, not new scoring or an evaluation. A tuned run must
    have an accepted version on this exact baseline and identical event evidence.
    """
    with connect(path, read_only=True) as db:
        db.execute('BEGIN')  # One consistent WAL snapshot across all reads.
        row = db.execute('SELECT * FROM runs WHERE id=?', (baseline_run_id,)).fetchone()
        if row is None:
            raise LookupError('Baseline run not found')
        baseline = dict(row)
        if baseline['mode'] != 'baseline' or baseline['status'] != 'completed':
            raise ValueError('Replay requires a completed original-rule baseline')
        dataset = dict(db.execute('SELECT id,name,sha256,event_count FROM datasets WHERE id=?',
                                  (baseline['dataset_id'],)).fetchone())
        original = [dict(r) for r in db.execute('''SELECT a.id,e.id AS event_id,
            e.source_line,e.timestamp,e.timestamp_us,e.src_ip,e.dest_ip,e.signature,
            a.rule_id,a.attack_type,a.service,a.base_score,a.score,a.severity AS band
            FROM alerts a JOIN alert_events ae ON ae.alert_id=a.id AND ae.run_id=a.run_id
            JOIN events e ON e.id=ae.event_id
            WHERE a.run_id=? ORDER BY e.timestamp_us,e.source_line,e.id''', (baseline_run_id,))]
        actual_ids = {r[0] for r in db.execute('SELECT id FROM events WHERE dataset_id=?',
                                             (dataset['id'],))}
        if (len(original) != dataset['event_count'] or len(original) != len(actual_ids)
                or {r['event_id'] for r in original} != actual_ids
                or len({r['id'] for r in original}) != len(original)
                or db.execute('SELECT count(*) FROM alerts WHERE run_id=?',
                              (baseline_run_id,)).fetchone()[0] != len(original)):
            raise ValueError('Baseline must preserve exactly one alert for every dataset event')
        tuned_row = db.execute('''SELECT r.* FROM runs r JOIN rule_versions v
            ON v.id=r.rule_version_id WHERE r.dataset_id=? AND r.mode='tuned'
            AND r.status='completed' AND r.observation_seconds=?
            AND v.guardrail_status='passed' AND v.status IN ('active','retired')
            AND EXISTS (SELECT 1 FROM tuning_attempts t WHERE t.selected_version_id=v.id
                AND t.baseline_run_id=? AND t.status='completed')
            ORDER BY r.id DESC LIMIT 1''',
            (dataset['id'], baseline['observation_seconds'], baseline_run_id)).fetchone()
        tuned = dict(tuned_row) if tuned_row else None
        members, evaluation, saved_groups = [], None, []
        if tuned:
            saved_groups = [dict(r) for r in db.execute(
                'SELECT id,group_key,event_count,score FROM alerts WHERE run_id=?', (tuned['id'],))]
            members = [dict(r) for r in db.execute('''SELECT e.id AS event_id,ae.alert_id,
                tes.alert_score AS score,
                CASE WHEN tes.alert_score>=8 THEN 'High'
                     WHEN tes.alert_score>=5 THEN 'Medium' ELSE 'Low' END AS band
                FROM alert_events ae JOIN events e ON e.id=ae.event_id
                LEFT JOIN tuned_event_scores tes ON tes.run_id=ae.run_id AND tes.event_id=ae.event_id
                WHERE ae.run_id=? ORDER BY e.timestamp_us,e.source_line,e.id''', (tuned['id'],))]
            if (len(members) != len(original)
                    or {r['event_id'] for r in members} != actual_ids
                    or len({r['event_id'] for r in members}) != len(members)):
                raise ValueError('Tuned replay evidence differs from the selected baseline')
            if any(r['score'] is None for r in members):
                raise ValueError('Saved tuned run has no complete score history for playback')
            evaluated = db.execute('''SELECT ev.* FROM evaluations ev JOIN runs r
                ON r.id=ev.tuned_run_id WHERE ev.baseline_run_id=?
                AND r.rule_version_id=? AND r.status='completed'
                ORDER BY ev.id DESC LIMIT 1''', (baseline_run_id, tuned['rule_version_id'])).fetchone()
            if evaluated:
                evaluation = {key: evaluated[key] for key in (
                    'id', 'tuned_run_id', 'attack_groups_total', 'attack_groups_retained',
                    'attack_group_recall', 'benign_groups_raised')}
                evaluation['recall_scope'] = json.loads(evaluated['details_json']).get('recall_scope')

    start = original[0]['timestamp_us'] if original else 0
    duration = baseline['observation_seconds']
    if original and (original[-1]['timestamp_us'] - start) / 1_000_000 > duration:
        raise ValueError('Saved observation duration is shorter than the event span')
    by_event = {r['event_id']: r for r in members}
    saved_by_id = {r['id']: r for r in saved_groups}
    groups, original_summary = {}, _summary()
    tuned_summary = _summary() if tuned else None
    frames, raised = [], 0

    def frame(t):
        return {'t': t, 'original': dict(original_summary),
                'tuned': dict(tuned_summary) if tuned_summary is not None else None,
                'groups_raised': raised if tuned else None,
                'reduction': _reduction(original_summary['total'],
                                        tuned_summary['total'] if tuned_summary is not None else None)}

    frames.append(frame(0))
    bands = {'Low': 0, 'Medium': 1, 'High': 2}
    for alert in original:
        alert['t'] = (alert.pop('timestamp_us') - start) / 1_000_000
        alert['rule_name'] = alert['attack_type'].replace('_', ' ').capitalize()
        original_summary['total'] += 1
        original_summary[alert['band'].lower()] += 1
        if tuned:
            member = by_event[alert['event_id']]
            key = member['alert_id']
            group = groups.get(key)
            if group is None:
                correlation = json.loads(saved_by_id[key]['group_key'])
                group = {'group_id': key, 'title': alert['rule_name'],
                         'host': correlation[1], 'key_type': correlation[0],
                         'alert_ids': [], 'timeline': [], 'initial_band': alert['band']}
                groups[key] = group
                tuned_summary['total'] += 1
            else:
                previous = group['timeline'][-1]
                tuned_summary[previous['band'].lower()] -= 1
                raised -= int(previous['raised_from'] is not None)
            group['alert_ids'].append(alert['id'])
            raised_from = group['initial_band'] if bands[member['band']] > bands[group['initial_band']] else None
            point = {'t': alert['t'], 'last_t': alert['t'], 'n': len(group['alert_ids']),
                     'score': member['score'], 'band': member['band'], 'raised_from': raised_from}
            group['timeline'].append(point)
            tuned_summary[member['band'].lower()] += 1
            raised += int(raised_from is not None)
        current = frame(alert['t'])
        if frames[-1]['t'] == alert['t']:
            frames[-1] = current
        else:
            frames.append(current)
    for saved in saved_groups:
        group = groups.get(saved['id'])
        if (group is None or len(group['alert_ids']) != saved['event_count']
                or group['timeline'][-1]['score'] != saved['score']):
            raise ValueError('Saved group totals or score history are inconsistent')
    if frames[-1]['t'] < duration:
        frames.append(frame(duration))
    return {'dataset': dataset, 'baseline_run_id': baseline_run_id,
            'tuned_run_id': tuned['id'] if tuned else None,
            'rule_version_id': tuned['rule_version_id'] if tuned else baseline['rule_version_id'],
            'duration_s': duration, 'total_alerts': len(original), 'alerts': original,
            'groups': list(groups.values()), 'frames': frames, 'evaluation': evaluation,
            'notice': None if tuned else 'No accepted tuned run exists for this baseline. Original rules remain available.'}
