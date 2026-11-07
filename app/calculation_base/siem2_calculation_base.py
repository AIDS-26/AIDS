import math
from collections import defaultdict
from datetime import datetime, timedelta
from .siem1 import band

def adjusted_score(base, n, n_sat, benign=False):
    if benign or n <= 1:
        return base
    n_sat = max(2, n_sat)
    x = round(base + (10 - base) * min(1, math.log(n) / math.log(n_sat)))
    return max(base, min(10, x))

def group_events(events, rules, default_window=5, default_n_sat=60):
    # Non-overlapping, fixed-duration windows per group; scanner groups use source IP.
    buckets = defaultdict(list)
    for e in sorted(events, key=lambda e: e['timestamp']):
        scanner = 'scan' in e['attack_type'] or 'reconnaissance' in e['attack_type']
        host = e['src_ip'] if scanner else e['dest_ip']
        key = (e['attack_type'], e['service'], host)
        cfg = rules.get(e['attack_type'] + '|' + e['service'], {})
        window = max(1, int(cfg.get('window_minutes', default_window)))
        t = datetime.fromisoformat(e['timestamp'])
        epoch = t.timestamp()
        slot = int(epoch // (window * 60))
        buckets[(key, slot, window)].append(e)
    output = []
    for (key, slot, window), group in buckets.items():
        attack, service, host = key
        cfg = rules.get(attack + '|' + service, {})
        base = max(e['base_score'] for e in group)
        benign = all(e['label'] != 'attack' for e in group)
        score = adjusted_score(base, len(group), cfg.get('n_sat', default_n_sat), benign)
        output.append({'attack_type': attack, 'service': service, 'host': host,
                       'event_count': len(group), 'base_score': base,
                       'score': score, 'severity': band(score),
                       'benign': benign, 'contains_attack': not benign,
                       'event_ids': [e['id'] for e in group],
                       'window_minutes': window, 'first_timestamp': group[0]['timestamp']})
    return sorted(output, key=lambda x: x['first_timestamp'])
