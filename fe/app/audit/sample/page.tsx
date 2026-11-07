import { getAuditData } from "@/lib/data";
import Audit from "../audit-screen";
export default function Page() { return <Audit data={getAuditData()}/>; }
