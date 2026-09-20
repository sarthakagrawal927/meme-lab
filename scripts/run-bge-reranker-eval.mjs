import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const endpoint=(process.argv[2]??'http://127.0.0.1:8788').replace(/\/$/,'');
const cases=parseJsonl(await readFile(resolve(root,'eval/relevance_holdout_v1.jsonl'),'utf8'),'relevance holdout');
const rows=[];

for(const testCase of cases) {
  const started=performance.now();
  const response=await fetch(`${endpoint}/bge-rerank`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({comment:testCase.context})
  });
  if(!response.ok) throw new Error(`${testCase.id} failed with HTTP ${response.status}: ${await response.text()}`);
  const payload=await response.json();
  const ranked=payload.result?.response;
  if(!Array.isArray(ranked)) throw new Error(`${testCase.id} returned no BGE ranking.`);
  const selectedIds=ranked.map(item=>payload.retrieved_ids[item.id]).filter(Boolean);
  const durationMs=Math.round(performance.now()-started);
  rows.push({
    id:testCase.id,
    title:testCase.title,
    intent_label:testCase.intent_label,
    acceptable_ids:testCase.acceptable_ids,
    duration_ms:durationMs,
    selected_ids:selectedIds,
    scores:ranked.map(item=>item.score),
    top_1_correct:testCase.intent_label==='humour'&&testCase.acceptable_ids.includes(selectedIds[0]),
    top_3_correct:testCase.intent_label==='humour'&&selectedIds.some(id=>testCase.acceptable_ids.includes(id)),
    retrieved_ids:payload.retrieved_ids
  });
  console.log(`${testCase.id} ${selectedIds.join(',')}`);
}

const percentile=(values,fraction)=>{
  const ordered=[...values].sort((a,b)=>a-b);
  return ordered[Math.min(ordered.length-1,Math.ceil(ordered.length*fraction)-1)];
};
const humour=rows.filter(row=>row.intent_label==='humour');
const rate=(values,key)=>values.filter(row=>row[key]).length/values.length;
const metrics={
  top_1:rate(humour,'top_1_correct'),
  top_3:rate(humour,'top_3_correct'),
  abstention_supported:false,
  latency_ms:{
    p50:percentile(rows.map(row=>row.duration_ms),0.5),
    p95:percentile(rows.map(row=>row.duration_ms),0.95)
  }
};
const report={
  version:'bge-reranker-draft-v1',
  created_at:new Date().toISOString(),
  model:'@cf/baai/bge-reranker-base',
  labels:'assistant-authored_pending_owner_review',
  human_validated:false,
  retrieval:'bge-base-en-v1.5_top_30',
  cases:cases.length,
  metrics,
  note:'This cross-encoder ranks semantic relevance only. It cannot decide whether humour is appropriate or write user-facing explanations.',
  rows
};
await mkdir(resolve(root,'eval/results'),{recursive:true});
await writeFile(resolve(root,'eval/results/bge-reranker.json'),`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify(metrics,null,2));
