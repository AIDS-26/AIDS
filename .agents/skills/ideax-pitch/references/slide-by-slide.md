# Slide by slide

Generated from `assets/deck-source/project/slides/*.html`. On-slide text is what the audience sees; notes are what the speaker says. Slide numbers follow `deck.json` order.

## 1. `cover`

**Visual:** Steel background; field of small alert marks on the right half with a few red ones; orbit logo mark top-left; huge IDEA-X wordmark; build-direction pill bottom-right.

**On-slide text:**

- Sea × OpenAI Codex Hackathon · Jakarta · 7 Nov 2026
- IDEA-X
- Codex doesn’t score alerts. /
- It writes and tests the rules that do.
- Adel · Melvin · Tina · Faris
- Autonomous & Adaptive AI

**Speaker notes:**

0:00–0:15. Say the name and the one line, nothing else: “We’re IDEA-X. Codex doesn’t score alerts. It writes and tests the rules that do.” The marks on the right are the visual motif of the deck: one mark is one alert, red marks are the ones that page a human. Team names follow the pipeline order (data, policy, dashboard, agent).

## 2. `story`

**Visual:** Steel background; left: short story lines; right: 4×3 wall of CCTV monitor tiles, 11 say 'door open', one red tile 'STORE 14 · break-in · unchecked'.

**On-slide text:**

- Picture this
- A mall’s CCTV room.
- An alarm every few seconds. Most are a door swinging open.
- Then a real break-in rings. Nobody checks.
- DOOR 2
- open · 09:14
- EXIT B
- open · 09:14
- DOOR 7
- open · 09:15
- LOADING
- open · 09:15
- DOOR 2
- open · 09:15
- DOOR 3
- open · 09:16
- EXIT B
- open · 09:16
- STORE 14
- break-in · unchecked
- DOOR 7
- open · 09:16
- DOOR 2
- open · 09:17
- LOADING
- open · 09:17
- DOOR 5
- open · 09:17
- Eleven door alarms and one break-in, all on the same wall
- 02

**Speaker notes:**

0:15–0:45. Tell it as a story, slowly, looking at the judges, not the slide:
“Picture a mall’s CCTV room. Sensors raise an alarm every few seconds, and most alarms are a door swinging open. After a week the guards stop looking. Then a real break-in rings an alarm, and nobody checks it.”
Point at the red tile on “nobody checks it”. Then:
“Company security teams live in that room. Industry surveys put the average at about 3,000 security alerts a day, with most of them never read. The sensors already see the attacks. The problem is that people cannot read everything the sensors raise.”
Click to the next slide on “3,000” so the number appears as you say it.

## 3. `problem`

**Visual:** Smoke background; two giant numbers side by side, 3,000 in ink and 63% in red.

**On-slide text:**

- The problem
- 3,000
- security alerts reach a team every day
- 63%
- of them go unaddressed
- Source: Vectra AI, “Alert fatigue explained”, 2026 · averages across organizations
- 03

**Speaker notes:**

0:45–1:00. The story already said 3,000, so let the slide carry it. Add only: “Almost two thirds of those alerts go unaddressed.” Pause. Don’t read the source line aloud; it is there for the judges.

## 4. `blind`

**Visual:** The only red slide; two-line statement, second line in deep red-black.

**On-slide text:**

- The sensors already see the attack. /
- Nobody reads the alert.
- 60% of security teams had a breach tied to an alert they ignored.
- Source: Prophet Security survey of ~300 security leaders, via SecurityInfoWatch
- 04

**Speaker notes:**

1:00–1:10. This is the thesis, and it echoes the story. Read the headline slowly. Then: “So the bottleneck isn’t detection any more. It’s attention.” This is the only red slide in the deck, on purpose.

## 5. `region`

**Visual:** Smoke background; three columns with steel-blue big figures over a blue top rule.

**On-slide text:**

