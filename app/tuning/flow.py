"""Delta-gap allocation and deterministic candidate-window search."""

from collections import Counter, defaultdict
from math import ceil, isfinite

from app.tuning.replay import replay, instant_us
from app.tuning.policy import positive, validate_rules


def window_statistics(events, rules, base_rules, policy):
    groups = replay(events, rules, base_rules, policy)
    counts, group_counts = defaultdict(list), Counter()
    for group in groups:
        touched = set()
        for point in group['timeline']:
            counts[point['rule_id']].append(point['n'])
            touched.add(point['rule_id'])
        group_counts.update(touched)
    return {key: {'peak_n': max(values), 'p95_n': sorted(values)[ceil(.95 * len(values)) - 1],
                   'grouped_count': group_counts[key]} for key, values in counts.items()}


def search(events, base_rules, initial, policy, evidence, observation_seconds):
    positive(observation_seconds, 'observation_seconds')
    validate_rules(initial, base_rules, policy)
    if set(evidence) != set(base_rules) or {e['rule_id'] for e in events} != set(base_rules):
        raise ValueError('Flow requires exact observed rule/evidence coverage')
    if any(type(v) not in (int, float) or not isfinite(v) or not 0 <= v <= 1 for v in evidence.values()):
        raise ValueError('Evidence aggregates must be finite values from 0 to 1')
    if events and max(instant_us(e) for e in events) - min(instant_us(e) for e in events) > observation_seconds * 1e6:
        raise ValueError('Observation duration is shorter than event span')
    hours, budget = observation_seconds / 3600, policy['budget_per_hour']
    buckets = defaultdict(list)
    for e in events:
        buckets[e['rule_id']].append(e)
    priorities = {key: cfg['base_score'] * evidence[key] for key, cfg in base_rules.items()}
    total = sum(priorities.values())
    rows, suggested = [], {}
    for key, cfg in base_rules.items():
        own, trials = buckets[key], []
        allowed = budget * priorities[key] / total if total else None
        observed = len(own) / hours
        gap = observed - allowed if allowed is not None else None
        for window in policy['candidate_windows_minutes']:
            if cfg['base_score'] >= 8 and window > policy['max_window_high']:
                continue
            candidate = {key: {'window_minutes': window, 'n_sat': initial[key]['n_sat']}}
            stats = window_statistics(own, candidate, {key: cfg}, policy)[key]
            trials.append({'window_minutes': window, **stats,
                           'grouped_per_hour': stats['grouped_count'] / hours,
                           'n_sat': max(2, min(policy['n_sat_max'], stats['p95_n']))})
        if gap is not None and gap <= 0:
            choice = trials[0]
        else:
            choice = next((t for t in trials if allowed is not None and t['grouped_per_hour'] <= allowed),
                          min(trials, key=lambda t: (t['grouped_count'], t['window_minutes'])))
        suggested[key] = {'window_minutes': choice['window_minutes'],
                          'n_sat': min(initial[key]['n_sat'], choice['n_sat']) if gap is not None and gap <= 0
                          else choice['n_sat']}
        initial_stats = next(t for t in trials if t['window_minutes'] == initial[key]['window_minutes'])
        rows.append({'rule_id': key, 'attack_type': cfg['attack_type'], 'service': cfg['service'],
                     'base_score': cfg['base_score'], 'evidence': evidence[key],
                     'priority_weight': priorities[key], 'event_count': len(own),
                     'observed_per_hour': observed, 'allowed_per_hour': allowed, 'delta_gap': gap,
                     'window_minutes': initial[key]['window_minutes'],
                     'peak_n': initial_stats['peak_n'], 'p95_n': initial_stats['p95_n'],
                     'candidates': trials,
                     'suggested_remaining_gap': max(0, choice['grouped_per_hour'] - allowed) if allowed is not None else None,
                     'percentile_method': 'nearest-rank per-event rolling (t-W,t] counts'})
    report = {'budget_per_hour': budget, 'observation_seconds': observation_seconds,
              'observed_per_hour': len(events) / hours, 'burn_rate': len(events) / hours / budget,
              'allocation_status': 'allocated' if total else 'zero_priority_weight',
              'evidence_provenance': policy['evidence_provenance'], 'rules': rows,
              'candidate_scope': 'isolated per-rule search; final joint replay uses strictest attack settings; shared groups counted once per participating rule'}
    return report, suggested
