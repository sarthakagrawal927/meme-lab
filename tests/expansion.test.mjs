import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseJsonl,validateExpansionRecords,validateEvalCases,validateStageCoverageCases,validateCoverageMetadata,validateStages,expansionStatus} from '../src/expansion.mjs';

const catalogue=JSON.parse(await readFile(new URL('../worker/public/catalogue.json',import.meta.url),'utf8'));
const publicCollection=JSON.parse(await readFile(new URL('../worker/public/collection.json',import.meta.url),'utf8'));
const candidates=parseJsonl(await readFile(new URL('../expansion/candidates/stage-300.jsonl',import.meta.url),'utf8'));
const source=parseJsonl(await readFile(new URL('../expansion/sources/stage-300-source.jsonl',import.meta.url),'utf8'));
const cases=parseJsonl(await readFile(new URL('../eval/relevance_holdout_v1.jsonl',import.meta.url),'utf8'));
const coverageCases=parseJsonl(await readFile(new URL('../eval/relevance_stage300_v1.jsonl',import.meta.url),'utf8'));
const manifest=JSON.parse(await readFile(new URL('../expansion/stages.json',import.meta.url),'utf8'));
const stageReport=JSON.parse(await readFile(new URL('../eval/stage-300-summary.json',import.meta.url),'utf8'));
const coverageReport=JSON.parse(await readFile(new URL('../eval/stage-300-coverage-summary.json',import.meta.url),'utf8'));

test('stage-300 pool adds 270 non-live candidates without ID collisions',()=>{
  assert.equal(candidates.length,270);
  assert.equal(source.length,300);
  assert.doesNotThrow(()=>validateExpansionRecords(candidates,{knownIds:catalogue.map(record=>record.id)}));
  assert(candidates.every(record=>record.review.status==='needs_asset_and_delivery_review'));
  assert(candidates.every(record=>record.media.rights_status==='not_established'));
});

test('public collection exposes all sourced records with honest availability labels',()=>{
  assert.equal(publicCollection.length,300);
  assert.equal(publicCollection.filter(record=>record.availability==='live').length,300);
  assert.equal(new Set(publicCollection.map(record=>record.id)).size,300);
  assert(publicCollection.every(record=>record.availability==='live'));
});

test('relevance holdout has 20 humour and 10 no-meme cases pending owner review',()=>{
  const summary=validateEvalCases(cases,{allowedIds:new Set(catalogue.map(record=>record.id))});
  assert.deepEqual(summary,{cases:30,humour:20,no_meme:10,pending_owner_review:30});
  assert(cases.some(record=>record.acceptable_ids.length>1));
});

test('expansion stages preserve direct control and bounded retrieval',()=>{
  const stages=validateStages(manifest);
  assert.equal(stages[0].retrieval.strategy,'direct_all_candidates');
  assert(stages.slice(1).every(stage=>stage.retrieval.shortlist_size===30&&stage.retrieval.result_size===3));
  const status=expansionStatus({manifest,liveCount:catalogue.length+candidates.length,candidateCount:0,reviewedExternalCount:240,evalSummary:{cases:30,humour:20,no_meme:10,pending_owner_review:30}});
  assert.equal(status.sourced_records,300);
  assert.equal(status.live_records,300);
  assert.equal(status.candidate_records,0);
  assert.equal(status.assistant_reviewed_external_records,240);
  assert.equal(status.next_target,1000);
  assert.equal(status.records_to_source,700);
  assert.equal(status.retrieval.live,'semantic_top_30_then_rerank_top_3');
});

test('validators reject duplicate expansion IDs and accidental holdout approval',()=>{
  assert.throws(()=>validateExpansionRecords([candidates[0]],{knownIds:[candidates[0].id]}),/Duplicate/);
  const changed=cases.map(record=>({...record}));
  changed[0].human_validated=true;
  assert.throws(()=>validateEvalCases(changed,{allowedIds:new Set(catalogue.map(record=>record.id))}),/explicitly unvalidated/);
});

test('stage-300 draft clears absolute gates but does not claim control parity or promotion',()=>{
  assert.equal(stageReport.human_validated,false);
  assert.equal(stageReport.gates.absolute_stage_300.passed,true);
  assert.equal(stageReport.gates.control_parity.passed,false);
  assert.equal(stageReport.gates.owner_confirmed_eval,false);
  assert.equal(stageReport.promotion_ready,false);
});

test('stage-300 expansion coverage pilot passes draft gates without claiming promotion',()=>{
  const summary=validateStageCoverageCases(coverageCases,{allowedIds:new Set(candidates.map(record=>record.id)),excludedIds:catalogue.map(record=>record.id)});
  assert.deepEqual(summary,{cases:20,humour:20,pending_owner_review:20});
  assert.deepEqual(validateCoverageMetadata(coverageCases,candidates),{records:27});
  assert.equal(coverageReport.human_validated,false);
  assert.equal(coverageReport.gates.retrieval_at_30,true);
  assert.equal(coverageReport.gates.top_3,true);
  assert.equal(coverageReport.promotion_ready,false);
});
