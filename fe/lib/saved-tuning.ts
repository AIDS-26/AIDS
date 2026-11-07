import { BackendError, backendOrigin, readPages, parseRun } from "./backend-client.ts";

type Row = Record<string, unknown>;
function row(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BackendError("Invalid saved tuning response.");
  return value as Row;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new BackendError("Invalid saved tuning text.");
  return value;
}
function numeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new BackendError("Invalid saved tuning number.");
  return value;
}
function id(value: unknown): number {
  const n = numeric(value);
  if (n === null || !Number.isSafeInteger(n) || n < 1) throw new BackendError("Invalid saved tuning identifier.");
  return n;
}
function optionalText(value: unknown) { return value == null ? null : text(value); }
function list(value: unknown): unknown[] { if (!Array.isArray(value)) throw new BackendError("Invalid saved tuning list."); return value; }
function guardrail(value: unknown) {
  if (value == null) return null;
  const r = row(value);
  if (typeof r.passed !== "boolean") throw new BackendError("Invalid guardrail result.");
  return { passed: r.passed, errors: list(r.errors).map(text), budget_met: typeof r.budget_met === "boolean" ? r.budget_met : null, remaining_budget_gap: numeric(r.remaining_budget_gap) };
}
function evaluation(value: unknown) {
  if (value == null) return null;
  const r = row(value);
  return { baseline_alerts: numeric(r.baseline_alerts), grouped_alerts: numeric(r.grouped_alerts), reduction_pct: numeric(r.reduction_pct),
    attack_groups_total: numeric(r.attack_groups_total), attack_groups_retained: numeric(r.attack_groups_retained), attack_group_recall: numeric(r.attack_group_recall),
    benign_groups_raised: numeric(r.benign_groups_raised), remaining_budget_gap: numeric(r.remaining_budget_gap),
    acceptance_status: optionalText(r.acceptance_status), recall_scope: optionalText(r.recall_scope) };
}
export function parseAttempt(value: unknown) {
  const r = row(value);
  // Deliberately exclude raw outcome JSON, provider errors, policy and artifact paths.
  return { id: id(r.id), baseline_run_id: id(r.baseline_run_id), status: text(r.status), created_at: text(r.created_at),
    selected_version_id: optionalText(r.selected_version_id), has_error: Boolean(r.error_message) };
}
export function parseIteration(value: unknown) {
  const r = row(value), report = r.report && typeof r.report === "object" && !Array.isArray(r.report) ? row(r.report) : null;
  const savedGuardrail = guardrail(r.guardrail ?? report?.guardrail);
  // Failed provider/persistence exceptions can be copied into guardrail.errors by
  // the backend. Keep those diagnostics in backend logs rather than the browser.
  if (r.error_message && savedGuardrail) savedGuardrail.errors = ["Iteration error; see backend logs for diagnostic details."];
  return { id: id(r.id), iteration: id(r.iteration), status: text(r.status), rule_version_id: optionalText(r.rule_version_id),
    tuned_run_id: r.tuned_run_id == null ? null : id(r.tuned_run_id), has_error: Boolean(r.error_message),
    evaluation: evaluation(report?.evaluation), guardrail: savedGuardrail,
    changes: report?.changes == null ? [] : list(report.changes).map(value => {
      const change = row(value);
      return { rule_id: text(change.rule_id), parameter: text(change.parameter), old_value: numeric(change.old_value), new_value: numeric(change.new_value), delta_gap: numeric(change.delta_gap), rationale: text(change.rationale) };
    }) };
}
function parseFlow(value: unknown) {
  if (value == null) return null;
  const r = row(value);
  return { budget_per_hour: numeric(r.budget_per_hour), observed_per_hour: numeric(r.observed_per_hour), burn_rate: numeric(r.burn_rate),
    rules: list(r.rules).map(value => { const rule = row(value); return { rule_id: text(rule.rule_id), observed_per_hour: numeric(rule.observed_per_hour),
      allowed_per_hour: numeric(rule.allowed_per_hour), delta_gap: numeric(rule.delta_gap), peak_n: numeric(rule.peak_n), p95_n: numeric(rule.p95_n) }; }) };
}
export type SavedAttempt = ReturnType<typeof parseAttempt>;
export type SavedIteration = ReturnType<typeof parseIteration>;
export type SavedDetail = { attempt: SavedAttempt; flow: ReturnType<typeof parseFlow>; iterations: SavedIteration[] };
export type SavedQuery = { dataset_id: number; attempt_id?: number };
export function parseSavedQuery(params: URLSearchParams): SavedQuery {
  if ([...params.keys()].some(key => !["dataset_id", "attempt_id"].includes(key)) || params.getAll("dataset_id").length !== 1 || params.getAll("attempt_id").length > 1) throw new BackendError("Invalid saved tuning request.", 400);
  const parse = (name: string) => { const value = params.get(name); if (!value || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new BackendError("Invalid selection ID.", 400); return Number(value); };
  return { dataset_id: parse("dataset_id"), ...(params.has("attempt_id") ? { attempt_id: parse("attempt_id") } : {}) };
}

export async function readSavedTuning(query: SavedQuery, baseUrl: string, fetcher: typeof fetch = fetch) {
  const origin = backendOrigin(baseUrl);
  const attempts = await readPages(origin, `/api/datasets/${query.dataset_id}/tuning-attempts`, parseAttempt, fetcher);
  if (query.attempt_id === undefined) return { kind: "attempts" as const, items: attempts };
  const selected = attempts.find(attempt => attempt.id === query.attempt_id);
  if (!selected) throw new BackendError("Selected attempt was not found in this dataset. Refresh the list.", 404);
  const runs = await readPages(origin, `/api/datasets/${query.dataset_id}/runs`, parseRun, fetcher);
  if (!runs.some(run => run.id === selected.baseline_run_id && run.dataset_id === query.dataset_id && run.mode === "baseline")) throw new BackendError("Attempt baseline does not belong to this dataset.");
  let detail: Omit<SavedDetail, "iterations"> | undefined;
  const nestedFetch: typeof fetch = async (input, init) => {
    const response = await fetcher(input, init);
    if (!response.ok) return response;
    const payload = row(await response.json()), attempt = parseAttempt(payload.attempt);
    if (attempt.id !== selected.id || attempt.baseline_run_id !== selected.baseline_run_id || attempt.status !== selected.status || attempt.selected_version_id !== selected.selected_version_id) throw new BackendError("Attempt changed during loading. Refresh to load its latest state.");
    detail = { attempt, flow: parseFlow(row(payload.attempt).flow) };
    const page = row(payload.iterations);
    return Response.json({ items: page.items, next_after_id: page.next_after_id });
  };
  const iterations = await readPages(origin, `/api/tuning-attempts/${selected.id}`, parseIteration, nestedFetch);
  if (!detail) throw new BackendError("Saved attempt details are unavailable.");
  return { kind: "detail" as const, ...detail, iterations };
}

export function savedRecall(result: SavedIteration["evaluation"]) {
  if (!result || result.attack_groups_total === null || result.attack_groups_total === 0) return "N/A";
  return `${result.attack_groups_retained ?? "—"} / ${result.attack_groups_total} groups retained`;
}
export function iterationAccepted(attempt: SavedAttempt, iteration: SavedIteration) {
  return attempt.status === "completed" && attempt.selected_version_id !== null && attempt.selected_version_id === iteration.rule_version_id && iteration.guardrail?.passed === true;
}
