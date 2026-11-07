// Read-only adapter for app/api.py. No database access, scoring, or fixture fallback.
export class BackendError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}
type Row = Record<string, unknown>;
function object(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BackendError("Invalid backend response.");
  return value as Row;
}
function number(value: unknown, min = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min) throw new BackendError("Invalid backend numeric field.");
  return value;
}
function integer(value: unknown, min = 0): number {
  const n = number(value, min);
  if (!Number.isSafeInteger(n)) throw new BackendError("Invalid backend identifier or timestamp.");
  return n;
}
function string(value: unknown): string {
  if (typeof value !== "string") throw new BackendError("Invalid backend text field.");
  return value;
}
function nullableString(value: unknown) { return value === null ? null : string(value); }
export function parseDataset(value: unknown) {
  const r = object(value);
  return { id: integer(r.id, 1), name: string(r.name), event_count: integer(r.event_count), split: string(r.split), sha256: string(r.sha256) };
}
export function parseRun(value: unknown) {
  const r = object(value);
  return { id: integer(r.id, 1), dataset_id: integer(r.dataset_id, 1), mode: string(r.mode), status: string(r.status),
    rule_version_id: nullableString(r.rule_version_id), observation_seconds: number(r.observation_seconds, Number.MIN_VALUE),
    created_at: string(r.created_at), completed_at: nullableString(r.completed_at) };
}
export function parseAlert(value: unknown) {
  const r = object(value);
  const score = integer(r.score, 1), base_score = integer(r.base_score, 1);
  if (score > 10 || base_score > score || !["High", "Medium", "Low"].includes(string(r.severity))) throw new BackendError("Invalid backend score or severity.");
  return { id: integer(r.id, 1), run_id: integer(r.run_id, 1), rule_id: string(r.rule_id), attack_type: string(r.attack_type),
    service: string(r.service), first_timestamp_us: integer(r.first_timestamp_us), last_timestamp_us: integer(r.last_timestamp_us),
    base_score, score, severity: r.severity as "High" | "Medium" | "Low", event_count: integer(r.event_count, 1),
    source_line: integer(r.source_line, 1), timestamp: string(r.timestamp), src_ip: nullableString(r.src_ip), dest_ip: nullableString(r.dest_ip),
    dest_port: r.dest_port === null ? null : integer(r.dest_port), signature: nullableString(r.signature) };
}
export function parseEvidence(value: unknown) {
  const r = object(value);
  return { id: integer(r.id, 1), dataset_id: integer(r.dataset_id, 1), source_line: integer(r.source_line, 1),
    timestamp: string(r.timestamp), timestamp_us: integer(r.timestamp_us), src_ip: nullableString(r.src_ip), dest_ip: nullableString(r.dest_ip),
    signature: nullableString(r.signature), n_in_window: r.n_in_window === null ? null : integer(r.n_in_window, 1),
    raised_score: r.raised_score === null ? null : number(r.raised_score, 1) };
}
export type Dataset = ReturnType<typeof parseDataset>;
export type BaselineRun = ReturnType<typeof parseRun>;
export type BaselineAlert = ReturnType<typeof parseAlert>;
export type Evidence = ReturnType<typeof parseEvidence>;
export type BaselineQuery = { resource: "datasets" } | { resource: "runs"; dataset_id: number } |
  { resource: "alerts" | "evidence"; dataset_id: number; run_id: number; alert_id?: number };

export function parseQuery(params: URLSearchParams): BaselineQuery {
  const resource = params.get("resource");
  const keys = resource === "datasets" ? ["resource"] : resource === "runs" ? ["resource", "dataset_id"] :
    resource === "alerts" ? ["resource", "dataset_id", "run_id"] : resource === "evidence" ? ["resource", "dataset_id", "run_id", "alert_id"] : [];
  if (!keys.length || [...params.keys()].some(key => !keys.includes(key)) || keys.some(key => params.getAll(key).length !== 1)) throw new BackendError("Invalid baseline request.", 400);
  const id = (key: string) => {
    const value = params.get(key)!;
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new BackendError("Invalid selection ID.", 400);
    return Number(value);
  };
  if (resource === "datasets") return { resource };
  if (resource === "runs") return { resource, dataset_id: id("dataset_id") };
  return { resource: resource as "alerts" | "evidence", dataset_id: id("dataset_id"), run_id: id("run_id"), ...(resource === "evidence" ? { alert_id: id("alert_id") } : {}) };
}

