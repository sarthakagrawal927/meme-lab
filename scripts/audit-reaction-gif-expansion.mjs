import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl,validateReactionGifCandidates} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const valueFor=(name,fallback)=>{
  const index=args.indexOf(name);
  return index===-1?fallback:args[index+1];
};
const input=resolve(root,valueFor('--input','expansion/sources/stage-5000-reaction-gifs.jsonl'));
const baseline=resolve(root,valueFor('--baseline','expansion/sources/stage-3000-reaction-gifs.jsonl'));
const reportPath=resolve(root,valueFor('--report','expansion/sources/stage-5000-reaction-gifs-audit.json'));
const samplePath=resolve(root,valueFor('--sample','eval/reaction_gif_expansion_quality_sample.jsonl'));
const visualSamplePath=resolve(root,valueFor('--visual-sample','expansion/sources/stage-5000-gif-visual-sample.json'));
const sampleSize=Math.max(1,Number(valueFor('--sample-size','120')));

let visualSample=null;
try { visualSample=JSON.parse(await readFile(visualSamplePath,'utf8')); }
catch(error) { if(error.code!=='ENOENT') throw error; }

const [records,baselineRecords]=await Promise.all([
  readFile(input,'utf8').then(text=>parseJsonl(text,'reaction GIF expansion')),
  readFile(baseline,'utf8').then(text=>parseJsonl(text,'reaction GIF baseline'))
]);
validateReactionGifCandidates(records,{minimum:5000});

const duplicateCount=values=>values.length-new Set(values).size;
const percentile=(values,amount)=>{
  const sorted=[...values].sort((left,right)=>left-right);
  return sorted[Math.floor((sorted.length-1)*amount)];
};
const distribution=values=>({
  minimum:Math.min(...values),
  p25:percentile(values,0.25),
  median:percentile(values,0.5),
  p75:percentile(values,0.75),
  maximum:Math.max(...values)
});
const evidenceRecords=records.filter(record=>record.usage_evidence.kind==='observed_reaction_usage');
const baselineIds=new Set(baselineRecords.map(record=>record.source_id));
const semanticBuckets=new Map();
for(const record of evidenceRecords) {
  const key=record.selection_evidence?.semantic_bucket??'';
  semanticBuckets.set(key,(semanticBuckets.get(key)??0)+1);
}

const sample=[];
for(let index=0;index<Math.min(sampleSize,records.length);index+=1) {
  const sourceIndex=Math.floor(index*(records.length-1)/Math.max(1,sampleSize-1));
  const record=records[sourceIndex];
  sample.push({
    id:`eval-gif-expansion-${String(index+1).padStart(3,'0')}`,
    candidate_id:record.proposed_id,
    selection_rank:record.selection_rank,
    name:record.name,
    assistive_text:record.assistive_text,
    preview_url:record.preview_url,
    observed_conversation_uses:record.usage_evidence.conversation_uses??null,
    metadata_quality:record.selection_evidence?.metadata_quality??null,
    review_status:'pending_owner_review',
    human_validated:false,
    is_recognizable_reaction_gif:null,
    metadata_matches_visual:null,
    keep:null,
    notes:''
  });
}

const report={
  version:'reaction-gif-expansion-audit-v1',
  input_records:records.length,
  baseline_records:baselineRecords.length,
  retained_from_baseline:records.filter(record=>baselineIds.has(record.source_id)).length,
  net_new_vs_baseline:records.filter(record=>!baselineIds.has(record.source_id)).length,
  exact_duplicates:{
    proposed_id:duplicateCount(records.map(record=>record.proposed_id)),
    source_id:duplicateCount(records.map(record=>record.source_id)),
    dataset_gif_id:duplicateCount(records.map(record=>record.dataset_gif_id??`canonical:${record.source_id}`)),
    media_url:duplicateCount(records.map(record=>record.media_url))
  },
  semantic_diversity:{
    distinct_exact_buckets:semanticBuckets.size,
    largest_exact_bucket:Math.max(...semanticBuckets.values()),
    repeated_bucket_records:[...semanticBuckets.values()].filter(count=>count>1).reduce((sum,count)=>sum+count,0)
  },
  observed_conversation_uses:distribution(evidenceRecords.map(record=>record.usage_evidence.conversation_uses)),
  metadata_quality:distribution(evidenceRecords.map(record=>record.selection_evidence.metadata_quality)),
  visual_quality:visualSample?{
    status:visualSample.verdict,
    measured_records:visualSample.summary.measured_records,
    failed_or_timed_out:visualSample.summary.failed_or_timed_out,
    below_release_resolution:visualSample.summary.below_release_resolution,
    below_release_resolution_rate:visualSample.summary.below_release_resolution_rate,
    threshold:visualSample.threshold,
    evidence_path:visualSamplePath.replace(`${root}/`,'')
  }:{status:'unavailable'},
  media_delivery:{checked:false,reason:'Terminal network access is unavailable in the managed workspace; URLs remain staged until sampled or fully verified.'},
  near_visual_duplicates:{checked:false,reason:'Exact dataset GIF identifiers are unique; perceptual similarity across different identifiers still needs image-frame analysis.'},
  human_review:{sample_records:sample.length,status:'pending_owner_review',sample_path:samplePath.replace(`${root}/`,'')},
  release_status:visualSample?.verdict==='not_release_ready'?'blocked_by_visual_quality':'staging_only'
};

await Promise.all([mkdir(dirname(reportPath),{recursive:true}),mkdir(dirname(samplePath),{recursive:true})]);
await Promise.all([
  writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`),
  writeFile(samplePath,`${sample.map(record=>JSON.stringify(record)).join('\n')}\n`)
]);
console.log(JSON.stringify(report,null,2));
