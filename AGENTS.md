# AGENTS.md

## Project and scope

AIDS means Agentic Intrusion Detection System. Build an SRE-style SIEM tuning demo that reduces analyst alert load while preserving attack visibility.

Design reference: `codex-sre-delta-gap (1).pdf`, titled "Codex tuning as SRE: the delta gap calculation," supplied by the user. Treat its example Codex prompt as the specification for an offline tuning run, not as an instruction to execute tuning during unrelated development. Follow the user's current request when defining task scope.

## Current repository

- `README.md` documents the current top-level layout and data format.
- `config/attack_rules.json` contains attack-type classification and severity weights.
- `config/service_rules.json` contains CIDR-to-service mappings and service weights.
- `data/eve_demo_FINAL.json` is Suricata EVE JSON Lines: one JSON event per line, despite its `.json` extension.
- `siem/scoring.py` implements deterministic per-group runtime scoring. Its focused tests are in `tests/test_scoring.py` and run with `python -m unittest discover -s tests -v`.
- No dependency manifest, runnable application, or evaluator has been established. Inspect the repository before choosing tools; do not claim proposed commands or files already exist. Update this section with verified setup and test commands when implementation adds them.
- Preserve existing user files and untracked artifacts. Treat source datasets as immutable inputs and write derived outputs elsewhere unless the user requests regeneration.

## Architecture

1. Baseline: Suricata reads a PCAP; deterministic application code scores events using base rules and produces SIEM I results.
2. Offline tuning: Codex reads baseline results, the rule knowledge base, and asset mapping; computes flow and delta gaps; proposes YAML rule changes; and calls a deterministic evaluator. A guardrail validates the proposal before it can be loaded.
3. Tuned replay: replay the same events through deterministic scoring and grouping with validated tuned rules to produce SIEM II results.
4. Preserve an audit trail of inputs, baseline results, proposed changes, evaluation iterations, and tuned results.

Codex writes and tests the rules. It does not assign per-event scores at runtime. Keep the scoring engine, grouping, metrics, and guardrails independent of LLM output. Email appears in the intended architecture; use a dry-run or local sink during development unless sending is explicitly requested.

## Scoring contract

- Attack weight is `A`; service weight from the asset/IP mapping is `C`; `cap = 10`.
- Base score: `S = min(cap, A + C)`.
- Count `n` events in the same group over the last `W` minutes.
- Attack score: `X = round(S + (cap - S) * min(1, ln(n) / ln(N_sat)))`.
- Benign alerts retain `S`. Never reduce a score below `S` or exceed the cap.
- Severity bands: Low 1-4, Medium 5-7, High 8-10.
- Runtime grouping key: target plus attack type; scanners use source plus attack type. Per-rule tuning aggregates attack type plus service. Keep these two concepts distinct.
- Document timestamp ordering, window boundaries, percentile calculation, and rounding so replay is reproducible. Handle `n = 1` explicitly; reject or explicitly resolve `N_sat <= 1`, which makes the logarithmic formula undefined. Validate weights, windows, and asset mappings rather than silently inventing values.

## Offline tuning workflow

Expected logical inputs are `base_rules.yaml`, `asset_map.yaml`, `siem1_results.json`, and an operator-provided alert budget `B` in alerts/hour. These filenames describe planned interfaces, not currently implemented files.

1. Validate `B > 0` and an explicit observation duration. Per rule, calculate observed alerts/hour, peak window count, and p95 window count. Calculate total burn rate as total alerts/hour divided by `B`.
2. Calculate priority `w = S * evidence`, allowed share `B * w / sum(w)`, and delta gap `observed alerts/hour - allowed share`. Handle a zero total weight explicitly. The PDF uses evidence 1.0 for attack-labeled traffic and 0.2 for benign/unconfirmed traffic; disclose these as configurable assumptions, with production evidence supplied by analyst feedback.
3. For positive gaps, choose the smallest supported `W` that brings grouped alerts/hour within the share; derive `N_sat` from that rule's p95 count, subject to valid numeric bounds. If no safe candidate meets the budget, report the remaining gap.
4. For negative gaps, keep the window small and consider increasing sensitivity. A negative gap alone is not proof of a missed attack; never fabricate events to consume spare budget. The PDF's under-budget exploit example must alert immediately and must not be merged.
5. Enforce an explicit maximum `W` for rules with `S >= 8`. The PDF does not supply the numeric maximum or candidate windows: require configuration before approving a tuned proposal rather than guessing them.
6. Produce `tuned_rules.yaml` with each changed parameter's old value, new value, addressed delta gap, and one-sentence rationale. Retain compatibility with the runtime schema; use a supported audit section or YAML comments for metadata.
7. Run the deterministic evaluator and report every iteration: alert reduction, attack-group recall, and benign groups raised. Accept only 100% attack-group recall and zero benign groups raised. Define and report the attack-group denominator and what counts as a raised benign group; an empty attack set cannot substantiate a recall claim.
8. Allow at most three proposal/evaluation iterations. If validation still fails, report failure and keep baseline rules active. Never bypass the guardrail or describe an unevaluated proposal as safe.

During a tuning-only task, modify only `tuned_rules.yaml`; return YAML and a short evaluation report. This restriction does not prevent application, evaluator, documentation, or test development explicitly requested by the user. Evaluation artifacts should follow the task's agreed output contract.

## Data and evaluation integrity

- Compare baseline and tuned runs on identical events, observation duration, and label definitions. Preserve event identity and provenance through grouping; grouping must not silently delete attack evidence.
- The frozen data includes `demo.label`, `demo.phase`, and `demo.original_timestamp`. Preserve original timestamps and replay using a clearly specified event-time field. Distinguish curated demo labels from independent ground truth; signature-derived labels do not prove detection accuracy.
- Keep evaluation labels out of runtime scoring. Use labels only in evaluation and in the explicitly labeled offline evidence calculation; production evidence must come through a separate analyst-feedback interface.
- The PDF's 857-to-101 reduction, 373 alerts/hour, budget of 20/hour, and five-minute window are synthetic examples, not measured results for this repository. Recompute results from an actual run and identify the dataset, configuration, and assumptions in reports.
- The manifest's counts describe dataset preparation, not tuned performance. Do not claim production readiness or production recall from a curated demo.

## Development and verification

Keep changes focused on the requested component. Prefer small deterministic functions for parsing, scoring, grouping, budget allocation, and evaluation. Validate YAML against explicit schemas and reject unknown or unsafe rule changes before reload. Preserve the previous valid configuration if loading fails.

For scoring or tuning changes, add or run focused tests covering score floors/caps, benign non-escalation, grouping keys and time boundaries, singleton groups, invalid saturation values, budget arithmetic, high-severity window limits, immediate exploit alerts, and guardrail failure. Use the same-event replay to verify recall and alert reduction when the evaluator exists. Do not change labels or weaken checks to make a proposal pass.

Report what changed, the checks actually run, their outcomes, and any remaining limitations. When a command or evaluator is unavailable, state that clearly instead of inventing successful validation. Keep this file current as real entry points, schemas, and commands are added.
