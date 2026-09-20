const REQUIRED_RECORD_FIELDS=['id','name','message','relational_pattern','example_context','near_miss_context','tags','provenance','media','review'];
const VALID_RIGHTS=['established','not_established','unavailable'];
const VALID_REVIEW=['needs_metadata_review','needs_asset_and_delivery_review','approved'];

export function validateSourceCandidates(records,{knownNames=[],minimum=240}={}) {
  if(records.length<minimum) throw new Error(`Sourcing needs at least ${minimum} candidates; found ${records.length}.`);
  const ids=new Set();
  const names=new Set(knownNames.map(name=>name.toLowerCase().replaceAll(/[^a-z0-9]+/g,' ').trim()));
  for(const record of records) {
    if(typeof record.proposed_id!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.proposed_id)||ids.has(record.proposed_id)) throw new Error(`Invalid or duplicate source candidate ID: ${record.proposed_id}.`);
    ids.add(record.proposed_id);
    const normalizedName=record.name?.toLowerCase().replaceAll(/[^a-z0-9]+/g,' ').trim();
    if(!normalizedName||names.has(normalizedName)) throw new Error(`Duplicate or invalid source candidate name: ${record.name}.`);
    names.add(normalizedName);
    if(record.provider!=='JustMeme.wtf'||typeof record.source_url!=='string'||!record.source_url.startsWith('https://justmeme.wtf/api/v1/templates/')) throw new Error(`${record.proposed_id} has invalid source provenance.`);
    if(!Array.isArray(record.categories)||record.categories.length===0||record.categories.some(category=>typeof category!=='string'||!category.trim())) throw new Error(`${record.proposed_id} needs source categories.`);
    if(typeof record.image_url!=='string'||!record.image_url.startsWith('https://')) throw new Error(`${record.proposed_id} needs a source image URL.`);
    if(record.rights_status!=='not_established'||record.review_status!=='needs_metadata_review'||record.human_validated!==false) throw new Error(`${record.proposed_id} has an invalid safety state.`);
  }
  return records;
}

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

export function validateStageCoverageCases(cases,{allowedIds,excludedIds=[]}) {
  if(cases.length!==20) throw new Error(`Stage-300 coverage holdout must contain 20 cases; found ${cases.length}.`);
  const ids=new Set();
  const contexts=new Set();
  const excluded=new Set(excludedIds);
  for(const row of cases) {
    if(typeof row.id!=='string'||!/^eval-stage300-\d{3}$/.test(row.id)||ids.has(row.id)) throw new Error(`Invalid or duplicate stage coverage ID: ${row.id}.`);
    ids.add(row.id);
    if(typeof row.context!=='string'||row.context.trim().length<30||contexts.has(row.context.trim().toLowerCase())) throw new Error(`Invalid or duplicate stage coverage context: ${row.id}.`);
    contexts.add(row.context.trim().toLowerCase());
    if(row.intent_label!=='humour') throw new Error(`${row.id} must test expanded humour coverage.`);
    if(!Array.isArray(row.acceptable_ids)||row.acceptable_ids.length===0||new Set(row.acceptable_ids).size!==row.acceptable_ids.length||row.acceptable_ids.some(id=>!allowedIds.has(id)||excluded.has(id))) throw new Error(`${row.id} needs distinct acceptable external stage-300 IDs.`);
    if(row.review_status!=='pending_owner_review'||row.human_validated!==false) throw new Error(`${row.id} must remain explicitly unvalidated until owner review.`);
    if(!Array.isArray(row.failure_modes)||row.failure_modes.length===0||row.failure_modes.some(mode=>typeof mode!=='string'||!mode.trim())) throw new Error(`${row.id} needs string failure modes.`);
  }
  return {cases:cases.length,humour:cases.length,pending_owner_review:cases.length};
}

