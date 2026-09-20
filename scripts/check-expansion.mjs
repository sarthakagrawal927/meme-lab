import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl,promoteStage1000Status,validateExpansionRecords,validateEvalCases,validateOpenSourceCandidates,validateSourceCandidates,validateStageCoverageCases,validateStage1000Cases,validateCoverageMetadata,validateMeaningSpecificMetadata,validateStages,expansionStatus,withCandidatePool} from '../src/expansion.mjs';
import {auditUniqueness} from './audit-stage-3000-uniqueness.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const catalogue=JSON.parse(await readFile(resolve(root,'worker/public/catalogue.json'),'utf8'));
const publicCollection=JSON.parse(await readFile(resolve(root,'worker/public/collection.json'),'utf8'));
const candidatesText=await readFile(resolve(root,'expansion/candidates/stage-300.jsonl'),'utf8');
const candidates=parseJsonl(candidatesText,'stage-300 candidates');
const cases=parseJsonl(await readFile(resolve(root,'eval/relevance_holdout_v1.jsonl'),'utf8'),'relevance holdout');
const coverageCasesText=await readFile(resolve(root,'eval/relevance_stage300_v1.jsonl'),'utf8');
const coverageCases=parseJsonl(coverageCasesText,'stage-300 coverage holdout');
const manifest=JSON.parse(await readFile(resolve(root,'expansion/stages.json'),'utf8'));
const experiment=JSON.parse(await readFile(resolve(root,'eval/stage-300-summary.json'),'utf8'));
const coverageExperiment=JSON.parse(await readFile(resolve(root,'eval/stage-300-coverage-summary.json'),'utf8'));
const stage1000Candidates=parseJsonl(await readFile(resolve(root,'expansion/candidates/stage-1000.jsonl'),'utf8'),'stage-1000 candidates');
const stage300Source=parseJsonl(await readFile(resolve(root,'expansion/sources/stage-300-source.jsonl'),'utf8'),'stage-300 source');
const stage1000Source=parseJsonl(await readFile(resolve(root,'expansion/sources/stage-1000-source.jsonl'),'utf8'),'stage-1000 source');
const stage3000Phase1Source=parseJsonl(await readFile(resolve(root,'expansion/sources/stage-3000-source-phase1.jsonl'),'utf8'),'stage-3000 source phase 1');
const stage3000NgaSource=parseJsonl(await readFile(resolve(root,'expansion/sources/stage-3000-source-nga.jsonl'),'utf8'),'stage-3000 NGA source');
const stage3000Source=parseJsonl(await readFile(resolve(root,'expansion/sources/stage-3000-source.jsonl'),'utf8'),'stage-3000 combined source');
const stage1000Cases=parseJsonl(await readFile(resolve(root,'eval/relevance_stage1000_v1.jsonl'),'utf8'),'stage-1000 evaluation');
const stage1000Catalogue=JSON.parse(await readFile(resolve(root,'worker/tools/stage-1000-catalogue.json'),'utf8'));
const baselineExperiment=JSON.parse(await readFile(resolve(root,'eval/stage-1000-baseline-summary.json'),'utf8'));
const gatedExperiment=JSON.parse(await readFile(resolve(root,'eval/stage-1000-jev-gated-summary.json'),'utf8'));
const jevExperiment=JSON.parse(await readFile(resolve(root,'eval/stage-1000-jev-fast-summary.json'),'utf8'));
const shadowRelevanceExperiment=JSON.parse(await readFile(resolve(root,'eval/stage-1000-shadow-jev-fast-summary.json'),'utf8'));
const shadowSafetyExperiment=JSON.parse(await readFile(resolve(root,'eval/stage-1000-shadow-safety-gate-summary.json'),'utf8'));
const stage3000Acquisition=JSON.parse(await readFile(resolve(root,'expansion/sources/stage-3000-acquisition.json'),'utf8'));
const stage3000FingerprintManifest=JSON.parse(await readFile(resolve(root,'expansion/sources/stage-3000-image-fingerprints.json'),'utf8'));
const stage3000Uniqueness=JSON.parse(await readFile(resolve(root,'expansion/sources/stage-3000-uniqueness-report.json'),'utf8'));
const coverageInputHash=createHash('sha256').update(candidatesText).update(coverageCasesText).digest('hex');
if(coverageExperiment.input_hash!==coverageInputHash) throw new Error('Stage-300 coverage result is stale. Reseed the index and rerun npm run experiment:stage-300-coverage.');

