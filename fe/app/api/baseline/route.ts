import { getBaselineData } from "@/lib/data";
import { BackendError, parseQuery } from "@/lib/backend-client";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    return Response.json(await getBaselineData(parseQuery(new URL(request.url).searchParams)), { headers });
  } catch (error) {
    return Response.json({ error: error instanceof BackendError ? error.message : "Unable to load baseline data." }, { status: error instanceof BackendError ? error.status : 502, headers });
  }
}
