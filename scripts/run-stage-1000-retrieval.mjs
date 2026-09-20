import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const endpoint=(process.argv[2]??'http://127.0.0.1:8789').replace(/\/$/,'');
const cases=parseJsonl(await readFile(resolve(root,'eval/relevance_stage1000_v1.jsonl'),'utf8')).filter(row=>row.intent_label==='humour');
const rows=[];
for(const testCase of cases) {
  const response=await fetch(`${endpoint}/query?q=${encodeURIComponent(testCase.context)}&topK=50`,{signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new Error(`${testCase.id} retrieval failed with HTTP ${response.status}: ${await response.text()}`);
  const ids=(await response.json()).matches.map(match=>match.id);
  const rank=ids.findIndex(id=>testCase.acceptable_ids.includes(id))+1;
  rows.push({id:testCase.id,acceptable_ids:testCase.acceptable_ids,rank:rank||null,retrieved_ids:ids});
}
const recallAt=limit=>rows.filter(row=>row.rank&&row.rank<=limit).length/rows.length;
const metrics={recall_at_10:recallAt(10),recall_at_30:recallAt(30),recall_at_50:recallAt(50)};
await writeFile(resolve(root,'eval/stage-1000-retrieval-summary.json'),`${JSON.stringify({version:'stage-1000-single-vector-retrieval-v1',created_at:new Date().toISOString(),human_validated:false,cases:rows.length,metrics,misses_at_10:rows.filter(row=>!row.rank||row.rank>10).map(({id,rank})=>({id,rank})),misses_at_30:rows.filter(row=>!row.rank||row.rank>30).map(({id,rank})=>({id,rank})),misses_at_50:rows.filter(row=>!row.rank).map(({id,rank})=>({id,rank}))},null,2)}\n`);
console.log(JSON.stringify(metrics,null,2));
