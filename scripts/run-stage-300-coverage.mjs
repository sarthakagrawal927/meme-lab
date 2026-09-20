import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl,validateStageCoverageCases} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const endpoint=(process.argv[2]??'http://127.0.0.1:8788').replace(/\/$/,'');
const arm=process.argv[3]??'stage-300-expansion';
if(!['stage-300-expansion','stage-300-jev'].includes(arm)) throw new Error(`Unsupported coverage arm: ${arm}.`);
const live=JSON.parse(await readFile(resolve(root,'worker/public/catalogue.json'),'utf8'));
const candidatesText=await readFile(resolve(root,'expansion/candidates/stage-300.jsonl'),'utf8');
const casesText=await readFile(resolve(root,'eval/relevance_stage300_v1.jsonl'),'utf8');
const candidates=parseJsonl(candidatesText,'stage-300 candidates');
const cases=parseJsonl(casesText,'stage-300 coverage holdout');
validateStageCoverageCases(cases,{allowedIds:new Set(candidates.map(record=>record.id)),excludedIds:live.map(record=>record.id)});
const rows=[];

for(const testCase of cases) {
  const started=performance.now();
  const response=await fetch(`${endpoint}/recommend`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({arm,comment:testCase.context})
  });
  if(!response.ok) throw new Error(`${testCase.id} failed with HTTP ${response.status}: ${await response.text()}`);
  const payload=await response.json();
  const ids=payload.selection.candidates.map(candidate=>candidate.id);
  const retrieved=new Set(payload.retrieved_ids);
  rows.push({
    id:testCase.id,
    title:testCase.title,
    acceptable_ids:testCase.acceptable_ids,
    selected_ids:ids,
    confidence:payload.selection.confidence,
    duration_ms:Math.round(performance.now()-started),
    retrieval_hit:testCase.acceptable_ids.some(id=>retrieved.has(id)),
    top_1_correct:testCase.acceptable_ids.includes(ids[0]),
    top_3_correct:ids.some(id=>testCase.acceptable_ids.includes(id)),
    retrieved_ids:payload.retrieved_ids,
    selection:payload.selection
  });
  console.log(`${testCase.id} ${ids.join(',')}`);
}

const rate=key=>rows.filter(row=>row[key]).length/rows.length;
const ordered=rows.map(row=>row.duration_ms).sort((a,b)=>a-b);
const percentile=fraction=>ordered[Math.min(ordered.length-1,Math.ceil(ordered.length*fraction)-1)];
const retrievalHits=rows.filter(row=>row.retrieval_hit);
const conditionalTop3=retrievalHits.length?retrievalHits.filter(row=>row.top_3_correct).length/retrievalHits.length:0;
const metrics={retrieval_at_30:rate('retrieval_hit'),top_1:rate('top_1_correct'),top_3:rate('top_3_correct'),top_3_given_retrieval:conditionalTop3,latency_ms:{p50:percentile(0.5),p95:percentile(0.95)}};
const report={
  version:arm==='stage-300-jev'?'stage-300-jev-ensemble-coverage-draft-v1':'stage-300-expansion-coverage-draft-v1',
  created_at:new Date().toISOString(),
  input_hash:createHash('sha256').update(candidatesText).update(casesText).digest('hex'),
  labels:'assistant-authored_pending_owner_review',
  human_validated:false,
  cases:rows.length,
  retrieval:arm==='stage-300-jev'?'expansion_semantic_top_30_then_jev_top_12_then_llama':'expansion_candidates_only_semantic_top_30',
  metrics,
  gates:{retrieval_at_30:metrics.retrieval_at_30>=0.7,top_3:metrics.top_3>=0.7},
  promotion_ready:false,
  rows
};
const summary={...report};
delete summary.rows;
await mkdir(resolve(root,'eval/results'),{recursive:true});
const resultName=arm==='stage-300-jev'?'stage-300-jev-ensemble':'stage-300-coverage';
await Promise.all([
  writeFile(resolve(root,`eval/results/${resultName}.json`),`${JSON.stringify(report,null,2)}\n`),
  writeFile(resolve(root,`eval/${resultName}-summary.json`),`${JSON.stringify(summary,null,2)}\n`)
]);
console.log(JSON.stringify(report.metrics,null,2));
