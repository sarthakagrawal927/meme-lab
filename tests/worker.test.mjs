import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.mjs';
import {humourBelongs,needsSeriousHandling,rankCandidates,requiresFactualAnswer} from '../worker/src/classification.mjs';
import {MODEL,validateSelection,normalizeSelection,normalizeRankedSelection,validateRankedSelection,presentSelection} from '../worker/src/recommendation.mjs';
import {EMBEDDING_MODEL,reciprocalRankFuse,retrieveCandidates} from '../worker/src/retrieval.mjs';

const selection={decision:'meme',confidence:'high',none_reason:'',candidates:[{id:'waiting-skeleton',reason:'Waiting Skeleton turns the endless approval delay into the entire frustrating experience.',score:94}]};
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
  CLASSIFIER_FETCH:async(_url,options)=>{
    const {labels}=JSON.parse(options.body);
    return Response.json({results:[{label:labels[0],scores:Object.fromEntries(labels.map((label,index)=>[label,index===0?1:0]))}]});
  },
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

test('semantic retrieval fuses meaning and example ranks without duplicate memes',()=>{
  const meaning=[
    {id:'meme-a-meaning',score:.9,metadata:{catalogue_id:'a'}},
    {id:'meme-b-meaning',score:.8,metadata:{catalogue_id:'b'}}
  ];
  const examples=[
    {id:'meme-b-example',score:.95,metadata:{catalogue_id:'b'}},
    {id:'meme-c-example',score:.85,metadata:{catalogue_id:'c'}}
  ];
  const fused=reciprocalRankFuse([meaning,examples],{limit:3});
  assert.deepEqual(fused.map(match=>match.catalogue_id),['b','a','c']);
  assert.equal(fused.filter(match=>match.catalogue_id==='b').length,1);
});

