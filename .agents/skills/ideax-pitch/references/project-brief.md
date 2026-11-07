# IDEA-X project brief (plain language)

Source of truth: the team's newest design notes, "Codex tuning as SRE: the delta gap calculation".
When anything here conflicts with older handoff notes about "AIDS", KB/SOP or incident response,
this brief wins. Those older ideas are retired.

## The story

A mall's CCTV room. Sensors raise an alarm every few seconds, and most alarms are a door swinging
open. After a week the guards stop looking. Then a real break-in rings an alarm, and nobody checks it.
Company security teams live in that room. Industry surveys put the average at about 3,000 security
alerts a day, with most of them never read. The sensors already see the attacks. The problem is that
people cannot read everything the sensors raise.

IDEA-X changes how alarms reach people:
- **Group** repeated alarms about the same target into one alert.
- **Escalate** that one alert when repeats keep coming.
- **Let Codex tune the settings** per kind of alarm, the way an SRE tunes on-call alarms.
- **Check every change** with a fixed guardrail and keep an audit log.

## Glossary

| Term | Meaning |
|---|---|
| SOC | Security Operations Center: the team that watches alerts. |
| Suricata | Open-source software that watches network traffic and raises alerts. Its rules stay unchanged. |
| PCAP | A recording of network traffic. |
| eve.json | Suricata's output, one line per alert. Our file: `eve_demo_FINAL.json`, 5,483 alerts. |
| CIC-IDS2017 | Public research dataset with real attacks at known times. We use Thursday. Known attack times = labels. |
| Attack / benign | Alert caused by a known attack / harmless traffic that still tripped a rule. |
| SIEM | The alert dashboard. SIEM I = **Original rules**, SIEM II = **Tuned rules** (use the new names). |
| Severity bands | Low 1–4, Medium 5–7, High 8–10. |
| SRE | Site reliability engineering: keep apps running, size alarms to what on-call people can handle. |
| Budget B | Alerts per hour analysts can read (operator input, e.g. 20). |
| Burn rate | Observed alerts per hour ÷ B. Sample: 373 ÷ 20 = 18.6×. |
| p95 | 95% of bursts are this size or smaller. |
| Delta gap | Observed per hour − allowed per hour. Positive = too noisy. Negative = too quiet for its importance. |
| Rule | An attack type at a service, e.g. "Brute force at web server". |
| Window W | Minutes to collect repeats into one group. |
| N_sat | Events needed to push a group's score to 10. |
| Group key | Target + attack type. Scanners: source + attack type. |
| evaluate() | Fixed script Codex calls to test a proposal: reduction, attack recall, benign groups raised. |
| Guardrail | Fixed code that rejects a proposal breaking a limit. |
| Recall | Share of labeled attack groups still correctly raised after tuning. Must be 100%. |

## Three stages

1. **Original run**: PCAP → Suricata → app scores each alert → Original rules (5,483 alerts) → one email per High alert (1,535 emails in the PDF's full replay).
2. **Tuning, offline**: inputs (base_rules.yaml, asset_map.yaml, original results) → Codex tuner (propose, evaluate, revise ≤ 3) → guardrail → `tuned_rules.yaml` with old value, new value, gap addressed, one-line reason.
3. **Tuned run**: same eve.json → app loads tuned rules → grouped, ranked alerts → one email per High group.
Audit log keeps data before tuning, rule changes, data after tuning. No human approval step in this version; the guardrail is the gate.

## Formulas

- Base score: `S = min(10, A + C)`
- Group score: `X = round(S + (10 − S) × min(1, ln n ÷ ln N_sat))`, n = events in the group within W.
  With n = 1, ln 1 = 0 → X = S, so nothing drops below base. N_sat must be ≥ 2.
- Worked example: S = 5, N_sat = 60. n = 1 → 5, n = 8 → 8 (High), n = 60 → 10.
- Caution: "two lows become one medium" only holds when N_sat ≤ 25 (for S = 3). With N_sat = 60, two events give 4 (still Low). Don't use that line in the pitch.

## What Codex calculates (per rule)

1. Flow: alerts per hour, peak and p95 burst in W.
2. Burn rate: total per hour ÷ B.
3. Weight: w = S × evidence (1.0 attack, 0.2 benign).
4. Allowed share: B × w ÷ Σw.
5. Delta gap: observed − allowed.
6. Change: positive gap → smallest W that fits the share, N_sat = p95 burst. Negative gap → keep W small, escalate sooner. Rules with S ≥ 8 never get a long window.
Then evaluate(); if recall < 100% or any benign group raised → revise (max 3). Codex may edit only tuned_rules.yaml.

Sample numbers (B = 20/h, total 373/h):

| Rule | Base S* | Observed/h | Allowed/h | Gap |
|---|---|---|---|---|
| Brute force at web server | 5 | 194 | 3.2 | +191 |
| Benign policy at internal hosts | 2 | 83 | 0.3 | +83 |
| Web probe at web server | 4 | 51 | 2.6 | +49 |
| Benign policy at web server | 3 | 25 | 0.4 | +24 |
| SQL injection at web server | 7 | 9.1 | 4.5 | +4.6 |
| Port scan, internal | 3 | 4.3 | 1.9 | +2.4 |
| Exploit at Windows Vista host | 9 | 3.9 | 5.8 | −1.9 |
| Ping sweep, internal | 2 | 2.2 | 1.3 | +0.9 |

*Base S values are back-calculated from the allowed column (Σw = 31); they reproduce it exactly but are a reconstruction, not given in the notes.

## Results known so far (replace with the real run)

- PDF replay page (one global setting, W 5 min, N_sat 60): 5,483 alerts → 112 grouped, 7 High, 7 emails, 0 benign groups raised.
- Codex per-rule settings, via evaluate: 5,483 → 46 grouped alerts. **Quote evaluate numbers.**
- Mid-replay snapshot (demo clock 1:55:26): Original 4,427 alerts (756 High = 756 emails); Tuned 61 groups, 3 emails. The exploit group on the Windows Vista host holds 756 events as one alert.

## Limits to state openly

- Dataset labels are used only for evaluation and the offline 0.2 evidence weight, never by runtime scoring (benign at runtime = rules marked benign in base_rules.yaml); in production, evidence would come from analyst feedback. The UI says so.
- Budget and 0.2 weight are operator assumptions.
- One day of one dataset; not a promise about future attacks.
- No response actions; reads alerts and sends email only.
- Codex is a cloud model: it gets counts per rule, not raw traffic.

## How IDEA-X differs from per-alert triage (e.g. TriageWall)

TriageWall (from its public README) decides per alert whether it is noise, with a local LLM in the hot path.
IDEA-X looks across alerts: groups per target + attack type, raises severity with volume, and runs Codex once offline to tune thresholds, producing a reviewable diff. Both read Suricata eve.json and keep deterministic rules in charge.
