import type { ReplayData } from "./data";

export type ComparisonPair = {
  id: string; dataset_id: string; original_run_id: string; tuned_run_id: string;
  status: string; guardrail: string; observation_seconds: number;
  recall: { caught: number; total: number } | null; recall_display: string | null; note: string;
};
export type ComparisonDataset = { id: string; name: string; sha256: string; observation_seconds: number };
export type ComparisonPreview = {
  sample: true;
  datasets: ComparisonDataset[];
  pairs: ComparisonPair[];
  replays: Record<string, ReplayData>;
};

// Presentation boundary, not a backend endpoint contract. A future server adapter must
// establish same-event provenance and supply saved timeline values before using this view.
export function comparisonUnavailable(dataset: ComparisonDataset, pair: ComparisonPair, replay?: ReplayData): string | null {
  if (pair.dataset_id !== dataset.id) return "The selected runs belong to a different dataset.";
  if (pair.status !== "completed" || pair.guardrail !== "passed") return "This proposal cannot be replayed. Original rules remain active.";
  if (!replay) return "Saved comparison frames are not available yet.";
  if (pair.tuned_run_id !== replay.run_id) return "Saved frames belong to a different tuned run.";
  if (pair.observation_seconds !== dataset.observation_seconds || replay.duration_s !== dataset.observation_seconds) return "The runs do not share the same observation duration.";
  return null;
}

export function recallLabel(pair: ComparisonPair): string {
  return pair.recall && pair.recall.total > 0 ? pair.recall_display ?? "Unavailable" : "N/A";
}
