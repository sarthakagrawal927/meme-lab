import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApp, ROOT } from '../server.mjs';
import { loadEnv, configFromEnv } from '../src/config.mjs';
import { catalogue } from '../src/selector.mjs';

const HOLDOUT_PATH=resolve(ROOT,'private/holdout_v1.jsonl');
const OUTPUT_DIR=resolve(ROOT,'results/holdout-v1');
const STORE_DIR=resolve(OUTPUT_DIR,'runs');
const MANIFEST_PATH=resolve(OUTPUT_DIR,'manifest.json');
const BLIND_PATH=resolve(OUTPUT_DIR,'blind_queue.json');
const normalize=value=>value.trim().replaceAll(/\s+/g,' ').toLowerCase();

async function readJsonl(path) {
  return (await readFile(path,'utf8')).trim().split('\n').filter(Boolean).map((line,index)=>{
    try { return JSON.parse(line); }
    catch { throw new Error(`Invalid JSON on line ${index+1} of ${path}.`); }
  });
}

function validateCases(cases, smokeCases) {
  if(cases.length!==30) throw new Error(`Holdout must contain exactly 30 cases; found ${cases.length}.`);
  if(cases.filter(row=>row.intent_label==='humour').length!==20) throw new Error('Holdout must contain exactly 20 humour cases.');
  if(cases.filter(row=>row.intent_label==='no_meme').length!==10) throw new Error('Holdout must contain exactly 10 no-meme cases.');
  const ids=new Set();
  const contexts=new Set();
  const forbidden=new Set(smokeCases.map(row=>normalize(row.context)));
  for(const record of catalogue) {
    const serialized=JSON.stringify(record);
    for(const key of ['example_context','near_miss_context']) {
      const match=serialized.match(new RegExp(`"${key}":"([^"]+)"`));
      if(match) forbidden.add(normalize(match[1]));
    }
  }
  for(const row of cases) {
    if(typeof row.id!=='string'||!row.id||row.id.toLowerCase().startsWith('smoke-')) throw new Error('Every holdout case needs a non-smoke ID.');
    if(ids.has(row.id)) throw new Error(`Duplicate holdout ID: ${row.id}.`);
    ids.add(row.id);
    if(!['humour','no_meme'].includes(row.intent_label)) throw new Error(`Invalid intent label for ${row.id}.`);
    if(typeof row.context!=='string'||row.context.trim().length<20) throw new Error(`Invalid context for ${row.id}.`);
    const context=normalize(row.context);
    if(contexts.has(context)) throw new Error(`Duplicate holdout context: ${row.id}.`);
    if(forbidden.has(context)) throw new Error(`Holdout context leaks an existing fixture or catalogue example: ${row.id}.`);
    contexts.add(context);
  }
}

async function saveManifest(manifest) {
  await writeFile(MANIFEST_PATH,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
}

loadEnv(resolve(ROOT,'.env'));
const config=configFromEnv();
if(!config.model) throw new Error('MEME_MODEL must be configured for the holdout.');
if(config.remote) throw new Error('The holdout runner only permits a loopback model endpoint.');

const cases=await readJsonl(HOLDOUT_PATH);
const smokeCases=await readJsonl(resolve(ROOT,'eval/smoke_cases.jsonl'));
validateCases(cases,smokeCases);

await mkdir(resolve(ROOT,'results'),{recursive:true,mode:0o700});
await mkdir(OUTPUT_DIR,{recursive:true,mode:0o700});
await mkdir(STORE_DIR,{recursive:true,mode:0o700});

let manifest;
try {
  manifest=JSON.parse(await readFile(MANIFEST_PATH,'utf8'));
  if(manifest.version!=='holdout-v1') throw new Error('Existing manifest version does not match holdout-v1.');
} catch(error) {
  if(error.code!=='ENOENT') throw error;
  manifest={
    version:'holdout-v1',
    created_at:new Date().toISOString(),
    frozen_cases:cases.map((row,index)=>({case_id:`holdout-${String(index+1).padStart(3,'0')}`,source_id:row.id,intent_label:row.intent_label,context:row.context,seed:1001+index})),
    model:{name:config.model,style:config.style,host:new URL(config.baseUrl).host,remote:false},
    completed:[]
  };
  await saveManifest(manifest);
}

const completedIds=new Set(manifest.completed.filter(row=>row.status==='complete').map(row=>row.case_id));
const app=createApp(config,{storeDir:STORE_DIR});
await new Promise((resolveListen,reject)=>{
  app.once('error',reject);
  app.listen(0,'127.0.0.1',resolveListen);
});
const baseUrl=`http://127.0.0.1:${app.address().port}`;

try {
  const health=await(await fetch(baseUrl+'/api/health')).json();
  manifest.dataset_hash=health.dataset_hash;
  manifest.prompt_hash=health.prompt_hash;
  await saveManifest(manifest);

  for(const [index,row] of manifest.frozen_cases.entries()) {
    if(completedIds.has(row.case_id)) {
      console.log(`[${index+1}/30] ${row.case_id} already complete; skipping.`);
      continue;
    }
    const started=Date.now();
    const response=await fetch(baseUrl+'/api/experiment',{
      method:'POST',
      headers:{'Content-Type':'application/json','X-Meme-Lab':'1'},
      body:JSON.stringify({
        case_id:row.case_id,
        context:row.context,
        intent_label:row.intent_label,
        scope:'reactions',
        style:'playful',
        recent_ids:[],
        seed:row.seed
      })
    });
    const result=await response.json();
    const completed={
      case_id:row.case_id,
      experiment_id:result.experiment_id??null,
      seed:row.seed,
      status:response.ok?result.status:'error',
      duration_ms:Date.now()-started,
      error:response.ok?null:(result.error??`HTTP ${response.status}`)
    };
    manifest.completed=manifest.completed.filter(item=>item.case_id!==row.case_id);
    manifest.completed.push(completed);
    await saveManifest(manifest);
    console.log(`[${index+1}/30] ${row.case_id}: ${completed.status} in ${(completed.duration_ms/1000).toFixed(1)}s`);
  }

  const queue=await(await fetch(baseUrl+'/api/experiment-queue')).json();
  await writeFile(BLIND_PATH,JSON.stringify({version:'holdout-v1-blind',cases:queue},null,2)+'\n',{mode:0o600});
  const report=await(await fetch(baseUrl+'/api/experiment-report')).json();
  manifest.finished_at=new Date().toISOString();
  manifest.run_report=report;
  await saveManifest(manifest);
  console.log(JSON.stringify({status:'finished',output:OUTPUT_DIR,experiments:report.experiments,fully_reviewed:report.fully_reviewed},null,2));
} finally {
  app.closeAllConnections();
  await new Promise(resolveClose=>app.close(resolveClose));
}
