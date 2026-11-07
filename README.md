# IDEA-X
Intrusion Detection Escalation through Agentic reasoning with Codex, eXtended

`app/` is the backend: processing, database access, and the SIEM read API.
`fe/` is the client-facing SIEM frontend (Next.js + Tailwind). It will request data
through the backend API; SQLite access stays in backend Python code.
This setup supplies ingestion, database infrastructure, and a local HTTP read API.
Original-rule scoring and offline tuning are integrated with SQLite and the API.
`app/tuning/` implements deterministic session replay, budget-aware search,
aggregate-only model proposals, evaluation, the guardrail and immutable rule
version history. See [tuning setup, policies and measured limitations](docs/tuning.md).
The earlier grouping/tuner helpers in `app/calculation_base/` remain prototypes;
they are not used for tuned activation. `app/evaluate.py` is the trusted offline
label access layer. The tuning UI still uses its existing fixtures.
It requires Python 3.10+ and SQLite 3.31+ with JSON functions. No
third-party Python packages or database service are required.

## Project structure

```text
app/                  Backend processing, baseline worker and database/API
app/calculation_base/ Original scoring and prototype offline tuning helpers
app/tuning/           Offline loop, deterministic replay, evaluation and versioning
fe/                   SIEM frontend (Next.js + Tailwind)
siem/                 Earlier frontend placeholder and API integration notes
config/               attack_rules.json and service_rules.json
migrations/           Runtime schema and separate label-store migrations
scripts/              Database administration commands
tests/                Backend/database tests
tuner/                Earlier tuning workspace placeholders (unused)
demo_freeze/          Canonical frozen demo source and manifest
data/                 Local databases and other input data
output/               Generated reports and run artifacts
```

Use `config/attack_rules.json` and `config/service_rules.json` as the mapping
sources. Baseline loading validates weights and asset CIDRs; attack patterns match
in file order, case-insensitively, with category/signature OR semantics. Services
use destination IP, longest CIDR prefix, then the configured default. Use
`demo_freeze/eve_demo_FINAL.json` as the single canonical extracted demo dataset.
The existing `demo_freeze.zip` archive is retained.

The reviewed Windows checkout has CRLF source lines: its actual SHA-256 is
`8ed31f8aa0cb716d4773d4c87621ca543353160ee2719994c8067dd66ca1883b`.
The manifest SHA-256 (`53d4fa05ba7dfe08f3f87e42d47188e5ccd7becff28bb2aea28d2f63f9750c87`)
matches the same source with LF line endings. Ingestion hashes actual source bytes;
it does not normalize or modify frozen inputs. Files with changed line endings
therefore have different dataset identities. Both reviewed forms contain 5,483 alerts.

## Initialize the database

Run from the repository root:

```powershell
python -m scripts.manage_db migrate
python -m scripts.manage_db import-eve demo_freeze/eve_demo_FINAL.json --split tune
python -m scripts.manage_db status
```

The default file is `data/aids.sqlite3`. Import applies pending migrations first.
Reimporting the same source checksum does not duplicate events, even if its filename changes;
it verifies or repairs the separate label store.
Distinct source lines are retained even when their JSON contents are identical.
Malformed alert records are rejected before database writes. Non-alert EVE records
and blank lines are skipped. Runtime JSON omits the entire `demo` block; its labels,
phase, and original timestamps live separately in `data/aids.labels.sqlite3`.
The frozen source and manifest are never modified. That source checksum identifies
the original file, not the sanitized runtime JSON.

The existing frozen dataset is for **tuning**. Suricata and ET Open versions remain
unknown (`NULL`); live-demo/heldout data has not been selected. Future imports default
to split `unassigned`; explicitly use `--split tune` or `--split heldout`. Optional
`--suricata-version` and `--et-open-version` record known source provenance without
guessing. Existing metadata can be changed explicitly:

