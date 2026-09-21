import {rankRelevanceCandidates} from './candidate-signals.mjs';

export const JEV_ENDPOINT='https://classifier.dev/v1/classify';
export const TYPESAFE_ENDPOINT='https://api.typesafe.ai/v1/systemone';
export const TYPESAFE_MODEL='jev-latest';

export const FIT_LABELS=[
  {key:'wrong',label:'0 | wrong: unrelated, misleading, reverses the roles, or socially inappropriate'},
  {key:'weak',label:'1 | weak: shares a surface theme but would feel forced or confusing'},
  {key:'plausible',label:'2 | plausible: communicates a relevant general reaction but misses important specificity'},
  {key:'strong',label:'3 | strong: naturally sendable and matches the central social dynamic and tone'},
  {key:'exact',label:'4 | exact: captures the specific relationship, action, viewpoint, and comic beat'}
];
const FIT_INSTRUCTIONS='Judge each comment-and-candidate pair independently. Rate whether this specific meme would be a natural, accurate, sendable reaction to the comment. Preserve actor and target roles, quoted speakers, negation, social dynamic, and emotional tone. Shared keywords or a recognizable image are not enough.';

const HUMOUR_LABEL='meme-ready humour or a playful reaction belongs';
const SERIOUS_LABEL='serious help, safety, care, grief, apology, factual guidance, or support where no meme belongs';
const FIT_CRITERIA=FIT_LABELS.map(({label})=>label.replace(/^\d+ \| /,''));

export const PERSPECTIVES=[
  {
    key:'self',
    label:'My reaction',
    instructions:'Rank the meme from the first-person narrator\'s perspective (I, me, my, we, us, our), expressing only that narrator\'s reaction. Preserve who performed each action. If I ate someone else\'s labelled leftovers and they looked upset, a meme embodying the eater is my perspective; the victim\'s reaction is not. A quoted first-person statement spoken by someone else belongs to that speaker, not the narrator. Honor negation literally. Exclude memes that primarily embody the other participant or merely restate the event.'
  },
  {
    key:'other',
    label:'Their side',
    instructions:'Rank the meme from the other participant\'s perspective, not the first-person narrator\'s. Identify who performed each action and who received it; do not reverse the actor and target. Treat quoted words as belonging to the named speaker. Honor negation literally and do not invent motives. Exclude memes that primarily express the narrator\'s reaction.'
  },
  {
    key:'situation',
    label:'The situation',
    instructions:'Rank the meme that frames the action, event, or social dynamic itself as the joke. Preserve actor and target roles. Honor explicit negation: if the comment says something is not happening, exclude memes that require it to be happening. Reward a clear depiction of what happened between the people and avoid generic emotion-only reactions.'
  }
];

export function hasMultiplePerspectives(comment) {
  if(typeof comment!=='string') return false;
  const outsideQuotes=comment.replace(/"[^"]*"|“[^”]*”|'[^']*'|‘[^’]*’/g,' ');
  const hasNarrator=/\b(?:i|me|my|mine|we|us|our|ours)\b/i.test(outsideQuotes);
  const hasDirectHumanPronoun=/\b(?:he|him|his|she|her|hers|you|your|yours)\b/i.test(outsideQuotes);
  const hasAgentiveThey=/\bthey\s+(?:ask(?:ed|s)?|say|said|reply|replied|tell|told|eat|ate|take|took|schedule|scheduled|complain|complained|insist|insisted|admit|admitted|argue|argued|promise|promised|borrow|borrowed|return|returned|send|sent|text|texted|message|messaged|call|called|warn|warned|ignore|ignored|steal|stole|cancel|cancelled|forget|forgot|invite|invited|refuse|refused|laugh|laughed|pretend|pretended|claim|claimed|post|posted|write|wrote|look|looked|leave|left|arrive|arrived|think|thought|feel|felt|want|wanted|expect|expected|decide|decided|offer|offered|decline|declined|accept|accepted|delete|deleted|break|broke)\b/i.test(outsideQuotes);
  const hasAgentiveThem=/\b(?:ask(?:ed|s)?|tell|told|warn|warned|text|texted|message|messaged|call|called|invite|invited|help|helped|thank|thanked|blame|blamed|forgive|forgave|trust|trusted|believe|believed)\s+them\b/i.test(outsideQuotes);
  const hasObservedHumanAction=/\b(?:see|saw|find|found|catch|caught)\s+them\s+(?:\w+ing|take|took|eat|ate|steal|stole|leave|left|laugh|laughed|pretend|pretended)\b/i.test(outsideQuotes);
  const hasOtherRole=/\b(?:my|our)\s+(?:sibling|brother|sister|friend|coworker|colleague|boss|manager|client|partner|roommate|parent|mother|father|mom|dad|child|kid|neighbor|neighbour|team|teammate|vendor)s?\b/i.test(outsideQuotes);
  return hasNarrator&&(hasDirectHumanPronoun||hasAgentiveThey||hasAgentiveThem||hasObservedHumanAction||hasOtherRole);
}

