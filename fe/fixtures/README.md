# Replay sample responses

These JSON files are synthetic UI fixtures, not measured CIC-IDS2017 results.

`lib/data.ts` is the single data-source module. The page passes its sample response to the playback component. A future backend API loader can replace this module once the response contract is agreed; no endpoint is assumed and no tuning runs locally in the frontend.

- `original_alerts.json`, `tuned_groups.json`, and `attack_windows.json` follow the proposed file shapes.
- `replay_frames.json` supplies complete as-of states at every event boundary: scores, bands, escalation labels, email times, group membership, explanations, and summary metrics. This is a provisional sample response shape, not an approved backend contract.
- `replay_snapshot.json` retains static reference metadata; playback only uses its run ID, duration, and source total via the loader. All live metrics come from frames.
- Times are seconds from replay start. Events at exactly the current time are included. The most recent frame at or before the clock wins. The clock stops at 9,660 seconds.
- The UI selects saved states; it never calculates scores, bands, grouping, reduction, or recall. Chart coordinates and clock formatting are presentation calculations only.
- Twelve original IDs occur exactly once across five final groups. The exploit remains a singleton. Benign scores stay at base. Already-High groups show a dry-run email at first appearance.
- Evaluation labels are omitted from the client response. Attack windows are illustrative presentation annotations only.
- No email is sent; no evaluator or guardrail success is claimed. Replace the sample source before the demo.

## Tuning design example

`tuning.json` contains a separate, explicitly marked design-example run, `sample-tuning-003`. The flow and run structures follow the proposed contracts, with presentation fields (`reduction_label`, timestamp/duration labels), per-attempt logs, and a sample-only YAML string. They remain provisional API response shapes.

The first attempt fails the sample High-rule window limit; the second passes the illustrative checks. The exploit stays immediate and unmerged in both. The five-minute limit is sample configuration, not an approved production setting. Table budget shares and gaps are stored in JSON and only formatted for display. The 5,483-alert results are not measured and do not belong to Replay's 12-event fixture.

## Audit design examples

`audit.json` contains three explicitly synthetic runs, newest first, with a default selected run ID. Index fields follow the proposed run-list contract; stage notes, artifact references, attempt history, active alert count, and presentation labels are provisional response fields. Run #3 matches `tuning.json` for budget, attempts, accepted outcome, recall, four changed rules and five changed values. Failed run #2 never activates its candidate: `alerts_after` is the rejected proposal, while `active_alerts` retains the baseline. Original alert files and referenced artifacts are not deleted, loaded, or downloaded by this screen.

## Email previews

`emails.json` is a provisional sample response, loaded only through `lib/data.ts`. It belongs to Replay run `sample-001`, unlike Tuning/Audit's separate design-example runs. Four original previews reference emailed original alerts; three tuned previews reference distinct High groups. Every record has `delivery_status: preview_only`. Scores, bands, event IDs and counts describe notification time and are checked against `replay_frames.json`. Rule settings are null rather than invented. No recipient address, email transport, backend endpoint, or send action is configured.
