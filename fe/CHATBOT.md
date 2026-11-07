# Ask IDEA-X — connected API

The existing panel now calls same-origin `POST /api/chat`. `lib/chat-backend.ts` proxies to Python `POST /api/chat` using server-only `IDEAX_BACKEND_URL` (default `http://127.0.0.1:8000`). Restart the Python API after updating it. No new dependency or migration is needed.

Python `app/chat.py` loads existing backend `CODEX_API_KEY` / `CODEX_MODEL` settings from the environment, then root `.env`; default model is `gpt-6.1-sol`. Never copy credentials into frontend configuration. It calls the Responses API with `store: false`, bounded output and a 40-second provider timeout. Two concurrent requests per backend process are allowed. The proxy bounds JSON request size, validates same-origin requests, forwards cancellation and hides backend error bodies. Python requires a loopback peer, dashboard marker and no browser Origin. This is a local demo integration, not an authenticated public chat service.

The model receives canonical attack/service mappings and saved run mappings/settings. Saved mappings govern historical scores; current defaults are labeled separately. Retrieval validates dataset/run membership, exact baseline pairing, selected alert/group membership and replay time. It supplies saved snapshot counts/scores, at most 20 recent visible alerts and at most 20 visible selected-group members. Future events and final totals are excluded. References come from retrieval. Chat never reads raw event JSON, labels or frozen sources and has no action tools or writes.

Live Replay now sends `baseline_run_id` alongside its displayed run. Item IDs use `alert-ID` / `group-ID`. Sample Email records are unavailable to retrieval; chat explicitly discloses this and supports general mapping explanations only. The original UI contract below remains applicable; old sample source examples describe the frontend contract, not implemented sample retrieval.

Verification on 7 Nov 2026: frontend tests, lint and production build passed; focused Python chat tests passed. One live API check correctly answered credential brute force weight 7 and the unmapped-asset service contribution 0. Provider integration follows the [official text generation guide](https://developers.openai.com/api/docs/guides/text).

## UI

The floating panel follows the supplied Chat screenshots: open, minimize/close (preserve conversation), suggestions, Pick, context chip, transcript, source references and composer. Enter sends; Shift+Enter adds a line. Escape cancels Pick or minimizes. Pick works with pointer or keyboard on elapsed Replay alerts/groups and the latest 50 backend alerts. Other screens automatically attach the selected attempt, audit run or email.

Picking freezes the run/time/item context shown in the chip and starts a fresh conversation. Without a selection, the first Send freezes the current context for follow-up questions. Clearing selection restores current screen context. New conversation clears history (and uses the current clock when no item is selected). Changing run/attempt/email or navigating resets the panel. Conversation lives in memory only. A failed question can be retried with the exact original context or edited. Stop cancels the browser request. Timeout is 60 seconds. Closing/minimizing does not cancel an in-flight request.

## Request and response contract

Same-origin `POST /api/chat` uses this request shape (sample records themselves are unavailable to backend retrieval):

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
`tests/chat-backend.test.mjs` verifies the proxy and error boundaries; `tests/test_chat.py` verifies backend validation, causal selected alert/group evidence, saved mappings, safe provider errors and the HTTP endpoint. Frontend interaction tests can intercept `/api/chat` with clearly test-only responses; no such mock is shipped in the app.

Verified on 7 Nov 2026: production build, lint, TypeScript and all 20 tests passed. Browser checks covered empty state, suggested questions, Enter submission, the unconnected notice, editing a failed question, closing/reopening, keyboard group picking, selected-attempt changes and Emails context. Layout checked at 400px and 1280px; a mobile scrollbar overflow was fixed. No live OpenAI response was requested or verified.