export function needsSeriousHandling(comment) {
  const helpSeeking=/\b(help me|please help|tell me|give me|what can i say|what should i|how (?:do|can|should) i|want to (?:send|write|say)|guidance|steps to take)\b/i;
  const highRisk=/(?:\b(?:my|our|their|his|her) [a-z]+ (?:has )?died\b|\b(?:someone|person|friend|relative|parent|child|baby|pet|dog|cat|he|she|they) (?:has )?died\b|\b(?:hurt (?:myself|themselves|himself|herself)|suicid|death|funeral|chest pain|trouble breathing|prescription|medication|unsafe (?:home|partner)|sexual (?:message|harassment)|panic attack|allergic reaction|anaphyla|missing child|lost their baby|miscarriage)\b)/i;
  const supportRequest=/\b(?:ask(?:ed|s)?|need(?:ed|s)?|want(?:ed|s)?|looking|seek(?:ing)?)\b.{0,120}\b(?:help|guidance|support|listen|apolog(?:y|ize|ise)?|respond|report|deadline|official|document|fee|steps|service|contact|explanation|take responsibility|stay with)\b/i;
  const seriousTopic=/\b(sexual assault|assaulted|pregnan|fertility treatment|poison(?:ed|ing)?|dishwasher capsule|gas smell|carbon monoxide|harassment|locks changed|put down (?:a |the |their )?(?:dog|cat|pet)|passport|payroll deduction|scholarship deadline|emergency service)\b/i;
  return helpSeeking.test(comment)||highRisk.test(comment)||supportRequest.test(comment)||seriousTopic.test(comment);
}

export function requiresFactualAnswer(comment) {
  const factualRequest=/\b(factual explanation|plain factual|what (?:the )?.+ (?:field|fields|term|terms) mean|which .+ (?:form|document)|how (?:do|should) i (?:file|complete|fill|submit)|current documents|expected processing time|confirmed .+ deadline|official submission page|correct .+ contact|written explanation)\b/i;
  const factualDomain=/\b(tax|residency|visa|legal|medical|prescription|identification|government form|passport|payroll|payslip|scholarship|application)\b/i;
  return factualRequest.test(comment)&&factualDomain.test(comment);
}

async function classify({comment,labels,instructions,fetchImpl,timeoutMs}) {
  const response=await fetchImpl(JEV_ENDPOINT,{
    method:'POST',
    headers:{'content-type':'application/json'},
    signal:AbortSignal.timeout(timeoutMs),
    body:JSON.stringify({inputs:[comment],labels,tier:'fast',instructions})
  });
  if(!response.ok) throw new Error(`Classifier returned HTTP ${response.status}.`);
  const result=(await response.json())?.results?.[0];
  if(!result||typeof result.label!=='string'||typeof result.scores!=='object') throw new Error('Classifier returned an unexpected response.');
  return result;
}

