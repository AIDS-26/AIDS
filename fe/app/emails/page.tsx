import type { Metadata } from "next";
import { getEmailsData } from "@/lib/data";
import Emails from "./emails-screen";

export const metadata: Metadata = { title: "Emails · IDEA-X" };

export default function EmailsPage() {
  return <Emails data={getEmailsData()}/>;
}
