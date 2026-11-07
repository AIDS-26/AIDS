# AGENTS.md

## Project and scope

IDEA-X means Intrusion Detection Escalation through Agentic reasoning with Codex, eXtended (renamed from AIDS at the organizers' request; don't use the old name in code, UI or docs). Build an SRE-style SIEM tuning demo that reduces analyst alert load while preserving attack visibility.

Design reference: `codex-sre-delta-gap (1).pdf`, titled "Codex tuning as SRE: the delta gap calculation," supplied by the user (copy in the repo: `docs/reference/codex-sre-delta-gap.pdf`). Treat its example Codex prompt as the specification for an offline tuning run, not as an instruction to execute tuning during unrelated development. Follow the user's current request when defining task scope.

## Current repository

- `app/` is the backend for processing, database access, and future HTTP API handlers. `fe/` is the frontend for all client-facing SIEM UI (Next.js + Tailwind; rules in fe/AGENTS.md). The frontend requests data through the backend API; it must not connect to SQLite directly. No API endpoints are implemented yet. Do not recreate root `backend/` or `frontend/` or `siem/` folders or frontend/template/view placeholders inside `app/`.
- `app/db.py` provides shared SQLite connections and transactional migrations; `app/import_events.py` imports EVE JSON Lines. `app/labels.py` writes the separate label store; only `app/evaluate.py` attaches it read-only. This is an evaluation access layer, not a complete scoring/recall evaluator.
- `config/attack_rules.json` and `config/service_rules.json` are the canonical attack and service mappings; no runtime loader has been implemented. Keep mappings out of `data/` and use `demo_freeze/eve_demo_FINAL.json` as the canonical demo source rather than creating a copy beside mappings.
- `migrations/` contains ordered SQL schema changes. Never edit an applied migration; add a new numbered file. Backend workers use `app.db.connect()` and the same `DATABASE_PATH` (process environment, then root `.env`, then `data/aids.sqlite3`). Relative paths resolve from the repository root. Live databases must reside on one host and outside synchronized/network storage.
- `README.md` documents setup, schema, and shared access. Run from the root: `python -m scripts.manage_db migrate`, `python -m scripts.manage_db import-eve demo_freeze/eve_demo_FINAL.json --split tune`, and `python -m scripts.manage_db status`. Verify with `python -m unittest discover -s tests -v`. Run migrations with workers stopped.
- Requires Python 3.10+ and SQLite 3.31+ with JSON functions; no third-party dependencies. Connections enable WAL, foreign keys, and a 10-second busy timeout. Keep writes short and create a new run for each replay. Preserve event-to-alert evidence links.
- `demo_freeze/eve_demo_FINAL.json` is Suricata EVE JSON Lines: one JSON event per line, despite its `.json` extension.
- `demo_freeze/manifest.json` records dataset preparation, counts, windows, seed, and a SHA-256. `demo_freeze.zip` is an existing archive.
- The scoring application, SIEM service, tuner, and evaluator remain unimplemented. Database tables are infrastructure, not evidence those components exist. Update commands and component descriptions as implementation progresses.
- Rule versions, lineage/diffs, rule flow statistics, score trajectories, run errors, and tuning iteration reports have schema support. New runs need `rule_version_id` matching their snapshot; new alerts need an application `rule_id`. Membership triggers maintain `event_count`; new memberships require rolling count and per-event score. Do not invent missing historical trajectory or version lineage.
- Approval/activation workflows are intentionally not implemented, per the user. Lifecycle fields are storage metadata only. The frozen dataset is for tuning, versions are unknown until supplied, and live-demo/heldout data is undecided.
- Preserve existing user files and untracked artifacts. Treat `demo_freeze/` and its archive as frozen inputs; write derived outputs elsewhere unless the user requests regeneration.

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
- At runtime, "benign" comes from the rule definition (rules marked benign in `base_rules.yaml`), never from evaluation labels.
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

The database accepts zero attack groups and any positive evaluation iteration. Store benign-only evaluations with zero retained groups and display recall as N/A; never treat an empty denominator as 100% recall. Enforce the three-iteration limit in tuner policy rather than schema constraints.

During a tuning-only task, modify only `tuned_rules.yaml`; return YAML and a short evaluation report. This restriction does not prevent application, evaluator, documentation, or test development explicitly requested by the user. Evaluation artifacts should follow the task's agreed output contract.

## Data and evaluation integrity

