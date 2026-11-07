from .siem2_calculation_base import group_events
from tuner.rules import to_siem2_settings

def evaluate(events, rules, default_window=5, default_n_sat=60):
    groups = group_events(events, rules, default_window, default_n_sat)
    attack_ids = {e['id'] for e in events if e['label'] == 'attack'}
    covered = {event_id for group in groups for event_id in group['event_ids']}
    labels = {event['id']: event['label'] for event in events}
    benign_raised = sum(
        1 for group in groups
        if group['event_ids'] and all(labels[event_id] == 'benign' for event_id in group['event_ids'])
        and group['score'] > group['base_score']
    )
    return {'baseline_alerts': len(events), 'grouped_alerts': len(groups),
            'reduction_pct': round(100 * (1 - len(groups) / len(events)), 2) if events else 0,
            'attack_event_coverage': len(covered & attack_ids) / len(attack_ids) if attack_ids else None,
            'benign_groups_raised': benign_raised,
            'baseline_high': sum(e['base_score'] >= 8 for e in events),
            'grouped_high': sum(g['score'] >= 8 for g in groups),
            'groups': groups}


def evaluate_with_yaml(events, snapshot, attack_path, service_path):
    """Evaluate Adel's SIEM II result using validated YAML settings."""
    rules, window, n_sat = to_siem2_settings(snapshot, attack_path, service_path)
    return evaluate(events, rules, window, n_sat)