- Why here
- Southeast Asia is where it hits.
- 2×
- more cyberattacks in the region in 2024 than in 2023
- 18M+
- malicious detections against regional businesses in 2025, Indonesia among the most hit
- Rp 9.1T
- lost to online fraud in Indonesia, from 432,637 reports
- Sources: CloudSEK via SEA Infra · Kaspersky via Newswav, 2026 · Mafindo via Jakarta Post, 2026
- 05

**Speaker notes:**

Optional, 10 seconds. With the CCTV story in, keep this slide only if rehearsal comes in under 6 minutes. “And it’s our region: banking, retail and e-commerce are the most hit sectors. That’s where Shopee and Monee live.” If you are over time in rehearsal, hide this slide first.

## 6. `idea`

**Visual:** Steel background; four-row mapping table, SRE term (mono) on the left, IDEA-X meaning on the right.

**On-slide text:**

- The idea
- Treat the alert stream like production traffic.
- Traffic
- Alerts per hour, for each rule
- Capacity
- Analyst budget:
- B alerts per hour
- Burn rate
- 373 per hour ÷ budget 20 =
- 18.6× overloaded
- Rate-based alerting
- Grouping window + saturation point,
- per rule
- Left: how site reliability engineers run on-call · Right: what IDEA-X does
- 06

**Speaker notes:**

1:10–1:35. “Engineers who keep apps like Shopee up have solved this for years: measure the traffic, set a capacity, and tune the alarms so on-call people aren’t woken by noise. We do the same for security alerts.” Point at the burn-rate row: “Our sample sends 373 alerts an hour to a team that can read 20.” Replace 373 / 20 / 18.6× with the real run if they change.

## 7. `pipeline`

**Visual:** Smoke background; three stage cards with arrows; the middle Codex card is filled steel with a guardrail pill.

**On-slide text:**

- How it works
- One model step. Everything else is code.
- 1 · Original run
- Every alert alone
- Suricata reads the traffic
- Each alert scored on its own
- 5,483 alerts, 1,535 emails
- 2 · Codex tunes, offline
- Propose, test, revise
- Measures flow against budget
- Writes tuned_rules.yaml
- Runs evaluate(), up to 3 tries
- Guardrail: fixed checks before use
- 3 · Tuned run
- Grouped and ranked
- Same alerts, same order
- Grouped by target and attack
- Repeats raise the score
- Audit log every run · Suricata rules unchanged · Codex edits only tuned_rules.yaml
- 07

**Speaker notes:**

1:35–1:55. Walk left to right in one breath. “Stage one is today’s world: every alert on its own. Stage two is Codex, offline: it measures the flow, writes new settings, tests them and revises. A fixed guardrail checks the result. Stage three replays the same alerts with the tuned settings.” Stress: the model never scores an alert; code does. Then: “Let me show you.”

## 8. `demo`

**Visual:** Steel background with mark texture on the far right; red 'LIVE DEMO' pill; giant two-line headline.

**On-slide text:**

- ● LIVE DEMO
- Same alerts. / Two rule sets.
- replay · CIC-IDS2017 Thursday · 5,483 alerts · 120×

**Speaker notes:**

1:55–4:25 (2 min 30 s). Switch to the app. Script:
0:00 Replay tab, press Play at 120×. “Left: original rules, every alert on its own. Right: tuned rules, grouped by target and attack type.”
0:20 During brute force: the left lane scrolls, one card on the right climbs from Medium to High. “Same events. On the right it is one alert, and it got louder.”
0:50 Reverse-shell flood (demo clock about 1:55): “756 High alerts on the left means 756 emails. On the right: one group, one email.”
1:15 Summary row: fewer alerts, groups raised, 0 benign groups raised.
1:35 Tuning tab: budget 20, burn rate 18.6×, the gap table. “Brute force is 191 an hour over its share. The exploit rule is under its share, so Codex keeps it instant.” Show a failed attempt and the passing one, then two lines of the YAML diff with their reasons.
2:20 Back to the slides.
Fallback: if the live tuning run is slow, open the last saved run. Keep a screen recording of the full demo on the laptop.

