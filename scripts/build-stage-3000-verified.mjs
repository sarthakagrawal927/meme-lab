import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {catalogue as stage1000} from '../worker/src/catalogue.stage1000.generated.mjs';
import {canonicalCoverage,catalogueIntegrity,normalizeMedia} from '../src/catalogue-integrity.mjs';
import {parseJsonl,validateExpansionRecords,validateMeaningSpecificMetadata} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const [staticText,gifText,coverageText,statusText,evalText,scoreText]=await Promise.all([
  readFile(resolve(root,'expansion/reviewed/stage-3000-static.jsonl'),'utf8'),
  readFile(resolve(root,'expansion/reviewed/stage-3000-reaction-gifs.jsonl'),'utf8'),
  readFile(resolve(root,'expansion/canonical-memes.json'),'utf8'),
  readFile(resolve(root,'worker/public/expansion-status.json'),'utf8'),
  readFile(resolve(root,'eval/stage-3000-eval-definition.json'),'utf8'),
  readFile(resolve(root,'expansion/sources/stage-3000-local-scores.jsonl'),'utf8')
]);
const staticAdditions=parseJsonl(staticText,'stage-3000 static meme additions');
const gifAdditions=parseJsonl(gifText,'stage-3000 reaction GIF additions');
const additions=[...staticAdditions,...gifAdditions];
const scoresById=new Map(parseJsonl(scoreText,'local catalogue signals').map(record=>[record.id,record]));
if(stage1000.length!==1000||staticAdditions.length!==811||gifAdditions.length!==1189||additions.length!==2000) throw new Error(`Verified stage 3,000 needs 1,000 + 811 + 1,189 records; found ${stage1000.length} + ${staticAdditions.length} + ${gifAdditions.length}.`);
validateExpansionRecords(additions,{knownIds:stage1000.map(record=>record.id)});
validateMeaningSpecificMetadata(additions);

const publicFields=record=>normalizeMedia({
  id:record.id,
  name:record.name,
  message:record.message,
  relational_pattern:record.relational_pattern,
  example_context:record.example_context,
  near_miss_context:record.near_miss_context,
  tags:record.tags,
  image_url:record.media.url??record.media.image_url,
  media_type:record.media.type??'image',
  media_url:record.media.url??record.media.image_url,
  preview_url:record.media.preview_url??record.media.url??record.media.image_url,
  mime_type:record.media.mime_type,
  media_status:record.media.rights_status==='established'?'approved':'source-preview',
  ...(record.media.license_url?{license_url:record.media.license_url}:{}),
  meme_strength:record.meme_strength,
  asset_quality:record.asset_quality,
  uniqueness_score:record.uniqueness_score,
  provenance:record.provenance,
  availability:'live'
});
const catalogue=[...stage1000.map(record=>{
  const signal=scoresById.get(record.id);
  return normalizeMedia({...record,meme_strength:signal?.meme_strength??50,asset_quality:signal?.asset_quality??50,uniqueness_score:signal?.uniqueness_score??100,availability:'live'});
}),...additions.map(publicFields)];
if(catalogue.length!==3000||new Set(catalogue.map(record=>record.id)).size!==3000) throw new Error('Verified stage-3,000 catalogue must contain exactly 3,000 unique records.');
const integrity=catalogueIntegrity(catalogue);
const coverage=canonicalCoverage(catalogue,JSON.parse(coverageText));
if(!coverage.items.find(item=>item.id==='my-name-is-jeff'&&item.status==='covered')) throw new Error('My Name Is Jeff must be covered before the verified catalogue can build.');

const semanticFields=({id,name,message,relational_pattern,example_context,near_miss_context,tags,meme_strength,asset_quality,uniqueness_score})=>({id,name,message,relational_pattern,example_context,near_miss_context,tags,meme_strength,asset_quality,uniqueness_score});
const currentStatus=JSON.parse(statusText);
const evalDefinition=JSON.parse(evalText);
const expandedStatus={
  ...currentStatus,
  live_records:catalogue.length,
  candidate_records:0,
  sourced_records:catalogue.length,
  assistant_reviewed_external_records:2940,
  next_target:3000,
  records_to_source:0,
  records_to_ultimate_target:0,
  ultimate_progress_percent:100,
  eval:{...currentStatus.eval,cases:evalDefinition.cases,stage_3000_cases:evalDefinition.cases,humour:evalDefinition.humour,no_meme:evalDefinition.no_meme,pending_owner_review:evalDefinition.pending_owner_review,pending_owner_review_total:evalDefinition.pending_owner_review},
  stage_3000_source:{
    status:'live_unvalidated',
    baseline_records:1000,
    static_meme_additions:staticAdditions.length,
    reaction_gif_additions:gifAdditions.length,
    excluded_artwork_records:1189,
    providers:integrity.providers,
    media_types:integrity.media_types,
    rights_status:integrity.rights_status,
    canonical_coverage:{covered:coverage.covered,total:coverage.total,missing:coverage.missing},
    human_validated:false
  },
  latest_stage_3000_experiment:null
};
const reviewSummary={
  version:'stage-3000-verified-meme-and-gif-v1',
  selected_records:additions.length,
  static_meme_additions:staticAdditions.length,
  reaction_gif_additions:gifAdditions.length,
  excluded_artwork_records:1189,
  media_types:integrity.media_types,
  canonical_coverage:{covered:coverage.covered,total:coverage.total,missing:coverage.missing},
  human_validated:false,
  status:'live_assistant_reviewed_pending_owner_feedback',
  uncertainty:'GIF popularity is usage-backed, while semantics and media rights remain pending owner or rights-holder review.'
};

await mkdir(resolve(root,'expansion/candidates'),{recursive:true});
await Promise.all([
  writeFile(resolve(root,'expansion/reviewed/stage-3000.jsonl'),`${additions.map(record=>JSON.stringify(record)).join('\n')}\n`),
  writeFile(resolve(root,'expansion/candidates/stage-3000.jsonl'),`${additions.map(record=>JSON.stringify(record)).join('\n')}\n`),
  writeFile(resolve(root,'worker/public/collection.json'),`${JSON.stringify(catalogue,null,2)}\n`),
  writeFile(resolve(root,'worker/tools/stage-3000-catalogue.json'),`${JSON.stringify(catalogue.map(semanticFields),null,2)}\n`),
  writeFile(resolve(root,'worker/src/catalogue.stage3000.generated.mjs'),`// Generated from the verified 3,000-record meme and reaction GIF catalogue. Do not edit.\nexport const catalogue=${JSON.stringify(catalogue,null,2)};\n`),
  writeFile(resolve(root,'worker/public/catalogue-integrity.json'),`${JSON.stringify({...integrity,canonical_coverage:coverage,human_validated:false},null,2)}\n`),
  writeFile(resolve(root,'expansion/reviewed/stage-3000-review.json'),`${JSON.stringify(reviewSummary,null,2)}\n`),
  writeFile(resolve(root,'worker/public/expansion-status.json'),`${JSON.stringify(expandedStatus,null,2)}\n`)
]);
console.log(JSON.stringify({status:'built',live_records:catalogue.length,...reviewSummary},null,2));
