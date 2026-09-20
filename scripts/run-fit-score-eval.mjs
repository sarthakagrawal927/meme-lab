import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const classifierEndpoint='https://classifier.dev/v1/classify';
const ollamaEndpoint=(process.argv[2]??'http://127.0.0.1:11434').replace(/\/$/,'');
const localModel=process.argv[3]??'qwen3:4b';
const ratingFile=process.env.FIT_SCORE_RATINGS??'fit_score_blind_ratings_v2.jsonl';
const repeats=2;
const parseJsonl=text=>text.trim().split('\n').filter(Boolean).map(JSON.parse);
const [fixtureText,catalogueText,ratingText]=await Promise.all([
  readFile(resolve(root,'eval/fit_score_v1.jsonl'),'utf8'),
  readFile(resolve(root,'worker/tools/stage-3000-catalogue.json'),'utf8'),
  readFile(resolve(root,'eval',ratingFile),'utf8')
]);
const cases=parseJsonl(fixtureText);
const catalogue=JSON.parse(catalogueText);
const byId=new Map(catalogue.map(record=>[record.id,record]));
const ratingsBySourceCase=new Map(parseJsonl(ratingText).map(record=>[record.case_id,record]));
const generalInstructions='Rank the existing meme reaction whose social meaning, emotional tone, speaker-target relationship, and sendability best match the situation. Preserve who performed each action and who received it. Honor quoted speakers and explicit negation literally; exclude memes that require a negated event to be happening. Do not choose by shared keywords alone.';
const fitInstructions='Judge each comment-and-candidate pair independently. Rate whether this specific meme would be a natural, accurate, sendable reaction to the comment. Preserve actor and target roles, quoted speakers, negation, social dynamic, and emotional tone. Shared keywords or a recognizable image are not enough.';
const anchoredFitInstructions=`${fitInstructions} Calibrate against these anchors: a candidate that precisely captures someone causing a problem and then blaming somebody else is exact for a comment describing that same dynamic; a generic celebration image is wrong for that comment even if both mention a person. Use plausible rather than strong when the broad emotion matches but the actor, target, or comic mechanism differs.`;
const specificityFitInstructions=`${fitInstructions} Prefer a candidate whose meaning or social dynamic captures the comment's specific causal structure, relationship, contradiction, or escalation. Treat a generic emotional reaction as merely plausible when a more specific structural analogy exists.`;
const fitLabels=[
  '0 | wrong: unrelated, misleading, reverses the roles, or socially inappropriate',
  '1 | weak: shares a surface theme but would feel forced or confusing',
  '2 | plausible: communicates a relevant general reaction but misses important specificity',
  '3 | strong: naturally sendable and matches the central social dynamic and tone',
  '4 | exact: captures the specific relationship, action, viewpoint, and comic beat'
];

function labelFor(record) {
  return `${record.id} | ${record.name}: ${record.message} Social dynamic: ${record.relational_pattern}`;
}

function pairInput(context,record) {
  return `COMMENT: ${context}\nCANDIDATE: ${record.name}. Meaning: ${record.message} Social dynamic: ${record.relational_pattern} Example: ${record.example_context} Avoid: ${record.near_miss_context}`;
}

function compactPairInput(context,record) {
  return `COMMENT: ${context}\nCANDIDATE: ${record.name}. Meaning: ${record.message} Social dynamic: ${record.relational_pattern}`;
}

async function classify({inputs,labels,instructions,tier,timeoutMs}) {
  const started=performance.now();
  const response=await fetch(classifierEndpoint,{
    method:'POST',
    headers:{'content-type':'application/json'},
    signal:AbortSignal.timeout(timeoutMs),
    body:JSON.stringify({inputs,labels,instructions,tier})
  });
  if(!response.ok) throw new Error(`classifier.dev ${tier} returned HTTP ${response.status}: ${await response.text()}`);
  const payload=await response.json();
  if(!Array.isArray(payload?.results)||payload.results.length!==inputs.length) throw new Error(`classifier.dev ${tier} returned an invalid result count.`);
  return {results:payload.results,duration_ms:Math.round(performance.now()-started)};
}