- Compare baseline and tuned runs on identical events, observation duration, and label definitions. Preserve event identity and provenance through grouping; grouping must not silently delete attack evidence.
- The frozen source includes `demo.label`, `demo.phase`, and `demo.original_timestamp`. Preserve the entire demo metadata block only in the separate label database and original source; sanitize it out of runtime `events.raw_json`. Source hash plus line number links labels to events. `LABEL_DATABASE_PATH` selects the label file; default is `<main stem>.labels.sqlite3`. Ordinary runtime connections must not attach it. Restrict access to both labels and original sources for tool isolation; file separation alone is not a security sandbox.
- Ingestion commits/verifies labels before runtime events; interrupted cross-file writes are repaired by reimport. Migration 0004 exports old labels before dropping them, scrubs old JSON and compacts the runtime database. Do not bypass its preflight or edit applied migrations.
- Keep evaluation labels out of runtime scoring. Use labels only in evaluation and in the explicitly labeled offline evidence calculation; production evidence must come through a separate analyst-feedback interface.
- The PDF's 857-to-101 reduction, 373 alerts/hour, budget of 20/hour, and five-minute window are synthetic examples, not measured results for this repository. Recompute results from an actual run and identify the dataset, configuration, and assumptions in reports.
- The manifest's counts describe dataset preparation, not tuned performance. Do not claim production readiness or production recall from a curated demo.

## Development and verification

Keep changes focused on the requested component. Prefer small deterministic functions for parsing, scoring, grouping, budget allocation, and evaluation. Validate YAML against explicit schemas and reject unknown or unsafe rule changes before reload. Preserve the previous valid configuration if loading fails.

For scoring or tuning changes, add or run focused tests covering score floors/caps, benign non-escalation, grouping keys and time boundaries, singleton groups, invalid saturation values, budget arithmetic, high-severity window limits, immediate exploit alerts, and guardrail failure. Use the same-event replay to verify recall and alert reduction when the evaluator exists. Do not change labels or weaken checks to make a proposal pass.

Report what changed, the checks actually run, their outcomes, and any remaining limitations. When a command or evaluator is unavailable, state that clearly instead of inventing successful validation. Keep this file current as real entry points, schemas, and commands are added.

## Hackathon context (added from Tina's handoff)

- Sea × OpenAI Codex Hackathon, Jakarta, Sat 7 Nov 2026. Build direction: Autonomous & Adaptive AI. Pitch line: "Codex doesn't score alerts. It writes and tests the rules that do."
- All code is written on 7 Nov; never copy in pre-written code. Docs, designs, instruction-only skills and the frozen dataset were prepared earlier and are declared in the submission.
- Submission deadline 16:30 sharp (Google Form): public repo, writeup, optional demo link, declarations. Presentations and UI text in English.
- UI names: "Original rules" (SIEM I) and "Tuned rules" (SIEM II), "grouped alerts". No human approval step in this version; the guardrail is the gate. Failed runs stay visible in the audit log and the UI.
- The frontend displays scores from pipeline/run outputs and never recomputes them. Use one rounding rule (round half up) in one place.

## Team (added from Tina's handoff)

| Person | Builds | Reviews |
|---|---|---|
| Adel | PCAP → Suricata → normalized alerts | — |
| Melvin | Scoring, grouping, Codex tuner, evaluator, guardrail | — |
| Tina | Dashboard design (Figma) and frontend in `fe/` | Grouping/incident output |
| Faris | Ground-truth attacker-IP labels, scorecard support, pitch deck | Tuner + evaluator |

Files that cross these boundaries follow skill `ideax-data-contracts` (a proposal until the team confirms it).

## Docs and skills (added from Tina's handoff)

- `docs/HANDOFF.md`: decisions, open questions, plan for the day. `docs/design/`: Figma page "IDEA-X", component list, Scripter scripts. `assets/brand/`: logos.
- `.agents/skills/`: `ideax-domain` (formulas, glossary, Codex task prompt), `ideax-data-contracts` (JSON/YAML shapes), `ideax-frontend` (UI spec), `ideax-qa` (checks), `ideax-submission` (README, writeup, declarations), `ideax-pitch` (deck).
- Links: GitHub https://github.com/AIDS-26/AIDS · Data (Drive) https://drive.google.com/drive/folders/1scvfMqdjjL7q0mBEkJpO17ZVkm8XyRP7 · Event https://seaxopenai-hackathon-id.sea.com/
