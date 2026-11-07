# IDEA-X handoff: status, decisions, open questions

Written 7 Nov 2026, morning of the hackathon. Owner of this handoff: Tina (design, frontend, QA).

## Event facts

- Sea × OpenAI Regional Codex Hackathon, Indonesia. Sat 7 Nov 2026, Jakarta.
- Hacking 09:30 → **code submission 16:30 sharp** (Google Form). Late = disqualified.
- Round 1: 6 min demo/pitch + 2 min Q&A to two judges. Top 5 → final on stage, same format. English only.
- Judges "judge the product, not the pitch". Criteria: problem & solution fit, build quality, insight &
  originality, real-world value, alignment with a build direction, use of Codex.
- Submit: new public GitHub repo, project writeup (problem, solution, build direction, how Codex was
  used), demo link (optional), declarations (existing OSS used, what was built on the day).
- Rules: arrive with ideas; all building on the day. Pre-built code and existing projects cannot be
  submitted. Team confirmed designs may be prepared in advance.

## Decisions already made

| Topic | Decision |
|---|---|
| Name | IDEA-X (organizers asked to drop "AIDS") |
| Authority | The newest PDF (`docs/reference/codex-sre-delta-gap.pdf`) wins over all older notes |
| Scope | PDF only: group + escalate, never suppress; guardrail is the gate; no human approve step |
| Benign at runtime | From the rule definition (rules marked benign in base_rules.yaml). Labels only for evaluation and the offline 0.2 evidence weight |
| Codex at runtime | Codex CLI in the loop (`codex exec`), started by the app's API route |
| Stack | Next.js + Tailwind frontend in `fe/`, Python pipeline (folders per root AGENTS.md) |
| Hosting | Live demo on laptop; optional read-only Vercel copy for the demo link |
| UI naming | "Original rules" / "Tuned rules", "grouped alerts", tabs Replay · Tuning · Audit log · Emails |
| Look | Brand palette, Inter, flat, dense, no "AI look" (no purple, gradients, sparkles, chat bubbles) |
| Numbers to quote | From `evaluate()` on the real run (per-rule settings), not the replay page's global settings |

## What exists already (prepared before the event, declare it)

- Design: Figma page "IDEA-X" with a component library and 4 hi-fi screens (Replay, Tuning, Audit log,
  Emails). Built with Scripter scripts in `docs/design/figma-scripts/`. Details: `docs/design/README.md`.
- Brand: IDEA-X logo SVGs in `assets/brand/`.
- Clickable mockup + plain-language brief: `docs/reference/ideax-brief.html` (open in a browser).
- Pitch deck (16 slides) and its handoff skill `ideax-pitch`.
- Data: precomputed Suricata `eve.json` from CIC-IDS2017 Thursday (Drive folder), 5,483 alerts.
- No product code. Everything in `fe/` and the pipeline folders is written today.

## Reference numbers (from the PDF; replace with today's run)

- Replay with one global setting (W 5 min, N_sat 60): 5,483 alerts → 112 grouped, 7 High, 7 emails, 0 benign raised; original rules sent 1,535 emails.
- Codex per-rule settings via `evaluate()`: 5,483 → 46 grouped alerts.
- Sample flow: 373 alerts/h vs budget 20/h → burn rate 18.6×. Gap table in skill `ideax-domain`.
- Mid-replay snapshot used in the designs: clock 1:55:26, original 4,427 alerts (756 High), tuned 61 groups, 3 emails.

## Open questions (settle at kickoff, then update this file)

1. **Recall definition:** what counts as an attack group "caught"? (Faris/Melvin)
2. **Window meaning:** does a group stay open while events keep arriving within W of the last one
   (session window), or close W after the first? The PDF replay behaviour implies the first.
   What happens to an event exactly W later?
3. **Rounding:** Python `round()` is banker's rounding (4.5 → 4), JS `Math.round` gives 5. Use one rule
   (round half up) and compute scores in one place only (the pipeline); the UI only displays.
4. **Bounds:** max W for rules with S ≥ 8 (5 min in the designs), allowed W range, N_sat ≥ 2.
5. **JSON contracts:** confirm the shapes in `ideax-data-contracts` before anyone builds against them.
6. **Run storage:** where runs are saved (`runs/<id>/`) and how the UI lists them.
7. **Attempt 1 failure in the designs is illustrative.** Show whatever really happens.

## Suggested order for the frontend today

1. Scaffold Next.js + Tailwind in `fe/`, set tokens from `ideax-frontend` (≈20 min).
2. Static Replay screen from sample JSON matching the contracts (the demo centrepiece).
3. Replay playback: simulated clock, speeds, live counters, chart, group cards, click-to-expand.
4. Tuning screen reading `tuning_run.json` + `flow_table.json`; then the "Run tuning" API route.
5. Audit log and Emails (lower priority; Emails can stay static).
6. 15:30: freeze features, QA numbers against `evaluate()`, record a backup screen video.
7. 16:15: README, writeup, declarations; submit before 16:30.
