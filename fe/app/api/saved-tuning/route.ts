import { getSavedTuningData } from "@/lib/data";
import { BackendError } from "@/lib/backend-client";
import { parseSavedQuery } from "@/lib/saved-tuning";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try { return Response.json(await getSavedTuningData(parseSavedQuery(new URL(request.url).searchParams)), { headers }); }
  catch (error) { return Response.json({ error: error instanceof BackendError ? error.message : "Unable to read saved tuning results." }, { status: error instanceof BackendError ? error.status : 502, headers }); }
}
