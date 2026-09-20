import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('fit-score evaluation freezes twelve five-way hard-negative cases without claiming human validation',async()=>{
  const [text,ratingText]=await Promise.all([
    readFile(new URL('../eval/fit_score_v1.jsonl',import.meta.url),'utf8'),
    readFile(new URL('../eval/fit_score_blind_ratings_v2.jsonl',import.meta.url),'utf8')
  ]);
  const rows=text.trim().split('\n').map(JSON.parse);
  const ratings=ratingText.trim().split('\n').map(JSON.parse);
  const ratingsByCase=new Map(ratings.map(row=>[row.case_id,row]));
  assert.equal(rows.length,12);
  assert.equal(ratings.length,12);
  assert.equal(new Set(rows.map(row=>row.id)).size,12);
  for(const row of rows) {
    assert.equal(row.shortlist_ids.length,30);
    assert.equal(new Set(row.shortlist_ids).size,30);
    assert.equal(row.candidate_ids.length,5);
    assert.equal(new Set(row.candidate_ids).size,5);
    assert.equal(row.positive_ids.length,1);
    assert(row.candidate_ids.includes(row.positive_ids[0]));
    assert.equal(row.review_status,'pending_owner_review');
    assert.equal(row.human_validated,false);
    const blindReview=ratingsByCase.get(row.source_case_id);
    assert(blindReview);
    assert.equal(blindReview.reviewer,'independent_codex_luna_fixed_fixture');
    assert.equal(blindReview.blinded_to_model_outputs,true);
    assert.deepEqual(Object.keys(blindReview.ratings).sort(),[...row.candidate_ids].sort());
    assert(Object.values(blindReview.ratings).every(value=>Number.isInteger(value)&&value>=0&&value<=4));
  }
  const expensiveClock=rows.find(row=>row.source_case_id==='eval-stage3000-006');
  assert.match(expensiveClock.context,/use none of its features except the clock and shopping list/);
  assert.doesNotMatch(expensiveClock.context,/use every feature except/);
});
