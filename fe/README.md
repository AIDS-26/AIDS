# IDEA-X frontend

Next.js App Router + TypeScript + Tailwind. Run commands in this directory.

## Screens

- /replay: the single SIEM 1 (Original rules) vs SIEM 2 (Tuned rules) comparison. The canonical dataset and latest completed baseline load automatically, without data-source tabs or saved-result selectors. Old Replay variants redirect here.
- /audit: all saved tuning attempts, including failures. The latest attempt opens automatically. Each iteration shows grouping counts, evaluation, guardrail outcomes, rule changes, and candidate rule history. Refresh log reloads both the attempts and the open detail. Old Tuning and Audit variants redirect here; there is no separate Tuning page.
- /emails: titled Email, explicitly sample-only. Shows tuned group email details and all clustered source logs. Notification-time scores/counts remain separate from the complete saved group snapshot; later members are marked Joined later. No emails are sent.

## Backend connection and Replay

Start the Python API from the repository root with python -m app.api. Prepare the database separately using the root README. The frontend never imports source events, connects to SQLite, attaches evaluation labels, or reads the backend environment file.

The server-only IDEAX_BACKEND_URL defaults to http://127.0.0.1:8000. Configure another origin in .env.local using .env.example and restart Next.js. Keep credentials out of frontend environment files. The browser uses same-origin /api/baseline, /api/replay, /api/saved-tuning, and /api/rule-history adapters. These validate ownership, pagination and allowed response fields.

Replay starts paused at zero. Play/Pause, Show final, and 60x/120x/360x use saved frames. Retune starts a fresh tuning attempt from the original baseline rules. Opening grouped evidence pauses playback. Lists initially render 50 entries, with Show more controls; totals include all records. Validated links such as /replay?dataset_id=1&run_id=2 still open a particular baseline.

Only completed, accepted tuned runs on the same baseline with complete same-event evidence populate the tuned lane. Without one, tuned results remain unavailable. No synthetic fallback or frontend scoring occurs. Failed reloads retain the previous snapshot with an error. Empty attack-group denominators show N/A; positive benign escalation counts are red. Labels grade offline results only and never determine runtime benign status.

## Local tuning jobs

Play without an accepted tuned result directly starts a backend tuning job with up to three proposals. Retune always starts a fresh attempt from the original baseline, without continuing a previously accepted version. Both actions hold playback while tuning; there is no interstitial. Retry/Refresh comparison was removed; it only reloaded saved results. The deterministic guardrail controls activation. A passing job reloads the accepted results and plays; a failure preserves original alerts and links to Audit log.

The /api/tuning-jobs control forwards only validated baseline/request IDs to the loopback Python API. Python alone reads CODEX_API_KEY and CODEX_MODEL from its environment or root .env. The dashboard default model is gpt-6.1-sol. Remote read APIs are supported, but tuning control requires a local backend. Jobs are transient across API restarts; saved audit history remains in SQLite. Loading any page never starts a model call.

## Email sample and chat

lib/data.ts is the fixture boundary. Email joins the existing notification fixtures to saved tuned group memberships and sanitized original alerts; scores and bands are displayed unchanged. Sample email previews are separate from real Replay results and never represent production delivery.

The existing Ask IDEA-X interface uses the proposed same-origin POST /api/chat contract in CHATBOT.md. Without that endpoint it reports a connection error and does not fabricate answers.

## Commands

- npm install
- npm run dev (http://localhost:3000)
- npm run build
- npm run start
- npm run lint
- npx tsc --noEmit
- npm test (Node 22.6+ with TypeScript stripping)

On Windows PowerShell with script execution disabled, use npm.cmd and npx.cmd. Dev/build use Webpack following earlier Windows Turbopack worker failures. Google fonts require build-time network access and are self-hosted at runtime.
