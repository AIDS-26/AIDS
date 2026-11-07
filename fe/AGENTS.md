# fe/AGENTS.md: IDEA-X dashboard (frontend)

## Connected Ask IDEA-X (7 Nov 2026)

- This supersedes the earlier frontend-only chat handoff. `app/api/chat/route.ts` proxies through `lib/chat-backend.ts` to Python `POST /api/chat`, using server-only `IDEAX_BACKEND_URL`. Existing backend CODEX credentials stay in Python. See `CHATBOT.md`.
- Saved Replay sends the exact `baseline_run_id` with displayed run, dataset, frozen time and optional alert/group selection. Backend retrieval supplies canonical and saved mappings plus bounded visible evidence; future members are excluded. Sample Email context supports general explanations only, with its unavailable sample evidence disclosed.
- The assistant has no rule writes, tuning controls or action tools. Existing Pick, history, cancellation and retry remain.

Loaded on top of the root `AGENTS.md` when Codex starts in `fe/`. Owner: Tina.
`fe/` is the client-facing SIEM frontend (it replaces the old `siem/` placeholder).
Full spec: skill `ideax-frontend` (tokens, Figma → React component map, screen-by-screen spec).

## Stack

- Next.js (App Router) + TypeScript + Tailwind, self-contained in `fe/` (scaffolded with create-next-app).
- Screens: `/replay` (default comparison), `/audit` (tuning and grouping iterations), `/emails` (sample grouped email detail). Tuning has no separate page.
- Commands (run in `fe/`): `npm install`, `npm run dev` (http://localhost:3000), `npm run build`, `npm run lint`.

## Rules

1. **Backend API only.** The backend lives in `app/` and will expose the API for alerts, runs, metrics,
   tuning attempts and rule-version history. Keep processing, database connections and evaluation label
   access in backend code. The frontend must not open SQLite files, import Python modules, read
   `demo_freeze/`, or receive the backend `.env`, database paths or label-store credentials. API routes and
   ports are defined by the backend owner; record them here once they exist.
2. **Display, don't compute.** Scores, bands, groups, recall and reductions come from the API. The UI never
   recomputes a score or a band. Show the run id the numbers come from. Show recall as "N/A" when the API
   reports zero attack groups, never as 100%.
3. **Run tuning.** The "Run tuning" button calls the backend's tuning endpoint (the backend runs Codex and
   the guardrail). Show progress/log, then load the new run. On error or timeout, keep showing the last saved
   run with a visible notice. The frontend never starts Codex itself.
4. **Honesty in the UI.** Keep the notice on Replay: attack/benign labels from CIC-IDS2017 are used only to
   grade results and weight the offline tuning; at runtime, benign comes from the rule definition. Show failed
   attempts and failed runs. "Benign groups raised" must turn red if it is ever above 0.
5. **Names.** "SIEM 1 · Original rules" / "SIEM 2 · Tuned rules", "grouped alerts", tabs Replay · Audit log · Email, as requested by the operator.
6. **Look.** Match the Figma page "IDEA-X" (PNG exports in `docs/design/screens/`). Brand tokens only, Inter
   + JetBrains Mono, 1px borders, radius 4/6, no shadows. No purple, gradients, glow, sparkle/robot icons or
   chat bubbles. Colour is meaning: red High/Fail, amber Medium, green Low/Pass/tuned, grey benign.
7. **Sample data until the API exists.** Put sample responses under `fe/fixtures/`, shaped like the agreed
   API responses and clearly marked "sample". Load them through one small data module so switching to the
   real API is a one-line change. Remove or switch off before the demo.

## Before the demo (15:30)