## 9. `collapse`

**Visual:** Smoke background; left: exactly 5,483 tiny marks (~28% red); arrow; right: 46 dots, first 7 red.

**On-slide text:**

- The result · one mark is one alert
- 5,483
- alerts, original rules
- 46
- grouped alerts, tuned by Codex
- Red = sent an email · 1,535 before, [7] after · same CIC-IDS2017 alerts
- 09

**Speaker notes:**

4:25–4:45. Back from the demo, let the picture do the work: “Every mark on the left is one alert. Red ones emailed a human. On the right, the same traffic after Codex’s tuning.” The left drawing has exactly 5,483 marks; the red share is drawn at about 28%, matching 1,535 of 5,483. The right drawing has 46 dots. Before the pitch: confirm 46 and the email count [7] against tomorrow’s evaluate output, and redraw the red dots to match the High count.

## 10. `results`

**Visual:** Steel background; 2×2 grid of big numbers with divider rules.

**On-slide text:**

- Proof · measured, not promised
- Less to read. Nothing important lost.
- 99.2%
- fewer alerts to read (5,483 → 46)
- [7/7]
- labeled attack groups still caught
- 0
- harmless groups pushed up a severity level
- 1,535 → [7]
- emails to the on-call analyst
- evaluate() on eve_demo_FINAL.json · graded against CIC-IDS2017 labels
- 10

**Speaker notes:**

4:45–5:05. Read the four numbers, one line each. Then the honest frame: “Scores never drop below their base, and no harmless group gets louder. That’s the safety bar Codex has to clear.” Everything in brackets is a placeholder: fill [7/7] and [7] from tomorrow’s evaluate output. If the real run differs from 46, update 99.2% too (1 − after ÷ 5,483).

## 11. `codex`

**Visual:** Smoke background; left card with three bracketed numbers; right dark terminal card with a 5-line Codex log.

**On-slide text:**

- Use of Codex
- Codex works in two places.
- It built the product
- [__]
- Codex tasks, from empty repo to demo
- [__]%
- of commits written with Codex
- [6]
- repo skills + AGENTS.md kept four builders consistent
- It runs inside the product
- $ codex exec tuning_task.md
- flow 373/h · budget 20/h · burn 18.6×
- attempt 1 · evaluate · guardrail [result]
- attempt 2 · −99.2% · recall [7/7]
- guardrail PASS → tuned_rules.yaml
- Codex never scores an alert · it writes settings, tests them, explains each change
- 11

**Speaker notes:**

5:05–5:30. This slide answers judging criterion 6 directly. Left: how deeply Codex built it. Fill the brackets at 16:00 from the repo (count Codex tasks or sessions, the share of commits, the skills in .agents/skills). Right: Codex is also the tuning agent at runtime. Paste the real last five lines of the tuning log tomorrow; keep it to five lines. Line to say: “Codex is the engineer that tunes the alarms, and the test it has to pass is written in code it can’t edit.”

## 12. `different`

**Visual:** Steel background; three outlined cards with icons (Link, Clock, Warning).

**On-slide text:**

- What is new here
- Others judge each alert. We look across them.
- Correlates
- Groups alerts by target and attack type. Volume changes severity.
- Off the hot path
- Codex runs once, offline. No model call per alert. The output is a diff you can review.
- Escalates
- Repeated hits on one target climb to High. It can raise severity, not only hide noise.
- Compared with per-alert LLM triage, e.g. TriageWall, from its public README
- 12

**Speaker notes:**

5:30–5:45. One sentence per card, then move on. If a judge asks about TriageWall in Q&A: “TriageWall decides whether each alert is noise. We look across alerts: we group them per target and attack type and raise severity with volume, using thresholds Codex tunes offline.” Don’t claim others can’t backtest or tune; just say where we focus.

## 13. `close`

