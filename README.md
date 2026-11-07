# AIDS

Agentic Intrusion Detection System (AIDS) is an SRE-style SIEM tuning demo.

## Repository layout

```text
config/
  attack_rules.json   Attack-type classification and severity weights
  service_rules.json  CIDR-to-service mapping and service weights
data/
  eve_demo_FINAL.json Suricata EVE event dataset
```

`data/eve_demo_FINAL.json` uses JSON Lines format: each line is an independent
JSON event. It is not a single JSON array or object.

The repository does not yet include a runnable application, dependency
manifest, or test command.