export function validateStage1000Cases(cases,{allowedIds}) {
  if(cases.length!==60) throw new Error(`Stage-1000 evaluation must contain 60 cases; found ${cases.length}.`);
  const ids=new Set();
  const contexts=new Set();
  const targetIds=new Set();
  let humour=0;
  let noMeme=0;
  for(const row of cases) {
    if(typeof row.id!=='string'||!/^eval-stage1000-\d{3}$/.test(row.id)||ids.has(row.id)) throw new Error(`Invalid or duplicate stage-1000 eval ID: ${row.id}.`);
    ids.add(row.id);
    if(typeof row.context!=='string'||row.context.trim().length<30||contexts.has(row.context.trim().toLowerCase())) throw new Error(`Invalid or duplicate stage-1000 context: ${row.id}.`);
    contexts.add(row.context.trim().toLowerCase());
    if(!['humour','no_meme'].includes(row.intent_label)) throw new Error(`Invalid stage-1000 intent label: ${row.id}.`);
    if(!Array.isArray(row.acceptable_ids)||new Set(row.acceptable_ids).size!==row.acceptable_ids.length||row.acceptable_ids.some(id=>!allowedIds.has(id))) throw new Error(`Unknown or duplicate acceptable ID in ${row.id}.`);
    if(row.intent_label==='humour') {
      humour+=1;
      if(row.acceptable_ids.length===0) throw new Error(`Humour case ${row.id} needs at least one acceptable meme.`);
      row.acceptable_ids.forEach(id=>targetIds.add(id));
    } else {
      noMeme+=1;
      if(row.acceptable_ids.length!==0) throw new Error(`No-meme case ${row.id} cannot have acceptable references.`);
    }
    if(row.review_status!=='pending_owner_review'||row.human_validated!==false) throw new Error(`${row.id} must remain explicitly unvalidated until owner review.`);
    if(!Array.isArray(row.failure_modes)||row.failure_modes.length===0||row.failure_modes.some(mode=>typeof mode!=='string'||!mode.trim())) throw new Error(`${row.id} needs string failure modes.`);
  }
  if(humour!==45||noMeme!==15) throw new Error(`Stage-1000 evaluation must contain 45 humour and 15 no-meme cases; found ${humour}/${noMeme}.`);
  if(targetIds.size<45) throw new Error(`Stage-1000 humour cases must cover at least 45 distinct new meme IDs; found ${targetIds.size}.`);
  return {cases:cases.length,humour,no_meme:noMeme,distinct_target_ids:targetIds.size,pending_owner_review:cases.length};
}

export function validateCoverageMetadata(cases,records) {
  const byId=new Map(records.map(record=>[record.id,record]));
  const targetIds=new Set(cases.flatMap(row=>row.acceptable_ids));
  const generic=/broadly relatable reaction|situation calls for|visible reaction or contrast|unexpectedly complicated request|makes the reaction immediately legible|framing it with a recognizable visual contrast|image frames a relationship or contrast/i;
  const examples=new Set();
  for(const id of targetIds) {
    const record=byId.get(id);
    if(!record) throw new Error(`Coverage target ${id} is missing from the candidate catalogue.`);
    for(const field of ['message','relational_pattern','example_context','near_miss_context']) if(generic.test(record[field])) throw new Error(`Coverage target ${id} still has placeholder ${field}.`);
    const example=record.example_context.trim().toLowerCase();
    if(examples.has(example)) throw new Error(`Coverage target ${id} reuses another target's example context.`);
    examples.add(example);
  }
  return {records:targetIds.size};
}

export function validateMeaningSpecificMetadata(records) {
  const generic=/broadly relatable|situation calls for|recognizable visual contrast|without a long explanation|image frames a relationship|visible reaction or contrast|turns that relationship into the punchline|the visual makes that relationship explicit/i;
  const valuesByField=new Map(['message','relational_pattern','example_context','near_miss_context'].map(field=>[field,new Set()]));
  for(const record of records) {
    for(const field of ['message','relational_pattern','example_context','near_miss_context']) {
      if(generic.test(record[field])) throw new Error(`${record.id} still has placeholder ${field}.`);
      const normalized=record[field].trim().toLowerCase();
      if(valuesByField.get(field).has(normalized)) throw new Error(`${record.id} reuses another record's ${field}.`);
      valuesByField.get(field).add(normalized);
    }
  }
  return {records:records.length};
}

