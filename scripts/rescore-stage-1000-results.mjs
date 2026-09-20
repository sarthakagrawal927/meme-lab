import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dataset=process.argv[2]??'primary';
if(!['primary','shadow'].includes(dataset)) throw new Error(`Unsupported stage-1000 rescore dataset: ${dataset}.`);
const catalogueText=await readFile(resolve(root,'worker/tools/stage-1000-catalogue.json'),'utf8');
const casesText=await readFile(resolve(root,`eval/relevance_stage1000${dataset==='shadow'?'_shadow':''}_v1.jsonl`),'utf8');
const cases=parseJsonl(casesText);
const byId=new Map(cases.map(row=>[row.id,row]));
const inputHash=createHash('sha256').update(catalogueText).update(casesText).digest('hex');

function rate(rows,key) {
  return rows.length?rows.filter(row=>row[key]).length/rows.length:0;
}

const names=dataset==='shadow'?['stage-1000-shadow-jev-fast']:['stage-1000-baseline','stage-1000-jev-gated','stage-1000-jev-fast'];
for(const name of names) {
  const path=resolve(root,`eval/results/${name}.json`);
  const report=JSON.parse(await readFile(path,'utf8'));
  const rows=report.rows.map(row=>{
    const testCase=byId.get(row.id);
    if(!testCase) throw new Error(`${name} contains unknown case ${row.id}.`);
    const humour=testCase.intent_label==='humour';
    return {
      ...row,
      acceptable_ids:testCase.acceptable_ids,
      ...(humour?{
        retrieval_hit:testCase.acceptable_ids.some(id=>row.retrieved_ids.includes(id)),
        top_1_correct:testCase.acceptable_ids.includes(row.selected_ids[0]),
        top_3_correct:row.selected_ids.some(id=>testCase.acceptable_ids.includes(id))
      }:{})
    };
  });
  const humour=rows.filter(row=>(byId.get(row.id)?.intent_label??'humour')==='humour');
  const noMeme=rows.filter(row=>byId.get(row.id)?.intent_label==='no_meme');
  const retrievalHits=humour.filter(row=>row.retrieval_hit);
  const relevance={
    retrieval_at_30:rate(humour,'retrieval_hit'),
    top_1:rate(humour,'top_1_correct'),
    top_3:rate(humour,'top_3_correct'),
    top_3_given_retrieval:rate(retrievalHits,'top_3_correct')
  };
  const metrics=noMeme.length?{...report.metrics,...relevance,correct_abstention:rate(noMeme,'correct_abstention'),inappropriate_joking:rate(noMeme,'inappropriate_joking')}:{...report.metrics,...relevance};
  const gates={
    ...(report.gates??{}),
    retrieval_at_30:metrics.retrieval_at_30>=0.75,
    top_3:metrics.top_3>=0.72,
    ...(noMeme.length?{correct_abstention:metrics.correct_abstention>=0.82,inappropriate_joking:metrics.inappropriate_joking<=0.18}:{})
  };
  const rescored={...report,input_hash:inputHash,labels:dataset==='shadow'?'assistant-authored_cross_audited_pending_owner_review':'assistant-authored_twice_audited_pending_owner_review',metrics,gates,rows,rescored_at:new Date().toISOString()};
  const summary={...rescored};
  delete summary.rows;
  await Promise.all([
    writeFile(path,`${JSON.stringify(rescored,null,2)}\n`),
    writeFile(resolve(root,`eval/${name}-summary.json`),`${JSON.stringify(summary,null,2)}\n`)
  ]);
  console.log(name,JSON.stringify({metrics,gates}));
}
