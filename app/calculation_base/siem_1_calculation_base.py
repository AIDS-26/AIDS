"""Deterministic original-rule scoring; no evaluation labels in runtime output."""

import ipaddress
import json

def _weight(value, name, minimum=0):
    if type(value) is not int or not minimum <= value <= 10:
        raise ValueError(f'{name} must be an integer from {minimum} to 10')
    return value


def validate_mappings(attack_mapping, service_mapping):
    """Reject invalid configuration before a replay writes any results."""
    if not isinstance(attack_mapping.get('rules'), list) or not isinstance(service_mapping.get('rules'), list):
        raise ValueError('Mappings require rules arrays')
    for rule in [*attack_mapping['rules'], attack_mapping['fallback']]:
        _weight(rule['weight'], 'attack weight', 1)
        if not isinstance(rule.get('attack_type'), str) or not rule['attack_type'].strip():
            raise ValueError('attack_type must be nonempty')
        if 'benign_rule' in rule and type(rule['benign_rule']) is not bool:
            raise ValueError('benign_rule must be boolean')
        match = rule.get('match', {})
        if not isinstance(match, dict) or set(match) - {'category_exact', 'signature_contains'}:
            raise ValueError('Unsupported attack matching configuration')
        for patterns in match.values():
            if not isinstance(patterns, list) or any(not isinstance(p, str) or not p for p in patterns):
                raise ValueError('Match patterns must be nonempty strings in arrays')
    networks = set()
    for rule in [*service_mapping['rules'], service_mapping['default']]:
        _weight(rule['weight'], 'service weight')
        if not isinstance(rule.get('service'), str) or not rule['service'].strip():
            raise ValueError('service must be nonempty')
        if 'cidr' in rule:
            network = ipaddress.ip_network(rule['cidr'], strict=True)
            if network in networks:
                raise ValueError('Duplicate asset CIDR')
            networks.add(network)

def base_score(a, c):
    _weight(a, 'attack weight', 1)
    _weight(c, 'service weight')
    return min(10, a + c)

def band(score):
    return 'High' if score >= 8 else 'Medium' if score >= 5 else 'Low'

def load_events(path):
    with open(path, encoding='utf-8') as f:
        for line in f:
            if line.strip():
                event = json.loads(line)
                if event.get('event_type') == 'alert':
                    event.pop('demo', None)
                    yield event

def map_attack(event, mapping):
    alert = event.get('alert', {})
    sig = alert.get('signature', '').lower()
    cat = alert.get('category', '').lower()
    for rule in mapping['rules']:
        match = rule.get('match', {})
        if (cat in [x.lower() for x in match.get('category_exact', [])]
                or any(x.lower() in sig for x in match.get('signature_contains', []))):
            return rule
    return mapping['fallback']

def map_service(ip, mapping):
    if ip is not None:
        address = ipaddress.ip_address(ip)
        matches = [r for r in mapping['rules'] if address in ipaddress.ip_network(r['cidr'], strict=False)]
        if matches:
            return max(matches, key=lambda r: ipaddress.ip_network(r['cidr'], strict=False).prefixlen)
    return mapping['default']

def score_events(events, attack_mapping, service_mapping):
    validate_mappings(attack_mapping, service_mapping)
    result = []
    for i, event in enumerate(events):
        attack = map_attack(event, attack_mapping)
        service = map_service(event.get('dest_ip'), service_mapping)
        score = base_score(attack['weight'], service['weight'])
        result.append({
            'id': event.get('id', i), 'timestamp': event['timestamp'],
            'source_line': event.get('source_line', i + 1),
            'timestamp_us': event.get('timestamp_us'),
            'src_ip': event.get('src_ip'), 'dest_ip': event.get('dest_ip'),
            'signature': event.get('alert', {}).get('signature'),
            'attack_type': attack['attack_type'], 'service': service['service'],
            'attack_weight': attack['weight'], 'service_weight': service['weight'],
            'base_score': score, 'severity': band(score),
            'benign_rule': attack.get('benign_rule', attack.get('severity_override') == 'S'),
        })
    return result
