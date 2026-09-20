import {createReadStream} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

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

function parseTags(value) {
  const tags=[];
  for(const match of value.matchAll(/'((?:\\'|[^'])*)'/g)) {
    const tag=match[1].replaceAll("\\'",'\'').toLowerCase().replaceAll(/[^a-z0-9 -]+/g,' ').replaceAll(/\s+/g,' ').trim();
    if(tag&&!tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

function cleanOcr(value) {
  return value.replaceAll('[INTER_FRAME_SEP]',' ').replaceAll(/\s+/g,' ').replaceAll(/^[-_.,:;]+|[-_.,:;]+$/g,'').trim().slice(0,400);
}

const unsafe=/\b(?:nsfw|porn|hentai|futanari|nude|nudity|boobs?|tits?|panties|facesit|sex(?:y|ual)?|fetish|xxx|onlyfans|cum|orgasm|rape|slur)\b/i;
const usefulText=value=>value&&/[a-z]{3}/i.test(value)&&!unsafe.test(value);
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
  const tags=parseTags(tagsRaw).filter(usefulText).slice(0,6);
  const ocr=cleanOcr(ocrRaw);
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
const rankedPool=[canonicalJeff,...candidates.filter(candidate=>candidate.giphyId!==canonicalJeff.giphyId)];
let selected=rankedPool.slice(0,limit);
let unavailableMedia=0;
if(validateMedia) {
  selected=[];
  for(let offset=0;offset<rankedPool.length&&selected.length<limit;offset+=25) {
    const batch=rankedPool.slice(offset,offset+25);
    const checked=await Promise.all(batch.map(async candidate=>{
      const mediaUrl=`https://media.giphy.com/media/${candidate.giphyId}/giphy.gif`;
      try {
        const response=await fetch(mediaUrl,{method:'HEAD',signal:AbortSignal.timeout(10000)});
        return response.ok&&response.headers.get('content-type')?.includes('image/gif')?candidate:null;
      } catch { return null; }
    }));
    unavailableMedia+=checked.filter(candidate=>candidate===null).length;
    selected.push(...checked.filter(Boolean).slice(0,limit-selected.length));
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
  const memeStrength=usageCount===null?95:usageCount>=5000?92:usageCount>=1000?86:usageCount>=500?82:usageCount>=250?78:72;
  return {
    proposed_id:`gif-${slug(candidate.giphyId)}`,
    name,
    provider:'GIF Reply dataset / GIPHY',
    source_id:candidate.giphyId,
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
    asset_quality:70,
    uniqueness_score:100,
    usage_evidence:candidate.evidence??{
      kind:'observed_reaction_usage',
      conversation_uses:usageCount,
      dataset:'GIF Reply',
      paper:'https://aclanthology.org/2021.findings-emnlp.244/'
    },
    selection_rank:index+1
  };
});

const report={
  version:'stage-3000-reaction-gifs-v1',
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
  selected_records:records.length,
  media_validation:validateMedia?{checked:true,unavailable_candidates_skipped:unavailableMedia}:{checked:false},
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
