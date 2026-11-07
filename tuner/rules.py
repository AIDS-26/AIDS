"""Build and validate complete, versioned YAML rule snapshots.

This module does not run tuning or decide whether a candidate passes evaluation.
"""

import hashlib
import ipaddress
import json
import math
from pathlib import Path

import yaml


class RuleError(ValueError):
    """A rule snapshot is malformed or changes protected source data."""


def _digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _json(path):
    with open(path, encoding="utf-8") as stream:
        return json.load(stream)


def build_base(attack_path, service_path, *, window_min, n_sat,
               max_high_window_min, candidate_windows_min):
    """Materialize a complete baseline from canonical JSON and operator settings."""
    attacks = _json(attack_path)
    services = _json(service_path)
    snapshot = {
        "schema_version": 1,
        "kind": "base",
        "source": {
            "attack_sha256": _digest(attack_path),
            "service_sha256": _digest(service_path),
        },
        "policy": {
            "cap": 10,
            "window_min": window_min,
            "n_sat": n_sat,
            "candidate_windows_min": candidate_windows_min,
            "max_high_window_min": max_high_window_min,
        },
        "attack_rules": attacks["rules"],
        "attack_fallback": attacks["fallback"],
        "service_rules": services["rules"],
        "service_default": services["default"],
        "overrides": [],
        "changes": [],
    }
    validate(snapshot, attack_path, service_path)
    return snapshot


def load(path):
    with open(path, encoding="utf-8") as stream:
        snapshot = yaml.safe_load(stream)
    if not isinstance(snapshot, dict):
        raise RuleError("YAML root must be a mapping")
    return snapshot


def dump(snapshot):
    return yaml.safe_dump(snapshot, sort_keys=False, allow_unicode=True)


def to_siem2_settings(snapshot, attack_path, service_path):
    """Return Adel's rule lookup and defaults from a validated full snapshot.

    SIEM II currently indexes rules by ``attack_type|service`` rather than CIDR.
    Reject ambiguous service names instead of silently selecting an override.
    """
    validate(snapshot, attack_path, service_path)
    services = {rule["cidr"]: rule["service"] for rule in snapshot["service_rules"]}
    if len(set(services.values())) != len(services):
        raise RuleError("service names must be unique for SIEM II rule lookup")
    lookup = {}
    for rule in snapshot["overrides"]:
        key = rule["attack_type"] + "|" + services[rule["service_cidr"]]
        lookup[key] = {"window_minutes": rule["window_min"], "n_sat": rule["n_sat"]}
    return lookup, snapshot["policy"]["window_min"], snapshot["policy"]["n_sat"]


