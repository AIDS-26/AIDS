import { BackendError, backendOrigin } from "./backend-client.ts";
import { parseChatAnswer } from "./chat.ts";

export async function forwardChat(request: Request, baseUrl: string, fetcher: typeof fetch = fetch) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new BackendError("Use chat from this dashboard.", 403);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new BackendError("Expected JSON.", 400);
  const reader = request.body?.getReader();
  if (!reader) throw new BackendError("Expected a chat request.", 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 100_000) { await reader.cancel(); throw new BackendError("Chat request is too large.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = Buffer.concat(chunks);
  try { JSON.parse(body.toString("utf8")); } catch { throw new BackendError("Expected JSON.", 400); }
  let response: Response;
  try {
    response = await fetcher(`${backendOrigin(baseUrl)}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-IDEAX-Chat": "dashboard", "ngrok-skip-browser-warning": "true" },
      body, cache: "no-store", redirect: "error", signal: AbortSignal.any([request.signal, AbortSignal.timeout(50_000)]),
    });
  } catch (error) {
    if (error instanceof BackendError) throw error;
    throw new BackendError("Assistant backend is unavailable.", 503);
  }
  if (!response.ok) throw new BackendError("Assistant could not answer. Check the backend connection and retry.",
    [400, 403, 413, 429, 503].includes(response.status) ? response.status : 502);
  try { return parseChatAnswer(await response.json()); }
  catch { throw new BackendError("Assistant returned an invalid response."); }
}
