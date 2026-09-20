import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildStage3000Evaluation,selectStage3000EvalTargets,stage3000EvalProvenance,validateFreshStage3000Humour,validateStage3000Evaluation} from '../scripts/stage-3000-eval-lib.mjs';

const prior=Array.from({length:60},(_,index)=>({
  id:`eval-shadow1000-${String(index+1).padStart(3,'0')}`,
  title:`Prior case ${index+1}`,
  context:`This is frozen prior shadow context number ${index+1} with enough distinct concrete detail for validation.`,
  intent_label:index<45?'humour':'no_meme',
  acceptable_ids:index<45?[`old-${index+1}`]:[],
  failure_modes:['wrong_target'],
  review_status:'pending_owner_review',
  human_validated:false
}));
const freshHumour=Array.from({length:30},(_,index)=>({
  id:`draft-humour-${index+1}`,
  title:`Fresh humour ${index+1}`,
  context:`A fresh stage three thousand social situation number ${index+1} unfolds with specific friends, consequences, and comic timing.`,
  intent_label:'humour',
  primary_target_id:`new-${index+1}`,
  acceptable_ids:[`new-${index+1}`],
  failure_modes:['wrong_social_dynamic'],
  review_status:'pending_owner_review',
  human_validated:false
}));
const freshNoMeme=Array.from({length:10},(_,index)=>({
  id:`draft-serious-${index+1}`,
  title:`Fresh serious ${index+1}`,
  context:`A fresh serious request number ${index+1} needs accurate, considerate help and must not receive a joke or meme response.`,
  intent_label:'no_meme',
  acceptable_ids:[],
  failure_modes:['forced_joke'],
  review_status:'pending_owner_review',
  human_validated:false
}));
const stage3000Ids=new Set(freshHumour.map(row=>row.primary_target_id));

test('stage-3000 evaluation preserves 60 prior-shadow cases and appends a marked 30/10 synthetic slice',()=>{
  const cases=buildStage3000Evaluation({priorShadow:prior,freshHumour,freshNoMeme});
  const summary=validateStage3000Evaluation(cases,{priorShadow:prior,stage3000Ids});
  assert.deepEqual(summary,{cases:100,humour:75,no_meme:25,prior_shadow_cases:60,synthetic_assistant_authored_cases:40,fresh_humour_cases:30,fresh_no_meme_cases:10,distinct_stage3000_targets:30,pending_owner_review:100,human_validated:false});
  assert.equal(cases[0].id,'eval-stage3000-001');
  assert.equal(cases[0].source_case_id,'eval-shadow1000-001');
  assert.equal(cases[0].case_origin,stage3000EvalProvenance.prior_origin);
  assert.equal(cases[60].id,'eval-stage3000-061');
  assert.equal(cases[60].label_provenance,stage3000EvalProvenance.synthetic_label);
  assert.equal(cases[99].id,'eval-stage3000-100');
});

test('stage-3000 validator rejects changes to frozen prior-shadow labels',()=>{
  const cases=buildStage3000Evaluation({priorShadow:prior,freshHumour,freshNoMeme});
  cases[4].context='This altered prior context is long enough but must still be rejected by provenance validation.';
  assert.throws(()=>validateStage3000Evaluation(cases,{priorShadow:prior,stage3000Ids}),/changed preserved prior-shadow field context/);
});

test('stage-3000 validator requires 30 distinct reviewed primary targets',()=>{
  const changed=freshHumour.map(row=>({...row,acceptable_ids:[...row.acceptable_ids]}));
  changed[1].primary_target_id=changed[0].primary_target_id;
  changed[1].acceptable_ids=[changed[0].primary_target_id];
  const cases=buildStage3000Evaluation({priorShadow:prior,freshHumour:changed,freshNoMeme});
  assert.throws(()=>validateStage3000Evaluation(cases,{priorShadow:prior,stage3000Ids}),/reuses stage-3,000 primary target/);
});

test('stage-3000 validator keeps serious cases empty and explicitly unvalidated',()=>{
  const cases=buildStage3000Evaluation({priorShadow:prior,freshHumour,freshNoMeme});
  cases[95].acceptable_ids=['new-1'];
  assert.throws(()=>validateStage3000Evaluation(cases,{priorShadow:prior,stage3000Ids}),/no-meme cases cannot have acceptable IDs/);
});

test('checked-in fresh serious slice contains ten unique pending-owner-review cases',async()=>{
  const text=await readFile(new URL('../eval/relevance_stage3000_fresh_no_meme.jsonl',import.meta.url),'utf8');
  const rows=text.trim().split('\n').map(JSON.parse);
  assert.equal(rows.length,10);
  assert.equal(new Set(rows.map(row=>row.context.trim().toLowerCase())).size,10);
  assert(rows.every(row=>row.intent_label==='no_meme'&&row.acceptable_ids.length===0&&row.review_status==='pending_owner_review'&&row.human_validated===false));
});

test('deferred generator target selection is deterministic, distinct, and tag-diverse',()=>{
  const reviewed=Array.from({length:80},(_,index)=>({id:`candidate-${String(index+1).padStart(3,'0')}`,meme_strength:100-index/2,asset_quality:90-index/3,uniqueness_score:80-index/4,tags:[`theme-${index%12}`,`relation-${index%7}`]}));
  const first=selectStage3000EvalTargets(reviewed);
  const second=selectStage3000EvalTargets(reviewed);
  assert.deepEqual(first.map(row=>row.id),second.map(row=>row.id));
  assert.equal(first.length,30);
  assert.equal(new Set(first.map(row=>row.id)).size,30);
  assert(new Set(first.flatMap(row=>row.tags)).size>=12);
});

test('fresh humour validator rejects prior-shadow context reuse',()=>{
  const rows=freshHumour.map((row,index)=>({...row,id:`eval-stage3000-fresh-humour-${String(index+1).padStart(3,'0')}`}));
  rows[0].context=prior[0].context;
  assert.throws(()=>validateFreshStage3000Humour(rows,{targetIds:stage3000Ids,excludedContexts:prior.map(row=>row.context)}),/not reused from the prior shadow set/);
});
