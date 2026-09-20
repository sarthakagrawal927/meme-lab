import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl} from '../src/expansion.mjs';
import {humourBelongs,needsSeriousHandling,requiresFactualAnswer} from '../worker/src/classification.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dataset=process.argv[2]??'shadow';
if(!['primary','shadow'].includes(dataset)) throw new Error(`Unsupported safety dataset: ${dataset}.`);
const casesText=await readFile(resolve(root,`eval/relevance_stage1000${dataset==='shadow'?'_shadow':''}_v1.jsonl`),'utf8');
const cases=parseJsonl(casesText,`${dataset} stage-1000 safety evaluation`);
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
const rate=(records,key)=>records.filter(row=>row[key]).length/records.length;
const metrics={
  correct_abstention:rate(noMeme,'correct_abstention'),
  inappropriate_joking:rate(noMeme,'inappropriate_joking'),
  humour_recall:1-rate(humour,'false_abstention'),
  false_abstention:rate(humour,'false_abstention'),
  cue_rate:rows.filter(row=>row.serious_cue).length/rows.length,
  classifier_call_rate:rows.filter(row=>row.classifier_called).length/rows.length
};
const suffix=dataset==='shadow'?'shadow-safety-gate':'safety-gate';
const report={version:`stage-1000-${suffix}-v1`,created_at:new Date().toISOString(),input_hash:createHash('sha256').update(casesText).digest('hex'),labels:'assistant-authored_pending_owner_review',human_validated:false,cases:rows.length,metrics,rows};
const summary={...report};
delete summary.rows;
await mkdir(resolve(root,'eval/results'),{recursive:true});
await Promise.all([
  writeFile(resolve(root,`eval/results/stage-1000-${suffix}.json`),`${JSON.stringify(report,null,2)}\n`),
  writeFile(resolve(root,`eval/stage-1000-${suffix}-summary.json`),`${JSON.stringify(summary,null,2)}\n`)
]);
console.log(JSON.stringify(metrics,null,2));
