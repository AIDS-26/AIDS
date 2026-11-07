import type { Metadata } from "next";
import SavedTuningScreen from "@/app/components/saved-tuning-screen";

export const metadata: Metadata = { title: "Audit log · IDEA-X" };

export default function AuditPage() {
  return <SavedTuningScreen screen="audit"/>;
}
