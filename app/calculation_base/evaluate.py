from .siem2 import group_events

def evaluate(events, rules):
    groups = group_events(events, rules)
    attack_ids = {e['id'] for e in events if e['label'] == 'attack'}
    covered = set().union(*(set(g['event_ids']) for g in groups if g['contains_attack'])) if groups else set()
    benign_raised = sum(1 for g in groups if g['benign'] and g['score'] > g['base_score'])
    return {'baseline_alerts': len(events), 'grouped_alerts': len(groups),
            'reduction_pct': round(100 * (1 - len(groups) / len(events)), 2) if events else 0,
            'attack_event_coverage': len(covered & attack_ids) / len(attack_ids) if attack_ids else 1.0,
            'benign_groups_raised': benign_raised,
            'baseline_high': sum(e['base_score'] >= 8 for e in events),
            'grouped_high': sum(g['score'] >= 8 for g in groups),
            'groups': groups}
