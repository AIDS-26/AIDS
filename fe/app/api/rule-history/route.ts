import { getRuleHistoryData } from "@/lib/data";
import { BackendError, parseQuery } from "@/lib/backend-client";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const params = new URL(request.url).searchParams;
    if (params.has("resource")) throw new BackendError("Invalid rule history request.", 400);
    params.set("resource", "alerts");
    const query = parseQuery(params);
    if (query.resource !== "alerts") throw new BackendError("Invalid rule history request.", 400);
    return Response.json(await getRuleHistoryData(query.dataset_id, query.run_id), { headers });
  } catch (error) {
    return Response.json({ error: error instanceof BackendError ? error.message : "Unable to load rule history." }, { status: error instanceof BackendError ? error.status : 502, headers });
  }
}
