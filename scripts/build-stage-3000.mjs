import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl,validateExpansionRecords,validateMeaningSpecificMetadata} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const live=JSON.parse(await readFile(resolve(root,'worker/public/collection.json'),'utf8'));
if(live.length!==1000) throw new Error(`Stage 3,000 must build on exactly 1,000 live records; found ${live.length}.`);

const reviewed=parseJsonl(await readFile(resolve(root,'expansion/reviewed/stage-3000.jsonl'),'utf8'),'stage-3000 reviewed records');
const selectedSource=parseJsonl(await readFile(resolve(root,'expansion/sources/stage-3000-selected-source.jsonl'),'utf8'),'stage-3000 selected source');
const localScores=parseJsonl(await readFile(resolve(root,'expansion/sources/stage-3000-local-scores.jsonl'),'utf8'),'stage-3000 local scores');
const selectionReport=JSON.parse(await readFile(resolve(root,'expansion/sources/stage-3000-semantic-uniqueness.json'),'utf8'));
const stage3000Eval=JSON.parse(await readFile(resolve(root,'eval/stage-3000-eval-definition.json'),'utf8'));
const optionalJson=async path=>{
  try { return JSON.parse(await readFile(path,'utf8')); }
  catch(error) { if(error.code==='ENOENT') return null; throw error; }
};
const [stage3000Experiment,stage3000Safety]=await Promise.all([
  optionalJson(resolve(root,'eval/stage-3000-jev-fast-summary.json')),
  optionalJson(resolve(root,'eval/stage-3000-safety-gate-summary.json'))
]);
if(reviewed.length!==2000||selectedSource.length!==2000) throw new Error(`Stage 3,000 requires exactly 2,000 reviewed additions; found ${reviewed.length}/${selectedSource.length}.`);
validateExpansionRecords(reviewed,{knownIds:live.map(record=>record.id)});
validateMeaningSpecificMetadata(reviewed);

const sourceById=new Map(selectedSource.map(record=>[record.proposed_id,record]));
for(const record of reviewed) {
  const source=sourceById.get(record.id);
  if(!source) throw new Error(`${record.id} was not selected by the local stage-3,000 ranking pipeline.`);
  const preserved=record.provenance.provider===source.provider
    && record.provenance.provider_id===source.source_id
    && record.provenance.source_url===source.source_url
    && record.provenance.observed_on===source.observed_on
    && record.media.image_url===source.image_url
    && record.meme_strength===source.meme_strength
    && record.asset_quality===source.asset_quality
    && record.uniqueness_score===source.uniqueness_score;
  if(!preserved) throw new Error(`${record.id} does not preserve source provenance and local scores.`);
}

const scoresById=new Map(localScores.map(record=>[record.id,record]));
const withSignals=record=>{
  const signal=scoresById.get(record.id);
  return {
    ...record,
    meme_strength:signal?.meme_strength??record.meme_strength??50,
    asset_quality:signal?.asset_quality??record.asset_quality??50,
    uniqueness_score:signal?.uniqueness_score??record.uniqueness_score??100
  };
};
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
  ...(record.media.license_url?{license_url:record.media.license_url}:{}),
  meme_strength:record.meme_strength,
  asset_quality:record.asset_quality,
  uniqueness_score:record.uniqueness_score,
  availability:'live'
});
const semanticFields=({id,name,message,relational_pattern,example_context,near_miss_context,tags,meme_strength,asset_quality,uniqueness_score})=>({id,name,message,relational_pattern,example_context,near_miss_context,tags,meme_strength,asset_quality,uniqueness_score});
const catalogue=[...live.map(withSignals),...reviewed.map(publicFields)];
if(catalogue.length!==3000||new Set(catalogue.map(record=>record.id)).size!==3000) throw new Error('Stage-3,000 catalogue must contain exactly 3,000 unique records.');

