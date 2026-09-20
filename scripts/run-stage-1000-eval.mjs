import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl,validateStage1000Cases} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const endpoint=(process.argv[2]??'http://127.0.0.1:8789').replace(/\/$/,'');
const arm=process.argv[3]??'stage-current';
if(!['stage-current','stage-current-jev','stage-current-gated'].includes(arm)) throw new Error(`Unsupported stage-1000 arm: ${arm}.`);
const catalogueText=await readFile(resolve(root,'worker/tools/stage-1000-catalogue.json'),'utf8');
const catalogue=JSON.parse(catalogueText);
const casesText=await readFile(resolve(root,'eval/relevance_stage1000_v1.jsonl'),'utf8');
const cases=parseJsonl(casesText,'stage-1000 evaluation');
validateStage1000Cases(cases,{allowedIds:new Set(catalogue.map(record=>record.id))});

const rows=[];
for(const testCase of cases) {
  const started=performance.now();
  const response=await fetch(`${endpoint}/recommend`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({arm,comment:testCase.context}),
    signal:AbortSignal.timeout(30000)
  });
  if(!response.ok) throw new Error(`${testCase.id} failed with HTTP ${response.status}: ${await response.text()}`);
  const payload=await response.json();
  const selectedIds=payload.selection.candidates.map(candidate=>candidate.id);
  const isHumour=testCase.intent_label==='humour';
  rows.push({
    id:testCase.id,
    intent_label:testCase.intent_label,
    acceptable_ids:testCase.acceptable_ids,
    retrieved_ids:payload.retrieved_ids,
    selected_ids:selectedIds,
    decision:payload.selection.decision,
    confidence:payload.selection.confidence,
    retrieval_hit:isHumour&&testCase.acceptable_ids.some(id=>payload.retrieved_ids.includes(id)),
    top_1_correct:isHumour&&testCase.acceptable_ids.includes(selectedIds[0]),
    top_3_correct:isHumour&&selectedIds.some(id=>testCase.acceptable_ids.includes(id)),
    correct_abstention:!isHumour&&payload.selection.decision==='none',
    inappropriate_joking:!isHumour&&payload.selection.decision==='meme',
    duration_ms:Math.round(performance.now()-started),
    selection:payload.selection
  });
  console.log(`${testCase.id} ${payload.selection.decision} ${selectedIds.join(',')}`);
}

const humour=rows.filter(row=>row.intent_label==='humour');
const noMeme=rows.filter(row=>row.intent_label==='no_meme');
const rate=(records,key)=>records.filter(row=>row[key]).length/records.length;
const durations=rows.map(row=>row.duration_ms).sort((a,b)=>a-b);
const percentile=fraction=>durations[Math.min(durations.length-1,Math.ceil(durations.length*fraction)-1)];
const retrievalHits=humour.filter(row=>row.retrieval_hit);
const metrics={
  retrieval_at_30:rate(humour,'retrieval_hit'),
  top_1:rate(humour,'top_1_correct'),
  top_3:rate(humour,'top_3_correct'),
  top_3_given_retrieval:retrievalHits.length?rate(retrievalHits,'top_3_correct'):0,
  correct_abstention:rate(noMeme,'correct_abstention'),
  inappropriate_joking:rate(noMeme,'inappropriate_joking'),
  latency_ms:{p50:percentile(0.5),p95:percentile(0.95)}
};
const report={
  version:`stage-1000-${arm}-draft-v1`,
  created_at:new Date().toISOString(),
  input_hash:createHash('sha256').update(catalogueText).update(casesText).digest('hex'),
  labels:'assistant-authored_pending_owner_review',
  human_validated:false,
  cases:rows.length,
  arm,
  metrics,
  gates:{
    retrieval_at_30:metrics.retrieval_at_30>=0.75,
    top_3:metrics.top_3>=0.72,
    correct_abstention:metrics.correct_abstention>=0.82,
    inappropriate_joking:metrics.inappropriate_joking<=0.18
  },
  promotion_ready:false,
  rows
};
const summary={...report};
delete summary.rows;
const name=arm==='stage-current-jev'?'stage-1000-jev-ensemble':arm==='stage-current-gated'?'stage-1000-jev-gated':'stage-1000-baseline';
await mkdir(resolve(root,'eval/results'),{recursive:true});
await Promise.all([
  writeFile(resolve(root,`eval/results/${name}.json`),`${JSON.stringify(report,null,2)}\n`),
  writeFile(resolve(root,`eval/${name}-summary.json`),`${JSON.stringify(summary,null,2)}\n`)
]);
console.log(JSON.stringify({metrics,gates:report.gates},null,2));
