---
name: ideax-submission
description: Write the IDEA-X hackathon submission (repo README, project writeup, declarations of pre-existing OSS and prepared materials, and the "how Codex was used" section) for the 16:30 Google Form deadline. Use when the user asks for the README, writeup, submission text, declarations, or a summary of Codex usage, even if they just say "prepare the submission" or "write it up".
---

# IDEA-X submission

Deadline **16:30 sharp**, one Google Form per team: public GitHub repo (new, created for this
hackathon), project writeup, demo link (optional), declarations. Late = disqualified.

## Writeup (keep each part short; judges read many)

1. **Problem.** Security teams receive ~3,000 alerts a day and most go unaddressed (Vectra AI, 2026). Real attacks hide in the noise.
2. **Solution.** IDEA-X replays the same Suricata alerts through Original rules and Tuned rules. Codex, acting like an SRE, measures alert flow per rule against an analyst budget, writes per-rule grouping settings with a reason for each, tests them with evaluate(), and revises. A fixed guardrail decides whether they are used. Repeats on one target raise severity.
3. **Results.** Quote only real numbers from evaluate() on the final run: alerts before → after, attack recall, benign groups raised, emails before → after.
4. **Build direction.** Autonomous & Adaptive AI: an agent that tunes and tests its own proposal, bounded by deterministic checks.
5. **How Codex was used.** (a) Codex built the product: list the main tasks, the repo skills and AGENTS.md, rough share of code written with Codex. (b) Codex runs inside the product as the offline tuner via `codex exec`.
6. **Limits.** Dataset labels used only for evaluation and the offline evidence weight, never at runtime; budget and 0.2 benign weight are operator inputs; one day of one dataset; no response actions.

## Declarations (be complete)

- Open source used: Suricata (alert generation), CIC-IDS2017 dataset (Canadian Institute for Cybersecurity), Next.js, Tailwind CSS, plus any Python/JS libraries in the lockfiles.
- Prepared before the event (ideas and design only): the concept and design notes, Figma designs and component library, brand/logo, pitch deck, project docs and Codex skills (instructions only), and the precomputed Suricata alert output from the public dataset.
- Built on 7 Nov: all application and pipeline code in the repo.

## README outline

Title + one-line pitch · screenshot · what it does (3 bullets) · quick start (install, data files, `npm run dev`, how to run the pipeline, how to run tuning with Codex CLI) · repo layout · how scoring works (2 formulas) · limits · team · declarations.

Never invent a number or claim; leave `[TBD]` and tell the user if a value isn't available.
