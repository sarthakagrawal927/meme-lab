import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCornellOutputs,
  decodeCornellText,
  parseCornellMemorablePairs,
  parseCornellMemorableQuotes,
  parseCornellScriptLine,
  summarizeCornellOutputs
} from '../src/dialogue-cornell.mjs';

const memorable=`star wars\nThe Force is strong with this one.\n736048 The Force is strong with this one!\n\npsycho\nWe all go a little mad sometimes.\n621762 We all go a little mad sometimes.`;
const pairs=`star wars\nThe Force is strong with this one.\n736048 The Force is strong with this one!\n735122 Send a detachment down to retrieve them.`;

test('Cornell parsers retain annotation and controlled pair fields',()=>{
  assert.equal(decodeCornellText(Buffer.from([0x93,0x48,0x69,0x94])),'“Hi”');
  assert.equal(parseCornellMemorableQuotes(memorable).length,2);
  const pair=parseCornellMemorablePairs(pairs)[0];
  assert.equal(pair.memorable_line.line_id,'736048');
  assert.equal(pair.non_memorable_line.quote,'Send a detachment down to retrieve them.');
});

test('Cornell script parser preserves speaker and dialogue text',()=>{
  const row=parseCornellScriptLine('736048 +++$+++ star wars +++$+++ 42 +++$+++ vader +++$+++ 736047 +++$+++ The Force is strong with this one!');
  assert.deepEqual(row,{line_id:'736048',work_title:'star wars',line_number:42,speaker:'vader',reply_to:'736047',quote:'The Force is strong with this one!'});
});

test('Cornell output keeps memorable labels separate from production eligibility',()=>{
  const scriptLines=new Map([
    ['736048',parseCornellScriptLine('736048 +++$+++ star wars +++$+++ 42 +++$+++ vader +++$+++ 736047 +++$+++ The Force is strong with this one!')],
    ['735122',parseCornellScriptLine('735122 +++$+++ star wars +++$+++ 43 +++$+++ vader +++$+++ 736048 +++$+++ Send a detachment down to retrieve them.')]
  ]);
  const output=buildCornellOutputs(parseCornellMemorableQuotes(memorable),parseCornellMemorablePairs(pairs),scriptLines);
  assert.equal(output.records[0].memorability_label,'memorable');
  assert.equal(output.records[0].production_eligible,false);
  assert.equal(output.pairs[0].controls.reported_same_speaker,true);
  assert.equal(output.candidates.length,1);
  assert.deepEqual(summarizeCornellOutputs(output.records,output.pairs,{candidates:output.candidates,requestedLineIds:2,resolvedLineIds:2}),{
    memorable_records:2,paired_eval_cases:1,reaction_candidates:1,reaction_candidate_movies:1,distinct_movies:2,unique_normalized_quotes:2,duplicate_normalized_quotes:0,speaker_coverage:.5,paired_speaker_coverage:1,verified_same_speaker_pairs:1,unresolved_pair_speaker_checks:0,requested_script_line_ids:2,resolved_script_line_ids:2
  });
});
