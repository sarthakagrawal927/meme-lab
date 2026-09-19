import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT } from '../server.mjs';

const BASE=resolve(ROOT,'results/holdout-v1');
const manifest=JSON.parse(await readFile(resolve(BASE,'manifest.json'),'utf8'));
const blind=JSON.parse(await readFile(resolve(BASE,'blind_queue.json'),'utf8'));
const reviewers=await Promise.all(['a','b'].map(async name=>JSON.parse(await readFile(resolve(BASE,`reviewer-${name}.json`),'utf8'))));
const runFiles=(await readdir(resolve(BASE,'runs'))).filter(name=>name.startsWith('experiment-'));
const experiments=(await Promise.all(runFiles.map(async name=>JSON.parse(await readFile(resolve(BASE,'runs',name),'utf8')))));
const experimentByCase=new Map(experiments.map(row=>[row.case_id,row]));
const frozenByCase=new Map(manifest.frozen_cases.map(row=>[row.case_id,row]));
const blindByCase=new Map(blind.cases.map(row=>[row.case_id,row]));

function validateReviewer(reviewer) {
  if(reviewer.cases.length!==30) throw new Error(`Reviewer ${reviewer.reviewer} must contain 30 cases.`);
  for(const judged of reviewer.cases) {
    const source=blindByCase.get(judged.case_id);
    if(!source) throw new Error(`Reviewer ${reviewer.reviewer} has an unknown case: ${judged.case_id}.`);
    if(!['humour','no_meme'].includes(judged.independent_intent)) throw new Error(`Reviewer ${reviewer.reviewer} has an invalid intent for ${judged.case_id}.`);
    if(judged.arms.length!==source.arms.length) throw new Error(`Reviewer ${reviewer.reviewer} is missing an arm for ${judged.case_id}.`);
    for(const arm of judged.arms) {
      const sourceArm=source.arms.find(candidate=>candidate.blind_id===arm.blind_id);
      if(!sourceArm) throw new Error(`Reviewer ${reviewer.reviewer} has an unknown arm for ${judged.case_id}.`);
      const sourceIds=new Set(sourceArm.candidates.map(candidate=>candidate.id));
      if(arm.candidate_ratings.length!==sourceIds.size) throw new Error(`Reviewer ${reviewer.reviewer} did not rate every candidate for ${judged.case_id} arm ${arm.blind_id}.`);
      for(const rating of arm.candidate_ratings) {
        if(!sourceIds.has(rating.id)) throw new Error(`Reviewer ${reviewer.reviewer} rated unknown candidate ${rating.id} for ${judged.case_id}.`);
        if(!['send','related','miss'].includes(rating.verdict)) throw new Error(`Reviewer ${reviewer.reviewer} used an invalid verdict.`);
      }
    }
  }
}

for(const reviewer of reviewers) validateReviewer(reviewer);

function representationFor(caseId,blindId) {
  const experiment=experimentByCase.get(caseId);
  const arm=experiment?.arms.find(candidate=>candidate.blind_id===blindId);
  if(!arm) throw new Error(`Missing representation mapping for ${caseId} arm ${blindId}.`);
  return arm.representation;
}

function armRating(reviewer,caseId,representation) {
  const judged=reviewer.cases.find(row=>row.case_id===caseId);
  const arm=judged.arms.find(candidate=>representationFor(caseId,candidate.blind_id)===representation);
  const source=blindByCase.get(caseId).arms.find(candidate=>candidate.blind_id===arm.blind_id);
  const verdicts=new Map(arm.candidate_ratings.map(rating=>[rating.id,rating.verdict]));
  return {
    top_one_sendable:source.candidates.length>0&&verdicts.get(source.candidates[0].id)==='send',
    top_three_sendable:arm.candidate_ratings.some(rating=>rating.verdict==='send'),
    decision:source.decision
  };
}

