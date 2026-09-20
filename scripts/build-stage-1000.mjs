import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl,promoteStage1000Status,validateExpansionRecords,validateMeaningSpecificMetadata,validateSourceCandidates,validateStage1000Cases,withCandidatePool} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const live=JSON.parse(await readFile(resolve(root,'worker/public/collection.json'),'utf8'));
if(live.length!==300) throw new Error(`Stage 1,000 must build on exactly 300 live records; found ${live.length}.`);

const source=parseJsonl(await readFile(resolve(root,'expansion/sources/stage-1000-source.jsonl'),'utf8'),'stage-1000 source');
validateSourceCandidates(source,{knownNames:live.map(record=>record.name),minimum:1000});
if(source.length!==1000) throw new Error(`Stage-1000 source must contain exactly 1,000 records; found ${source.length}.`);

const batches=[
  {file:'stage-1000-batch-a.jsonl',start:0,end:334,selected:234},
  {file:'stage-1000-batch-b.jsonl',start:334,end:667,selected:233},
  {file:'stage-1000-batch-c.jsonl',start:667,end:1000,selected:233}
];
const reviewed=[];
for(const batch of batches) {
  const records=parseJsonl(await readFile(resolve(root,'expansion/reviewed',batch.file),'utf8'),batch.file);
  if(records.length!==batch.selected) throw new Error(`${batch.file} must select exactly ${batch.selected} records; found ${records.length}.`);
  const allowedIds=new Set(source.slice(batch.start,batch.end).map(record=>record.proposed_id));
  if(records.some(record=>!allowedIds.has(record.id))) throw new Error(`${batch.file} selected a record outside its assigned source range.`);
  reviewed.push(...records);
}

validateExpansionRecords(reviewed,{knownIds:live.map(record=>record.id)});
validateMeaningSpecificMetadata(reviewed);
const sourceById=new Map(source.map(record=>[record.proposed_id,record]));
const liveByImage=new Map(live.filter(record=>record.image_url).map(record=>[record.image_url,record.id]));
const reviewedByImage=new Map();
for(const record of reviewed) {
  const candidate=sourceById.get(record.id);
  if(!candidate) throw new Error(`${record.id} was not present in the acquired stage-1000 source set.`);
  const preserved=record.provenance.provider===candidate.provider
    && record.provenance.provider_id===candidate.source_id
    && record.provenance.source_url===candidate.source_url
    && record.provenance.observed_on===candidate.observed_on
    && record.media.image_url===candidate.image_url
    && record.media.rights_status===candidate.rights_status;
  if(!preserved) throw new Error(`${record.id} does not preserve its acquired source provenance.`);
  if(liveByImage.has(record.media.image_url)) throw new Error(`${record.id} reuses the live image for ${liveByImage.get(record.media.image_url)}; reject the mismapped or duplicate source record.`);
  if(reviewedByImage.has(record.media.image_url)) throw new Error(`${record.id} reuses the image selected for ${reviewedByImage.get(record.media.image_url)}.`);
  reviewedByImage.set(record.media.image_url,record.id);
}

const publicFields=record=>({
  id:record.id,
  name:record.name,
  message:record.message,
  relational_pattern:record.relational_pattern,
  example_context:record.example_context,
  near_miss_context:record.near_miss_context,
  tags:record.tags,
  image_url:record.media.image_url,
  media_status:record.media.rights_status==='established'?'approved':'source-preview',
  availability:'live'
});
const semanticFields=({id,name,message,relational_pattern,example_context,near_miss_context,tags})=>({id,name,message,relational_pattern,example_context,near_miss_context,tags});
const catalogue=[...live,...reviewed.map(publicFields)];
if(catalogue.length!==1000||new Set(catalogue.map(record=>record.id)).size!==1000) throw new Error('Stage-1000 catalogue must contain exactly 1,000 unique records.');

