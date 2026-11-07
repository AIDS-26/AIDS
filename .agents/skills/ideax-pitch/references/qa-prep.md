# Q&A prep (2 minutes, likely questions)

Keep answers to 2–3 sentences. Jump to a backup slide only if it helps.

**"Doesn't the tuned system cheat by using the dataset labels?"** (slide 15)
No. Runtime scoring never reads the labels: benign comes from the rule definition. Labels are used only to grade the result (recall, benign raised) and for the offline 0.2 evidence weight; in production that weight would come from analysts marking alerts.

**"Could grouping hide a real attack?"**
That's what evaluate() and the guardrail check: attack recall must be 100% and no score can drop below its base. Serious rules (score 8+) never get a long grouping window, so they still alert immediately. It's tested on this dataset, not a guarantee for future traffic.

**"Why does Codex need to be involved? Isn't this just thresholds?"**
The thresholds differ per rule, and picking them means reading flow, budget and priority together, then testing. Codex does that analysis, writes the settings with a reason for each, and revises when its own test fails. Code still does all the scoring.

**"Why a logarithm?"** (slide 14)
The first few repeats matter most: going from 1 to 10 events should count more than going from 100 to 110.

**"How is this different from TriageWall / Elastic / SIEM vendors?"** (slide 12)
Per-alert triage decides whether each alert is noise. We look across alerts: group by target and attack type and raise severity with volume, with thresholds Codex tunes offline. Don't claim others can't do tuning or backtesting.

**"What does Codex see? Privacy?"**
Only aggregated counts per rule, never raw traffic or payloads. A local model could replace it.

**"Would this run in production?"**
The scoring is plain code and runs per event with no model call. Codex runs offline when the team wants to retune, and its output is a reviewable YAML diff with an audit log. Next steps would be analyst feedback instead of labels and preview/rollback for rule versions.

**"What did you build today vs before?"**
All code was written on the day with Codex. Before the event we prepared ideas, designs and the replay data (public CIC-IDS2017 run through open-source Suricata), declared in the submission.