async function classifyMany({inputs,labels,instructions,fetchImpl,timeoutMs}) {
  const response=await fetchImpl(JEV_ENDPOINT,{
    method:'POST',
    headers:{'content-type':'application/json'},
    signal:AbortSignal.timeout(timeoutMs),
    body:JSON.stringify({inputs,labels,tier:'fast',instructions})
  });
  if(!response.ok) throw new Error(`Classifier returned HTTP ${response.status}.`);
  const results=(await response.json())?.results;
  if(!Array.isArray(results)||results.length!==inputs.length) throw new Error('Classifier returned an unexpected result count.');
  return results;
}

async function askJev({state,questions,apiKey,fetchImpl,timeoutMs}) {
  const response=await fetchImpl(TYPESAFE_ENDPOINT,{
    method:'POST',
    headers:{
      'authorization':`Bearer ${apiKey}`,
      'content-type':'application/json'
    },
    signal:AbortSignal.timeout(timeoutMs),
    body:JSON.stringify({state,model:TYPESAFE_MODEL,questions})
  });
  if(!response.ok) throw new Error(`TypeSafe returned HTTP ${response.status}.`);
  const result=await response.json();
  if(!result?.answers||typeof result.answers!=='object') throw new Error('TypeSafe returned an unexpected response.');
  return result.answers;
}

function candidateDetails(record) {
  return {
    name:record.name,
    meaning:record.message,
    social_dynamic:record.relational_pattern,
    example:record.example_context,
    avoid_when:record.near_miss_context,
    ...(record.perspective_label?{intended_viewpoint:record.perspective_label}:{})
  };
}

function directCandidateState(comment,candidates) {
  return {
    task:FIT_INSTRUCTIONS,
    comment,
    candidates:Object.fromEntries(candidates.map((record,index)=>[`candidate_${index}`,candidateDetails(record)]))
  };
}

function directOrdinalScore(answer) {
  const score=Number(answer?.score);
  const probabilities=FIT_CRITERIA.map((_,index)=>Number(answer?.probabilities?.[String(index)]));
  if(answer?.type!=='score'||!Number.isFinite(score)||score<0||score>FIT_CRITERIA.length-1) throw new Error('TypeSafe returned an invalid ordinal score.');
  if(probabilities.some(probability=>!Number.isFinite(probability)||probability<0||probability>1)) throw new Error('TypeSafe returned incomplete ordinal probabilities.');
  const fitIndex=probabilities.indexOf(Math.max(...probabilities));
  return {classifier_score:score/(FIT_CRITERIA.length-1),fit_label:FIT_LABELS[fitIndex].key};
}

async function scoreDirectCandidates(comment,candidates,{apiKey,fetchImpl,timeoutMs,instructions=FIT_INSTRUCTIONS}={}) {
  const state=directCandidateState(comment,candidates);
  state.task=instructions;
  const questions=Object.fromEntries(candidates.map((_,index)=>[`fit_${index}`,{
    type:'score',
    instructions:`How naturally and accurately does \`candidate_${index}\` work as a sendable meme for the comment? Judge only this candidate and follow \`task\`.`,
    criteria:FIT_CRITERIA
  }]));
  const answers=await askJev({state,questions,apiKey,fetchImpl,timeoutMs});
  const scored=candidates.map((record,index)=>({...record,...directOrdinalScore(answers[`fit_${index}`]),retrieval_rank:index+1}));
  if(scored.length>1&&scored.every(record=>record.classifier_score===scored[0].classifier_score)) throw new Error('TypeSafe returned flat ordinal scores.');
  return scored;
}

function candidateInput(comment,record) {
  return `COMMENT: ${comment}\nCANDIDATE: ${record.name}. Meaning: ${record.message} Social dynamic: ${record.relational_pattern} Example: ${record.example_context} Avoid: ${record.near_miss_context}`;
}

function ordinalScore(result) {
  const scores=FIT_LABELS.map(({label})=>Number(result?.scores?.[label]));
  if(scores.some(score=>!Number.isFinite(score)||score<0||score>1)) throw new Error('Classifier returned incomplete ordinal scores.');
  const labelIndex=FIT_LABELS.findIndex(({label})=>label===result.label);
  if(labelIndex<0) throw new Error('Classifier returned an unknown fit label.');
  return {
    classifier_score:scores.reduce((total,score,index)=>total+score*index,0)/4,
    fit_label:FIT_LABELS[labelIndex].key
  };
}

