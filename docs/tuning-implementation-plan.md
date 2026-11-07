# IDEA-X tuning implementation plan

Status: implemented in `app/tuning/` on 7 November 2026. Deterministic proposals
have been evaluated and rejected on the frozen dataset; no live model proposal
has been accepted. See [implementation and operating notes](tuning.md), including
the approved policies below. Earlier open questions are retained as design history.

## Primary outcome

The primary product outcome is reduced analyst alert fatigue: measure the
reduction in grouped alerts relative to original alerts, alongside observed and
grouped alerts per hour, budget B, burn rate and any remaining budget gap.
Report high-severity alert counts as workload context. Fewer alerts alone do
not prove analysts' workload or fatigue improved in practice.

Attack visibility, no downgrade, and benign non-escalation remain safeguards,
not the primary optimization target. The specified acceptance gate still
requires 100% attack-group recall under an explicit denominator and zero benign
groups raised; an empty attack denominator is N/A and cannot certify a pass.
Do not describe recall measured against Suricata-derived labels as independent
ground-truth or real-world recall. Verify label provenance before reporting it.

## Agreed direction

- A grouped alert represents correlated alerts of the same attack type. Runtime
  correlation uses target plus attack type, or source plus attack type for
  scanners. Groups may escalate, but must not downgrade any constituent alert.
- Preserve each source event's identity and link it to exactly one grouped alert;
  the link lets the operator inspect the underlying evidence and lets the
  evaluator check the result. Do not fabricate or discard events.
- The frozen EVE source contains `demo.label`, `demo.phase` and
  `demo.original_timestamp`. Keep individual labels out of runtime scoring,
  grouping, and model inputs. Trusted offline scorecard code may read the
  separate label store to calculate aggregated per-rule evidence for budget
  allocation; evaluation may use labels and return aggregate feedback to the
  model. Do not send raw labeled events or individual labels to the model.
- Store completed tuning outcomes in SQLite, including failures and each attempt.
  Use the existing backend and schema where possible; add migrations rather than
  editing applied ones. The API is the frontend's only database interface.
- The guardrail is the gate; a failed or unevaluated proposal is not used. There
  is no human approval workflow. Do not run more than three attempts.
- The operator approved the 10-minute high-severity maximum, candidate windows
  and session lifetime during implementation; see the decisions below. These
  are operator configuration, not numeric values specified by the PDF.

## Existing starting point

`config/attack_rules.json` provides attack weights and matching, including an
informational rule with `severity_override: S`; `config/service_rules.json`
provides service weights, address mappings and a zero-weight default. Baseline
scoring, event/evidence storage, label separation and the read API exist. The
grouping, flow, evaluation, guardrail and tuner modules are prototypes; the
evaluator explicitly does not calculate attack-group recall. The prototype's
default W=5 and N_sat=60 and heuristic W=1 or 5 are not approved policy.

The manifest records a 160-minute prepared dataset and eight named windows, but
these windows and the binary event labels do not themselves define independent
attack-group identities or a recall denominator. Prepared dataset counts are not
measured tuning results.

## Implementation order

1. **Settle the policies below.** Record the definitions and explicit numeric
   bounds before implementing acceptance. Agree how mixed labels contribute to
   allocation and define attack groups independently of candidate grouping.
2. **Deterministic replay.** Use the same scored baseline events, group using the
   agreed correlation and lifetime semantics, count events in the agreed rolling
   interval, and calculate per-event scores with half-up rounding. Respect benign
   rule metadata, immediate exploit policy, score floor and cap. Preserve event
   memberships and score/count trajectories. Resolve cross-service settings
   explicitly. Do not load labels into runtime grouping.
3. **Evaluator and guardrail.** Independently identify labeled attack groups,
   compare original and tuned scores on the same events, and report denominator,
   retained count, recall, reduction, and benign groups raised. Enforce all
   policy, validation, evidence, floor and benign checks; an empty attack set
   yields N/A and cannot pass recall acceptance. Retaining every event is
   necessary but does not alone establish the agreed attack-group recall.
4. **Flow and search.** Use explicit positive budget and observation duration,
   calculate per-rule rates, burn, evidence weights, shares and gaps; handle zero
   total priority. Search the configured candidate windows and recompute p95 per
   candidate. Derive N_sat within approved bounds, enforce the high-severity
   maximum and immediate exploit behavior, and report unmet budget gaps.
5. **Offline agent loop.** Provide the model aggregate statistics and allowed
   parameters only; validate each proposed change before deterministic replay.
   Feed back aggregate evaluation results, revise at most three times, and
   capture old/new values, gaps and reasons. Read `CODEX_API_KEY` from the
   environment without logging it; document model and API configuration. The
   model does not assign runtime scores or access raw events and labels.
6. **SQLite and API.** Persist baseline and candidate identities, input policy,
   snapshot and rule version, flow statistics, each iteration, evaluation,
   failures, final result, grouped alerts, memberships and trajectories. Use
   short transactions and new runs; retain failure records if result writes
   fail. Load only a proposal that passed the gate. Expose results through the
   backend, preserving label isolation and avoiding a new approval workflow.
