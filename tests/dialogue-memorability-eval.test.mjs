import test from 'node:test';
import assert from 'node:assert/strict';
import {orientMemorabilityCase,selectMemorabilityCases,summarizeMemorabilityRun} from '../src/dialogue-memorability-eval.mjs';

const pair=index=>({id:`pair-${index}`,work_title:`Film ${index}`,memorable:{annotation_quote:`Memorable ${index}`},non_memorable:{quote:`Plain ${index}`}});

test('memorability sample is deterministic, film-distinct, and position-balanced',()=>{
  const pairs=Array.from({length:220},(_,index)=>pair(index));
  const cases=selectMemorabilityCases(pairs,200);
  assert.deepEqual(cases,selectMemorabilityCases(pairs,200));
  assert.equal(new Set(cases.map(row=>row.case_id)).size,200);
  assert.equal(cases.filter(row=>row.expected_choice==='A').length,100);
  assert.equal(cases.filter(row=>row.expected_choice==='B').length,100);
  assert.deepEqual(orientMemorabilityCase(pair(0),1),{case_id:'pair-0',left:'Plain 0',right:'Memorable 0',expected_choice:'B'});
});

test('memorability report exposes accuracy, position bias, and latency',()=>{
  const cases=[orientMemorabilityCase(pair(0),0),orientMemorabilityCase(pair(1),1)];
  const results=[{case_id:'pair-0',choice:'A',duration_ms:10},{case_id:'pair-1',choice:'A',duration_ms:20}];
  assert.deepEqual(summarizeMemorabilityRun(cases,results),{
    cases:2,completed:2,correct:1,accuracy:.5,expected_position_balance:{A:1,B:1},prediction_distribution:{A:2,B:0},accuracy_by_expected_position:{A:1,B:0},latency_ms:{p50:10,p95:10}
  });
});
