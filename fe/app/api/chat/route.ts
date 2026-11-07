import { BackendError } from "@/lib/backend-client";
import { forwardChat } from "@/lib/chat-backend";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function POST(request: Request) {
  try {
    return Response.json(await forwardChat(request, process.env.IDEAX_BACKEND_URL || "http://127.0.0.1:8000"), { headers });
  } catch (error) {
    return Response.json({ error: error instanceof BackendError ? error.message : "Assistant is unavailable." },
      { status: error instanceof BackendError ? error.status : 502, headers });
  }
}
