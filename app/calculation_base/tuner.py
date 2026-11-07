# Deterministic initial candidate, intended to be reviewed/revised by Codex.
# The budget-aware smallest-feasible-window search is a next step, not implemented here.
def propose_initial_rules(flow_report):
    proposals = {}
    for r in flow_report['rules']:
        gap = r['delta_gap']
        if gap is None:
            raise ValueError('Cannot propose tuning with an undefined budget allocation')
        window = 5 if gap > 0 else 1
        if r['base_score'] >= 8:
            window = min(window, 5)
        proposals[r['rule_id']] = {
            'window_minutes': window,
            'n_sat': 60 if gap > 0 else 2,
            'rationale': 'Initial heuristic only; requires Codex analysis and evaluation',
        }
    return proposals
