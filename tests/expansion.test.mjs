import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseJsonl,validateOpenSourceCandidates,validateSourceCandidates,validateExpansionRecords,validateEvalCases,validateStageCoverageCases,validateStage1000Cases,validateCoverageMetadata,validateMeaningSpecificMetadata,validateStages,expansionStatus,withCandidatePool} from '../src/expansion.mjs';

const catalogue=JSON.parse(await readFile(new URL('../worker/public/catalogue.json',import.meta.url),'utf8'));
const publicCollection=JSON.parse(await readFile(new URL('../worker/public/collection.json',import.meta.url),'utf8'));
const stage300Collection=publicCollection.slice(0,300);
const candidates=parseJsonl(await readFile(new URL('../expansion/candidates/stage-300.jsonl',import.meta.url),'utf8'));
const source=parseJsonl(await readFile(new URL('../expansion/sources/stage-300-source.jsonl',import.meta.url),'utf8'));
const stage1000Source=parseJsonl(await readFile(new URL('../expansion/sources/stage-1000-source.jsonl',import.meta.url),'utf8'));
const stage3000Phase1Source=parseJsonl(await readFile(new URL('../expansion/sources/stage-3000-source-phase1.jsonl',import.meta.url),'utf8'));
const stage3000NgaSource=parseJsonl(await readFile(new URL('../expansion/sources/stage-3000-source-nga.jsonl',import.meta.url),'utf8'));
const stage3000Source=parseJsonl(await readFile(new URL('../expansion/sources/stage-3000-source.jsonl',import.meta.url),'utf8'));
const stage3000Acquisition=JSON.parse(await readFile(new URL('../expansion/sources/stage-3000-acquisition.json',import.meta.url),'utf8'));
const stage3000Uniqueness=JSON.parse(await readFile(new URL('../expansion/sources/stage-3000-uniqueness-report.json',import.meta.url),'utf8'));
const stage1000Candidates=parseJsonl(await readFile(new URL('../expansion/candidates/stage-1000.jsonl',import.meta.url),'utf8'));
const stage1000Cases=parseJsonl(await readFile(new URL('../eval/relevance_stage1000_v1.jsonl',import.meta.url),'utf8'));
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

test('public collection exposes the full live stage-1000 catalogue with previews',()=>{
  assert.equal(publicCollection.length,1000);
  assert.equal(publicCollection.filter(record=>record.availability==='live').length,1000);
  assert.equal(new Set(publicCollection.map(record=>record.id)).size,1000);
  assert(publicCollection.every(record=>record.availability==='live'));
  assert(publicCollection.every(record=>typeof record.image_url==='string'&&record.image_url.startsWith('https://')));
});

test('stage-1000 acquisition adds a bounded non-live source pool',()=>{
  assert.equal(stage1000Source.length,1000);
  assert.doesNotThrow(()=>validateSourceCandidates(stage1000Source,{knownNames:stage300Collection.map(record=>record.name),minimum:1000}));
  assert(stage1000Source.every(record=>record.review_status==='needs_metadata_review'&&record.human_validated===false));
});

test('stage-3000 acquisition closes the raw source gap with unique fingerprint coverage',()=>{
  assert.equal(stage3000Phase1Source.length,827);
  assert.equal(stage3000NgaSource.length,1400);
  assert.equal(stage3000Source.length,2227);
  assert.equal(stage3000Acquisition.raw_source_records,2227);
  assert.equal(stage3000Acquisition.remaining_raw_source_gap,0);
  assert.doesNotThrow(()=>validateSourceCandidates(stage3000Phase1Source,{knownNames:[...source,...stage1000Source].map(record=>record.name),minimum:800}));
  assert.doesNotThrow(()=>validateOpenSourceCandidates(stage3000NgaSource,{minimum:1200}));
  assert.equal(new Set(stage3000Source.map(record=>record.proposed_id)).size,2227);
  assert.equal(stage3000Uniqueness.coverage.target_image_fingerprints.present,2227);
  assert.equal(stage3000Uniqueness.coverage.target_image_fingerprints.total,2227);
  assert.equal(stage3000Uniqueness.summary.incomplete_fingerprint_coverage,false);
  assert.equal(stage3000Uniqueness.summary.eligible_after_hard_blocks,2221);
});

