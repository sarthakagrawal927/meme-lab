import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {catalogue as stage1000} from '../worker/src/catalogue.stage1000.generated.mjs';
import {canonicalCoverage,catalogueIntegrity,normalizeMedia} from '../src/catalogue-integrity.mjs';
import {parseJsonl,validateExpansionRecords,validateMeaningSpecificMetadata} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const semanticOverrides=JSON.parse(await readFile(resolve(root,'expansion/curated-semantic-overrides.json'),'utf8'));
const [staticText,gifText,replacementGifText,qualityGifText,qualityReplacementText,exclusionText,coverageText,statusText,evalText,scoreText]=await Promise.all([
  readFile(resolve(root,'expansion/reviewed/stage-3000-static.jsonl'),'utf8'),
  readFile(resolve(root,'expansion/reviewed/stage-3000-reaction-gifs.jsonl'),'utf8'),
  readFile(resolve(root,'expansion/reviewed/stage-3000-reaction-gif-replacements.jsonl'),'utf8'),
  readFile(resolve(root,'expansion/reviewed/high-quality-gif-replacements.jsonl'),'utf8'),
  readFile(resolve(root,'expansion/exclusions/low-quality-gif-replacements.json'),'utf8'),
  readFile(resolve(root,'expansion/exclusions/non-reaction-assets.json'),'utf8'),
  readFile(resolve(root,'expansion/canonical-memes.json'),'utf8'),
  readFile(resolve(root,'worker/public/expansion-status.json'),'utf8'),
  readFile(resolve(root,'eval/stage-3000-eval-definition.json'),'utf8'),
  readFile(resolve(root,'expansion/sources/stage-3000-local-scores.jsonl'),'utf8')
]);
const exclusions=JSON.parse(exclusionText);
const excludedIds=new Set(exclusions.records.map(record=>record.id));
const filteredStage1000=stage1000.filter(record=>!excludedIds.has(record.id));
const staticAdditions=parseJsonl(staticText,'stage-3000 static meme additions').filter(record=>!excludedIds.has(record.id));
const originalGifAdditions=[
  ...parseJsonl(gifText,'stage-3000 reaction GIF additions'),
  ...parseJsonl(replacementGifText,'stage-3000 replacement reaction GIF additions')
];
const qualityGifAdditions=parseJsonl(qualityGifText,'visually reviewed replacement GIFs');
const qualityReplacements=JSON.parse(qualityReplacementText).replacements;
const qualityById=new Map(qualityGifAdditions.map(record=>[record.id,record]));
const replacedIds=new Set(qualityReplacements.map(record=>record.old_id));
if(qualityGifAdditions.length!==7||qualityReplacements.length!==7||qualityById.size!==7||replacedIds.size!==7||qualityReplacements.some(record=>!qualityById.has(record.new_id))) throw new Error('The visual-quality GIF replacement manifest must contain seven distinct verified replacements.');
if(qualityGifAdditions.some(record=>{
  const dimensions=record.provenance?.visual_review?.dimensions;
  return record.provenance?.visual_review?.method!=='assistant_browser_inspection'||!dimensions||Math.max(dimensions.width,dimensions.height)<320||Math.min(dimensions.width,dimensions.height)<180;
})) throw new Error('A curated GIF lacks visual inspection or the release resolution floor.');
const replacementByOldId=new Map(qualityReplacements.map(record=>[record.old_id,qualityById.get(record.new_id)]));
const originalIds=new Set(originalGifAdditions.map(record=>record.id));
if([...replacedIds].some(id=>!originalIds.has(id))||qualityGifAdditions.some(record=>originalIds.has(record.id))) throw new Error('Visual-quality GIF replacements do not match the previous catalogue.');
const gifAdditions=originalGifAdditions.map(record=>replacementByOldId.get(record.id)??record);
const additions=[...staticAdditions,...gifAdditions];
const scoresById=new Map(parseJsonl(scoreText,'local catalogue signals').map(record=>[record.id,record]));
const stage1000Ids=new Set(stage1000.map(record=>record.id));
if(excludedIds.size!==6||filteredStage1000.length!==998||staticAdditions.length!==807||gifAdditions.length!==1195||additions.length!==2002) throw new Error(`Verified stage 3,000 needs 998 retained baseline + 807 static additions + 1,195 GIFs; found ${filteredStage1000.length} + ${staticAdditions.length} + ${gifAdditions.length}.`);
validateExpansionRecords(additions,{knownIds:filteredStage1000.map(record=>record.id)});
validateMeaningSpecificMetadata(additions);

const publicFields=record=>normalizeMedia({
  id:record.id,
  name:record.name,
  message:record.message,
  relational_pattern:record.relational_pattern,
  example_context:record.example_context,
  near_miss_context:record.near_miss_context,
  tags:record.tags,
  ...(semanticOverrides[record.id]??{}),
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
const catalogue=[...filteredStage1000.map(record=>{
  const signal=scoresById.get(record.id);
  return normalizeMedia({...record,...(semanticOverrides[record.id]??{}),meme_strength:signal?.meme_strength??50,asset_quality:signal?.asset_quality??50,uniqueness_score:signal?.uniqueness_score??100,availability:'live'});
}),...additions.map(publicFields)];
if(catalogue.length!==3000||new Set(catalogue.map(record=>record.id)).size!==3000) throw new Error('Verified stage-3,000 catalogue must contain exactly 3,000 unique records.');
if(qualityReplacements.some(replacement=>catalogue[replacement.catalogue_index]?.id!==replacement.new_id)) throw new Error('A curated GIF moved from its recorded catalogue index; the vector seed plan must be updated.');
const integrity=catalogueIntegrity(catalogue,{excludedIds});
const coverage=canonicalCoverage(catalogue,JSON.parse(coverageText));
if(!coverage.items.find(item=>item.id==='my-name-is-jeff'&&item.status==='covered')) throw new Error('My Name Is Jeff must be covered before the verified catalogue can build.');

const semanticFields=({id,name,message,relational_pattern,example_context,near_miss_context,tags,meme_strength,asset_quality,uniqueness_score})=>({id,name,message,relational_pattern,example_context,near_miss_context,tags,meme_strength,asset_quality,uniqueness_score,core:stage1000Ids.has(id)});
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
    baseline_records:filteredStage1000.length,
    static_meme_additions:staticAdditions.length,
    reaction_gif_additions:gifAdditions.length,
    visually_verified_gif_replacements:qualityGifAdditions.length,
    excluded_artwork_records:1189,
    excluded_non_reaction_records:excludedIds.size,
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
  visually_verified_gif_replacements:qualityGifAdditions.length,
  excluded_artwork_records:1189,
  excluded_non_reaction_records:excludedIds.size,
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