export async function readPages<T extends { id: number }>(origin: string, path: string, parse: (value: unknown) => T, fetcher: typeof fetch = fetch) {
  const items: T[] = [], seen = new Set<number>();
  let after = 0;
  const collectionDeadline = AbortSignal.timeout(120_000);
  for (let page = 0; page < 200; page++) {
    const signal = AbortSignal.any([collectionDeadline, AbortSignal.timeout(20_000)]);
    let response: Response;
    try { response = await fetcher(`${origin}${path}?limit=500&after_id=${after}`, {
      cache: "no-store", redirect: "error", signal,
      headers: new URL(origin).hostname.endsWith(".ngrok-free.dev") ? { "ngrok-skip-browser-warning": "true" } : undefined,
    }); }
    catch (error) { if (error instanceof BackendError) throw error; throw new BackendError(signal.aborted ? "Backend request timed out. Retry when the API is ready." : "Backend unavailable. Start the read API and check its configuration.", 503); }
    if (!response.ok) throw new BackendError(response.status === 404 ? "Selected dataset or run was not found. Refresh the list." : response.status === 400 ? "Backend rejected this selection. Refresh and choose a completed run." : "Backend unavailable. Retry when the API is ready.", response.status === 404 ? 404 : 503);
    let payload: Row;
    try { payload = object(await response.json()); } catch { throw new BackendError("Backend returned invalid JSON."); }
    if (!Array.isArray(payload.items) || payload.items.length > 500) throw new BackendError("Backend response has an invalid page of items.");
    for (const value of payload.items) {
      const item = parse(value);
      if (!Number.isSafeInteger(item.id) || item.id <= (items.at(-1)?.id ?? after) || seen.has(item.id)) throw new BackendError("Backend pagination contains duplicate or invalid records.");
      seen.add(item.id); items.push(item);
    }
    if (payload.next_after_id === null) return items;
    const next = integer(payload.next_after_id, 1);
    if (next <= after || !payload.items.length || next !== items.at(-1)?.id) throw new BackendError("Backend pagination did not advance.");
    after = next;
  }
  throw new BackendError("Dataset exceeds the supported 100,000-record load. No partial results were used.");
}

export function backendOrigin(baseUrl: string) {
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new BackendError("Backend URL is not configured correctly.", 503); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
    !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new BackendError("Backend URL must be an HTTP loopback or HTTPS origin.", 503);
  return url.origin;
}

export async function readBaseline(query: BaselineQuery, baseUrl: string, fetcher: typeof fetch = fetch) {
  const origin = backendOrigin(baseUrl);
  if (query.resource === "datasets") return { kind: "datasets" as const, items: await readPages(origin, "/api/datasets", parseDataset, fetcher) };
  const runs = await readPages(origin, `/api/datasets/${query.dataset_id}/runs`, parseRun, fetcher);
  if (runs.some(run => run.dataset_id !== query.dataset_id)) throw new BackendError("Backend returned runs for a different dataset.");
  if (query.resource === "runs") return { kind: "runs" as const, items: runs };
  const run = runs.find(run => run.id === query.run_id);
  if (!run || run.mode !== "baseline" || run.status !== "completed") throw new BackendError("Choose a completed Original rules run.", 400);
  if (query.resource === "evidence") {
    const items = await readPages(origin, `/api/runs/${run.id}/alerts/${query.alert_id}/events`, parseEvidence, fetcher);
    if (items.some(item => item.dataset_id !== query.dataset_id)) throw new BackendError("Evidence belongs to a different dataset.");
    return { kind: "evidence" as const, items: items.sort((a,b) => a.timestamp_us-b.timestamp_us || a.source_line-b.source_line) };
  }
  const items = await readPages(origin, `/api/runs/${run.id}/alerts`, parseAlert, fetcher);
  if (items.some(item => item.run_id !== run.id || item.event_count !== 1)) throw new BackendError("Backend results do not describe a one-event-per-alert baseline.");
  items.sort((a,b) => a.first_timestamp_us-b.first_timestamp_us || a.source_line-b.source_line || a.id-b.id);
  if (items.length && (items.at(-1)!.first_timestamp_us-items[0].first_timestamp_us)/1e6 > run.observation_seconds) throw new BackendError("Run duration does not cover its event timeline.");
  return { kind: "alerts" as const, run, items };
}
