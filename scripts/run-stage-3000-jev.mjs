import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateStage3000Evaluation} from './stage-3000-eval-lib.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const endpoint=(process.argv[2]??'http://127.0.0.1:8790').replace(/\/$/,'');
const parseJsonl=(text,label)=>text.trim().split('\n').filter(Boolean).map((line,index)=>{
  try { return JSON.parse(line); }
  catch { throw new Error(`${label} has invalid JSON on line ${index+1}.`); }
});
const paths={
  catalogue:resolve(root,'worker/tools/stage-3000-catalogue.json'),
  cases:resolve(root,'eval/relevance_stage3000_v1.jsonl'),
  prior:resolve(root,'eval/relevance_stage1000_shadow_v1.jsonl'),
  reviewed:resolve(root,'expansion/reviewed/stage-3000.jsonl')
};
let catalogueText;
let casesText;
let priorText;
let reviewedText;
try {
  [catalogueText,casesText,priorText,reviewedText]=await Promise.all(Object.values(paths).map(path=>readFile(path,'utf8')));
} catch(error) {
  if(error?.code==='ENOENT') throw new Error('Stage-3,000 Jev evaluation is not ready. Build the reviewed catalogue and run scripts/build-stage-3000-eval.mjs first.');
  throw error;
}
const catalogue=JSON.parse(catalogueText);
const cases=parseJsonl(casesText,'stage-3,000 evaluation');
const priorShadow=parseJsonl(priorText,'stage-1,000 shadow evaluation');
const reviewed=parseJsonl(reviewedText,'stage-3,000 reviewed metadata');
validateStage3000Evaluation(cases,{priorShadow,stage3000Ids:new Set(reviewed.map(record=>record.id))});
const byId=new Map(catalogue.map(record=>[record.id,record]));
const humourCases=cases.filter(row=>row.intent_label==='humour');
const rows=[];
for(const testCase of humourCases) {
  const retrieved=await fetch(`${endpoint}/query?q=${encodeURIComponent(testCase.context)}&topK=30&hybrid=1`,{signal:AbortSignal.timeout(10000)});
  if(!retrieved.ok) throw new Error(`${testCase.id} retrieval failed with HTTP ${retrieved.status}.`);
  const payload=await retrieved.json();
  if(!Array.isArray(payload?.matches)) throw new Error(`${testCase.id} retrieval returned an invalid result.`);
  const retrievedIds=payload.matches.map(match=>match.id);
  const records=retrievedIds.map(id=>byId.get(id)).filter(Boolean);
  if(records.length===0) throw new Error(`${testCase.id} retrieval returned no known stage-3,000 records.`);
  const labels=records.map(record=>`${record.id} | ${record.name}: ${record.message} Social dynamic: ${record.relational_pattern}`);
  const classified=await fetch('https://classifier.dev/v1/classify',{
    method:'POST',
    headers:{'content-type':'application/json'},
    signal:AbortSignal.timeout(5000),
    body:JSON.stringify({inputs:[testCase.context],labels,tier:'fast',instructions:'Rank the existing meme reaction whose social meaning, emotional tone, speaker-target relationship, and sendability best match the situation. Do not choose by shared keywords alone.'})
  });
  if(!classified.ok) throw new Error(`${testCase.id} Jev failed with HTTP ${classified.status}.`);
  const result=(await classified.json())?.results?.[0];
  if(!result||typeof result.scores!=='object') throw new Error(`${testCase.id} Jev returned an invalid result.`);
  const ranked=records.map((record,index)=>({id:record.id,score:Number(result.scores[labels[index]]??0),retrieval_rank:index+1})).sort((a,b)=>b.score-a.score||a.retrieval_rank-b.retrieval_rank);
  const selectedIds=ranked.slice(0,3).map(row=>row.id);
  rows.push({
    id:testCase.id,
    case_origin:testCase.case_origin,
    acceptable_ids:testCase.acceptable_ids,
    retrieved_ids:retrievedIds,
    selected_ids:selectedIds,
    retrieval_hit:testCase.acceptable_ids.some(id=>retrievedIds.includes(id)),
    top_1_correct:testCase.acceptable_ids.includes(selectedIds[0]),
    top_3_correct:selectedIds.some(id=>testCase.acceptable_ids.includes(id))
  });
}
const rate=(records,key)=>records.length?records.filter(row=>row[key]).length/records.length:0;
const metricsFor=records=>{
  const hits=records.filter(row=>row.retrieval_hit);
  return {retrieval_at_30:rate(records,'retrieval_hit'),top_1:rate(records,'top_1_correct'),top_3:rate(records,'top_3_correct'),top_3_given_retrieval:rate(hits,'top_3_correct')};
};
const priorRows=rows.filter(row=>row.case_origin==='prior_stage1000_shadow');
const freshRows=rows.filter(row=>row.case_origin==='synthetic_stage3000');
const report={
  version:'stage-3000-jev-fast-v1',
  created_at:new Date().toISOString(),
  input_hash:createHash('sha256').update(catalogueText).update(casesText).digest('hex'),
  labels:'mixed_prior_shadow_and_synthetic_pending_owner_review',
  human_validated:false,
  total_dataset_cases:cases.length,
  evaluated_humour_cases:rows.length,
  unevaluated_no_meme_cases:cases.length-rows.length,
  metrics:metricsFor(rows),
  slices:{prior_shadow:metricsFor(priorRows),fresh_stage3000:metricsFor(freshRows)},
  rows
};
const summary={...report};
delete summary.rows;
await mkdir(resolve(root,'eval/results'),{recursive:true});
await Promise.all([
  writeFile(resolve(root,'eval/results/stage-3000-jev-fast.json'),`${JSON.stringify(report,null,2)}\n`),
  writeFile(resolve(root,'eval/stage-3000-jev-fast-summary.json'),`${JSON.stringify(summary,null,2)}\n`)
]);
console.log(JSON.stringify({metrics:report.metrics,slices:report.slices},null,2));
