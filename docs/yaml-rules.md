# Tuned YAML and version history

`tuned_rules.yaml` is a **proposed** complete snapshot. Its attack and service
mapping sections reproduce `config/attack_rules.json` and
`config/service_rules.json`, including the explicit unmapped-service default.
The SHA-256 values bind it to those source files. JSON remains the runtime source
for Adel's baseline scorer; this PR does not change Python calculation modules.

The current `app.calculation_base.siem2_calculation_base.group_events()` uses
`window_minutes` and `n_sat` per `attack_type|service` rule. Its current defaults
are 5 minutes and 60 events, recorded under `policy` in the YAML. The `rules`
mapping is empty until a measured tuning proposal supplies per-rule values.
The PDF does not define candidate windows or the maximum window for high scores;
those fields remain unset. `changes` and `evaluation` truthfully record that no
proposal has been evaluated or approved. **Do not activate this snapshot.**

## Archive a version

From the repository root, after editing `tuned_rules.yaml` and assigning a new
`version.id` and `version.parent_id`:

```powershell
pwsh -NoProfile -File scripts/archive_tuned_rules.ps1
```

The command saves an immutable copy to `tuning/history/<id>.yaml` and a record
containing its parent ID, SHA-256, and archive time to
`tuning/history/<id>.json`. It refuses to overwrite an ID or refer to a missing
parent. Commit both files with the YAML change. Git also preserves the edit
history of `tuned_rules.yaml` (`git log -- tuned_rules.yaml`). To inspect an old
snapshot, open its archived YAML or run `git show <commit>:tuned_rules.yaml`.

`main` already has an immutable SQLite `rule_versions` table with `parent_id`,
`rules_json`, `changes_json`, and status fields. When the existing backend flow
later loads and validates YAML, it can store the parsed snapshot there and link
new runs through `rule_version_id`. This archive is file history only; it does
not register a DB version, run the guardrail, or change the active rules.
