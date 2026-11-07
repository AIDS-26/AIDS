export type ChatContext = {
  source: "replay" | "baseline" | "tuning" | "audit" | "emails";
  sample: boolean;
  run_id: string | number;
  dataset_id?: number;
  baseline_run_id?: number;
  replay_time_s?: number;
  attempt?: number;
  item_id?: string;
};
export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatAnswer = { answer: string; sources: string[] };
export const CHAT_ENDPOINT = "/api/chat";
export const MAX_QUESTION_LENGTH = 2000;

export function makeChatRequest(context: ChatContext, history: ChatMessage[], question: string) {
  const content = question.trim();
  if (!content || content.length > MAX_QUESTION_LENGTH) throw new Error("Enter a question of 1–2,000 characters.");
  // Keep five complete recent exchanges to bound request size.
  return { context, messages: [...history.slice(-10).map(({ role, content }) => ({ role, content })), { role: "user" as const, content }] };
}

export function parseChatAnswer(value: unknown): ChatAnswer {
  if (!value || typeof value !== "object") throw new Error("The assistant returned an unreadable answer. Please retry.");
  const result = value as Record<string, unknown>;
  if (typeof result.answer !== "string" || !result.answer.trim() || result.answer.length > 16000 ||
    !Array.isArray(result.sources) || result.sources.length > 20 || result.sources.some(source => typeof source !== "string" || source.length > 500)) {
    throw new Error("The assistant returned an unreadable answer. Please retry.");
  }
  return { answer: result.answer.trim(), sources: result.sources as string[] };
}

export async function sendChat(request: ReturnType<typeof makeChatRequest>, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<ChatAnswer> {
  const response = await fetcher(CHAT_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal });
  if (!response.ok) {
    if ([404, 405, 501].includes(response.status)) throw new Error("Chat is not connected yet. The team needs to connect the assistant endpoint.");
    if (response.status === 429) throw new Error("The assistant is busy. Wait a moment, then retry.");
    if (response.status === 401 || response.status === 403) throw new Error("Chat access is unavailable. Ask the team to check the connection.");
    throw new Error("The assistant could not answer. Your question is saved; please retry.");
  }
  let value: unknown;
  try { value = await response.json(); } catch { throw new Error("The assistant returned an unreadable answer. Please retry."); }
  return parseChatAnswer(value);
}
