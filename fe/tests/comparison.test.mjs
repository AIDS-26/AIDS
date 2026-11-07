import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { comparisonUnavailable, recallLabel } from '../lib/comparison.ts';
const read = name => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url)));
const catalog = read('comparison'), snapshot = read('replay_snapshot');
const dataset = catalog.datasets[0], pair = catalog.pairs[0];
const replay = { run_id: snapshot.run_id, duration_s: snapshot.duration_s };

test('sample comparison uses matching paired run and duration; failed proposals cannot play', () => {
  assert.equal(catalog.sample, true);
  assert.equal(comparisonUnavailable(dataset, pair, replay), null);
  assert.match(comparisonUnavailable(dataset, catalog.pairs[1], replay), /cannot be replayed/);
  assert.match(comparisonUnavailable(dataset, pair), /not available/);
  assert.match(comparisonUnavailable(dataset, {...pair,dataset_id:'another'}, replay), /different dataset/);
  assert.match(comparisonUnavailable(dataset, pair, {...replay,run_id:'another'}), /different tuned run/);
  assert.match(comparisonUnavailable(dataset, pair, {...replay,duration_s:60}), /duration/);
});

test('recall uses the saved display and an empty attack set never claims recall', () => {
  assert.equal(recallLabel(pair), pair.recall_display);
  assert.equal(recallLabel({...pair,recall:{caught:0,total:0},recall_display:'100%'}), 'N/A');
  assert.equal(recallLabel({...pair,recall:null}), 'N/A');
  const attackGroups = read('tuned_groups').filter(group => group.label === 'attack');
  assert.equal(pair.recall.total, attackGroups.length);
});
