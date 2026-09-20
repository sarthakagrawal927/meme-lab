import {access,readFile,writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildStage3000Evaluation,validateStage3000Evaluation} from './stage-3000-eval-lib.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const paths={
  prior:resolve(root,'eval/relevance_stage1000_shadow_v1.jsonl'),
  reviewed:resolve(root,'expansion/reviewed/stage-3000.jsonl'),
  humour:resolve(root,'eval/relevance_stage3000_fresh_humour.jsonl'),
  serious:resolve(root,'eval/relevance_stage3000_fresh_no_meme.jsonl'),
  output:resolve(root,'eval/relevance_stage3000_v1.jsonl'),
  definition:resolve(root,'eval/stage-3000-eval-definition.json')
};

function parseJsonl(text,label) {
  return text.trim().split('\n').filter(Boolean).map((line,index)=>{
    try { return JSON.parse(line); }
    catch { throw new Error(`${label} has invalid JSON on line ${index+1}.`); }
  });
}

async function requirePath(path,message) {
  try { await access(path,constants.R_OK); }
  catch { throw new Error(message); }
}

await requirePath(paths.reviewed,'Stage-3,000 reviewed metadata is not ready. Generate expansion/reviewed/stage-3000.jsonl before building this evaluation.');
await requirePath(paths.humour,'The 30 fresh humour labels are not ready. After reviewed metadata exists, author eval/relevance_stage3000_fresh_humour.jsonl with distinct reviewed primary_target_id values.');

const [priorText,reviewedText,humourText,seriousText]=await Promise.all([
  readFile(paths.prior,'utf8'),
  readFile(paths.reviewed,'utf8'),
  readFile(paths.humour,'utf8'),
  readFile(paths.serious,'utf8')
]);
const priorShadow=parseJsonl(priorText,'stage-1,000 shadow evaluation');
const reviewed=parseJsonl(reviewedText,'stage-3,000 reviewed metadata');
const freshHumour=parseJsonl(humourText,'stage-3,000 fresh humour evaluation');
const freshNoMeme=parseJsonl(seriousText,'stage-3,000 fresh serious evaluation');
const cases=buildStage3000Evaluation({priorShadow,freshHumour,freshNoMeme});
const summary=validateStage3000Evaluation(cases,{priorShadow,stage3000Ids:new Set(reviewed.map(record=>record.id))});
const definition={
  version:'stage-3000-eval-v1',
  label_status:'mixed_prior_shadow_and_synthetic_pending_owner_review',
  human_validated:false,
  sources:{
    prior_shadow:'eval/relevance_stage1000_shadow_v1.jsonl',
    reviewed_stage3000:'expansion/reviewed/stage-3000.jsonl',
    fresh_humour:'eval/relevance_stage3000_fresh_humour.jsonl',
    fresh_no_meme:'eval/relevance_stage3000_fresh_no_meme.jsonl'
  },
  ...summary
};
await Promise.all([
  writeFile(paths.output,`${cases.map(row=>JSON.stringify(row)).join('\n')}\n`),
  writeFile(paths.definition,`${JSON.stringify(definition,null,2)}\n`)
]);
console.log(JSON.stringify(summary,null,2));