```powershell
python -m scripts.manage_db dataset-metadata 1 --split tune
```

## Share configuration between processes

Add this line to your existing `.env`, or set it in both processes' environment:

```dotenv
DATABASE_PATH=data/aids.sqlite3
```

`example.env` documents this setting. The process environment takes precedence over
`.env`; relative paths resolve from this repository's root, regardless of the
process's working directory. Existing `.env` credentials are not changed by setup.
Only `DATABASE_PATH` and `LABEL_DATABASE_PATH` are loaded by the database module. Plain or quoted paths are
supported, without variable interpolation or inline comments.

You can also select a database for an individual administrative command:

```powershell
python -m scripts.manage_db --database data/scratch.sqlite3 migrate
```

Backend workers must use the **same absolute file on the same machine**. The
frontend's port does not affect SQLite access. Keep the live database on a local disk, outside
OneDrive synchronization or network shares; set an absolute `DATABASE_PATH` there
if needed. Keep the repository's frozen input files wherever they already live.
SQLite WAL allows simultaneous readers and a writer; writes are serialized with a
10-second lock timeout. Use short transactions and one connection per operation.
Database files and sidecars are ignored by Git.

`LABEL_DATABASE_PATH` optionally selects the separate label file; otherwise it is
`<main database stem>.labels.sqlite3` beside the main file. Administrative commands
also accept `--labels-database` before the subcommand. Never select the main file as
the label file. For runtime-tool isolation, put the labels outside the tool's allowed
workspace and restrict access to the original labeled EVE files as well.

## Use from backend Python code

Import database infrastructure from backend processing, API handlers, or trusted
tuning/evaluation tools. Run Python modules from the repository root:

```python
from app.db import connect

with connect() as db:
    events = db.execute(
        """SELECT id, timestamp, src_ip, dest_ip, signature_id, signature
           FROM events WHERE dataset_id = ?
           ORDER BY timestamp_us, source_line LIMIT ?""",
        (dataset_id, 100),
    ).fetchall()
```

The context manager commits on success, rolls back on exception, and closes the
connection. Always bind query parameters. Do not hold a write transaction while
calling Codex, sending messages, or waiting for network operations.

The SIEM frontend must not open SQLite files, import Python database modules, or
receive database paths or label-store credentials. Its integration point is
the API in `app/`, described below. Separate
backend hosts should communicate through an API or use a client/server database
instead of sharing the SQLite file.

## EVE to SIEM 1

The scored flow is `EVE JSON Lines -> import-eve -> datasets/events -> score-baseline -> runs/alerts/alert_events -> HTTP API -> SIEM`.
The separate label store is used only for trusted evaluation. Ingestion preserves
one event per alert source line, including identical records on different lines.
Import itself does not create calculated `alerts` or `runs` rows; the baseline worker does.
This is a finite-file import;
stop/rotate an actively written EVE file before importing it. Live tailing is not implemented.

Set `DATABASE_PATH` and `LABEL_DATABASE_PATH` to local paths outside OneDrive before
running the commands below. For example, use an existing local directory under
`C:/Users/Melvin/AppData/Local/IDEA-X/`. The server reads the configured database;
it never runs migrations or imports during a request.

```powershell
python -m scripts.manage_db migrate
python -m scripts.manage_db import-eve demo_freeze/eve_demo_FINAL.json --split tune
python -m scripts.manage_db score-baseline 1 --observation-seconds 9600
python -m app.api --port 8000 --allowed-origin http://localhost:3000
```

Replace `1` with the dataset ID returned by import. The example explicitly uses
the manifest's 160-minute demo duration (9600 seconds); choose the actual observation
duration for other sources. It must be finite, positive and cover the event span.
The command returns a fresh `run_id` for the frontend to select. It never sends email.

`--allowed-origin` is optional; use the exact scheme, host, and port of the frontend
if it is served from another origin. This development API binds to loopback by
default and has no authentication or TLS; keep it local. The frontend can use:

