# fe/AGENTS.md: IDEA-X dashboard (frontend)

Loaded on top of the root `AGENTS.md` when Codex starts in `fe/`. Owner: Tina.
`fe/` is the client-facing SIEM frontend (it replaces the old `siem/` placeholder).
Full spec: skill `ideax-frontend` (tokens, Figma → React component map, screen-by-screen spec).

## Stack

- Next.js (App Router) + TypeScript + Tailwind, self-contained in `fe/` (scaffolded with create-next-app).
- Screens: `/replay` (default, the demo centrepiece), `/tuning`, `/audit`, `/emails` (lowest priority, static is fine).
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
5. **Names.** "Original rules" / "Tuned rules", "grouped alerts", tabs Replay · Tuning · Audit log · Emails.
   Never "SIEM I/II" or "AIDS" in the UI.
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
- `/` redirects to `/replay`. The Replay page loads clearly labeled synthetic JSON through `fe/lib/data.ts`; the agreed backend API can replace this source module.
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
