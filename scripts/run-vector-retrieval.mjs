import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const endpoint=(process.argv[2]??'http://127.0.0.1:8788').replace(/\/$/,'');
const cases=parseJsonl(await readFile(resolve(root,'eval/relevance_holdout_v1.jsonl'),'utf8'),'relevance holdout').filter(row=>row.intent_label==='humour');
const rows=[];

for(const testCase of cases) {
  const response=await fetch(`${endpoint}/query?q=${encodeURIComponent(testCase.context)}&topK=30&hybrid=1`);
  if(!response.ok) throw new Error(`${testCase.id} query failed with HTTP ${response.status}.`);
  const payload=await response.json();
  const ids=payload.matches.map(match=>match.id);
  const bestRank=Math.min(...testCase.acceptable_ids.map(id=>{
    const index=ids.indexOf(id);
    return index===-1?Number.POSITIVE_INFINITY:index+1;
  }));
  rows.push({
    id:testCase.id,
    title:testCase.title,
    acceptable_ids:testCase.acceptable_ids,
    top_30_ids:ids,
    best_acceptable_rank:Number.isFinite(bestRank)?bestRank:null,
    hit_at_1:bestRank<=1,
    hit_at_3:bestRank<=3,
    hit_at_30:bestRank<=30
  });
}

const count=key=>rows.filter(row=>row[key]).length;
const report={
  version:'stage-300-retrieval-draft-v1',
  created_at:new Date().toISOString(),
  catalogue_records:300,
  embedding_model:'@cf/baai/bge-base-en-v1.5',
  pooling:'cls',
  retrieval:'semantic_top_20_plus_control_top_10',
  cases:rows.length,
  labels:'assistant-authored_pending_owner_review',
  retrieval_only:true,
  metrics:{
    hit_at_1:{count:count('hit_at_1'),rate:count('hit_at_1')/rows.length},
    hit_at_3:{count:count('hit_at_3'),rate:count('hit_at_3')/rows.length},
    hit_at_30:{count:count('hit_at_30'),rate:count('hit_at_30')/rows.length}
  },
  rows
};

await mkdir(resolve(root,'eval/results'),{recursive:true});
await writeFile(resolve(root,'eval/results/stage-300-retrieval.json'),`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify(report.metrics,null,2));