function reviewerMetrics(reviewer) {
  const metrics={reviewer:reviewer.reviewer,intent_agreement:0,conditions:{}};
  for(const representation of ['minimal','enriched']) {
    const condition={humour_cases:20,no_meme_cases:10,top_one_sendable:0,top_three_sendable:0,correct_abstentions:0,inappropriate_joking:0,coverage:0,wins:0,losses:0,ties:0};
    for(const frozen of manifest.frozen_cases) {
      const rating=armRating(reviewer,frozen.case_id,representation);
      if(rating.decision==='meme') condition.coverage+=1;
      if(frozen.intent_label==='humour') {
        if(rating.top_one_sendable) condition.top_one_sendable+=1;
        if(rating.top_three_sendable) condition.top_three_sendable+=1;
      } else if(rating.decision==='none') condition.correct_abstentions+=1;
      else condition.inappropriate_joking+=1;
    }
    metrics.conditions[representation]=condition;
  }
  for(const frozen of manifest.frozen_cases) {
    const judged=reviewer.cases.find(row=>row.case_id===frozen.case_id);
    if(judged.independent_intent===frozen.intent_label) metrics.intent_agreement+=1;
    if(frozen.intent_label!=='humour') continue;
    const minimal=armRating(reviewer,frozen.case_id,'minimal').top_three_sendable;
    const enriched=armRating(reviewer,frozen.case_id,'enriched').top_three_sendable;
    if(enriched&&!minimal) { metrics.conditions.enriched.wins+=1; metrics.conditions.minimal.losses+=1; }
    else if(minimal&&!enriched) { metrics.conditions.minimal.wins+=1; metrics.conditions.enriched.losses+=1; }
    else { metrics.conditions.minimal.ties+=1; metrics.conditions.enriched.ties+=1; }
  }
  return metrics;
}

const perReviewer=reviewers.map(reviewerMetrics);
let candidateAgreement=0;
let candidateComparisons=0;
let intentAgreement=0;
for(const frozen of manifest.frozen_cases) {
  const [a,b]=reviewers.map(reviewer=>reviewer.cases.find(row=>row.case_id===frozen.case_id));
  if(a.independent_intent===b.independent_intent) intentAgreement+=1;
  for(const armA of a.arms) {
    const armB=b.arms.find(row=>row.blind_id===armA.blind_id);
    for(const ratingA of armA.candidate_ratings) {
      const ratingB=armB.candidate_ratings.find(row=>row.id===ratingA.id);
      candidateComparisons+=1;
      if(ratingB?.verdict===ratingA.verdict) candidateAgreement+=1;
    }
  }
}

const consensus={conditions:{}};
for(const representation of ['minimal','enriched']) {
  const condition={top_one_sendable:0,top_three_sendable:0,humour_cases:20,correct_abstentions:0,inappropriate_joking:0,no_meme_cases:10,coverage:0};
  for(const frozen of manifest.frozen_cases) {
    const ratings=reviewers.map(reviewer=>armRating(reviewer,frozen.case_id,representation));
    if(ratings[0].decision==='meme') condition.coverage+=1;
    if(frozen.intent_label==='humour') {
      if(ratings.every(rating=>rating.top_one_sendable)) condition.top_one_sendable+=1;
      if(ratings.every(rating=>rating.top_three_sendable)) condition.top_three_sendable+=1;
    } else if(ratings[0].decision==='none') condition.correct_abstentions+=1;
    else condition.inappropriate_joking+=1;
  }
  condition.continuation_gate=condition.top_three_sendable>=14&&condition.correct_abstentions>=8;
  consensus.conditions[representation]=condition;
}

const summary={
  version:'holdout-v1-summary',
  experiments:manifest.completed.length,
  model:manifest.model,
  dataset_hash:manifest.dataset_hash,
  prompt_hash:manifest.prompt_hash,
  reviewer_agreement:{
    independent_intent:`${intentAgreement}/30`,
    exact_candidate_verdict:`${candidateAgreement}/${candidateComparisons}`
  },
  per_reviewer:perReviewer,
  strict_consensus:consensus
};

await writeFile(resolve(BASE,'summary.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(summary,null,2));
