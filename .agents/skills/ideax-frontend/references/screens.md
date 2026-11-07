# Screens (as designed in Figma, 1440 px wide)

All screens: AppHeader (logo · tabs Replay, Tuning, Audit log, Emails · data-source chip
"CIC-IDS2017 · Thursday · eve_demo_FINAL.json · 5,483 alerts"), then a body with 20/32 padding and 16 gap.
Sample texts below are the design's examples (PDF mid-replay snapshot); real data replaces them.

## 1. Replay (`/replay`, the demo centrepiece)

1. Controls row: Pause (primary) · Restart (secondary) · speed 60×/120×/360× · "Demo clock 1:55:26 / 2:41:00" (muted) · "Now: Infiltration, exploit on Windows Vista host" (accent) · right: "Tuned rules from run #3 · tuned_rules.yaml".
2. Summary strip, 4 × StatCard: "99% fewer alerts to read" · "3 groups moved up a severity band" · "0 benign groups raised (must stay 0)" (Good tone) · "756 → 3 emails, original → tuned".
3. Timeline card: "Total alerts raised so far", legend right; y ticks 0/2,000/4,000; black line original, green line tuned, red blocks for attack windows (Brute force, XSS, SQL injection, Infiltration, Port scan), dashed blue "now" line with endpoint labels (4,427 / 61); x ticks 0:00…2:41.
4. Two lanes side by side (equal width):
   - Original rules: LaneSummary (title, "Every alert on its own, scored from the base rules", count 4,427 "alerts raised", breakdown 756 High · 2,374 Medium · 1,297 Low · 756 emails sent) then AlertRows ("1:55:26 · Exploit on Windows Vista host · 192.168.10.8 · High").
   - Tuned rules: LaneSummary (green count 61 "grouped alerts", 3 · 1 · 57 · 3) then GroupCards: Exploit on Windows Vista host (756 events · High · email sent · 10) with GroupDetail open ("Base 9, W 2 min, N_sat 3. Reached 10 at the 3rd event."), Web probe on web server (991 events · raised from Low to High · 10), Brute force on web server (2,374 events · raised from Medium to High · 10), Port scan from 172.16.0.1 (2 events · raised from Low to Medium · 6), Benign policy at internal hosts (9 events · Low · benign, not raised · 2, grey stripe).
5. Notice (labels disclosure).

## 2. Tuning (`/tuning`)

1. Title row: "Tuning run #3" + "6 Nov 2026, 21:40 · Codex CLI · 2 attempts · 3 min 12 s"; right: StatusBadge Pass "Passed guardrail", "View tuned_rules.yaml" (secondary), "Run tuning again" (primary).
2. Strip: StatInput budget 20 alerts/hour · "373 / h observed, original rules" · Alert "18.6× burn rate (observed ÷ budget)" · Good "46 grouped alerts after tuning (−99.2%)".
3. Left card "Where the load comes from": GapTable columns Rule · S · Observed/h · Allowed/h · Gap · Change, 8 rules (see ideax-domain sample table); exploit row gap −1.9 in blue.
4. Right column: Attempts card (segmented "Attempt 1 · Failed" / "Attempt 2 · Passed"; 6 CheckItems; note) · "Rule changes in this attempt" (DiffLines with reasons) · "Codex log" dark box (LogLines; command blue, FAIL red, PASS green).
   Design note: the right column is taller; consider moving the Codex log under the gap table to balance.
5. Notice: "Codex proposes settings and tests them. A fixed guardrail decides whether they are used. Budget and the 0.2 benign weight are operator inputs."

## 3. Audit log (`/audit`)

1. Title "Audit log" + "Every tuning run is kept, including failed ones. Original alerts are never deleted."
2. RunsTable: Run · Started · Budget · Attempts · Result badge · Alerts before → after · Rules changed · Attack recall. Selected row blue tint; failed run shows "Failed, not used" red badge.
3. "Run #3 in detail": three AuditStage cards: Before tuning (373 alerts/hour, bullets, files original_alerts.json · flow_table.json) · Rule changes (8 rules, 14 values, files tuned_rules.yaml · codex_log.txt) · After tuning (46 grouped alerts, ✓ items, files tuned_groups.json · evaluate.json).
4. Notice about failed runs being kept.

## 4. Emails (`/emails`, lowest priority; static is fine)

Title "Emails to the on-call analyst" + sub. Three columns: Original rules "756 emails" list (identical subjects) + "+ 747 more, mostly identical" · Tuned rules "3 emails" list (first selected) · EmailPreview (From IDEA-X alerts, To SOC on-call, Subject, intro, fields Target/Attack type/Score/Events/Source/Rule settings/Label, footnote, "Open group in IDEA-X").
