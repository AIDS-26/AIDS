"""Create a baseline snapshot from canonical JSON after operator bounds are set."""

import argparse
from pathlib import Path

from .rules import build_base, dump


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--attack-json", type=Path, default=Path("config/attack_rules.json"))
    parser.add_argument("--service-json", type=Path, default=Path("config/service_rules.json"))
    parser.add_argument("--window-min", required=True, type=int)
    parser.add_argument("--n-sat", required=True, type=int)
    parser.add_argument("--max-high-window-min", required=True, type=int)
    parser.add_argument("--candidate-windows-min", required=True, nargs="+", type=int)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    snapshot = build_base(args.attack_json, args.service_json,
                          window_min=args.window_min, n_sat=args.n_sat,
                          max_high_window_min=args.max_high_window_min,
                          candidate_windows_min=args.candidate_windows_min)
    args.output.write_text(dump(snapshot), encoding="utf-8")


if __name__ == "__main__":
    main()
