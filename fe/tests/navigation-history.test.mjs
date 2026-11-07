import test from 'node:test';
import assert from 'node:assert/strict';
import { screenHref, baselineHref, replaySelection } from '../lib/navigation.ts';
import { readRuleHistory } from '../lib/rule-history.ts';

test('backend navigation stays backend; sample navigation and email are explicit', () => {
  assert.equal(screenHref('replay',false),'/replay/baseline');
  assert.equal(screenHref('tuning',false),'/tuning/backend');
  assert.equal(screenHref('audit',false),'/audit/backend');
  assert.equal(screenHref('replay',true),'/replay/comparison');
  assert.equal(screenHref('emails',false),'/emails');
});
test('Replay links carry dataset/run IDs and reject malformed or duplicate selections', () => {
  assert.equal(baselineHref(2,7),'/replay/baseline?dataset_id=2&run_id=7');
  assert.deepEqual(replaySelection({dataset_id:'2',run_id:'7'}),{dataset:'2',run:'7',error:null});
  assert.deepEqual(replaySelection({dataset_id:'2'}),{dataset:'2',run:'',error:null});
  for(const input of [{run_id:'1'},{dataset_id:['1','2']},{dataset_id:'-1'},{dataset_id:'1',run_id:'foo'}]) assert.ok(replaySelection(input).error);
});
const run={id:7,dataset_id:2,mode:'tuned',status:'failed',rule_version_id:'child',observation_seconds:60,created_at:'now',completed_at:null};
const child={id:'child',parent_id:'root',cursor:1,status:'rejected',guardrail_status:'failed',created_at:'now',rationale:'Rejected proposal',changes:[{rule_id:'r',parameter:'n_sat',old_value:3,new_value:5,delta_gap:1,rationale:'Test'}],rules:{private:'not forwarded'}};
const root={...child,id:'root',parent_id:null,cursor:2,status:'retired',changes:[]};
const fetcher=async url=>Response.json(url.includes('/runs?')?{items:[run],next_after_id:null}:url.includes('after_id=0')?{items:[child],next_after_id:1}:{items:[root],next_after_id:null});
test('history follows depth cursors, preserves string version IDs and excludes raw snapshots',async()=>{
  const result=await readRuleHistory(2,7,'http://localhost:8000',fetcher);
  assert.deepEqual(result.items.map(x=>x.version_id),['child','root']);
  assert.equal(result.items[0].changes[0].new_value,5);
  assert.equal(JSON.stringify(result).includes('private'),false);
});
test('history rejects wrong ownership, wrong version, broken lineage and incomplete pagination',async()=>{
  await assert.rejects(()=>readRuleHistory(3,7,'http://localhost:8000',fetcher),/dataset/);
  for(const altered of [{...root,id:'wrong'}, {...root,parent_id:'missing'}]) {
    await assert.rejects(()=>readRuleHistory(2,7,'http://localhost:8000',url=>url.includes('after_id=1')?Response.json({items:[altered],next_after_id:null}):fetcher(url)));
  }
  await assert.rejects(()=>readRuleHistory(2,7,'http://localhost:8000',url=>url.includes('/runs?')?Response.json({items:[{...run,rule_version_id:'wrong'}],next_after_id:null}):fetcher(url)),/lineage/);
});
