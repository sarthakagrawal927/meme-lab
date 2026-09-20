const PRIOR_ORIGIN='prior_stage1000_shadow';
const SYNTHETIC_ORIGIN='synthetic_stage3000';
const PRIOR_PROVENANCE='prior_stage1000_shadow';
const SYNTHETIC_PROVENANCE='synthetic_assistant_authored_pending_owner_review';
const PRESERVED_FIELDS=['title','context','intent_label','acceptable_ids','failure_modes','review_status','human_validated'];

function expectedId(index) {
  return `eval-stage3000-${String(index+1).padStart(3,'0')}`;
}

function normalizedContext(value) {
  return typeof value==='string'?value.trim().toLowerCase():'';
}

function signal(record,key) {
  const value=Number(record?.[key]);
  return Number.isFinite(value)?Math.max(0,Math.min(100,value)):0;
}

function normalizedTags(record) {
  return Array.isArray(record?.tags)?[...new Set(record.tags.map(tag=>String(tag).trim().toLowerCase()).filter(Boolean))]:[];
}

function assertCommon(row,index) {
  if(row.id!==expectedId(index)) throw new Error(`Stage-3000 evaluation ID ${row.id} is invalid or out of order; expected ${expectedId(index)}.`);
  if(typeof row.title!=='string'||!row.title.trim()) throw new Error(`${row.id} needs a title.`);
  if(typeof row.context!=='string'||row.context.trim().length<30) throw new Error(`${row.id} needs a concrete context of at least 30 characters.`);
  if(!['humour','no_meme'].includes(row.intent_label)) throw new Error(`${row.id} has an invalid intent label.`);
  if(!Array.isArray(row.acceptable_ids)||new Set(row.acceptable_ids).size!==row.acceptable_ids.length) throw new Error(`${row.id} has invalid or duplicate acceptable IDs.`);
  if(!Array.isArray(row.failure_modes)||row.failure_modes.length===0||row.failure_modes.some(mode=>typeof mode!=='string'||!mode.trim())) throw new Error(`${row.id} needs meaningful failure modes.`);
  if(row.review_status!=='pending_owner_review'||row.human_validated!==false) throw new Error(`${row.id} must remain pending owner review and explicitly unvalidated.`);
  if(row.intent_label==='humour'&&(row.acceptable_ids.length<1||row.acceptable_ids.length>4)) throw new Error(`${row.id} humour cases need one to four acceptable IDs.`);
  if(row.intent_label==='no_meme'&&row.acceptable_ids.length!==0) throw new Error(`${row.id} no-meme cases cannot have acceptable IDs.`);
}

function preservedCopy(row,index) {
  return {
    id:expectedId(index),
    source_case_id:row.id,
    case_origin:PRIOR_ORIGIN,
    label_provenance:PRIOR_PROVENANCE,
    ...Object.fromEntries(PRESERVED_FIELDS.map(field=>[field,structuredClone(row[field])]))
  };
}

function syntheticCopy(row,index,intentLabel) {
  return {
    id:expectedId(index),
    source_case_id:typeof row.id==='string'?row.id:null,
    case_origin:SYNTHETIC_ORIGIN,
    label_provenance:SYNTHETIC_PROVENANCE,
    title:row.title,
    context:row.context,
    intent_label:intentLabel,
    acceptable_ids:intentLabel==='humour'?[...row.acceptable_ids]:[],
    ...(intentLabel==='humour'?{primary_target_id:row.primary_target_id}:{}),
    failure_modes:[...row.failure_modes],
    review_status:'pending_owner_review',
    human_validated:false
  };
}

