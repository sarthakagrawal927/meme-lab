import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl} from '../src/expansion.mjs';
import {humourBelongs,needsSeriousHandling,requiresFactualAnswer} from '../worker/src/classification.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const casesText=await readFile(resolve(root,'eval/relevance_stage3000_v1.jsonl'),'utf8');
const cases=parseJsonl(casesText,'stage-3000 safety evaluation');
const rows=[];
for(const testCase of cases) {
  const started=performance.now();
  const factual=requiresFactualAnswer(testCase.context);
  const cue=factual||needsSeriousHandling(testCase.context);
  const classifierCalled=cue&&!factual;
  const humour=classifierCalled?await humourBelongs(testCase.context):!cue;
  const decision=cue&&!humour?'none':'meme';
  rows.push({
    id:testCase.id,
    intent_label:testCase.intent_label,
    case_origin:testCase.case_origin,
    factual_guard:factual,
    serious_cue:cue,
    classifier_called:classifierCalled,
    decision,
    correct_abstention:testCase.intent_label==='no_meme'&&decision==='none',
    inappropriate_joking:testCase.intent_label==='no_meme'&&decision==='meme',
    false_abstention:testCase.intent_label==='humour'&&decision==='none',
    duration_ms:Math.round(performance.now()-started)
  });
}
const humour=rows.filter(row=>row.intent_label==='humour');
const noMeme=rows.filter(row=>row.intent_label==='no_meme');
const rate=(records,key)=>records.length?records.filter(row=>row[key]).length/records.length:0;
const metrics={
  correct_abstention:rate(noMeme,'correct_abstention'),
  inappropriate_joking:rate(noMeme,'inappropriate_joking'),
  humour_recall:1-rate(humour,'false_abstention'),
  false_abstention:rate(humour,'false_abstention'),
  cue_rate:rows.filter(row=>row.serious_cue).length/rows.length,
  classifier_call_rate:rows.filter(row=>row.classifier_called).length/rows.length
};
const report={version:'stage-3000-safety-gate-v1',created_at:new Date().toISOString(),input_hash:createHash('sha256').update(casesText).digest('hex'),labels:'mixed_prior_shadow_and_synthetic_pending_owner_review',human_validated:false,cases:rows.length,metrics,rows};
const summary={...report};
delete summary.rows;
await mkdir(resolve(root,'eval/results'),{recursive:true});
await Promise.all([
  writeFile(resolve(root,'eval/results/stage-3000-safety-gate.json'),`${JSON.stringify(report,null,2)}\n`),
  writeFile(resolve(root,'eval/stage-3000-safety-gate-summary.json'),`${JSON.stringify(summary,null,2)}\n`)
]);
console.log(JSON.stringify(metrics,null,2));
