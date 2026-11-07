import { BackendError, backendOrigin, parseRun, readPages } from "./backend-client.ts";

function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new BackendError("Invalid rule history response."); return value as Record<string, unknown>; }
function text(value: unknown): string { if (typeof value !== "string") throw new BackendError("Invalid rule history field."); return value; }
function optionalText(value: unknown) { return value == null ? null : text(value); }
function numeric(value: unknown) { if (value == null) return null; if (typeof value !== "number" || !Number.isFinite(value)) throw new BackendError("Invalid recorded rule value."); return value; }
export function parseVersion(value: unknown) {
  const r = object(value);
  if (!Number.isSafeInteger(r.cursor) || Number(r.cursor) < 1 || !Array.isArray(r.changes)) throw new BackendError("Invalid rule history cursor or changes.");
  return { id: Number(r.cursor), version_id: text(r.id), parent_id: optionalText(r.parent_id), status: text(r.status), guardrail_status: text(r.guardrail_status),
    created_at: text(r.created_at), rationale: optionalText(r.rationale), changes: r.changes.map(value => {
      const change = object(value);
      return { rule_id: optionalText(change.rule_id), parameter: optionalText(change.parameter), old_value: numeric(change.old_value), new_value: numeric(change.new_value), delta_gap: numeric(change.delta_gap), rationale: optionalText(change.rationale) };
    }) };
}
export type RuleVersion = ReturnType<typeof parseVersion>;

export async function readRuleHistory(datasetId: number, runId: number, baseUrl: string, fetcher: typeof fetch = fetch) {
  const origin = backendOrigin(baseUrl);
  const runs = await readPages(origin, `/api/datasets/${datasetId}/runs`, parseRun, fetcher);
  const run = runs.find(item => item.id === runId && item.dataset_id === datasetId);
  if (!run) throw new BackendError("Selected run does not belong to this dataset.", 404);
  // readPages uses numeric cursors. Version IDs are strings; the API's lineage
  // depth becomes the transport ID, while version_id retains the real identity.
  const items = await readPages(origin, `/api/runs/${runId}/rule-history`, parseVersion, fetcher);
  const seen = new Set<string>();
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (item.id !== index + 1 || seen.has(item.version_id) || (index === 0 ? item.version_id !== run.rule_version_id : items[index - 1].parent_id !== item.version_id)) throw new BackendError("Rule history does not match this run's version lineage.");
    seen.add(item.version_id);
  }
  if (!items.length || items.at(-1)!.parent_id !== null) throw new BackendError("Rule history is incomplete. No partial lineage was used.");
  return { dataset_id: datasetId, run_id: runId, items };
}