function expectedFit(result) {
  const scores=fitLabels.map(label=>Number(result?.scores?.[label]));
  if(scores.every(Number.isFinite)) return Math.round(scores.reduce((total,score,index)=>total+score*index,0)/4*100);
  const chosenIndex=fitLabels.indexOf(result?.label);
  if(chosenIndex>=0&&result?.unscored) return chosenIndex*25;
  throw new Error(`Ordinal classifier returned neither scores nor a recognized label: ${JSON.stringify(result)}`);
}

async function rawScores(testCase) {
  const records=testCase.shortlist_ids.map(id=>byId.get(id));
  if(records.some(record=>!record)) throw new Error(`${testCase.id} contains an unknown shortlist ID.`);
  const labels=records.map(labelFor);
  const {results:[result],duration_ms}=await classify({inputs:[testCase.context],labels,instructions:generalInstructions,tier:'fast',timeoutMs:5000});
  return {scores:Object.fromEntries(testCase.candidate_ids.map(id=>{
    const index=testCase.shortlist_ids.indexOf(id);
    return [id,Math.round(Number(result.scores[labels[index]])*100)];
  })),duration_ms};
}

async function ordinalScores(testCase,tier,{candidateIds=testCase.candidate_ids,inputFor=pairInput,instructions=fitInstructions}={}) {
  const records=candidateIds.map(id=>byId.get(id));
  if(records.some(record=>!record)) throw new Error(`${testCase.id} contains an unknown candidate ID.`);
  const {results,duration_ms}=await classify({inputs:records.map(record=>inputFor(testCase.context,record)),labels:fitLabels,instructions,tier,timeoutMs:tier==='smart'?15000:5000});
  return {scores:Object.fromEntries(candidateIds.map((id,index)=>[id,expectedFit(results[index])])),duration_ms};
}

async function pairwiseScores(testCase) {
  const records=testCase.candidate_ids.map(id=>byId.get(id));
  if(records.some(record=>!record)) throw new Error(`${testCase.id} contains an unknown candidate ID.`);
  const labels=['A is the better meme reply','B is the better meme reply','Tie or neither is clearly better'];
  const comparisons=[];
  for(let left=0;left<records.length;left+=1) for(let right=left+1;right<records.length;right+=1) {
    const describe=record=>`${record.name}. Meaning: ${record.message} Social dynamic: ${record.relational_pattern} Example: ${record.example_context} Avoid: ${record.near_miss_context}`;
    const input=(a,b)=>`COMMENT: ${testCase.context}\nCANDIDATE A: ${describe(a)}\nCANDIDATE B: ${describe(b)}`;
    comparisons.push({left,right,orientation:'forward',input:input(records[left],records[right])});
    comparisons.push({left,right,orientation:'reverse',input:input(records[right],records[left])});
  }
  const {results,duration_ms}=await classify({
    inputs:comparisons.map(comparison=>comparison.input),labels,tier:'fast',timeoutMs:5000,
    instructions:'Choose which candidate is the more natural, accurate, sendable meme reply. Preserve actor and target roles, quoted speakers, negation, social dynamic, and emotional tone. Ignore candidate order. Choose tie only when they are genuinely equally fitting or equally unsuitable.'
  });
  const totals=new Array(records.length).fill(0);
  const counts=new Array(records.length).fill(0);
  for(let index=0;index<comparisons.length;index+=2) {
    const comparison=comparisons[index];
    const forward=results[index]?.scores;
    const reverse=results[index+1]?.scores;
    const values=[forward?.[labels[0]],forward?.[labels[1]],forward?.[labels[2]],reverse?.[labels[0]],reverse?.[labels[1]],reverse?.[labels[2]]].map(Number);
    if(values.some(value=>!Number.isFinite(value))) throw new Error(`Pairwise classifier returned incomplete scores for ${testCase.id}.`);
    const [forwardA,forwardB,forwardTie,reverseA,reverseB,reverseTie]=values;
    const leftShare=((forwardA+forwardTie*.5)+(reverseB+reverseTie*.5))/2;
    const rightShare=((forwardB+forwardTie*.5)+(reverseA+reverseTie*.5))/2;
    totals[comparison.left]+=leftShare;
    totals[comparison.right]+=rightShare;
    counts[comparison.left]+=1;
    counts[comparison.right]+=1;
  }
  return {scores:Object.fromEntries(testCase.candidate_ids.map((id,index)=>[id,Math.round(totals[index]/counts[index]*100)])),duration_ms};
}

