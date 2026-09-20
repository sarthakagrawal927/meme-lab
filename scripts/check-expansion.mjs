import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl,validateExpansionRecords,validateEvalCases,validateStages,expansionStatus} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const catalogue=JSON.parse(await readFile(resolve(root,'worker/public/catalogue.json'),'utf8'));
const candidates=parseJsonl(await readFile(resolve(root,'expansion/candidates/stage-300.jsonl'),'utf8'),'stage-300 candidates');
const cases=parseJsonl(await readFile(resolve(root,'eval/relevance_holdout_v1.jsonl'),'utf8'),'relevance holdout');
const manifest=JSON.parse(await readFile(resolve(root,'expansion/stages.json'),'utf8'));
const experiment=JSON.parse(await readFile(resolve(root,'eval/stage-300-summary.json'),'utf8'));

validateExpansionRecords(candidates,{knownIds:catalogue.map(record=>record.id)});
validateStages(manifest);
const evalSummary=validateEvalCases(cases,{allowedIds:new Set(catalogue.map(record=>record.id))});
const experimentSummary={created_at:experiment.created_at,human_validated:experiment.human_validated,labels:experiment.labels,control_30:experiment.metrics['control-30'],stage_300:experiment.metrics['stage-300'],gates:experiment.gates,promotion_ready:experiment.promotion_ready};
const status=expansionStatus({manifest,liveCount:catalogue.length,candidateCount:candidates.length,reviewedExternalCount:240,evalSummary,experimentSummary});
const generated=JSON.parse(await readFile(resolve(root,'worker/public/expansion-status.json'),'utf8'));
if(JSON.stringify(status)!==JSON.stringify(generated)) throw new Error('Generated public expansion status is stale. Run npm run build:expansion.');

console.log(JSON.stringify({status:'passed',...status},null,2));
