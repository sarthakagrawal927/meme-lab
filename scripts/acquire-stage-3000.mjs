import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl,validateSourceCandidates} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sourceBase='https://justmeme.wtf/api/v1/templates';
const live=JSON.parse(await readFile(resolve(root,'worker/public/collection.json'),'utf8'));
const priorSources=(await Promise.all([
  'stage-300-source.jsonl',
  'stage-1000-source.jsonl'
].map(async file=>parseJsonl(await readFile(resolve(root,'expansion/sources',file),'utf8'),file)))).flat();
const normalize=value=>value.toLowerCase().replaceAll(/[^a-z0-9]+/g,' ').trim();
const seenNames=new Set([...live,...priorSources.map(record=>({name:record.name}))].map(record=>normalize(record.name)));
const seenIds=new Set([...live.map(record=>record.id),...priorSources.map(record=>record.proposed_id)]);
const pages=[];
const candidates=[];
let total=0;

for(let page=1;page<=30;page+=1) {
  const url=`${sourceBase}?limit=100&page=${page}`;
  const response=await fetch(url,{headers:{'User-Agent':'Meme-Lab-Dataset/1.0 (+https://github.com/sarthakagrawal927/meme-lab)'}});
  if(!response.ok) throw new Error(`Source page ${page} failed with HTTP ${response.status}.`);
  const payload=await response.json();
  if(payload.success!==true||!Array.isArray(payload.templates)||!Number.isInteger(payload.total)) throw new Error(`Source page ${page} returned an invalid template list.`);
  total=payload.total;
  if(payload.templates.length===0) break;
  pages.push({page,url,count:payload.templates.length});
  for(const template of payload.templates) {
    const name=String(template.name??'').trim();
    const proposedId=String(template.slug??template.id??'').toLowerCase().replaceAll(/[^a-z0-9]+/g,'-').replaceAll(/^-|-$/g,'');
    const normalizedName=normalize(name);
    if(!name||!proposedId||seenNames.has(normalizedName)||seenIds.has(proposedId)) continue;
    seenNames.add(normalizedName);
    seenIds.add(proposedId);
    const categories=Array.isArray(template.categories)?template.categories.filter(category=>typeof category==='string'&&category.trim()):[];
    candidates.push({
      proposed_id:proposedId,
      source_id:String(template.id??template.slug),
      name,
      categories:categories.length?categories:['uncategorized'],
      image_url:String(template.url??''),
      provider:'JustMeme.wtf',
      source_url:`${sourceBase}/${encodeURIComponent(String(template.slug??template.id))}`,
      catalogue_url:url,
      observed_on:new Date().toISOString().slice(0,10),
      rights_status:'not_established',
      review_status:'needs_metadata_review',
      human_validated:false
    });
  }
  if(page*100>=total) break;
}

if(candidates.length<800) throw new Error(`Expected at least 800 previously unseen candidates; found ${candidates.length}.`);
validateSourceCandidates(candidates,{knownNames:[...live,...priorSources.map(record=>({name:record.name}))].map(record=>record.name),minimum:800});
const observedOn=new Date().toISOString().slice(0,10);
await mkdir(resolve(root,'expansion/sources'),{recursive:true});
await Promise.all([
  writeFile(resolve(root,'expansion/sources/stage-3000-source-phase1.jsonl'),`${candidates.map(record=>JSON.stringify(record)).join('\n')}\n`),
  writeFile(resolve(root,'expansion/sources/stage-3000-acquisition-phase1.json'),`${JSON.stringify({
    version:'stage-3000-acquisition-phase1-v1',
    observed_on:observedOn,
    backend:'documented_public_api',
    provider:'JustMeme.wtf',
    provider_total:total,
    pages_attempted:pages.length,
    pages_succeeded:pages.length,
    pages_failed:0,
    per_page:pages,
    retained_candidates:candidates.length,
    live_records_excluded:live.length,
    prior_source_records_excluded:priorSources.length,
    target_gap:2000,
    remaining_source_gap:Math.max(0,2000-candidates.length),
    filters:['exclude all live names and IDs','exclude every previously reviewed source record','deduplicate normalized names and IDs','metadata only; no image downloads'],
    uncertainty:'Raw source templates are not live records. Meaning, delivery fitness, audience suitability, duplicate images, and media rights require separate review.'
  },null,2)}\n`)
]);
console.log(JSON.stringify({status:'acquired',provider_total:total,pages:pages.length,retained:candidates.length,target_gap:2000,remaining_source_gap:Math.max(0,2000-candidates.length),output:'expansion/sources/stage-3000-source-phase1.jsonl'},null,2));
