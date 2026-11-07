import Link from "next/link";

export default function ReplayModes({ active }: { active: "saved" | "sample" | "baseline" | "comparison" }) {
  return <nav className="replay-modes" aria-label="Replay data source">
    <Link href="/replay" aria-current={active === "saved" || active === "baseline" ? "page" : undefined}>Backend</Link>
    <Link href="/replay/comparison" aria-current={active === "sample" || active === "comparison" ? "page" : undefined}>Sample demo</Link>
  </nav>;
}
