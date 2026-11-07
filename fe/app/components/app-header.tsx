import Image from "next/image";
import Link from "next/link";

export default function AppHeader({ active, source }: { active: "replay" | "tuning" | "audit" | "emails"; source: string }) {
  return <header className="app-header">
    <Link className="brand" href="/replay" aria-label="IDEA-X Replay"><Image src="/ideax-mark.svg" width={32} height={32} alt=""/><span><strong>IDEA-X</strong><small>Intrusion Detection Escalation</small></span></Link>
    <nav aria-label="Main navigation">
      <Link href="/replay" aria-current={active === "replay" ? "page" : undefined}>Replay</Link>
      <Link href="/tuning" aria-current={active === "tuning" ? "page" : undefined}>Tuning</Link>
      <Link href="/audit" aria-current={active === "audit" ? "page" : undefined}>Audit log</Link>
      <Link href="/emails" aria-current={active === "emails" ? "page" : undefined}>Emails</Link>
    </nav>
    <span className="source-chip"><b>SAMPLE</b> · {source}</span>
  </header>;
}
