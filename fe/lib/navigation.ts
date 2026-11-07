export function screenHref(screen: "replay" | "tuning" | "audit" | "emails", sample: boolean) {
  if (screen === "emails") return "/emails";
  if (screen === "replay") return sample ? "/replay/comparison" : "/replay/baseline";
  return sample ? `/${screen}` : `/${screen}/backend`;
}

export function baselineHref(datasetId: number | string, runId?: number) {
  const query = new URLSearchParams({ dataset_id: String(datasetId) });
  if (runId !== undefined) query.set("run_id", String(runId));
  return `/replay/baseline?${query}`;
}

export function replaySelection(params: Record<string, string | string[] | undefined>) {
  const valid = (value: string | string[] | undefined) => typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
  const dataset = params.dataset_id, run = params.run_id;
  if ((dataset !== undefined && !valid(dataset)) || (run !== undefined && (!valid(run) || !valid(dataset)))) return { dataset: "", run: "", error: "This Replay link has invalid dataset or run IDs. Choose a saved baseline below." };
  return { dataset: dataset as string ?? "", run: run as string ?? "", error: null };
}
