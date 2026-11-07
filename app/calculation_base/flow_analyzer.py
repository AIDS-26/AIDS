"""Offline flow statistics with explicit observation duration and evidence inputs."""

from collections import defaultdict, deque
from datetime import datetime
from math import ceil, isfinite

def analyze(events, budget, *, observation_seconds, window_minutes, evidence_by_rule):
    # Evidence is an offline analyst/label-derived aggregate, never runtime scoring input.
    for name, value in [('budget', budget), ('observation_seconds', observation_seconds),
                        ('window_minutes', window_minutes)]:
        if type(value) not in (int, float) or not isfinite(value) or value <= 0:
            raise ValueError(f'{name} must be finite and positive')
    duration = observation_seconds / 3600
    times = [datetime.fromisoformat(e['timestamp'].replace('Z', '+00:00')) for e in events]
    if any(t.tzinfo is None for t in times):
        raise ValueError('Event timestamp needs a timezone')
    if times and (max(times) - min(times)).total_seconds() > observation_seconds:
        raise ValueError('Observation duration is shorter than the event span')
    grouped = defaultdict(list)
    for e in events:
        grouped[(e['attack_type'], e['service'])].append(e)
    rows = []
    for (attack, service), group in grouped.items():
        score = max(e['base_score'] for e in group)
        rule_id = attack + '|' + service
        evidence = evidence_by_rule[rule_id]
        if type(evidence) not in (int, float) or not isfinite(evidence) or not 0 <= evidence <= 1:
            raise ValueError('Evidence weights must be finite values from 0 to 1')
        windows, counts = defaultdict(deque), []
        ordered = sorted(group, key=lambda e: (datetime.fromisoformat(e['timestamp'].replace('Z', '+00:00')),
                                                e.get('source_line', e['id'])))
        for event in ordered:
            scanner = 'scan' in attack or 'reconnaissance' in attack
            host = event['src_ip'] if scanner else event['dest_ip']
            timestamp = datetime.fromisoformat(event['timestamp'].replace('Z', '+00:00')).timestamp()
            queue = windows[host]
            # Trailing interval (t-W, t], current event included; stable order for ties.
            while queue and queue[0] <= timestamp - window_minutes * 60:
                queue.popleft()
            queue.append(timestamp)
            counts.append(len(queue))
        counts.sort()
        rows.append({'rule_id': rule_id, 'attack_type': attack,
                     'service': service, 'base_score': score, 'evidence': evidence,
                     'observed_per_hour': len(group) / duration,
                     'event_count': len(group), 'priority_weight': score * evidence,
                     'window_minutes': window_minutes, 'peak_n': max(counts),
                     'p95_n': counts[ceil(0.95 * len(counts)) - 1],
                     'percentile_method': 'nearest-rank; per-event trailing (t-W,t] counts'})
    total = sum(r['priority_weight'] for r in rows)
    for r in rows:
        r['allowed_per_hour'] = budget * r['priority_weight'] / total if total else None
        r['delta_gap'] = r['observed_per_hour'] - r['allowed_per_hour'] if total else None
    return {'duration_hours': duration, 'alerts_per_hour': len(events) / duration,
            'burn_rate': len(events) / duration / budget, 'budget': budget,
            'allocation_status': 'allocated' if total else 'zero_priority_weight',
            'rules': sorted(rows, key=lambda r: -(r['delta_gap'] or 0))}
