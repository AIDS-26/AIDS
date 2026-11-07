# SIEM II tuning rules

`tuned_rules.yaml` is a proposed **parameter file** for runtime SIEM II scoring.
For each `attack_type|service` rule it supplies:

- `window_minutes` (`W`): how long the application counts related events.
- `n_sat` (`N_sat`): the saturation parameter; at `n >= N_sat`, the unrounded
  formula reaches the score cap. Rounding or an already capped base score can
  produce 10 earlier. It must be at least 2. This is **not** a minimum count
  before an alert exists.

The application calculates `n` from events. Attack weight `A` and service weight
`C` remain in the canonical `config/attack_rules.json` and
`config/service_rules.json`. The YAML names those source files and records their
SHA-256 values; it does not duplicate or override their weights. Hashes use
UTF-8 text with LF line endings so Windows and LF checkouts agree.

The `rules` mapping is shaped for the existing
`app.calculation_base.siem2_calculation_base.group_events()` lookup. Its entries
contain only `window_minutes` and `n_sat`. `defaults` supplies the current
prototype values of 5 minutes and 60 events. `version` and `changes` are audit
metadata, not inputs to the scoring formula. The current backend does not load
this YAML automatically; Adel and Melvin's Python modules are unchanged.

The current candidate, `draft-0002`, contains values for 16 observed rule pairs.
It failed the preliminary replay: 5,483 source alerts became 174 groups, but 28
all-benign groups rose above base score. The example budget of 20 alerts/hour
was not met (65.25 grouped alerts/hour). Attack-group recall and the operator's
high-severity window limit remain undefined. The candidate is **rejected**;
baseline rules remain active. The audit entries record each changed value,
delta gap, and rationale. The proposal/evaluation details are in PR #18.

## Version history

After assigning a new `version.id` and existing `version.parent_id`, archive a
candidate from the repository root:

```powershell
pwsh -NoProfile -File scripts/archive_tuned_rules.ps1
```

The script saves `tuning/history/<id>.yaml` and `<id>.json`, refuses an existing
ID or missing parent, and records a SHA-256 over LF-normalized UTF-8 content.
`draft-0001` preserves the initial snapshot; `draft-0002` preserves the first
rule-parameter candidate. Git retains the history of `tuned_rules.yaml` too.

`main` also has an immutable SQLite `rule_versions` table for application-run
history. This file archive does not register a DB version, validate a guardrail,
or activate a candidate. The offline AI loop may later propose new YAML values,
but deterministic replay and guardrails must accept a proposal before use.