7. **Verify end to end.** Run focused tests and the full suite on Python 3.10+;
   run a same-event replay on a separate local database. Verify boundaries,
   mixed services, singleton and exploit cases, no label influence on grouping,
   evidence membership, scores, guardrail failures, empty attack set, failed
   iteration persistence and UI/API numbers. Report actual dataset, settings,
   assumptions and measured results; do not reuse synthetic PDF results.

## Original open decisions (resolved below)

1. **Group lifetime and boundaries:** proposed for discussion: a group remains
   open while consecutive matching alerts arrive less than W apart, closes after
   W of silence, and a new event at exactly W starts a new group. Count prior
   events in `(t-W, t]`. Confirm whether a different lifetime is intended; a
   session can last longer than W even though the count only looks back W.
2. **Cross-service scanner policy:** decide how a source+attack group selects W,
   N_sat and score when member events map to different services. Weights give
   each event a base score but do not choose between multiple per-service
   settings. Any solution must retain each event's score floor and be tested.
3. **Attack-group recall:** define an independent grouping of labeled attacks,
   and whether retaining a group means all its member events remain visible at
   their own baseline score or above, or requires additional alert-level
   visibility/timeliness. Define handling of one attack group split across
   multiple tuned alerts and of multiple attacks merged into one alert.
4. **Benign evaluation:** define a raised benign group and how mixed attack and
   benign labels are treated. Runtime benign behavior remains rule-based.
5. **Immediate exploit scope:** identify the rule types which must alert at once
   and never merge; a small W is not equivalent to no merging.
6. **Explicit settings:** supply initial W and N_sat, candidate W values, an
   N_sat upper bound, maximum W when S >= 8, and budget B. N_sat must be an
   integer >= 2; the PDF does not specify the other numeric bounds. The
   manifest's 160 minutes can be explicitly chosen as the demo duration.
7. **Evidence for allocation:** verify label provenance and decide how to
   aggregate the PDF's proposed 1.0 attack and 0.2 benign/unconfirmed weights
   for mixed-label rules, sparse samples and zero total weight. The operator
   permits label-derived aggregates for offline tuning; these are assumptions,
   not independently validated probabilities. Consider independent analyst
   feedback or ground truth separately when available.
8. **Agent interface:** select model and supported API/CLI integration, and
   settle the validated runtime rule format and YAML audit representation. Do
   not assume prototype defaults or proposal-only data contracts are approved.

The delta gap can guide selection of W by testing permitted windows against the
allocated alert rate. A gap is measured in alerts/hour, not minutes, so it does
not itself define when a group closes or which value of W achieves the goal.
Strip the entire `demo` block during ingestion as implemented, and keep labels
in the separate evaluation store. Aggregate evaluation feedback may be returned
to the tuner; individual labels and raw labeled events are not tuning inputs.

The current attack and service weights are existing inputs, not decisions to
recreate. Review their operational meaning separately; do not alter them merely
to make a replay or benchmark look better.

## Operator decisions during implementation

The operator approved B=20/hour, initial W=5/N_sat=60, candidate windows
[1,2,5,10] minutes, N_sat maximum 10,000, a 10-minute high-severity maximum, and
the prepared 160-minute observation duration as demo assumptions.

Runtime uses session lifetime, `(t-W,t]` rolling counts and new sessions at
exactly W of silence. Cross-service correlation uses the smallest W and N_sat
across the attack type's service configurations, fixed before replay to avoid
future members changing historical trajectories. Every event retains its own
score floor. The canonical scanner type is `reconnaissance_or_port_scan`;
`malware_or_reverse_shell` implements the PDF command-shell exploit's immediate,
never-merged behavior.

The operator approved independent evaluation sessions on source+target+attack
type with a fixed 10-minute silence boundary. Retention requires every member to
remain visible at its own baseline or higher; splitting/merging is permitted.
**Future agents must revisit this demo grouping/retention definition if it gives
misleading results or hides distinct incidents.** This warning and the exact
definition are persisted in evaluation metadata. These metrics are curated-label
retention, not independent real-world detection recall. A supplied, hash-bound
attack-group manifest is also supported. Any benign-labeled member raised above
its own baseline makes its output group raised, including mixed groups.

Evidence uses arithmetic means of configurable 1.0 attack / 0.2 other weights.
Zero total priority cannot allocate a budget. Individual labels never enter
runtime replay or model context. The manifest's signature-based preparation and
stored curated-label provenance are disclosed in configuration and results.

The API integration uses aggregate-only Responses Structured Outputs, with an
explicit `CODEX_MODEL`/`--model` and environment-only `CODEX_API_KEY`; no default
model or live API success is assumed. Runtime rule documents use the JSON-form
YAML 1.2 subset with a separate audit section; SQLite accepted snapshots are
authoritative. Model changes are restricted to W/N_sat and rationale, and each
returned proposal has a new immutable child version. `--from-version` continues
accepted history; `replay-tuned` uses a saved accepted version without labels.

Verification: 58 backend tests passed. The separate temporary-DB frozen replay
groups 5,483 alerts into 1,656 (69.8%), preserves 5,483 evidence memberships and
7/7 defined attack groups, but raises 33 benign-labeled groups and remains 601
alerts/hour above budget. All three deterministic proposals are rejected and
baseline remains the fallback. See `output/tuning-integration-check.json`.
The existing frontend fixtures were preserved; new audit/lineage read endpoints
are available for frontend integration. Live model execution remains unverified.
