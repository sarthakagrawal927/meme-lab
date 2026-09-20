import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl,validateStage1000ShadowCases} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const batchFiles=['relevance_stage1000_shadow_batch_a.jsonl','relevance_stage1000_shadow_batch_b.jsonl','relevance_stage1000_shadow_batch_c.jsonl'];
const batches=await Promise.all(batchFiles.map(async file=>parseJsonl(await readFile(resolve(root,'eval',file),'utf8'),file)));
if(batches.some(batch=>batch.length!==20)) throw new Error('Every shadow evaluation batch must contain exactly 20 cases.');
const cases=batches.flat();
const existing=parseJsonl(await readFile(resolve(root,'eval/relevance_stage1000_v1.jsonl'),'utf8'),'existing stage-1000 evaluation');
const catalogue=JSON.parse(await readFile(resolve(root,'worker/tools/stage-1000-catalogue.json'),'utf8'));
const summary=validateStage1000ShadowCases(cases,{allowedIds:new Set(catalogue.map(record=>record.id)),excludedContexts:existing.map(row=>row.context)});
await Promise.all([
  writeFile(resolve(root,'eval/relevance_stage1000_shadow_v1.jsonl'),`${cases.map(row=>JSON.stringify(row)).join('\n')}\n`),
  writeFile(resolve(root,'eval/stage-1000-shadow-definition.json'),`${JSON.stringify({version:'stage-1000-shadow-v1',labels:'assistant-authored_pending_owner_review',human_validated:false,batches:batchFiles,excluded_prior_cases:existing.length,...summary},null,2)}\n`)
]);
console.log(JSON.stringify(summary,null,2));
