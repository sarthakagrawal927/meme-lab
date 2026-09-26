import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl} from '../src/expansion.mjs';
import {stableDialogueEvalId,validateDialogueEvalCases} from '../src/dialogue-eval.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const candidateInput=resolve(root,'expansion/candidates/dialogue-ranked-candidates.jsonl');
const output=resolve(root,'eval/dialogue_quality_cases.jsonl');
const target=200;
const hash=value=>createHash('sha256').update(value).digest('hex');

const candidates=parseJsonl(await readFile(candidateInput,'utf8'),'Evidence-ranked dialogue candidates');
const linkById=new Map(candidates.filter(record=>record.cross_source_corroboration).map(record=>[record.id,record.cross_source_corroboration]));
const bestLinkedIdByFilm=new Map();
for(const record of candidates.filter(record=>linkById.has(record.id)).sort((left,right)=>{
  const scoreDifference=right.screening.screening_score-left.screening.screening_score;
  if(scoreDifference) return scoreDifference;
  const exactDifference=Number(linkById.get(right.id).match_kind==='exact_normalized_quote')-Number(linkById.get(left.id).match_kind==='exact_normalized_quote');
  if(exactDifference) return exactDifference;
  return linkById.get(right.id).similarity-linkById.get(left.id).similarity||hash(left.id).localeCompare(hash(right.id));
})) if(!bestLinkedIdByFilm.has(record.work_title)) bestLinkedIdByFilm.set(record.work_title,record.id);
const bands=[
  {label:'low',minimum:0,maximum:69},
  {label:'mid',minimum:70,maximum:74},
  {label:'high',minimum:75,maximum:79},
  {label:'top',minimum:80,maximum:100}
];
const selected=[];
const selectedFilms=new Set();
for(const record of candidates.filter(record=>bestLinkedIdByFilm.get(record.work_title)===record.id)) {
  const band=bands.find(item=>record.screening.screening_score>=item.minimum&&record.screening.screening_score<=item.maximum);
  selected.push({...record,sample_band:band.label});
  selectedFilms.add(record.work_title);
}
for(const band of bands) {
  const eligible=candidates
    .filter(record=>record.screening.screening_score>=band.minimum&&record.screening.screening_score<=band.maximum)
    .sort((left,right)=>hash(left.id).localeCompare(hash(right.id)));
  for(const record of eligible) {
    if(selected.filter(row=>row.sample_band===band.label).length===target/bands.length) break;
    if(selectedFilms.has(record.work_title)) continue;
    selected.push({...record,sample_band:band.label});
    selectedFilms.add(record.work_title);
  }
}
if(selected.length!==target) throw new Error(`Expected ${target} Cornell dialogue records; found ${selected.length}.`);
const ordered=[];
for(let index=0;index<target/bands.length;index+=1) {
  for(const label of ['top','high','mid','low']) ordered.push(selected.filter(record=>record.sample_band===label)[index]);
}

const cases=ordered.map(record=>({
  id:stableDialogueEvalId(record.id),
  dialogue_id:record.id,
  quote:record.quote,
  work_title:record.work_title,
  speaker:record.speaker,
  structural_score:record.screening.screening_score,
  provenance:record.provenance,
  source_quality_signal:record.memorability_signal,
  cross_source_corroboration:record.cross_source_corroboration,
  sample_band:record.sample_band,
  sample_strategy:'cornell_imdb_memorable_quotes_stratified_evenly_across_four_hidden_structural_bands_with_one_line_per_film',
  review_status:'pending_owner_review',
  human_validated:false,
  production_eligible:false
}));
const summary=validateDialogueEvalCases(cases);
await mkdir(dirname(output),{recursive:true});
await writeFile(output,`${cases.map(row=>JSON.stringify(row)).join('\n')}\n`);
console.log(JSON.stringify({status:'completed',...summary,source:'Cornell Movie-Quotes Corpus v1.0',cross_source_corroborated:cases.filter(row=>row.cross_source_corroboration).length,cross_source_films:new Set(cases.filter(row=>row.cross_source_corroboration).map(row=>row.work_title)).size,hidden_structural_bands:Object.fromEntries(bands.map(band=>[band.label,cases.filter(row=>row.sample_band===band.label).length])),output},null,2));
