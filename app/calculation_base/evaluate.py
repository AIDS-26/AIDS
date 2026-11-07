"""Offline coverage diagnostics; event coverage is not attack-group recall.

Labels are passed separately by trusted evaluation code, keyed by event ID.
No read of labels takes place in scoring or grouping. This helper does not
certify a tuned proposal or replace a defined attack-group recall evaluator.
"""

from collections import Counter
from .siem2_calculation_base import group_events

def evaluate(events, rules, *, labels):
    groups = group_events(events, rules)
    ids = [e['id'] for e in events]
    if len(set(ids)) != len(ids):
        raise ValueError('Event IDs must be unique')
    if set(labels) != set(ids) or any(label not in ('attack', 'benign', 'unconfirmed') for label in labels.values()):
        raise ValueError('Supply one valid evaluation label per event ID')
    counts = Counter(i for group in groups for i in group['event_ids'])
    if counts != Counter(ids):
        raise ValueError('Grouping must preserve every event exactly once')
    attack_ids = {i for i in ids if labels[i] == 'attack'}
    covered = set(counts)
    benign_raised = sum(1 for g in groups
                        if all(labels[i] == 'benign' for i in g['event_ids'])
                        and g['score'] > g['base_score'])
    return {'baseline_alerts': len(events), 'grouped_alerts': len(groups),
            'reduction_pct': round(100 * (1 - len(groups) / len(events)), 2) if events else None,
            'attack_event_coverage': len(covered & attack_ids) / len(attack_ids) if attack_ids else None,
            'attack_group_recall': None,
            'acceptance_status': 'not_certified',
            'benign_groups_raised': benign_raised,
            'baseline_high': sum(e['base_score'] >= 8 for e in events),
            'grouped_high': sum(g['score'] >= 8 for g in groups),
            'groups': groups}
