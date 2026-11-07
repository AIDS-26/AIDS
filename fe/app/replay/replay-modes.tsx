import Link from "next/link";

export default function ReplayModes({ active }: { active: "sample" | "baseline" | "comparison" }) {
  return <nav className="replay-modes" aria-label="Replay data source">
    <Link href="/replay/baseline" aria-current={active === "baseline" ? "page" : undefined}>Backend</Link>
    <Link href="/replay/comparison" aria-current={active !== "baseline" ? "page" : undefined}>Sample demo</Link>
  </nav>;
}
