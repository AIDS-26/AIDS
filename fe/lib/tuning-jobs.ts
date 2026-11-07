import { BackendError, backendOrigin } from "./backend-client.ts";

export type TuningJob = {
  id: string; baseline_run_id: number; status: "running" | "completed" | "failed";
  model: string; attempt_id: number | null; tuned_run_id: number | null;
  iteration: number; iteration_status: string; error: string | null;
  logs: { timestamp: string; stage: string; iteration: number; message: string }[];
};
export type TuningSettings = { model: string; ready: boolean; max_iterations: number; evaluation_session_minutes: number };

export function parseJob(value: unknown): TuningJob {
  if (!value || typeof value !== "object") throw new BackendError("Invalid tuning job response.");
  const r = value as Record<string, unknown>;
  const id = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
  if (typeof r.id !== "string" || !/^[a-f0-9]{32}$/.test(r.id) || !id(r.baseline_run_id)
      || !["running", "completed", "failed"].includes(String(r.status)) || typeof r.model !== "string"
      || !(r.attempt_id === null || id(r.attempt_id)) || !(r.tuned_run_id === null || id(r.tuned_run_id))
      || typeof r.iteration !== "number" || !Number.isInteger(r.iteration) || r.iteration < 0 || r.iteration > 3
      || typeof r.iteration_status !== "string" || !(r.error === null || typeof r.error === "string")
      || (r.status === "completed" && r.tuned_run_id === null)) throw new BackendError("Invalid tuning job response.");
  const logs = r.logs == null ? [] : r.logs;
  if (!Array.isArray(logs) || logs.length > 100 || logs.some(entry => !entry || typeof entry !== "object"
      || typeof entry.timestamp !== "string" || typeof entry.stage !== "string" || typeof entry.message !== "string"
      || !Number.isInteger(entry.iteration) || entry.iteration < 0 || entry.iteration > 3)) {
    throw new BackendError("Invalid tuning progress log.");
  }
  return { id: r.id, baseline_run_id: r.baseline_run_id as number, status: r.status as TuningJob["status"],
    model: r.model, attempt_id: r.attempt_id as number | null, tuned_run_id: r.tuned_run_id as number | null,
    iteration: r.iteration, iteration_status: r.iteration_status, error: r.error as string | null,
    logs: logs.map(entry => ({ timestamp: entry.timestamp, stage: entry.stage, iteration: entry.iteration, message: entry.message })) };
}

export async function tuningRequest(baseUrl: string, jobId?: string, body?: unknown, fetcher: typeof fetch = fetch) {
  const origin = backendOrigin(baseUrl), url = new URL(origin);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new BackendError("Tuning control requires the backend API on this computer. Saved remote results remain readable.", 503);
  }
  if (jobId !== undefined && !/^[a-f0-9]{32}$/.test(jobId)) throw new BackendError("Invalid tuning job ID.", 400);
  let requestBody: { baseline_run_id: number; request_id: string } | undefined;
  if (body !== undefined) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BackendError("Invalid tuning request.", 400);
    const r = body as Record<string, unknown>;
    if (Object.keys(r).sort().join(",") !== "baseline_run_id,request_id"
        || !Number.isSafeInteger(r.baseline_run_id) || Number(r.baseline_run_id) <= 0
        || typeof r.request_id !== "string" || !/^[a-f0-9]{32}$/.test(r.request_id)) throw new BackendError("Invalid tuning request.", 400);
    requestBody = { baseline_run_id: Number(r.baseline_run_id), request_id: r.request_id };
  }
  let response: Response;
  try {
    response = await fetcher(`${origin}/api/tuning-jobs${jobId ? `/${jobId}` : ""}`, {
      method: requestBody ? "POST" : "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: requestBody ? { "Content-Type": "application/json", "X-IDEAX-Control": "local-tuning" } : undefined,
      body: requestBody ? JSON.stringify(requestBody) : undefined,
    });
  } catch { throw new BackendError("The tuning service is unavailable. Check the backend and retry.", 503); }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const messages: Record<number, string> = {
      400: "Choose a completed Original rules run from a tuning dataset.",
      403: "Tuning control is available only through the local dashboard.",
      404: "Tuning job unavailable. Restart the updated backend, or reload saved results and check Audit log.",
      409: "Another tuning job is running. Wait for it to finish before starting another.",
      503: "Tuning is unavailable. Check CODEX_API_KEY in the backend environment or root .env, then retry.",
    };
    throw new BackendError(messages[response.status] || "Tuning could not be started. Saved alerts remain available.", response.status);
  }
  if (requestBody || jobId) return parseJob(result);
  const r = result as Record<string, unknown> | null;
  if (!r || typeof r.model !== "string" || typeof r.ready !== "boolean" || r.max_iterations !== 3 || r.evaluation_session_minutes !== 10) {
    throw new BackendError("Invalid tuning settings response.");
  }
  return { model: r.model, ready: r.ready, max_iterations: 3, evaluation_session_minutes: 10 } satisfies TuningSettings;
}
