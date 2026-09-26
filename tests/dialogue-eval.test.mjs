import test from 'node:test';
import assert from 'node:assert/strict';
import {dialogueCalibrationCheckpoint,dialogueReviewSummary,evaluateDialogueCalibration,stableDialogueEvalId,validateDialogueEvalCases,validateDialogueReview} from '../src/dialogue-eval.mjs';

const makeCase=index=>({
  id:stableDialogueEvalId(`dialogue-${index}`),
  dialogue_id:`dialogue-${index}`,
  quote:'That is exactly what I expected to hear.',
  work_title:`Film ${index}`,
  speaker:'Speaker',
  provenance:{provider:'English Wikiquote',source_url:'https://en.wikiquote.org/wiki/Film',revision_id:index+1},
  review_status:'pending_owner_review',
  human_validated:false,
  production_eligible:false
});

test('dialogue evaluation enforces stable unique quality-review cases',()=>{
  const rows=Array.from({length:4},(_,index)=>makeCase(index));
  assert.deepEqual(validateDialogueEvalCases(rows,{expectedCount:4}),{cases:4,distinct_dialogue:4,distinct_films:4,pending_owner_review:4});
  assert.throws(()=>validateDialogueEvalCases([...rows,rows[0]],{expectedCount:5}));
});

test('dialogue evaluation accepts traceable Cornell provenance',()=>{
  const rows=Array.from({length:2},(_,index)=>({...makeCase(index),provenance:{provider:'Cornell Movie-Quotes Corpus v1.0',source_url:'https://www.cs.cornell.edu/~cristian/memorability.html',line_id:String(index+1)}}));
  assert.equal(validateDialogueEvalCases(rows,{expectedCount:2}).cases,2);
});

test('dialogue review requires all three independent judgments',()=>{
  const row=makeCase(0);
  const allowed=new Set([row.id]);
  assert.deepEqual(validateDialogueReview({case_id:row.id,sendability:'sendable',standalone:'strong',strength:'memorable',note:'Works.'},allowed),{case_id:row.id,sendability:'sendable',standalone:'strong',strength:'memorable',note:'Works.'});
  assert.throws(()=>validateDialogueReview({case_id:row.id,sendability:'sendable',standalone:'strong'},allowed));
});

test('dialogue summary becomes human validated only when every case is reviewed',()=>{
  const cases=[makeCase(0),makeCase(1)];
  const first={event_type:'dialogue_review',case_id:cases[0].id,sendability:'sendable',standalone:'strong',strength:'solid'};
  assert.equal(dialogueReviewSummary(cases,[first]).human_validated,false);
  const summary=dialogueReviewSummary(cases,[first,{...first,case_id:cases[1].id,sendability:'reject'}]);
  assert.equal(summary.human_validated,true);
  assert.equal(summary.labels.sendability.sendable,1);
  assert.equal(summary.labels.sendability.reject,1);
});

test('dialogue calibration separates model precision and recall from owner keep labels',()=>{
  const cases=Array.from({length:4},(_,index)=>makeCase(index));
  const model=cases.map((row,index)=>({id:row.dialogue_id,passes_quality_gate:index<2,quality_score:[90,80,60,20][index]}));
  const owner=cases.map((row,index)=>({event_type:'dialogue_review',case_id:row.id,sendability:index===0||index===2?'sendable':'reject',standalone:'strong',strength:'solid'}));
  const result=evaluateDialogueCalibration(cases,model,owner,{minimumReviewed:4});
  assert.equal(result.status,'insufficient_owner_labels');
  assert.deepEqual(result.confusion,{true_positive:1,false_positive:1,false_negative:1,true_negative:1});
  assert.deepEqual(result.metrics,{precision:.5,recall:.5,accuracy:.5});
  assert.equal(result.disagreements.length,2);
  const hidden=dialogueCalibrationCheckpoint(result);
  assert.equal(hidden.metrics,null);
  assert.equal(hidden.labels_until_minimum,0);
  const ready=dialogueCalibrationCheckpoint({...result,status:'calibration_ready'});
  assert.deepEqual(ready.metrics,{precision:.5,recall:.5,accuracy:.5});
});
