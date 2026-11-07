# AIDS

Agentic Intrusion Detection System (AIDS) is an SRE-style SIEM tuning demo.

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
```

`data/eve_demo_FINAL.json` uses JSON Lines format: each line is an independent
JSON event. It is not a single JSON array or object.

The scoring function has no third-party dependencies. Run its tests with:

```powershell
python -m unittest discover -s tests -v
```

The repository does not yet include a runnable application or dependency
manifest.
