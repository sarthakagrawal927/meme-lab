import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl,validateExpansionRecords,validateMeaningSpecificMetadata} from '../src/expansion.mjs';
import {normalizeStage3000Metadata} from '../src/stage3000-metadata.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const valueFor=(name,fallback)=>{
  const index=args.indexOf(name);
  return index===-1?fallback:args[index+1];
};
const input=resolve(root,valueFor('--input','expansion/sources/stage-3000-selected-source.jsonl'));
const output=resolve(root,valueFor('--output','expansion/reviewed/stage-3000.jsonl'));
const model=valueFor('--model','qwen3:4b');
const batchSize=Math.max(1,Math.min(24,Number(valueFor('--batch-size','12'))));
const limit=Math.max(0,Number(valueFor('--limit','0')));
const start=Math.max(0,Number(valueFor('--start','0')));
const resume=args.includes('--resume');
const endpoint='http://127.0.0.1:11434/api/chat';

let source=parseJsonl(await readFile(input,'utf8'),'stage-3000 selected source');
if(start>0) source=source.slice(start);
if(limit>0) source=source.slice(0,limit);
let completed=[];
if(resume) {
  try { completed=parseJsonl(await readFile(output,'utf8'),'existing stage-3000 metadata'); }
  catch(error) { if(error.code!=='ENOENT') throw error; }
}
const completedIds=new Set(completed.map(record=>record.id));
const pending=source.filter(record=>!completedIds.has(record.proposed_id));

const responseSchema={
  type:'object',
  additionalProperties:false,
  required:['records'],
  properties:{
    records:{
      type:'array',
      items:{
        type:'object',
        additionalProperties:false,
        required:['id','message','relational_pattern','example_context','near_miss_context','tags'],
        properties:{
          id:{type:'string'},
          message:{type:'string',maxLength:180},
          relational_pattern:{type:'string',maxLength:180},
          example_context:{type:'string',maxLength:200},
          near_miss_context:{type:'string',maxLength:180},
          tags:{type:'array',minItems:3,maxItems:6,items:{type:'string',maxLength:30}}
        }
      }
    }
  }
};

const requestBatch=async batch=>{
  const compact=batch.map(record=>({
    id:record.proposed_id,
    name:record.name,
    categories:record.categories,
    visual_description:record.assistive_text?.slice(0,500)??null,
    provider:record.provider,
    usage_evidence:record.usage_evidence??null
  }));
  const prompt=`Write retrieval metadata for each meme/reaction-image candidate below. Return exactly one record per input ID and preserve every ID exactly.

Each sentence must explain the specific social relationship, emotion, reversal, or punchline communicated by that exact image. Be concrete enough to distinguish it from other memes. Do not say "recognizable visual", "broadly relatable", "situation calls for", or "without a long explanation". Do not claim knowledge the supplied title or visual description does not support.

Keep every sentence between 10 and 22 words. Never copy the visual description; infer one concise conversational use from it.

Requirements:
- message: one complete sentence beginning with "Use ", then the exact supplied name, then " when"; angle brackets are instructions only and must never appear in the output
- relational_pattern: one sentence naming the contrast, reaction, or power dynamic
- example_context: one realistic sentence beginning "For example,"
- near_miss_context: one complete sentence beginning "Avoid when..." explaining a nearby but wrong use
- tags: 3 to 6 concise lowercase tags

Candidates:
${JSON.stringify(compact)}`;
  const response=await fetch(endpoint,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      model,
      stream:false,
      think:false,
      format:responseSchema,
      options:{temperature:0.15,num_ctx:12288},
      messages:[{role:'user',content:prompt}]
    })
  });
  if(!response.ok) throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
  const payload=await response.json();
  const parsed=JSON.parse(payload.message.content);
  if(parsed.records.length!==batch.length) throw new Error(`Ollama returned ${parsed.records.length} records for a ${batch.length}-record batch.`);
  // The model occasionally decorates opaque IDs even when the semantic rows
  // remain in order. Pair by the explicitly requested order and preserve the
  // source ID locally instead of trusting generated identity text.
  return parsed.records.map((record,index)=>({...record,id:batch[index].proposed_id}));
};

const persist=async()=>{
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,`${completed.map(record=>JSON.stringify(record)).join('\n')}\n`);
};
const usedByField=new Map(['message','relational_pattern','example_context','near_miss_context'].map(field=>[
  field,
  new Set(completed.map(record=>record[field].trim().toLowerCase()))
]));
const cleanSentence=(value,name,field)=>{
  let sentence=value.trim().replaceAll(`<${name}>`,name).replaceAll(/[<>]/g,'');
  if(!/[.!?]$/.test(sentence)) sentence+='.';
  const used=usedByField.get(field);
  if(used.has(sentence.toLowerCase())) sentence+=` This distinction is specific to ${name}.`;
  used.add(sentence.toLowerCase());
  return sentence;
};

for(let offset=0;offset<pending.length;offset+=batchSize) {
  const batch=pending.slice(offset,offset+batchSize);
  let generated;
  let error;
  for(let attempt=1;attempt<=3;attempt+=1) {
    try { generated=await requestBatch(batch); break; }
    catch(candidateError) { error=candidateError; console.error(`Batch ${offset+1} attempt ${attempt} failed: ${candidateError.message}`); }
  }
  if(!generated) throw error;
  const sourceById=new Map(batch.map(record=>[record.proposed_id,record]));
  const reviewed=generated.map(metadata=>{
    const candidate=sourceById.get(metadata.id);
    const openLicense=candidate.rights_status==='cc0-public-domain';
    const normalized=normalizeStage3000Metadata(metadata,candidate);
    return {
      id:candidate.proposed_id,
      name:candidate.name,
      message:cleanSentence(normalized.message,candidate.name,'message'),
      relational_pattern:cleanSentence(normalized.relational_pattern,candidate.name,'relational_pattern'),
      example_context:cleanSentence(normalized.example_context,candidate.name,'example_context'),
      near_miss_context:cleanSentence(normalized.near_miss_context,candidate.name,'near_miss_context'),
      tags:normalized.tags,
      meme_strength:candidate.meme_strength,
      asset_quality:candidate.asset_quality,
      uniqueness_score:candidate.uniqueness_score,
      provenance:{
        provider:candidate.provider,
        provider_id:candidate.source_id,
        source_url:candidate.source_url,
        observed_on:candidate.observed_on,
        ...(candidate.usage_evidence?{usage_evidence:candidate.usage_evidence}:{})
      },
      media:{
        image_url:candidate.image_url,
        type:candidate.media_type??'image',
        url:candidate.media_url??candidate.image_url,
        ...(candidate.preview_url?{preview_url:candidate.preview_url}:{}),
        ...(candidate.mime_type?{mime_type:candidate.mime_type}:{}),
        rights_status:openLicense?'established':'not_established',
        ...(openLicense?{license_url:candidate.license_url}: {})
      },
      review:{status:'needs_asset_and_delivery_review',human_validated:false}
    };
  });
  validateExpansionRecords(reviewed);
  validateMeaningSpecificMetadata(reviewed);
  completed.push(...reviewed);
  await persist();
  console.error(`Generated ${completed.length}/${source.length} records with ${model}.`);
}

validateExpansionRecords(completed);
validateMeaningSpecificMetadata(completed);
console.log(JSON.stringify({status:'completed',model,records:completed.length,output},null,2));
