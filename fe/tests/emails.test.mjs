import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=name=>JSON.parse(readFileSync(new URL('../fixtures/'+name,import.meta.url)));

test('email previews match Replay counts without duplicate group notifications',()=>{
 const data=read('emails.json'), alerts=read('original_alerts.json'), groups=read('tuned_groups.json'), snapshot=read('replay_snapshot.json');
 assert.equal(data.sample,true);assert.equal(data.run_id,snapshot.run_id);
 assert.equal(data.original.length,snapshot.original.emails);assert.equal(data.tuned.length,snapshot.tuned.emails);
 assert.deepEqual(data.original.map(e=>e.alert_id).sort(),alerts.filter(a=>a.emailed).map(a=>a.id).sort());
 assert.deepEqual(data.tuned.map(e=>e.group_id).sort(),groups.filter(g=>g.email_t!==null).map(g=>g.group_id).sort());
 assert.equal(new Set([...data.original,...data.tuned].map(e=>e.id)).size,data.original.length+data.tuned.length);
 for(const email of [...data.original,...data.tuned])assert.equal(email.delivery_status,'preview_only');
});

test('tuned email content uses the saved group state at notification time',()=>{
 const data=read('emails.json'), frames=read('replay_frames.json');
 for(const email of data.tuned){
  const frame=frames.findLast(f=>f.t<=email.t);
  const group=frame.groups.find(g=>g.group_id===email.group_id);
  assert.equal(email.score,group.score);assert.equal(email.events,group.n);
  assert.equal(email.band,group.band);assert.equal(email.t,group.email_t);
  assert.deepEqual(email.alert_ids,group.alert_ids);
 }
 const web=data.tuned.find(e=>e.group_id==='g-0002');
 assert.equal(web.events,1);assert.equal(web.score,8);
});
