export function screenHref(screen: "replay" | "tuning" | "audit" | "emails", sample: boolean) {
  void sample;
  if (screen === "tuning") return "/audit";
  return `/${screen}`;
}

export function baselineHref(datasetId: number | string, runId?: number) {
  const query = new URLSearchParams({ dataset_id: String(datasetId) });
  if (runId !== undefined) query.set("run_id", String(runId));
  return `/replay?${query}`;
}

export function replaySelection(params: Record<string, string | string[] | undefined>) {
  const valid = (value: string | string[] | undefined) => typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
  const dataset = params.dataset_id, run = params.run_id;
  if ((dataset !== undefined && !valid(dataset)) || (run !== undefined && (!valid(run) || !valid(dataset)))) return { dataset: "", run: "", error: "This Replay link has invalid dataset or run IDs. Showing the default comparison." };
  return { dataset: dataset as string ?? "", run: run as string ?? "", error: null };
}
