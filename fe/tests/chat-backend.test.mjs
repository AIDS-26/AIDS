import test from 'node:test';
import assert from 'node:assert/strict';
import { forwardChat } from '../lib/chat-backend.ts';

const request = (body = '{}', headers = {}) => new Request('http://localhost:3000/api/chat', {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body,
});

test('chat proxy forwards only to configured backend and validates the answer', async () => {
  const answer = await forwardChat(request(), 'http://127.0.0.1:8000', async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:8000/api/chat');
    assert.equal(init.headers['X-IDEAX-Chat'], 'dashboard');
    assert.equal(init.redirect, 'error');
    assert.equal(init.body.toString(), '{}');
    assert.ok(init.signal);
    return Response.json({ answer: 'Explanation', sources: ['config/attack_rules.json'] });
  });
  assert.equal(answer.answer, 'Explanation');
});

test('chat proxy rejects cross-origin, oversized and malformed requests before fetching', async () => {
  const fetcher = () => { throw new Error('must not fetch'); };
  for (const req of [request('{}', { origin: 'https://other.example' }), request('x'.repeat(100001)), request('{')]) {
    await assert.rejects(() => forwardChat(req, 'http://127.0.0.1:8000', fetcher), /dashboard|too large|JSON/);
  }
});

test('chat proxy hides provider errors and rejects malformed successes', async () => {
  await assert.rejects(() => forwardChat(request(), 'http://127.0.0.1:8000', async () =>
    new Response('secret provider diagnostic', { status: 429 })), error => error.status === 429 && !error.message.includes('secret'));
  await assert.rejects(() => forwardChat(request(), 'http://127.0.0.1:8000', async () =>
    Response.json({ answer: 'invented shape' })), /invalid response/);
});