async function localScores(testCase) {
  const records=testCase.candidate_ids.map(id=>byId.get(id));
  const schema={
    type:'object',additionalProperties:false,
    properties:{ratings:{type:'array',minItems:5,maxItems:5,items:{type:'object',additionalProperties:false,properties:{id:{type:'string',enum:testCase.candidate_ids},level:{type:'integer',minimum:0,maximum:4}},required:['id','level']}}},
    required:['ratings']
  };
  const started=performance.now();
  const response=await fetch(`${ollamaEndpoint}/api/chat`,{
    method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(30000),
    body:JSON.stringify({
      model:localModel,stream:false,think:false,format:schema,options:{temperature:0,seed:927},
      messages:[
        {role:'system',content:`${fitInstructions} Use level 0 wrong, 1 weak, 2 plausible, 3 strong, or 4 exact. Score every candidate independently and return each ID exactly once.`},
        {role:'user',content:JSON.stringify({comment:testCase.context,candidates:records.map(record=>({id:record.id,name:record.name,meaning:record.message,social_dynamic:record.relational_pattern,example:record.example_context,avoid:record.near_miss_context}))})}
      ]
    })
  });
  if(!response.ok) throw new Error(`${localModel} returned HTTP ${response.status}: ${await response.text()}`);
  const payload=await response.json();
  const parsed=JSON.parse(payload.message?.content??'');
  if(!Array.isArray(parsed.ratings)||parsed.ratings.length!==5||new Set(parsed.ratings.map(row=>row.id)).size!==5) throw new Error(`${localModel} returned invalid ratings.`);
  return {scores:Object.fromEntries(parsed.ratings.map(row=>[row.id,row.level*25])),duration_ms:Math.round(performance.now()-started)};
}

const allArms={
  raw_30way_jev_fast:rawScores,
  ordinal_jev_fast:testCase=>ordinalScores(testCase,'fast'),
  ordinal_jev_fast_compact:testCase=>ordinalScores(testCase,'fast',{inputFor:compactPairInput}),
  ordinal_jev_fast_anchored:testCase=>ordinalScores(testCase,'fast',{instructions:anchoredFitInstructions}),
  ordinal_jev_fast_full30:testCase=>ordinalScores(testCase,'fast',{candidateIds:testCase.shortlist_ids}),
  ordinal_jev_fast_full30_compact:testCase=>ordinalScores(testCase,'fast',{candidateIds:testCase.shortlist_ids,inputFor:compactPairInput}),
  ordinal_jev_fast_full30_specific:testCase=>ordinalScores(testCase,'fast',{candidateIds:testCase.shortlist_ids,inputFor:compactPairInput,instructions:specificityFitInstructions}),
  pairwise_jev_fast_balanced:pairwiseScores,
  ordinal_jev_smart:testCase=>ordinalScores(testCase,'smart'),
  [`ordinal_local_${localModel.replace(/[^a-z0-9]+/giu,'_')}`]:localScores
};
const defaultArmNames=['raw_30way_jev_fast','ordinal_jev_fast',`ordinal_local_${localModel.replace(/[^a-z0-9]+/giu,'_')}`];
const requestedArmNames=(process.env.FIT_SCORE_ARMS?.split(',').map(value=>value.trim()).filter(Boolean)??defaultArmNames);
const arms=Object.fromEntries(requestedArmNames.map(name=>{
  if(!allArms[name]) throw new Error(`Unknown fit-score arm: ${name}`);
  return [name,allArms[name]];
}));
let runs={};
if(process.env.FIT_SCORE_RESCORE_ONLY==='1') {
  const prior=JSON.parse(await readFile(resolve(root,'eval/results/fit-score-v1.json'),'utf8'));
  runs=prior.runs;
} else {
  for(const [arm,score] of Object.entries(arms)) {
    runs[arm]=[];
    for(let repeat=0;repeat<repeats;repeat+=1) {
      for(const testCase of cases) {
        const result=await score(testCase);
        runs[arm].push({case_id:testCase.id,repeat,...result});
        console.log(`${arm} r${repeat+1} ${testCase.id} ${result.duration_ms}ms`);
      }
    }
  }
}