async function scoreOrdinalCandidates(comment,candidates,{fetchImpl,timeoutMs,instructions=FIT_INSTRUCTIONS,inputFor=candidateInput,apiKey}={}) {
  if(apiKey) return scoreDirectCandidates(comment,candidates,{apiKey,fetchImpl,timeoutMs,instructions});
  const labels=FIT_LABELS.map(({label})=>label);
  const results=await classifyMany({inputs:candidates.map(record=>inputFor(comment,record)),labels,instructions,fetchImpl,timeoutMs});
  const scored=candidates.map((record,index)=>({...record,...ordinalScore(results[index]),retrieval_rank:index+1}));
  if(scored.length>1&&scored.every(record=>record.classifier_score===scored[0].classifier_score)) throw new Error('Classifier returned flat ordinal scores.');
  return scored;
}

function scoreCandidates(candidates,labels,result) {
  const scores=labels.map(label=>Number(result.scores[label]));
  if(scores.some(score=>!Number.isFinite(score)||score<0||score>1)) throw new Error('Classifier returned incomplete candidate scores.');
  if(scores.length>1&&scores.every(score=>score===scores[0])) throw new Error('Classifier returned flat candidate scores.');
  return candidates.map((record,index)=>({...record,classifier_score:scores[index],retrieval_rank:index+1}));
}

export async function humourBelongs(comment,{fetchImpl=fetch,timeoutMs=3000,apiKey}={}) {
  if(apiKey) {
    const answers=await askJev({
      state:{comment},
      questions:{humour_belongs:{
        type:'noul',
        instructions:'Would sending a meme be socially appropriate here?',
        criteria:{
          true:HUMOUR_LABEL,
          false:SERIOUS_LABEL
        }
      }},
      apiKey,
      fetchImpl,
      timeoutMs
    });
    const probability=Number(answers.humour_belongs?.noul);
    if(answers.humour_belongs?.type!=='noul'||!Number.isFinite(probability)||probability<0||probability>1) throw new Error('TypeSafe returned an invalid safety answer.');
    return probability>=.5;
  }
  const result=await classify({
    comment,
    labels:[HUMOUR_LABEL,SERIOUS_LABEL],
    instructions:'Decide whether sending a meme is socially appropriate. Choose serious whenever the person needs urgent help, safety, care, factual guidance, an apology, condolences, or sincere support, unless the text is explicitly joking.',
    fetchImpl,
    timeoutMs
  });
  return result.label===HUMOUR_LABEL;
}

export async function rankCandidates(comment,candidates,{fetchImpl=fetch,timeoutMs=5000,limit=3,apiKey}={}) {
  if(!Array.isArray(candidates)||candidates.length<limit) throw new Error('Classifier needs enough candidates to rank.');
  const scored=await scoreOrdinalCandidates(comment,candidates,{fetchImpl,timeoutMs,apiKey});
  return scored.sort((left,right)=>right.classifier_score-left.classifier_score||left.retrieval_rank-right.retrieval_rank||left.id.localeCompare(right.id)).slice(0,limit);
}