const reviewSummary={
  version:'stage-1000-assistant-review-v1',
  source_records:source.length,
  selected_records:reviewed.length,
  rejected_records:source.length-reviewed.length,
  batches:batches.map(({file,selected,start,end})=>({file,source_range:[start+1,end],selected,rejected:end-start-selected})),
  repeated_source_images:[],
  human_validated:false,
  status:'needs_owner_metadata_asset_and_delivery_review',
  uncertainty:'Selection and semantic descriptions are assistant-authored. Media rights, delivery fitness, and relevance have not been human validated.'
};
const evalCases=parseJsonl(await readFile(resolve(root,'eval/relevance_stage1000_v1.jsonl'),'utf8'),'stage-1000 evaluation');
const evalSummary=validateStage1000Cases(evalCases,{allowedIds:new Set(catalogue.map(record=>record.id))});
const publicStatus=JSON.parse(await readFile(resolve(root,'worker/public/expansion-status.json'),'utf8'));
const stage300Review=JSON.parse(await readFile(resolve(root,'expansion/reviewed/stage-300-review.json'),'utf8'));
const baselineExperiment=JSON.parse(await readFile(resolve(root,'eval/stage-1000-baseline-summary.json'),'utf8'));
const gatedExperiment=JSON.parse(await readFile(resolve(root,'eval/stage-1000-jev-gated-summary.json'),'utf8'));
const jevExperiment=JSON.parse(await readFile(resolve(root,'eval/stage-1000-jev-fast-summary.json'),'utf8'));
const shadowRelevanceExperiment=JSON.parse(await readFile(resolve(root,'eval/stage-1000-shadow-jev-fast-summary.json'),'utf8'));
const shadowSafetyExperiment=JSON.parse(await readFile(resolve(root,'eval/stage-1000-shadow-safety-gate-summary.json'),'utf8'));
const stage3000Acquisition=JSON.parse(await readFile(resolve(root,'expansion/sources/stage-3000-acquisition-phase1.json'),'utf8'));
const candidateStatus=withCandidatePool(publicStatus,{candidateCount:reviewed.length,reviewedExternalCount:stage300Review.selected_records+reviewed.length,evalSummary});
const expandedStatus={
  ...promoteStage1000Status(candidateStatus,{liveCount:catalogue.length,reviewedExternalCount:stage300Review.selected_records+reviewed.length,evalSummary,baselineExperiment,gatedExperiment,jevExperiment,shadowRelevanceExperiment,shadowSafetyExperiment}),
  stage_3000_source:{
    status:'building',
    raw_source_records:stage3000Acquisition.retained_candidates,
    target_additions:stage3000Acquisition.target_gap,
    remaining_source_gap:stage3000Acquisition.remaining_source_gap,
    provider_total:stage3000Acquisition.provider_total,
    human_validated:false
  }
};

await mkdir(resolve(root,'expansion/candidates'),{recursive:true});
await Promise.all([
  writeFile(resolve(root,'expansion/candidates/stage-1000.jsonl'),`${reviewed.map(record=>JSON.stringify(record)).join('\n')}\n`),
  writeFile(resolve(root,'worker/public/collection.json'),`${JSON.stringify(catalogue,null,2)}\n`),
  writeFile(resolve(root,'worker/tools/stage-1000-catalogue.json'),`${JSON.stringify(catalogue.map(semanticFields),null,2)}\n`),
  writeFile(resolve(root,'worker/src/catalogue.stage1000.generated.mjs'),`// Generated from the live 1,000-record catalogue. Do not edit.\nexport const catalogue=${JSON.stringify(catalogue,null,2)};\n`),
  writeFile(resolve(root,'expansion/reviewed/stage-1000-review.json'),`${JSON.stringify(reviewSummary,null,2)}\n`),
  writeFile(resolve(root,'worker/public/expansion-status.json'),`${JSON.stringify(expandedStatus,null,2)}\n`)
]);

console.log(JSON.stringify({status:'built',live_records:catalogue.length,candidate_records:0,total_records:catalogue.length,rejected_records:reviewSummary.rejected_records,repeated_source_images:0,eval:evalSummary,human_validated:false},null,2));