export function validateStages(manifest) {
  const targets=manifest?.stages?.map(stage=>stage.target_records);
  if(JSON.stringify(targets)!==JSON.stringify([30,300,1000,3000])) throw new Error('Expansion stages must be 30, 300, 1000, and 3000 in order.');
  if(!targets.includes(manifest.current_live_stage)) throw new Error('Current live stage must match a declared expansion stage.');
  if(manifest.stages.some(stage=>stage.target_records<=manifest.current_live_stage?stage.status!=='live':!['building','planned'].includes(stage.status))) throw new Error('Expansion stage statuses are invalid.');
  for(const stage of manifest.stages) {
    if(stage.target_records>30&&stage.retrieval.strategy!=='semantic_shortlist_then_rerank') throw new Error(`Stage ${stage.target_records} needs bounded semantic retrieval.`);
    if(stage.gates.top_three_sendability.minimum<0.7||stage.gates.correct_abstention.minimum<0.8) throw new Error(`Stage ${stage.target_records} weakens the baseline quality gates.`);
  }
  return manifest.stages;
}

export function expansionStatus({manifest,liveCount,candidateCount,reviewedExternalCount=0,evalSummary,coverageEvalSummary=null,experimentSummary=null,coverageExperimentSummary=null}) {
  const next=manifest.stages.find(stage=>stage.status==='building')??manifest.stages.find(stage=>stage.status==='planned');
  const ultimateTarget=manifest.stages.at(-1).target_records;
  const sourcedRecords=liveCount+candidateCount;
  return {
    version:manifest.version,
    live_records:liveCount,
    candidate_records:candidateCount,
    assistant_reviewed_external_records:reviewedExternalCount,
    sourced_records:sourcedRecords,
    next_target:next?.target_records??liveCount,
    records_to_source:Math.max(0,(next?.target_records??liveCount)-sourcedRecords),
    ultimate_target:ultimateTarget,
    records_to_ultimate_target:Math.max(0,ultimateTarget-sourcedRecords),
    ultimate_progress_percent:Math.round((sourcedRecords/ultimateTarget)*100),
    retrieval:{live:liveCount>30?'semantic_top_30_then_rerank_top_3':'direct_all_candidates',expanded:'semantic_top_30_then_rerank_top_3'},
    eval:{...evalSummary,expansion_cases:coverageEvalSummary?.cases??0,pending_owner_review_total:evalSummary.pending_owner_review+(coverageEvalSummary?.pending_owner_review??0)},
    latest_experiment:experimentSummary,
    latest_expansion_coverage_experiment:coverageExperimentSummary,
    stages:manifest.stages.map(({target_records,status,label})=>({target_records,status,label}))
  };
}

export function withCandidatePool(status,{candidateCount,reviewedExternalCount,evalSummary}) {
  const sourcedRecords=status.live_records+candidateCount;
  return {
    ...status,
    candidate_records:candidateCount,
    assistant_reviewed_external_records:reviewedExternalCount,
    sourced_records:sourcedRecords,
    records_to_source:Math.max(0,status.next_target-sourcedRecords),
    records_to_ultimate_target:Math.max(0,status.ultimate_target-sourcedRecords),
    ultimate_progress_percent:Math.round((sourcedRecords/status.ultimate_target)*100),
    eval:{...status.eval,stage_1000_cases:evalSummary.cases,pending_owner_review_total:status.eval.cases+(status.eval.expansion_cases??0)+evalSummary.pending_owner_review}
  };
}

export function promoteStage1000Status(status,{liveCount,reviewedExternalCount,evalSummary,baselineExperiment,gatedExperiment,jevExperiment}) {
  return {
    ...status,
    live_records:liveCount,
    candidate_records:0,
    assistant_reviewed_external_records:reviewedExternalCount,
    sourced_records:liveCount,
    next_target:3000,
    records_to_source:Math.max(0,3000-liveCount),
    records_to_ultimate_target:Math.max(0,status.ultimate_target-liveCount),
    ultimate_progress_percent:Math.round((liveCount/status.ultimate_target)*100),
    retrieval:{live:'semantic_top_30_then_classify_top_3',expanded:'semantic_top_30_then_classify_top_3'},
    eval:{...status.eval,stage_1000_cases:evalSummary.cases,pending_owner_review_total:status.eval.cases+(status.eval.expansion_cases??0)+evalSummary.pending_owner_review},
    latest_stage_1000_experiment:{
      created_at:jevExperiment.rescored_at??jevExperiment.created_at,
      human_validated:false,
      label_status:'twice_assistant_audited_pending_owner_review',
      baseline:baselineExperiment.metrics,
      serious_gate:gatedExperiment.metrics,
      jev_ranking:jevExperiment.metrics,
      production_path:'serious-content gate, vector top 30, Jev top 3, Llama explanations'
    }
  };
}
