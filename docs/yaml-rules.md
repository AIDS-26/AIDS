# SIEM II service saturation rules

`tuned_rules.yaml` contains **only `N_sat` per service type**. Its one mapping,
`n_sat_by_service`, uses the exact `service` names in
`config/service_rules.json`, including the `Unmapped asset` default. Every
value is an integer at least 2. `N_sat` controls the logarithmic score rise;
at `n >= N_sat` the unrounded score reaches the cap. Rounding or an already
capped base score can produce 10 earlier. It is not a minimum count before an
alert exists.

The application counts `n` from the current group of events. `W` is owned by
the calculation flow (the current prototype defaults to 5 minutes), **not by
this YAML**. Attack and service weights `A` and `C` still come from the two
canonical JSON files. Runtime must never choose a threshold from `demo.label`.

The current main grouping function expects an `attack_type|service` lookup.
It does not load this service-level YAML directly. Adel and Melvin can adapt
the service value during their application integration; this PR leaves their
Python calculation functions unchanged.

For this draft, each observed service's `N_sat` is the nearest-rank p95 of
per-event trailing five-minute counts, with a floor of 2. The two services
without demo events retain the existing prototype default of 60. These are
proposals, not approved thresholds. On the same 5,483-event replay, expanding
the service values into the current function produced 174 groups and raised
28 all-benign groups. The guardrail therefore fails; baseline rules stay
active. Attack-group recall remains undefined in the current evaluator.

## Version history

Version identity, parent, status, source hashes, and checksums live **outside**
the runtime YAML, in `tuning/history/<id>.json`. A matching `<id>.yaml` is the
immutable snapshot. For a future candidate, archive it from the repository
root with a fresh ID, for example:

```powershell
pwsh -NoProfile -File scripts/archive_tuned_rules.ps1 -VersionId draft-0004 -ParentVersionId draft-0003 -Status proposed
```

The script refuses duplicate IDs and missing parents, and hashes LF-normalized
UTF-8 so Windows and LF checkouts agree. Earlier `draft-0001` and `draft-0002`
record the previous configuration shapes; `draft-0003` is the first
service-only shape. Git also retains the file history. The existing SQLite
`rule_versions` table is not populated by this file archive.

The offline AI loop may later propose revised service thresholds. A
deterministic evaluator and guardrail must accept them before activation.