```javascript
const datasets = await fetch('http://127.0.0.1:8000/api/datasets').then(r => r.json());
const id = datasets.items[0].id; // Present a dataset picker if there are several.
const runs = await fetch(`http://127.0.0.1:8000/api/datasets/${id}/runs`).then(r => r.json());
const run = runs.items.find(r => r.mode === 'baseline' && r.status === 'completed');
// Show a run picker and an empty state when no completed run exists.
const alerts = await fetch(`http://127.0.0.1:8000/api/runs/${run.id}/alerts?limit=100`)
  .then(r => r.json());
```

| GET route | Contents |
| --- | --- |
| `/api/health` (alias `/health`) | API and read-only database connectivity; HTTP 200 with `{"status":"ok","database":"ok"}`, or HTTP 503 if the database is unavailable |
| `/api/datasets` | Source IDs, hashes, counts, split and known versions; no local paths |
| `/api/datasets/{id}/alerts` | Imported source alerts with event IDs and source-line provenance |
| `/api/datasets/{id}/runs` | Calculation run IDs, status, mode and rule-version IDs |
| `/api/runs/{id}/alerts` | Application scores/groups from a completed baseline or tuned run |
| `/api/runs/{id}/alerts/{alert_id}/events` | Evidence membership and stored score trajectory |
| `/api/runs/{baseline_run_id}/replay` | Complete saved Original/Tuned playback snapshot, counts, evidence membership and persisted effective score histories |

All list routes accept `limit` (1–500, default 100) and `after_id` (default 0).
Responses contain `items` and `next_after_id`; pass that cursor to get the next
page, and stop when it is `null`. Pagination uses increasing IDs, not event time.
Missing resources return JSON 404; invalid queries and unfinished result runs
return JSON 400; database failures return JSON 503 without file paths.

Source alerts have `kind: "source_alerts"`, `score: null`, `severity: null`, and
`calculation_status: "pending"`. This source route always represents raw input;
use the completed-run route for calculated scores even after a replay exists.
`suricata_severity` is Suricata's original 1–3 value, **not** the application's
Low/Medium/High score. `flow_id` is a string to preserve large integers in JavaScript.
No raw JSON, demo labels, label paths or original source paths are exposed.

The replay snapshot is intentionally complete and rejects pagination parameters.
It requires a completed, one-alert-per-event baseline. Tuned results are selected
only from a completed run using a previously accepted version on that exact
baseline, with the same observation duration and complete, unique event evidence.
Missing tuned results remain `null`; missing historical scores are never invented.
Frames use `(timestamp_us, source_line, event_id)` ordering, include events at the
clock boundary, and aggregate persisted scores/severities without running scoring,
tuning, or evaluation. Reduction is a presentation count ratio rounded half up to
one decimal. Saved evaluation metrics describe the full evaluated run, including
the original evaluation run ID when viewing a fresh replay of its accepted version.
No labels or email delivery records are loaded by this view.

The dashboard now opens saved backend results at `/replay`, `/tuning`, and `/audit`.
Set the server-only `IDEAX_BACKEND_URL` in `fe/.env.local` if the API is hosted
elsewhere; the default is loopback port 8000. Restart the Python read API after
updating route code. Replay initially shows the final saved counts; Play replay
starts at zero. Synthetic screens remain under each route's `/sample` subpath.
Emails remains a labeled sample and live tuning still runs through the backend CLI.

### Calculation integration

`app/baseline.py` calls `score_events()` from `siem_1_calculation_base.py` using
sanitized events ordered by `(timestamp_us, source_line)`. It preserves DB event IDs,
creates an immutable snapshot and fresh run, and stores one alert/evidence link per
event with `n_in_window=1`, `raised_score=S`. Failed writes roll back all results and
record a failed run; completed results become visible through the API. Snapshot
content determines version identity; a replay always creates a new run.

The scorer uses rule metadata (`benign_rule`, or the existing `severity_override: S`)
for benign behavior; it neither reads nor emits evaluation labels/evidence weights.
The API adds first-event timestamp, network endpoints and signature to calculated
alerts. Full membership remains available through each alert's evidence route.
No schema migration was necessary. No tuned-run persistence/activation was added.

Offline helper interfaces changed intentionally: `analyze(events, budget,
observation_seconds=..., window_minutes=..., evidence_by_rule=...)` requires explicit
duration/window and separate offline evidence; `evaluate(events, rules, labels=...)`
takes evaluation labels separately by event ID. `validate_rules(...,
max_window_high=...)` requires an explicit high-severity window limit. It checks
configuration only; event coverage is not attack-group recall and cannot certify acceptance.
See [the calculation review](docs/calculation-review.md) for remaining policy gaps.

### PDF and rule review

The PDF describes offline parameter search over rules (`W`, `N_sat`) with deterministic
replay and guardrails. Its embedded tuning prompt is a future task specification;
its synthetic performance figures are not results for this dataset. `AGENTS.md`
already captures this concept. The worker now scores originals; ingestion and API
handlers themselves still perform no scoring or tuning.

The integrated calculation follows the supplied implementation: ordered attack
patterns overlap (for example “Reverse Shell Connection” also matches “Reverse Shell”),
asset subnet and host entries overlap, and service IPs are traffic-derived hypotheses.
`service_rules.json` now has an explicit `default` entry for unmatched endpoints.
Its weight is currently `0`, as set in the shared workspace: an unmapped asset
contributes no additional service weight. The loader accepts C=0 and validates
attack weights in 1–10, service weights in 0–10 and final score bounds separately.
Attack matching, including any semantic classification, is assigned to the
calculation developer; define a reproducible contract before replacing the current
category/signature patterns. Offline preparation of a saved mapping can preserve
the documented separation between AI work and deterministic runtime scoring.
Runtime cannot use demo labels to decide benign behavior.

## Data layout

| Table | Purpose |
| --- | --- |
| `schema_migrations` | Applied SQL filenames, checksums, and timestamps |
| `datasets` | Source checksum, tune/heldout/unassigned split, Suricata and ET Open versions, count |
| `events` | Sanitized event JSON, timestamp, UTC microsecond ordering, indexed fields |
| `rule_versions` | Immutable configurations, parent version, structured changes, rationale, creator and lifecycle metadata |
| `rules` | Stable application rule identity: attack type plus service, distinct from Suricata signature ID |
| `runs` | Dataset, mode, version FK and snapshot, duration, budget, status and error diagnostics |
| `alerts` | Rule FK, final score, derived severity and automatically maintained total membership count |
| `alert_events` | Evidence membership, rolling `n_in_window`, and `raised_score` for that event |
| `rule_flow_stats` | Counts/rates, window, peak, p95, evidence/priority weight, allowed share and generated gap |
| `evaluations` | Baseline/tuned comparison counts and detailed audit metadata per iteration |
| `tuning_attempts` | Baseline run, creator, status and error for an offline tuning attempt |
| `tuning_iterations` | Candidate version, model name, report text, evaluation and error per iteration |

The separate label file contains its own migration history, `label_datasets`, and
`event_labels`, keyed by **source SHA-256 + original source line**. No label table or
`demo` payload is present in the current runtime database.

Create a new run for each baseline or tuned replay; preserve earlier runs. Store
the loaded YAML rule configuration as a JSON snapshot in `runs.rules_json` and its
version FK in `rule_version_id`; `rule_version` remains a descriptive legacy label.
New runs require a snapshot matching `rule_versions.rules_json`. New alerts require
a matching `rules` identity. Rule definitions remain YAML files. Use the same
dataset and observation duration for comparisons.

Run inputs and rule-version contents are immutable; create child versions and new
runs rather than changing history. `changes_json` stores an array of per-parameter
changes (old value, new value, addressed gap, and rationale). Historical runs receive
individual legacy snapshots rather than invented lineage. Lifecycle/approval fields
are storage metadata only: **no human approval or activation workflow is implemented**.
Nothing is automatically approved or activated by database setup.

Queryable virtual event columns include `dest_port`, `proto`, `category`, and
`flow_id`, indexed per dataset. They are extracted from JSON; the indexes use disk
space. Scoring should order events by `(timestamp_us, source_line)`.

`alerts.event_count` counts all member events; triggers maintain it as memberships
are inserted/deleted. It is different from the rolling window count. New membership
rows must include `n_in_window >= 1` and `raised_score >= base_score`. Historical
trajectory values remain `NULL` when they cannot be recovered. Reconstruct a score
trajectory by joining memberships to events and ordering by event time/source line.

Store flow statistics separately for each `(run_id, rule_id, window_minutes)`.
Recompute peak and p95 when testing a different window, and record the percentile
method. Rates, priority weight and delta gap are generated from the stored inputs;
duration must match the run. An unavailable allowed share remains `NULL`.

## Evaluation label access

Only `app/evaluate.py` attaches labels, on a fresh **read-only** connection. Ingestion
and migration write the label file using separate connections, never `ATTACH`.
For example, trusted evaluation code can use:

```python
from app.evaluate import evaluation_connection

