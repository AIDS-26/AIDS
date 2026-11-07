"""Configuration checks only; a clean result is not evaluation acceptance."""

import math


def validate_rules(base_rules, tuned_rules, max_window_high=None):
    errors = []
    valid_max = (type(max_window_high) in (int, float)
                 and math.isfinite(max_window_high) and max_window_high > 0)
    if not valid_max:
        errors.append('Configure an explicit positive max_window_high before validation')
    if not isinstance(tuned_rules, dict):
        return errors + ['Tuned rules must be an object']
    for rule_id, cfg in tuned_rules.items():
        if rule_id not in base_rules:
            errors.append(f'{rule_id}: unknown rule')
            continue
        if not isinstance(cfg, dict):
            errors.append(f'{rule_id}: configuration must be an object')
            continue
        if set(cfg) - {'window_minutes', 'n_sat', 'rationale'}:
            errors.append(f'{rule_id}: unknown or unsupported parameter')
        window = cfg.get('window_minutes')
        valid_window = type(window) in (int, float) and math.isfinite(window) and window > 0
        if not valid_window:
            errors.append(f'{rule_id}: window must be finite and positive')
        n_sat = cfg.get('n_sat')
        if type(n_sat) is not int or n_sat < 2:
            errors.append(f'{rule_id}: n_sat must be >= 2')
        if (valid_max and base_rules[rule_id]['base_score'] >= 8 and valid_window
                and window > max_window_high):
            errors.append(f'{rule_id}: high-severity window exceeds {max_window_high} min')
    return errors
