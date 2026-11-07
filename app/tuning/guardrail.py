"""The deterministic acceptance gate; no approval workflow."""

from app.tuning.policy import validate_rules
from app.tuning.replay import correlation, instant_us


def check(events, groups, rules, base_rules, policy, evaluation):
    errors = []
    try:
        validate_rules(rules, base_rules, policy)
    except ValueError as error:
        errors.append(str(error))
    original = {e['id']: e for e in events}
    for group in groups:
        members = [original[i] for i in group['event_ids'] if i in original]
        if any(list(correlation(e, policy)) != group['group_key'] for e in members):
            errors.append('Correlation key changed or unrelated events merged')
        if members and (group['first_timestamp_us'] != min(instant_us(e) for e in members)
                        or group['last_timestamp_us'] != max(instant_us(e) for e in members)):
            errors.append('Group visibility timestamps do not match evidence')
        if group['attack_type'] in policy['immediate_attack_types'] and len(members) != 1:
            errors.append('Immediate exploit alerts must never merge')
        if members and group['score'] < max(e['base_score'] for e in members):
            errors.append('Alert score downgraded a member')
    if evaluation['acceptance_status'] != 'passed':
        errors.append('Evaluation requires a nonempty attack denominator, full retention, known labels, and zero benign raised')
    errors.extend(evaluation['integrity_errors'])
    if evaluation['alert_reduction'] is None or evaluation['alert_reduction'] <= 0:
        errors.append('Candidate does not reduce analyst alert count')
    return {'passed': not errors, 'errors': sorted(set(errors)),
            'remaining_budget_gap': evaluation['remaining_budget_gap'],
            'budget_met': evaluation['remaining_budget_gap'] == 0}
