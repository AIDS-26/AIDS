import copy
import json
import unittest
from pathlib import Path

from tuner.rules import RuleError, build_base, dump, validate
from app.calculation_base.siem_1_calculation_base import score_events
from app.calculation_base.siem2_calculation_base import group_events_with_yaml
from app.calculation_base.siem2_calculation_base import adjusted_score
from app.calculation_base.evaluate import evaluate_with_yaml


ROOT = Path(__file__).resolve().parents[1]
ATTACK = ROOT / "config" / "attack_rules.json"
SERVICE = ROOT / "config" / "service_rules.json"


class RuleSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.base = build_base(
            ATTACK, SERVICE, window_min=1, n_sat=4,
            max_high_window_min=2, candidate_windows_min=[1, 2, 5],
        )

    def test_full_baseline_preserves_canonical_rules(self):
        self.assertEqual(len(self.base["attack_rules"]), 8)
        self.assertEqual(len(self.base["service_rules"]), 7)
        self.assertEqual(self.base["service_default"]["weight"], 0)
        self.assertIn("attack_sha256", self.base["source"])
        self.assertIn("attack_rules:", dump(self.base))

    def test_tuned_override_has_complete_audit(self):
        tuned = copy.deepcopy(self.base)
        tuned["kind"] = "tuned"
        tuned["overrides"] = [{"attack_type": "credential_brute_force",
                               "service_cidr": "192.168.10.0/24",
                               "window_min": 2, "n_sat": 3}]
        tuned["changes"] = [{"attack_type": "credential_brute_force",
                             "service_cidr": "192.168.10.0/24",
                             "old": {"window_min": 1, "n_sat": 4},
                             "new": {"window_min": 2, "n_sat": 3},
                             "gap": 12.5, "rationale": "Group repeated attempts."}]
        validate(tuned, ATTACK, SERVICE, self.base)
        tuned["changes"][0]["old"]["window_min"] = 5
        with self.assertRaises(RuleError):
            validate(tuned, ATTACK, SERVICE, self.base)

    def test_rejects_changed_weight_and_unknown_field(self):
        changed = copy.deepcopy(self.base)
        changed["attack_rules"][0]["weight"] = 1
        with self.assertRaises(RuleError):
            validate(changed, ATTACK, SERVICE)
        changed = copy.deepcopy(self.base)
        changed["unexpected"] = True
        with self.assertRaises(RuleError):
            validate(changed, ATTACK, SERVICE)

    def test_rejects_invalid_saturation_and_high_window(self):
        changed = copy.deepcopy(self.base)
        changed["policy"]["n_sat"] = 1
        with self.assertRaises(RuleError):
            validate(changed, ATTACK, SERVICE)
        changed = copy.deepcopy(self.base)
        changed["kind"] = "tuned"
        changed["overrides"] = [{"attack_type": "malware_or_reverse_shell",
                                 "service_cidr": "192.168.10.3/32",
                                 "window_min": 5, "n_sat": 3}]
        with self.assertRaises(RuleError):
            validate(changed, ATTACK, SERVICE, self.base)

    def test_yaml_settings_drive_existing_siem2_grouping(self):
        tuned = copy.deepcopy(self.base)
        tuned["kind"] = "tuned"
        tuned["overrides"] = [{"attack_type": "suspicious_external_communication",
                               "service_cidr": "192.168.10.0/24",
                               "window_min": 2, "n_sat": 2}]
        tuned["changes"] = [{"attack_type": "suspicious_external_communication",
                             "service_cidr": "192.168.10.0/24",
                             "old": {"window_min": 1, "n_sat": 4},
                             "new": {"window_min": 2, "n_sat": 2},
                             "gap": 3.0, "rationale": "Escalate repeated activity."}]
        with open(ATTACK, encoding="utf-8") as stream:
            attacks = json.load(stream)
        with open(SERVICE, encoding="utf-8") as stream:
            services = json.load(stream)
        def event(second, category, label):
            return {"timestamp": "2026-11-07T09:00:%02d+00:00" % second,
                    "src_ip": "10.0.0.1", "dest_ip": "192.168.10.9",
                    "alert": {"category": category, "signature": "test"},
                    "demo": {"label": label}}
        events = [event(0, "Potentially Bad Traffic", "benign"),
                  event(30, "Potentially Bad Traffic", "benign"),
                  event(1, "Not Suspicious Traffic", "attack"),
                  event(31, "Not Suspicious Traffic", "attack")]
        baseline = score_events(events, attacks, services)
        groups = group_events_with_yaml(baseline, tuned, ATTACK, SERVICE)
        by_attack = {group["attack_type"]: group for group in groups}
        self.assertEqual(by_attack["suspicious_external_communication"]["score"], 10)
        self.assertEqual(by_attack["informational_or_benign"]["score"], 4)
        report = evaluate_with_yaml(
            baseline, tuned, ATTACK, SERVICE,
            labels={i: e["demo"]["label"] for i, e in enumerate(events)},
        )
        self.assertEqual(report["grouped_alerts"], 2)
        self.assertEqual(report["benign_groups_raised"], 1)
        self.assertIsNone(report["attack_group_recall"])

    def test_existing_score_uses_half_up_and_rejects_invalid_saturation(self):
        self.assertEqual(adjusted_score(3, 2, 4), 7)
        with self.assertRaises(ValueError):
            adjusted_score(3, 2, 1)

if __name__ == "__main__":
    unittest.main()