const mean=values=>values.reduce((total,value)=>total+value,0)/values.length;
const percentile=(values,fraction)=>{
  const ordered=[...values].sort((a,b)=>a-b);
  return ordered[Math.min(ordered.length-1,Math.ceil(ordered.length*fraction)-1)];
};
const discountedGain=ratings=>ratings.reduce((total,rating,index)=>total+(2**rating-1)/Math.log2(index+2),0);
const metrics={};
for(const [arm,rows] of Object.entries(runs)) {
  const first=rows.filter(row=>row.repeat===0);
  const second=new Map(rows.filter(row=>row.repeat===1).map(row=>[row.case_id,row]));
  const positiveScores=[];
  const negativeScores=[];
  const brier=[];
  const pairwise=[];
  const stability=[];
  const blindPairwise=[];
  const blindOrdinalErrors=[];
  const blindSendableBrier=[];
  const blindNdcg=[];
  const blindTopRatings=[];
  const blindHighScores=[];
  let blindTopOneBest=0;
  let blindInappropriateHigh=0;
  let topOne=0;
  for(const row of first) {
    const testCase=cases.find(record=>record.id===row.case_id);
    const blindRatings=ratingsBySourceCase.get(testCase.source_case_id)?.ratings;
    if(!blindRatings) throw new Error(`Missing blind ratings for ${testCase.source_case_id}.`);
    const positives=new Set(testCase.positive_ids);
    const ordered=testCase.candidate_ids.map(id=>({id,score:row.scores[id]})).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
    if(positives.has(ordered[0].id)) topOne+=1;
    const bestBlindRating=Math.max(...testCase.candidate_ids.map(id=>blindRatings[id]));
    const predictedTopRating=blindRatings[ordered[0].id];
    blindTopRatings.push(predictedTopRating);
    if(predictedTopRating===bestBlindRating) blindTopOneBest+=1;
    const idealRatings=testCase.candidate_ids.map(id=>blindRatings[id]).sort((a,b)=>b-a);
    blindNdcg.push(discountedGain(ordered.map(candidate=>blindRatings[candidate.id]))/discountedGain(idealRatings));
    for(const candidate of ordered) {
      const isPositive=positives.has(candidate.id);
      (isPositive?positiveScores:negativeScores).push(candidate.score);
      brier.push(((candidate.score/100)-(isPositive?1:0))**2);
      const blindRating=blindRatings[candidate.id];
      blindOrdinalErrors.push(Math.abs(candidate.score-blindRating*25));
      blindSendableBrier.push(((candidate.score/100)-(blindRating>=3?1:0))**2);
      if(candidate.score>=75) {
        blindHighScores.push(blindRating>=3?1:0);
        if(blindRating<=1) blindInappropriateHigh+=1;
      }
      const replay=second.get(row.case_id);
      stability.push(Math.abs(candidate.score-replay.scores[candidate.id]));
    }
    for(const positiveId of testCase.positive_ids) for(const negativeId of testCase.candidate_ids.filter(id=>!positives.has(id))) {
      const difference=row.scores[positiveId]-row.scores[negativeId];
      pairwise.push(difference>0?1:difference===0?.5:0);
    }
    for(let left=0;left<testCase.candidate_ids.length;left+=1) for(let right=left+1;right<testCase.candidate_ids.length;right+=1) {
      const leftId=testCase.candidate_ids[left];
      const rightId=testCase.candidate_ids[right];
      const ratingDifference=blindRatings[leftId]-blindRatings[rightId];
      if(ratingDifference===0) continue;
      const scoreDifference=row.scores[leftId]-row.scores[rightId];
      blindPairwise.push(scoreDifference===0?.5:Math.sign(scoreDifference)===Math.sign(ratingDifference)?1:0);
    }
  }
  metrics[arm]={
    target_top_one:topOne/cases.length,
    pairwise_accuracy:mean(pairwise),
    target_mean:mean(positiveScores),
    hard_negative_mean:mean(negativeScores),
    separation:mean(positiveScores)-mean(negativeScores),
    binary_brier:mean(brier),
    blind_review:{
      top_one_best:blindTopOneBest/cases.length,
      mean_top_rating:mean(blindTopRatings),
      ndcg_at_5:mean(blindNdcg),
      pairwise_accuracy:mean(blindPairwise),
      ordinal_mae:mean(blindOrdinalErrors),
      sendable_brier:mean(blindSendableBrier),
      high_score_precision:blindHighScores.length?mean(blindHighScores):null,
      inappropriate_high_count:blindInappropriateHigh
    },
    replay_mae:mean(stability),
    latency_ms:{p50:percentile(rows.map(row=>row.duration_ms),.5),p95:percentile(rows.map(row=>row.duration_ms),.95)}
  };
}

