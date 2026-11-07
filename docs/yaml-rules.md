# IDEA-X rule snapshots

`config/attack_rules.json` and `config/service_rules.json` are the canonical
source for attack matching, asset mapping, and weights. The YAML snapshots
contain the complete definitions plus runtime tuning settings. Source SHA-256
hashes bind each snapshot to the exact JSON inputs. The loader validates these
before accepting a snapshot. More specific CIDRs must win when the application
resolves service weights; the YAML file preserves all source entries.

`base_rules.yaml` is generated from the JSON after an operator supplies the
default window, saturation count, candidate windows, and the high-severity
window limit. None of those values is provided by the PDF, so this repository
does not commit invented defaults. For example, after the team chooses values:

```powershell
python -m tuner --window-min <W> --n-sat <N> --max-high-window-min <MAX> --candidate-windows-min <W1> <W2> --output base_rules.yaml
```

The complete snapshot has `schema_version`, `kind`, `source`, `policy`,
`attack_rules`, `attack_fallback`, `service_rules`, `overrides`, and `changes`.
`overrides` select an attack type and a service CIDR and supply per-rule `W`
and `N_sat`. A tuned snapshot retains the full baseline definitions; each
changed override has an audit entry with `old`, `new`, `gap`, and `rationale`.
See `tuner.rules.validate(candidate, attack_json, service_json, base)`.

The SQLite history API in `tuner.history` records immutable YAML snapshots,
parent version, checksum, status, and evaluation report. A failed attempt is
retained. There is no activation API yet: the deterministic evaluator and
guardrail must be integrated before a tuned snapshot can be loaded as active.
The current frontend displays pipeline outputs; it must not recalculate scores.

The tuning loop is offline and has at most three proposals per run. It does
not run once per alert. The current team handoff makes the deterministic
guardrail the activation gate. A human can inspect YAML, diffs, metrics, and
history; a required manual approval gate would be a separate product decision.
