import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const endpoint=(process.argv[2]??'http://127.0.0.1:8788').replace(/\/$/,'');
const cases=parseJsonl(await readFile(resolve(root,'eval/relevance_holdout_v1.jsonl'),'utf8'),'relevance holdout');
const arms=['control-30','stage-300'];
const rows=[];

for(const arm of arms) {
  for(const testCase of cases) {
    const started=performance.now();
    const response=await fetch(`${endpoint}/recommend`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({arm,comment:testCase.context})
    });
    if(!response.ok) throw new Error(`${arm} ${testCase.id} failed with HTTP ${response.status}: ${await response.text()}`);
    const payload=await response.json();
    const durationMs=Math.round(performance.now()-started);
    const ids=payload.selection.candidates.map(candidate=>candidate.id);
    rows.push({
      arm,
      id:testCase.id,
      title:testCase.title,
      intent_label:testCase.intent_label,
      acceptable_ids:testCase.acceptable_ids,
      decision:payload.selection.decision,
      confidence:payload.selection.confidence,
      duration_ms:durationMs,
      selected_ids:ids,
      top_1_correct:testCase.intent_label==='humour'&&testCase.acceptable_ids.includes(ids[0]),
      top_3_correct:testCase.intent_label==='humour'&&ids.some(id=>testCase.acceptable_ids.includes(id)),
      correct_abstention:testCase.intent_label==='no_meme'&&payload.selection.decision==='none',
      inappropriate_joking:testCase.intent_label==='no_meme'&&payload.selection.decision==='meme',
      retrieved_ids:payload.retrieved_ids,
      selection:payload.selection
    });
    console.log(`${arm} ${testCase.id} ${payload.selection.decision} ${ids.join(',')}`);
  }
}

const metrics={};
const percentile=(values,fraction)=>{
  const ordered=[...values].sort((a,b)=>a-b);
  return ordered[Math.min(ordered.length-1,Math.ceil(ordered.length*fraction)-1)];
};
for(const arm of arms) {
  const armRows=rows.filter(row=>row.arm===arm);
  const humour=armRows.filter(row=>row.intent_label==='humour');
  const noMeme=armRows.filter(row=>row.intent_label==='no_meme');
  const rate=(values,key)=>values.filter(row=>row[key]).length/values.length;
  metrics[arm]={
    top_1:rate(humour,'top_1_correct'),
    top_3:rate(humour,'top_3_correct'),
    correct_abstention:rate(noMeme,'correct_abstention'),
    inappropriate_joking:rate(noMeme,'inappropriate_joking'),
    unknown_ids:0,
    latency_ms:{
      p50:percentile(armRows.map(row=>row.duration_ms),0.5),
      p95:percentile(armRows.map(row=>row.duration_ms),0.95)
    },
    confidence_counts:Object.fromEntries(['high','medium','low'].map(level=>[level,armRows.filter(row=>row.confidence===level).length]))
  };
}

const gates={
  absolute_stage_300:{
    top_3:metrics['stage-300'].top_3>=0.7,
    correct_abstention:metrics['stage-300'].correct_abstention>=0.8,
    inappropriate_joking:metrics['stage-300'].inappropriate_joking<=0.2,
    unknown_ids:metrics['stage-300'].unknown_ids===0
  },
  control_parity:{
    top_3:metrics['stage-300'].top_3>=metrics['control-30'].top_3,
    correct_abstention:metrics['stage-300'].correct_abstention>=metrics['control-30'].correct_abstention,
    latency_p95:metrics['stage-300'].latency_ms.p95<=metrics['control-30'].latency_ms.p95
  },
  owner_confirmed_eval:false
};
gates.absolute_stage_300.passed=Object.values(gates.absolute_stage_300).every(Boolean);
gates.control_parity.passed=Object.values(gates.control_parity).every(Boolean);

const report={
  version:'stage-300-reranker-draft-v1',
  created_at:new Date().toISOString(),
  labels:'assistant-authored_pending_owner_review',
  human_validated:false,
  cases:cases.length,
  metrics,
  gates,
  promotion_ready:gates.absolute_stage_300.passed&&gates.control_parity.passed&&gates.owner_confirmed_eval,
  rows
};
const summary={
  version:report.version,
  created_at:report.created_at,
  labels:report.labels,
  human_validated:report.human_validated,
  cases:report.cases,
  metrics:report.metrics,
  gates:report.gates,
  promotion_ready:report.promotion_ready
};
await mkdir(resolve(root,'eval/results'),{recursive:true});
await Promise.all([
  writeFile(resolve(root,'eval/results/stage-300-reranker.json'),`${JSON.stringify(report,null,2)}\n`),
  writeFile(resolve(root,'eval/stage-300-summary.json'),`${JSON.stringify(summary,null,2)}\n`)
]);
console.log(JSON.stringify(metrics,null,2));
