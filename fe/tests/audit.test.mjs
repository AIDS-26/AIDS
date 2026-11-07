import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=name=>JSON.parse(readFileSync(new URL('../fixtures/'+name,import.meta.url)));

test('audit retains passed and failed runs without activating rejected proposals',()=>{
 const data=read('audit.json');
 assert.equal(data.sample,true);
 assert.equal(new Set(data.runs.map(r=>r.run_id)).size,data.runs.length);
 assert(data.runs.some(r=>r.result==='failed'));
 assert(data.runs.some(r=>r.result==='passed'));
 assert(data.runs.some(r=>r.run_id===data.default_run_id));
 for(const run of data.runs){
  assert.equal(run.attempts,run.attempt_history.length);
  if(run.result==='failed'){
   assert.equal(run.accepted_attempt,null);
   assert.equal(run.active_alerts,run.alerts_before);
   assert(run.attempt_history.every(a=>a.result==='failed'));
  }else{
   assert.equal(run.active_alerts,run.alerts_after);
   assert.equal(run.attempt_history.find(a=>a.n===run.accepted_attempt).result,'passed');
   assert.equal(run.recall.caught,run.recall.total);
   assert(run.recall.total>0);
   assert.equal(run.benign_raised,0);
  }
 }
});

test('latest audit run agrees with the Tuning sample',()=>{
 const audit=read('audit.json'); const tuning=read('tuning.json');
 const run=audit.runs.find(r=>r.run_id===tuning.run.run_id);
 const accepted=tuning.run.attempts.find(a=>a.n===tuning.run.accepted_attempt);
 assert.equal(run.alerts_before,accepted.evaluate.before);
 assert.equal(run.alerts_after,accepted.evaluate.after);
 assert.deepEqual(run.recall,accepted.evaluate.recall);
 assert.equal(run.rules_changed,new Set(accepted.changes.map(c=>c.rule_id)).size);
 assert.equal(run.values_changed,accepted.changes.length);
 assert.equal(run.budget_per_hour,tuning.run.budget_per_hour);
});
