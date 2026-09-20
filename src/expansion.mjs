const REQUIRED_RECORD_FIELDS=['id','name','message','relational_pattern','example_context','near_miss_context','tags','provenance','media','review'];
const VALID_RIGHTS=['established','not_established','unavailable'];
const VALID_REVIEW=['needs_metadata_review','needs_asset_and_delivery_review','approved'];

export function parseJsonl(text,label='JSONL') {
  return text.trim().split('\n').filter(Boolean).map((line,index)=>{
    try { return JSON.parse(line); }
    catch { throw new Error(`${label} has invalid JSON on line ${index+1}.`); }
  });
}

export function validateExpansionRecords(records,{knownIds=[]}={}) {
  const seen=new Set(knownIds);
  for(const [index,record] of records.entries()) {
    for(const field of REQUIRED_RECORD_FIELDS) if(!(field in record)) throw new Error(`Expansion record ${index+1} is missing ${field}.`);
    if(typeof record.id!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.id)) throw new Error(`Expansion record ${index+1} has an invalid ID.`);
    if(seen.has(record.id)) throw new Error(`Duplicate expansion ID: ${record.id}.`);
    seen.add(record.id);
    for(const field of ['name','message','relational_pattern','example_context','near_miss_context']) if(typeof record[field]!=='string'||!record[field].trim()) throw new Error(`${record.id} has an invalid ${field}.`);
    if(!Array.isArray(record.tags)||record.tags.length<2||record.tags.some(tag=>typeof tag!=='string'||!tag.trim())) throw new Error(`${record.id} needs at least two tags.`);
    if(typeof record.provenance?.provider!=='string'||typeof record.provenance?.source_url!=='string'||!record.provenance.source_url.startsWith('https://')||typeof record.provenance?.observed_on!=='string') throw new Error(`${record.id} has incomplete provenance.`);
    if(!VALID_RIGHTS.includes(record.media?.rights_status)) throw new Error(`${record.id} has an invalid media rights status.`);
    if(record.media.rights_status==='established'&&!record.media.image_url) throw new Error(`${record.id} claims established media without an image.`);
    if(!VALID_REVIEW.includes(record.review?.status)||record.review?.human_validated!==false) throw new Error(`${record.id} has an invalid review state.`);
  }
  return records;
}

export function validateEvalCases(cases,{allowedIds}) {
  if(cases.length!==30) throw new Error(`Relevance holdout must contain 30 cases; found ${cases.length}.`);
  const ids=new Set();
  const contexts=new Set();
  let humour=0;
  let noMeme=0;
  for(const row of cases) {
    if(typeof row.id!=='string'||!/^eval-v1-\d{3}$/.test(row.id)||ids.has(row.id)) throw new Error(`Invalid or duplicate eval ID: ${row.id}.`);
    ids.add(row.id);
    if(typeof row.context!=='string'||row.context.trim().length<30||contexts.has(row.context.trim().toLowerCase())) throw new Error(`Invalid or duplicate eval context: ${row.id}.`);
    contexts.add(row.context.trim().toLowerCase());
    if(!['humour','no_meme'].includes(row.intent_label)) throw new Error(`Invalid intent label: ${row.id}.`);
    if(!Array.isArray(row.acceptable_ids)||row.acceptable_ids.some(id=>!allowedIds.has(id))) throw new Error(`Unknown acceptable ID in ${row.id}.`);
    if(row.intent_label==='humour') {
      humour+=1;
      if(row.acceptable_ids.length===0) throw new Error(`Humour case ${row.id} needs an acceptable reference.`);
    } else {
      noMeme+=1;
      if(row.acceptable_ids.length!==0) throw new Error(`No-meme case ${row.id} cannot have acceptable references.`);
    }
    if(row.review_status!=='pending_owner_review'||row.human_validated!==false) throw new Error(`${row.id} must remain explicitly unvalidated until owner review.`);
    if(!Array.isArray(row.failure_modes)||row.failure_modes.length===0) throw new Error(`${row.id} needs at least one failure mode.`);
  }
  if(humour!==20||noMeme!==10) throw new Error(`Relevance holdout must contain 20 humour and 10 no-meme cases; found ${humour}/${noMeme}.`);
  return {cases:cases.length,humour,no_meme:noMeme,pending_owner_review:cases.length};
}

export function validateStages(manifest) {
  const targets=manifest?.stages?.map(stage=>stage.target_records);
  if(JSON.stringify(targets)!==JSON.stringify([30,300,1000,3000])) throw new Error('Expansion stages must be 30, 300, 1000, and 3000 in order.');
  if(manifest.stages[0].status!=='live'||manifest.stages.slice(1).some(stage=>!['building','planned'].includes(stage.status))) throw new Error('Expansion stage statuses are invalid.');
  for(const stage of manifest.stages) {
    if(stage.target_records>30&&stage.retrieval.strategy!=='semantic_shortlist_then_rerank') throw new Error(`Stage ${stage.target_records} needs bounded semantic retrieval.`);
    if(stage.gates.top_three_sendability.minimum<0.7||stage.gates.correct_abstention.minimum<0.8) throw new Error(`Stage ${stage.target_records} weakens the baseline quality gates.`);
  }
  return manifest.stages;
}

export function expansionStatus({manifest,liveCount,candidateCount,evalSummary}) {
  const next=manifest.stages.find(stage=>stage.status==='building')??manifest.stages.find(stage=>stage.status==='planned');
  return {
    version:manifest.version,
    live_records:liveCount,
    sourced_records:liveCount+candidateCount,
    next_target:next?.target_records??liveCount,
    records_to_source:Math.max(0,(next?.target_records??liveCount)-liveCount-candidateCount),
    retrieval:{live:'direct_all_candidates',expanded:'semantic_top_30_then_rerank_top_3'},
    eval:evalSummary,
    stages:manifest.stages.map(({target_records,status,label})=>({target_records,status,label}))
  };
}
