import { BackendError, backendOrigin, parseRun, readPages } from "./backend-client.ts";

type Row = Record<string, unknown>;
const row = (value: unknown): Row => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BackendError("Invalid saved replay response.");
  return value as Row;
};
const list = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new BackendError("Invalid saved replay list.");
  return value;
};
const text = (value: unknown): string => {
  if (typeof value !== "string") throw new BackendError("Invalid saved replay text.");
  return value;
};
const numeric = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new BackendError("Invalid saved replay number.");
  return value;
};
const integer = (value: unknown): number => {
  const n = numeric(value);
  if (!Number.isSafeInteger(n)) throw new BackendError("Invalid saved replay identifier or count.");
  return n;
};
const id = (value: unknown): number => {
  const n = integer(value);
  if (!n) throw new BackendError("Invalid saved replay identifier.");
  return n;
};
const optionalText = (value: unknown) => value == null ? null : text(value);
const band = (value: unknown): "High" | "Medium" | "Low" => {
  if (value !== "High" && value !== "Medium" && value !== "Low") throw new BackendError("Invalid saved severity.");
  return value;
};
const score = (value: unknown) => {
  const n = id(value);
  if (n > 10) throw new BackendError("Invalid saved score.");
  return n;
};
function summary(value: unknown) {
  const r = row(value);
  const result = { total: integer(r.total), high: integer(r.high), medium: integer(r.medium), low: integer(r.low) };
  if (result.total !== result.high + result.medium + result.low) throw new BackendError("Inconsistent saved severity totals.");
  return result;
}
export type Summary = ReturnType<typeof summary>;

export function parseReplay(value: unknown) {
  const r = row(value), d = row(r.dataset);
  const dataset = { id: id(d.id), name: text(d.name), sha256: text(d.sha256), event_count: integer(d.event_count) };
  const duration_s = numeric(r.duration_s), total_alerts = integer(r.total_alerts);
  if (!duration_s) throw new BackendError("Invalid saved observation duration.");
  const alerts = list(r.alerts).map(value => {
    const a = row(value), base_score = score(a.base_score), saved_score = score(a.score);
    if (saved_score < base_score) throw new BackendError("Saved score is below its base.");
    return { id: id(a.id), event_id: id(a.event_id), source_line: id(a.source_line), t: numeric(a.t),
      timestamp: text(a.timestamp), signature: optionalText(a.signature), rule_name: text(a.rule_name),
      rule_id: text(a.rule_id), src_ip: optionalText(a.src_ip), dest_ip: optionalText(a.dest_ip),
      base_score, score: saved_score, band: band(a.band) };
  });
  if (alerts.length !== total_alerts || total_alerts !== dataset.event_count
      || new Set(alerts.map(a => a.id)).size !== total_alerts || new Set(alerts.map(a => a.event_id)).size !== total_alerts
      || alerts.some((a, i) => a.t > duration_s || (i > 0 && a.t < alerts[i - 1].t))) {
    throw new BackendError("The saved baseline is incomplete or out of order.");
  }
  const tuned_run_id = r.tuned_run_id === null ? null : id(r.tuned_run_id);
  const groups = list(r.groups).map(value => {
    const g = row(value);
    const timeline = list(g.timeline).map(value => {
      const p = row(value);
      return { t: numeric(p.t), last_t: numeric(p.last_t), n: id(p.n), score: score(p.score), band: band(p.band),
        raised_from: p.raised_from === null ? null : band(p.raised_from) };
    });
    const alert_ids = list(g.alert_ids).map(id);
    if (!timeline.length || timeline.length !== alert_ids.length || timeline.some((p, i) =>
      p.n !== i + 1 || p.t > duration_s || p.last_t !== p.t || (i > 0 && p.t < timeline[i - 1].t))) {
      throw new BackendError("Saved group history is incomplete or out of order.");
    }
    return { group_id: id(g.group_id), title: text(g.title), host: optionalText(g.host),
      key_type: text(g.key_type), alert_ids, timeline };
  });
  const membership = groups.flatMap(g => g.alert_ids), alertIds = new Set(alerts.map(a => a.id));
  if (new Set(groups.map(g => g.group_id)).size !== groups.length
      || (tuned_run_id === null ? groups.length > 0 : membership.length !== total_alerts
        || new Set(membership).size !== total_alerts || membership.some(a => !alertIds.has(a)))) {
    throw new BackendError("Saved groups do not preserve the selected original alerts.");
  }
  const frames = list(r.frames).map(value => {
    const f = row(value);
    return { t: numeric(f.t), original: summary(f.original), tuned: f.tuned === null ? null : summary(f.tuned),
      groups_raised: f.groups_raised === null ? null : integer(f.groups_raised), reduction: text(f.reduction) };
  });
  if (!frames.length || frames[0].t !== 0 || frames.at(-1)!.t !== duration_s
      || frames.at(-1)!.original.total !== total_alerts
      || frames.some((f, i) => f.t > duration_s || (i > 0 && f.t <= frames[i - 1].t)
        || (tuned_run_id === null) !== (f.tuned === null))
      || (tuned_run_id !== null && frames.at(-1)!.tuned!.total !== groups.length)) {
    throw new BackendError("Saved replay frames do not match the selected run.");
  }
  let evaluation = null;
  if (r.evaluation !== null) {
    const e = row(r.evaluation), total = integer(e.attack_groups_total), retained = integer(e.attack_groups_retained);
    if (retained > total || (total === 0 && e.attack_group_recall !== null)) throw new BackendError("Invalid saved retention denominator.");
    const recall = e.attack_group_recall === null ? null : numeric(e.attack_group_recall);
    if (recall !== null && recall > 1) throw new BackendError("Invalid saved retention fraction.");
    evaluation = { id: id(e.id), tuned_run_id: id(e.tuned_run_id), attack_groups_total: total,
      attack_groups_retained: retained, attack_group_recall: recall,
      benign_groups_raised: integer(e.benign_groups_raised), recall_scope: optionalText(e.recall_scope) };
  }
  return { dataset, baseline_run_id: id(r.baseline_run_id), tuned_run_id, duration_s, total_alerts, alerts, groups, frames,
    rule_version_id: text(r.rule_version_id), evaluation, notice: optionalText(r.notice) };
}
export type SavedReplay = ReturnType<typeof parseReplay>;
export type OriginalAlert = SavedReplay["alerts"][number];
export type SavedGroup = SavedReplay["groups"][number];
export type GroupPoint = SavedGroup["timeline"][number];

