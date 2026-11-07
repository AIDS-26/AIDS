# IDEA-X design

## Where it lives

Figma file with the old AIDS work. Page **"IDEA-X"** holds:
- Frame **"IDEA-X Library"**: all IDEA-X components, grouped in rows (Brand, Navigation, Badges, Controls, Feedback, Replay, Replay charts, Tuning, Audit, Emails).
- Screens (1440 wide, hug height): "IDEA-X · Replay", "IDEA-X · Tuning", "IDEA-X · Audit log", "IDEA-X · Emails".
Page "Dashboard" still holds the legacy AIDS dashboard and its library (Badge/Severity, Card, Button/Primary, Button/Secondary, Input/Search, Table/Anomaly*, Navigation/DashboardHeader, Icon/*). IDEA-X reuses Badge/Severity and the Buttons only.

Export each screen as PNG into `docs/design/screens/` so agents without Figma access can see them.

## Styles in the file

Colours: Color/primary #004488, secondary #6A9DCF, accent #BD2024, canvas #FFFFFF, surface #F2F2F2,
ink #020202, muted #526273, border #D8E0E8, blueTint #EAF3FC, redTint #FCECED, green #1F7A4D,
greenTint #EAF7EF, yellow #946200, yellowTint #FFF4D6, logBg #0F1720, logText #C9D4DF,
logBlue #8DB8E6, logGreen #7FD3A6, logRed #FF8A8D.
Text: Type/PageTitle (Inter Semi Bold 24/30), Type/Heading (16/24), Type/Metric (30/36), Type/Display
(44/48), Type/Score (20/24), Type/Body (Regular 13/20), Type/BodyStrong (Semi Bold 13/20),
Type/Label (Medium 12/18), Type/Small (Regular 11/16), Type/Mono (JetBrains Mono 12/18).

## Components (name → variants → text properties)

| Component | Variants | Properties |
|---|---|---|
| Brand/Logo | — | — |
| Navigation/Tab | State = Default, Selected | Label |
| Navigation/AppHeader | — | Source; tabs exposed ("Tab · Replay" …) |
| Badge/Status | Tone = Pass, Fail, Neutral, Info | Label |
| Badge/Severity (legacy) | Level = High, Medium, Low | Label |
| Control/SegmentItem | Selected = False, True | Label |
| Control/SpeedSelector | — | 3 exposed SegmentItems |
| Input/Number | — | Value, Suffix |
| Feedback/Notice | — | Message |
| Card/Stat | Tone = Default, Good, Alert | Value, Label |
| Card/StatInput | — | Label; exposed Input/Number |
| Chart/Timeline | — (static picture) | — |
| Panel/LaneSummary | Lane = Original, Tuned | Title, Subtitle, Count, Unit, High, Medium, Low, Emails |
| Lane/AlertRow | — | Time, Rule, Host; exposed Severity badge |
| Card/GroupAlert | Tone = High, Medium, Low, Benign | Title, Meta, Score |
| Card/GroupDetail | — | Why, Note; 3 exposed AlertRows |
| Table/GapHeader | — | — |
| Table/GapRow | Direction = Over, Under | Rule, S, Observed, Allowed, Gap, Change |
| List/CheckItem | State = Pass, Fail | Text |
| Code/DiffLine | — | Rule, Old, New, Why |
| Code/LogLine | Tone = Command, Plain, Pass, Fail | Text |
| Table/RunHeader | — | — |
| Table/RunRow | State = Default, Selected | Run, Started, Budget, Attempts, Alerts, Rules, Recall; exposed Result badge |
| List/Bullet | — | Text |
| Card/AuditStage | — | Label, Title, Files; 3 exposed items |
| List/EmailItem | State = Default, Selected | Subject, Time, Meta |
| List/FieldRow | — | Label, Value |
| Card/EmailPreview | — | Intro, Footnote; exposed FieldRows + button |

## Scripts (Scripter plugin, run inside Figma)

`figma-scripts/` in run order: 00 inventory (read-only) · 01 foundation · 02 replay · 02b replay tweaks
(dry run first) · 03 tuning · 04 audit + emails. All add-only scripts skip what exists. To change the
design, use skill `figma-screen-builder`: inventory first, dry run for anything that changes existing
components, never detach instances.

## Known design follow-ups

- Tuning: move the Codex log under the gap table to balance columns.
- Tuning: budget card reads "20 alerts / hour analyst budget"; better "analyst budget" as a label above.
- A copy of the Tuning screen showing failed attempt 1 (✕ guardrail line) for the demo story.
