import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {selectStage3000EvalTargets,validateFreshStage3000Humour} from './stage-3000-eval-lib.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const valueFor=(name,fallback)=>{
  const index=args.indexOf(name);
  return index===-1?fallback:args[index+1];
};
const reviewedPath=resolve(root,valueFor('--reviewed','expansion/reviewed/stage-3000.jsonl'));
const outputPath=resolve(root,valueFor('--output','eval/relevance_stage3000_fresh_humour.jsonl'));
const model=valueFor('--model','qwen3:4b');
const endpoint=valueFor('--endpoint','http://127.0.0.1:11434/api/chat');
const parseJsonl=(text,label)=>text.trim().split('\n').filter(Boolean).map((line,index)=>{
  try { return JSON.parse(line); }
  catch { throw new Error(`${label} has invalid JSON on line ${index+1}.`); }
});

let reviewedText;
try { reviewedText=await readFile(reviewedPath,'utf8'); }
catch(error) {
  if(error?.code==='ENOENT') throw new Error('Stage-3,000 reviewed metadata is not ready. Run this generator after expansion/reviewed/stage-3000.jsonl exists.');
  throw error;
}
const reviewed=parseJsonl(reviewedText,'stage-3,000 reviewed metadata');
const targets=selectStage3000EvalTargets(reviewed);
const prior=parseJsonl(await readFile(resolve(root,'eval/relevance_stage1000_shadow_v1.jsonl'),'utf8'),'stage-1,000 shadow evaluation');
const schema={
  type:'object',additionalProperties:false,required:['cases'],properties:{cases:{type:'array',items:{type:'object',additionalProperties:false,required:['primary_target_id','title','context','failure_modes'],properties:{primary_target_id:{type:'string'},title:{type:'string'},context:{type:'string'},failure_modes:{type:'array',minItems:1,maxItems:3,items:{type:'string'}}}}}}
};
const generated=[];
for(let offset=0;offset<targets.length;offset+=10) {
  const batch=targets.slice(offset,offset+10);
  const compact=batch.map(({id,name,message,relational_pattern,example_context,near_miss_context,tags})=>({id,name,message,relational_pattern,example_context,near_miss_context,tags}));
  const prompt=`Create one independent meme-relevance evaluation case for every supplied record. Preserve every primary_target_id exactly. Write a fresh, natural social situation in which a person would genuinely send that exact meme. Do not mention the meme or copy/paraphrase its example_context, message, or name. Vary relationships and settings across work, family, friendship, internet, and everyday life. The context must contain enough relational detail to distinguish the intended meme from merely topical matches. The title should describe the situation, not the template. failure_modes should name one to three concrete likely retrieval mistakes. Return exactly ${batch.length} cases in the same order.\n\nRecords:\n${JSON.stringify(compact)}`;
  const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(120000),body:JSON.stringify({model,stream:false,think:false,format:schema,options:{temperature:0.45,num_ctx:12288},messages:[{role:'user',content:prompt}]})});
  if(!response.ok) throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
  const payload=await response.json();
  const parsed=JSON.parse(payload?.message?.content??'null');
  if(!Array.isArray(parsed?.cases)||parsed.cases.length!==batch.length) throw new Error(`Ollama returned ${parsed?.cases?.length??0} cases for a ${batch.length}-record batch.`);
  for(const [index,draft] of parsed.cases.entries()) {
    const target=batch[index];
    if(draft.primary_target_id!==target.id) throw new Error(`Ollama changed or reordered target ${target.id}.`);
    generated.push({
      id:`eval-stage3000-fresh-humour-${String(generated.length+1).padStart(3,'0')}`,
      title:draft.title,
      context:draft.context,
      intent_label:'humour',
      primary_target_id:target.id,
      acceptable_ids:[target.id],
      failure_modes:draft.failure_modes,
      review_status:'pending_owner_review',
      human_validated:false
    });
  }
}
const summary=validateFreshStage3000Humour(generated,{targetIds:new Set(targets.map(record=>record.id)),excludedContexts:prior.map(row=>row.context)});
await writeFile(outputPath,`${generated.map(row=>JSON.stringify(row)).join('\n')}\n`);
console.log(JSON.stringify({status:'generated',model,output:outputPath,...summary},null,2));