export function parseReplayQuery(params: URLSearchParams) {
  if ([...params.keys()].some(k => !["dataset_id", "run_id"].includes(k))
      || params.getAll("dataset_id").length !== 1 || params.getAll("run_id").length !== 1) {
    throw new BackendError("Invalid replay selection.", 400);
  }
  const selection = (key: string) => {
    const value = params.get(key)!;
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new BackendError("Invalid replay selection.", 400);
    return Number(value);
  };
  return { dataset_id: selection("dataset_id"), run_id: selection("run_id") };
}

export async function readSavedReplay(query: ReturnType<typeof parseReplayQuery>, baseUrl: string, fetcher: typeof fetch = fetch) {
  const origin = backendOrigin(baseUrl);
  const runs = await readPages(origin, `/api/datasets/${query.dataset_id}/runs`, parseRun, fetcher);
  const run = runs.find(r => r.id === query.run_id && r.dataset_id === query.dataset_id);
  if (!run || run.mode !== "baseline" || run.status !== "completed") throw new BackendError("Choose a completed Original rules run.", 400);
  let response: Response;
  try {
    response = await fetcher(`${origin}/api/runs/${run.id}/replay`, { cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(30_000), headers: new URL(origin).hostname.endsWith(".ngrok-free.dev") ? { "ngrok-skip-browser-warning": "true" } : undefined });
  } catch { throw new BackendError("Backend replay is unavailable. Check the read API and retry.", 503); }
  if (!response.ok) throw new BackendError(response.status === 404
    ? "Saved replay is unavailable. Restart the updated backend read API, then retry."
    : "The backend could not load a consistent saved replay. Check the run and retry.", 503);
  let snapshot: SavedReplay;
  try { snapshot = parseReplay(await response.json()); }
  catch (error) { if (error instanceof BackendError) throw error; throw new BackendError("Backend returned invalid replay JSON."); }
  if (snapshot.dataset.id !== query.dataset_id || snapshot.baseline_run_id !== query.run_id || snapshot.duration_s !== run.observation_seconds) {
    throw new BackendError("Saved replay belongs to a different dataset, run, or observation duration.");
  }
  return snapshot;
}
