import copy
import unittest
from pathlib import Path

from tuner.rules import RuleError, build_base, dump, validate


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

if __name__ == "__main__":
    unittest.main()
