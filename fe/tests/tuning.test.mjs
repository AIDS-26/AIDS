import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recallLabel } from '../lib/tuning.ts';

test('zero attack groups cannot substantiate recall',()=>{
 assert.equal(recallLabel({caught:0,total:0}),'N/A');
 assert.equal(recallLabel({caught:7,total:7}),'7 of 7');
});

test('sample run keeps failed attempts and consistent budget and outcomes',()=>{
 const {run,flow}=JSON.parse(readFileSync(new URL('../fixtures/tuning.json',import.meta.url)));
 assert.equal(run.sample,true); assert.equal(run.attempts.length,2);
 assert.equal(run.attempts[0].guardrail.passed,false);
 assert.equal(run.attempts[1].guardrail.passed,true);
 assert.equal(run.result,'passed');
 assert.equal(flow.burn_rate,flow.observed_per_hour/flow.budget_per_hour);
 assert(Math.abs(flow.rules.reduce((s,r)=>s+r.allowed_per_hour,0)-flow.budget_per_hour)<0.001);
 for(const r of flow.rules)assert(Math.abs(r.observed_per_hour-r.allowed_per_hour-r.gap)<0.001);
 for(const attempt of run.attempts){
  assert.equal(attempt.guardrail.passed,attempt.guardrail.checks.every(c=>c.passed));
  assert.equal(attempt.evaluate.before,5483);
  assert.equal(attempt.log.length>0,true);
  assert(attempt.rules_yaml.startsWith('# SAMPLE'));
 }
});
