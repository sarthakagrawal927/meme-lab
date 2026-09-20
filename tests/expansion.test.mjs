import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseJsonl,validateExpansionRecords,validateEvalCases,validateStages,expansionStatus} from '../src/expansion.mjs';

const catalogue=JSON.parse(await readFile(new URL('../worker/public/catalogue.json',import.meta.url),'utf8'));
const candidates=parseJsonl(await readFile(new URL('../expansion/candidates/stage-300-seed.jsonl',import.meta.url),'utf8'));
const cases=parseJsonl(await readFile(new URL('../eval/relevance_holdout_v1.jsonl',import.meta.url),'utf8'));
const manifest=JSON.parse(await readFile(new URL('../expansion/stages.json',import.meta.url),'utf8'));

test('stage-300 seed adds 30 non-live candidates without ID collisions',()=>{
  assert.equal(candidates.length,30);
  assert.doesNotThrow(()=>validateExpansionRecords(candidates,{knownIds:catalogue.map(record=>record.id)}));
  assert(candidates.every(record=>record.review.status==='needs_asset_and_delivery_review'));
  assert(candidates.every(record=>record.media.rights_status==='not_established'));
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
  const status=expansionStatus({manifest,liveCount:catalogue.length,candidateCount:candidates.length,evalSummary:{cases:30,humour:20,no_meme:10,pending_owner_review:30}});
  assert.equal(status.sourced_records,60);
  assert.equal(status.records_to_source,240);
});

test('validators reject duplicate expansion IDs and accidental holdout approval',()=>{
  assert.throws(()=>validateExpansionRecords([candidates[0]],{knownIds:[candidates[0].id]}),/Duplicate/);
  const changed=cases.map(record=>({...record}));
  changed[0].human_validated=true;
  assert.throws(()=>validateEvalCases(changed,{allowedIds:new Set(catalogue.map(record=>record.id))}),/explicitly unvalidated/);
});
