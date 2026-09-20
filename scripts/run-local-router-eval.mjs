import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const model=process.argv[2]??'qwen3:4b';
const endpoint=(process.argv[3]??'http://127.0.0.1:11434').replace(/\/$/,'');
const cases=parseJsonl(await readFile(resolve(root,'eval/relevance_holdout_v1.jsonl'),'utf8'),'relevance holdout');
const schema={
  type:'object',
  additionalProperties:false,
  properties:{
    decision:{type:'string',enum:['meme','none']},
    confidence:{type:'string',enum:['high','medium','low']},
    reason:{type:'string'}
  },
  required:['decision','confidence','reason']
};
const rows=[];

for(const testCase of cases) {
  const started=performance.now();
  const response=await fetch(`${endpoint}/api/chat`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      model,
      stream:false,
      think:false,
      format:schema,
      options:{temperature:0,seed:927},
      messages:[
        {role:'system',content:'Decide whether a meme reaction is socially appropriate for the situation. Choose meme when the situation is explicitly playful, absurd, ironic, boastful, frustrating, or otherwise naturally invites humour. Choose none for serious help, safety, medical, legal, grief, apology, factual guidance, or support after harm. Take the situation at face value and do not invent joking intent. Return only the schema.'},
        {role:'user',content:testCase.context}
      ]
    })
  });
  if(!response.ok) throw new Error(`${testCase.id} failed with HTTP ${response.status}: ${await response.text()}`);
  const payload=await response.json();
  const parsed=JSON.parse(payload.message?.content??'');
  if(!['meme','none'].includes(parsed.decision)) throw new Error(`${testCase.id} returned an invalid decision.`);
  const durationMs=Math.round(performance.now()-started);
  const expected=testCase.intent_label==='humour'?'meme':'none';
  rows.push({
    id:testCase.id,
    title:testCase.title,
    intent_label:testCase.intent_label,
    expected,
    decision:parsed.decision,
    confidence:parsed.confidence,
    reason:parsed.reason,
    correct:parsed.decision===expected,
    duration_ms:durationMs,
    eval_count:payload.eval_count,
    eval_duration:payload.eval_duration
  });
  console.log(`${testCase.id} ${expected} -> ${parsed.decision}`);
}

const percentile=(values,fraction)=>{
  const ordered=[...values].sort((a,b)=>a-b);
  return ordered[Math.min(ordered.length-1,Math.ceil(ordered.length*fraction)-1)];
};
const humour=rows.filter(row=>row.intent_label==='humour');
const noMeme=rows.filter(row=>row.intent_label==='no_meme');
const rate=(values,key)=>values.filter(row=>row[key]).length/values.length;
const metrics={
  accuracy:rate(rows,'correct'),
  humour_recall:rate(humour,'correct'),
  correct_abstention:rate(noMeme,'correct'),
  latency_ms:{
    p50:percentile(rows.map(row=>row.duration_ms),0.5),
    p95:percentile(rows.map(row=>row.duration_ms),0.95)
  }
};
const report={
  version:'local-router-draft-v1',
  created_at:new Date().toISOString(),
  model,
  labels:'assistant-authored_pending_owner_review',
  human_validated:false,
  task:'meme_vs_none_social_suitability',
  cases:cases.length,
  metrics,
  rows
};
const slug=model.replace(/[^a-z0-9]+/giu,'-').replace(/^-|-$/g,'').toLowerCase();
await mkdir(resolve(root,'eval/results'),{recursive:true});
await writeFile(resolve(root,`eval/results/local-router-${slug}.json`),`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify(metrics,null,2));
