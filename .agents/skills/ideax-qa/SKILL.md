---
name: ideax-qa
description: QA checklist for IDEA-X, covering the tuned grouping output (nothing lost, never below base, benign stays put, group keys, N_sat, rounding, window edges) and the dashboard numbers against evaluate() before the demo. Use when checking pipeline output, reviewing a PR that touches scoring or grouping, verifying the UI shows correct numbers, or preparing for judging, even if the user only says "check it", "QA", "does it add up" or "sanity check".
---

# IDEA-X QA

Run these as code-level assertions where possible (a small Python test file), and report each as pass/fail with the evidence.

## Tuned output (policy layer + incidents)

1. **Nothing lost.** Every original alert id appears in exactly one group. Σ group sizes = original count (5,483 on the sample).
2. **Never below base.** For every group, score ≥ base score of its events.
3. **Benign stays put.** Every benign group keeps its base score. Benign groups raised = 0.
3b. **No labels at runtime.** Scoring and grouping code never reads `label` / `demo.label` (grep the code; add a test that shuffling labels doesn't change tuned scores).
4. **Group keys.** Scanners (port scan, ping sweep) grouped by source + attack type; all others by target + attack type.
5. **N_sat ≥ 2** for every rule (ln 1 = 0 would divide by zero).
6. **Rounding.** One rule: round half up. Python `round(4.5)` = 4 and JS `Math.round(4.5)` = 5 would disagree; only the pipeline computes scores.
7. **Window semantics** match the agreed definition (see docs/HANDOFF.md open question 2), including the event exactly W minutes later.
8. **Serious rules stay fast.** Rules with S ≥ 8 have W ≤ the agreed max.
9. **Only tuned_rules.yaml changed** by the Codex run (git diff of the run).
10. **Formula spot checks:** S=5, N_sat=60: n=1 → 5, n=8 → 8, n=60 → 10. S=3, N_sat=60: n=2 → 4 (stays Low).

## Dashboard numbers

1. Every number on the Replay, Tuning and Audit screens equals the run artifacts (`evaluate`, `flow_table`, `tuning_run`). Note the run id on screen.
2. Final counts at the end of the replay equal `evaluate()` totals (before, after, High groups, emails).
3. KPI "benign groups raised" shows 0 and is green; if not 0, it must show red, not hidden.
4. Failed attempts and failed runs are visible.
5. The labels notice is visible on Replay (labels grade results only; benign at runtime comes from the rule).
6. Replay at 60× / 120× / 360× gives the same final numbers.
7. If the live "Run tuning" fails or times out, the screen falls back to the last saved run and says so.

## Before 16:30

- No `[placeholder]` left in UI, README or deck.
- A screen recording of the full demo exists on the presenting laptop.
- Repo is public and runs from a clean clone with the README steps.