export function buildStage3000Evaluation({priorShadow,freshHumour,freshNoMeme}) {
  if(!Array.isArray(priorShadow)||priorShadow.length!==60) throw new Error(`Stage-3,000 evaluation needs exactly 60 prior shadow cases; found ${priorShadow?.length??0}.`);
  if(!Array.isArray(freshHumour)||freshHumour.length!==30) throw new Error(`Stage-3,000 evaluation needs exactly 30 fresh humour cases; found ${freshHumour?.length??0}.`);
  if(!Array.isArray(freshNoMeme)||freshNoMeme.length!==10) throw new Error(`Stage-3,000 evaluation needs exactly 10 fresh no-meme cases; found ${freshNoMeme?.length??0}.`);
  return [
    ...priorShadow.map((row,index)=>preservedCopy(row,index)),
    ...freshHumour.map((row,index)=>syntheticCopy(row,60+index,'humour')),
    ...freshNoMeme.map((row,index)=>syntheticCopy(row,90+index,'no_meme'))
  ];
}

export function selectStage3000EvalTargets(reviewed,{count=30}={}) {
  if(!Array.isArray(reviewed)||reviewed.length<count) throw new Error(`Need at least ${count} reviewed stage-3,000 records to select evaluation targets.`);
  if(reviewed.some(record=>typeof record?.id!=='string'||!record.id.trim())||new Set(reviewed.map(record=>record.id)).size!==reviewed.length) throw new Error('Reviewed stage-3,000 records need unique non-empty IDs.');
  const ranked=[...reviewed].sort((a,b)=>{
    const score=record=>0.45*signal(record,'meme_strength')+0.35*signal(record,'asset_quality')+0.2*signal(record,'uniqueness_score');
    return score(b)-score(a)||String(a.id).localeCompare(String(b.id));
  });
  const selected=[];
  const seenTags=new Map();
  const pool=ranked.slice(0,Math.max(count*8,count));
  while(selected.length<count) {
    const remaining=pool.filter(record=>!selected.includes(record));
    if(!remaining.length) throw new Error(`Could not select ${count} distinct stage-3,000 evaluation targets.`);
    remaining.sort((a,b)=>{
      const diversity=record=>normalizedTags(record).reduce((total,tag)=>total+1/(1+(seenTags.get(tag)??0)),0);
      return diversity(b)-diversity(a)||ranked.indexOf(a)-ranked.indexOf(b)||String(a.id).localeCompare(String(b.id));
    });
    const next=remaining[0];
    selected.push(next);
    for(const tag of normalizedTags(next)) seenTags.set(tag,(seenTags.get(tag)??0)+1);
  }
  return selected;
}

export function validateFreshStage3000Humour(rows,{targetIds,excludedContexts=[]}) {
  if(!Array.isArray(rows)||rows.length!==30) throw new Error(`Fresh stage-3,000 humour evaluation needs exactly 30 cases; found ${rows?.length??0}.`);
  if(!(targetIds instanceof Set)||targetIds.size!==30) throw new Error('Fresh humour validation needs exactly 30 selected target IDs.');
  const contexts=new Set(excludedContexts.map(normalizedContext).filter(Boolean));
  const primaryTargets=new Set();
  for(const [index,row] of rows.entries()) {
    if(row.id!==`eval-stage3000-fresh-humour-${String(index+1).padStart(3,'0')}`) throw new Error(`Fresh humour case ${index+1} has an invalid or out-of-order ID.`);
    if(typeof row.title!=='string'||!row.title.trim()) throw new Error(`${row.id} needs a title.`);
    const context=normalizedContext(row.context);
    if(row.context?.trim().length<30||contexts.has(context)) throw new Error(`${row.id} needs a unique, concrete context not reused from the prior shadow set.`);
    contexts.add(context);
    if(row.intent_label!=='humour'||row.review_status!=='pending_owner_review'||row.human_validated!==false) throw new Error(`${row.id} must be unvalidated pending-owner-review humour.`);
    if(!targetIds.has(row.primary_target_id)||primaryTargets.has(row.primary_target_id)) throw new Error(`${row.id} must use one distinct selected stage-3,000 primary target.`);
    if(!Array.isArray(row.acceptable_ids)||row.acceptable_ids.length<1||row.acceptable_ids.length>4||new Set(row.acceptable_ids).size!==row.acceptable_ids.length||!row.acceptable_ids.includes(row.primary_target_id)||row.acceptable_ids.some(id=>!targetIds.has(id))) throw new Error(`${row.id} has invalid acceptable IDs.`);
    if(!Array.isArray(row.failure_modes)||row.failure_modes.length===0) throw new Error(`${row.id} needs failure modes.`);
    primaryTargets.add(row.primary_target_id);
  }
  return {cases:rows.length,distinct_primary_targets:primaryTargets.size,pending_owner_review:rows.length,human_validated:false};
}