Final replay numbers equal the evaluator output for the same run; same result at 60× / 120× / 360×; no
"sample" data left; backup screen recording saved. Use skill `ideax-qa`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Routine debugging is not feedback. Verify changes before retaining them as feedback candidates. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Retain qualifying friction even if it is later fixed or worked around; record the final outcome during the reporting pass.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `npx --no-install next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->

## Implemented sample Replay (7 Nov 2026)

- Existing scaffold retained in `fe/app/`.
- `/` redirects to `/replay` through `next.config.ts` before rendering, avoiding instant-navigation validation of a redirect-only page. The Replay page loads clearly labeled synthetic JSON through `fe/lib/data.ts`; the agreed backend API can replace this source module.
- `npm run dev`, `npm run build`, `npm run lint`, and `npx tsc --noEmit` are the available commands. `npm test` runs playback timing, frame selection, and fixture integrity tests.
- Playback supports Play/Pause, Restart (pause at zero, retain speed), and 60×/120×/360×. Scores, bands, and metrics come from saved sample frames. Future navigation is disabled; real pipeline integration remains deferred.
- Dev/build scripts use Webpack and Tailwind PostCSS after a reproducible Turbopack CSS worker startup failure on Windows. Production build, lint, TypeScript, and fixture integrity checks passed for the static Replay implementation.

## Implemented sample Tuning (7 Nov 2026)

- `/tuning` uses `fe/lib/data.ts`, shared with Replay, and `fe/fixtures/tuning.json`.
- Selectable sample attempts show matching guardrail checks, proposed totals, rule changes, YAML preview, and logs. Failed proposals stay visible as not used.
- Run tuning again is disabled and the sample budget is read-only; there is no frontend Codex execution or live API integration.
- Tuning's design-example run is explicitly separate from Replay's small sample. No evaluator result is represented as measured.
- Replay and Tuning share `AppHeader`; Audit log and Emails remain inactive. `npm test` includes recall-empty-set and sample-run consistency checks.
- Verification: production build, lint, TypeScript, and six tests passed. Browser checks covered both attempts, keyboard YAML toggling, disabled live tuning, read-only budget, Replay navigation/playback, and 1440/1280/400px layouts without page overflow or runtime exceptions.

## Implemented sample Audit log (7 Nov 2026)

- `/audit` loads `fixtures/audit.json` through the shared `lib/data.ts` module.
- Passed and failed runs are selectable by pointer or keyboard; details show before/change/after state and expandable attempt history.
- Failed proposals are visibly not used, with the retained baseline shown separately from rejected grouped-alert totals.
- Run #3 agrees with the Tuning sample. Artifact filenames are informational only. No backend, evaluator, or live rule loading is connected.
- Shared navigation now enables Replay, Tuning, and Audit log. Emails remains inactive.
- Verified production build, lint, TypeScript, all eight tests, and browser checks for all run selections, keyboard activation, failed baseline retention, attempt history, shared navigation, and 1440/1280/400px layouts without page overflow or runtime errors.

## Implemented sample Emails (7 Nov 2026)

- `/emails` reads `fixtures/emails.json` through `lib/data.ts` and shows selectable original/tuned previews.
- Four original and three tuned previews agree with Replay's sample-001 snapshot. Preview scores and counts describe notification time, with no future group information.
- All four navigation tabs are enabled. The preview links to Replay; no inbox connection, backend integration, or email sending exists.
- `npm test` includes email identity/count consistency and notification-time snapshot checks.
- Verification: production build, lint, TypeScript, all ten tests, and browser checks passed for every email preview, keyboard selection, notification-time values, all four navigation tabs, and 1440/1280/400px layouts. No runtime exceptions or backend mutation requests were observed.

## Implemented backend baseline Replay (7 Nov 2026)

- `/replay/baseline` is separate from the `/replay` sample demo. All four sample navigation tabs are enabled; earlier inactive-tab notes are historical.
- Server-only `IDEAX_BACKEND_URL` defaults to `http://127.0.0.1:8000`; see `.env.example` and README. The backend must prepare its database separately.
- `GET /api/baseline` uses `lib/data.ts` and `lib/backend-client.ts` for allowlisted read-only API requests, response validation, and complete pagination. No frontend SQLite, Python, frozen-input, or backend `.env` access.
- Only completed baseline runs play. Scores and severities remain API values. The clock filters event-time records; unavailable tuned/evaluator/email metrics stay explicitly unavailable. No sample fallback. Failed reloads retain the previously loaded run.
- Run tuning remains disabled. Tuning, Audit log, and Emails are still clearly marked sample screens.
- `npm test` includes backend adapter validation and pagination checks (15 tests total). Browser verification used a temporary backend database; the configured backend database was unavailable and was not created or modified.

## Implemented Ask IDEA-X frontend (7 Nov 2026)

- Floating chat follows the supplied Chat screenshots, with suggestions, keyboard/pointer Pick on Replay alerts/groups, frozen snapshot context, in-memory history, source references, cancellation, retry and edit recovery.
- Available on sample Replay, a loaded backend baseline run, Tuning, Audit log and Emails. Selected run/attempt/email changes reset the conversation.
- Frontend only by explicit team split: no OpenAI key, provider call or chat server route is implemented. `lib/chat.ts` calls the proposed same-origin `POST /api/chat`; `CHATBOT.md` defines the teammate handoff contract. Until connected, the UI reports that chat is not connected and never fabricates answers.
- Production build, lint, TypeScript and all 20 tests passed. Browser checks covered keyboard picking, questions/error recovery, selected-attempt context, Emails integration and 400/1280px layouts. Live OpenAI answers remain unverified until the teammate connects the endpoint.