export async function rankCandidatesByPerspective(comment,candidates,{fetchImpl=fetch,timeoutMs=5000,limit=3,apiKey}={}) {
  if(!Array.isArray(candidates)||candidates.length<limit) throw new Error('Perspective ranking needs enough candidates to rank.');
  const labels=candidates.map(record=>`${record.id} | ${record.name}: ${record.message} Social dynamic: ${record.relational_pattern}`);
  let results;
  if(apiKey) {
    const state={comment,candidates:Object.fromEntries(candidates.map((record,index)=>[`candidate_${index}`,candidateDetails(record)]))};
    const criteria=Object.fromEntries(candidates.map((record,index)=>[`candidate_${index}`,`${record.name}: ${record.message} Social dynamic: ${record.relational_pattern}`]));
    const questions=Object.fromEntries(PERSPECTIVES.slice(0,Math.min(3,limit)).map(perspective=>[perspective.key,{
      type:'choice',
      instructions:perspective.instructions,
      criteria
    }]));
    const answers=await askJev({state,questions,apiKey,fetchImpl,timeoutMs});
    results=PERSPECTIVES.slice(0,Math.min(3,limit)).map(perspective=>{
      const answer=answers[perspective.key];
      const scores=candidates.map((_,index)=>Number(answer?.probabilities?.[`candidate_${index}`]));
      if(answer?.type!=='choice'||scores.some(score=>!Number.isFinite(score)||score<0||score>1)) throw new Error('TypeSafe returned incomplete perspective scores.');
      const scored=candidates.map((record,index)=>({...record,classifier_score:scores[index],retrieval_rank:index+1}));
      return {perspective,ranked:rankRelevanceCandidates(scored,{limit:candidates.length})};
    });
  } else {
    results=await Promise.all(PERSPECTIVES.slice(0,Math.min(3,limit)).map(async perspective=>{
      const result=await classify({comment,labels,instructions:perspective.instructions,fetchImpl,timeoutMs});
      const scored=scoreCandidates(candidates,labels,result);
      return {perspective,ranked:rankRelevanceCandidates(scored,{limit:candidates.length})};
    }));
  }

  let bestAssignment;
  const assign=(index,candidatesByLens,usedIds,total,participantSpecific)=>{
    if(index===results.length) {
      if(!bestAssignment||total>bestAssignment.total+0.03||(Math.abs(total-bestAssignment.total)<=0.03&&participantSpecific>bestAssignment.participantSpecific)) {
        bestAssignment={candidatesByLens:[...candidatesByLens],total,participantSpecific};
      }
      return;
    }
    for(const candidate of results[index].ranked) {
      if(usedIds.has(candidate.id)) continue;
      usedIds.add(candidate.id);
      candidatesByLens.push(candidate);
      assign(index+1,candidatesByLens,usedIds,total+candidate.classifier_score,participantSpecific+(results[index].perspective.key==='situation'?0:candidate.classifier_score));
      candidatesByLens.pop();
      usedIds.delete(candidate.id);
    }
  };
  assign(0,[],new Set(),0,0);
  const selected=bestAssignment?.candidatesByLens.map((candidate,index)=>({
    ...candidate,
    perspective:results[index].perspective.key,
    perspective_label:results[index].perspective.label
  }))??[];
  const selectedIds=new Set(selected.map(candidate=>candidate.id));
  const supplemental=results.flatMap(({perspective,ranked})=>ranked.map(candidate=>({
    ...candidate,
    perspective:perspective.key,
    perspective_label:perspective.label
  }))).sort((left,right)=>right.classifier_score-left.classifier_score||left.retrieval_rank-right.retrieval_rank||left.id.localeCompare(right.id));
  for(const candidate of supplemental) {
    if(selected.length>=limit) break;
    if(selectedIds.has(candidate.id)) continue;
    selectedIds.add(candidate.id);
    selected.push(candidate);
  }
  if(selected.length<limit) throw new Error('Perspective ranking could not produce distinct candidates.');
  const rescored=await scoreOrdinalCandidates(comment,selected.slice(0,limit),{
    fetchImpl,timeoutMs,apiKey,
    instructions:`${FIT_INSTRUCTIONS} The input declares the intended viewpoint. Judge the candidate only for that viewpoint; do not silently switch to another participant or to the event itself.`,
    inputFor:(text,record)=>`COMMENT: ${text}\nVIEWPOINT: ${record.perspective_label}\nCANDIDATE: ${record.name}. Meaning: ${record.message} Social dynamic: ${record.relational_pattern} Example: ${record.example_context} Avoid: ${record.near_miss_context}`
  });
  return rescored.sort((left,right)=>right.classifier_score-left.classifier_score||left.perspective.localeCompare(right.perspective));
}
