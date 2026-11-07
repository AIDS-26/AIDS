---
name: ideax-pitch
description: Finish, edit, rehearse or rebuild the IDEA-X pitch deck for the Sea × OpenAI Codex Hackathon (Jakarta, 7 Nov 2026). Use for any task about the IDEA-X deck, its slides, speaker notes, demo script, placeholders, pitch timing, judging criteria, or Q&A prep, even if the user only says "the deck", "the pitch", "slides" or "IDEA-X". Contains the full project context, so no prior knowledge is needed.
---

# IDEA-X pitch deck

You are taking over a finished draft of a 16-slide pitch deck. Your job is usually one of:
filling the placeholders with real numbers, editing slides, rehearsing timing, preparing Q&A,
or rebuilding the deck in another tool. Read this file fully before touching anything.
Read the reference files when the task needs them (list at the bottom).

## 1. The project in 60 seconds

**IDEA-X** = Intrusion Detection Escalation through Agentic reasoning with Codex, eXtended.
(Renamed from "AIDS" at the organizers' request. Never use the old name.)

The problem: security teams get thousands of alerts a day and cannot read them. Real attacks hide
in the noise. IDEA-X does not build a better sensor. It changes how alerts reach people:

1. **Original rules**: Suricata (an open-source network sensor) raises alerts from recorded traffic
   (the public CIC-IDS2017 dataset, Thursday). Each alert is scored alone: `S = min(10, A + C)`
   (A = attack-type weight, C = importance of the target machine). Every High alert sends an email.
2. **Codex tunes, offline**: Codex acts like a site reliability engineer. It measures alerts per hour
   per rule, compares them with what analysts can read (budget B), finds which rules are too noisy or
   too quiet (the "delta gap"), and writes new settings per rule (grouping window W and saturation
   point N_sat) into `tuned_rules.yaml`, with a reason for each change. It tests itself with
   `evaluate()` and revises up to 3 times. A fixed guardrail (plain code) checks the result.
3. **Tuned rules**: the same alerts are replayed. Related alerts (same target + attack type; scanners
   by source) are grouped, and repeats raise the score:
   `X = round(S + (10 − S) × min(1, ln n ÷ ln N_sat))`. Benign alerts keep S. One email per High group.

Pitch line: **"Codex doesn't score alerts. It writes and tests the rules that do."**

In the product UI, "SIEM I" is called **Original rules** and "SIEM II" is called **Tuned rules**.
Use those names on slides. Full plain-language explanation: `references/project-brief.md`.

## 2. The competition (what the deck must serve)

- Event: Sea × OpenAI Regional Codex Hackathon, Indonesia. Saturday 7 Nov 2026, Jakarta.
- Code submission deadline **16:30 sharp** (Google Form: new public GitHub repo, project writeup,
  optional demo link, declarations of any pre-existing OSS and what was built on the day).
- Round 1: every team presents to a pair of Sea and OpenAI judges. **6 min demo/pitch + 2 min Q&A.**
  Top 5 go to the final on the main stage, same format. **Presentations must be in English.**
- Judges "judge the product, not the pitch". The deck frames the live demo; it does not replace it.
- Judging criteria (the deck answers each):
  1. Problem & solution fit → slides 2–5
  2. Build quality → live demo (slide 8) + results (9–10)
  3. Insight & originality → slides 6, 12
  4. Real-world value → slides 5, 9, 10
  5. Alignment with a build direction → cover + close name **Autonomous & Adaptive AI**
  6. Use of Codex → slide 11 (Codex built it AND runs inside it)
- Team: Adel (data: PCAP, Suricata, alert table), Melvin (policy layer + agent build),
  Tina (dashboard design, frontend, QA), Faris (agent, scorecard, QA; owns this deck).

## 3. Where the deck lives

- **Master copy**: a Claude Slides artifact: https://claude.ai/artifact/Rj6o3Aks9ygwCjBUhLBc7G
  It is readable by the Shopee organization. To edit it, Tina must give you edit access from the
  deck's Share menu. With edit access, Claude can edit it by that URL. From the deck you can also
  export PowerPoint (.pptx) or PDF via Share › Export.
- **Source files** (a copy of the master, for reference or rebuilding): `assets/deck-source/`
  - `project/deck.json`: slide order, sections, fonts
  - `project/slides/<id>.html`: one slide each, 1920×1080, inline styles. The last `<aside>` in each
    file is that slide's speaker notes (timing + what to say).
- **Brand**: `assets/brand/` (IDEA-X logo SVGs: full colour, white, black, on-dark, mark only).

Pick the path that matches the tools you have:
- **Claude with edit access** → edit the artifact directly. Change only the slides asked for.
- **PowerPoint / Google Slides** → export .pptx from the artifact, then edit there. Keep the design rules below.
- **Codex or a coding agent with no artifact access** → treat `assets/deck-source/` as the spec.
  Rebuild with python-pptx or an HTML deck if needed, following `references/design-system.md`
  and `references/slide-by-slide.md`. Never invent new numbers while rebuilding.

## 4. Deck structure (16 slides, ~6:00 spoken + demo inside)

| # | id | Purpose | Time |
|---|----|---------|------|
| 1 | cover | Name, pitch line, team, build direction | 0:00–0:15 |
| 2 | story | CCTV-room story (spoken in full in the notes) | 0:15–0:45 |
| 3 | problem | 3,000 alerts/day, 63% unaddressed | 0:45–1:00 |
| 4 | blind | Red thesis slide: "The sensors already see the attack. Nobody reads the alert." | 1:00–1:10 |
| 5 | region | Southeast Asia figures. **Optional**, cut first if over time | +0:10 |
| 6 | idea | SRE mapping: traffic, capacity, burn rate, rate-based alerting | 1:10–1:35 |
| 7 | pipeline | 3 stages, "One model step. Everything else is code." | 1:35–1:55 |
| 8 | demo | Live demo divider; 2:30 demo script in notes | 1:55–4:25 |
| 9 | collapse | 5,483 marks → 46 dots picture | 4:25–4:45 |
| 10 | results | 4 numbers: reduction, recall, benign raised, emails | 4:45–5:05 |
| 11 | codex | Use of Codex: built it + runs in it | 5:05–5:30 |
| 12 | different | vs per-alert triage: correlates, offline, escalates | 5:30–5:45 |
| 13 | close | "Fewer alerts. Attacks still on top. Every change on the record." | 5:45–6:00 |
| 14 | math | Backup: formulas | Q&A |
| 15 | limits | Backup: what we don't claim | Q&A |
| 16 | gaps | Backup: per-rule delta-gap table | Q&A |

Every slide's text, visual and notes: `references/slide-by-slide.md`.

## 5. Placeholders to fill on the day (before 16:30)

Everything in `[brackets]` on a slide is a placeholder. Fill them only from real outputs.
Checklist with where each value comes from: `references/placeholders.md`. Summary:
- Slide 10: attack recall `[7/7]`, tuned email count `[7]`; recheck 46 and 99.2%.
- Slide 9: the email count `[7]` in the footer; redraw red dots to match the High count.
- Slide 11: `[__]` Codex tasks, `[__]%` of commits with Codex, `[6]` repo skills, and the real
  last five lines of the Codex tuning log (replace `[result]` / `[7/7]`).
- Slides 6 and 16: replace 373/h, 20/h, 18.6× and the gap table if the real run differs.
If the real run gives a different count than 46: reduction % = 1 − after ÷ 5,483.

## 6. Hard rules (do not break)

- **Never invent a statistic, result or quote.** If a number is not from the real run or a cited
  source, keep it as a `[placeholder]` and tell the user.
- Industry figures must keep their source line (see `references/sources.md`). Wording must match
  the source: "63% go unaddressed" (not "never read" on the slide); "60% of teams had a breach tied
  to an ignored alert".
- Safe claims only. Say "attacks still on top", "in this run", "on this dataset". Never say
  "guarantees zero missed attacks", "we invented AI alert tuning", or "competitors can't backtest".
- Be open about limits (slide 15): dataset labels are used only to grade results and weight the offline tuning, never at runtime;
  budget B and the 0.2 benign weight are operator inputs; one day of traffic; no response actions.
- Codex never scores alerts at runtime. Code scores; Codex only proposes settings.
- Keep the old name "AIDS" and the terms "SIEM I / SIEM II" off the slides.
- Keep it short: one idea per slide, few words. Detail goes in speaker notes or backup slides.
- English only.

## 7. Design rules (keep the look consistent)

Short version (full tokens in `references/design-system.md`):
- Colours: Steel Azure `#004488` (dark slides), White Smoke `#F2F2F2` (light slides), Brick Red
  `#BD2024` only for alarms/emails and the one red thesis slide, Blue Grey `#6A9DCF` secondary,
  ink `#0B1420`. No purple, no gradients, no glow, no robot/sparkle icons.
- Fonts: Oswald (big numbers + headings), IBM Plex Sans (body), JetBrains Mono (eyebrows, labels,
  footers, logs). Sizes: 280/190/132 hero numbers, 72–96 headings, 30–40 body, 24–26 labels. Nothing under 24px.
- Motif: **one small mark = one alert; red mark = an email to a human.** Cover, demo and close have a
  field of marks on the right; slide 9 shows 5,483 marks collapsing into 46 dots.
- Layout: 1920×1080, 128px margins, eyebrow (mono, uppercase, letter-spaced) at the top left,
  footer row at bottom 64px with source left and page number right.

## 8. Rehearsal tips

- Time it with a stopwatch. Target 5:45 so Q&A starts cleanly. Cut slide 5 first, then shorten slide 12.
- Demo fallback: if the live tuning run is slow, open the last saved run; keep a screen recording.
- Likely questions and answers: `references/qa-prep.md`.

## Reference files

- `references/project-brief.md`: plain-language explainer, glossary, formulas, worked examples
- `references/slide-by-slide.md`: every slide: on-slide text, visual, speaker notes
- `references/design-system.md`: colours, fonts, type scale, layout, motif specs
- `references/placeholders.md`: what to fill, from where, by when
- `references/sources.md`: citations for every external figure
- `references/qa-prep.md`: likely judge questions with short answers