const currentStatus=JSON.parse(await readFile(resolve(root,'worker/public/expansion-status.json'),'utf8'));
const manifest=JSON.parse(await readFile(resolve(root,'expansion/stages.json'),'utf8'));
const expandedStatus={
  ...currentStatus,
  live_records:3000,
  candidate_records:0,
  assistant_reviewed_external_records:2940,
  sourced_records:3000,
  next_target:3000,
  records_to_source:0,
  records_to_ultimate_target:0,
  ultimate_progress_percent:100,
  retrieval:{live:'dual_view_semantic_top_30_then_classify_top_3',expanded:'dual_view_semantic_top_30_then_classify_top_3'},
  eval:{
    ...currentStatus.eval,
    cases:stage3000Eval.cases,
    stage_3000_cases:stage3000Eval.cases,
    humour:stage3000Eval.humour,
    no_meme:stage3000Eval.no_meme,
    pending_owner_review:stage3000Eval.pending_owner_review,
    pending_owner_review_total:stage3000Eval.pending_owner_review
  },
  stages:manifest.stages.map(({target_records,status,label})=>({target_records,status,label})),
  stage_3000_source:{
    status:'live',
    raw_source_records:2227,
    selected_records:selectionReport.selected_records,
    rejected_records:selectionReport.rejected_records,
    embedding_duplicate_candidates:selectionReport.embedding_duplicate_candidates,
    providers:selectionReport.selected_by_provider,
    image_fingerprint_coverage:1,
    semantic_metadata_coverage:1,
    local_scoring_model:selectionReport.model,
    score_formula:selectionReport.score_formula,
    human_validated:false
  },
  ...(stage3000Experiment&&stage3000Safety?{latest_stage_3000_experiment:{
    created_at:stage3000Experiment.created_at,
    human_validated:false,
    labels:stage3000Experiment.labels,
    relevance:stage3000Experiment.metrics,
    relevance_slices:stage3000Experiment.slices,
    safety:stage3000Safety.metrics,
    production_path:'serious-content gate, dual-view vector retrieval, Jev relevance ranking, static close-call prior, Llama explanations'
  }}:{})
};
const reviewSummary={
  version:'stage-3000-local-model-review-v1',
  source_records:2227,
  selected_records:reviewed.length,
  rejected_records:selectionReport.rejected_records,
  selected_by_provider:selectionReport.selected_by_provider,
  local_scoring_model:selectionReport.model,
  metadata_model:'qwen3:4b via local Ollama',
  score_formula:selectionReport.score_formula,
  meme_strength:selectionReport.meme_strength,
  asset_quality:selectionReport.asset_quality,
  uniqueness_score:selectionReport.uniqueness_score,
  human_validated:false,
  status:'live_assistant_reviewed_pending_owner_feedback',
  uncertainty:'Selection, strength, quality, uniqueness and semantic descriptions are locally model-authored and not human validated.'
};

await mkdir(resolve(root,'expansion/candidates'),{recursive:true});
await Promise.all([
  writeFile(resolve(root,'expansion/candidates/stage-3000.jsonl'),`${reviewed.map(record=>JSON.stringify(record)).join('\n')}\n`),
  writeFile(resolve(root,'worker/public/collection.json'),`${JSON.stringify(catalogue,null,2)}\n`),
  writeFile(resolve(root,'worker/tools/stage-3000-catalogue.json'),`${JSON.stringify(catalogue.map(semanticFields),null,2)}\n`),
  writeFile(resolve(root,'worker/src/catalogue.stage3000.generated.mjs'),`// Generated from the live 3,000-record catalogue. Do not edit.\nexport const catalogue=${JSON.stringify(catalogue,null,2)};\n`),
  writeFile(resolve(root,'expansion/reviewed/stage-3000-review.json'),`${JSON.stringify(reviewSummary,null,2)}\n`),
  writeFile(resolve(root,'worker/public/expansion-status.json'),`${JSON.stringify(expandedStatus,null,2)}\n`)
]);

console.log(JSON.stringify({status:'built',live_records:catalogue.length,selected_records:reviewed.length,rejected_records:selectionReport.rejected_records,human_validated:false},null,2));
