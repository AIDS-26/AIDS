"""Deterministic alert scoring for the tuned SIEM runtime."""

import math
from numbers import Real


def calculate_score(
    attack_weight: int,
    service_weight: int,
    event_count: int,
    saturation_point: float,
    *,
    benign: bool = False,
    cap: int = 10,
) -> int:
    """Return the score for one alert group.

    The caller is responsible for counting ``event_count`` events in the same
    runtime group during the configured window ``W``. This function implements:

        S = min(cap, attack_weight + service_weight)
        X = round(S + (cap - S) * min(1, ln(n) / ln(N_sat)))

    Rounding uses half-up semantics. Benign alerts retain their base score
    ``S`` regardless of their event count.

    Args:
        attack_weight: Integer attack-type weight ``A`` from 0 through ``cap``.
        service_weight: Integer service weight ``C`` from 0 through ``cap``.
        event_count: Positive integer count ``n`` in the current window.
        saturation_point: Finite numeric ``N_sat`` greater than 1.
        benign: Whether the alert is benign and therefore must not escalate.
        cap: Positive integer score cap, 10 by default.

    Raises:
        TypeError: If an argument has the wrong type.
        ValueError: If an argument is outside its supported bounds.
    """
    if isinstance(cap, bool) or not isinstance(cap, int):
        raise TypeError("cap must be an integer")
    if cap <= 0:
        raise ValueError("cap must be greater than 0")

    for name, value in (
        ("attack_weight", attack_weight),
        ("service_weight", service_weight),
    ):
        if isinstance(value, bool) or not isinstance(value, int):
            raise TypeError("{} must be an integer".format(name))
        if not 0 <= value <= cap:
            raise ValueError("{} must be between 0 and cap".format(name))

    if isinstance(event_count, bool) or not isinstance(event_count, int):
        raise TypeError("event_count must be an integer")
    if event_count < 1:
        raise ValueError("event_count must be at least 1")

    if isinstance(saturation_point, bool) or not isinstance(
        saturation_point, Real
    ):
        raise TypeError("saturation_point must be numeric")
    if not math.isfinite(saturation_point) or saturation_point <= 1:
        raise ValueError("saturation_point must be finite and greater than 1")

    if not isinstance(benign, bool):
        raise TypeError("benign must be a boolean")

    base_score = min(cap, attack_weight + service_weight)
    if benign or event_count == 1 or base_score == cap:
        return base_score

    growth = min(
        1.0,
        math.log(event_count) / math.log(saturation_point),
    )
    raw_score = base_score + (cap - base_score) * growth
    rounded_score = math.floor(raw_score + 0.5)

    return min(cap, max(base_score, rounded_score))

