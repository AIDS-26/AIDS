"""Trusted offline evaluation. Never imported by runtime replay."""

from __future__ import annotations

from collections import Counter, defaultdict
import math

from app.tuning.policy import exact_object
from app.tuning.replay import instant_us


def define_attack_groups(events, labels, *, silence_minutes):
    """Fixed evaluation sessions independent of candidate W and N_sat."""
    if type(silence_minutes) not in (int, float) or not math.isfinite(silence_minutes) or silence_minutes <= 0:
        raise ValueError('Evaluation silence_minutes must be explicitly positive')
    groups, current = [], {}
    for e in sorted(events, key=lambda e: (instant_us(e), e['source_line'], e['id'])):
        if labels[e['id']] != 'attack':
            continue
        key = (e['src_ip'], e['dest_ip'], e['attack_type'])
        t = instant_us(e)
        old = current.get(key)
        if old is None or t - old[0] >= silence_minutes * 60_000_000:
            group = {'id': f'attack-{len(groups) + 1}', 'event_ids': []}
            groups.append(group)
        else:
            group = old[1]
        group['event_ids'].append(e['id'])
        current[key] = (t, group)
    return groups


class Scorecard:
    """Holds individual evaluation metadata privately; returns aggregates only."""

    def __init__(self, events, labels, groups, *, provenance, definition):
        ids = {e['id'] for e in events}
        if len(ids) != len(events) or set(labels) != ids:
            raise ValueError('Require one label for every unique baseline event')
        if any(v not in ('attack', 'benign', 'unconfirmed') for v in labels.values()):
            raise ValueError('Invalid evaluation label')
        if not isinstance(provenance, str) or not provenance.strip():
            raise ValueError('Evaluation provenance is required')
        self._labels = dict(labels)
        self._groups = groups
        self.provenance, self.definition = provenance, definition
        if groups is not None:
            seen, names = [], set()
            if not isinstance(groups, list):
                raise ValueError('Attack groups must be a list')
            for group in groups:
                exact_object(group, {'id', 'event_ids'}, 'attack group')
                if not isinstance(group['id'], str) or not group['id'] or group['id'] in names:
                    raise ValueError('Attack group IDs must be unique nonempty strings')
                names.add(group['id'])
                if (not isinstance(group['event_ids'], list) or not group['event_ids']
                        or any(type(i) is not int for i in group['event_ids'])):
                    raise ValueError('Attack group requires nonempty integer event_ids')
                seen.extend(group['event_ids'])
            attack_ids = [i for i in ids if labels[i] == 'attack']
            if Counter(seen) != Counter(attack_ids):
                raise ValueError('Independent attack groups must partition all attack-labeled events exactly once')

    def evidence(self, events, policy):
        buckets = defaultdict(list)
        for e in events:
            buckets[e['rule_id']].append(policy['attack_evidence'] if self._labels[e['id']] == 'attack'
                                          else policy['other_evidence'])
        return {key: sum(values) / len(values) for key, values in buckets.items()}

    def evaluate(self, events, groups, *, observation_seconds, budget):
        original = {e['id']: e for e in events}
        counts = Counter(i for g in groups for i in g['event_ids'])
        trajectory = {}
        errors = []
        if counts != Counter(original.keys()):
            errors.append('Every source event must belong to exactly one alert')
        benign_raised = 0
        rule_feedback = defaultdict(lambda: {'benign_events': 0, 'benign_events_raised': 0,
                                            'attack_events': 0, 'unconfirmed_events': 0})
        for group in groups:
            timeline = group['timeline']
            if Counter(p['event_id'] for p in timeline) != Counter(group['event_ids']):
                errors.append('Trajectory must match evidence membership')
            raised = False
            peak = 0
            for p in timeline:
                event = original.get(p['event_id'])
                if event is None:
                    errors.append('Unknown trajectory event')
                    continue
                trajectory[p['event_id']] = p
                base, score = event['base_score'], p['score']
                aggregate = rule_feedback[event['rule_id']]
                evaluation_label = self._labels[event['id']]
                if evaluation_label == 'attack':
                    aggregate['attack_events'] += 1
                elif evaluation_label == 'unconfirmed':
                    aggregate['unconfirmed_events'] += 1
                else:
                    aggregate['benign_events'] += 1
                    aggregate['benign_events_raised'] += score > base
                if type(score) is not int or not base <= score <= 10:
                    errors.append('Per-event score floor/cap violated')
                peak = max(peak, score)
                if p['alert_score'] != peak:
                    errors.append('Alert trajectory must preserve the peak score so far')
                if event['benign_rule'] and score != base:
                    errors.append('Runtime benign rule escalated')
                if self._labels[event['id']] == 'benign' and score > base:
                    raised = True
            if timeline and group['score'] != peak:
                errors.append('Alert summary must match its score trajectory')
            benign_raised += raised
        total = len(self._groups) if self._groups is not None else 0
        retained = sum(all(counts[i] == 1 and i in trajectory
                           and original[i]['base_score'] <= trajectory[i]['score'] <= 10
                           and trajectory[i]['alert_score'] >= original[i]['base_score']
                           for i in g['event_ids']) for g in (self._groups or []))
        recall = retained / total if total else None
        unconfirmed = sum(v == 'unconfirmed' for v in self._labels.values())
        hours = observation_seconds / 3600
        before, after = len(events), len(groups)
        reduction = 1 - after / before if before else None
        passed = not errors and total > 0 and retained == total and benign_raised == 0 and unconfirmed == 0
        return {'baseline_alerts': before, 'grouped_alerts': after,
                'alert_reduction': reduction, 'reduction_pct': reduction * 100 if reduction is not None else None,
                'observed_per_hour': before / hours, 'grouped_per_hour': after / hours,
                'budget_per_hour': budget, 'burn_rate': before / hours / budget,
                'grouped_burn_rate': after / hours / budget,
                'remaining_budget_gap': max(0, after / hours - budget),
                'baseline_high': sum(e['base_score'] >= 8 for e in events),
                'grouped_high': sum(g['score'] >= 8 for g in groups),
                'attack_groups_total': total, 'attack_groups_retained': retained,
                'attack_group_recall': recall, 'benign_groups_raised': benign_raised,
                'unconfirmed_events': unconfirmed, 'integrity_errors': sorted(set(errors)),
                'per_rule_feedback': dict(rule_feedback),
                'acceptance_status': 'passed' if passed else 'not_certified',
                'label_provenance': self.provenance, 'attack_group_definition': self.definition,
                'retention_definition': 'all members visible at their baseline score or higher; splits/merges allowed',
                'benign_definition': 'any benign-labeled member raised above its own baseline, including mixed groups',
                'recall_scope': 'curated-label evidence retention; not independent detection recall'}
