import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{MODEL,validateSelection,presentSelection} from '../worker/src/index.mjs';

const selection={decision:'meme',none_reason:'',candidates:[{id:'waiting-skeleton',reason:'The wait became the whole experience.'}]};
const assetResponse=new Response('<h1>ok</h1>',{headers:{'Content-Type':'text/html'}});
const env={
  AI:{run:async(model,input)=>{assert.equal(model,MODEL);assert.equal(input.response_format.type,'json_schema');return{response:selection};}},
  ASSETS:{fetch:async()=>assetResponse.clone()}
};

test('public worker returns a validated known meme without exposing prompt data',async()=>{
  const response=await worker.fetch(new Request('https://example.test/api/recommend',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://example.test'},body:JSON.stringify({comment:'We have been waiting for the approval for months.'})}),env);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.candidates[0].id,'waiting-skeleton');
  assert.equal(body.candidates[0].rank,1);
  assert(!JSON.stringify(body).includes('CATALOGUE_JSON'));
});

test('public worker rejects empty, oversized, cross-origin, and unknown API requests',async()=>{
  const empty=await worker.fetch(new Request('https://example.test/api/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({comment:'   '})}),env);
  assert.equal(empty.status,400);
  const oversized=await worker.fetch(new Request('https://example.test/api/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({comment:'x'.repeat(1001)})}),env);
  assert.equal(oversized.status,400);
  const crossOrigin=await worker.fetch(new Request('https://example.test/api/recommend',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.test'},body:JSON.stringify({comment:'hello'})}),env);
  assert.equal(crossOrigin.status,403);
  const unknown=await worker.fetch(new Request('https://example.test/api/private'),env);
  assert.equal(unknown.status,404);
});

test('selection validation rejects unknown, duplicate, and contradictory results',()=>{
  assert.throws(()=>validateSelection({decision:'meme',none_reason:'',candidates:[{id:'unknown',reason:'x'}]}),/unknown/);
  assert.throws(()=>validateSelection({decision:'meme',none_reason:'',candidates:[selection.candidates[0],selection.candidates[0]]}),/duplicate/);
  assert.throws(()=>validateSelection({decision:'none',none_reason:'No fit.',candidates:selection.candidates}),/contradictory/);
  assert.equal(presentSelection(selection).candidates[0].name,'Waiting Skeleton');
});

test('static responses receive security and no-index headers',async()=>{
  const response=await worker.fetch(new Request('https://example.test/'),env);
  assert.equal(response.headers.get('x-frame-options'),'DENY');
  assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
});
