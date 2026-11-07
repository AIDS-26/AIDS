import type { Metadata } from "next";
import { getTuningData } from "@/lib/data";
import Tuning from "./tuning-screen";

export const metadata: Metadata = { title: "Tuning · IDEA-X" };

export default function TuningPage() {
  return <Tuning data={getTuningData()}/>;
}
