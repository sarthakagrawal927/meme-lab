import {createReadStream} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  cleanReactionGifOcr,
  isUsefulReactionText,
  gifMeetsReleaseResolution,
  parseReactionGifTags,
  parseGifDimensions,
  rankReactionGifCandidates,
  reactionGifSelectionPatterns
} from '../src/reaction-gif-selection.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const valueFor=(name,fallback)=>{
  const index=args.indexOf(name);
  return index===-1?fallback:args[index+1];
};
const datasetPath=resolve(valueFor('--dataset',''));
const metadataPath=resolve(valueFor('--metadata',''));
const mappingPath=resolve(valueFor('--mapping',''));
const outputPath=resolve(root,valueFor('--output','expansion/sources/stage-3000-reaction-gifs.jsonl'));
const reportPath=resolve(root,valueFor('--report','expansion/sources/stage-3000-reaction-gifs-report.json'));
const limit=Math.max(1,Number(valueFor('--limit','1189')));
const maxPerSemanticKey=Math.max(1,Number(valueFor('--max-per-semantic-key',String(limit))));
const minimumUses=Math.max(1,Number(valueFor('--minimum-uses','1')));
const selectionMode=valueFor('--selection','popularity');
const observedOn=valueFor('--observed-on',new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date()));
const validateMedia=args.includes('--validate-media');

if(!datasetPath||!metadataPath||!mappingPath) {
  throw new Error('Usage: node scripts/acquire-reaction-gifs.mjs --dataset PATH --metadata PATH --mapping PATH [--limit 1189]');
}

function parseCsvLine(line) {
  const values=[];
  let value='';
  let quoted=false;
  for(let index=0;index<line.length;index+=1) {
    const character=line[index];
    if(character==='"') {
      if(quoted&&line[index+1]==='"') { value+='"';index+=1; }
      else quoted=!quoted;
    } else if(character===','&&!quoted) { values.push(value);value=''; }
    else value+=character;
  }
  values.push(value);
  return values;
}

async function eachLine(path,callback) {
  let first=true;
  for await(const line of createInterface({input:createReadStream(path),crlfDelay:Infinity})) {
    if(first) { first=false;continue; }
    if(line) await callback(line);
  }
}

const {unsafe}=reactionGifSelectionPatterns;
const usefulText=isUsefulReactionText;
const titleCase=value=>value.replaceAll(/\b\w/g,character=>character.toUpperCase());
const slug=value=>value.toLowerCase().replaceAll(/[^a-z0-9]+/g,'-').replaceAll(/^-|-$/g,'').slice(0,48);

const usageCounts=new Map();
await eachLine(datasetPath,line=>{
  const columns=line.split(',');
  const gifId=columns[2];
  if(gifId) usageCounts.set(gifId,(usageCounts.get(gifId)??0)+1);
});

const giphyByGif=new Map();
await eachLine(mappingPath,line=>{
  const separator=line.indexOf(',');
  if(separator===-1) return;
  const gifId=line.slice(0,separator);
  const giphyId=line.slice(separator+1).trim();
  if(gifId&&giphyId) giphyByGif.set(gifId,giphyId);
});

const candidates=[];
await eachLine(metadataPath,line=>{
  const [gifId,tagsRaw='',ocrRaw='']=parseCsvLine(line);
  const giphyId=giphyByGif.get(gifId);
  const usageCount=usageCounts.get(gifId)??0;
  if(!giphyId||usageCount===0) return;
  const tags=parseReactionGifTags(tagsRaw).filter(usefulText).slice(0,6);
  const ocr=cleanReactionGifOcr(ocrRaw);
  if((tags.length===0&&!usefulText(ocr))||unsafe.test(`${tags.join(' ')} ${ocr}`)) return;
  candidates.push({gifId,giphyId,usageCount,tags,ocr});
});
candidates.sort((left,right)=>right.usageCount-left.usageCount||left.giphyId.localeCompare(right.giphyId));

