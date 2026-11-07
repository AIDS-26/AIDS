# IDEA-X frontend

Next.js App Router + TypeScript + Tailwind. `/` redirects to `/replay`.

## Commands

- `npm install`: install dependencies.
- `npm run dev`: development server at http://localhost:3000.
- `npm run build`: production build.
- `npm run start`: serve the production build.
- `npm run lint`: ESLint.
- `npx tsc --noEmit`: TypeScript check.
- `npm test`: Node tests for playback timing, frame boundaries, speed equivalence, and fixture integrity (Node 22.6+ with TypeScript stripping).

## Sample replay

Press Play to begin at zero. Pause freezes the clock. Choose 60×, 120×, or 360× without resetting progress. Restart returns to zero and pauses, retaining the selected speed. Playback stops at 2:41:00; all speeds finish with 12 original alerts and five groups. Expand group cards with mouse or keyboard to inspect the original alerts available at the current clock.

The fixture source is isolated in `lib/data.ts`. Scores, bands, reductions, and summary totals are saved in `fixtures/replay_frames.json`; the client only selects the current frame. This sample shape remains provisional pending the backend API agreement. The page labels its synthetic data and run `sample-001` throughout.

Live tuning remains deferred. All four sample tabs are available; backend baseline Replay is separate. No emails are sent and no evaluator claim is made. Routes remain in the existing `app/` directory.

Dev/build scripts use Webpack and Tailwind PostCSS because the original Turbopack CSS worker repeatedly failed to connect on this Windows environment. Inter and JetBrains Mono use `next/font/google`, requiring font access at build time and self-hosting at runtime.

## Sample Tuning

`/tuning` follows the Figma export with a saved budget, flow/gap table, selectable failed/passed attempts, guardrail checks, rule changes, YAML preview, and sample logs. `lib/data.ts` is shared by Replay and Tuning; all fixture imports stay there.

The Tuning design example (`sample-tuning-003`) is separate from Replay's 12-event sample. Its 5,483-alert figures are illustrative, not measured results. Selecting an attempt updates its proposed count, changes, checks, YAML, and log together. No evaluator runs. The YAML preview is a sample change list, not a loadable rules schema.

The budget is read-only and Run tuning again is disabled. The frontend will call the backend's endpoint once agreed; it never starts Codex. Empty attack-group denominators display recall as N/A.

## Sample Audit log

`/audit` uses `getAuditData()` in the shared `lib/data.ts` module. Three illustrative run records come from `fixtures/audit.json`; selecting a row or its keyboard-accessible run button updates the before/change/after cards, outcome, and expandable attempt history.

Run #3 agrees with the existing Tuning fixture. Failed run #2 retains all three failed attempts, labels its 31-group proposal as not used, and shows the 5,483-alert baseline retained. Artifact names are informational references, not downloadable files. Metrics are supplied in JSON; no evaluator or backend is invoked.

## Sample Emails

`/emails` follows the three-column Figma layout: Original rules previews, Tuned rules previews, and a selectable message detail. `getEmailsData()` in `lib/data.ts` supplies `fixtures/emails.json`. Both lists support pointer and keyboard selection, and the preview links back to Replay.

Counts agree with Replay (`sample-001`): four original previews and three tuned previews at the saved 1:55:26 snapshot. Preview content preserves the score, band, membership, and event count at notification time; it does not borrow the final group state. Missing rule settings are displayed as not supplied. No inbox is connected and nothing is sent.

## Backend baseline Replay

Open `/replay/baseline`, or choose **Backend · Original rules** on Replay. `/replay` remains the separate synthetic sample demo. Choose a dataset, then a completed Original rules run. Failed, unfinished, and tuned runs are listed but cannot be selected. Run tuning stays disabled.

Start the backend read API from the repository root with `python -m app.api --port 8000`. Its database must already be migrated, imported, and baseline-scored by the backend team; the frontend does not perform those operations. Copy `.env.example` to `.env.local` only if configuring a different API origin, then restart Next.js. The default is `http://127.0.0.1:8000`. `IDEAX_BACKEND_URL` is server-only, accepts HTTP loopback or HTTPS origins, and must not contain credentials or a path. Browsers call the same-origin Next.js route, so backend CORS configuration is not needed for this adapter.

`lib/data.ts` delegates to the validated read-only adapter in `lib/backend-client.ts`. `GET /api/baseline` supports datasets, runs, calculated alerts, and evidence only. All pages are loaded before playback; duplicate or invalid pages, missing scores, and partial failures are rejected. Requests bypass caches, time out after 20 seconds per paginated resource, and stop at 100,000 records. No database, frozen input, backend environment file, or raw labels are accessed by frontend code. No synthetic fallback is used.

