# IDEA-X

Intrusion Detection Escalation through Agentic reasoning with Codex, eXtended.
An SRE-style SIEM tuning demo.

## Repository layout

```text
config/
  attack_rules.json   Attack-type classification and severity weights
  service_rules.json  CIDR-to-service mapping and service weights
data/
  eve_demo_FINAL.json Suricata EVE event dataset
siem/
  scoring.py           Deterministic per-group score calculation
tests/
  test_scoring.py      Scoring contract tests
tuner/
  rules.py             Full YAML snapshots and deterministic validation
  history.py           SQLite rule version history
```

`data/eve_demo_FINAL.json` uses JSON Lines format: each line is an independent
JSON event. It is not a single JSON array or object.

Install the YAML dependency and run tests with:

```powershell
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
```

The baseline generator requires explicit operator values for `W`, `N_sat`,
candidate windows, and the high-severity window limit. See
`docs/yaml-rules.md`. The repository does not yet include an integrated
Python application or evaluator.
