"""Causal session grouping over scored baseline events; no label/model imports."""

from __future__ import annotations

from collections import deque
from datetime import datetime, timezone

from app.calculation_base.siem2_calculation_base import adjusted_score
from app.calculation_base.siem_1_calculation_base import band
from app.tuning.policy import validate_rules


def instant_us(event):
    stamp = event.get('timestamp_us')
    if type(stamp) is int:
        return stamp
    value = datetime.fromisoformat(event['timestamp'].replace('Z', '+00:00'))
    if value.tzinfo is None:
        raise ValueError('Event timestamp needs a timezone')
    delta = value.astimezone(timezone.utc) - datetime(1970, 1, 1, tzinfo=timezone.utc)
    return (delta.days * 86400 + delta.seconds) * 1_000_000 + delta.microseconds


def correlation(event, policy):
    scanner = event['attack_type'] in policy['scanner_attack_types']
    host = event['src_ip'] if scanner else event['dest_ip']
    if not isinstance(host, str) or not host:
        raise ValueError('Correlation endpoint is missing')
    return ('source' if scanner else 'target', host, event['attack_type'])


def replay(events, rules, base_rules, policy):
    validate_rules(rules, base_rules, policy)
    if len({e['id'] for e in events}) != len(events):
        raise ValueError('Duplicate event identity')
    # Strictest settings across the snapshot's services, fixed before streaming.
    # No future member can retroactively change a session's window or trajectory.
    attack_cfg = {}
    for key, cfg in rules.items():
        attack = base_rules[key]['attack_type']
        old = attack_cfg.get(attack, cfg)
        attack_cfg[attack] = {name: min(old[name], cfg[name]) for name in cfg}
    groups, open_groups = [], {}
    for event in sorted(events, key=lambda e: (instant_us(e), e['source_line'], e['id'])):
        rule_id = event['rule_id']
        if rule_id not in base_rules:
            raise ValueError('Unknown baseline rule')
        metadata = base_rules[rule_id]
        if (event['attack_type'] != metadata['attack_type'] or event['service'] != metadata['service']
                or event['benign_rule'] != metadata['benign_rule']):
            raise ValueError('Event identity differs from baseline rule metadata')
        base = event['base_score']
        if type(base) is not int or not 1 <= base <= 10:
            raise ValueError('Invalid baseline score')
        if type(event['benign_rule']) is not bool:
            raise ValueError('benign_rule must be explicit metadata')
        key, t = correlation(event, policy), instant_us(event)
        cfg = attack_cfg[event['attack_type']]
        window_us = int(cfg['window_minutes'] * 60_000_000)
        immediate = event['attack_type'] in policy['immediate_attack_types']
        group = open_groups.get(key)
        if immediate or group is None or t - group['last_timestamp_us'] >= window_us:
            group = {'group_key': list(key), 'attack_type': event['attack_type'],
                     'rule_id': rule_id, 'service': event['service'],
                     'first_timestamp_us': t, 'last_timestamp_us': t,
                     'base_score': base, 'score': base, 'event_ids': [],
                     'timeline': [], 'window_minutes': cfg['window_minutes'],
                     'n_sat': cfg['n_sat'], 'immediate': immediate, '_times': deque()}
            groups.append(group)
            if not immediate:
                open_groups[key] = group
        queue = group['_times']
        while queue and queue[0] <= t - window_us:
            queue.popleft()
        queue.append(t)
        n = len(queue)
        score = adjusted_score(base, n, cfg['n_sat'], event['benign_rule'])
        group['event_ids'].append(event['id'])
        group['last_timestamp_us'] = t
        group['base_score'] = max(group['base_score'], base)
        group['score'] = max(group['score'], score)
        group['timeline'].append({'event_id': event['id'], 'rule_id': rule_id,
                                  'timestamp_us': t, 'n': n, 'base_score': base,
                                  'score': score, 'alert_score': group['score']})
    for group in groups:
        del group['_times']
        group['event_count'] = len(group['event_ids'])
        group['severity'] = band(group['score'])
    return groups
