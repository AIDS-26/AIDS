import unittest

from app.scoring import calculate_score


class CalculateScoreTests(unittest.TestCase):
    def test_singleton_returns_base_score(self):
        self.assertEqual(calculate_score(3, 2, 1, 4), 5)

    def test_repeated_attack_uses_logarithmic_escalation(self):
        self.assertEqual(calculate_score(3, 2, 2, 4), 8)

    def test_saturation_point_reaches_cap(self):
        self.assertEqual(calculate_score(3, 2, 4, 4), 10)

    def test_count_above_saturation_stays_at_cap(self):
        self.assertEqual(calculate_score(3, 2, 20, 4), 10)

    def test_base_score_is_capped(self):
        self.assertEqual(calculate_score(8, 7, 1, 4), 10)

    def test_benign_alert_keeps_base_score(self):
        self.assertEqual(calculate_score(3, 2, 20, 4, benign=True), 5)

    def test_rejects_undefined_saturation_point(self):
        for saturation_point in (1, 0, -1):
            with self.subTest(saturation_point=saturation_point):
                with self.assertRaises(ValueError):
                    calculate_score(3, 2, 2, saturation_point)

    def test_rejects_invalid_event_count(self):
        with self.assertRaises(ValueError):
            calculate_score(3, 2, 0, 4)

    def test_rejects_weight_outside_score_bounds(self):
        with self.assertRaises(ValueError):
            calculate_score(11, 2, 2, 4)


if __name__ == "__main__":
    unittest.main()

