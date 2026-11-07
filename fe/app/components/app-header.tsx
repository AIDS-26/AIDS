import Image from "next/image";
import Link from "next/link";
import { screenHref } from "@/lib/navigation";

export default function AppHeader({ active, source, sample = true }: { active: "replay" | "audit" | "emails"; source: string; sample?: boolean }) {
  return <header className="app-header">
    <Link className="brand" href={screenHref("replay", sample)} aria-label="IDEA-X Replay"><Image src="/ideax-mark.svg" width={32} height={32} alt=""/><span><strong>IDEA-X</strong><small>Intrusion Detection Escalation<br/>through Agentic reasoning with Codex</small></span></Link>
    <nav aria-label="Main navigation">
      <Link href={screenHref("replay", sample)} aria-current={active === "replay" ? "page" : undefined}>Replay</Link>
      <Link href={screenHref("audit", sample)} aria-current={active === "audit" ? "page" : undefined}>Audit log</Link>
      <Link href="/emails" aria-current={active === "emails" ? "page" : undefined}>Email</Link>
    </nav>
    <span className="source-chip"><b>{sample ? "SAMPLE" : "SAVED"}</b> · {source}</span>
  </header>;
}
