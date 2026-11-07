# Codex task prompt (from the team's design notes, verbatim)

Use this as `tuner/tuning_task.md` (or the agreed path), passed to `codex exec`. Fill in the budget.

```
You are an SRE-style tuning agent for a SIEM. Inputs: base_rules.yaml (attack
weights A, service weights C, current W and N_sat), siem1_results.json (one
record per alert), asset_map.yaml. Budget B = <alerts/hour> given by the operator.

1. Aggregate SIEM I output per rule (attack type x service): volume/hour, peak n
   in W, p95 n. Compute total burn rate = alerts/hour / B.
2. Compute each rule's priority weight w = S x evidence, its allowed share
   B*w/sum(w), and its delta gap = observed - allowed.
3. For positive gaps pick the smallest window W_i whose grouped alerts/hour fit
   the allowed share, and set N_sat_i = p95 n. For negative gaps keep W small and
   increase sensitivity. Never exceed a max W for rules with S >= 8.
4. Write tuned_rules.yaml with, for every change, old value, new value, the gap
   it addresses, and a one-sentence rationale.
5. Run evaluate(tuned_rules.yaml) and read back: alert reduction, attack-group
   recall, benign groups raised. If recall < 100% or any benign group is raised,
   revise and rerun (maximum 3 iterations). Report each iteration.
Constraints: never lower a score below its base S; do not edit anything except
tuned_rules.yaml; output only YAML plus a short report.
```

Notes:
- "SIEM I" = Original rules, `siem1_results.json` may be named `original_alerts.json` in our repo; keep the prompt and file names consistent.
- Send Codex aggregated counts, not raw payloads.
- Save the full stdout as `runs/<id>/codex_log.txt`; the Tuning screen shows it.
