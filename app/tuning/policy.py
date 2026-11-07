"""Explicit operator policy and the supported rule document (JSON-form YAML 1.2)."""

from __future__ import annotations

import json
import math
from pathlib import Path


def positive(value, name):
    if type(value) not in (int, float) or not math.isfinite(value) or value <= 0:
        raise ValueError(f'{name} must be finite and positive')
    return value


def exact_object(value, fields, name):
    if not isinstance(value, dict) or set(value) != set(fields):
        raise ValueError(f'{name} requires exactly: {", ".join(sorted(fields))}')


def parse_document(source):
    """Only JSON-form YAML 1.2, without tags, aliases, duplicates or NaN."""
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f'Duplicate document key: {key}')
            result[key] = value
        return result
    return json.loads(source, object_pairs_hook=unique,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Non-finite JSON')))


def load_document(path):
    return parse_document(Path(path).read_text(encoding='utf-8-sig'))


def validate_policy(policy):
    fields = {'budget_per_hour', 'initial_window_minutes', 'initial_n_sat',
              'candidate_windows_minutes', 'n_sat_max', 'max_window_high',
              'scanner_attack_types', 'immediate_attack_types', 'group_lifetime',
              'cross_service', 'retention', 'benign_evaluation',
              'attack_evidence', 'other_evidence', 'evidence_provenance'}
    exact_object(policy, fields, 'policy')
    for name in ('budget_per_hour', 'initial_window_minutes', 'max_window_high'):
        positive(policy[name], name)
    for name in ('initial_n_sat', 'n_sat_max'):
        if type(policy[name]) is not int or not 2 <= policy[name] <= 2147483647:
            raise ValueError(f'{name} must be an integer from 2 to 2147483647')
    if policy['initial_n_sat'] > policy['n_sat_max']:
        raise ValueError('initial_n_sat exceeds n_sat_max')
    windows = policy['candidate_windows_minutes']
    if not isinstance(windows, list) or not windows:
        raise ValueError('Supply candidate_windows_minutes')
    for window in windows:
        positive(window, 'candidate window')
        if window * 60_000_000 < 1 or window * 60_000_000 > 2**53:
            raise ValueError('Window must fit replay microsecond precision')
    if windows != sorted(set(windows)) or policy['initial_window_minutes'] not in windows:
        raise ValueError('Candidate windows must be unique, ascending, and include initial W')
    if min(windows) > policy['max_window_high']:
        raise ValueError('No supported high-severity candidate window')
    for name in ('scanner_attack_types', 'immediate_attack_types'):
        values = policy[name]
        if (not isinstance(values, list) or any(not isinstance(v, str) or not v.strip() for v in values)
                or len(values) != len(set(values))):
            raise ValueError(f'{name} must contain unique attack type names')
    semantics = {'group_lifetime': 'session-open-left',
                 'cross_service': 'strictest-attack-settings',
                 'retention': 'all-members-at-baseline',
                 'benign_evaluation': 'any-benign-member-raised'}
    for name, supported in semantics.items():
        if policy[name] != supported:
            raise ValueError(f'{name}: supported policy is {supported}')
    for name in ('attack_evidence', 'other_evidence'):
        value = policy[name]
        if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 1:
            raise ValueError(f'{name} must be finite from 0 to 1')
    if not isinstance(policy['evidence_provenance'], str) or not policy['evidence_provenance'].strip():
        raise ValueError('Supply evidence_provenance')
    return policy


def validate_rules(rules, base_rules, policy):
    validate_policy(policy)
    exact_object(rules, base_rules, 'rules (complete rule coverage required)')
    for rule_id, cfg in rules.items():
        exact_object(cfg, {'window_minutes', 'n_sat'}, rule_id)
        window = positive(cfg['window_minutes'], 'window_minutes')
        if window not in policy['candidate_windows_minutes']:
            raise ValueError(f'{rule_id}: unsupported window')
        if type(cfg['n_sat']) is not int or not 2 <= cfg['n_sat'] <= policy['n_sat_max']:
            raise ValueError(f'{rule_id}: invalid saturation')
        if base_rules[rule_id]['base_score'] >= 8 and window > policy['max_window_high']:
            raise ValueError(f'{rule_id}: high-severity window exceeds configured maximum')
    return rules


def initial_rules(base_rules, policy):
    validate_policy(policy)
    result = {key: {'window_minutes': policy['initial_window_minutes'],
                    'n_sat': policy['initial_n_sat']} for key in base_rules}
    return validate_rules(result, base_rules, policy)


def proposal_rules(proposal, base_rules, policy):
    """Only W/N_sat are writable. Audit is generated by trusted code."""
    exact_object(proposal, {'rules'}, 'proposal')
    exact_object(proposal['rules'], base_rules, 'proposal rules')
    rules, reasons = {}, {}
    for key, cfg in proposal['rules'].items():
        exact_object(cfg, {'window_minutes', 'n_sat', 'rationale'}, key)
        if not isinstance(cfg['rationale'], str) or not 1 <= len(cfg['rationale'].strip()) <= 1000:
            raise ValueError('Each rule requires a rationale of 1-1000 characters')
        rules[key] = {name: cfg[name] for name in ('window_minutes', 'n_sat')}
        reasons[key] = cfg['rationale']
    validate_rules(rules, base_rules, policy)
    return rules, reasons
