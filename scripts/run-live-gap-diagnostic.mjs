import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const catalogue=JSON.parse(await readFile(resolve(root,'worker/public/collection.json'),'utf8'));
const cases=(await readFile(resolve(root,'eval/canonical_gap_v1.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
const knownIds=new Set(catalogue.map(record=>record.id));
const retrievalBase='https://meme-lab-catalogue-tool-stage-3000.sarthakagrawal927.workers.dev';
const productBase='https://memes.significanthobbies.com';
const retrievalOnly=process.argv.includes('--retrieval-only');

for(const testCase of cases) {
  if(!/^canonical-gap-\d{3}$/.test(testCase.id)||typeof testCase.comment!=='string'||testCase.comment.length<20) throw new Error(`Invalid case ${testCase.id}.`);
  if(!Array.isArray(testCase.acceptable_ids)||testCase.acceptable_ids.length===0) throw new Error(`${testCase.id} needs an acceptable meme.`);
  if(testCase.human_validated!==false) throw new Error(`${testCase.id} must remain marked as an assistant draft.`);
}

async function evaluate(testCase) {
  const presentIds=testCase.acceptable_ids.filter(id=>knownIds.has(id));
  const retrieved=await fetch(`${retrievalBase}/query?q=${encodeURIComponent(testCase.comment)}&topK=30&hybrid=1`,{signal:AbortSignal.timeout(10000)});
  if(!retrieved.ok) throw new Error(`${testCase.id} retrieval returned HTTP ${retrieved.status}.`);
  const retrievalBody=await retrieved.json();
  const retrievedIds=(retrievalBody.matches??[]).map(record=>record.id);
  let recommendationBody=null;
  let recommendationStatus=null;
  if(!retrievalOnly) {
    const recommended=await fetch(`${productBase}/api/recommend`,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({comment:testCase.comment}),
      signal:AbortSignal.timeout(15000)
    });
    recommendationStatus=recommended.status;
    recommendationBody=await recommended.json().catch(()=>({error:'Invalid recommendation response.'}));
  }
  const finalIds=(recommendationBody?.candidates??[]).map(record=>record.id);
  const firstRank=(ids,expected)=>{
    const ranks=expected.map(id=>ids.indexOf(id)).filter(index=>index>=0);
    return ranks.length?Math.min(...ranks)+1:null;
  };
  const retrievalRank=firstRank(retrievedIds,testCase.acceptable_ids);
  const finalRank=firstRank(finalIds,testCase.acceptable_ids);
  const safetyAbstention=recommendationBody?.decision==='none'&&/serious response/i.test(recommendationBody.none_reason??'');
  const providerUnavailable=!retrievalOnly&&recommendationStatus!==200;
  const diagnosis=presentIds.length===0?'data_gap':retrievalRank===null?'retrieval_gap':retrievalOnly?'retrieval_pass':providerUnavailable?'provider_gap':safetyAbstention?'safety_gap':finalRank===null?'ranking_gap':finalRank>1?'ordering_gap':'pass';
  return {
    ...testCase,
    present_ids:presentIds,
    retrieval_rank:retrievalRank,
    final_rank:finalRank,
    diagnosis,
    recommendation_status:recommendationStatus,
    decision:recommendationBody?.decision??null,
    none_reason:recommendationBody?.none_reason??recommendationBody?.error??'',
    retrieved_ids:retrievedIds,
    final_ids:finalIds
  };
}

const rows=[];
for(let start=0;start<cases.length;start+=3) {
  const batch=await Promise.all(cases.slice(start,start+3).map(evaluate));
  rows.push(...batch);
  for(const row of batch) console.log(`${row.id}\t${row.diagnosis}\tretrieval=${row.retrieval_rank??'-'}\tfinal=${row.final_rank??'-'}`);
}

const count=diagnosis=>rows.filter(row=>row.diagnosis===diagnosis).length;
const report={
  version:'canonical-gap-v1',
  created_at:new Date().toISOString(),
  scope:`bounded live diagnostic against ${rows.length} assistant-drafted full-sentence cases`,
  human_validated:false,
  cases:rows.length,
  summary:{
    pass:count('pass'),
    ordering_gap:count('ordering_gap'),
    ranking_gap:count('ranking_gap'),
    provider_gap:count('provider_gap'),
    safety_gap:count('safety_gap'),
    retrieval_gap:count('retrieval_gap'),
    data_gap:count('data_gap'),
    retrieval_recall_at_30:rows.filter(row=>row.retrieval_rank!==null).length/rows.length,
    final_recall_at_5:retrievalOnly?null:rows.filter(row=>row.final_rank!==null).length/rows.length,
    top_one:retrievalOnly?null:rows.filter(row=>row.final_rank===1).length/rows.length
  },
  rows
};
await mkdir(resolve(root,'eval/results'),{recursive:true});
await writeFile(resolve(root,'eval/results/canonical-gap-v1.json'),`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify(report.summary,null,2));
