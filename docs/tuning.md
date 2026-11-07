# Offline tuning and rule versions

Implemented 7 November 2026 from `tuning-implementation-plan.md`. The primary
optimization target is fewer alerts for analysts. Measured alert reduction is a
workload proxy; it does not establish that human fatigue improved.

## Run it

Use Python 3.10+ from the repository root. Keep live databases on a local disk
outside OneDrive/network storage. Stop workers before applying migrations.

```powershell
python -m scripts.manage_db migrate
python -m scripts.manage_db import-eve demo_freeze/eve_demo_FINAL.json --split tune
python -m scripts.manage_db score-baseline 1 --observation-seconds 9600
```

Use the dataset and baseline run IDs returned by these commands. The manifest's
160-minute observation duration is an explicitly approved demo assumption. The
model never chooses duration or budget. A source file remains frozen.

Set `CODEX_API_KEY` and `CODEX_MODEL` in the **process environment** or the root
`.env`. `app/tuning/settings.py` loads only those two settings, with process values
taking precedence. The API key is never printed, included in model context, or
stored in run artifacts. Select
an API model that supports Responses Structured Outputs; no model is silently
substituted. The adapter uses the fixed `https://api.openai.com/v1/responses`
endpoint, `store=false`, a strict output schema, and a 60-second request timeout,
following [official OpenAI documentation](https://developers.openai.com/api/docs/guides/structured-outputs).
It has no filesystem tools or raw-event access. Provider errors/refusals/timeouts
consume an iteration and remain in SQLite. Live API availability is not implied
by the mocked adapter tests; no live model call was made during verification.

```powershell
python -m scripts.manage_db tune 1 --evaluation-session-minutes 10 --label-provenance "Curated demo.label; signature-derived preparation, not independent ground truth"
```

`--model` overrides `CODEX_MODEL`. `--policy` defaults to
`config/tuning_policy.json`. `--output-directory` defaults to `output/tuning`.
Use `--labels-database` **before** the subcommand to select a separate label file.
Tune requires a completed original-rule run and dataset split `tune`. Heldout
labels are rejected. There are at most three proposals, including failures.

For development without a model or API key:

```powershell
python -m scripts.manage_db tune 1 --proposer deterministic --evaluation-session-minutes 10 --label-provenance "Curated demo.label; signature-derived preparation"
```

This is deterministic search, explicitly labeled **no model**. It repeats its
initial suggestion if the gate rejects it; it does not impersonate model revision.
A failed tuning command exits 1 and returns the baseline fallback run ID.

After success, copy the returned version ID:

```powershell
python -m scripts.manage_db replay-tuned 1 --rule-version "tuned/<returned-id>"
python -m scripts.manage_db tune 1 --from-version "tuned/<returned-id>" --evaluation-session-minutes 10 --label-provenance "Curated demo.label; signature-derived preparation"
```

Replay creates a fresh run using the exact accepted snapshot and original events,
without accessing labels or a model. A version must have passed a completed tuning
attempt on that exact baseline. Older accepted versions can be replayed after
retirement. Unknown, proposed and rejected versions cannot be loaded. Continued
tuning starts its diffs and parentage at the supplied accepted version; otherwise
it starts at the original baseline with the configured initial W/N_sat.

## Approved demo policies

The operator approved these assumptions in the implementation conversation.
They are configuration choices, not constants supplied by the PDFs.

| Setting | Value |
| --- | --- |
| Budget | 20 alerts/hour |
| Initial W / N_sat | 5 minutes / 60 |
| Candidate W | 1, 2, 5, 10 minutes |
| N_sat | Integer 2 through 10,000 |
| Maximum W when S >= 8 | 10 minutes |
| Evidence | Mean of per-event weights: attack 1.0; benign/unconfirmed 0.2 |
| Runtime lifetime | Session; a gap >= W starts a new group |
| Rolling count | Prior events in `(t-W,t]`, including the current event |
| Event order | Integer microseconds, source line, event ID |
| Rounding | Shared half-up scorer; n=1 returns S |
| Group alert score | Highest per-event score seen so far |
| Cross-service settings | Minimum W and minimum N_sat across all configured services of that attack type |

The strictest cross-service settings are fixed from the rule snapshot before
streaming, so a future member cannot retroactively change a group. A session may
outlast W when consecutive gaps remain below W; counts still look back only W.
Fractional windows are converted to integer microseconds by truncation.
Every member uses its own S, retains its floor, and has a saved count/score and
the alert score visible at that moment. A group's summary S is the maximum member
base; its representative service/rule is the first member's. Inspect evidence
for each actual event rule, baseline, effective W/N_sat and alert score.

Runtime keys are target+attack, or source+attack for explicitly configured scanner
types. The canonical scanner type is `reconnaissance_or_port_scan`. The PDF's
Windows command-shell exploit maps to `malware_or_reverse_shell`; that type is
configured to emit an immediate, never-merged singleton for every event. Other
attack types are not guessed from free text. Weights and matching remain unchanged.
Benign runtime behavior comes from frozen rule metadata, including `severity_override: S`.

## Evaluation definition: revisit this assumption when necessary

The operator explicitly approved **fixed 10-minute evaluation sessions** using
source+target+attack type, built from attack-labeled events only. A gap >= 10
minutes splits them. Candidate W/N_sat do not define this denominator. Every
labeled attack event must appear in exactly one independent evaluation group.

A group is retained when all its members remain visible exactly once, at their
own baseline score or higher, with an alert score at least that baseline. Splits
and merges are permitted under this definition; first-event visibility is
immediate. It does not require separate alerts for distinct evaluation groups
merged by runtime correlation. **Future agents: revisit this grouping/retention
assumption if it hides distinct incidents or gives misleading retention results.**
The fixed definition and this warning are saved in every evaluation report.

These are curated-label retention metrics, not independent detection recall.
The frozen manifest's `ATTACK_RE` documents Suricata-signature-based preparation;
stored label provenance alone says `source demo.label (curated)`. No independent
ground-truth validation has been supplied. Zero attack groups yields recall N/A
and cannot pass. Unconfirmed/missing labels also cannot certify acceptance.

A raised benign group is any output group containing a benign-labeled member
whose per-event score rose above its own S, including mixed groups. This is
stricter than counting only all-benign groups. Rule-based benign events must
always keep S. Individual labels remain in the separate label store; only
`app/evaluate.py` attaches it read-only. Only aggregate evidence and evaluation
feedback (including per-rule benign counts) reach the model.

Alternatively pass `--evaluation-manifest path.json` with:

```json
{
  "dataset_sha256": "<actual imported source SHA-256>",
  "provenance": "Describe the independent operator group definitions and labels",
  "groups": [{"id": "incident-1", "event_ids": [1, 2]}]
}
```

It must partition exactly all attack-labeled event IDs of that dataset without
duplicates or benign members. The manifest hash and provenance are saved; its
individual member definitions are never model inputs. The manifest and session
options are mutually exclusive. Omitting both leaves recall uncertified.

## Search, acceptance and durable history

`app/tuning/flow.py` computes observed rates, burn, S*evidence priority, shares
and gaps. Zero total weight produces undefined allocation and stops safely.
For each permitted W, it recomputes rolling peak and nearest-rank p95 counts.
Positive gaps suggest the smallest feasible W; otherwise the smallest W among
the best remaining reductions. N_sat comes from that candidate's p95, bounded
to the approved range. Nonpositive gaps keep the smallest window and consider
lower N_sat without fabricating alerts. Per-rule search is isolated; joint replay
applies strictest cross-service settings and reports the actual remaining gaps.
A shared group counts once per participating rule in per-rule statistics; total
workload counts each group once. Do not sum shared per-rule counts as workload.

The guardrail validates complete rule coverage, supported parameters/windows,
N_sat bounds, high-severity limits, keys, immediate exploit behavior, evidence,
score floors/caps, trajectory, runtime benign non-escalation, the stated retention
gate and the configured benign evaluation policy. It also requires positive alert reduction. A passing
candidate may leave an unmet budget: this is reported with `budget_met=false` and
a remaining gap, never described as meeting the budget.

The current operator-requested demo policy uses
`benign_evaluation: warn-any-benign-member-raised`: score increases on
benign-labeled members are reported as warnings rather than rejecting grouping.
The count remains visible, including mixed groups. Runtime rules marked benign
still cannot escalate; every event must remain visible exactly once, with its
baseline score or higher. The legacy `any-benign-member-raised` policy remains
available for strict rejection. The chosen policy is saved in each new evaluation
and snapshot; historical failed attempts are unchanged. This change reduces the
acceptance constraint on benign-label escalation and can admit more noisy groups.

Replay starts paused at zero. Play offers tuning when accepted results are
missing; both lanes wait while tuning and then start together on one clock.
Repeated alerts are grouped, never deleted, and remain expandable inside each
group and visible in Original rules. The separate Run tuning header button has
been removed; the Play flow still starts the real background job.

Verification on the frozen demo source in disposable databases, with the
deterministic development proposer (no model call): 5,483 original alerts became
1,656 groups, all 7 defined attack groups were retained, 33 groups had raised
benign-labeled members, and there were no integrity errors. The warning policy
accepted the first proposal. These are grouping/curated-evidence results, not a
new live Codex tuning result or independent detection recall.

Dashboard tuning status now includes a bounded timestamped `logs` list with
setup, proposal, validation, replay, evaluation and terminal stages. These
messages also go to the backend logger. Safe failure reasons cover outdated
policy, model HTTP status/quota/access and network errors without exposing
credentials or raw provider responses. Setup failures before an attempt exists
are logged too; only attempts already created can appear in Audit. Transient
job logs disappear after an API restart; saved iterations remain in SQLite.
Run only one backend on port 8000. Windows uses exclusive socket binding to
prevent two processes from silently serving different versions on that port.

Every returned proposal, including invalid configurations, has an immutable
child version, parent link and audit. A malformed proposal keeps its raw proposal
and unchanged effective rules; a valid candidate records actual old/new values,
delta gap and rationale. Failed provider calls without a proposal have iteration
records but no invented rule version. Fresh runs reference matching snapshots.
Each model request/replay runs outside write locks. Result writes are atomic;
partial result failures roll back and keep separate failed-run/iteration records.

Only successful activation atomically completes the candidate run and tuning
attempt. Rejected candidates have failed-run status and remain in audit results;
the completed-alert API cannot expose them as usable tuned results. Failed
attempts leave existing active versions unchanged and return baseline fallback.
There is no human approval stage.

Artifacts have unique `output/tuning/attempt-<id>-<suffix>/` directories:
`flow_table.json`, each evaluated `iteration-N.json`, `candidate-N.yaml`, and,
only after a pass, `tuned_rules.yaml`. YAML files use the **JSON-form YAML 1.2
subset**, avoiding a third-party YAML dependency, unsafe tags and ambiguous
scalars. Duplicate keys, unknown fields and nonfinite values are rejected.
The runtime loads accepted SQLite snapshots; editing an exported YAML file does
not activate a version. SQLite is authoritative for activation and audit.

## Read API and verification

All routes are read-only and accept `limit`/`after_id` pagination:

- `/api/datasets/{id}/tuning-attempts`: successes and failures.
- `/api/tuning-attempts/{id}`: policy, flow, outcome and paginated iterations,
  including proposal, evaluation, guardrail and candidate run/version IDs.
- `/api/runs/{id}/rule-history`: immutable snapshots/diffs from child to ancestors;
  `next_after_id` is a stable lineage-depth cursor.
- Existing run/alert/evidence routes expose accepted replay results. Evidence adds
  `event_rule_id`, `event_base_score`, `window_minutes`, `n_sat`, `alert_score`;
  these fields remain null for unavailable historical/baseline details.

GET data routes remain read-only: they do not attach labels, migrate, calculate
scores, activate versions or call a model. The dashboard now consumes saved
results and has the separate local control described below.

## Play and local background tuning

On `/replay`, **Play** starts saved alert playback when an accepted tuned run is
available. Otherwise it opens a prompt with **Start tuning and play**, **Play
original alerts**, and **Cancel**. The first action starts an asynchronous Python
worker, shows proposal progress, and automatically reloads and plays accepted
results. Failure keeps the saved original alerts and offers original-only playback.
The Replay header's **Run tuning** button opens the same prompt, including when
rerunning an accepted baseline. No candidate-approval workflow is introduced;
the deterministic guardrail remains the activation gate.

The same-origin Next.js `/api/tuning-jobs` proxy forwards only a baseline run ID
and an idempotency request ID. Python `POST /api/tuning-jobs` returns a job status
immediately; `GET /api/tuning-jobs/{id}` polls progress and safe attempt/run IDs.
`GET /api/tuning-jobs` supplies model/readiness information, never credentials.
The worker loads the fixed demo policy and approved 10-minute evaluation sessions;
the browser cannot choose a model, change policy, supply labels or bypass checks.
Model configuration comes from `CODEX_MODEL`, defaulting to the selected
`gpt-6.1-sol` for dashboard jobs. CLI model selection stays explicit.

Control is restricted to a loopback backend and a same-origin dashboard. The
backend rejects browser origins and forwarded/proxied control requests; remote
saved-result reads remain available. A database-adjacent OS file lock serializes
dashboard jobs across API processes. Duplicate active requests on the same
baseline reuse the job. CLI operators must avoid running a separate CLI tuning
command concurrently with a dashboard job.

Job polling state is transient and bounded to 64 jobs per API process; restart
recovery is through saved attempts/runs in Audit and Reload saved results. Avoid
restarting the backend during a running job. Keys stay in Python; they are never
copied into frontend configuration. Artifacts remain under `output/tuning/`.

Live Play verification on baseline run #2 called `gpt-6.1-sol` for three proposals.
Each produced 1,656 groups from 5,483 alerts and raised 33 benign-labeled groups;
all three were rejected and no tuned version was activated. These are rejected
diagnostics, not accepted tuning performance. Accepted-result autoplay was checked
separately with a temporary test database response, without another paid call.

```powershell
python -m unittest discover -s tests -v
python -m scripts.check_tuning
```

The integration command uses/removes a temporary local database and saves
`output/tuning-integration-check.json`. It verifies same-event membership, database
integrity and correct activation/rejection. Its deterministic candidate currently
groups 5,483 alerts into 1,656 (69.8% reduction), retaining all 5,483 memberships and
7/7 defined attack groups, but raises 33 benign-labeled groups. All three identical
proposals are rejected; no tuned version is activated. Grouped load is 621/hour,
601/hour over B=20. Existing exploit and score policies are preserved. These are
measured diagnostic results, not an accepted proposal or a live Codex run.
