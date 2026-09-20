import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  load_image
} from '@huggingface/transformers';
import {parseJsonl} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const valueFor=(name,fallback)=>{
  const index=args.indexOf(name);
  return index===-1?fallback:args[index+1];
};
const limit=Number(valueFor('--limit','0'));
const start=Math.max(0,Number(valueFor('--start','0')));
const batchSize=Math.max(1,Math.min(16,Number(valueFor('--batch-size','8'))));
const output=resolve(root,valueFor('--output','results/stage-3000-local-signals.jsonl'));
const modelId=valueFor('--model','Xenova/clip-vit-base-patch32');

const clamp=(value,minimum=0,maximum=100)=>Math.max(minimum,Math.min(maximum,value));
const round=value=>Math.round(value);
const normalize=values=>{
  let magnitude=0;
  for(const value of values) magnitude+=value*value;
  magnitude=Math.sqrt(magnitude)||1;
  return Array.from(values,value=>value/magnitude);
};
const dot=(left,right)=>{
  let total=0;
  for(let index=0;index<left.length;index+=1) total+=left[index]*right[index];
  return total;
};
const softmaxGroup=(imageEmbedding,textEmbeddings,positiveIndexes,negativeIndexes)=>{
  const indexes=[...positiveIndexes,...negativeIndexes];
  const logits=indexes.map(index=>dot(imageEmbedding,textEmbeddings[index])*18);
  const maximum=Math.max(...logits);
  const probabilities=logits.map(value=>Math.exp(value-maximum));
  const denominator=probabilities.reduce((sum,value)=>sum+value,0);
  return probabilities.slice(0,positiveIndexes.length).reduce((sum,value)=>sum+value,0)/denominator;
};
const sleep=milliseconds=>new Promise(resolvePromise=>setTimeout(resolvePromise,milliseconds));
const loadWithRetry=async url=>{
  let latestError;
  for(let attempt=1;attempt<=3;attempt+=1) {
    try { return await load_image(url); }
    catch(error) {
      latestError=error;
      if(attempt<3) await sleep(400*attempt);
    }
  }
  throw latestError;
};

const live=JSON.parse(await readFile(resolve(root,'worker/public/collection.json'),'utf8'));
const source=parseJsonl(await readFile(resolve(root,'expansion/sources/stage-3000-source.jsonl'),'utf8'),'stage-3000 source');
const uniqueness=JSON.parse(await readFile(resolve(root,'expansion/sources/stage-3000-uniqueness-report.json'),'utf8'));
const blocked=new Set(uniqueness.summary.blocked_target_ids);
let records=[
  ...live.filter(record=>record.image_url).map(record=>({
    id:record.id,
    name:record.name,
    image_url:record.image_url,
    provider:'live-catalogue',
    scope:'reference',
    image_width:null,
    image_height:null
  })),
  ...source.filter(record=>!blocked.has(record.proposed_id)).map(record=>({
    id:record.proposed_id,
    name:record.name,
    image_url:record.image_url,
    provider:record.provider,
    scope:'target',
    image_width:record.image_width??null,
    image_height:record.image_height??null
  }))
];
if(start>0) records=records.slice(start);
if(limit>0) records=records.slice(0,limit);

const prompts=[
  'a recognizable reaction meme with a clear human emotion',
  'a versatile meme template for an online conversation',
  'a funny expressive scene with an obvious social reaction',
  'a museum catalogue photograph of a decorative object',
  'an artwork with no clear human reaction or social situation',
  'a generic image that would be confusing as a meme reply',
  'a clear well-composed image with an easy-to-read subject',
  'a visually distinctive image with a strong focal point',
  'a cluttered image with an unclear subject',
  'a damaged blurry or illegible image'
];

console.error(`Loading local ${modelId} text and vision encoders…`);
const [tokenizer,processor,textModel,visionModel]=await Promise.all([
  AutoTokenizer.from_pretrained(modelId),
  AutoProcessor.from_pretrained(modelId),
  CLIPTextModelWithProjection.from_pretrained(modelId,{dtype:'q8'}),
  CLIPVisionModelWithProjection.from_pretrained(modelId,{dtype:'q8'})
]);
const textInputs=tokenizer(prompts,{padding:true,truncation:true});
const {text_embeds:textTensor}=await textModel(textInputs);
const textEmbeddings=[];
for(let index=0;index<prompts.length;index+=1) textEmbeddings.push(normalize(textTensor.data.slice(index*512,(index+1)*512)));

const completed=[];
const failures=[];
for(let offset=0;offset<records.length;offset+=batchSize) {
  const batch=records.slice(offset,offset+batchSize);
  const loaded=await Promise.all(batch.map(async record=>{
    try { return {record,image:await loadWithRetry(record.image_url)}; }
    catch(error) { failures.push({id:record.id,image_url:record.image_url,error:error.message}); return null; }
  }));
  const successful=loaded.filter(Boolean);
  if(successful.length>0) {
    const imageInputs=await processor(successful.map(item=>item.image));
    const {image_embeds:imageTensor}=await visionModel(imageInputs);
    const dimensions=imageTensor.dims.at(-1);
    for(const [index,item] of successful.entries()) {
      const embedding=normalize(imageTensor.data.slice(index*dimensions,(index+1)*dimensions));
      const reactionFit=softmaxGroup(embedding,textEmbeddings,[0,1,2],[3,4,5]);
      const clarityFit=softmaxGroup(embedding,textEmbeddings,[6,7],[8,9]);
      const width=item.record.image_width??item.image.width;
      const height=item.record.image_height??item.image.height;
      const shortest=Math.max(1,Math.min(width,height));
      const resolutionFit=clamp((Math.log2(shortest)-7)*22)/100;
      const ratio=Math.max(width,height)/Math.max(1,Math.min(width,height));
      const aspectFit=clamp(105-(ratio-1)*28)/100;
      const recognizability=item.record.provider==='JustMeme.wtf'?0.92:item.record.provider==='live-catalogue'?0.9:0.38;
      const memeStrength=round(100*(reactionFit*0.58+recognizability*0.27+clarityFit*0.15));
      const assetQuality=round(100*(resolutionFit*0.48+aspectFit*0.22+clarityFit*0.3));
      completed.push({
        id:item.record.id,
        name:item.record.name,
        scope:item.record.scope,
        provider:item.record.provider,
        width,
        height,
        reaction_fit:round(reactionFit*100),
        clarity_fit:round(clarityFit*100),
        meme_strength:clamp(memeStrength),
        asset_quality:clamp(assetQuality),
        embedding
      });
    }
  }
  const done=Math.min(offset+batchSize,records.length);
  console.error(`Embedded ${done}/${records.length}; failures ${failures.length}.`);
  if(done%80===0||done===records.length) {
    await mkdir(dirname(output),{recursive:true});
    await writeFile(output,`${completed.map(record=>JSON.stringify(record)).join('\n')}\n`);
    await writeFile(`${output}.failures.json`,`${JSON.stringify({model:modelId,records:records.length,completed:completed.length,failures},null,2)}\n`);
  }
}

console.log(JSON.stringify({
  status:failures.length?'completed_with_failures':'completed',
  model:modelId,
  records:records.length,
  completed:completed.length,
  failures:failures.length,
  output
},null,2));
