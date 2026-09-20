import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl,validateStageCoverageCases} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const retrievalEndpoint=(process.argv[2]??'http://127.0.0.1:8788').replace(/\/$/,'');
const classifierEndpoint='https://classifier.dev/v1/classify';
const catalogue=JSON.parse(await readFile(resolve(root,'worker/tools/stage-300-catalogue.json'),'utf8'));
const catalogueById=new Map(catalogue.map(record=>[record.id,record]));
const casesText=await readFile(resolve(root,'eval/relevance_stage300_v1.jsonl'),'utf8');
const cases=parseJsonl(casesText,'stage-300 coverage holdout');
const expandedIds=catalogue.slice(30).map(record=>record.id);
validateStageCoverageCases(cases,{allowedIds:new Set(expandedIds),excludedIds:catalogue.slice(0,30).map(record=>record.id)});

function labelFor(record) {
  return `${record.id} | ${record.name}: ${record.message} Social dynamic: ${record.relational_pattern}`;
}

async function classify(context,records) {
  const labels=records.map(labelFor);
  const response=await fetch(classifierEndpoint,{
    method:'POST',
    headers:{'content-type':'application/json'},
    signal:AbortSignal.timeout(5000),
    body:JSON.stringify({
      inputs:[context],
      labels,
      tier:'fast',
      instructions:'Rank the existing meme reaction whose social meaning, emotional tone, speaker-target relationship, and sendability best match the situation. Do not choose by shared keywords alone.'
    })
  });
  if(!response.ok) throw new Error(`Classifier.dev returned HTTP ${response.status}: ${await response.text()}`);
  const payload=await response.json();
  const result=payload?.results?.[0];
  if(!result||typeof result.scores!=='object') throw new Error('Classifier.dev returned an unexpected response.');
  const scored=labels.map((label,index)=>({
    id:records[index].id,
    score:Number(result.scores[label]??0),
    retrieval_rank:index+1
  })).sort((a,b)=>b.score-a.score||a.retrieval_rank-b.retrieval_rank);
  return {model:result.model??payload.model??'unknown',ranked:scored};
}

const rows=[];
for(const testCase of cases) {
  const started=performance.now();
  const response=await fetch(`${retrievalEndpoint}/query?q=${encodeURIComponent(testCase.context)}&topK=30`);
  if(!response.ok) throw new Error(`${testCase.id} retrieval failed with HTTP ${response.status}: ${await response.text()}`);
  const payload=await response.json();
  const retrievedIds=payload.matches.map(match=>match.id);
  const records=retrievedIds.map(id=>catalogueById.get(id)).filter(Boolean);
  const {model,ranked}=await classify(testCase.context,records);
  const selectedIds=ranked.slice(0,3).map(row=>row.id);
  rows.push({
    id:testCase.id,
    acceptable_ids:testCase.acceptable_ids,
    retrieved_ids:retrievedIds,
    selected_ids:selectedIds,
    retrieval_hit:testCase.acceptable_ids.some(id=>retrievedIds.includes(id)),
    top_1_correct:testCase.acceptable_ids.includes(selectedIds[0]),
    top_3_correct:selectedIds.some(id=>testCase.acceptable_ids.includes(id)),
    model,
    duration_ms:Math.round(performance.now()-started)
  });
  console.log(`${testCase.id} ${selectedIds.join(',')}`);
}

const rate=key=>rows.filter(row=>row[key]).length/rows.length;
const retrievalHits=rows.filter(row=>row.retrieval_hit);
const durations=rows.map(row=>row.duration_ms).sort((a,b)=>a-b);
const percentile=fraction=>durations[Math.min(durations.length-1,Math.ceil(durations.length*fraction)-1)];
const report={
  version:'jev-fast-stage-300-coverage-v1',
  created_at:new Date().toISOString(),
  input_hash:createHash('sha256').update(JSON.stringify(catalogue)).update(casesText).digest('hex'),
  labels:'assistant-authored_pending_owner_review',
  human_validated:false,
  classifier:'classifier.dev fast tier',
  privacy_note:'Synthetic evaluation text only; classifier.dev forwards inputs to TypeSafe.',
  cases:rows.length,
  metrics:{
    retrieval_at_30:rate('retrieval_hit'),
    top_1:rate('top_1_correct'),
    top_3:rate('top_3_correct'),
    top_3_given_retrieval:retrievalHits.length?retrievalHits.filter(row=>row.top_3_correct).length/retrievalHits.length:0,
    latency_ms:{p50:percentile(0.5),p95:percentile(0.95)}
  },
  rows
};
await mkdir(resolve(root,'eval/results'),{recursive:true});
await writeFile(resolve(root,'eval/results/jev-stage-300-coverage.json'),`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify(report.metrics,null,2));
