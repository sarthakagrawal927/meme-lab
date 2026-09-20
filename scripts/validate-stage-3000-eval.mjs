import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateStage3000Evaluation} from './stage-3000-eval-lib.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const parseJsonl=(text,label)=>text.trim().split('\n').filter(Boolean).map((line,index)=>{
  try { return JSON.parse(line); }
  catch { throw new Error(`${label} has invalid JSON on line ${index+1}.`); }
});
const paths={
  cases:resolve(root,'eval/relevance_stage3000_v1.jsonl'),
  prior:resolve(root,'eval/relevance_stage1000_shadow_v1.jsonl'),
  reviewed:resolve(root,'expansion/reviewed/stage-3000.jsonl')
};
let texts;
try { texts=await Promise.all(Object.values(paths).map(path=>readFile(path,'utf8'))); }
catch(error) {
  if(error?.code==='ENOENT') throw new Error('Stage-3,000 evaluation is incomplete. Generate reviewed metadata and the fresh humour slice, then run scripts/build-stage-3000-eval.mjs.');
  throw error;
}
const [casesText,priorText,reviewedText]=texts;
const cases=parseJsonl(casesText,'stage-3,000 evaluation');
const priorShadow=parseJsonl(priorText,'stage-1,000 shadow evaluation');
const reviewed=parseJsonl(reviewedText,'stage-3,000 reviewed metadata');
console.log(JSON.stringify(validateStage3000Evaluation(cases,{priorShadow,stage3000Ids:new Set(reviewed.map(record=>record.id))}),null,2));
