import { getTuningJobData } from "@/lib/data";
import { BackendError } from "@/lib/backend-client";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
function failure(error: unknown) {
  return Response.json({ error: error instanceof BackendError ? error.message : "The tuning service could not respond." },
    { status: error instanceof BackendError ? error.status : 502, headers });
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => key !== "job_id") || params.getAll("job_id").length > 1) throw new BackendError("Invalid tuning request.", 400);
    return Response.json(await getTuningJobData(params.get("job_id") ?? undefined), { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
      throw new BackendError("Start tuning from the dashboard on this origin.", 403);
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new BackendError("Expected JSON.", 400);
    const text = await request.text();
    if (text.length > 1024) throw new BackendError("Tuning request is too large.", 400);
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new BackendError("Expected JSON.", 400); }
    return Response.json(await getTuningJobData(undefined, body), { status: 202, headers });
  } catch (error) { return failure(error); }
}
