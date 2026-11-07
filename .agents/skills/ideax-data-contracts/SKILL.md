---
name: ideax-data-contracts
description: The JSON and YAML shapes that pass between the IDEA-X pipeline (Suricata ingest, scoring, grouping, Codex tuning, evaluate, guardrail) and the Next.js dashboard. Use whenever code reads or writes original_alerts.json, tuned_groups.json, attack_windows.json, flow_table.json, tuning_run.json, runs/index.json or tuned_rules.yaml, or when wiring UI to data, even if the user only says "the data", "the JSON" or "hook it up".
---

# IDEA-X data contracts

**Status: proposal.** Confirm at kickoff with Adel (ingest), Melvin (policy/tuning) and Faris (labels).
Once agreed, change this file first, then the code. Field names are snake_case. The frontend (`fe/`) reads these through server code or a copy in `fe/public/data/`. Times are seconds on
the demo clock (`t`, float, 0 = start of replay) plus the original ISO timestamp (`ts`).
All scores are computed in the pipeline. The UI only displays them; it never recomputes bands.

## data/derived/original_alerts.json  (owner: Adel → scored by Melvin)
```json
[{ "id": "a-000001", "t": 312.4, "ts": "2017-07-06T09:20:12Z",
   "rule_id": "brute_force@web_server", "rule_name": "Brute force at web server",
   "attack_type": "brute_force", "signature": "ET SCAN ...",
   "src_ip": "172.16.0.1", "dest_ip": "192.168.10.50", "dest_port": 80,
   "target": "192.168.10.50", "service": "web_server", "asset_name": "Web server",
   "A": 3, "C": 2, "score": 5, "band": "Medium", "benign_rule": false,
   "label": "attack", "emailed": false }]
```
`band` ∈ Low | Medium | High. `benign_rule` = the rule is marked benign in base_rules.yaml (this is what runtime scoring uses).
`label` ∈ attack | benign comes from CIC-IDS2017 (`demo.label` in the frozen EVE file): **evaluation only**, never read by scoring or grouping. `emailed` = band is High.
Source: `demo_freeze/eve_demo_FINAL.json` (JSON Lines, frozen). Keep `ts` = `demo.original_timestamp`.

## data/derived/attack_windows.json  (owner: Faris)
```json
[{ "name": "Brute force", "start_t": 300, "end_t": 2700 }]
```

## data/derived/tuned_groups.json  (owner: Melvin)
```json
[{ "group_id": "g-0001", "rule_id": "exploit@win_vista_host", "title": "Exploit on Windows Vista host (192.168.10.8)",
   "key_type": "target", "key": "192.168.10.8", "attack_type": "exploit",
   "alert_ids": ["a-004102", "..."], "first_t": 6070.0, "last_t": 6926.0,
   "base_score": 9, "score": 10, "band": "High", "raised_from": null,
   "benign_rule": false, "label": "attack", "email_t": 6082.5,
   "timeline": [{ "t": 6070.0, "n": 1, "score": 9 }, { "t": 6071.2, "n": 3, "score": 10 }] }]
```
`key_type` = target, or source for scanners. `raised_from` = the band before escalation, or null.
`timeline` lets the replay show the score at any demo-clock time without recomputing.

## runs/<run_id>/flow_table.json  (owner: Melvin; written before Codex runs)
```json
{ "budget_per_hour": 20, "observed_per_hour": 373, "burn_rate": 18.65,
  "rules": [{ "rule_id": "brute_force@web_server", "rule_name": "Brute force at web server",
    "base_score": 5, "evidence": 1.0, "observed_per_hour": 194, "peak_n": 0, "p95_n": 118,
    "allowed_per_hour": 3.2, "gap": 190.8, "direction": "over" }] }
```

## tuning/tuned_rules.yaml  (written by Codex only)
```yaml
rules:
  exploit@win_vista_host:
    window_min: { old: 5, new: 2 }
    n_sat: { old: 60, new: 3 }
    gap: -1.9
    rationale: "Under-alerting for its priority: alert at once, escalate after 3 events."
```

## runs/<run_id>/tuning_run.json  (owner: Melvin; written by the API route / runner)
```json
{ "run_id": "run-003", "started_at": "2026-11-07T13:40:00+07:00", "duration_s": 192,
  "budget_per_hour": 20, "result": "passed",
  "attempts": [{ "n": 1,
    "evaluate": { "before": 5483, "after": 38, "reduction": 0.993,
                  "recall": { "caught": 7, "total": 7 }, "benign_raised": 0 },
    "guardrail": { "passed": false, "checks": [{ "name": "Rules with S ≥ 8 keep W ≤ 5 min", "passed": false, "detail": "exploit@win_vista_host W = 15" }] },
    "changes": [{ "rule_id": "exploit@win_vista_host", "field": "window_min", "old": 5, "new": 15, "gap": -1.9, "reason": "..." }] }],
  "log": [{ "tone": "command", "text": "$ codex exec ..." }, { "tone": "fail", "text": "guardrail FAIL: ..." }] }
```
`result` ∈ passed | failed. `log[].tone` ∈ command | plain | pass | fail.

## runs/index.json  (owner: Melvin)
```json
[{ "run_id": "run-003", "started_at": "...", "budget_per_hour": 20, "attempts": 2, "result": "passed",
   "alerts_before": 5483, "alerts_after": 46, "rules_changed": 8, "recall": { "caught": 7, "total": 7 } }]
```

## Rules

- One rounding rule everywhere: round half up (`floor(x + 0.5)`), in the pipeline only.
- N_sat ≥ 2 always.
- Never delete original alerts; groups reference them by id.
- Runtime scoring and grouping never read `label`; it is carried through only for evaluate() and evaluation displays.
- If a field is unknown, use null, never a made-up value.
