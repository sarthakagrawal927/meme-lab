import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseJsonl} from '../src/expansion.mjs';
import {summarizeDialogueScreeningModel} from '../src/dialogue-expansion.mjs';

const root=resolve(import.meta.dirname,'..');
const input=resolve(root,'expansion/sources/dialogue-wikiquote-pilot.jsonl');
const output=resolve(root,'expansion/sources/dialogue-wikiquote-local-review.jsonl');
const summaryOutput=resolve(root,'expansion/sources/dialogue-wikiquote-local-review-summary.json');
const model=process.env.DIALOGUE_REVIEW_MODEL??'qwen3:4b';
const endpoint=process.env.OLLAMA_URL??'http://127.0.0.1:11434/api/chat';
const reviewLimit=Math.max(32,Number(process.env.DIALOGUE_REVIEW_LIMIT??'256'));
const promptVersion='dialogue-quality-v3-single-item-anchors';

const inputText=await readFile(input,'utf8');
const records=parseJsonl(inputText,'Wikiquote dialogue pilot');
const byFilm=new Map();
for(const record of records) {
  const rows=byFilm.get(record.work_title)??[];
  rows.push(record);
  byFilm.set(record.work_title,rows);
}
const fullReviewSample=[];
for(const rows of [...byFilm.values()]) {
  const ordered=[...rows].sort((left,right)=>right.screening.screening_score-left.screening.screening_score||left.id.localeCompare(right.id));
  fullReviewSample.push(ordered[0]);
  if(ordered.length>1) fullReviewSample.push(ordered[Math.floor(ordered.length/2)]);
}
const sampleSize=Math.min(reviewLimit,fullReviewSample.length);
const reviewSample=Array.from({length:sampleSize},(_,index)=>fullReviewSample[Math.round(index*(fullReviewSample.length-1)/Math.max(1,sampleSize-1))]);

let completed=[];
try { completed=parseJsonl(await readFile(output,'utf8'),'Local dialogue reviews'); }
catch(error) { if(error.code!=='ENOENT') throw error; }
const sampleIds=new Set(reviewSample.map(record=>record.id));
if(completed.some(review=>review.model!==model||review.prompt_version!==promptVersion)) throw new Error('Existing dialogue review output does not match the current model or prompt.');
completed=completed.filter(review=>sampleIds.has(review.id));
const completedIds=new Set(completed.map(review=>review.id));

const schema={
  type:'object',
  additionalProperties:false,
  properties:{
    keep:{type:'boolean'},
    standalone:{type:'string',enum:['strong','usable','dependent']},
    strength:{type:'string',enum:['memorable','solid','generic']},
    reason:{type:'string',minLength:8,maxLength:120}
  },
  required:['keep','standalone','strength','reason']
};

const systemPrompt=`You are a strict reaction-dialogue curator. Judge only the supplied words as something a person would send in response to a situation. Keep only lines that are naturally reusable without knowing the film scene. A line may be understandable but still reject-worthy when it is generic, logistical, expository, or depends on unexplained people or objects. Standalone is strong, usable, or dependent. Strength is memorable, solid, or generic. Do not reward fame. Strong examples: "Aw, don't be a sucker!", "Nothin' on here works smooth.", "Oh, that sinking feeling.", and "Come out with your hands up! You're... mostly surrounded!". Reject examples: "What do you think, babe?", "What did they say, Rudy?", "Yes, I know. But what's in it?", and "It doesn't matter now." Give one complete reason under 18 words without inventing scene details.`;

