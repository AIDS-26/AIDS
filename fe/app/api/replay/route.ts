import { getSavedReplayData } from "@/lib/data";
import { BackendError } from "@/lib/backend-client";
import { parseReplayQuery } from "@/lib/saved-replay";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    return Response.json(await getSavedReplayData(parseReplayQuery(new URL(request.url).searchParams)), { headers });
  } catch (error) {
    return Response.json({ error: error instanceof BackendError ? error.message : "Unable to load saved replay." },
      { status: error instanceof BackendError ? error.status : 502, headers });
  }
}
