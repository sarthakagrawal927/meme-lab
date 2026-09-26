import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { catalogue, sources, datasetHash, promptHash, validateRequest, buildPrompt, lexicalSelect, modelSelect } from './src/selector.mjs';
import { loadEnv, configFromEnv } from './src/config.mjs';
import { Store } from './src/store.mjs';
import { blindArm, experimentSeed, latestExperimentReviews, orderedRepresentations, summarizeExperiments } from './src/experiment.mjs';
import {dialogueCalibrationCheckpoint,dialogueReviewSummary,evaluateDialogueCalibration,parseDialogueEvalCases,validateDialogueReview} from './src/dialogue-eval.mjs';

export const ROOT=dirname(fileURLToPath(import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.md':'text/plain; charset=utf-8','.json':'application/json; charset=utf-8','.jsonl':'application/x-ndjson; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.sha256':'text/plain; charset=utf-8','.py':'text/plain; charset=utf-8'};

function commonHeaders(res) {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Cache-Control','no-store');
}
function json(res,status,data) { commonHeaders(res); res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(data)); }
async function bodyJSON(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('Expected application/json.'),{status:415});
  const chunks=[]; let size=0;
  for await (const chunk of req) { size+=chunk.length; if(size>32000) throw Object.assign(new Error('Request too large.'),{status:413}); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Invalid JSON body.'); }
}

async function dialogueCases() {
  return parseDialogueEvalCases(await readFile(resolve(ROOT,'eval/dialogue_quality_cases.jsonl'),'utf8'));
}

async function dialogueCalibration(events,cases) {
  const evaluationCases=cases??await dialogueCases();
  const screeningReviews=evaluationCases.map(row=>({id:row.dialogue_id,passes_quality_gate:row.structural_score>=75,quality_score:row.structural_score}));
  return dialogueCalibrationCheckpoint(evaluateDialogueCalibration(evaluationCases,screeningReviews,events));
}

export function createApp(config, {storeDir=resolve(ROOT,'runs')}={}) {
  const store=new Store(storeDir);
  let server;
  server=createServer(async (req,res)=>{
    try {
      const port=server.address()?.port;
      const hosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`]);
      if (!hosts.has(req.headers.host)) return json(res,403,{error:'Only the local app host is accepted.'});
      if (req.headers.origin && ![`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(req.headers.origin)) return json(res,403,{error:'Cross-origin requests are blocked.'});
      if (!['GET','POST'].includes(req.method)) return json(res,405,{error:'Method not allowed.'});
      const url=new URL(req.url,`http://${req.headers.host}`);
      const path=decodeURIComponent(url.pathname);
      if(req.method==='GET') {
        if(path==='/api/health') return json(res,200,{app:'Meme Lab',version:'0.2.0',counts:{catalogue:catalogue.length,reactions:30,templates:30,gif_leads:5,sources:sources.length},model:{configured:!!config.model,name:config.model,style:config.style,remote:config.remote,host:new URL(config.baseUrl).host},dataset_hash:datasetHash,prompt_hash:promptHash});
        if(path==='/api/catalogue') return json(res,200,catalogue);
        if(path==='/api/sources') return json(res,200,sources);
        if(path==='/api/cases') {
          const text=await readFile(resolve(ROOT,'eval/smoke_cases.jsonl'),'utf8');
          return json(res,200,text.trim().split('\n').filter(Boolean).map(JSON.parse));
        }
        if(path==='/api/events') return json(res,200,await store.all());
        if(path==='/api/experiment-report') return json(res,200,summarizeExperiments(await store.all()));
        if(path==='/api/experiment-queue') {
          const events=await store.all();
          const runs=new Map(events.filter(event=>event.event_type==='run').map(event=>[event.id,event]));
          const experiments=events.filter(event=>event.event_type==='experiment');
          return json(res,200,experiments.map(experiment=>{
            const reviews=latestExperimentReviews(events,experiment.experiment_id);
            const firstRun=runs.get(experiment.arms[0]?.run_id);
            const arms=experiment.arms.map(arm=>blindArm(runs.get(arm.run_id)??{id:arm.run_id,status:'error',error:'Run missing.',duration_ms:0},arm.blind_id,catalogue));
            const successful=arms.filter(arm=>arm.status==='ok');
            return {
              experiment_id:experiment.experiment_id,
              case_id:experiment.case_id??null,
              status:experiment.status,
              context:firstRun?.request?.context??'Context unavailable',
              style:firstRun?.request?.style??null,
              scope:firstRun?.request?.scope??null,
              arms,
              reviewed_blind_ids:[...reviews.keys()],
              review_complete:successful.length===arms.length&&successful.every(arm=>reviews.has(arm.blind_id))
            };
          }));
        }
        if(path==='/api/candidate-review-queue') {
          const events=await store.all();
          const runs=new Map(events.filter(event=>event.event_type==='run').map(event=>[event.id,event]));
          const latest=new Map();
          for(const event of events) if(event.event_type==='candidate_review') latest.set(`${event.experiment_id}:${event.blind_id}:${event.candidate_id}`,event);
          const items=[];
          for(const experiment of events.filter(event=>event.event_type==='experiment')) {
            for(const arm of experiment.arms) {
              const run=runs.get(arm.run_id);
              if(run?.status!=='ok') continue;
              for(const [index,candidate] of run.selection.candidates.entries()) {
                const key=`${experiment.experiment_id}:${arm.blind_id}:${candidate.id}`;
                const record=catalogue.find(item=>item.id===candidate.id);
                items.push({
                  item_id:key,
                  experiment_id:experiment.experiment_id,
                  case_id:experiment.case_id??null,
                  blind_id:arm.blind_id,
                  candidate_id:candidate.id,
                  candidate_name:record?.name??candidate.id,
                  rank:index+1,
                  context:run.request.context,
                  review:latest.get(key)?{verdict:latest.get(key).verdict,note:latest.get(key).note,timestamp:latest.get(key).timestamp}:null
                });
              }
            }
          }
          items.sort((a,b)=>createHash('sha256').update(a.item_id).digest('hex').localeCompare(createHash('sha256').update(b.item_id).digest('hex')));
          return json(res,200,{total:items.length,reviewed:items.filter(item=>item.review).length,remaining:items.filter(item=>!item.review).length,items});
        }
        if(path==='/api/dialogue-review-queue') {
          const cases=await dialogueCases();
          const events=await store.all();
          const latest=new Map();
          for(const event of events) if(event.event_type==='dialogue_review') latest.set(event.case_id,event);
          const items=cases.map(row=>({
            case_id:row.id,
            quote:row.quote,
            work_title:row.work_title,
            speaker:row.speaker,
            source_url:row.provenance.source_url,
            review:latest.has(row.id)?Object.fromEntries(['sendability','standalone','strength','note','timestamp'].map(key=>[key,latest.get(row.id)[key]])):null
          }));
          return json(res,200,{...dialogueReviewSummary(cases,events),items});
        }
        if(path==='/api/dialogue-review-report') {
          const cases=await dialogueCases();
          return json(res,200,await dialogueCalibration(await store.all(),cases));
        }
        if(path==='/api/dialogue-review-export') {
          const cases=await dialogueCases();
          const events=await store.all();
          const latest=new Map();
          for(const event of events) if(event.event_type==='dialogue_review') latest.set(event.case_id,event);
          const summary=dialogueReviewSummary(cases,events);
          const rows=[{record_type:'dialogue_review_export',created_at:new Date().toISOString(),...summary,label_provenance:'local_owner_review'},...cases.map(row=>({record_type:'dialogue_case',...row,owner_review:latest.get(row.id)??null}))];
          const text=rows.map(row=>JSON.stringify(row)).join('\n')+'\n';
          commonHeaders(res);
          res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Content-Disposition':'attachment; filename="meme-lab-dialogue-review.jsonl"'});
          return res.end(text);
        }
        const revealMatch=path.match(/^\/api\/experiments\/([a-f0-9-]{36})\/reveal$/);
        if(revealMatch) {
          const experiment=await store.experiment(revealMatch[1]);
          const events=await store.all();
          const reviews=latestExperimentReviews(events,experiment.experiment_id);
          const runs=new Map(events.filter(event=>event.event_type==='run').map(event=>[event.id,event]));
          const reviewable=experiment.arms.filter(arm=>runs.get(arm.run_id)?.status==='ok');
          if(reviewable.some(arm=>!reviews.has(arm.blind_id))) return json(res,409,{error:'Review every successful arm before revealing the conditions.'});
          return json(res,200,{experiment_id:experiment.experiment_id,intent_label:experiment.intent_label,seed:experiment.seed,arms:experiment.arms.map(arm=>{const run=runs.get(arm.run_id);return{blind_id:arm.blind_id,representation:arm.representation,run_id:arm.run_id,status:run?.status??'missing',duration_ms:run?.duration_ms??null,model:run?.modelReported??null,selection:run?.selection??null,error:run?.error??null,review:reviews.get(arm.blind_id)??null};})});
        }
        if(path==='/api/export') {
          const text=(await store.all()).map(r=>JSON.stringify(r)).join('\n');
          commonHeaders(res); res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Content-Disposition':'attachment; filename="meme-lab-events.jsonl"'}); return res.end(text?text+'\n':'');
        }
        let file;
        if(path==='/') file=resolve(ROOT,'public/index.html');
        else if(path==='/review') file=resolve(ROOT,'public/review.html');
        else if(path==='/design-probes' || path==='/design-probes/') file=resolve(ROOT,'design-probes/index.html');
        else if(['/app.js','/styles.css','/experiment.css','/review.js','/review.css'].includes(path)) file=resolve(ROOT,'public',path.slice(1));
        else if(path.startsWith('/design-probes/')) {
          file=resolve(ROOT,path.slice(1));
          if(!file.startsWith(resolve(ROOT,'design-probes')+sep)||!mime[extname(file)]) return json(res,404,{error:'Not found.'});
        }
        else if(['/PRD.md','/README.md','/AGENT_HANDOFF.md'].includes(path)) file=resolve(ROOT,path.slice(1));
        else if (path.startsWith('/docs/') || path.startsWith('/original/meme_references_v1/') || path.startsWith('/schemas/')) {
          file=resolve(ROOT,path.slice(1));
          const allowed=[resolve(ROOT,'docs')+sep,resolve(ROOT,'original/meme_references_v1')+sep,resolve(ROOT,'schemas')+sep];
          if(!allowed.some(base=>file.startsWith(base)) || !mime[extname(file)]) return json(res,404,{error:'Not found.'});
        }
        if (!file) return json(res,404,{error:'Not found.'});
        try { if(!(await stat(file)).isFile()) return json(res,404,{error:'Not found.'}); }
        catch { return json(res,404,{error:'Not found.'}); }
        commonHeaders(res);
        // Original single-file HTML intentionally embeds its own script. It is preserved byte-for-byte.
        if(path.startsWith('/design-probes')) res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
        else if(!path.startsWith('/original/')) res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://i.imgflip.com https://api.memegen.link https://api.nga.gov; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
        res.writeHead(200,{'Content-Type':mime[extname(file)]||'text/plain; charset=utf-8'}); return res.end(await readFile(file));
      }
      if(req.headers['x-meme-lab']!=='1') return json(res,403,{error:'Missing local-app request header.'});
      const body=await bodyJSON(req);
      if(path==='/api/prompt') {
        const input=validateRequest(body);
        const bundle=buildPrompt(input);
        return json(res,200,{...bundle,prompt_hash:promptHash,dataset_hash:datasetHash,warning:'Copying this prompt into another service shares the conversation and catalogue with that service.'});
      }
      if(path==='/api/experiment') {
        if(!['humour','no_meme'].includes(body.intent_label)) throw new Error('Pre-label the situation as humour or no_meme before running the comparison.');
        if(body.case_id!==undefined&&(typeof body.case_id!=='string'||!/^[a-z0-9_-]{1,64}$/.test(body.case_id))) throw new Error('Case ID must use 1–64 lowercase letters, numbers, underscores, or hyphens.');
        const base=validateRequest({...body,method:'model',representation:'minimal'});
        const seed=experimentSeed(body.seed);
        const experimentId=randomUUID();
        const order=orderedRepresentations(seed);
        const arms=[];
        for(const [index,representation] of order.entries()) {
          const input={...base,representation};
          const started=performance.now();
          const common={request:input,dataset_hash:datasetHash,prompt_hash:promptHash,selector_version:'0.2.0',experiment_id:experimentId,experiment_seed:seed};
          let run;
          try {
            const armSeed=(seed+index*2)%(2**31);
            const result=await modelSelect(input,config,{seed:armSeed});
            run=await store.save('run',{...common,...result,status:'ok',duration_ms:Math.round(performance.now()-started),model_config:{name:config.model,style:config.style,endpoint_host:new URL(config.baseUrl).host,remote:config.remote,temperature:config.style==='ollama'?config.temperature:null,context_tokens:config.style==='ollama'?config.contextTokens:null,seed:armSeed}});
          } catch(error) {
            run=await store.save('run',{...common,status:'error',error:error.message,duration_ms:Math.round(performance.now()-started)});
          }
          arms.push({blind_id:index===0?'A':'B',run_id:run.id,representation,run});
        }
        const status=arms.every(arm=>arm.run.status==='ok')?'complete':'incomplete';
        await store.save('experiment',{experiment_id:experimentId,case_id:body.case_id??null,intent_label:body.intent_label,seed,status,dataset_hash:datasetHash,prompt_hash:promptHash,selector_version:'0.2.0',arms:arms.map(({blind_id,run_id,representation})=>({blind_id,run_id,representation}))});
        return json(res,200,{experiment_id:experimentId,case_id:body.case_id??null,status,arms:arms.map(arm=>blindArm(arm.run,arm.blind_id,catalogue))});
      }
      if(path==='/api/experiment-review') {
        const experiment=await store.experiment(body.experiment_id);
        const arm=experiment.arms.find(candidate=>candidate.blind_id===body.blind_id);
        if(!arm) throw new Error('Unknown experiment arm.');
        const run=await store.run(arm.run_id);
        if(run.status!=='ok') throw new Error('Cannot review a failed experiment arm.');
        const verdicts=['send','related','miss','none_is_right','none_of_these'];
        if(!verdicts.includes(body.verdict)) throw new Error('Unknown verdict.');
        const candidateId=body.candidate_id??null;
        if(['send','related','miss'].includes(body.verdict)&&!run.selection.candidates.some(candidate=>candidate.id===candidateId)) throw new Error('Rate one of the candidates returned for this arm.');
        if(['none_is_right','none_of_these'].includes(body.verdict)&&candidateId!==null) throw new Error('A run-level verdict should not name a candidate.');
        if(typeof(body.note??'')!=='string'||(body.note??'').length>2000) throw new Error('Keep notes within 2,000 characters.');
        const review=await store.save('experiment_review',{experiment_id:experiment.experiment_id,blind_id:arm.blind_id,run_id:run.id,verdict:body.verdict,candidate_id:candidateId,note:body.note||'',asset_state:'not_requested',label_provenance:'local_user_blind_review_not_independent_benchmark'});
        const reviews=latestExperimentReviews(await store.all(),experiment.experiment_id);
        const successful=[];
        for(const candidate of experiment.arms) if((await store.run(candidate.run_id)).status==='ok') successful.push(candidate);
        return json(res,200,{review,reveal_ready:successful.every(candidate=>reviews.has(candidate.blind_id))});
      }
      if(path==='/api/candidate-review') {
        const experiment=await store.experiment(body.experiment_id);
        const arm=experiment.arms.find(candidate=>candidate.blind_id===body.blind_id);
        if(!arm) throw new Error('Unknown experiment arm.');
        const run=await store.run(arm.run_id);
        if(run.status!=='ok') throw new Error('Cannot review a failed experiment arm.');
        if(!run.selection.candidates.some(candidate=>candidate.id===body.candidate_id)) throw new Error('Review one of the candidates returned for this arm.');
        if(!['relevant','not_relevant','unsure'].includes(body.verdict)) throw new Error('Unknown relevance verdict.');
        if(typeof(body.note??'')!=='string'||(body.note??'').length>1000) throw new Error('Keep notes within 1,000 characters.');
        const review=await store.save('candidate_review',{experiment_id:experiment.experiment_id,blind_id:arm.blind_id,run_id:run.id,candidate_id:body.candidate_id,verdict:body.verdict,note:body.note||'',label_provenance:'local_user_candidate_relevance_review'});
        return json(res,200,{review});
      }
      if(path==='/api/dialogue-review') {
        const cases=await dialogueCases();
        const input=validateDialogueReview(body,new Set(cases.map(row=>row.id)));
        const review=await store.save('dialogue_review',{...input,label_provenance:'local_owner_dialogue_quality_review'});
        return json(res,200,{review,calibration:await dialogueCalibration(await store.all(),cases)});
      }
      if(path==='/api/select') {
        const input=validateRequest(body); const started=performance.now();
        const common={request:input,dataset_hash:datasetHash,prompt_hash:promptHash,selector_version:'0.2.0'};
        try {
          const result=input.method==='baseline'?{selection:lexicalSelect(input),usage:null,modelReported:null}:await modelSelect(input,config);
          const run=await store.save('run',{...common,...result,status:'ok',duration_ms:Math.round(performance.now()-started),model_config:input.method==='model'?{name:config.model,style:config.style,endpoint_host:new URL(config.baseUrl).host,remote:config.remote,temperature:config.style==='ollama'?config.temperature:null,context_tokens:config.style==='ollama'?config.contextTokens:null}:null});
          return json(res,200,run);
        } catch(error) {
          const run=await store.save('run',{...common,status:'error',error:error.message,duration_ms:Math.round(performance.now()-started)});
          return json(res,502,{error:error.message,run_id:run.id});
        }
      }
      if(path==='/api/feedback') {
        const run=await store.run(body.run_id);
        if(run.status!=='ok') throw new Error('Cannot rate a failed run.');
        const verdicts=['send','related','miss','none_is_right','none_of_these'];
        if(!verdicts.includes(body.verdict)) throw new Error('Unknown verdict.');
        const candidateId=body.candidate_id ?? null;
        if(['send','related','miss'].includes(body.verdict) && !run.selection.candidates.some(c=>c.id===candidateId)) throw new Error('Rate one of the candidates returned for this run.');
        if(['none_is_right','none_of_these'].includes(body.verdict) && candidateId!==null) throw new Error('A run-level verdict should not name a candidate.');
        const replacementId=body.replacement_id || null;
        if(replacementId && !catalogue.some(r=>r.id===replacementId)) throw new Error('Unknown replacement reference.');
        if(typeof (body.note??'')!=='string'||(body.note??'').length>2000) throw new Error('Keep notes within 2,000 characters.');
        if(!['loaded','failed','not_requested'].includes(body.asset_state??'not_requested')) throw new Error('Invalid asset state.');
        return json(res,200,await store.save('feedback',{run_id:run.id,verdict:body.verdict,candidate_id:candidateId,replacement_id:replacementId,note:body.note||'',asset_state:body.asset_state??'not_requested',label_provenance:'local_user_feedback_not_independent_benchmark'}));
      }
      return json(res,404,{error:'Not found.'});
    } catch(error) { if(!res.headersSent) return json(res,error.status??400,{error:error.message}); res.end(); }
  });
  server.requestTimeout=35_000;
  server.headersTimeout=10_000;
  return server;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    loadEnv(resolve(ROOT,'.env')); const config=configFromEnv(); const app=createApp(config);
    app.listen(config.port,'127.0.0.1',()=>{
      console.log(`Meme Lab → http://127.0.0.1:${app.address().port}`);
      console.log(config.model?`Model: ${config.model} (${config.remote?'REMOTE inference explicitly enabled':'loopback endpoint; use a local model for private inputs'})`:'No model configured. Catalogue, prompt export and labelled lexical baseline are available.');
      console.log('Runs and feedback stay in ./runs. Remote images load only after an explicit click.');
    });
    app.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Port is in use. Change PORT in .env.':error.message);process.exitCode=1;});
  } catch(error) { console.error(error.message);process.exitCode=1; }
}
