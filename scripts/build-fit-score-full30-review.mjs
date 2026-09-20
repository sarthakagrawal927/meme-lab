import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const reportName=process.argv[2]??'fit-score-followup-v1';
const armName=process.argv[3]??'ordinal_jev_fast_full30';
const outputName=process.argv[4]??'fit_score_full30_candidates_v1.jsonl';
const parseJsonl=text=>text.trim().split('\n').filter(Boolean).map(JSON.parse);
const [fixtureText,resultText]=await Promise.all([
  readFile(resolve(root,'eval/fit_score_v1.jsonl'),'utf8'),
  readFile(resolve(root,`eval/results/${reportName}.json`),'utf8')
]);
const cases=parseJsonl(fixtureText);
const report=JSON.parse(resultText);
const runs=report.runs?.[armName];
if(!Array.isArray(runs)) throw new Error(`The ${armName} arm is missing.`);

const rows=cases.map(testCase=>{
  const run=runs.find(record=>record.case_id===testCase.id&&record.repeat===0);
  if(!run) throw new Error(`Missing first full-30 run for ${testCase.id}.`);
  const candidateIds=Object.entries(run.scores)
    .sort((left,right)=>right[1]-left[1]||left[0].localeCompare(right[0]))
    .slice(0,5)
    .map(([id])=>id);
  if(candidateIds.length!==5||new Set(candidateIds).size!==5||candidateIds.some(id=>!testCase.shortlist_ids.includes(id))) throw new Error(`Invalid full-30 selection for ${testCase.id}.`);
  return {case_id:testCase.source_case_id,context:testCase.context,candidate_ids:candidateIds,review_status:'pending_blind_review'};
});

await writeFile(resolve(root,'eval',outputName),`${rows.map(row=>JSON.stringify(row)).join('\n')}\n`);
console.log(JSON.stringify({cases:rows.length,candidates:rows.length*5},null,2));
