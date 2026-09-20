import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl,validateExpansionRecords,validateEvalCases,validateStages,expansionStatus} from '../src/expansion.mjs';

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

validateExpansionRecords(queued,{knownIds:live.map(record=>record.id)});
const manifest=JSON.parse(await readFile(resolve(root,'expansion/stages.json'),'utf8'));
validateStages(manifest);
const evalCases=parseJsonl(await readFile(resolve(root,'eval/relevance_holdout_v1.jsonl'),'utf8'),'relevance holdout');
const evalSummary=validateEvalCases(evalCases,{allowedIds:new Set(live.map(record=>record.id))});
const status=expansionStatus({manifest,liveCount:live.length,candidateCount:queued.length,evalSummary});

await mkdir(resolve(root,'expansion/candidates'),{recursive:true});
await Promise.all([
  writeFile(resolve(root,'expansion/candidates/stage-300-seed.jsonl'),`${queued.map(record=>JSON.stringify(record)).join('\n')}\n`),
  writeFile(resolve(root,'worker/public/expansion-status.json'),`${JSON.stringify(status,null,2)}\n`)
]);
console.log(JSON.stringify({status:'built',live_records:live.length,queued_records:queued.length,next_target:status.next_target,records_to_source:status.records_to_source,eval_cases:evalCases.length},null,2));
