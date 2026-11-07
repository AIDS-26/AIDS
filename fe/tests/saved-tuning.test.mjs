import test from 'node:test';
import assert from 'node:assert/strict';
import { readSavedTuning, parseSavedQuery, parseIteration, iterationAccepted, savedRecall } from '../lib/saved-tuning.ts';
const response = value => Response.json(value);
const attempt = { id: 2, baseline_run_id: 1, status: 'completed', created_at: '2026-11-07T08:00:00Z', selected_version_id: 'tuned/test', error_message: null, outcome_json: '{"artifact_directory":"private-path"}' };
const run = { id: 1, dataset_id: 1, mode: 'baseline', status: 'completed', rule_version_id: 'baseline/test', observation_seconds: 60, created_at: 'now', completed_at: 'now' };
const iteration = { id: 1, iteration: 1, status: 'evaluated', rule_version_id: 'tuned/test', tuned_run_id: 3, guardrail: { passed: true, errors: [], budget_met: false, remaining_budget_gap: 5 }, report: { evaluation: { baseline_alerts: 10, grouped_alerts: 4, reduction_pct: 60, attack_groups_total: 2, attack_groups_retained: 2, attack_group_recall: 1, benign_groups_raised: 0 }, changes: [] } };
const query = {dataset_id:1,attempt_id:2};
test('accepted grouping keeps benign escalation warnings visible in saved audit data', () => {
  const parsed = parseIteration({ ...iteration,
    guardrail: { ...iteration.guardrail, warnings: ['1 group contains raised benign-labeled evidence'] },
    report: { ...iteration.report, evaluation: { ...iteration.report.evaluation, benign_groups_raised: 1 } },
  });
  assert.equal(iterationAccepted(attempt, parsed), true);
  assert.equal(parsed.evaluation.benign_groups_raised, 1);
  assert.deepEqual(parsed.guardrail.warnings, ['1 group contains raised benign-labeled evidence']);
});
const fetcher = async url => {
  if (url.includes('/tuning-attempts?')) return response({ items: [attempt], next_after_id: null });
  if (url.includes('/runs?')) return response({ items: [run], next_after_id: null });
  const second = url.includes('after_id=1');
  return response({ attempt: {...attempt,flow:null,policy:{secret:'private'},outcome:{rules_file:'private-path'}}, iterations:{items:[{...iteration,id:second?2:1,iteration:second?2:1}],next_after_id:second?null:1} });
};
test('nested pagination loads every saved iteration and drops backend-only fields', async () => {
  const result = await readSavedTuning(query,'http://localhost:8000',fetcher);
  assert.equal(result.iterations.length,2);
  assert.equal(result.iterations[0].evaluation.reduction_pct,60);
  assert.equal(JSON.stringify(result).includes('private'),false);
  assert.equal(result.flow,null);
  assert.equal(JSON.stringify(parseIteration({...iteration,error_message:'private-path',guardrail:{passed:false,errors:['private-path']}})).includes('private-path'),false);
});
test('failed attempts remain visible; a passing iteration alone is not accepted', async () => {
  const parsed = parseIteration(iteration);
  assert.equal(iterationAccepted({...attempt,status:'failed'},parsed),false);
  assert.equal(iterationAccepted({...attempt,selected_version_id:'another'},parsed),false);
  assert.equal(iterationAccepted(attempt,parsed),true);
  assert.equal(iterationAccepted(attempt,parseIteration({...iteration,guardrail:{passed:false,errors:['Rejected']}})),false);
});
test('zero or missing attack denominator never becomes 100% recall', () => {
  assert.equal(savedRecall(null),'N/A');
  assert.equal(savedRecall({...iteration.report.evaluation,attack_groups_total:0}),'N/A');
  assert.equal(savedRecall(iteration.report.evaluation),'2 / 2 groups retained');
  assert.equal(parseIteration({...iteration,report:'historical text',guardrail:null}).evaluation,null);
});
test('rejects mismatched dataset, changed attempt, broken later page and invalid selectors', async () => {
  await assert.rejects(()=>readSavedTuning(query,'http://localhost:8000',url=>url.includes('/runs?')?response({items:[{...run,dataset_id:9}],next_after_id:null}):fetcher(url)),/dataset/);
  await assert.rejects(()=>readSavedTuning(query,'http://localhost:8000',url=>url.includes('after_id=1')?response({attempt:{...attempt,status:'failed'},iterations:{items:[],next_after_id:null}}):fetcher(url)),/changed/i);
  await assert.rejects(()=>readSavedTuning(query,'http://localhost:8000',url=>url.includes('after_id=1')?new Response('',{status:503}):fetcher(url)),/unavailable/i);
  for(const input of ['dataset_id=0','dataset_id=1&attempt_id=2&url=x','dataset_id=1&attempt_id=2&attempt_id=3']) assert.throws(()=>parseSavedQuery(new URLSearchParams(input)));
});
