import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJob, tuningRequest } from '../lib/tuning-jobs.ts';

const job = { id: 'a'.repeat(32), baseline_run_id: 1, model: 'test-model', status: 'running', attempt_id: null,
  tuned_run_id: null, iteration: 0, iteration_status: 'starting', error: null, api_key: 'must-not-forward' };

test('progress logs survive polling while unrecognized fields are excluded', () => {
  const entry = { timestamp: '2026-11-07T08:00:00Z', stage: 'proposing', iteration: 1,
    message: 'Requesting model proposal.', api_key: 'must-not-forward' };
  const parsed = parseJob({ ...job, logs: [entry] });
  assert.equal(parsed.logs[0].message, entry.message);
  assert(!JSON.stringify(parsed).includes('must-not-forward'));
  assert.deepEqual(parseJob(job).logs, []);
  assert.throws(() => parseJob({ ...job, logs: [{ ...entry, iteration: 4 }] }), /Invalid/);
});

test('tuning proxy forwards only the baseline and idempotency ID to local control', async () => {
  let request;
  const result = await tuningRequest('http://127.0.0.1:8000', undefined, { baseline_run_id: 1, request_id: job.id }, async (url, init) => {
    request = { url, init }; return Response.json(job);
  });
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.headers['X-IDEAX-Control'], 'local-tuning');
  assert.deepEqual(JSON.parse(request.init.body), { baseline_run_id: 1, request_id: job.id });
  assert(!('api_key' in result));
});

test('tuning control rejects remote origins, model overrides, malformed IDs and incomplete success', async () => {
  for (const origin of ['https://example.test', 'https://localhost']) await assert.rejects(() => tuningRequest(origin), /this computer/);
  await assert.rejects(() => tuningRequest('http://localhost:8000', undefined, { baseline_run_id: 1, request_id: job.id, model: 'override' }), /Invalid/);
  assert.throws(() => parseJob({ ...job, status: 'completed' }), /Invalid/);
  assert.throws(() => parseJob({ ...job, iteration: 4 }), /Invalid/);
});

test('provider diagnostics are not forwarded and status keeps the failed audit reference', async () => {
  await assert.rejects(() => tuningRequest('http://localhost:8000', job.id, undefined,
    async () => new Response('private provider error', { status: 503 })), /CODEX_API_KEY/);
  const failed = await tuningRequest('http://localhost:8000', job.id, undefined,
    async () => Response.json({ ...job, status: 'failed', iteration: 3, attempt_id: 4, error: 'No proposal passed tuning.' }));
  assert.equal(failed.attempt_id, 4); assert.equal(failed.tuned_run_id, null);
});