const rankedArms=Object.entries(metrics).sort(([,left],[,right])=>right.blind_review.ndcg_at_5-left.blind_review.ndcg_at_5||right.blind_review.top_one_best-left.blind_review.top_one_best||left.blind_review.ordinal_mae-right.blind_review.ordinal_mae||left.latency_ms.p95-right.latency_ms.p95);
const promoted=rankedArms.filter(([arm])=>arm!=='raw_30way_jev_fast')[0]?.[0]??null;
const reportName=(process.env.FIT_SCORE_REPORT??'fit-score-v1').replace(/[^a-z0-9_-]+/giu,'-');
const report={
  version:'fit-score-v1',created_at:new Date().toISOString(),cases:cases.length,candidates_per_case:5,repeats,
  labels:'independent_model_blind_review_pending_owner_review',human_validated:false,
  oracle:'Independent model ratings from 0 wrong through 4 exact for all 60 context-candidate pairs, blinded to scorer outputs.',
  target_proxy:'One previously accepted target versus four current-ranker hard negatives per case.',
  caveat:'The independent reviewer corrects the single-target proxy but is not a human ground truth. Owner ratings are required before displaying a probability claim. Jev smart returns an ordinal class without probabilities, so its score is the selected level mapped to 0, 25, 50, 75, or 100.',
  excluded_arms:{ordinal_jev_smart:'Stopped after two five-candidate calls took 10,223 ms and 14,001 ms; this already exceeds the product latency requirement.'},
  metrics,recommendation:{best_overall_arm:rankedArms[0]?.[0]??null,best_experimental_arm:promoted},runs
};
await mkdir(resolve(root,'eval/results'),{recursive:true});
await writeFile(resolve(root,`eval/results/${reportName}.json`),`${JSON.stringify(report,null,2)}\n`);
await writeFile(resolve(root,`eval/${reportName==='fit-score-v1'?'fit-score-summary':`${reportName}-summary`}.json`),`${JSON.stringify({...report,runs:undefined},null,2)}\n`);
console.log(JSON.stringify({metrics,recommendation:report.recommendation},null,2));
