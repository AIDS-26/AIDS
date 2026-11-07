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

Live tuning and real pipeline integration remain deferred. Future navigation is inactive. No emails are sent and no evaluator claim is made. Routes remain in the existing `app/` directory.

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
