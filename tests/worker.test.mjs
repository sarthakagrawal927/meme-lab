import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.mjs';
import {MODEL,validateSelection,normalizeSelection,presentSelection} from '../worker/src/recommendation.mjs';
import {EMBEDDING_MODEL} from '../worker/src/retrieval.mjs';

const selection={decision:'meme',confidence:'high',none_reason:'',candidates:[{id:'waiting-skeleton',reason:'The wait became the whole experience.',score:94}]};
const assetResponse=new Response('<h1>ok</h1>',{headers:{'Content-Type':'text/html'}});
const stored=[];
const env={
  AI:{run:async(model,input)=>{
    if(model===EMBEDDING_MODEL) return {data:[[1,0,0]]};
    assert.equal(model,MODEL);
    assert.equal(input.response_format.type,'json_schema');
    return{response:selection};
  }},
  MEME_INDEX:{query:async()=>({matches:[{id:'meme-0021',score:.92,metadata:{catalogue_id:'waiting-skeleton'}}]})},
  ASSETS:{fetch:async()=>assetResponse.clone()},
  DB:{prepare:sql=>({bind:(...values)=>({
    run:async()=>{stored.push({sql,values});return{success:true,meta:{changes:1}};},
    first:async()=>({id:values[0]})
  })})}
};

test('public worker returns a validated known meme without exposing prompt data',async()=>{
  const response=await worker.fetch(new Request('https://example.test/api/recommend',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://example.test'},body:JSON.stringify({comment:'We have been waiting for the approval for months.'})}),env);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.candidates[0].id,'waiting-skeleton');
  assert.equal(body.candidates[0].rank,1);
  assert.equal(body.candidates[0].score,94);
  assert.equal(body.confidence,'high');
  assert.equal(body.feedback_enabled,true);
  assert(!JSON.stringify(body).includes('CATALOGUE_JSON'));
});

test('public worker saves one-tap feedback for an existing recommendation',async()=>{
  const requestId=crypto.randomUUID();
  const response=await worker.fetch(new Request('https://example.test/api/feedback',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://example.test'},body:JSON.stringify({request_id:requestId,verdict:'landed',candidate_id:'waiting-skeleton'})}),env);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{saved:true,verdict:'landed'});
  assert(stored.some(entry=>entry.sql.includes('INSERT INTO feedback')));
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
  assert.throws(()=>validateSelection({decision:'meme',confidence:'high',none_reason:'',candidates:[{id:'unknown',reason:'x'}]}),/unknown/);
  assert.throws(()=>validateSelection({...selection,candidates:[{...selection.candidates[0],score:101}]}),/fit score/);
  assert.throws(()=>validateSelection({...selection,candidates:[selection.candidates[0],selection.candidates[0]]}),/duplicate/);
  assert.throws(()=>validateSelection({decision:'none',confidence:'low',none_reason:'No fit.',candidates:selection.candidates}),/contradictory/);
  assert.throws(()=>validateSelection({decision:'none',confidence:'high',none_reason:'No fit.',candidates:[]}),/contradictory confidence/);
  assert.equal(presentSelection(selection).candidates[0].name,'Waiting Skeleton');
});

test('missing confidence downgrades safely and low-confidence memes remain visible',()=>{
  const missing=normalizeSelection({decision:'meme',none_reason:'',candidates:selection.candidates});
  assert.equal(missing.confidence,'low');
  assert.equal(validateSelection(missing).decision,'meme');
  assert.equal(presentSelection(missing).candidates[0].id,'waiting-skeleton');
  const none=normalizeSelection({decision:'meme',confidence:'high',none_reason:'',candidates:[]});
  assert.deepEqual({decision:none.decision,confidence:none.confidence,reason:none.none_reason},{decision:'none',confidence:'low',reason:'None of the current references is a natural fit.'});
});

test('multiple meme options are ordered by fit score and keep their scores',()=>{
  const normalized=normalizeSelection({
    decision:'meme',
    confidence:'medium',
    none_reason:'',
    candidates:[
      {id:'waiting-skeleton',reason:'The long delay is the defining part of this situation.',score:72},
      {id:'this-is-fine',reason:'Visible chaos clashes directly with the speaker claiming calm.',score:89}
    ]
  });
  assert.deepEqual(normalized.candidates.map(candidate=>candidate.id),['this-is-fine','waiting-skeleton']);
  assert.deepEqual(presentSelection(validateSelection(normalized)).candidates.map(candidate=>candidate.score),[89,72]);
});

test('static responses receive security and no-index headers',async()=>{
  const response=await worker.fetch(new Request('https://example.test/'),env);
  assert.equal(response.headers.get('x-frame-options'),'DENY');
  assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
});

test('health reports the full live catalogue',async()=>{
  const response=await worker.fetch(new Request('https://example.test/api/health'),env);
  assert.deepEqual(await response.json(),{status:'ok',catalogue:300});
});
