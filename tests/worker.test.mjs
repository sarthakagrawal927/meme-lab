import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../worker/src/index.mjs';
import {FIT_LABELS,hasMultiplePerspectives,humourBelongs,needsSeriousHandling,PERSPECTIVES,rankCandidates,rankCandidatesByPerspective,requiresFactualAnswer} from '../worker/src/classification.mjs';
import {MINIMUM_VISIBLE_FIT,MINIMUM_VISIBLE_PERSPECTIVE_FIT,validateSelection,normalizeSelection,normalizeRankedSelection,validateRankedSelection,presentSelection,selectionFromRanking} from '../worker/src/recommendation.mjs';
import {CORE_RESERVE,EMBEDDING_MODEL,mergeWithReserve,retrieveCandidates} from '../worker/src/retrieval.mjs';
import {reciprocalRankFuse} from '../worker/src/rank-fusion.mjs';
import {rankRelevanceCandidates,staticCandidateSignals} from '../worker/src/candidate-signals.mjs';

const selection={decision:'meme',confidence:'high',none_reason:'',candidates:[{id:'waiting-skeleton',reason:'Waiting Skeleton turns the endless approval delay into the entire frustrating experience.',score:94}]};
const assetResponse=new Response('<h1>ok</h1>',{headers:{'Content-Type':'text/html'}});
const stored=[];
const oneHot=(labels,index)=>({label:labels[index],scores:Object.fromEntries(labels.map((label,labelIndex)=>[label,labelIndex===index?1:0]))});
const ordinalBatch=body=>({results:body.inputs.map((_,index)=>oneHot(body.labels,Math.max(1,4-index)))});
const directScoreAnswer=(score=4)=>({
  type:'score',
  score,
  confidence:1,
  probabilities:Object.fromEntries(Array.from({length:5},(_,index)=>[String(index),index===Math.round(score)?1:0]))
});
const env={
  AI:{run:async(model,input)=>{
    if(model===EMBEDDING_MODEL) return {data:[[1,0,0]]};
    assert.fail(`Unexpected Workers AI model: ${model} with ${JSON.stringify(input)}`);
  }},
  MEME_INDEX:{query:async()=>({matches:[{id:'meme-0021',score:.92,metadata:{catalogue_id:'waiting-skeleton'}}]})},
  CLASSIFIER_FETCH:async(_url,options)=>{
    const body=JSON.parse(options.body);
    if(body.labels[0]===FIT_LABELS[0].label) return Response.json(ordinalBatch(body));
    return Response.json({results:[oneHot(body.labels,0)]});
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
  assert.equal(body.candidates[0].score,100);
  assert.equal(body.candidates[0].fit_label,'exact');
  assert.equal('reason' in body.candidates[0],false);
  assert.equal(body.candidates[0].meme_strength,61);
  assert.equal(body.candidates[0].asset_quality,50);
  assert.equal(body.candidates[0].media_type,'image');
  assert.equal(body.candidates[0].media_url,body.candidates[0].image_url);
  assert.equal(body.candidates[0].preview_url,body.candidates[0].image_url);
  assert.equal(body.candidates[0].source_url,body.candidates[0].image_url);
  assert.match(body.candidates[0].signal_summary,/meme strength at 61\/100 and image quality at 50\/100/);
  assert.equal(body.confidence,'high');
  assert.equal(body.feedback_enabled,true);
  assert(!JSON.stringify(body).includes('CATALOGUE_JSON'));
  assert.equal(stored.find(entry=>entry.sql.includes('INSERT INTO recommendations'))?.values[4],'classifier.dev/jev-fast');
});