**Visual:** Steel background; three-line closing statement; mark texture on the right collapsing into a few dots, one red.

**On-slide text:**

- IDEA-X
- Fewer alerts. / Attacks still on top. / Every change on the record.
- Adel · Melvin · Tina · Faris
- Autonomous & Adaptive AI

**Speaker notes:**

5:45–6:00. Say the three lines slowly, then: “Thank you. Happy to take questions.” Leave this slide up during Q&A. Backup slides 14–16 answer the likely questions: the math, what we don’t claim, and the full per-rule gap table. Jump there only if asked.

## 14. `math`

**Visual:** Smoke background; five rows label + formula (mono, steel blue).

**On-slide text:**

- Backup · the math
- Code scores. Codex picks W and N_sat.
- Base score
- S = min(10, A + C)
- Group score
- X = round(S + (10 − S) × min(1, ln n ÷ ln N_sat))
- Group key
- target + attack type · scanners: source + attack type
- Bands
- Low 1–4 · Medium 5–7 · High 8–10 · benign keeps S
- Codex’s budget split
- w = S × evidence · allowed = B × w ÷ Σw · gap = observed − allowed
- A = attack weight · C = service weight · n = events in window W · evidence 1.0 attack, 0.2 benign
- 14

**Speaker notes:**

Backup, Q&A only. If asked “why a logarithm?”: the first few repeats matter most; going from 1 to 10 events should count more than going from 100 to 110. If asked “can it ever lower a score?”: no. With one event, ln 1 = 0, so X = S, and the guardrail also checks this. N_sat must be at least 2.

## 15. `limits`

**Visual:** Smoke background; 2×2 grid of limit cards.

**On-slide text:**

- Backup · what we don’t claim
- Limits we state up front.
- Labels only grade the result
- CIC-IDS2017 labels are used for evaluation and the offline evidence weight, never by runtime scoring.
- Budget and weights are inputs
- B = 20 per hour and the 0.2 benign weight are operator choices, not facts.
- One day of traffic
- A clean run on Thursday’s data is not a promise about future attacks.
- No response actions
- IDEA-X reads alerts and sends email. It blocks nothing. Codex sees counts per rule, never raw traffic.
- Suricata detection rules are never changed
- 15

**Speaker notes:**

Backup, Q&A only. The most likely hard question is the first card: “Doesn’t the tuned system cheat by using labels?” Answer: “No. Runtime scoring never reads the labels; benign comes from the rule definition. Labels only grade the result and set the offline 0.2 evidence weight, which in production would come from analysts.”

## 16. `gaps`

**Visual:** Smoke background; 8-row table, exploit row highlighted in light blue.

**On-slide text:**

- Backup · the delta gap, per rule
- Not every rule gets the same fix.
- Rule
- Observed/h
- Allowed/h
- Gap
- Codex’s move
- Brute force at web server
- 194
- 3.2
- +191
- Heavy grouping
- Benign policy at internal hosts
- 83
- 0.3
- +83
- Group, never raise
- Web probe at web server
- 51
- 2.6
- +49
- Heavy grouping
- Benign policy at web server
- 25
- 0.4
- +24
- Group, never raise
- SQL injection at web server
- 9.1
- 4.5
- +4.6
- Light grouping
- Port scan, internal
- 4.3
- 1.9
- +2.4
- Group by source
- Exploit at Windows Vista host
- 3.9
- 5.8
- −1.9
- Stay instant, escalate fast
- Ping sweep, internal
- 2.2
- 1.3
- +0.9
- Light grouping
- Budget B = 20/h · total 373/h · burn rate 18.6× · sample figures from the design notes
- 16

**Speaker notes:**

Backup, Q&A only. Positive gap means the rule is too noisy for its share of the analysts’ time, so Codex groups it harder. The exploit row is the one negative gap: it is under-alerting for how dangerous it is, so Codex keeps its window small and makes it escalate sooner. Replace these numbers with the real flow table from tomorrow’s run.
