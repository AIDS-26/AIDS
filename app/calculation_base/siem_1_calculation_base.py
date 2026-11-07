import ipaddress
import json
from datetime import datetime
from pathlib import Path

def base_score(a, c):
    return min(10, a + c)

def band(score):
    return 'High' if score >= 8 else 'Medium' if score >= 5 else 'Low'

def load_events(path):
    with open(path, encoding='utf-8') as f:
        for line in f:
            if line.strip():
                event = json.loads(line)
                if event.get('event_type') == 'alert':
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
    try:
        address = ipaddress.ip_address(ip)
        matches = [r for r in mapping['rules'] if address in ipaddress.ip_network(r['cidr'], strict=False)]
        if matches:
            return max(matches, key=lambda r: ipaddress.ip_network(r['cidr'], strict=False).prefixlen)
    except (ValueError, TypeError):
        pass
    return {'service': 'Unmapped service', 'weight': 0}

def score_events(events, attack_mapping, service_mapping):
    result = []
    for i, event in enumerate(events):
        attack = map_attack(event, attack_mapping)
        service = map_service(event.get('dest_ip'), service_mapping)
        score = base_score(attack['weight'], service['weight'])
        label = event.get('demo', {}).get('label', 'unconfirmed').lower()
        result.append({
            'id': i, 'timestamp': event['timestamp'],
            'src_ip': event.get('src_ip'), 'dest_ip': event.get('dest_ip'),
            'signature': event.get('alert', {}).get('signature'),
            'attack_type': attack['attack_type'], 'service': service['service'],
            'attack_weight': attack['weight'], 'service_weight': service['weight'],
            'base_score': score, 'severity': band(score), 'label': label,
            'evidence': 1.0 if label == 'attack' else 0.2,
        })
    return result
