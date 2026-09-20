import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateSourceCandidates} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sourceBase='https://justmeme.wtf/api/v1/templates';
const live=JSON.parse(await readFile(resolve(root,'worker/public/collection.json'),'utf8'));
const targetCandidates=1000;
const maxPages=16;
const normalize=value=>value.toLowerCase().replaceAll(/[^a-z0-9]+/g,' ').trim();
const seenNames=new Set(live.map(record=>normalize(record.name)));
const seenIds=new Set(live.map(record=>record.id));
const pages=[];
const candidates=[];

for(let page=1;page<=maxPages&&candidates.length<targetCandidates;page+=1) {
  const url=`${sourceBase}?limit=100&page=${page}`;
  const response=await fetch(url,{headers:{'User-Agent':'Meme-Lab-Dataset/1.0 (+https://github.com/sarthakagrawal927/meme-lab)'}});
  if(!response.ok) throw new Error(`Source page ${page} failed with HTTP ${response.status}.`);
  const payload=await response.json();
  if(payload.success!==true||!Array.isArray(payload.templates)) throw new Error(`Source page ${page} returned an invalid template list.`);
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
    if(candidates.length===targetCandidates) break;
  }
}

if(candidates.length!==targetCandidates) throw new Error(`Expected ${targetCandidates} unique non-live candidates from at most ${maxPages} pages; found ${candidates.length}.`);
validateSourceCandidates(candidates,{knownNames:live.map(record=>record.name),minimum:targetCandidates});
const observedOn=new Date().toISOString().slice(0,10);
await mkdir(resolve(root,'expansion/sources'),{recursive:true});
await Promise.all([
  writeFile(resolve(root,'expansion/sources/stage-1000-source.jsonl'),`${candidates.map(record=>JSON.stringify(record)).join('\n')}\n`),
  writeFile(resolve(root,'expansion/sources/stage-1000-acquisition.json'),`${JSON.stringify({
    version:'stage-1000-acquisition-v1',
    observed_on:observedOn,
    backend:'documented_public_api',
    provider:'JustMeme.wtf',
    pages_attempted:pages.length,
    pages_succeeded:pages.length,
    pages_failed:0,
    page_limit:maxPages,
    per_page:pages,
    retained_candidates:candidates.length,
    live_records_excluded:live.length,
    filters:['exclude all 300 live names and IDs','deduplicate normalized names and IDs','metadata only; no image downloads'],
    uncertainty:'Raw source templates are not live records. Meaning, delivery fitness, audience suitability, and media rights require separate review.'
  },null,2)}\n`)
]);
console.log(JSON.stringify({status:'acquired',pages:pages.length,rows_seen:pages.reduce((sum,page)=>sum+page.count,0),retained:candidates.length,live_records_excluded:live.length,output:'expansion/sources/stage-1000-source.jsonl'},null,2));
