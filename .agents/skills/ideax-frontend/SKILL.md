---
name: ideax-frontend
description: Build the IDEA-X dashboard in Next.js + Tailwind to match the Figma design, covering the four screens (Replay, Tuning, Audit log, Emails), design tokens, the Figma-to-React component map, replay playback behaviour, and the rules that keep it from looking AI-made. Use for any UI, styling, component, chart or page work on IDEA-X, even if the user only says "the dashboard", "the page", "make it look like Figma" or names a screen.
---

# IDEA-X frontend

Design source: Figma page **"IDEA-X"** (library frame "IDEA-X Library" + screens "IDEA-X · Replay",
"IDEA-X · Tuning", "IDEA-X · Audit log", "IDEA-X · Emails"). Screen-by-screen spec:
`references/screens.md`. Clickable sketch: `docs/reference/ideax-brief.html` (Mockup section).
Data shapes: skill `ideax-data-contracts`. Never compute scores in the UI; display pipeline output.

## Stack

Next.js App Router, TypeScript, Tailwind, self-contained in `fe/` (routes in `fe/src/app/`). Routes `/replay` (default), `/tuning`, `/audit`, `/emails`.
Client components only where needed (replay clock, tabs, budget input). Charts: hand-drawn SVG or
Recharts. Keep everything readable at 1440 px wide; must not break at 1280.

## Design tokens (from the Figma styles; use these names in tailwind.config)

| Token | Hex | Use |
|---|---|---|
| primary | #004488 | Brand, primary buttons, selected tab, Info |
| secondary | #6A9DCF | Notice left border, secondary accents |
| accent | #BD2024 | High severity, Fail, alarms only |
| canvas | #FFFFFF | Page and card background |
| surface | #F2F2F2 | Table headers, chips, library background |
| ink | #020202 | Main text |
| muted | #526273 | Secondary text |
| border | #D8E0E8 | All 1px borders and dividers |
| blueTint | #EAF3FC | Selected rows, notice background |
| redTint | #FCECED | High badge, Fail badge, Alert stat |
| green | #1F7A4D | Low badge text, Pass, tuned numbers |
| greenTint | #EAF7EF | Low badge, Pass badge, Good stat |
| yellow | #946200 | Medium badge text |
| yellowTint | #FFF4D6 | Medium badge |
| logBg / logText | #0F1720 / #C9D4DF | Codex log box |
| logBlue / logGreen / logRed | #8DB8E6 / #7FD3A6 / #FF8A8D | Log command / pass / fail lines |

Type (Inter; mono = JetBrains Mono): PageTitle 24/30 semibold · Heading 16/24 semibold ·
Display 44/48 semibold (lane counts) · Metric 30/36 semibold · Score 20/24 semibold ·
Body 13/20 regular · BodyStrong 13/20 semibold · Label 12/18 medium · Small 11/16 regular ·
Mono 12/18. Use `tabular-nums` for all numbers.

Shape: radius 4 (badges, inputs, rows) and 6 (cards). 1px borders. No shadows.
Layout: header 1440 wide, body padding 20/32, section gap 16.

## Component map (Figma → React)

| Figma component | React component | Notes |
|---|---|---|
| Brand/Logo | `Logo` | mark SVG from `assets/brand/ideax-mark.svg` + "IDEA-X" + tagline |
| Navigation/AppHeader, Navigation/Tab | `AppHeader`, `Tab` | 4 tabs, selected = primary text + 2px underline; data-source chip right |
| Button/Primary, Button/Secondary | `Button variant` | existing AIDS components, label only |
| Control/SpeedSelector, Control/SegmentItem | `Segmented` | 60× / 120× / 360×; also attempt switch |
| Input/Number | `NumberInput` | budget, suffix "alerts / hour" |
| Card/Stat (Tone Default/Good/Alert), Card/StatInput | `StatCard`, `StatInput` | compact 44px strip under controls |
| Badge/Severity (High/Medium/Low) | `SeverityBadge` | existing component |
| Badge/Status (Pass/Fail/Neutral/Info) | `StatusBadge` | Passed, Failed, Benign |
| Feedback/Notice | `Notice` | blue tint, 3px left border |
| Chart/Timeline | `Timeline` | cumulative original (ink) vs tuned (green), red attack windows from labels, dashed "now" line |
| Panel/LaneSummary (Original/Tuned) | `LaneSummary` | title, subtitle, big count left, High/Medium/Low/emails right |
| Lane/AlertRow | `AlertRow` | time, rule, host, severity badge |
| Card/GroupAlert (High/Medium/Low/Benign) | `GroupCard` | 4px colour stripe, title, meta, score |
| Card/GroupDetail | `GroupDetail` | opens under a clicked group: why line + its original alerts |
| Table/GapHeader, Table/GapRow (Over/Under) | `GapTable` | gap red if over, blue if under; change in mono |
| List/CheckItem (Pass/Fail) | `CheckItem` | ✓ green / ✕ red |
| Code/DiffLine | `DiffLine` | `rule.field: old → new` mono + reason |
| Code/LogLine (Command/Plain/Pass/Fail) | `LogLine` | inside dark log box |
| Table/RunHeader, Table/RunRow | `RunsTable` | selected row blue tint |
| Card/AuditStage, List/Bullet | `AuditStage` | before / changes / after |
| List/EmailItem, List/FieldRow, Card/EmailPreview | `EmailList`, `EmailPreview` | |
| Card (existing AIDS metric card) | not used in IDEA-X | replaced by Card/Stat |

## Look and feel (don't make it look AI-made)

No purple, gradients, glow, sparkle/robot icons, chat bubbles or typing effects. Codex appears as a
"tuning run" with a status and a log, like a build job. Colour is for meaning only: red High/Fail,
amber Medium, green Low/Pass/tuned, grey benign. Dense tables and real units (IPs, times, per hour).

## Replay behaviour

- Simulated clock over the alert timeline; speeds 60×, 120×, 360×; Play/Pause, Restart.
- Left lane: newest original alerts at the top (cap the visible list, e.g. last 50).
- Right lane: groups sorted by score then recency; a card updates its count/score from `timeline`;
  "raised from X" shows when the band changed. Clicking a card toggles its GroupDetail.
- Counters and the summary strip update with the clock; final values must equal evaluate().
- Notice under the lanes: "Attack/benign labels from CIC-IDS2017 are used only to grade results and to weight the offline tuning. At runtime, benign comes from the rule definition."

## Tuning behaviour

- Shows the latest run (or the selected run from Audit log). Budget input recomputes allowed/gap
  only as a preview label; the real numbers come from the run files.
- "Run tuning again" → POST `/api/tune` → server spawns `codex exec` → stream or poll log → on finish
  load the new `tuning_run.json`. On error or timeout keep showing the last saved run with a notice.