def validate(snapshot, attack_path, service_path, base=None):
    """Reject unknown fields, invalid bounds, and changes to canonical weights."""
    required = {"schema_version", "kind", "source", "policy", "attack_rules",
                "attack_fallback", "service_rules", "service_default", "overrides", "changes"}
    if not isinstance(snapshot, dict) or set(snapshot) != required:
        raise RuleError("snapshot fields do not match schema v1")
    if snapshot["schema_version"] != 1 or snapshot["kind"] not in ("base", "tuned"):
        raise RuleError("unsupported schema or snapshot kind")
    expected_source = {"attack_sha256": _digest(attack_path),
                       "service_sha256": _digest(service_path)}
    if snapshot["source"] != expected_source:
        raise RuleError("source JSON hashes do not match")
    attacks, services = _json(attack_path), _json(service_path)
    for attack in attacks["rules"] + [attacks["fallback"]]:
        if type(attack["weight"]) is not int or not 0 <= attack["weight"] <= 10:
            raise RuleError("attack weight must be an integer from 0 to 10")
    for service in services["rules"] + [services["default"]]:
        if type(service["weight"]) is not int or not 0 <= service["weight"] <= 10:
            raise RuleError("service weight must be an integer from 0 to 10")
        if "cidr" in service:
            try:
                ipaddress.ip_network(service["cidr"], strict=True)
            except ValueError as exc:
                raise RuleError("invalid service CIDR") from exc
    if (snapshot["attack_rules"] != attacks["rules"] or
            snapshot["attack_fallback"] != attacks["fallback"] or
            snapshot["service_rules"] != services["rules"] or
            snapshot["service_default"] != services["default"]):
        raise RuleError("canonical attack or service definitions changed")
    policy = snapshot["policy"]
    if not isinstance(policy, dict) or set(policy) != {"cap", "window_min", "n_sat",
            "candidate_windows_min", "max_high_window_min"} or policy["cap"] != 10:
        raise RuleError("invalid policy fields")
    candidates = policy["candidate_windows_min"]
    if (not isinstance(candidates, list) or not candidates or
            any(type(n) is not int or n <= 0 for n in candidates) or
            candidates != sorted(set(candidates))):
        raise RuleError("candidate windows must be sorted unique positive minutes")
    high_max = policy["max_high_window_min"]
    if type(high_max) is not int or high_max not in candidates:
        raise RuleError("explicit high-severity window limit required")
    if type(policy["window_min"]) is not int or policy["window_min"] not in candidates or type(policy["n_sat"]) is not int or policy["n_sat"] < 2:
        raise RuleError("invalid default W or N_sat")
    if policy["window_min"] > high_max:
        raise RuleError("default W exceeds high-severity limit")
    if not isinstance(snapshot["overrides"], list) or not isinstance(snapshot["changes"], list):
        raise RuleError("overrides and changes must be lists")
    attack_ids = {r["attack_type"] for r in attacks["rules"]}
    attack_ids.add(attacks["fallback"]["attack_type"])
    service_cidrs = {r["cidr"]: r["weight"] for r in services["rules"]}
    attack_weights = {r["attack_type"]: r["weight"] for r in attacks["rules"]}
    attack_weights[attacks["fallback"]["attack_type"]] = attacks["fallback"]["weight"]
    seen = set()
    for rule in snapshot["overrides"]:
        if not isinstance(rule, dict) or set(rule) != {"attack_type", "service_cidr", "window_min", "n_sat"}:
            raise RuleError("invalid override fields")
        key = (rule["attack_type"], rule["service_cidr"])
        if key in seen or key[0] not in attack_ids or key[1] not in service_cidrs:
            raise RuleError("duplicate or unknown attack/service override")
        seen.add(key)
        if type(rule["window_min"]) is not int or rule["window_min"] not in candidates or type(rule["n_sat"]) is not int or rule["n_sat"] < 2:
            raise RuleError("invalid override W or N_sat")
        if min(10, attack_weights[key[0]] + service_cidrs[key[1]]) >= 8 and rule["window_min"] > high_max:
            raise RuleError("high-severity window exceeds limit")
    if snapshot["kind"] == "base" and (snapshot["overrides"] or snapshot["changes"]):
        raise RuleError("base snapshot cannot contain tuning changes")
    if base is not None:
        validate(base, attack_path, service_path)
        if snapshot["kind"] != "tuned" or snapshot["policy"] != base["policy"]:
            raise RuleError("tuning may not alter policy bounds")
        old = {(r["attack_type"], r["service_cidr"]): r for r in base["overrides"]}
        new = {(r["attack_type"], r["service_cidr"]): r for r in snapshot["overrides"]}
        changed = {k for k in old.keys() | new.keys() if old.get(k) != new.get(k)}
        audited = set()
        for change in snapshot["changes"]:
            if not isinstance(change, dict) or set(change) != {"attack_type", "service_cidr", "old", "new", "gap", "rationale"}:
                raise RuleError("invalid change audit")
            key = (change["attack_type"], change["service_cidr"])
            if key in audited or key not in changed or not isinstance(change["rationale"], str) or not change["rationale"].strip():
                raise RuleError("missing or duplicate rationale")
            audited.add(key)
            default = {"window_min": base["policy"]["window_min"], "n_sat": base["policy"]["n_sat"]}
            for side, actual in (("old", old.get(key)), ("new", new.get(key))):
                expected = {name: (actual or default)[name] for name in default}
                if change[side] != expected:
                    raise RuleError("audit old/new values do not match rule")
            if type(change["gap"]) not in (int, float) or not math.isfinite(change["gap"]):
                raise RuleError("gap must be finite numeric")
        if audited != changed:
            raise RuleError("every changed override needs an audit entry")
    return snapshot
