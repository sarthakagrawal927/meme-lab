import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const [candidateFile,ratingFile,reportName,armName,outputFile]=process.argv.slice(2);
if(!candidateFile||!ratingFile||!reportName||!armName||!outputFile) throw new Error('Expected candidate file, rating file, report name, arm name, and output file.');
const parseJsonl=text=>text.trim().split('\n').filter(Boolean).map(JSON.parse);
const [candidateText,ratingText,fixtureText,reportText]=await Promise.all([
  readFile(resolve(root,'eval',candidateFile),'utf8'),
  readFile(resolve(root,'eval',ratingFile),'utf8'),
  readFile(resolve(root,'eval/fit_score_v1.jsonl'),'utf8'),
  readFile(resolve(root,`eval/results/${reportName}.json`),'utf8')
]);
const candidates=parseJsonl(candidateText);
const ratingsByCase=new Map(parseJsonl(ratingText).map(row=>[row.case_id,row]));
const fixtureBySource=new Map(parseJsonl(fixtureText).map(row=>[row.source_case_id,row]));
const runs=JSON.parse(reportText).runs?.[armName];
if(!Array.isArray(runs)) throw new Error(`Missing ${armName} results.`);
const mean=values=>values.reduce((total,value)=>total+value,0)/values.length;
const percentile=(values,fraction)=>{
  const ordered=[...values].sort((left,right)=>left-right);
  return ordered[Math.min(ordered.length-1,Math.ceil(ordered.length*fraction)-1)];
};
const discountedGain=values=>values.reduce((total,value,index)=>total+(2**value-1)/Math.log2(index+2),0);
const firstRatings=[];
const allRatings=[];
const ndcg=[];
const ordinalErrors=[];
const replayDrift=[];
const highScoreCorrect=[];
let topOneBest=0;
let anyExact=0;
let anySendable=0;
let inappropriateHigh=0;

for(const row of candidates) {
  const ratingRow=ratingsByCase.get(row.case_id);
  const fixture=fixtureBySource.get(row.case_id);
  const firstRun=runs.find(run=>run.case_id===fixture?.id&&run.repeat===0);
  const secondRun=runs.find(run=>run.case_id===fixture?.id&&run.repeat===1);
  if(!ratingRow||!fixture||!firstRun||!secondRun) throw new Error(`Incomplete selection evidence for ${row.case_id}.`);
  const values=row.candidate_ids.map(id=>ratingRow.ratings[id]);
  if(values.some(value=>!Number.isInteger(value))) throw new Error(`Incomplete ratings for ${row.case_id}.`);
  firstRatings.push(values[0]);
  allRatings.push(...values);
  if(values[0]===Math.max(...values)) topOneBest+=1;
  if(values.some(value=>value===4)) anyExact+=1;
  if(values.some(value=>value>=3)) anySendable+=1;
  ndcg.push(discountedGain(values)/discountedGain([...values].sort((left,right)=>right-left)));
  for(const [index,id] of row.candidate_ids.entries()) {
    const score=firstRun.scores[id];
    ordinalErrors.push(Math.abs(score-values[index]*25));
    replayDrift.push(Math.abs(score-secondRun.scores[id]));
    if(score>=75) {
      highScoreCorrect.push(values[index]>=3?1:0);
      if(values[index]<=1) inappropriateHigh+=1;
    }
  }
}

const summary={
  version:'fit-score-selection-v1',arm:armName,cases:candidates.length,candidates_per_case:5,
  labels:'independent_model_blind_review_pending_owner_review',human_validated:false,
  metrics:{
    first_exact:firstRatings.filter(value=>value===4).length/candidates.length,
    first_sendable:firstRatings.filter(value=>value>=3).length/candidates.length,
    first_mean_rating:mean(firstRatings),
    top_one_best_within_returned_five:topOneBest/candidates.length,
    any_exact_in_five:anyExact/candidates.length,
    any_sendable_in_five:anySendable/candidates.length,
    mean_candidate_rating:mean(allRatings),
    ndcg_at_5:mean(ndcg),
    ordinal_mae:mean(ordinalErrors),
    replay_mae:mean(replayDrift),
    high_score_precision:highScoreCorrect.length?mean(highScoreCorrect):null,
    inappropriate_high_count:inappropriateHigh,
    latency_ms:{p50:percentile(runs.map(run=>run.duration_ms),.5),p95:percentile(runs.map(run=>run.duration_ms),.95)}
  }
};
await writeFile(resolve(root,'eval',outputFile),`${JSON.stringify(summary,null,2)}\n`);
console.log(JSON.stringify(summary,null,2));
