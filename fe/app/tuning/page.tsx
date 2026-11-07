import type { Metadata } from "next";
import SavedTuningScreen from "@/app/components/saved-tuning-screen";

export const metadata: Metadata = { title: "Tuning · IDEA-X" };

export default function TuningPage() {
  return <SavedTuningScreen screen="tuning"/>;
}
