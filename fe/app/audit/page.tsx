import type { Metadata } from "next";
import { getAuditData } from "@/lib/data";
import Audit from "./audit-screen";

export const metadata: Metadata = { title: "Audit log · IDEA-X" };

export default function AuditPage() {
  return <Audit data={getAuditData()}/>;
}
