import test from 'node:test';import assert from 'node:assert/strict';
import { readPages, parseQuery, readBaseline, parseAlert, BackendError } from '../lib/backend-client.ts';
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
const run={id:7,dataset_id:1,mode:'baseline',status:'completed',rule_version_id:'v1',observation_seconds:60,budget_per_hour:null,created_at:'2026-11-07T00:00:00Z',completed_at:null};
const alert={id:1,run_id:7,rule_id:'r',group_key:'target:host',attack_type:'scan',service:'web',first_timestamp_us:1000000,last_timestamp_us:1000000,base_score:8,score:8,severity:'High',event_count:1,first_event_id:1,source_line:1,timestamp:'1970-01-01T00:00:01Z',src_ip:'1.1.1.1',dest_ip:'2.2.2.2',dest_port:80,signature_id:1,signature:'Test'};

test('all pages are retrieved, preserving server values and dropping extra fields',async()=>{
 const urls=[];const fetcher=async url=>{urls.push(String(url));return response(urls.length===1?{items:[{...alert,label:'private'}],next_after_id:1}:{items:[{...alert,id:2,first_timestamp_us:0,source_line:2}],next_after_id:null});};
 const rows=await readPages('http://127.0.0.1:8000','/api/runs/7/alerts',parseAlert,fetcher);
 assert.equal(rows.length,2);assert.equal(rows[0].score,8);assert.equal(rows[0].severity,'High');assert(!('label' in rows[0]));assert(urls[1].includes('after_id=1'));
});

test('pagination fails closed on repeated cursor, duplicates, or later-page failure',async()=>{
 await assert.rejects(()=>readPages('http://localhost:8000','/x',x=>x,async()=>response({items:[{id:1}],next_after_id:1})),BackendError);
 let n=0;await assert.rejects(()=>readPages('http://localhost:8000','/x',x=>x,async()=>++n===1?response({items:[{id:1}],next_after_id:1}):new Response('',{status:503})),/unavailable/i);
});

test('only supported resources and positive IDs are accepted',()=>{
 assert.deepEqual(parseQuery(new URLSearchParams('resource=datasets')),{resource:'datasets'});
 for(const q of ['resource=alerts&dataset_id=1&run_id=0','resource=https://evil.test','resource=datasets&url=http://evil.test','resource=datasets&resource=runs'])assert.throws(()=>parseQuery(new URLSearchParams(q)),BackendError);
});

test('rejects nonbaseline and failed runs before loading alerts',async()=>{
 for(const change of [{mode:'tuned'},{status:'failed'}])await assert.rejects(()=>readBaseline({resource:'alerts',dataset_id:1,run_id:7},'http://localhost:8000',async()=>response({items:[{...run,...change}],next_after_id:null})),/completed Original rules/i);
});

test('real baseline is time ordered and invalid data is not silently repaired',async()=>{
 const fetcher=async url=>String(url).includes('/runs?')?response({items:[run],next_after_id:null}):response({items:[{...alert,id:1,first_timestamp_us:2000000},{...alert,id:2}],next_after_id:null});
 const data=await readBaseline({resource:'alerts',dataset_id:1,run_id:7},'http://localhost:8000',fetcher);
 assert.deepEqual(data.items.map(x=>x.id),[2,1]);assert.equal(data.run.id,7);
 assert.throws(()=>parseAlert({...alert,score:null}),BackendError);
 assert.throws(()=>parseAlert({...alert,severity:'unknown'}),BackendError);
});

test('ngrok API requests bypass its HTML browser warning without changing other origins', async () => {
 for (const origin of ['https://example.test','https://trough-scrambler-flashbulb.ngrok-free.dev']) {
  let options;
  await readPages(origin,'/api/datasets',x=>x,async (_url,init)=>{options=init;return response({items:[],next_after_id:null});});
  assert.equal(options.headers?.['ngrok-skip-browser-warning'],origin.includes('ngrok-free.dev')?'true':undefined);
 }
});
