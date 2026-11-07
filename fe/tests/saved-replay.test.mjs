import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReplay, parseReplayQuery, readSavedReplay } from '../lib/saved-replay.ts';
import { initialPlayback, playbackReducer, selectFrame } from '../lib/replay.ts';

const summary = (total, high = 0) => ({ total, high, medium: total - high, low: 0 });
function snapshot() {
  return {
    dataset: { id: 1, name: 'events.json', sha256: 'a'.repeat(64), event_count: 2 },
    baseline_run_id: 7, tuned_run_id: 8, rule_version_id: 'accepted-v1', duration_s: 60, total_alerts: 2,
    alerts: [0, 1].map(i => ({ id: 10 + i, event_id: i + 1, source_line: i + 1, t: i * 10,
      timestamp: '2026-01-01T00:00:00Z', signature: 'Example', rule_name: 'Web attack', rule_id: 'web|lan',
      src_ip: '192.0.2.1', dest_ip: '192.0.2.2', score: 5, base_score: 5, band: 'Medium', label: 'private' })),
    groups: [{ group_id: 12, title: 'Web attack', host: '192.0.2.2', key_type: 'target', alert_ids: [10, 11],
      timeline: [{ t: 0, last_t: 0, n: 1, score: 5, band: 'Medium', raised_from: null },
        { t: 10, last_t: 10, n: 2, score: 8, band: 'High', raised_from: 'Medium' }] }],
    frames: [{ t: 0, original: summary(1), tuned: summary(1), groups_raised: 0, reduction: '0.0%' },
      { t: 10, original: summary(2), tuned: summary(1, 1), groups_raised: 1, reduction: '50.0%' },
      { t: 60, original: summary(2), tuned: summary(1, 1), groups_raised: 1, reduction: '50.0%' }],
    evaluation: { id: 1, tuned_run_id: 8, attack_groups_total: 1, attack_groups_retained: 1, attack_group_recall: 1,
      benign_groups_raised: 0, recall_scope: 'Curated evidence retention', private_path: 'private' }, notice: null,
  };
}
const response = data => Response.json(data);
const run = { id: 7, dataset_id: 1, mode: 'baseline', status: 'completed', rule_version_id: 'baseline', observation_seconds: 60,
  created_at: '2026-01-01T00:00:00Z', completed_at: null };

test('saved replay keeps backend scores, drops labels, and never exposes future group state', () => {
  const data = parseReplay(snapshot());
  assert.equal(data.alerts[0].score, 5);
  assert(!('label' in data.alerts[0]));
  assert(!('private_path' in data.evaluation));
  assert.equal(selectFrame(data.groups[0].timeline, 9.99).score, 5);
  assert.equal(selectFrame(data.groups[0].timeline, 10).score, 8);
  for (const speed of [60, 120, 360]) {
    let state = { ...initialPlayback, playing: true, speed };
    state = playbackReducer(state, { type: 'tick', now: 60_000 }, data.duration_s);
    assert.equal(selectFrame(data.frames, state.t).original.total, 2);
    assert.equal(selectFrame(data.frames, state.t).tuned.total, 1);
  }
  const final = playbackReducer(initialPlayback, { type: 'finish', now: 0 }, data.duration_s);
  assert.equal(final.t, 60); assert.equal(final.playing, false);
});

test('rejects lost or duplicate evidence, partial frames, and invalid empty-denominator recall', () => {
  for (const mutate of [
    data => { data.groups[0].alert_ids = [10, 10]; },
    data => { data.alerts.pop(); },
    data => { data.frames.at(-1).original.total = 1; },
    data => { data.evaluation.attack_groups_total = 0; },
    data => { data.groups[0].timeline[0].score = null; },
  ]) {
    const data = snapshot(); mutate(data); assert.throws(() => parseReplay(data));
  }
  const empty = snapshot();
  empty.evaluation.attack_groups_total = 0;
  empty.evaluation.attack_groups_retained = 0;
  empty.evaluation.attack_group_recall = null;
  assert.equal(parseReplay(empty).evaluation.attack_group_recall, null);
});

test('validates exact dataset/run/duration and gives a restart message for an old backend', async () => {
  const fetcher = async url => String(url).includes('/runs?')
    ? response({ items: [run], next_after_id: null }) : response(snapshot());
  const data = await readSavedReplay({ dataset_id: 1, run_id: 7 }, 'http://localhost:8000', fetcher);
  assert.equal(data.total_alerts, 2);
  for (const changed of [{ dataset: { ...snapshot().dataset, id: 2 } }, { baseline_run_id: 9 }, { duration_s: 61 }]) {
    await assert.rejects(() => readSavedReplay({ dataset_id: 1, run_id: 7 }, 'http://localhost:8000', async url =>
      String(url).includes('/runs?') ? response({ items: [run], next_after_id: null }) : response({ ...snapshot(), ...changed })));
  }
  await assert.rejects(() => readSavedReplay({ dataset_id: 1, run_id: 7 }, 'http://localhost:8000', async url =>
    String(url).includes('/runs?') ? response({ items: [run], next_after_id: null }) : new Response('', { status: 404 })), /restart/i);
  for (const query of ['dataset_id=1&run_id=7&url=evil', 'dataset_id=1&run_id=0', 'dataset_id=1&dataset_id=2&run_id=7']) {
    assert.throws(() => parseReplayQuery(new URLSearchParams(query)));
  }
});

test('baseline-only results retain all records and mark tuned metrics unavailable', () => {
  const data = snapshot(); data.tuned_run_id = null; data.groups = []; data.evaluation = null;
  for (const frame of data.frames) { frame.tuned = null; frame.groups_raised = null; frame.reduction = 'N/A'; }
  const parsed = parseReplay(data);
  assert.equal(parsed.total_alerts, 2);
  assert.equal(parsed.frames.at(-1).tuned, null);
  assert.equal(parsed.frames.at(-1).reduction, 'N/A');
});