function normalizeReview(value,record) {
  if(!value||typeof value!=='object'||typeof value.keep!=='boolean') throw new Error(`${record.id} needs a keep decision.`);
  if(!['strong','usable','dependent'].includes(value.standalone)) throw new Error(`${record.id} has an invalid standalone label.`);
  if(!['memorable','solid','generic'].includes(value.strength)) throw new Error(`${record.id} has an invalid strength label.`);
  if(typeof value.reason!=='string'||value.reason.trim().length<8||value.reason.trim().length>180) throw new Error(`${record.id} needs a short reason.`);
  const standalonePoints={strong:100,usable:60,dependent:0}[value.standalone];
  const strengthPoints={memorable:100,solid:60,generic:0}[value.strength];
  const rawScore=Math.round((standalonePoints+strengthPoints)/2);
  const qualityScore=value.keep?Math.max(45,rawScore):Math.min(44,rawScore);
  return {
    id:record.id,
    keep:value.keep,
    standalone:value.standalone,
    strength:value.strength,
    reason:value.reason.trim(),
    quality_score:qualityScore,
    passes_quality_gate:value.keep&&value.standalone!=='dependent'&&value.strength!=='generic',
    human_validated:false,
    work_title:record.work_title,
    speaker:record.speaker,
    quote:record.quote,
    structural_score:record.screening.screening_score,
    model,
    prompt_version:promptVersion
  };
}

async function scoreRecord(record,attempt=1) {
  const response=await fetch(endpoint,{
    method:'POST',
    headers:{'content-type':'application/json'},
    signal:AbortSignal.timeout(120_000),
    body:JSON.stringify({
      model,
      stream:false,
      think:false,
      keep_alive:'15m',
      options:{temperature:0,seed:42,num_ctx:2048},
      format:schema,
      messages:[
        {role:'system',content:systemPrompt},
        {role:'user',content:record.quote}
      ]
    })
  });
  if(!response.ok) throw new Error(`Ollama returned HTTP ${response.status}: ${(await response.text()).slice(0,300)}`);
  try {
    const payload=await response.json();
    return normalizeReview(JSON.parse(payload.message?.content??''),record);
  } catch(error) {
    if(attempt<2) return scoreRecord(record,attempt+1);
    throw error;
  }
}

for(const [index,record] of reviewSample.entries()) {
  if(completedIds.has(record.id)) continue;
  const review=await scoreRecord(record);
  completed.push(review);
  completedIds.add(review.id);
  await writeFile(output,`${completed.map(row=>JSON.stringify(row)).join('\n')}\n`);
  if((index+1)%8===0||index+1===reviewSample.length) console.error(`Locally reviewed ${completed.length}/${reviewSample.length}.`);
}

const passed=completed.filter(review=>review.passes_quality_gate);
const averageScore=completed.length?Number((completed.reduce((sum,review)=>sum+review.quality_score,0)/completed.length).toFixed(3)):0;
const behavior=summarizeDialogueScreeningModel(completed);
const summary={
  version:'wikiquote-dialogue-local-review-v3',
  created_at:new Date().toISOString(),
  model,
  prompt_version:promptVersion,
  input_hash:createHash('sha256').update(inputText).digest('hex'),
  sample_strategy:'up to two deterministic records per film: highest structural score and median structural score; one model request per line',
  sampled_films:new Set(reviewSample.map(record=>record.work_title)).size,
  human_validated:false,
  reviewed:completed.length,
  passed:passed.length,
  pass_rate:Number((passed.length/Math.max(1,completed.length)).toFixed(4)),
  average_quality_score:averageScore,
  model_behavior:behavior,
  uncertainty:'Local-model ratings are an inexpensive screening experiment, not human labels or proof of cultural recognition, legal reuse, factual attribution, or query relevance.',
  review_examples:{
    strongest:[...completed].sort((left,right)=>right.quality_score-left.quality_score||left.id.localeCompare(right.id)).slice(0,30),
    weakest:[...completed].sort((left,right)=>left.quality_score-right.quality_score||left.id.localeCompare(right.id)).slice(0,30)
  }
};
await writeFile(summaryOutput,`${JSON.stringify(summary,null,2)}\n`);
console.log(JSON.stringify({status:behavior.status,model,prompt_version:promptVersion,sampled_films:summary.sampled_films,reviewed:completed.length,passed:passed.length,pass_rate:summary.pass_rate,average_quality_score:averageScore,model_behavior:behavior,output,summary:summaryOutput},null,2));
