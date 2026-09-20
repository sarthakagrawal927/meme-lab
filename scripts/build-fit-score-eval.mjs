import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {rankCandidates} from '../worker/src/classification.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const endpoint=(process.argv[2]??'https://meme-lab-catalogue-tool-stage-3000.sarthakagrawal927.workers.dev').replace(/\/$/,'');
const parseJsonl=text=>text.trim().split('\n').filter(Boolean).map(JSON.parse);
const [caseText,catalogueText]=await Promise.all([
  readFile(resolve(root,'eval/relevance_stage3000_v1.jsonl'),'utf8'),
  readFile(resolve(root,'worker/tools/stage-3000-catalogue.json'),'utf8')
]);
const catalogue=JSON.parse(catalogueText);
const byId=new Map(catalogue.map(record=>[record.id,record]));
const cases=parseJsonl(caseText)
  .filter(record=>record.case_origin==='prior_stage1000_shadow'&&record.intent_label==='humour')
  .slice(0,12);
const rows=[];

for(const [index,testCase] of cases.entries()) {
  const response=await fetch(`${endpoint}/query?q=${encodeURIComponent(testCase.context)}&topK=30&hybrid=1`,{signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new Error(`${testCase.id} retrieval failed with HTTP ${response.status}.`);
  const matches=(await response.json())?.matches;
  if(!Array.isArray(matches)||matches.length<29) throw new Error(`${testCase.id} retrieval returned too few candidates.`);
  const targetId=testCase.acceptable_ids[0];
  if(!byId.has(targetId)) throw new Error(`${testCase.id} target ${targetId} is missing from the catalogue.`);
  const shortlistIds=[...new Set([targetId,...matches.map(match=>match.id)])].filter(id=>byId.has(id)).slice(0,30);
  if(shortlistIds.length!==30) throw new Error(`${testCase.id} could not freeze a 30-candidate shortlist.`);
  const ranked=await rankCandidates(testCase.context,shortlistIds.map(id=>byId.get(id)),{limit:30,timeoutMs:5000});
  const negatives=ranked.filter(record=>!testCase.acceptable_ids.includes(record.id)).slice(0,4).map(record=>record.id);
  if(negatives.length!==4) throw new Error(`${testCase.id} could not select four hard negatives.`);
  const candidateIds=[targetId,...negatives];
  const targetPosition=index%candidateIds.length;
  candidateIds.splice(targetPosition,0,candidateIds.shift());
  rows.push({
    id:`fit-score-${String(index+1).padStart(3,'0')}`,
    source_case_id:testCase.id,
    title:testCase.title,
    context:testCase.context,
    shortlist_ids:shortlistIds,
    candidate_ids:candidateIds,
    positive_ids:[targetId],
    label_provenance:testCase.label_provenance,
    review_status:'pending_owner_review',
    human_validated:false
  });
  console.log(`${testCase.id} -> ${targetId} + ${negatives.length} hard negatives`);
}

await writeFile(resolve(root,'eval/fit_score_v1.jsonl'),`${rows.map(row=>JSON.stringify(row)).join('\n')}\n`);
console.log(JSON.stringify({cases:rows.length,candidates_per_case:5,shortlist_size:30,human_validated:false},null,2));