test('production retrieval queries both indexed views and returns unique catalogue records',async()=>{
  const filters=[];
  const retrievalEnv={
    AI:{run:async()=>({data:[[1,0,0]]})},
    MEME_INDEX:{query:async(_vector,options)=>{
      filters.push(options.filter);
      return options.filter.view==='meaning'
        ? {matches:[{id:'meme-meaning-a',score:.9,metadata:{catalogue_id:'waiting-skeleton',view:'meaning'}},{id:'meme-meaning-b',score:.8,metadata:{catalogue_id:'this-is-fine',view:'meaning'}}]}
        : {matches:[{id:'meme-example-b',score:.95,metadata:{catalogue_id:'this-is-fine',view:'example'}},{id:'meme-example-c',score:.85,metadata:{catalogue_id:'first-try',view:'example'}}]};
    }}
  };
  const records=await retrieveCandidates(retrievalEnv,'A situation worth testing.',3);
  assert.deepEqual(filters,[{view:'meaning'},{view:'example'}]);
  assert.deepEqual(records.map(record=>record.id),['this-is-fine','waiting-skeleton','first-try']);
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
  assert.throws(()=>validateSelection({...selection,candidates:[{...selection.candidates[0],reason:'Predictable consequence of ignoring warnings'}]}),/incomplete explanation/);
  assert.throws(()=>validateSelection({...selection,candidates:[{...selection.candidates[0],reason:'The endless approval delay makes waiting itself the central frustration.'}]}),/incomplete explanation/);
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

test('normalization repairs explanation formatting without changing the model meaning',()=>{
  const normalized=normalizeSelection({
    decision:'meme',
    confidence:'high',
    none_reason:'',
    candidates:[{id:'waiting-skeleton',reason:'The promised reply has become an absurdly long wait',score:92}]
  });
  assert.equal(normalized.candidates[0].reason,'Waiting Skeleton fits because the promised reply has become an absurdly long wait.');
  assert.doesNotThrow(()=>validateSelection(normalized));

  const punctuationVariant=normalizeSelection({
    decision:'meme',
    confidence:'high',
    none_reason:'',
    candidates:[{id:'first-try',reason:'First Try fits because the successful ending hides every failed attempt.',score:95}]
  });
  assert.equal(punctuationVariant.candidates[0].reason,'First Try fits because the successful ending hides every failed attempt.');
  assert.doesNotThrow(()=>validateSelection(punctuationVariant));
});

test('multiple meme options are ordered by fit score and keep their scores',()=>{
  const normalized=normalizeSelection({
    decision:'meme',
    confidence:'medium',
    none_reason:'',
    candidates:[
      {id:'waiting-skeleton',reason:'Waiting Skeleton makes the long delay the defining frustration in this situation.',score:72},
      {id:'this-is-fine',reason:'This Is Fine captures the clash between visible chaos and the speaker claiming calm.',score:89}
    ]
  });
  assert.deepEqual(normalized.candidates.map(candidate=>candidate.id),['this-is-fine','waiting-skeleton']);
  assert.deepEqual(presentSelection(validateSelection(normalized)).candidates.map(candidate=>candidate.score),[89,72]);
});

test('classifier gate only runs for high-precision serious cues',async()=>{
  assert.equal(needsSeriousHandling('Please help me write a condolence message.'),true);
  assert.equal(needsSeriousHandling('My build failed right before the demo.'),false);
  assert.equal(needsSeriousHandling('A friend was assaulted and asked me to listen while they consider support.'),true);
  assert.equal(needsSeriousHandling('A colleague wants confidential reporting options for repeated harassment.'),true);
  assert.equal(needsSeriousHandling('I want to apologize without making excuses.'),true);
  assert.equal(needsSeriousHandling('The booking display died and delayed both presentations.'),false);
  assert.equal(requiresFactualAnswer('I need a plain factual explanation of these tax identification fields.'),true);
  assert.equal(requiresFactualAnswer('I need the current documents and expected processing time for a passport.'),true);
  assert.equal(requiresFactualAnswer('A student needs the confirmed scholarship deadline and official submission page.'),true);
  assert.equal(requiresFactualAnswer('The tax deadline is tomorrow and my receipts are in three bags.'),false);
  const fetchImpl=async(_url,options)=>{
    const {labels}=JSON.parse(options.body);
    return Response.json({results:[{label:labels[1],scores:{[labels[0]]:.02,[labels[1]]:.98}}]});
  };
  assert.equal(await humourBelongs('Please help me after a loss.',{fetchImpl}),false);
});

test('public worker abstains directly on an explicit factual form request',async()=>{
  const factualEnv={...env,CLASSIFIER_FETCH:async()=>{throw new Error('The classifier should not run for a deterministic factual request.');}};
  const response=await worker.fetch(new Request('https://example.test/api/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({comment:'I am completing a tax residency form and need a plain factual explanation of what the identification fields mean.'})}),factualEnv);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.decision,'none');
  assert.equal(body.confidence,'low');
  assert.deepEqual(body.candidates,[]);
});

test('classifier ranking is pinned while explanation scores stay descending',async()=>{
  const candidates=[
    {id:'waiting-skeleton',name:'Waiting Skeleton',message:'An absurdly long wait.',relational_pattern:'Someone is stuck waiting.'},
    {id:'this-is-fine',name:'This Is Fine',message:'Calm amid chaos.',relational_pattern:'Someone minimizes visible trouble.'},
    {id:'first-try',name:'First Try',message:'Success hides many attempts.',relational_pattern:'Someone presents effort as effortless.'}
  ];
  const fetchImpl=async(_url,options)=>{
    const {labels}=JSON.parse(options.body);
    return Response.json({results:[{label:labels[1],scores:{[labels[0]]:.1,[labels[1]]:.8,[labels[2]]:.3}}]});
  };
  const ranked=await rankCandidates('Everything is on fire but the owner says it is fine.',candidates,{fetchImpl});
  assert.deepEqual(ranked.map(candidate=>candidate.id),['this-is-fine','first-try','waiting-skeleton']);
  const normalized=normalizeRankedSelection({confidence:'high',candidates:[
    {id:'waiting-skeleton',reason:'Waiting Skeleton makes the prolonged delay the entire joke in this social situation.',score:99},
    {id:'this-is-fine',reason:'This Is Fine matches the owner calmly dismissing an obviously chaotic situation.',score:88},
    {id:'first-try',reason:'First Try reflects a polished result that conceals all the difficult attempts.',score:90}
  ]},ranked.map(candidate=>candidate.id));
  assert.deepEqual(normalized.candidates.map(candidate=>candidate.id),['this-is-fine','first-try','waiting-skeleton']);
  assert.deepEqual(normalized.candidates.map(candidate=>candidate.score),[88,87,86]);
  assert.doesNotThrow(()=>validateRankedSelection(normalized,ranked.map(candidate=>candidate.id)));
});

test('static responses receive security and no-index headers',async()=>{
  const response=await worker.fetch(new Request('https://example.test/'),env);
  assert.equal(response.headers.get('x-frame-options'),'DENY');
  assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
});

test('health reports the full live catalogue',async()=>{
  const response=await worker.fetch(new Request('https://example.test/api/health'),env);
  assert.deepEqual(await response.json(),{status:'ok',catalogue:1000});
});