export function validateStage3000Evaluation(cases,{priorShadow,stage3000Ids}) {
  if(!Array.isArray(cases)||cases.length!==100) throw new Error(`Stage-3,000 evaluation must contain exactly 100 cases; found ${cases?.length??0}.`);
  if(!Array.isArray(priorShadow)||priorShadow.length!==60) throw new Error('Validation needs the frozen 60-case stage-1,000 shadow set.');
  if(!(stage3000Ids instanceof Set)||stage3000Ids.size<30) throw new Error('Validation needs at least 30 reviewed stage-3,000 IDs.');
  const contexts=new Set();
  const primaryTargets=new Set();
  let humour=0;
  let noMeme=0;
  for(const [index,row] of cases.entries()) {
    assertCommon(row,index);
    const context=normalizedContext(row.context);
    if(contexts.has(context)) throw new Error(`${row.id} reuses another evaluation context.`);
    contexts.add(context);
    if(row.intent_label==='humour') humour+=1;
    else noMeme+=1;
    if(index<60) {
      const source=priorShadow[index];
      if(row.case_origin!==PRIOR_ORIGIN||row.label_provenance!==PRIOR_PROVENANCE||row.source_case_id!==source.id) throw new Error(`${row.id} lost its prior-shadow provenance.`);
      for(const field of PRESERVED_FIELDS) if(JSON.stringify(row[field])!==JSON.stringify(source[field])) throw new Error(`${row.id} changed preserved prior-shadow field ${field}.`);
      continue;
    }
    if(row.case_origin!==SYNTHETIC_ORIGIN||row.label_provenance!==SYNTHETIC_PROVENANCE) throw new Error(`${row.id} must be marked synthetic assistant-authored pending owner review.`);
    if(index<90) {
      if(row.intent_label!=='humour') throw new Error(`${row.id} must be a fresh humour case.`);
      if(typeof row.primary_target_id!=='string'||!stage3000Ids.has(row.primary_target_id)||!row.acceptable_ids.includes(row.primary_target_id)) throw new Error(`${row.id} needs a reviewed stage-3,000 primary target included in acceptable_ids.`);
      if(primaryTargets.has(row.primary_target_id)) throw new Error(`${row.id} reuses stage-3,000 primary target ${row.primary_target_id}.`);
      if(row.acceptable_ids.some(id=>!stage3000Ids.has(id))) throw new Error(`${row.id} contains an acceptable ID outside the reviewed stage-3,000 additions.`);
      primaryTargets.add(row.primary_target_id);
    } else if(row.intent_label!=='no_meme') throw new Error(`${row.id} must be a fresh serious/no-meme case.`);
  }
  if(humour!==75||noMeme!==25) throw new Error(`Stage-3,000 evaluation must contain 75 humour and 25 no-meme cases; found ${humour}/${noMeme}.`);
  if(primaryTargets.size!==30) throw new Error(`Fresh humour cases must cover 30 distinct stage-3,000 targets; found ${primaryTargets.size}.`);
  return {
    cases:cases.length,
    humour,
    no_meme:noMeme,
    prior_shadow_cases:60,
    synthetic_assistant_authored_cases:40,
    fresh_humour_cases:30,
    fresh_no_meme_cases:10,
    distinct_stage3000_targets:primaryTargets.size,
    pending_owner_review:cases.length,
    human_validated:false
  };
}

export const stage3000EvalProvenance={
  prior_origin:PRIOR_ORIGIN,
  synthetic_origin:SYNTHETIC_ORIGIN,
  prior_label:PRIOR_PROVENANCE,
  synthetic_label:SYNTHETIC_PROVENANCE
};
