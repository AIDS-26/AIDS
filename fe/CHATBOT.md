# Ask IDEA-X — frontend handoff

Frontend only, per the team's split of work. OpenAI authentication, context retrieval and response generation belong to the backend owner. No OpenAI dependency, key, server route or fake assistant answer is added here.

## UI

The floating panel follows the supplied Chat screenshots: open, minimize/close (preserve conversation), suggestions, Pick, context chip, transcript, source references and composer. Enter sends; Shift+Enter adds a line. Escape cancels Pick or minimizes. Pick works with pointer or keyboard on elapsed Replay alerts/groups and the latest 50 backend alerts. Other screens automatically attach the selected attempt, audit run or email.

Picking freezes the run/time/item context shown in the chip and starts a fresh conversation. Without a selection, the first Send freezes the current context for follow-up questions. Clearing selection restores current screen context. New conversation clears history (and uses the current clock when no item is selected). Changing run/attempt/email or navigating resets the panel. Conversation lives in memory only. A failed question can be retried with the exact original context or edited. Stop cancels the browser request. Timeout is 60 seconds. Closing/minimizing does not cancel an in-flight request.

## Backend contract to implement

Implement same-origin `POST /api/chat`, or change `CHAT_ENDPOINT` in `lib/chat.ts` to an agreed backend route. Example request:

```json
{
  "context": {
    "source": "replay",
    "sample": true,
    "run_id": "sample-001",
    "replay_time_s": 1200,
    "item_id": "g-0002"
  },
  "messages": [{ "role": "user", "content": "Why is this group High?" }]
}
```

`source` is `replay`, `baseline`, `tuning`, `audit`, or `emails`.

| Source | Context |
| --- | --- |
| replay | sample=true, string run_id, replay_time_s, optional item_id (alert or group ID) |
| baseline | sample=false, numeric dataset_id/run_id, replay_time_s, optional item_id (alert ID as string) |
| tuning | sample=true, string run_id, numeric attempt |
| audit | sample=true, selected string run_id |
| emails | sample=true, string run_id, selected email item_id |

The frontend sends only selection identifiers, not authoritative scores. Backend must validate all identifiers and history roles, resolve the requested saved results, and enforce run/dataset membership. Respect elapsed replay time, using saved frame/event values rather than final totals. Do not join the separate Tuning design-example run to Replay sample-001. Never substitute sample data for unavailable live context. Treat signatures, message text and all other result content as untrusted data, not model instructions. Keys must remain server-only; keep database access behind the existing read API. No rule writes, email sending or action tools are part of this chat.

Successful response (`200`, application/json):

```json
{
  "answer": "The saved base score for this alert is 9, already in the High band. ...",
  "sources": ["sample-001 · g-0001 · replay snapshot 6900s"]
}
```

`answer` is nonempty plain text (max 16,000 characters); `sources` is an array of up to 20 plain-text references (max 500 characters each). Use an empty array when no saved source supports a general explanation. The UI does not render HTML or arbitrary links. Sources must be grounded by the backend; the frontend cannot verify a model's factual claims.

User questions are limited to 2,000 characters; the last five complete exchanges plus the question are sent. The backend must validate limits independently and set its own output limits. Responses are non-streaming. Failed responses should use non-2xx status codes: 404/405/501 show "not connected", 401/403 show access unavailable, 429 shows busy; other errors are generic. Private backend error bodies are never displayed. No streaming or error-envelope contract is assumed.

## Verification

Run `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` in fe.
`tests/chat.test.mjs` covers request context, bounded history, response validation, endpoint failures and cancellation signal propagation.
Live model answers require the teammate's endpoint. Frontend interaction tests can intercept `/api/chat` with clearly test-only responses; no such mock is shipped in the app.

Verified on 7 Nov 2026: production build, lint, TypeScript and all 20 tests passed. Browser checks covered empty state, suggested questions, Enter submission, the unconnected notice, editing a failed question, closing/reopening, keyboard group picking, selected-attempt changes and Emails context. Layout checked at 400px and 1280px; a mobile scrollbar overflow was fixed. No live OpenAI response was requested or verified.
