import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { playbackReducer, initialPlayback, selectFrame } from '../lib/replay.ts';
const frames = JSON.parse(readFileSync(new URL('../fixtures/replay_frames.json', import.meta.url)));

test('pause freezes time; resume and speed switches preserve elapsed time', () => {
 let s = playbackReducer(initialPlayback, { type:'play', now:1000 }, 9660);
 s = playbackReducer(s, { type:'tick', now:2000 }, 9660);
 assert.equal(s.t,120);
 s = playbackReducer(s, { type:'pause', now:2500 }, 9660);
 assert.equal(s.t,180);
 s = playbackReducer(s, { type:'tick', now:9000 }, 9660);
 assert.equal(s.t,180);
 s = playbackReducer(s, { type:'play', now:10000 }, 9660);
 s = playbackReducer(s, { type:'speed', speed:360, now:10500 }, 9660);
 assert.equal(s.t,240);
 s = playbackReducer(s, { type:'tick', now:11500 }, 9660);
 assert.equal(s.t,600);
 s = playbackReducer(s, { type:'restart', now:12000 }, 9660);
 assert.equal(s.t,0); assert.equal(s.playing,false); assert.equal(s.speed,360);
});

test('all speeds reach the same final fixture without overshooting', () => {
 for(const speed of [60,120,360]) {
  let s = playbackReducer(initialPlayback,{type:'speed',speed,now:0},9660);
  s = playbackReducer(s,{type:'play',now:0},9660);
  s = playbackReducer(s,{type:'tick',now:200000},9660);
  assert.equal(s.t,9660); assert.equal(s.playing,false);
  assert.equal(selectFrame(frames,s.t).original.total,12);
  assert.equal(selectFrame(frames,s.t).tuned.total,5);
 }
});

test('event boundaries select supplied state without leaking future escalation', () => {
 assert.equal(selectFrame(frames,99.99).original.total,0);
 assert.equal(selectFrame(frames,100).original.total,1);
 const before = selectFrame(frames,329.99).groups.find(g=>g.group_id==='g-0003');
 const after = selectFrame(frames,330).groups.find(g=>g.group_id==='g-0003');
 assert.equal(before.band,'Medium'); assert.equal(before.score,5); assert.equal(before.email_t,null);
 assert.equal(after.band,'High'); assert.equal(after.score,8); assert.equal(after.email_t,330);
 assert.equal(before.alert_ids.length,3); assert.equal(after.alert_ids.length,4);
 assert.equal(selectFrame(frames,0).reduction,'N/A');
});

test('every saved frame is internally consistent and contains only elapsed events', () => {
 const alerts = JSON.parse(readFileSync(new URL('../fixtures/original_alerts.json', import.meta.url)));
 let previous=-1;
 for(const frame of frames){
  assert(frame.t>previous); previous=frame.t;
  const visible=alerts.filter(a=>a.t<=frame.t);
  assert.equal(frame.original.total,visible.length);
  assert.deepEqual(frame.groups.flatMap(g=>g.alert_ids).sort(),visible.map(a=>a.id).sort());
  for(const [rows,summary] of [[visible,frame.original],[frame.groups,frame.tuned]]){
   assert.equal(rows.length,summary.total);
   for(const band of ['High','Medium','Low'])assert.equal(rows.filter(r=>r.band===band).length,summary[band.toLowerCase()]);
  }
  assert.equal(frame.groups_raised,frame.groups.filter(g=>g.raised_from!==null).length);
  assert.equal(frame.tuned.emails,frame.groups.filter(g=>g.email_t!==null).length);
  for(const group of frame.groups){
   assert.equal(group.n,group.alert_ids.length);
   assert(group.email_t===null||group.email_t<=frame.t);
   assert(group.last_t<=frame.t);
   assert(group.score>=visible.find(a=>a.id===group.alert_ids[0]).score);
   assert(group.score<=10);
  }
 }
});
