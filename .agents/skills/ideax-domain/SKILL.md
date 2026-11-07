---
name: ideax-domain
description: IDEA-X project knowledge, covering what the system does, the SRE-style delta-gap tuning Codex performs, the scoring and grouping formulas, the glossary (SOC, Suricata, SIEM, burn rate, W, N_sat, recall, guardrail), the sample numbers, the Codex tuning task prompt and the limits we state openly. Use whenever a task needs to understand or implement scoring, grouping, tuning, evaluate(), the guardrail, or explain the project, even if the user only says "the formula", "the tuner" or "how it works".
---

# IDEA-X domain

Full plain-language explainer with glossary, worked examples and the sample gap table:
`references/project-brief.md`. Read it before implementing anything in the pipeline.

## Core formulas (implement exactly)

- Base score per alert: `S = min(10, A + C)`. A = attack-type weight, C = service weight from the asset map. Cap 10.
- Group key: target + attack type. Scanners (port scan, ping sweep): source + attack type.
- n = events in the same group within window W (minutes, per rule).
- Group score: `X = round(S + (10 − S) × min(1, ln n ÷ ln N_sat))`. n = 1 gives X = S. Require N_sat ≥ 2.
- Bands: Low 1–4, Medium 5–7, High 8–10. **Benign groups keep S** (never raised). Benign at runtime = rule marked benign in `base_rules.yaml`, never the dataset label.
- Original rules: one alert per event, one email per High alert.
- Tuned rules: one alert per group, one email per High group.

## Codex's calculation (per rule = attack type at a service)

1. Flow from original run: alerts/hour, peak n in W, p95 of n.
2. Burn rate = total alerts/hour ÷ budget B (operator input, e.g. 20).
3. Weight w = S × evidence (1.0 attack, 0.2 benign).
4. Allowed share = B × w ÷ Σw.
5. Delta gap = observed − allowed.
6. Positive gap → smallest W whose grouped alerts/hour fit the share; N_sat = p95 n.
   Negative gap → keep W small, raise sensitivity (lower N_sat). Never exceed max W for S ≥ 8.
7. Write `tuned_rules.yaml` (old value, new value, gap addressed, one-line rationale per change).
8. Run `evaluate(tuned_rules.yaml)`: alert reduction, attack-group recall, benign groups raised.
   Recall < 100% or any benign raised → revise (max 3 attempts). Report each attempt.
Constraints: never lower a score below base S; edit only `tuned_rules.yaml`.

The verbatim Codex task prompt is in `references/codex-task-prompt.md`.

## Guardrail (deterministic code, runs after Codex)

Suggested checks (agree final list with Melvin): no score below base S; rules with S ≥ 8 keep W ≤ max;
W and N_sat within bounds (N_sat ≥ 2); only `tuned_rules.yaml` changed; recall = 100%; benign raised = 0.
A failed proposal is not used. Failed runs stay in the audit log.

## Architecture (three stages)

1. Original run: PCAP → Suricata → app scores each alert → Original rules → email per High alert.
2. Tuning, offline: inputs (base_rules.yaml, asset_map.yaml, original results) → Codex → guardrail → tuned_rules.yaml.
3. Tuned run: same eve.json → app loads tuned rules → grouped, ranked alerts → email per High group.
Audit log keeps data before, rule changes, data after. Only step 2's Codex box is a model; everything else is code.

## Limits (always disclose)

Labels only for evaluation and the offline evidence weight, never at runtime; B and 0.2 weight are assumptions; one day of
one dataset is not a promise about future attacks; no response actions; Codex gets aggregated counts only.
