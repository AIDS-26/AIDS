# IDEA-X Pitch Plan

## Pitch constraints

- Event: Sea × OpenAI Regional Codex Hackathon, Indonesia
- Main presentation: 6 minutes
- Q&A: 2 minutes
- Presentation language: English
- Main deck: 10 slides
- Planned duration: 5 minutes 35 seconds
- Safety buffer: 25 seconds
- Build direction: Autonomous & Adaptive AI
- Core line: **Codex doesn't score alerts. It writes and tests the rules that do.**

## Final pitch structure

| Duration | Slide | Speaker | Title | Purpose | What judges should remember |
|---:|---:|---|---|---|---|
| 10s | 1 | Faris | Opening | Introduce the team and the product promise. | **IDEA-X helps security teams focus limited analyst attention on the attacks that matter most.** |
| 20s | 2 | Faris | Pre-engagement | Engage the judges with a relatable question, set the right product expectation, and ease the opening tension. Light humour may be used if it supports the point. | **Security teams cannot investigate everything; choosing which alerts deserve attention is the real operational challenge.** |
| 60s | 3 | Faris | Real-world data | Use verified evidence to make the current problem in Southeast Asia understandable and emotionally relevant. Bring the judges into the team's concern without overstating the evidence. | **Cyber threats are growing across Southeast Asia, while security teams face more evidence than people can realistically investigate.** |
| 40s | 4 | Faris | Bottleneck issue | Identify the specific part of the larger problem that IDEA-X can address. | **Detection is no longer the only bottleneck—human attention is. The sensors may see the attack, but the important alert can remain buried.** |
| 40s | 5 | Tina | Problem analogy | Explain the problem for judges without a cybersecurity background through the analogy of protecting the most valuable room in a house first. | **When everything is under attack, protect the rooms containing the most valuable assets first. IDEA-X applies that principle to security alerts.** |
| 15s | 6 | Melvin | Hero Product: IDEA-X | Restate the product in one line and reveal its core mechanism. | **Codex does not score alerts at runtime. It writes and tests the rules that determine how alerts are grouped and escalated.** |
| 15s | 7 | Melvin | Why IDEA-X | Communicate one defensible differentiator. Compare IDEA-X with the per-alert triage category rather than making unverified claims about named competitors. | **Unlike per-alert triage, IDEA-X tunes the alerting policy offline, validates it against the same traffic, and keeps every change auditable.** |
| 30s | 8 | Adel | IDEA-X Overall Steps | Give the judges a simple mental model of the workflow before the live demonstration. | **The process is simple: score with original rules, let Codex propose and test safer tuning, then replay with validated tuned rules.** |
| 90s | 9 | Adel | IDEA-X Demo | Demonstrate the running product and show how it turns raw alerts into more actionable grouped alerts. All result claims must come from the actual run. | **IDEA-X turns repeated raw alerts into actionable grouped alerts while preserving attack visibility in this run.** |
| 15s | 10 | Faris | Closing | Leave the judges with a concise statement they can remember after the next team presents. | **Fewer alerts. Attacks still on top. Every change on the record.** |

## Narrative spine

**Attention is scarce → the regional problem is growing → detection is not the only bottleneck → critical assets deserve priority → IDEA-X tunes and tests the alerting rules → the live product proves it → the result is memorable.**

## Important slide distinctions

- Slide 1 communicates the **product promise**.
- Slide 6 explains the **core mechanism and responsible use of Codex**.
- Slide 7 provides one defensible differentiation: IDEA-X improves the alerting policy offline, tests it on the same events, and places a deterministic guardrail between a Codex proposal and active tuned rules.
- Slide 9 must contain the proof. Any reduction, recall, benign-group, or email count remains a placeholder until it is obtained from the actual run and validated.

## Preparation workflow

### 1. Structure the pitch — complete

- Lock the narrative arc, slide order, timing, speakers, purposes, and judge takeaways.
- Keep technical details out of the main narrative and place them in appendix slides for Q&A.

### 2. Develop content and speaker scripts together — next

For each slide, develop these elements together:

1. One takeaway sentence
2. Minimal on-slide copy
3. Spoken script within the allocated time
4. Transition into the next slide
5. Speaker handoff where applicable
6. Claims or values that require validation

The slides must not become transcripts. The screen carries the visual idea and essential words; the speaker provides the explanation.

### 3. Validate evidence and product claims

- Verify every statistic, date, incident, quote, screenshot, and comparison.
- Preserve the exact meaning and source of external evidence.
- Obtain product metrics from the actual IDEA-X run.
- Use safe wording such as “in this run” and “on this dataset.”
- Keep missing values as explicit placeholders; never estimate or invent them.

### 4. Storyboard the demo

- Define every click, screen state, spoken line, and expected result.
- Show the original-rules state, the Codex tuning step, deterministic evaluation and guardrail, and the tuned-rules state.
- Prepare a last-known-good saved run and a screen recording as fallbacks.
- Ensure the demo proves the judge takeaway from slide 9.

### 5. Discuss the visual system

- Choose one visual idea per slide.
- Separate information shown on-screen from information delivered in speech.
- Maintain the IDEA-X brand system and alert-mark motif.
- Make speaker transitions and the move into the live demo visually clear.

### 6. Finalize the deck specification

Produce a deck specification containing, for every slide:

- Title
- On-slide copy
- Visual direction
- Exact speaker script
- Timing
- Speaker
- Transition or handoff
- Sources and metric provenance

### 7. Execute, rehearse, and QA

- Build the PowerPoint deck and final script document.
- Rehearse with the actual speakers and handoffs.
- Target a delivery shorter than six minutes under real demo conditions.
- Test the live demo and both fallback paths.
- Check claims, terminology, readability, timing, and consistency.
- Prepare concise answers for the two-minute Q&A.

## Q&A appendix plan

Technical detail will be placed after the 10-slide main deck. Candidate appendix slides:

1. Architecture and data flow
2. Scoring and grouping formulas
3. Delta-gap tuning method
4. Deterministic evaluator and guardrail conditions
5. Dataset, assumptions, and limitations
6. Detailed run results and rule changes

## Non-negotiable claim rules

- Use the name **IDEA-X** consistently.
- Use **Original rules** and **Tuned rules** in the product and presentation.
- Codex proposes and tests rule settings offline; deterministic application code scores alerts at runtime.
- Do not claim that IDEA-X guarantees zero missed attacks.
- Do not describe an unevaluated proposal as safe.
- Do not invent performance metrics, industry statistics, quotes, or competitor capabilities.
- Describe results as applying to the demonstrated run and dataset unless broader evidence exists.