test('stage-1000 candidate pool contains 700 specific records and a diverse held-out evaluation',()=>{
  assert.equal(stage1000Candidates.length,700);
  assert.doesNotThrow(()=>validateExpansionRecords(stage1000Candidates,{knownIds:stage300Collection.map(record=>record.id)}));
  assert.deepEqual(validateMeaningSpecificMetadata(stage1000Candidates),{records:700});
  const evalSummary=validateStage1000Cases(stage1000Cases,{allowedIds:new Set([...publicCollection,...stage1000Candidates].map(record=>record.id))});
  assert.deepEqual(evalSummary,{cases:60,humour:45,no_meme:15,distinct_target_ids:105,pending_owner_review:60});
  const base=expansionStatus({manifest,liveCount:300,candidateCount:0,reviewedExternalCount:240,evalSummary:{cases:30,humour:20,no_meme:10,pending_owner_review:30}});
  const status=withCandidatePool(base,{candidateCount:700,reviewedExternalCount:940,evalSummary});
  assert.equal(status.sourced_records,1000);
  assert.equal(status.records_to_source,2000);
  assert.equal(status.records_to_ultimate_target,2000);
  assert.equal(status.ultimate_progress_percent,33);
  assert.equal(status.eval.stage_1000_cases,60);
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
  assert.equal(status.next_target,3000);
  assert.equal(status.records_to_source,2700);
  assert.equal(status.ultimate_target,3000);
  assert.equal(status.records_to_ultimate_target,2700);
  assert.equal(status.ultimate_progress_percent,10);
  assert.equal(status.retrieval.live,'semantic_top_30_then_rerank_top_3');
});

test('validators reject duplicate expansion IDs and accidental holdout approval',()=>{
  assert.throws(()=>validateExpansionRecords([candidates[0]],{knownIds:[candidates[0].id]}),/Duplicate/);
  const changed=cases.map(record=>({...record}));
  changed[0].human_validated=true;
  assert.throws(()=>validateEvalCases(changed,{allowedIds:new Set(catalogue.map(record=>record.id))}),/explicitly unvalidated/);
});

test('stage-1000 validators require specific metadata and a diverse 60-case evaluation',()=>{
  const specific=[
    {...candidates[0],message:'Use this when a confident claim collapses under the first check.',relational_pattern:'False confidence meets immediate contradiction.',example_context:'The launch owner promises zero errors seconds before the dashboard turns red.',near_miss_context:'Avoid when the speaker already expects the failure.'},
    {...candidates[1],id:'specific-second',message:'Use this when a quiet disagreement suddenly becomes theatrical.',relational_pattern:'A small conflict escalates into a public spectacle.',example_context:'Two reviewers turn a typo discussion into a twelve-message constitutional debate.',near_miss_context:'Avoid when everyone resolves the disagreement calmly.'}
  ];
  assert.deepEqual(validateMeaningSpecificMetadata(specific),{records:2});
  assert.throws(()=>validateMeaningSpecificMetadata([specific[0],{...specific[1],example_context:specific[0].example_context}]),/reuses another record's example_context/);
  assert.throws(()=>validateMeaningSpecificMetadata([{...specific[0],relational_pattern:'The visual makes that relationship explicit.'}]),/placeholder relational_pattern/);

  const allowedIds=new Set(Array.from({length:45},(_,index)=>`new-meme-${index+1}`));
  const stageCases=Array.from({length:60},(_,index)=>({
    id:`eval-stage1000-${String(index+1).padStart(3,'0')}`,
    context:`This is a distinct stage one thousand evaluation situation number ${index+1} with enough concrete detail.`,
    intent_label:index<45?'humour':'no_meme',
    acceptable_ids:index<45?[`new-meme-${index+1}`]:[],
    failure_modes:['wrong_social_dynamic'],
    review_status:'pending_owner_review',
    human_validated:false
  }));
  assert.deepEqual(validateStage1000Cases(stageCases,{allowedIds}),{cases:60,humour:45,no_meme:15,distinct_target_ids:45,pending_owner_review:60});
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