const canonicalJeff={
  giphyId:'S2E0EucjhwJR6X9PBW',
  name:'My Name Is Jeff',
  tags:['my name is jeff','22 jump street','awkward introduction','fake identity','channing tatum'],
  ocr:'My name is Jeff.',
  sourceUrl:'https://giphy.com/gifs/my-name-is-jeff-edwin-S2E0EucjhwJR6X9PBW/',
  evidence:{kind:'owner_requested_canonical',reference:'https://tenor.com/view/my-name-is-jeff-gif-22841539'}
};
const sourcePool=candidates.filter(candidate=>candidate.giphyId!==canonicalJeff.giphyId);
const qualityPoolLimit=validateMedia?Math.min(sourcePool.length,Math.max(limit*2,limit+250)):Math.max(limit-1,1);
const qualitySelection=selectionMode==='quality'
  ?rankReactionGifCandidates(sourcePool,{limit:qualityPoolLimit,maxPerSemanticKey,minimumUses})
  :null;
if(!['popularity','quality'].includes(selectionMode)) throw new Error(`Unknown selection mode: ${selectionMode}.`);
const rankedPool=[canonicalJeff,...(qualitySelection?.selected??sourcePool)];
let selected=rankedPool.slice(0,limit);
let unavailableMedia=0;
let lowResolutionMedia=0;
if(validateMedia) {
  selected=[];
  for(let offset=0;offset<rankedPool.length&&selected.length<limit;offset+=25) {
    const batch=rankedPool.slice(offset,offset+25);
    const checked=await Promise.all(batch.map(async candidate=>{
      const mediaUrl=`https://i.giphy.com/media/${candidate.giphyId}/giphy.gif`;
      try {
        const response=await fetch(mediaUrl,{headers:{range:'bytes=0-9'},signal:AbortSignal.timeout(10000)});
        if(!response.ok||!response.headers.get('content-type')?.includes('image/gif')||!response.body) return {status:'unavailable'};
        const reader=response.body.getReader();
        const prefix=new Uint8Array(10);
        let received=0;
        while(received<prefix.length) {
          const chunk=await reader.read();
          if(chunk.done) break;
          const length=Math.min(chunk.value.length,prefix.length-received);
          prefix.set(chunk.value.slice(0,length),received);
          received+=length;
        }
        await reader.cancel();
        const dimensions=parseGifDimensions(prefix.slice(0,received));
        if(!dimensions) return {status:'unavailable'};
        if(!gifMeetsReleaseResolution(dimensions)) return {status:'low_resolution'};
        return {status:'ready',candidate:{...candidate,assetDimensions:dimensions}};
      } catch { return null; }
    }));
    unavailableMedia+=checked.filter(result=>result===null||result.status==='unavailable').length;
    lowResolutionMedia+=checked.filter(result=>result?.status==='low_resolution').length;
    selected.push(...checked.filter(result=>result?.status==='ready').map(result=>result.candidate).slice(0,limit-selected.length));
  }
}
if(selected.length!==limit) throw new Error(`Reaction GIF acquisition produced ${selected.length} records; expected ${limit}.`);

