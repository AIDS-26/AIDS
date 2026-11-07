def validate_rules(base_rules, tuned_rules, max_window_high=5):
    errors = []
    for rule_id, cfg in tuned_rules.items():
        if rule_id not in base_rules:
            errors.append(f'{rule_id}: unknown rule')
            continue
        if int(cfg.get('window_minutes', 0)) < 1:
            errors.append(f'{rule_id}: window must be >= 1')
        if int(cfg.get('n_sat', 0)) < 2:
            errors.append(f'{rule_id}: n_sat must be >= 2')
        if base_rules[rule_id]['base_score'] >= 8 and int(cfg.get('window_minutes', 0)) > max_window_high:
            errors.append(f'{rule_id}: high-severity window exceeds {max_window_high} min')
    return errors