with evaluation_connection() as db:
    rows = db.execute(
        """SELECT e.id, l.label FROM events e
           JOIN datasets d ON d.id = e.dataset_id
           JOIN ground_truth.event_labels l
             ON l.dataset_sha256 = d.sha256 AND l.source_line = e.source_line
           WHERE d.id = ?""", (dataset_id,)
    ).fetchall()
```

Ordinary `connect()` calls attach nothing. Label identity/count metadata is checked
before evaluation access. Labels remain curated metadata, not independent ground
truth; missing labels/unknown traffic cannot certify attack retention. The PDF's
offline evidence weighting can use trusted label-derived aggregates for tuning;
runtime scoring must not use labels, and heldout labels must not enter tuning.

Label separation is not a security sandbox: restrict filesystem access when giving
the runtime DB to tools. If copying a live WAL database, use SQLite's backup API;
copying only its main file may omit recent committed data.

Schema constraints enforce score bounds and evidence links. The scoring/tuning
implementation must still check benign non-escalation, high-severity windows,
and evaluation acceptance; the database does not
implement those guardrails. Import creates no scored results or performance claims.

Evaluation rows may record zero attack groups. In that case recall is undefined
(display N/A), not 100%, and the slice cannot certify attack retention. The schema
accepts any positive iteration number; the tuner must still enforce the PDF's
maximum of three iterations per tuning attempt.
An empty baseline similarly has `alert_reduction = NULL` (N/A). Store the actual
baseline/tuned alert counts when known; a zero baseline forbids a numeric reduction.
Never promote an empty attack denominator to successful recall.

## Migrations and verification

Add ordered SQL files to [`migrations/`](migrations/README.md); do not edit an applied
migration. Run migrations with both services stopped. Migration `0004` exports and
verifies legacy labels before removing them, sanitizes existing JSON, and compacts
the main database/WAL. Interrupted compaction resumes on the next `migrate`.

WAL does not provide atomic commits across two files. Ingestion validates the entire
source, commits/verifies labels first, then commits runtime rows. A failure may leave
orphan labels; reimporting the original source reconciles them without duplicating
events. A failed legacy export leaves the original labels untouched. Retain the
original labeled source for recovery; keep old backups out of runtime-tool access.

```powershell
python -m unittest discover -s tests -v
```

Tests use temporary databases and cover migration atomicity/history, repeatable
imports, invalid-input rollback, concurrent read/write access, score constraints,
evidence integrity, and shared path configuration.
