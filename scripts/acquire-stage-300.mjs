import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateSourceCandidates} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sourceBase='https://justmeme.wtf/api/v1/templates';
const existing=JSON.parse(await readFile(resolve(root,'original/meme_references_v1/memes.json'),'utf8'));
const normalize=value=>value.toLowerCase().replaceAll(/[^a-z0-9]+/g,' ').trim();
const existingNames=new Set(existing.map(record=>normalize(record.name)));
const existingIds=new Set(existing.map(record=>record.id));
const seenNames=new Set(existingNames);
const seenIds=new Set(existingIds);
const pages=[];

for(let page=1;page<=4;page+=1) {
  const url=`${sourceBase}?limit=100&page=${page}`;
  const response=await fetch(url,{headers:{'User-Agent':'Meme-Lab-Dataset/1.0 (+https://github.com/sarthakagrawal927/meme-lab)'}});
  if(!response.ok) throw new Error(`Source page ${page} failed with HTTP ${response.status}.`);
  const payload=await response.json();
  if(payload.success!==true||!Array.isArray(payload.templates)||payload.templates.length===0) throw new Error(`Source page ${page} returned an invalid template list.`);
  pages.push({page,url,count:payload.templates.length,templates:payload.templates});
}

const observedOn=new Date().toISOString().slice(0,10);
const candidates=[];
for(const page of pages) {
  for(const template of page.templates) {
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
      catalogue_url:page.url,
      observed_on:observedOn,
      rights_status:'not_established',
      review_status:'needs_metadata_review',
      human_validated:false
    });
    if(candidates.length===300) break;
  }
  if(candidates.length===300) break;
}

if(candidates.length!==300) throw new Error(`Expected 300 unique candidates from four bounded pages; found ${candidates.length}.`);
validateSourceCandidates(candidates,{knownNames:existing.map(record=>record.name)});
await mkdir(resolve(root,'expansion/sources'),{recursive:true});
await writeFile(resolve(root,'expansion/sources/stage-300-source.jsonl'),`${candidates.map(record=>JSON.stringify(record)).join('\n')}\n`);
await writeFile(resolve(root,'expansion/sources/stage-300-acquisition.json'),`${JSON.stringify({
  version:'stage-300-acquisition-v1',
  observed_on:observedOn,
  backend:'documented_public_api',
  provider:'JustMeme.wtf',
  pages_attempted:4,
  pages_succeeded:4,
  pages_failed:0,
  per_page:pages.map(({page,url,count})=>({page,url,count})),
  retained_candidates:candidates.length,
  filters:['exclude existing 60 names and IDs','deduplicate normalized names and IDs','metadata only; no image downloads'],
  uncertainty:'Template names and categories are source metadata. Meaning, delivery fitness, audience suitability, and media rights require separate review.'
},null,2)}\n`);
console.log(JSON.stringify({status:'acquired',pages:4,rows_seen:pages.reduce((sum,page)=>sum+page.count,0),retained:candidates.length,output:'expansion/sources/stage-300-source.jsonl'},null,2));
