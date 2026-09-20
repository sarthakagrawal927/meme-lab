import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const endpoint=(process.argv[2]??'http://127.0.0.1:8789').replace(/\/$/,'');
const catalogueText=await readFile(resolve(root,'worker/tools/stage-1000-catalogue.json'),'utf8');
const catalogue=JSON.parse(catalogueText);
const byId=new Map(catalogue.map(record=>[record.id,record]));
const casesText=await readFile(resolve(root,'eval/relevance_stage1000_v1.jsonl'),'utf8');
const cases=parseJsonl(casesText).filter(row=>row.intent_label==='humour');
const rows=[];
for(const testCase of cases) {
  const retrieved=await fetch(`${endpoint}/query?q=${encodeURIComponent(testCase.context)}&topK=30`,{signal:AbortSignal.timeout(10000)});
  if(!retrieved.ok) throw new Error(`${testCase.id} retrieval failed with HTTP ${retrieved.status}.`);
  const retrievedIds=(await retrieved.json()).matches.map(match=>match.id);
  const records=retrievedIds.map(id=>byId.get(id)).filter(Boolean);
  const labels=records.map(record=>`${record.id} | ${record.name}: ${record.message} Social dynamic: ${record.relational_pattern}`);
  const classified=await fetch('https://classifier.dev/v1/classify',{
    method:'POST',
    headers:{'content-type':'application/json'},
    signal:AbortSignal.timeout(5000),
    body:JSON.stringify({inputs:[testCase.context],labels,tier:'fast',instructions:'Rank the existing meme reaction whose social meaning, emotional tone, speaker-target relationship, and sendability best match the situation. Do not choose by shared keywords alone.'})
  });
  if(!classified.ok) throw new Error(`${testCase.id} Jev failed with HTTP ${classified.status}.`);
  const result=(await classified.json()).results?.[0];
  const ranked=records.map((record,index)=>({id:record.id,score:Number(result?.scores?.[labels[index]]??0),retrieval_rank:index+1})).sort((a,b)=>b.score-a.score||a.retrieval_rank-b.retrieval_rank);
  const selectedIds=ranked.slice(0,3).map(row=>row.id);
  rows.push({id:testCase.id,acceptable_ids:testCase.acceptable_ids,retrieved_ids:retrievedIds,selected_ids:selectedIds,retrieval_hit:testCase.acceptable_ids.some(id=>retrievedIds.includes(id)),top_1_correct:testCase.acceptable_ids.includes(selectedIds[0]),top_3_correct:selectedIds.some(id=>testCase.acceptable_ids.includes(id))});
}
const rate=key=>rows.filter(row=>row[key]).length/rows.length;
const hits=rows.filter(row=>row.retrieval_hit);
const metrics={retrieval_at_30:rate('retrieval_hit'),top_1:rate('top_1_correct'),top_3:rate('top_3_correct'),top_3_given_retrieval:hits.filter(row=>row.top_3_correct).length/hits.length};
const report={version:'stage-1000-jev-fast-v1',created_at:new Date().toISOString(),input_hash:createHash('sha256').update(catalogueText).update(casesText).digest('hex'),human_validated:false,cases:rows.length,metrics,rows};
await writeFile(resolve(root,'eval/results/stage-1000-jev-fast.json'),`${JSON.stringify(report,null,2)}\n`);
await writeFile(resolve(root,'eval/stage-1000-jev-fast-summary.json'),`${JSON.stringify({...report,rows:undefined},null,2)}\n`);
console.log(JSON.stringify(metrics,null,2));