## Baseline Replay polish (7 Nov 2026)

- Signature-first rows, expandable rule IDs and provenance, selected-row styling, and keyboard-scrollable tables.
- Opening evidence pauses playback; evidence has its own retry. Loading, empty, and connection failure states include recovery guidance. Run tuning remains disabled with a visible explanation.
- Verified lint, build/TypeScript, 20 tests, and Chrome keyboard/retry/outage/responsive checks. Existing chat integration preserved.

## Comparison preview (7 Nov 2026)

- `/replay/comparison` uses shared Replay rendering with sample dataset/pair selectors and explicit SAMPLE labels. Failed pairs cannot play; actual backend results are never mixed with fixtures.
- `lib/comparison.ts` defines the provisional presentation boundary. Real tuned comparison integration still needs paired saved outputs and evaluator metrics from Melvin.
- Public API baseline verified: dataset/run 1, 5,483 alerts, duration 9,600 seconds, evidence available. Connection URL belongs in ignored `.env.local`. No keys in Git.

## Backend saved Tuning / Audit (7 Nov 2026)

- `/tuning/backend` and `/audit/backend` read saved attempts through `GET /api/saved-tuning`, using the shared `lib/data.ts` source module. Samples remain separate at `/tuning` and `/audit`.
- Nested iteration pagination, ownership/selection checks, allowlisted flow/evaluation/guardrail/change fields, failure retention, and explicit empty states. No backend paths or raw provider diagnostics forwarded.
- Run tuning is disabled. Accepted-in-attempt history is distinct from current activation. Zero-denominator recall is N/A; benign raised > 0 is red.
- Build, lint, TypeScript, 27 tests, and browser checks passed. The public API currently returns no attempts; populated-state UI checks used test-only browser responses, not shipped fixtures.

## Default saved dashboard (7 Nov 2026)

- `/replay`, `/tuning`, and `/audit` now default to backend data; earlier sample-default notes above are historical. Samples remain at `/replay/sample`, `/tuning/sample`, `/audit/sample`; Emails and `/replay/comparison` remain explicitly labeled samples. Existing backend-specific URLs still work.
- `GET /api/replay?dataset_id=ID&run_id=BASELINE_ID` uses `getSavedReplayData()` and `lib/saved-replay.ts`, forwarding only an allowlisted, validated complete backend `/api/runs/{baseline_run_id}/replay` projection. Use the existing server-only `IDEAX_BACKEND_URL`; restart the Python API after changing routes.
- Replay selects the canonical dataset and latest completed baseline, opens at the saved final snapshot, and offers Play replay, Restart, Show final, and all three speeds. All counts, reductions, scores, bands and score histories come from the backend. The first 50 rows/groups render initially with Show more; totals cover every event. Opening grouped evidence pauses playback. Existing chat controls remain.
- Only accepted versions on the exact baseline with complete same-event evidence may populate Tuned rules. No accepted run means unavailable, never sample results or a fabricated zero. Full-run evaluation metrics include their evaluation/run IDs; empty denominators show N/A. Email delivery counts and attack-window overlays remain unavailable.
- The configured live database has baseline run #1 with 5,483 alerts and no tuning attempts. Chrome verified counts, playback, failed refresh retention/retry, saved empty history, separate samples, and 1440/1280/400px layouts without uncaught exceptions. Backend tests cover populated accepted-run histories in temporary databases; no live tuning or database writes were performed by this integration.
## Navigation and history (7 Nov 2026)

- Replay source tabs are Backend (`/replay`) and Sample demo (`/replay/comparison`). The full saved Original/Tuned replay remains the backend default; `/replay/baseline` remains available for the standalone evidence table.
- Backend main navigation stays backend for Replay/Tuning/Audit. Emails is sample-only and labelled accordingly.
- Saved attempt links open `/replay?dataset_id=ID&run_id=ID`. Both Replay routes validate query values and backend ownership/completion before showing data.
- Rule history uses the read-only `/api/rule-history` frontend adapter, with backend depth-cursor pagination and lineage checks; Replay and saved attempt details show statuses, ancestors, and recorded changes. No full raw snapshots or rule writes.
- Reconciled with the full saved Original/Tuned dashboard: both read adapters are retained, default Replay supports validated deep links, and baseline/tuned rule history appears on the full replay. Build, lint, TypeScript, all 35 frontend tests, and live browser deep-link/history/navigation/responsive checks passed; real run #1 still loads all 5,483 alerts.

