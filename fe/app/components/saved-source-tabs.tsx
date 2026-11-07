import Link from "next/link";

export default function SavedSourceTabs({ screen, backend = false }: { screen: "tuning" | "audit"; backend?: boolean }) {
  return <nav className="replay-modes" aria-label={`${screen === "audit" ? "Audit log" : "Tuning"} data source`}>
    <Link href={`/${screen}`} aria-current={!backend ? "page" : undefined}>Sample demo</Link>
    <Link href={`/${screen}/backend`} aria-current={backend ? "page" : undefined}>Backend · Saved results</Link>
  </nav>;
}
