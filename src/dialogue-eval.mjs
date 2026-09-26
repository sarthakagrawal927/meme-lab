import {createHash} from 'node:crypto';

const SENDABILITY_LABELS=new Set(['sendable','maybe','reject']);
const STANDALONE_LABELS=new Set(['strong','usable','dependent']);
const STRENGTH_LABELS=new Set(['memorable','solid','generic']);

export function stableDialogueEvalId(dialogueId) {
  const digest=createHash('sha256').update(`${dialogueId}\0quality-review-v1`).digest('hex').slice(0,10);
  return `dialogue-eval-v1-${digest}`;
}

export function validateDialogueEvalCases(rows,{expectedCount=200}={}) {
  if(!Array.isArray(rows)||rows.length!==expectedCount) throw new Error(`Dialogue evaluation needs ${expectedCount} cases; found ${rows?.length??0}.`);
  const ids=new Set();
  const dialogueIds=new Set();
  const filmTitles=new Set();
  for(const row of rows) {
    if(typeof row?.id!=='string'||!/^dialogue-eval-v1-[a-f0-9]{10}$/.test(row.id)||ids.has(row.id)) throw new Error(`Invalid or duplicate dialogue evaluation ID: ${row?.id}.`);
    ids.add(row.id);
    if(typeof row.dialogue_id!=='string'||dialogueIds.has(row.dialogue_id)) throw new Error(`${row.id} needs a unique dialogue ID.`);
    dialogueIds.add(row.dialogue_id);
    if(row.id!==stableDialogueEvalId(row.dialogue_id)) throw new Error(`${row.id} is not the stable ID for its dialogue record.`);
    if(typeof row.quote!=='string'||row.quote.trim().length<3||row.quote.trim().length>500) throw new Error(`${row.id} needs an exact dialogue line.`);
    if(typeof row.work_title!=='string'||!row.work_title.trim()) throw new Error(`${row.id} needs a film title.`);
    if(filmTitles.has(row.work_title)) throw new Error(`${row.id} duplicates film title ${row.work_title}.`);
    filmTitles.add(row.work_title);
    if(typeof row.speaker!=='string'||!row.speaker.trim()) throw new Error(`${row.id} needs a speaker.`);
    const wikiquote=row.provenance?.provider==='English Wikiquote'&&row.provenance.source_url?.startsWith('https://en.wikiquote.org/wiki/')&&Number.isInteger(row.provenance.revision_id);
    const cornell=row.provenance?.provider==='Cornell Movie-Quotes Corpus v1.0'&&row.provenance.source_url==='https://www.cs.cornell.edu/~cristian/memorability.html'&&/^\d+$/.test(row.provenance.line_id??'');
    if(!wikiquote&&!cornell) throw new Error(`${row.id} needs supported source provenance.`);
    if(row.review_status!=='pending_owner_review'||row.human_validated!==false||row.production_eligible!==false) throw new Error(`${row.id} must remain pending and non-production.`);
  }
  return {cases:rows.length,distinct_dialogue:dialogueIds.size,distinct_films:filmTitles.size,pending_owner_review:rows.length};
}

export function parseDialogueEvalCases(text,options) {
  const rows=String(text??'').trim().split('\n').filter(Boolean).map((line,index)=>{
    try { return JSON.parse(line); }
    catch { throw new Error(`Dialogue evaluation line ${index+1} is invalid JSON.`); }
  });
  validateDialogueEvalCases(rows,options);
  return rows;
}

export function validateDialogueReview(value,allowedCaseIds) {
  if(!allowedCaseIds.has(value?.case_id)) throw new Error('Review one of the dialogue cases in the queue.');
  if(!SENDABILITY_LABELS.has(value.sendability)) throw new Error('Choose whether the dialogue is sendable, uncertain, or should be rejected.');
  if(!STANDALONE_LABELS.has(value.standalone)) throw new Error('Choose whether the line is strong, usable, or context-dependent on its own.');
  if(!STRENGTH_LABELS.has(value.strength)) throw new Error('Choose whether the line is memorable, solid, or generic.');
  if(typeof(value.note??'')!=='string'||(value.note??'').length>1000) throw new Error('Keep notes within 1,000 characters.');
  return {case_id:value.case_id,sendability:value.sendability,standalone:value.standalone,strength:value.strength,note:value.note??''};
}

