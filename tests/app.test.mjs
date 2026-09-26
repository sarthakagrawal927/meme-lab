import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { catalogue, poolFor, validateRequest, buildPrompt, lexicalSelect, validateSelection, modelSelect } from '../src/selector.mjs';
import { configFromEnv } from '../src/config.mjs';
import { createApp } from '../server.mjs';
import { blindArm, experimentSeed, orderedRepresentations, summarizeExperiments } from '../src/experiment.mjs';

const input=()=>validateRequest({context:'They said the wait would be short. Still waiting weeks later.'});
const allowed=new Set(poolFor().map(r=>r.id));
const answer=()=>({decision:'meme',situation:'A delay is far longer than promised.',intent:'Express impatience.',target:'The delay',candidates:[{id:'waiting-skeleton',reason:'An exaggerated wait.'}],none_reason:''});
async function listen(server){await new Promise(r=>server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${server.address().port}`;}
async function close(server){server.closeAllConnections();await new Promise(r=>server.close(r));}

test('canonical catalogue has unique 60 records and a 30/30 split',()=>{assert.equal(catalogue.length,60);assert.equal(new Set(catalogue.map(r=>r.id)).size,60);assert.equal(poolFor().length,30);assert.equal(poolFor('all').length,60);assert(poolFor().every(r=>r.delivery.suggested_mode!=='caption_template'));});
test('request defaults are explicit',()=>{assert.equal(input().method,'baseline');assert.equal(input().representation,'enriched');assert.equal(input().scope,'reactions');});
test('empty and oversized input rejected',()=>{assert.throws(()=>validateRequest({context:' '}));assert.throws(()=>validateRequest({context:'a'.repeat(6001)}));});
test('unknown scope, method, style and representation rejected',()=>{for(const[k,v]of Object.entries({scope:'invalid',method:'random',style:'rage',representation:'mystery'}))assert.throws(()=>validateRequest({...input(),[k]:v}));});
test('unknown recent references rejected',()=>assert.throws(()=>validateRequest({...input(),recent_ids:['invented']})));
test('enriched prompt includes all 30 allowed IDs and no caption templates',()=>{const p=buildPrompt(input());const rows=JSON.parse(p.messages[1].content.slice(p.messages[1].content.indexOf('{'))).catalogue;assert.equal(rows.length,30);assert(rows.every(r=>allowed.has(r.id)));assert(rows.every(r=>r.relational_pattern&&r.avoid));});
test('names-only ablation excludes meanings and examples',()=>{const p=buildPrompt({...input(),representation:'minimal'});const rows=JSON.parse(p.messages[1].content.slice(p.messages[1].content.indexOf('{'))).catalogue;assert(rows.every(r=>!('message'in r)&&!('example'in r)));});
test('lexical baseline is deterministic, returns <=3 valid IDs',()=>{const a=lexicalSelect(input());assert.deepEqual(a,lexicalSelect(input()));assert(a.candidates.length<=3);assert(a.candidates.every(c=>allowed.has(c.id)));assert.match(a.situation,/Keyword/);});
test('lexical zero-overlap abstains without inventing a reference',()=>{assert.equal(lexicalSelect({...input(),context:'zxqvj zzvqzx'}).decision,'none');});
test('valid model response is accepted',()=>assert.deepEqual(validateSelection(JSON.stringify(answer()),allowed),answer()));
test('valid NONE accepted',()=>{const a={...answer(),decision:'none',candidates:[],none_reason:'A sincere answer is called for.'};assert.equal(validateSelection(a,allowed).decision,'none');});
test('unknown and duplicate candidates rejected',()=>{assert.throws(()=>validateSelection({...answer(),candidates:[{id:'invented',reason:'x'}]},allowed));assert.throws(()=>validateSelection({...answer(),candidates:[answer().candidates[0],answer().candidates[0]]},allowed));});
test('invalid NONE and empty meme selection rejected',()=>{assert.throws(()=>validateSelection({...answer(),decision:'none'},allowed));assert.throws(()=>validateSelection({...answer(),candidates:[]},allowed));});
test('model extra fields and malformed JSON rejected',()=>{assert.throws(()=>validateSelection({...answer(),url:'https://example.com'},allowed));assert.throws(()=>validateSelection('{not json',allowed));});
test('code fence wrapper tolerated but content still validated',()=>assert.equal(validateSelection('```json\n'+JSON.stringify(answer())+'\n```',allowed).decision,'meme'));
test('remote model endpoint requires explicit opt-in and HTTPS',()=>{assert.throws(()=>configFromEnv({MEME_API_BASE_URL:'https://example.com/v1'}));assert.throws(()=>configFromEnv({MEME_API_BASE_URL:'http://example.com/v1',MEME_ALLOW_REMOTE:'true'}));assert(configFromEnv({MEME_API_BASE_URL:'https://example.com/v1',MEME_ALLOW_REMOTE:'true'}).remote);});
test('model endpoint credentials and arbitrary URL schemes rejected',()=>{assert.throws(()=>configFromEnv({MEME_API_BASE_URL:'file:///etc/passwd'}));assert.throws(()=>configFromEnv({MEME_API_BASE_URL:'http://user:password@localhost:11434'}));});
test('experiment ordering is seeded and blind arms conceal condition details',()=>{assert.deepEqual(orderedRepresentations(2),['minimal','enriched']);assert.deepEqual(orderedRepresentations(3),['enriched','minimal']);assert.equal(experimentSeed(12),12);assert.throws(()=>experimentSeed(-1));const arm=blindArm({id:'run',status:'ok',duration_ms:20,selection:answer()},'A',catalogue);assert.equal(arm.candidates[0].name,'Waiting Skeleton');assert(!('representation'in arm));assert(!('reason'in arm.candidates[0]));});

test('native Ollama adapter sends schema and accepts mocked response',async()=>{let payload,path;const mock=createServer(async(req,res)=>{path=req.url;let b='';for await(const c of req)b+=c;payload=JSON.parse(b);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({model:'mock-model',message:{content:JSON.stringify(answer())},prompt_eval_count:100,eval_count:20}));});const url=await listen(mock);try{const c=configFromEnv({MEME_MODEL:'mock-model',MEME_API_BASE_URL:url});const out=await modelSelect({...input(),method:'model'},c,{seed:42});assert.equal(path,'/api/chat');assert.equal(payload.stream,false);assert.equal(payload.options.seed,42);assert.equal(payload.format.properties.candidates.items.properties.id.enum.length,30);assert.equal(out.selection.candidates[0].id,'waiting-skeleton');assert.equal(out.usage.input_tokens,100);}finally{await close(mock);}});
test('compatible adapter uses chat completions and validates mocked content',async()=>{let path;const mock=createServer((req,res)=>{path=req.url;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({model:'mock-compatible',choices:[{message:{content:JSON.stringify(answer())}}],usage:{prompt_tokens:123}}));});const url=await listen(mock);try{const c=configFromEnv({MEME_MODEL:'mock-compatible',MEME_API_STYLE:'chat_completions',MEME_API_BASE_URL:url+'/v1'});const out=await modelSelect({...input(),method:'model'},c);assert.equal(path,'/v1/chat/completions');assert.equal(out.selection.decision,'meme');}finally{await close(mock);}});
test('one malformed semantic response gets one validated model repair',async()=>{let calls=0;const invalid={...answer(),decision:'none',none_reason:'No meme.',candidates:answer().candidates};const mock=createServer((req,res)=>{calls+=1;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({model:'repair-model',message:{content:JSON.stringify(calls===1?invalid:answer())}}));});const url=await listen(mock);try{const c=configFromEnv({MEME_MODEL:'repair-model',MEME_API_BASE_URL:url});const out=await modelSelect({...input(),method:'model'},c,{seed:4});assert.equal(calls,2);assert.equal(out.repair_attempted,true);assert.equal(out.selection.decision,'meme');}finally{await close(mock);}});
test('upstream failure does not silently become a lexical result',async()=>{const mock=createServer((req,res)=>{res.writeHead(503);res.end();});const url=await listen(mock);try{const c=configFromEnv({MEME_MODEL:'mock',MEME_API_BASE_URL:url});await assert.rejects(()=>modelSelect(input(),c),/503/);}finally{await close(mock);}});
test('upstream timeout surfaces clearly',async()=>{const mock=createServer(()=>{});const url=await listen(mock);try{const c=configFromEnv({MEME_MODEL:'mock',MEME_API_BASE_URL:url,MEME_TIMEOUT_MS:'100'});await assert.rejects(()=>modelSelect(input(),c),/timed out/);}finally{await close(mock);}});

test('paired experiment stays blind until both successful arms are reviewed',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'meme-lab-experiment-'));
  const mock=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({model:'mock-model',message:{content:JSON.stringify(answer())},prompt_eval_count:100,eval_count:20}));});
  const modelUrl=await listen(mock);
  const app=createApp(configFromEnv({MEME_MODEL:'mock-model',MEME_API_BASE_URL:modelUrl}),{storeDir:dir});
  const url=await listen(app);
  const post=(path,body)=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json','X-Meme-Lab':'1'},body:JSON.stringify(body)});
  try{
    const response=await post('/api/experiment',{case_id:'holdout-001',context:'The promised short wait has lasted three weeks.',scope:'reactions',style:'dry',intent_label:'humour',seed:8});
    assert.equal(response.status,200);
    const experiment=await response.json();
    assert.equal(experiment.status,'complete');
    assert.deepEqual(experiment.arms.map(arm=>arm.blind_id),['A','B']);
    assert(experiment.arms.every(arm=>!('representation'in arm)&&!('reason'in arm.candidates[0])));
    const pendingQueue=await(await fetch(url+'/api/experiment-queue')).json();
    assert.equal(pendingQueue[0].case_id,'holdout-001');
    assert.equal(pendingQueue[0].context,'The promised short wait has lasted three weeks.');
    assert.equal(pendingQueue[0].review_complete,false);
    assert.deepEqual(pendingQueue[0].reviewed_blind_ids,[]);
    assert(!JSON.stringify(pendingQueue).includes('representation'));
    assert(!JSON.stringify(pendingQueue).includes('intent_label'));
    assert(!JSON.stringify(pendingQueue).includes('An exaggerated wait.'));
    const candidateQueue=await(await fetch(url+'/api/candidate-review-queue')).json();
    assert.equal(candidateQueue.total,2);
    assert.equal(candidateQueue.reviewed,0);
    assert(candidateQueue.items.every(item=>item.candidate_id==='waiting-skeleton'));
    assert(!JSON.stringify(candidateQueue).includes('representation'));
    assert(!JSON.stringify(candidateQueue).includes('intent_label'));
    assert(!JSON.stringify(candidateQueue).includes('An exaggerated wait.'));
    const candidateReview=await post('/api/candidate-review',{experiment_id:experiment.experiment_id,blind_id:'A',candidate_id:'waiting-skeleton',verdict:'relevant',note:'Fits the delayed wait.'});
    assert.equal(candidateReview.status,200);
    assert.equal((await post('/api/candidate-review',{experiment_id:experiment.experiment_id,blind_id:'A',candidate_id:'invented',verdict:'relevant'})).status,400);
    const partlyReviewedCandidates=await(await fetch(url+'/api/candidate-review-queue')).json();
    assert.equal(partlyReviewedCandidates.reviewed,1);
    assert.equal(partlyReviewedCandidates.remaining,1);
    assert.equal((await fetch(url+`/api/experiments/${experiment.experiment_id}/reveal`)).status,409);
    assert.equal((await post('/api/experiment-review',{experiment_id:experiment.experiment_id,blind_id:'Z',verdict:'send',candidate_id:'waiting-skeleton'})).status,400);
    for(const arm of experiment.arms){const review=await post('/api/experiment-review',{experiment_id:experiment.experiment_id,blind_id:arm.blind_id,verdict:'send',candidate_id:'waiting-skeleton'});assert.equal(review.status,200);}
    const reveal=await(await fetch(url+`/api/experiments/${experiment.experiment_id}/reveal`)).json();
    assert.deepEqual(reveal.arms.map(arm=>arm.representation),['minimal','enriched']);
    assert(reveal.arms.every(arm=>arm.selection.candidates[0].reason));
    const report=await(await fetch(url+'/api/experiment-report')).json();
    assert.equal(report.experiments,1);assert.equal(report.fully_reviewed,1);assert.equal(report.conditions.minimal.top_one_sendable,1);assert.equal(report.conditions.enriched.top_three_sendable,1);
    const reviewedQueue=await(await fetch(url+'/api/experiment-queue')).json();
    assert.equal(reviewedQueue[0].review_complete,true);
    assert.deepEqual(reviewedQueue[0].reviewed_blind_ids,['A','B']);
    assert.deepEqual(summarizeExperiments(await(await fetch(url+'/api/events')).json()),report);
  }finally{await close(app);await close(mock);await rm(dir,{recursive:true,force:true});}
});

test('local HTTP routes, feedback persistence, export, and access protections',async t=>{const dir=await mkdtemp(join(tmpdir(),'meme-lab-test-'));let app=createApp(configFromEnv({}),{storeDir:dir});let url=await listen(app);const post=(path,body,headers={})=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json','X-Meme-Lab':'1',...headers},body:JSON.stringify(body)});let runId;
try{
await t.test('health and catalogue accessible without any model',async()=>{const h=await(await fetch(url+'/api/health')).json();assert.equal(h.counts.catalogue,60);assert.equal(h.model.configured,false);assert.equal((await(await fetch(url+'/api/catalogue')).json()).length,60);assert(!JSON.stringify(h).includes('apiKey'));});
await t.test('private files, unknown routes and cross-origin writes blocked',async()=>{assert.equal((await fetch(url+'/.env')).status,404);assert.equal((await fetch(url+'/runs/test.json')).status,404);assert.equal((await fetch(url+'/private/holdout_v1.jsonl')).status,404);assert.equal((await fetch(url+'/results/holdout-v1/manifest.json')).status,404);assert.equal((await post('/api/select',input(),{Origin:'https://evil.example'})).status,403);const r=await fetch(url+'/api/select',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input())});assert.equal(r.status,403);});
await t.test('baseline run saved, feedback validated, export includes events',async()=>{const r=await post('/api/select',input());assert.equal(r.status,200);const run=await r.json();runId=run.id;assert.equal(run.status,'ok');assert.equal(run.request.method,'baseline');const f=await post('/api/feedback',{run_id:run.id,verdict:'send',candidate_id:run.selection.candidates[0].id,note:'Synthetic integration-test feedback.'});assert.equal(f.status,200);assert.equal((await post('/api/feedback',{run_id:run.id,verdict:'send',candidate_id:'invented'})).status,400);const exported=await(await fetch(url+'/api/export')).text();assert.equal(exported.trim().split('\n').length,2);});
await t.test('missing model yields error run, never a baseline result',async()=>{const r=await post('/api/select',{...input(),method:'model'});assert.equal(r.status,502);assert.match((await r.json()).error,/MEME_MODEL/);});
await t.test('prompt export and HTML surfaces accessible',async()=>{const p=await(await post('/api/prompt',input())).json();assert.equal(p.schema.properties.candidates.items.properties.id.enum.length,30);assert.equal((await fetch(url+'/original/meme_references_v1/preview.html')).status,200);assert.equal((await fetch(url+'/review')).status,200);assert.equal((await fetch(url+'/review.js')).status,200);});
await t.test('dialogue review persists all source-quality labels and exports honest progress',async()=>{const queue=await(await fetch(url+'/api/dialogue-review-queue')).json();assert.equal(queue.total,200);assert.equal(queue.reviewed,0);assert.equal(queue.items.length,200);assert(!JSON.stringify(queue).includes('structural_score'));assert(!JSON.stringify(queue).includes('qwen2.5'));const checkpoint=await(await fetch(url+'/api/dialogue-review-report')).json();assert.equal(checkpoint.status,'insufficient_owner_labels');assert.equal(checkpoint.labels_until_minimum,50);assert.equal(checkpoint.metrics,null);assert(!JSON.stringify(checkpoint).includes('model_score'));const item=queue.items[0];const savedResponse=await post('/api/dialogue-review',{case_id:item.case_id,sendability:'sendable',standalone:'strong',strength:'memorable',note:'Natural and distinctive.'});assert.equal(savedResponse.status,200);const saved=await savedResponse.json();assert.equal(saved.calibration.reviewed,1);assert.equal(saved.calibration.metrics,null);assert.equal((await post('/api/dialogue-review',{case_id:item.case_id,sendability:'sendable'})).status,400);const updated=await(await fetch(url+'/api/dialogue-review-queue')).json();assert.equal(updated.reviewed,1);assert.equal(updated.remaining,199);assert.equal(updated.human_validated,false);assert.equal(updated.items[0].review.strength,'memorable');const exported=await(await fetch(url+'/api/dialogue-review-export')).text();const rows=exported.trim().split('\n').map(JSON.parse);assert.equal(rows.length,201);assert.equal(rows[0].human_validated,false);assert.equal(rows[1].record_type,'dialogue_case');assert(JSON.stringify(rows).includes('structural_score'));});
await t.test('runs survive server restart',async()=>{await close(app);app=createApp(configFromEnv({}),{storeDir:dir});url=await listen(app);const events=await(await fetch(url+'/api/events')).json();assert(events.some(e=>e.id===runId));assert(events.some(e=>e.event_type==='feedback'));});
}finally{await close(app);await rm(dir,{recursive:true,force:true});}});
