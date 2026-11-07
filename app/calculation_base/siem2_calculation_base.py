"""Prototype fixed clock-window grouping, not an approved tuned-run loader.

Buckets are epoch-aligned [start, start+W), partitioned by attack/service/host.
This still needs the agreed rolling/session semantics, cross-service scanner
policy, immediate exploit exemption and per-event trajectory before activation.
"""

import math
from collections import defaultdict
from datetime import datetime
from .siem_1_calculation_base import band

def adjusted_score(base, n, n_sat, benign=False):
    if type(base) is not int or not 1 <= base <= 10:
        raise ValueError('base must be an integer from 1 to 10')
    if type(n) is not int or n < 1:
        raise ValueError('n must be a positive integer')
    if type(n_sat) is not int or n_sat < 2:
        raise ValueError('n_sat must be an integer >= 2')
    if benign or n <= 1:
        return base
    x = math.floor(base + (10 - base) * min(1, math.log(n) / math.log(n_sat)) + 0.5)
    return max(base, min(10, x))

def group_events(events, rules, default_window=5, default_n_sat=60):
    # Non-overlapping, fixed-duration windows per group; scanner groups use source IP.
    buckets = defaultdict(list)
    def instant(event):
        t = datetime.fromisoformat(event['timestamp'].replace('Z', '+00:00'))
        if t.tzinfo is None:
            raise ValueError('Event timestamp needs a timezone')
        return t
    for e in sorted(events, key=lambda e: (instant(e), e.get('source_line', e['id']))):
        scanner = 'scan' in e['attack_type'] or 'reconnaissance' in e['attack_type']
        host = e['src_ip'] if scanner else e['dest_ip']
        key = (e['attack_type'], e['service'], host)
        cfg = rules.get(e['attack_type'] + '|' + e['service'], {})
        window = cfg.get('window_minutes', default_window)
        if type(window) not in (int, float) or not math.isfinite(window) or window <= 0:
            raise ValueError('window_minutes must be finite and positive')
        t = instant(e)
        epoch = t.timestamp()
        slot = int(epoch // (window * 60))
        buckets[(key, slot, window)].append(e)
    output = []
    for (key, slot, window), group in buckets.items():
        attack, service, host = key
        cfg = rules.get(attack + '|' + service, {})
        base = max(e['base_score'] for e in group)
        benign = all(e.get('benign_rule', False) for e in group)
        score = adjusted_score(base, len(group), cfg.get('n_sat', default_n_sat), benign)
        output.append({'attack_type': attack, 'service': service, 'host': host,
                       'event_count': len(group), 'base_score': base,
                       'score': score, 'severity': band(score),
                       'benign': benign,
                       'event_ids': [e['id'] for e in group],
                       'window_minutes': window, 'first_timestamp': group[0]['timestamp']})
    return sorted(output, key=lambda x: datetime.fromisoformat(x['first_timestamp'].replace('Z', '+00:00')))


def group_events_with_yaml(events, snapshot, attack_path, service_path):
    """Run SIEM II grouping with validated full YAML settings."""
    from tuner.rules import to_siem2_settings

    rules, window, n_sat = to_siem2_settings(snapshot, attack_path, service_path)
    return group_events(events, rules, default_window=window, default_n_sat=n_sat)