const usedNames=new Map();
const records=selected.map((candidate,index)=>{
  const baseName=candidate.name??titleCase(candidate.tags.slice(0,2).join(' ')||candidate.ocr.split(/\s+/).slice(0,5).join(' ')||'Reaction GIF');
  const seen=usedNames.get(baseName)??0;
  usedNames.set(baseName,seen+1);
  const name=seen===0?baseName:`${baseName} Reaction ${seen+1}`;
  const mediaUrl=`https://media.giphy.com/media/${candidate.giphyId}/giphy.gif`;
  const previewUrl=`https://media.giphy.com/media/${candidate.giphyId}/giphy_s.gif`;
  const usageCount=candidate.usageCount??null;
  const memeStrength=usageCount===null?95:usageCount>=5000?92:usageCount>=1000?86:usageCount>=500?82:usageCount>=250?78:usageCount>=100?74:usageCount>=40?70:66;
  const metadataQuality=candidate.metadataQuality?.score??null;
  return {
    proposed_id:`gif-${slug(candidate.giphyId)}`,
    name,
    provider:'GIF Reply dataset / GIPHY',
    source_id:candidate.giphyId,
    dataset_gif_id:candidate.gifId??null,
    source_url:candidate.sourceUrl??`https://giphy.com/gifs/${candidate.giphyId}`,
    observed_on:observedOn,
    categories:['reaction-gif',...candidate.tags].slice(0,7),
    assistive_text:[candidate.tags.length?`Tags: ${candidate.tags.join(', ')}.`:'',usefulText(candidate.ocr)?`Visible text: ${candidate.ocr}`:''].filter(Boolean).join(' '),
    image_url:mediaUrl,
    media_type:'gif',
    media_url:mediaUrl,
    preview_url:previewUrl,
    mime_type:'image/gif',
    rights_status:'not_established',
    review_status:'needs_metadata_review',
    human_validated:false,
    meme_strength:memeStrength,
    asset_quality:candidate.assetDimensions?Math.min(100,Math.round(Math.min(candidate.assetDimensions.width,candidate.assetDimensions.height)/4)):selectionMode==='quality'?null:70,
    visual_quality_status:candidate.assetDimensions?'release_resolution_passed':selectionMode==='quality'?'pending_asset_measurement':'legacy_default_score',
    ...(candidate.assetDimensions?{asset_dimensions:candidate.assetDimensions}:{}),
    asset_delivery_eligible:Boolean(candidate.assetDimensions),
    production_eligible:false,
    uniqueness_score:100,
    usage_evidence:candidate.evidence??{
      kind:'observed_reaction_usage',
      conversation_uses:usageCount,
      dataset:'GIF Reply',
      paper:'https://aclanthology.org/2021.findings-emnlp.244/'
    },
    ...(metadataQuality===null?{}:{selection_evidence:{
      method:'usage_and_metadata_quality_v1',
      score:Number(candidate.selectionScore.toFixed(2)),
      usage_score:Number(candidate.usageScore.toFixed(2)),
      metadata_quality:metadataQuality,
      semantic_bucket:candidate.semanticKey
    }}),
    selection_rank:index+1
  };
});

const report={
  version:selectionMode==='quality'?'reaction-gifs-quality-v1':'stage-3000-reaction-gifs-v1',
  observed_on:observedOn,
  source:{
    dataset:'GIF Reply',
    repository:'https://github.com/xingyaoww/gif-reply',
    conversations:'https://drive.google.com/file/d/1KnLdnpK9XQgyEMDzJLz-_Q1w8zKJjdUw/view',
    metadata:'https://drive.google.com/file/d/1lSmVliELmbEfZgKhtUrMaRmeVkcof6Dx/view',
    giphy_mapping:'https://drive.google.com/file/d/1OBEWu4RKkLciwtDnR0ecVqbjCPU9cVG7/view'
  },
  raw_unique_gifs:usageCounts.size,
  mapped_gifs:giphyByGif.size,
  safe_semantic_candidates:candidates.length,
  selection:{
    mode:selectionMode,
    ...(qualitySelection?{
      eligible_after_metadata_floor:qualitySelection.eligible,
      minimum_observed_uses:minimumUses,
      maximum_per_exact_semantic_bucket:maxPerSemanticKey,
      diversity_cap_skips_while_filling_pool:qualitySelection.diversitySkips,
      distinct_semantic_buckets:new Set(records.map(record=>record.selection_evidence?.semantic_bucket).filter(Boolean)).size
    }:{})
  },
  selected_records:records.length,
  media_validation:validateMedia?{
    checked:true,
    method:'GIF header dimensions from original i.giphy.com asset',
    minimum_long_side:320,
    minimum_short_side:180,
    unavailable_candidates_skipped:unavailableMedia,
    low_resolution_candidates_skipped:lowResolutionMedia
  }:{checked:false},
  minimum_observed_conversation_uses:Math.min(...records.map(record=>record.usage_evidence.conversation_uses).filter(Number.isFinite)),
  owner_requested_canonical_records:records.filter(record=>record.usage_evidence.kind==='owner_requested_canonical').length,
  media_types:{gif:records.length},
  rights_status:{not_established:records.length},
  human_validated:false,
  uncertainty:'Popularity comes from observed reaction use in a research dataset. Media rights remain unestablished and semantic metadata still requires owner feedback.'
};

await mkdir(dirname(outputPath),{recursive:true});
await Promise.all([
  writeFile(outputPath,`${records.map(record=>JSON.stringify(record)).join('\n')}\n`),
  writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`)
]);
console.log(JSON.stringify({status:'acquired',output:outputPath,report:reportPath,...report},null,2));
