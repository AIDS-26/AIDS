# fe/AGENTS.md: IDEA-X dashboard (frontend)

Loaded on top of the root `AGENTS.md` when Codex starts in `fe/`. Owner: Tina.
Full spec: skill `ideax-frontend` (tokens, Figma → React component map, screen-by-screen spec).
Data shapes: skill `ideax-data-contracts`.

## Stack

- Next.js (App Router) + TypeScript + Tailwind, self-contained in `fe/` (routes in `fe/src/app/`).
- Screens: `/replay` (default, the demo centrepiece), `/tuning`, `/audit`, `/emails` (lowest priority, static is fine).
- Record the real install/dev/build commands here once they exist (e.g. `npm install`, `npm run dev`).

## Rules

1. **Display, don't compute.** Scores, bands, groups, recall and reductions come from pipeline/run files.
   The UI never recomputes a score or a band. Show the run id the numbers come from.
2. **Data access.** Read derived files (`data/derived/…`, `runs/<run_id>/…`) through server code (route
   handlers or server components), or a copy step into `fe/public/data/`. Never read `demo_freeze/` directly
   for display numbers, and never write into it.
3. **Run tuning.** `POST /api/tune` (server only) spawns `codex exec` with `tuner/tuning_task.md` (or the agreed
   path), streams or polls the log, then loads the new run. On error or timeout, keep showing the last saved
   run with a visible notice. This only works locally; a Vercel copy is read-only with the button disabled.
4. **Honesty in the UI.** Keep the notice on Replay: attack/benign labels from CIC-IDS2017 are used only to
   grade results and weight the offline tuning; at runtime, benign comes from the rule definition. Show failed
   attempts and failed runs. "Benign groups raised" must turn red if it is ever above 0.
5. **Names.** "Original rules" / "Tuned rules", "grouped alerts", tabs Replay · Tuning · Audit log · Emails.
   Never "SIEM I/II" or "AIDS" in the UI.
6. **Look.** Match the Figma page "IDEA-X" (PNG exports in `docs/design/screens/`). Brand tokens only, Inter
   + JetBrains Mono, 1px borders, radius 4/6, no shadows. No purple, gradients, glow, sparkle/robot icons or
   chat bubbles. Colour is meaning: red High/Fail, amber Medium, green Low/Pass/tuned, grey benign.
7. **Placeholders.** Until the pipeline delivers, use sample JSON under `fe/fixtures/` that matches the
   contracts and is clearly marked "sample". Remove or switch off before the demo.

## Before the demo (15:30)

Final replay numbers equal `evaluate()`; same result at 60× / 120× / 360×; no "sample" data left;
backup screen recording saved. Use skill `ideax-qa`.