The demo clock starts at the first calculated alert and uses the saved run's observation duration. Ordering is event timestamp, source line, then alert ID; events at the clock boundary are included. Play/Pause, Restart, and 60×/120×/360× share the tested playback reducer. The table shows the latest 50 elapsed records, with selectable saved evidence. Record counts are presentation counts; scores and severities are passed through unchanged. Tuned results, evaluator metrics, comparison chart, and email metrics remain unavailable. A failed reload retains the previously loaded run with a visible notice.

Verification used the real Python API with a temporary backend database and all 5,483 frozen input events, imported and scored by backend code. This does not initialize the configured backend database or certify recall. Frontend tests, lint, TypeScript, production build, and Chrome checks covered pagination, selection, evidence, playback, disabled tuning, and 1440/1280/400px layouts.

### Baseline Replay polish

Alert signatures lead each row; full rule IDs and run provenance expand on demand. Opening evidence pauses playback, highlights the selected alert, and exposes its expanded state to assistive technology. Evidence requests can be retried independently. Connection and loading notices provide recovery steps, and failed reloads preserve the last loaded run. Run tuning stays disabled with a visible explanation.

Connection check when the backend is ready:
1. Set the server-only API origin if different from the default, then restart Next.js.
2. Refresh datasets and choose the dataset/run IDs supplied by the backend owner.
3. Confirm the displayed rule version and observation duration under run provenance.
4. Replay to completion and compare loaded record count, saved scores/severity, and selected evidence with that same backend run.
5. Confirm the sample demo stays separate and no tuned/evaluator metrics are claimed.

Polish verification: lint, production build/TypeScript, and all 20 tests passed. Chrome checks covered keyboard evidence opening and pause, evidence retry, expanded identifiers, retained results on failed reload, initial connection errors, and 1440/1280/400px layouts without page overflow or runtime errors.

## Comparison preview and backend connection

`/replay/comparison` reuses the comparison chart, paired lanes, saved metrics, and playback from sample Replay, with dataset and paired-run selectors above them. It is explicitly SAMPLE, independently of backend baseline Replay. A failed sample proposal remains selectable for inspection but cannot play. `fixtures/comparison.json` supplies pair metadata; `getComparisonPreview()` is the source boundary, and `lib/comparison.ts` checks dataset, tuned run, duration, and availability before showing frames. Empty attack sets display recall as N/A.

To connect real comparison results later, the server adapter must provide paired run IDs, identical event provenance and observation duration, saved original alerts, tuned group membership and score/band histories, cumulative frames, and evaluator results. The current API has only a completed baseline run; no tuned endpoint is assumed. The fixture shapes remain a presentation proposal for Melvin to confirm. Never combine real baseline alerts with these sample tuned groups.

The public backend handoff was verified through the frontend adapter: dataset 1, completed baseline run 1, 5,483 alerts, 9,600 seconds, and saved evidence. Configure its current URL locally using `IDEAX_BACKEND_URL`; never commit `.env.local` or API keys. Free ngrok origins receive the browser-warning bypass header on server-side requests. Pagination allows 20 seconds per page and 120 seconds per collection, bounded to 100,000 records. Run tuning remains disabled.

## Saved backend Tuning and Audit

Use **Backend · Saved results** on Tuning or Audit log (`/tuning/backend`, `/audit/backend`). The original `/tuning` and `/audit` screens remain clearly labeled samples. Select a dataset, then a saved attempt. Failed and completed attempts stay visible; iterations show backend evaluation, guardrail outcomes, candidate run/version IDs, and recorded parameter changes. Tuning also displays the saved flow/delta-gap table. A passing iteration is labeled accepted only when it matches the completed attempt's selected version; historical acceptance does not claim current activation. Empty attack denominators display N/A and benign groups raised above zero display red.

`GET /api/saved-tuning?dataset_id=…[&attempt_id=…]` calls the existing dataset attempt-list and attempt-detail routes through `lib/data.ts` and `lib/saved-tuning.ts`. The adapter validates dataset/baseline ownership, unwraps nested iteration pagination, rejects changed attempt status during loading, and allowlists display fields. Backend artifact paths, raw policy/outcome/proposal JSON, and provider/persistence errors are not forwarded. Failed refreshes retain the previous saved view with a notice; switching datasets clears selection. No sample fallback and no POST endpoint are supplied.

Verification: production build/TypeScript, lint, and 27 tests pass. Live API checks confirmed the reachable empty-history state on both screens. Isolated browser responses covered failed/completed attempts, keyboard selection, retained views on errors, zero-denominator recall, red benign counts, and 1440/1280/400px layouts without runtime errors or mutation requests. Populated results from Melvin's deployed database remain unverified until it contains attempts. Run tuning remains disabled; a model is never invoked by these views.