validateExpansionRecords(candidates,{knownIds:catalogue.map(record=>record.id)});
validateStages(manifest);
const evalSummary=validateEvalCases(cases,{allowedIds:new Set(catalogue.map(record=>record.id))});
const coverageEvalSummary=validateStageCoverageCases(coverageCases,{allowedIds:new Set(candidates.map(record=>record.id)),excludedIds:catalogue.map(record=>record.id)});
validateCoverageMetadata(coverageCases,candidates);
validateExpansionRecords(stage1000Candidates,{knownIds:[...catalogue,...candidates].map(record=>record.id)});
validateMeaningSpecificMetadata(stage1000Candidates);
validateSourceCandidates(stage3000Phase1Source,{knownNames:[...stage300Source,...stage1000Source].map(record=>record.name),minimum:800});
validateOpenSourceCandidates(stage3000NgaSource,{minimum:1200});
if(JSON.stringify(stage3000Source)!==JSON.stringify([...stage3000Phase1Source,...stage3000NgaSource])) throw new Error('Stage-3000 combined source is stale. Run npm run build:stage-3000-source.');
if(stage3000Source.length!==stage3000Acquisition.raw_source_records) throw new Error('Stage-3000 source acquisition count does not match its generated pool.');
const currentUniqueness=auditUniqueness({targets:stage3000Source,references:publicCollection,fingerprints:stage3000FingerprintManifest.fingerprints});
if(JSON.stringify(currentUniqueness)!==JSON.stringify(stage3000Uniqueness)) throw new Error('Stage-3000 uniqueness report is stale. Run npm run fingerprint:stage-3000 and npm run audit:stage-3000.');
if(currentUniqueness.summary.incomplete_fingerprint_coverage) throw new Error('Stage-3000 image fingerprint coverage must be complete.');
const stage1000EvalSummary=validateStage1000Cases(stage1000Cases,{allowedIds:new Set(stage1000Catalogue.map(record=>record.id))});
if(stage1000Candidates.length!==700||stage1000Catalogue.length!==1000||new Set(stage1000Catalogue.map(record=>record.id)).size!==1000) throw new Error('Stage-1000 generated catalogue has the wrong size or duplicate IDs.');
const experimentSummary={created_at:experiment.created_at,human_validated:experiment.human_validated,labels:experiment.labels,stage_300_retrieval:experiment.stage_300_retrieval,control_30:experiment.metrics['control-30'],stage_300:experiment.metrics['stage-300'],gates:experiment.gates,promotion_ready:experiment.promotion_ready};
const baseStatus=expansionStatus({manifest,liveCount:catalogue.length+candidates.length,candidateCount:0,reviewedExternalCount:240,evalSummary,coverageEvalSummary,experimentSummary,coverageExperimentSummary:coverageExperiment});
const candidateStatus=withCandidatePool(baseStatus,{candidateCount:stage1000Candidates.length,reviewedExternalCount:240+stage1000Candidates.length,evalSummary:stage1000EvalSummary});
const status={
  ...promoteStage1000Status(candidateStatus,{liveCount:stage1000Catalogue.length,reviewedExternalCount:240+stage1000Candidates.length,evalSummary:stage1000EvalSummary,baselineExperiment,gatedExperiment,jevExperiment,shadowRelevanceExperiment,shadowSafetyExperiment}),
  stage_3000_source:{
    status:'building',
    raw_source_records:stage3000Acquisition.raw_source_records,
    unique_after_hard_blocks:stage3000Uniqueness.summary.eligible_after_hard_blocks,
    hard_duplicate_candidates:stage3000Uniqueness.summary.blocked_targets,
    visual_review_candidates:stage3000Uniqueness.summary.review_only_targets,
    target_additions:stage3000Acquisition.target_additions,
    remaining_source_gap:Math.max(0,stage3000Acquisition.target_additions-stage3000Uniqueness.summary.eligible_after_hard_blocks),
    curation_buffer_after_hard_blocks:Math.max(0,stage3000Uniqueness.summary.eligible_after_hard_blocks-stage3000Acquisition.target_additions),
    post_visual_review_floor:stage3000Uniqueness.summary.eligible_after_hard_blocks-stage3000Uniqueness.summary.review_only_targets,
    providers:stage3000Acquisition.providers,
    image_fingerprint_coverage:stage3000Uniqueness.coverage.target_image_fingerprints,
    semantic_metadata_coverage:stage3000Uniqueness.coverage.target_semantic_metadata,
    human_validated:false
  }
};
const generated=JSON.parse(await readFile(resolve(root,'worker/public/expansion-status.json'),'utf8'));
if(JSON.stringify(status)!==JSON.stringify(generated)) throw new Error('Generated public expansion status is stale. Run npm run build:expansion.');

console.log(JSON.stringify({status:'passed',...status},null,2));
