import Link from "next/link";

export default function ReplayModes({ active }: { active: "saved" | "sample" | "baseline" | "comparison" }) {
  return <nav className="replay-modes" aria-label="Replay data source">
    <Link href="/replay" aria-current={active === "saved" ? "page" : undefined}>Backend · Original + Tuned</Link>
    <Link href="/replay/sample" aria-current={active === "sample" ? "page" : undefined}>Sample demo</Link>
    <Link href="/replay/baseline" aria-current={active === "baseline" ? "page" : undefined}>Backend · Original rules</Link>
    <Link href="/replay/comparison" aria-current={active === "comparison" ? "page" : undefined}>Comparison preview · sample</Link>
  </nav>;
}
