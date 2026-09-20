import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl,validateSourceCandidates,validateExpansionRecords,validateEvalCases,validateStageCoverageCases,validateCoverageMetadata,validateStages,expansionStatus} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const original=JSON.parse(await readFile(resolve(root,'original/meme_references_v1/memes.json'),'utf8'));
const live=original.filter(record=>record.delivery?.suggested_mode!=='caption_template');
const queued=original.filter(record=>record.delivery?.suggested_mode==='caption_template').map(record=>({
  id:record.id,
  name:record.name,
  message:record.interpretation.message,
  relational_pattern:record.interpretation.relational_pattern,
  example_context:record.interpretation.example_context,
  near_miss_context:record.interpretation.near_miss_context,
  tags:record.interpretation.tags,
  provenance:{
    provider:record.source.provider,
    provider_id:record.source.provider_id??null,
    source_url:record.source.catalogue_url,
    observed_on:record.source.observed_on
  },
  media:{
    image_url:record.asset.url??null,
    rights_status:record.asset.redistribution_permission==='established'?'established':record.asset.url?'not_established':'unavailable'
  },
  review:{status:'needs_asset_and_delivery_review',human_validated:false}
}));
const normalizedLive=live.map(record=>({
  id:record.id,
  name:record.name,
  message:record.interpretation.message,
  relational_pattern:record.interpretation.relational_pattern,
  example_context:record.interpretation.example_context,
  near_miss_context:record.interpretation.near_miss_context,
  tags:record.interpretation.tags,
  image_url:record.asset?.url??null,
  availability:'live'
}));

validateExpansionRecords(queued,{knownIds:live.map(record=>record.id)});
const source=parseJsonl(await readFile(resolve(root,'expansion/sources/stage-300-source.jsonl'),'utf8'),'stage-300 source');
validateSourceCandidates(source,{knownNames:original.map(record=>record.name)});
const reviewedFiles=['batch-a.jsonl','batch-b.jsonl','batch-c.jsonl'];
const reviewed=(await Promise.all(reviewedFiles.map(async file=>parseJsonl(await readFile(resolve(root,'expansion/reviewed',file),'utf8'),file)))).flat();
if(reviewed.length!==240) throw new Error(`Stage-300 review must select exactly 240 external records; found ${reviewed.length}.`);
validateExpansionRecords(reviewed,{knownIds:[...live,...queued].map(record=>record.id)});
const sourceById=new Map(source.map(record=>[record.proposed_id,record]));
for(const record of reviewed) {
  const candidate=sourceById.get(record.id);
  if(!candidate) throw new Error(`${record.id} was not present in the acquired source set.`);
  if(record.provenance.provider_id!==candidate.source_id||record.provenance.source_url!==candidate.source_url||record.media.image_url!==candidate.image_url) throw new Error(`${record.id} does not preserve its acquired source provenance.`);
}
const candidates=[...queued,...reviewed];
validateExpansionRecords(candidates,{knownIds:live.map(record=>record.id)});
const publicCollection=[
  ...normalizedLive,
  ...candidates.map(record=>({
    id:record.id,
    name:record.name,
    message:record.message,
    relational_pattern:record.relational_pattern,
    example_context:record.example_context,
    near_miss_context:record.near_miss_context,
    tags:record.tags,
    image_url:record.media.image_url,
    availability:'experimental'
  }))
];
const manifest=JSON.parse(await readFile(resolve(root,'expansion/stages.json'),'utf8'));
validateStages(manifest);
const evalCases=parseJsonl(await readFile(resolve(root,'eval/relevance_holdout_v1.jsonl'),'utf8'),'relevance holdout');
const evalSummary=validateEvalCases(evalCases,{allowedIds:new Set(live.map(record=>record.id))});
const coverageCases=parseJsonl(await readFile(resolve(root,'eval/relevance_stage300_v1.jsonl'),'utf8'),'stage-300 coverage holdout');
const coverageEvalSummary=validateStageCoverageCases(coverageCases,{allowedIds:new Set(candidates.map(record=>record.id)),excludedIds:live.map(record=>record.id)});
validateCoverageMetadata(coverageCases,candidates);
const experiment=JSON.parse(await readFile(resolve(root,'eval/stage-300-summary.json'),'utf8'));
const coverageExperiment=JSON.parse(await readFile(resolve(root,'eval/stage-300-coverage-summary.json'),'utf8'));
const experimentSummary={
  created_at:experiment.created_at,
  human_validated:experiment.human_validated,
  labels:experiment.labels,
  stage_300_retrieval:experiment.stage_300_retrieval,
  control_30:experiment.metrics['control-30'],
  stage_300:experiment.metrics['stage-300'],
  gates:experiment.gates,
  promotion_ready:experiment.promotion_ready
};
const status=expansionStatus({manifest,liveCount:live.length,candidateCount:candidates.length,reviewedExternalCount:reviewed.length,evalSummary,coverageEvalSummary,experimentSummary,coverageExperimentSummary:coverageExperiment});

await mkdir(resolve(root,'expansion/candidates'),{recursive:true});
await Promise.all([
  writeFile(resolve(root,'expansion/candidates/stage-300-seed.jsonl'),`${queued.map(record=>JSON.stringify(record)).join('\n')}\n`),
  writeFile(resolve(root,'expansion/candidates/stage-300.jsonl'),`${candidates.map(record=>JSON.stringify(record)).join('\n')}\n`),
  writeFile(resolve(root,'worker/public/collection.json'),`${JSON.stringify(publicCollection,null,2)}\n`),
  writeFile(resolve(root,'worker/tools/stage-300-catalogue.json'),`${JSON.stringify([...normalizedLive,...candidates].map(({id,name,message,relational_pattern,example_context,near_miss_context,tags})=>({id,name,message,relational_pattern,example_context,near_miss_context,tags})),null,2)}\n`),
  writeFile(resolve(root,'expansion/reviewed/stage-300-review.json'),`${JSON.stringify({
    version:'stage-300-assistant-review-v1',
    source_records:source.length,
    selected_records:reviewed.length,
    rejected_records:source.length-reviewed.length,
    batches:reviewedFiles.map(file=>({file,selected:80,rejected:20})),
    human_validated:false,
    status:'needs_owner_metadata_asset_and_delivery_review',
    uncertainty:'Selection and semantic descriptions are assistant-authored. Media rights, delivery fitness, and relevance have not been human validated.'
  },null,2)}\n`),
  writeFile(resolve(root,'worker/public/expansion-status.json'),`${JSON.stringify(status,null,2)}\n`)
]);
console.log(JSON.stringify({status:'built',live_records:live.length,candidate_records:candidates.length,assistant_reviewed_external_records:reviewed.length,next_target:status.next_target,records_to_source:status.records_to_source,eval_cases:evalCases.length},null,2));
