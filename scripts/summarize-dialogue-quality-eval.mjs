import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl} from '../src/expansion.mjs';
import {evaluateDialogueCalibration,parseDialogueEvalCases} from '../src/dialogue-eval.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const cases=parseDialogueEvalCases(await readFile(resolve(root,'eval/dialogue_quality_cases.jsonl'),'utf8'));
const modelReviews=parseJsonl(await readFile(resolve(root,'expansion/sources/dialogue-wikiquote-local-review.jsonl'),'utf8'),'Local dialogue reviews');
const runsDir=resolve(root,'runs');
let names=[];
try { names=(await readdir(runsDir)).filter(name=>/^dialogue_review-[a-f0-9-]{36}\.json$/.test(name)); }
catch(error) { if(error.code!=='ENOENT') throw error; }
const events=await Promise.all(names.map(async name=>JSON.parse(await readFile(resolve(runsDir,name),'utf8'))));
const caseById=new Map(cases.map(row=>[row.id,row]));
const report=evaluateDialogueCalibration(cases,modelReviews,events);
report.human_validated=report.reviewed===cases.length;
report.uncertainty=report.status==='calibration_ready'
  ?'Metrics compare one local model with owner source-quality labels; they do not measure text-to-dialogue retrieval relevance.'
  :'At least 50 owner labels, including 10 keeps and 10 rejects, are required before model-calibration metrics are decision-useful.';
report.disagreements=report.disagreements.map(row=>{
  const item=caseById.get(row.case_id);
  return {...row,quote:item.quote,work_title:item.work_title,speaker:item.speaker};
});
const output=resolve(root,'results/dialogue-quality-v1/report.json');
await mkdir(dirname(output),{recursive:true});
await writeFile(output,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({...report,disagreements:report.disagreements.length,output},null,2));
