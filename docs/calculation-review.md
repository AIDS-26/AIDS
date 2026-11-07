# Calculation integration review

Reviewed 7 November 2026. Scope: the six supplied calculation modules and their
connection to the existing SQLite ingestion and SIEM read API. No offline tuning
attempt, configuration activation, email delivery or live-database migration was performed.

## Working flow

`EVE -> import-eve -> sanitized events -> score-baseline -> scored alerts + evidence -> read API -> SIEM`

The original-rule worker now persists one alert per event using `S=min(10,A+C)`.
This is baseline scoring, so every membership has `n=1` and `raised_score=S`.
Rules are identified by attack type and service, while event identity and source
line remain unchanged. Snapshot hashes identify the exact mapping/engine policy;
replays create new runs. A failed result write rolls back partial results, records
the run error and remains unavailable through the completed-alert route.

The frontend selects a completed baseline run from `/api/datasets/{id}/runs`, then
reads `/api/runs/{run_id}/alerts`. Source-alert endpoints continue to show raw inputs.
Calculated responses include the first evidence event's timestamp, endpoints and
signature. An alert's evidence endpoint returns all its member event IDs.

## Review of the six modules

| Module | Assessment and changes |
| --- | --- |
| `siem_1_calculation_base.py` | Baseline formula is appropriate. Added mapping/weight validation, configured service default, preserved database event IDs and removed demo labels/evidence from runtime output. Matching remains the author's ordered, case-insensitive lexical/category policy; it is not semantic AI matching. |
| `siem2_calculation_base.py` | Fixed an import referring to nonexistent `siem1.py`. Removed label-dependent benign classification; uses rule metadata instead. Uses half-up rounding and rejects invalid saturation rather than silently clamping it. Timestamp sorting now compares aware instants with stable source order. Grouping semantics still require the work below. |
| `flow_analyzer.py` | Previously inferred duration from first/last alerts and defaulted B=20. Requires explicit positive finite budget/duration/window now. Evidence is a separate offline aggregate. Added per-event trailing-window peak/p95 with nearest-rank percentile; interval `(t-W,t]`, current event included, equal timestamps ordered by source line/ID. Zero total priority produces undefined share/gap instead of fabricated zero shares. |
| `evaluate.py` | Fixed nonexistent `siem2.py` import. Labels are now supplied separately, validated against event IDs, and never used by grouping. Requires exactly-once event membership. Empty attack coverage and empty-baseline reduction are undefined (`None`). Reports `attack_group_recall=None` and `acceptance_status=not_certified`: preserved event coverage cannot establish attack-group recall. |
| `guardrail.py` | Requires operator-supplied high-severity W maximum. Rejects unknown parameters, booleans/nonintegral N_sat, nonfinite windows and malformed configurations without silently coercing them. This is parameter validation only, not a full acceptance gate. |
| `tuner.py` | Still explicitly an initial heuristic: positive gaps choose W=5/N_sat=60, otherwise W=1/N_sat=2. Added rejection of undefined allocation. No claim that these candidates meet budget or pass evaluation. |

## Remaining gaps before tuned rules can be used

1. **Window semantics and trajectory:** SIEM II still uses epoch-aligned fixed
   `[start,start+W)` buckets and each bucket's total count. The specification calls
   for rolling counts; the handoff also leaves session versus fixed grouping open.
   The flow analyzer now computes trailing counts, which must not be equated to
   these fixed buckets. Agree grouping policy, then implement per-event score/n
   trajectories and tests across boundaries before storing tuned results.
2. **Runtime group key:** grouping currently includes service as well as
   attack/host. The documented runtime key is target+attack, or source+attack for
   scanners. Service belongs to tuning aggregates. Decide how a scanner group
   spanning multiple destination services selects settings and base scores;
   do not silently pick one service's configuration.
3. **Immediate exploit alerts:** there is no no-merge/immediate rule flag in the
   grouping prototype. Even W=1 can merge exploits within a minute. A small
   window alone does not implement the exploit exception in the specification.
4. **Attack-group recall:** define attack-group identity/denominator independent
   of candidate grouping, and the threshold/evidence that counts as retained.
   Event coverage currently approaches 100% merely by retaining memberships;
   it says nothing about alert rank or attack-group visibility. Empty attack
   denominators must remain N/A. No proposal is certified by this helper.
5. **Full guardrail:** complete input/schema validation, supported window and
   saturation bounds, immediate-exploit policy, score/benign checks and real
   evaluation acceptance. Preserve baseline if any check fails. No human approval
   workflow is required; the deterministic guardrail is the intended gate.
6. **Tuner:** implement smallest-feasible supported-window search, recompute p95
   per candidate, derive valid N_sat, record old/new/gap/rationale, report residual
   budget gaps and run at most three proposal/evaluation iterations. The current
   heuristic does none of this and writes no audited YAML proposal.
7. **Storage and UI contracts:** tuned runs, flow statistics, evaluation rows and
   tuning iteration reports are not persisted by the new baseline worker. The
   skill's JSON artifact shapes remain proposals; this integration uses the
   existing DB/API contract and does not expose labels/original timestamps to runtime.

## Verification and observed baseline

The suite covers baseline persistence, immutable snapshots/new replays,
rollback/failure records, label independence, service default/host precedence,
score bounds/formula/rounding, invalid saturation, fixed prototype boundaries,
scanner source selection, flow arithmetic/percentiles, empty denominators and
guardrail rejection. Run from the repository root:

```powershell
python -m unittest discover -s tests -v
```

The frozen dataset was imported and scored into a temporary local database, then
all results were retrieved over HTTP with pagination. Observation duration was
explicitly 9600 seconds, using the manifest's 160-minute demo duration. Source hash:
`8ed31f8aa0cb716d4773d4c87621ca543353160ee2719994c8067dd66ca1883b`.

| Baseline measure | Observed |
| --- | ---: |
| Imported/scored alerts | 5,483 |
| Evidence links | 5,483 |
| High | 5,291 |
| Medium | 6 |
| Low | 186 |

HTTP pagination, score/base equality, one-event membership, database integrity and
foreign-key checks passed. The existing configured database and frozen inputs
were not modified. Machine-readable results and per-rule counts are in
`output/baseline-integration-check.json`. The temporary database was removed;
run `score-baseline` against your configured database to create usable run IDs there.

**Interpretation:** roughly 96.5% of baseline alerts are already High under the
current mappings. High service weights cause many `A+C` sums to reach the cap;
those alerts cannot escalate further. This is a result of the supplied weight
choices, not a tuning result. Weights were preserved. Review whether this matches
the intended demo before claiming severity improvement or reduced High-alert load.
No tuned reduction, attack-group recall, production recall or email counts are claimed.