## Play and local tuning jobs (7 Nov 2026)

- Tuning progress renders the backend's timestamped stage log, including setup failures before an audit attempt is created, provider HTTP failures, evaluation totals and terminal state. Older backends without logs show a restart hint. Raw exceptions and credentials are excluded.

- Current operator update: the separate Replay header Run tuning button is removed. Play still offers Start tuning and play. Replay initially pauses at zero; both lanes are held during tuning and until the accepted saved comparison loads, then autoplay together. Group details expose every original member, including repeats suppressed from the top-level grouped list; no alert is deleted. Audit displays saved benign-escalation warnings under the current warning policy; evidence retention and runtime benign non-escalation remain mandatory.

- Replay's primary label is Play/Pause. Without accepted tuned results, Play opens a modal offering Start tuning and play, Play original alerts, and Cancel. The Replay header's Run tuning button uses the same modal. A passing job reloads saved results and autoplays; failure preserves original alerts and links to Audit. Existing sample screens and history-only tuning controls remain separate.
- `/api/tuning-jobs` is the same-origin Next.js control proxy. It forwards only validated baseline and idempotency IDs to the loopback Python API, validates job status, polls progress, and never handles credentials. Cross-origin writes and remote backend control are rejected. Models, policy, evaluation definitions and credentials cannot be supplied by a browser request.
- Python alone loads CODEX_API_KEY/CODEX_MODEL from its process environment or root .env; the dashboard default is gpt-6.1-sol. Do not copy the key into fe/.env.local. A database-adjacent OS lock serializes dashboard workers. Status jobs are transient across API restarts; SQLite attempts/runs remain the durable audit.
- Verification: 70 backend tests, 38 frontend tests, lint, TypeScript and production build pass. The live model attempted three proposals on baseline #2, all rejected because 33 benign-labeled groups were raised. Baseline remains available. Accepted-run automatic playback was browser-verified using a temporary test database response, never a live test activation.

## Simplified dashboard (7 Nov 2026)

- This section supersedes earlier route/navigation descriptions. Only Replay, Audit log, and Email remain. Replay is the saved same-event SIEM 1/SIEM 2 comparison, with no Backend/Sample tabs or saved dataset/run selectors. The canonical dataset and latest completed baseline load automatically; validated audit deep links still work. Refresh/retry, playback, grouped evidence, and local tuning jobs remain available.
- Removed separate Replay baseline/sample/comparison pages, Tuning pages, and sample/backend Audit pages. Old Replay URLs redirect to `/replay`; old Tuning/Audit variants redirect to `/audit`.
- Audit automatically opens the latest attempt and shows every saved iteration in order, with grouped-alert counts, evaluation, guardrail status, old/new rule parameters, flow/delta gaps, and per-candidate rule history. Failed iterations remain visible. Refresh log refreshes both the list and the open detail. There are no dataset or iteration selectors.
- `/emails` stays explicitly sample-only and is titled Email. It lists tuned group previews with notification-time values and a separate full-group snapshot/table of every clustered source log. Later members are marked Joined later. Sample scores and memberships come from saved fixtures through `lib/data.ts`; labels are excluded from the presentation data. No emails are sent.
- Verification: production build (including TypeScript), lint, and all 38 existing frontend tests passed. Local production HTTP checks passed for the three remaining screens, absence of saved selectors, all 11 legacy redirects, and preserved Replay query IDs. Direct loader checks verified all three tuned emails retain exact complete group membership without labels, with notification values separate from later group updates. The configured dataset API returned HTTP 200. Interactive browser/responsive checks were unavailable in this session; no tuning job or email was started.

## Replay control update (7 Nov 2026)

- Play starts tuning directly when no accepted comparison exists, without a modal. With accepted results it plays the saved comparison. Retune replaces Restart and always creates a fresh tuning attempt from the original baseline rules, not a continuation of the accepted version. Successful tuning reloads and autoplays both lanes.
- Removed Retry/Refresh comparison, which only fetched saved results. Job progress polling and automatic result loading remain. Startup errors stay visible with saved results; rapid clicks are guarded and uncertain startup retries reuse the request ID to avoid duplicate jobs.