test('configured TypeSafe key sends one authenticated direct Jev request without entering the response',async()=>{
  let authorization;
  let endpoint;
  let questionCount;
  const keyedEnv={
    ...env,
    TYPESAFE_API_KEY:'test-typesafe-key',
    CLASSIFIER_FETCH:async(url,options)=>{
      endpoint=url;
      authorization=new Headers(options.headers).get('authorization');
      const body=JSON.parse(options.body);
      questionCount=Object.keys(body.questions).length;
      return Response.json({model:'jev-test',answers:Object.fromEntries(Object.keys(body.questions).map((id,index)=>[id,directScoreAnswer(index===0?4:Math.max(0,3-index/20))]))});
    }
  };
  const response=await worker.fetch(new Request('https://example.test/api/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({comment:'I waited all day for a reply.'})}),keyedEnv);
  assert.equal(response.status,200);
  assert.equal(endpoint,'https://api.typesafe.ai/v1/systemone');
  assert.equal(questionCount,1);
  assert.equal(authorization,'Bearer test-typesafe-key');
  assert.doesNotMatch(JSON.stringify(await response.json()),/test-typesafe-key/);
  assert.equal(stored.findLast(entry=>entry.sql.includes('INSERT INTO recommendations'))?.values[4],'typesafe/jev-latest');
});

test('static prior only breaks close calls after relevance chooses the eligible candidates',()=>{
  const ranked=rankRelevanceCandidates([
    {id:'relevance-first',name:'First',classifier_score:.9,retrieval_rank:1,meme_strength:10,asset_quality:10},
    {id:'close-low-prior',name:'Close low',classifier_score:.8,retrieval_rank:2,meme_strength:10,asset_quality:10},
    {id:'close-high-prior',name:'Close high',classifier_score:.78,retrieval_rank:3,meme_strength:100,asset_quality:100},
    {id:'excluded-high-prior',name:'Excluded',classifier_score:.779,retrieval_rank:4,meme_strength:100,asset_quality:100}
  ],{limit:3});
  assert.deepEqual(ranked.map(candidate=>candidate.id),['relevance-first','close-high-prior','close-low-prior']);
  assert(!ranked.some(candidate=>candidate.id==='excluded-high-prior'));
});

test('static signals stay deterministic and describe both public scores',()=>{
  const signals=staticCandidateSignals({id:'waiting-skeleton',image_url:'https://i.imgflip.com/2fm6x.jpg',media_status:'source-preview'});
  assert.deepEqual({meme_strength:signals.meme_strength,asset_quality:signals.asset_quality,static_prior:signals.static_prior},{meme_strength:90,asset_quality:78,static_prior:86});
  assert.match(signals.signal_summary,/^Static signals rate meme strength at 90\/100 and image quality at 78\/100 \(direct source preview\)\.$/);
  assert.match(staticCandidateSignals({id:'low-quality',meme_strength:60,asset_quality:43,image_url:'https://example.com/image.jpg',media_status:'source-preview'}).signal_summary,/\(lower-quality source preview\)\.$/);
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

test('core reserve keeps twenty broad slots and ten core slots in a top-thirty shortlist',()=>{
  const broad=Array.from({length:30},(_,index)=>({catalogue_id:`broad-${index+1}`}));
  const core=Array.from({length:10},(_,index)=>({catalogue_id:`core-${index+1}`}));
  const merged=mergeWithReserve(broad,core,{limit:30,reserve:CORE_RESERVE});
  assert.deepEqual(merged.slice(0,20).map(match=>match.catalogue_id),broad.slice(0,20).map(match=>match.catalogue_id));
  assert.deepEqual(merged.slice(20).map(match=>match.catalogue_id),core.map(match=>match.catalogue_id));
});

test('production retrieval queries broad and core indexed views and returns unique catalogue records',async()=>{
  const filters=[];
  const retrievalEnv={
    AI:{run:async()=>({data:[[1,0,0]]})},
    MEME_INDEX:{query:async(_vector,options)=>{
      filters.push(options.filter);
      if(options.filter.core) return options.filter.view==='meaning'
        ? {matches:[{id:'core-meaning-a',score:.9,metadata:{catalogue_id:'waiting-skeleton',view:'meaning',core:true}},{id:'core-meaning-b',score:.8,metadata:{catalogue_id:'first-try',view:'meaning',core:true}}]}
        : {matches:[{id:'core-example-b',score:.95,metadata:{catalogue_id:'first-try',view:'example',core:true}}]};
      return options.filter.view==='meaning'
        ? {matches:[{id:'meme-meaning-a',score:.9,metadata:{catalogue_id:'waiting-skeleton',view:'meaning'}},{id:'meme-meaning-b',score:.8,metadata:{catalogue_id:'this-is-fine',view:'meaning'}}]}
        : {matches:[{id:'meme-example-b',score:.95,metadata:{catalogue_id:'this-is-fine',view:'example'}},{id:'meme-example-c',score:.85,metadata:{catalogue_id:'first-try',view:'example'}}]};
    }}
  };
  const records=await retrieveCandidates(retrievalEnv,'A situation worth testing.',3);
  assert.deepEqual(filters,[{view:'meaning'},{view:'example'},{core:true,view:'meaning'},{core:true,view:'example'}]);
  assert.deepEqual(records.map(record=>record.id),['this-is-fine','first-try','waiting-skeleton']);
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

test('selection validation accepts one primary result and four distinct backups',()=>{
  const candidates=[
    ['waiting-skeleton','Waiting Skeleton makes the prolonged delay the central frustration in this situation.'],
    ['this-is-fine','This Is Fine captures calm denial while visible trouble keeps getting worse.'],
    ['first-try','First Try frames a difficult success as if it happened without effort.'],
    ['surprised-pikachu','Surprised Pikachu fits because the predictable consequence is treated like a genuine shock.'],
    ['boardroom-suggestion','Boardroom Meeting Suggestion fits because a sensible idea receives a wildly disproportionate rejection.']
  ].map(([id,reason],index)=>({id,reason,score:90-index}));
  assert.equal(validateSelection({decision:'meme',confidence:'high',none_reason:'',candidates}).candidates.length,5);
  assert.throws(()=>validateSelection({decision:'meme',confidence:'high',none_reason:'',candidates:[...candidates,{...candidates[0],id:'drake-hotline-bling'}]}),/too many candidates/);
});

test('ordinal classifier levels become public fit labels and all ranked backups remain visible',()=>{
  const ranked=[
    {id:'waiting-skeleton',classifier_score:.78},
    {id:'this-is-fine',classifier_score:.21},
    {id:'first-try',classifier_score:.01}
  ];
  assert.equal(MINIMUM_VISIBLE_FIT,0);
  assert.equal(MINIMUM_VISIBLE_PERSPECTIVE_FIT,0);
  assert.deepEqual(selectionFromRanking(ranked),{
    decision:'meme',
    confidence:'high',
    none_reason:'',
    candidates:[{id:'waiting-skeleton',score:78,fit_label:'strong'},{id:'this-is-fine',score:21,fit_label:'weak'},{id:'first-try',score:1,fit_label:'weak'}]
  });
  const low=selectionFromRanking([{id:'waiting-skeleton',classifier_score:.08},{id:'this-is-fine',classifier_score:.04}]);
  assert.deepEqual(low.candidates,[{id:'waiting-skeleton',score:8,fit_label:'weak'},{id:'this-is-fine',score:4,fit_label:'weak'}]);
  assert.equal(low.confidence,'low');
  const wrong=selectionFromRanking([{id:'waiting-skeleton',classifier_score:.42,fit_label:'wrong'}]);
  assert.deepEqual(wrong.candidates,[{id:'waiting-skeleton',score:42,fit_label:'weak'}]);
  assert.equal(wrong.confidence,'low');
  const perspectives=selectionFromRanking([
    {id:'waiting-skeleton',classifier_score:.6,perspective:'self'},
    {id:'this-is-fine',classifier_score:.24,perspective:'other'},
    {id:'first-try',classifier_score:.25,perspective:'situation'}
  ]);
  assert.deepEqual(perspectives.candidates,[{id:'waiting-skeleton',score:60,fit_label:'plausible'},{id:'this-is-fine',score:24,fit_label:'weak'},{id:'first-try',score:25,fit_label:'weak'}]);
});

test('classifier gate only runs for high-precision serious cues',async()=>{
  assert.equal(needsSeriousHandling('Please help me write a condolence message.'),true);
  assert.equal(needsSeriousHandling('My build failed right before the demo.'),false);
  assert.equal(needsSeriousHandling('A friend was assaulted and asked me to listen while they consider support.'),true);
  assert.equal(needsSeriousHandling('A colleague wants confidential reporting options for repeated harassment.'),true);
  assert.equal(needsSeriousHandling('I want to apologize without making excuses.'),true);
  assert.equal(needsSeriousHandling('The booking display died and delayed both presentations.'),false);
  assert.equal(needsSeriousHandling('When I need to introduce myself by saying my name is Jeff.'),false);
  assert.equal(needsSeriousHandling('I need help after a loss.'),true);
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
    const body=JSON.parse(options.body);
    return Response.json({results:[oneHot(body.labels,1),oneHot(body.labels,4),oneHot(body.labels,3)]});
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

test('multi-person comments activate perspective ranking without changing single-view comments',()=>{
  assert.equal(hasMultiplePerspectives('My sibling ate the leftovers with my name on them, then asked why I looked upset.'),true);
  assert.equal(hasMultiplePerspectives('My coworker scheduled another meeting after telling me the first could have been an email.'),true);
  assert.equal(hasMultiplePerspectives('They replied “k” to the six-paragraph message I spent an hour writing.'),true);
  assert.equal(hasMultiplePerspectives('I warned them about the deadline, so I was not surprised when they missed it.'),true);
  assert.equal(hasMultiplePerspectives('I saw them take my lunch and pretend nothing happened.'),true);
  assert.equal(hasMultiplePerspectives('My manager said “I am fine” while I watched every dashboard flash red.'),true);
  assert.equal(hasMultiplePerspectives('I spent an hour looking for my phone while using its flashlight.'),false);
  assert.equal(hasMultiplePerspectives('The tests finally passed after another identical run.'),false);
  assert.equal(hasMultiplePerspectives('The tests finally passed after I changed nothing and ran them again.'),false);
  assert.equal(hasMultiplePerspectives('I restarted the containers and checked them again.'),false);
  assert.equal(hasMultiplePerspectives('I sent them to staging and watched them fail again.'),false);
  assert.equal(hasMultiplePerspectives('She said “I am fine” while every dashboard flashed red.'),false);
});

test('perspective instructions preserve actors, quoted speech, and explicit negation',()=>{
  const self=PERSPECTIVES.find(record=>record.key==='self').instructions;
  const other=PERSPECTIVES.find(record=>record.key==='other').instructions;
  const situation=PERSPECTIVES.find(record=>record.key==='situation').instructions;
  assert.match(self,/first-person narrator/i);
  assert.match(self,/I ate someone else's labelled leftovers/i);
  assert.match(self,/quoted/i);
  assert.match(other,/performed each action/i);
  assert.match(other,/do not reverse/i);
  assert.match(situation,/negation/i);
  assert.match(situation,/not happening/i);
});

test('perspective routing eval covers participant, inanimate, quote, and negation cases',()=>{
  const cases=readFileSync(new URL('../eval/perspective_v1.jsonl',import.meta.url),'utf8').trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(cases.length,14);
  assert.equal(new Set(cases.map(record=>record.id)).size,cases.length);
  for(const record of cases) {
    assert(['general','perspective'].includes(record.expected_mode));
    assert.deepEqual(record.expected_perspectives,record.expected_mode==='perspective'?['self','other','situation']:[]);
    assert.equal(record.owner_validated,false);
    assert.equal(hasMultiplePerspectives(record.comment),record.expected_mode==='perspective');
  }
});

test('perspective ranking returns one distinct candidate for each explicit lens',async()=>{
  const candidates=[
    {id:'my-reaction',name:'How Could You',message:'Betrayed disbelief.',relational_pattern:'Someone reacts to a boundary being ignored.'},
    {id:'their-side',name:'Kirby Eating',message:'Shamelessly enjoying the food.',relational_pattern:'Someone takes and enjoys food without concern.'},
    {id:'the-situation',name:'You Took Everything',message:'Something personally valued was taken.',relational_pattern:'One person takes what belonged to another.'}
  ];
  const calls=[];
  const scoreSets={
    self:[.92,.04,.04],
    other:[.05,.9,.05],
    situation:[.06,.08,.86]
  };
  const fetchImpl=async(_url,options)=>{
    const body=JSON.parse(options.body);
    if(body.labels[0]===FIT_LABELS[0].label) return Response.json(ordinalBatch(body));
    const perspective=PERSPECTIVES.find(record=>record.instructions===body.instructions);
    calls.push(perspective.key);
    return Response.json({results:[{label:body.labels[scoreSets[perspective.key].indexOf(Math.max(...scoreSets[perspective.key]))],scores:Object.fromEntries(body.labels.map((label,index)=>[label,scoreSets[perspective.key][index]]))}]});
  };
  const ranked=await rankCandidatesByPerspective('My sibling ate my labelled leftovers, then asked why I was upset.',candidates,{fetchImpl});
  assert.deepEqual(calls.sort(),['other','self','situation']);
  assert.deepEqual(ranked.map(candidate=>candidate.id),['my-reaction','their-side','the-situation']);
  assert.deepEqual(new Set(ranked.map(candidate=>candidate.perspective)),new Set(['self','other','situation']));
  assert.deepEqual(ranked.map(candidate=>candidate.perspective_label),['My reaction','Their side','The situation']);
});

test('perspective ranking de-duplicates a shared winner and public output keeps each lens',async()=>{
  const candidates=[
    {id:'waiting-skeleton',name:'Waiting Skeleton',message:'Waiting a long time.',relational_pattern:'Someone waits.'},
    {id:'this-is-fine',name:'This Is Fine',message:'Calm during chaos.',relational_pattern:'Someone minimizes trouble.'},
    {id:'first-try',name:'First Try',message:'Success hides effort.',relational_pattern:'Someone hides failed attempts.'}
  ];
  let call=0;
  const scoreSets=[[.9,.08,.02],[.88,.1,.02],[.86,.03,.11]];
  const fetchImpl=async(_url,options)=>{
    const body=JSON.parse(options.body);
    if(body.labels[0]===FIT_LABELS[0].label) return Response.json(ordinalBatch(body));
    const scores=scoreSets[call++];
    return Response.json({results:[{label:body.labels[0],scores:Object.fromEntries(body.labels.map((label,index)=>[label,scores[index]]))}]});
  };
  const ranked=await rankCandidatesByPerspective('My coworker told me everything was fine while our launch burned.',candidates,{fetchImpl});
  assert.equal(new Set(ranked.map(candidate=>candidate.id)).size,3);
  const perspectives=new Map(ranked.map(record=>[record.id,{perspective:record.perspective,perspective_label:record.perspective_label}]));
  const mappedSelection={...selection,candidates:ranked.map((record,index)=>({id:record.id,reason:`${record.name} fits because this complete explanation maps the chosen viewpoint to the comment.`,score:90-index}))};
  const presented=presentSelection(mappedSelection,{perspectives});
  assert.deepEqual(new Set(presented.candidates.map(candidate=>candidate.perspective)),new Set(['self','other','situation']));
});

test('perspective ranking assigns a contested meme to the globally strongest lens',async()=>{
  const candidates=[
    {id:'shared',name:'Shared',message:'A shared reaction.',relational_pattern:'Could fit several viewpoints.'},
    {id:'self-alternative',name:'Self Alternative',message:'The narrator reacts.',relational_pattern:'The narrator responds.'},
    {id:'other-alternative',name:'Other Alternative',message:'The other person reacts.',relational_pattern:'The other participant responds.'}
  ];
  let call=0;
  const scoreSets=[[.51,.23,.1],[.45,.1,.14],[.68,.07,.09]];
  const fetchImpl=async(_url,options)=>{
    const body=JSON.parse(options.body);
    const {labels}=body;
    if(labels[0]===FIT_LABELS[0].label) return Response.json(ordinalBatch(body));
    const scores=scoreSets[call++];
    return Response.json({results:[{label:labels[0],scores:Object.fromEntries(labels.map((label,index)=>[label,scores[index]]))}]});
  };
  const ranked=await rankCandidatesByPerspective('I ate my sibling\'s leftovers and they looked upset.',candidates,{fetchImpl});
  assert.equal(ranked.find(candidate=>candidate.id==='shared').perspective,'situation');
  assert.equal(ranked.find(candidate=>candidate.id==='self-alternative').perspective,'self');
  assert.equal(ranked.find(candidate=>candidate.id==='other-alternative').perspective,'other');
  assert.deepEqual(selectionFromRanking(ranked).candidates,[
    {id:'self-alternative',score:100,fit_label:'exact'},
    {id:'other-alternative',score:75,fit_label:'strong'},
    {id:'shared',score:50,fit_label:'plausible'}
  ]);
});

test('perspective ranking can return three viewpoint winners plus two distinct backups',async()=>{
  const candidates=[
    {id:'self',name:'Self',message:'Self reaction.',relational_pattern:'Narrator reacts.'},
    {id:'other',name:'Other',message:'Other reaction.',relational_pattern:'Other person reacts.'},
    {id:'situation',name:'Situation',message:'Situation reaction.',relational_pattern:'The dynamic itself.'},
    {id:'backup-one',name:'Backup One',message:'Another useful reaction.',relational_pattern:'A secondary angle.'},
    {id:'backup-two',name:'Backup Two',message:'One more useful reaction.',relational_pattern:'Another secondary angle.'}
  ];
  const scoreSets={self:[.9,.02,.01,.4,.3],other:[.03,.88,.02,.38,.35],situation:[.02,.03,.86,.37,.36]};
  const fetchImpl=async(_url,options)=>{
    const body=JSON.parse(options.body);
    if(body.labels[0]===FIT_LABELS[0].label) return Response.json(ordinalBatch(body));
    const perspective=PERSPECTIVES.find(record=>record.instructions===body.instructions);
    const scores=scoreSets[perspective.key];
    return Response.json({results:[{label:body.labels[scores.indexOf(Math.max(...scores))],scores:Object.fromEntries(body.labels.map((label,index)=>[label,scores[index]]))}]});
  };
  const ranked=await rankCandidatesByPerspective('My coworker did something and I reacted.',candidates,{fetchImpl,limit:5});
  assert.equal(ranked.length,5);
  assert.equal(new Set(ranked.map(candidate=>candidate.id)).size,5);
  assert.deepEqual(new Set(ranked.map(candidate=>candidate.perspective)),new Set(['self','other','situation']));
});

test('direct Jev batches three perspective choices and the final fit scores into two requests',async()=>{
  const candidates=[
    {id:'self',name:'Self',message:'Self reaction.',relational_pattern:'Narrator reacts.'},
    {id:'other',name:'Other',message:'Other reaction.',relational_pattern:'Other person reacts.'},
    {id:'situation',name:'Situation',message:'Situation reaction.',relational_pattern:'The dynamic itself.'},
    {id:'backup-one',name:'Backup One',message:'Another useful reaction.',relational_pattern:'A secondary angle.'},
    {id:'backup-two',name:'Backup Two',message:'One more useful reaction.',relational_pattern:'Another secondary angle.'}
  ];
  const calls=[];
  const fetchImpl=async(url,options)=>{
    const body=JSON.parse(options.body);
    calls.push({url,authorization:new Headers(options.headers).get('authorization'),body});
    if(body.questions.self) {
      const choice=(winner,scores)=>({type:'choice',choice:winner,confidence:.9,probabilities:Object.fromEntries(candidates.map((_,index)=>[`candidate_${index}`,scores[index]]))});
      return Response.json({answers:{
        self:choice('candidate_0',[.9,.02,.01,.04,.03]),
        other:choice('candidate_1',[.02,.88,.03,.04,.03]),
        situation:choice('candidate_2',[.02,.03,.86,.05,.04])
      }});
    }
    return Response.json({answers:Object.fromEntries(Object.keys(body.questions).map((id,index)=>[id,directScoreAnswer(4-index*.5)]))});
  };
  const ranked=await rankCandidatesByPerspective('My coworker did something and I reacted.',candidates,{fetchImpl,apiKey:'direct-test-key',limit:5});
  assert.equal(calls.length,2);
  assert.deepEqual(Object.keys(calls[0].body.questions),['self','other','situation']);
  assert.equal(Object.keys(calls[1].body.questions).length,5);
  assert(calls.every(call=>call.url==='https://api.typesafe.ai/v1/systemone'));
  assert(calls.every(call=>call.authorization==='Bearer direct-test-key'));
  assert.equal(ranked.length,5);
  assert.equal(new Set(ranked.map(candidate=>candidate.id)).size,5);
  assert.deepEqual(new Set(ranked.map(candidate=>candidate.perspective)),new Set(['self','other','situation']));
});

test('classifier ranking rejects missing or flat scores instead of silently pinning retrieval order',async()=>{
  const candidates=[
    {id:'one',name:'One',message:'One message.',relational_pattern:'One pattern.'},
    {id:'two',name:'Two',message:'Two message.',relational_pattern:'Two pattern.'},
    {id:'three',name:'Three',message:'Three message.',relational_pattern:'Three pattern.'}
  ];
  const incomplete=async(_url,options)=>{
    const {inputs,labels}=JSON.parse(options.body);
    return Response.json({results:inputs.map(()=>({label:labels[0],scores:{[labels[0]]:1}}))});
  };
  const flat=async(_url,options)=>{
    const {inputs,labels}=JSON.parse(options.body);
    return Response.json({results:inputs.map(()=>oneHot(labels,2))});
  };
  await assert.rejects(rankCandidates('A comment.',candidates,{fetchImpl:incomplete}),/incomplete ordinal scores/);
  await assert.rejects(rankCandidates('A comment.',candidates,{fetchImpl:flat}),/flat ordinal scores/);
});

test('a failed perspective lens falls back to general ranking without invented perspective labels',async()=>{
  const known=[
    {id:'this-is-fine',score:.9,metadata:{catalogue_id:'this-is-fine'}},
    {id:'first-try',score:.8,metadata:{catalogue_id:'first-try'}},
    {id:'waiting-skeleton',score:.7,metadata:{catalogue_id:'waiting-skeleton'}}
  ];
  const classifierInstructions=[];
  const fallbackEnv={
    ...env,
    AI:{run:async(model,input)=>{
      if(model===EMBEDDING_MODEL) return {data:[[1,0,0]]};
      return {response:{decision:'meme',confidence:'medium',none_reason:'',candidates:[
        {id:'this-is-fine',reason:'This Is Fine fits because calm denial clashes with the obvious chaos described here.',score:88},
        {id:'first-try',reason:'First Try fits because the polished claim conceals a much messier reality underneath.',score:77},
        {id:'waiting-skeleton',reason:'Waiting Skeleton fits because the unresolved situation leaves everyone stuck awaiting a sensible response.',score:66}
      ]}};
    }},
    MEME_INDEX:{query:async()=>({matches:known})},
    CLASSIFIER_FETCH:async(_url,options)=>{
      const body=JSON.parse(options.body);
      classifierInstructions.push(body.instructions);
      if(body.instructions===PERSPECTIVES.find(record=>record.key==='other').instructions) throw new Error('Perspective classifier unavailable.');
      if(body.labels[0]===FIT_LABELS[0].label) return Response.json(ordinalBatch(body));
      const scores=Object.fromEntries(body.labels.map((label,index)=>[label,[.8,.15,.05][index]??0]));
      return Response.json({results:[{label:body.labels[0],scores}]});
    }
  };
  const response=await worker.fetch(new Request('https://example.test/api/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({comment:'My manager said everything was fine while I watched the launch fail.'})}),fallbackEnv);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(classifierInstructions.length,4);
  assert.equal(classifierInstructions.some(instructions=>instructions.startsWith('Judge each comment-and-candidate pair independently')),true);
  assert.deepEqual(body.candidates.map(candidate=>candidate.perspective),['best_match','best_match','best_match']);
});

test('classifier throttling returns a low-confidence retrieval fallback without invoking text generation',async()=>{
  const aiModels=[];
  const noFallbackEnv={
    ...env,
    AI:{run:async model=>{
      aiModels.push(model);
      if(model===EMBEDDING_MODEL) return {data:[[1,0,0]]};
      throw new Error(`Unexpected text-generation fallback: ${model}`);
    }},
    CLASSIFIER_FETCH:async()=>new Response('Rate limited.',{status:429})
  };
  const response=await worker.fetch(new Request('https://example.test/api/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({comment:'The tests failed again after I changed absolutely nothing.'})}),noFallbackEnv);
  assert.equal(response.status,200);
  assert.deepEqual(aiModels,[EMBEDDING_MODEL]);
  const body=await response.json();
  assert.equal(body.confidence,'low');
  assert.deepEqual(body.candidates.map(candidate=>candidate.fit_label),['weak']);
  assert.equal(stored.findLast(entry=>entry.sql.includes('INSERT INTO recommendations'))?.values[4],'vector-retrieval-fallback');
});

test('classifier throttling abstains when deterministic signals say the input may be serious',async()=>{
  const throttledEnv={...env,CLASSIFIER_FETCH:async()=>new Response('Rate limited.',{status:429})};
  const response=await worker.fetch(new Request('https://example.test/api/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({comment:'My friend lost a family member and asked me to help write a sincere condolence message.'})}),throttledEnv);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.decision,'none');
  assert.equal(body.confidence,'low');
  assert.deepEqual(body.candidates,[]);
  assert.match(body.none_reason,/safety check is temporarily unavailable/i);
  assert.equal(stored.findLast(entry=>entry.sql.includes('INSERT INTO recommendations'))?.values[4],'safety-gate-throttled');
});

test('static responses receive security and no-index headers',async()=>{
  const response=await worker.fetch(new Request('https://example.test/'),env);
  assert.equal(response.headers.get('x-frame-options'),'DENY');
  assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
});

test('health reports the full live catalogue',async()=>{
  const response=await worker.fetch(new Request('https://example.test/api/health'),env);
  assert.deepEqual(await response.json(),{status:'ok',catalogue:3000});
});
