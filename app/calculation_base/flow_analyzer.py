from collections import defaultdict
from datetime import datetime
from math import ceil

def analyze(events, budget=20):
    if not events:
        return {'duration_hours': 0, 'alerts_per_hour': 0, 'burn_rate': 0, 'rules': []}
    times = [datetime.fromisoformat(e['timestamp']) for e in events]
    duration = max((max(times) - min(times)).total_seconds() / 3600, 1 / 3600)
    grouped = defaultdict(list)
    for e in events:
        grouped[(e['attack_type'], e['service'])].append(e)
    rows = []
    for (attack, service), group in grouped.items():
        score = max(e['base_score'] for e in group)
        evidence = 1.0 if any(e['label'] == 'attack' for e in group) else 0.2
        rows.append({'rule_id': attack + '|' + service, 'attack_type': attack,
                     'service': service, 'base_score': score, 'evidence': evidence,
                     'observed_per_hour': len(group) / duration,
                     'event_count': len(group), 'priority_weight': score * evidence})
    total = sum(r['priority_weight'] for r in rows)
    for r in rows:
        r['allowed_per_hour'] = budget * r['priority_weight'] / total if total else 0
        r['delta_gap'] = r['observed_per_hour'] - r['allowed_per_hour']
    return {'duration_hours': duration, 'alerts_per_hour': len(events) / duration,
            'burn_rate': len(events) / duration / budget, 'budget': budget,
            'rules': sorted(rows, key=lambda r: -r['delta_gap'])}
