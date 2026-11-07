import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChatRequest, parseChatAnswer, sendChat } from '../lib/chat.ts';
const context = { source: 'replay', sample: true, run_id: 'sample-001', replay_time_s: 100, item_id: 'g-0001' };

test('chat carries source, run, time and selection without computing results', () => {
  const request = makeChatRequest(context, [], '  Explain this alert  ');
  assert.deepEqual(request, {context, messages:[{role:'user',content:'Explain this alert'}]});
  for(const question of ['', '   ', 'x'.repeat(2001)]) assert.throws(()=>makeChatRequest(context, [], question));
});
test('history is bounded to five complete previous exchanges', () => {
  const history=Array.from({length:20},(_,i)=>({role:i%2?'assistant':'user',content:String(i)}));
  const request=makeChatRequest(context,history,'next');
  assert.equal(request.messages.length,11); assert.equal(request.messages[0].content,'10');
});
test('answers require text and bounded source references', () => {
  assert.deepEqual(parseChatAnswer({answer:' Saved score is 8. ',sources:['run #7 / alert #1']}),{answer:'Saved score is 8.',sources:['run #7 / alert #1']});
  for(const value of [null,{}, {answer:'',sources:[]},{answer:'hello',sources:[42]},{answer:'hello',sources:'file'}, {answer:'x'.repeat(16001),sources:[]}]) assert.throws(()=>parseChatAnswer(value));
});
test('request uses the agreed endpoint and supports cancellation', async () => {
  const controller=new AbortController();
  const result=await sendChat(makeChatRequest(context,[],'Why?'),controller.signal,async(url,init)=>{
    assert.equal(url,'/api/chat');assert.equal(init.method,'POST');assert.equal(init.signal,controller.signal);
    assert.equal(JSON.parse(init.body).context.item_id,'g-0001');
    return Response.json({answer:'Explanation',sources:[]});
  });assert.equal(result.answer,'Explanation');
});
test('unconnected, busy and invalid endpoints produce honest errors without leaking backend bodies', async () => {
  for(const [status,pattern] of [[404,/not connected/],[405,/not connected/],[429,/busy/],[503,/could not answer/],[401,/access/]])
    await assert.rejects(()=>sendChat(makeChatRequest(context,[],'Why?'),new AbortController().signal,async()=>new Response('private detail',{status})),pattern);
  await assert.rejects(()=>sendChat(makeChatRequest(context,[],'Why?'),new AbortController().signal,async()=>new Response('<html>')),/unreadable/);
});