export function dialogueReviewSummary(cases,reviews) {
  const allowed=new Set(cases.map(row=>row.id));
  const latest=new Map();
  for(const review of reviews) if(review.event_type==='dialogue_review'&&allowed.has(review.case_id)) latest.set(review.case_id,review);
  const count=field=>Object.fromEntries([...new Set([...latest.values()].map(review=>review[field]))].sort().map(label=>[label,[...latest.values()].filter(review=>review[field]===label).length]));
  return {
    total:cases.length,
    reviewed:latest.size,
    remaining:cases.length-latest.size,
    human_validated:cases.length>0&&cases.every(row=>latest.has(row.id)),
    labels:{sendability:count('sendability'),standalone:count('standalone'),strength:count('strength')}
  };
}

export function evaluateDialogueCalibration(cases,modelReviews,ownerEvents,{minimumReviewed=50}={}) {
  const modelByDialogue=new Map(modelReviews.map(review=>[review.id,review]));
  const ownerByCase=new Map();
  for(const event of ownerEvents) if(event.event_type==='dialogue_review') ownerByCase.set(event.case_id,event);
  const reviewed=cases.filter(row=>ownerByCase.has(row.id)&&modelByDialogue.has(row.dialogue_id)).map(row=>{
    const owner=ownerByCase.get(row.id);
    const model=modelByDialogue.get(row.dialogue_id);
    const ownerKeep=owner.sendability==='sendable'&&owner.standalone!=='dependent'&&owner.strength!=='generic';
    return {case_id:row.id,dialogue_id:row.dialogue_id,owner_keep:ownerKeep,model_keep:model.passes_quality_gate===true,model_score:model.quality_score,owner};
  });
  const cell=(ownerKeep,modelKeep)=>reviewed.filter(row=>row.owner_keep===ownerKeep&&row.model_keep===modelKeep).length;
  const tp=cell(true,true); const fp=cell(false,true); const fn=cell(true,false); const tn=cell(false,false);
  const ratio=(numerator,denominator)=>denominator?Number((numerator/denominator).toFixed(4)):null;
  const ownerKeeps=reviewed.filter(row=>row.owner_keep).length;
  const ownerRejects=reviewed.length-ownerKeeps;
  const bands=[
    {label:'low',minimum:0,maximum:44},
    {label:'mid',minimum:45,maximum:69},
    {label:'high',minimum:70,maximum:100}
  ].map(band=>{
    const rows=reviewed.filter(row=>Number.isFinite(row.model_score)&&row.model_score>=band.minimum&&row.model_score<=band.maximum);
    return {band:band.label,reviewed:rows.length,owner_keep_rate:ratio(rows.filter(row=>row.owner_keep).length,rows.length)};
  });
  const calibrationReady=reviewed.length>=minimumReviewed&&ownerKeeps>=10&&ownerRejects>=10;
  return {
    status:calibrationReady?'calibration_ready':'insufficient_owner_labels',
    reviewed:reviewed.length,
    remaining:cases.length-reviewed.length,
    minimum_reviewed:minimumReviewed,
    class_counts:{owner_keep:ownerKeeps,owner_reject:ownerRejects},
    confusion:{true_positive:tp,false_positive:fp,false_negative:fn,true_negative:tn},
    metrics:{precision:ratio(tp,tp+fp),recall:ratio(tp,tp+fn),accuracy:ratio(tp+tn,reviewed.length)},
    score_bands:bands,
    disagreements:reviewed.filter(row=>row.owner_keep!==row.model_keep)
  };
}

export function dialogueCalibrationCheckpoint(result,{minimumPerClass=10}={}) {
  const ready=result.status==='calibration_ready';
  return {
    status:result.status,
    reviewed:result.reviewed,
    minimum_reviewed:result.minimum_reviewed,
    labels_until_minimum:Math.max(0,result.minimum_reviewed-result.reviewed),
    minimum_per_class:minimumPerClass,
    class_counts:result.class_counts,
    class_shortfalls:{
      owner_keep:Math.max(0,minimumPerClass-result.class_counts.owner_keep),
      owner_reject:Math.max(0,minimumPerClass-result.class_counts.owner_reject)
    },
    metrics:ready?result.metrics:null,
    score_bands:ready?result.score_bands:null
  };
}
