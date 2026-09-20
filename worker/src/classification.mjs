import {rankRelevanceCandidates} from './candidate-signals.mjs';

export const JEV_ENDPOINT='https://classifier.dev/v1/classify';

const HUMOUR_LABEL='meme-ready humour or a playful reaction belongs';
const SERIOUS_LABEL='serious help, safety, care, grief, apology, factual guidance, or support where no meme belongs';

export const PERSPECTIVES=[
  {
    key:'self',
    label:'My reaction',
    instructions:'Rank the meme the narrator or sender would use to express their own reaction. Reward what I feel, think, say, or do in response to the other participant. Exclude memes that primarily embody the other person or merely restate the event.'
  },
  {
    key:'other',
    label:'Their side',
    instructions:'Rank the meme that embodies the other participant\'s attitude, reaction, motive, or behavior. Reward a natural view from their side without inventing details. Exclude memes that primarily express the narrator\'s reaction.'
  },
  {
    key:'situation',
    label:'The situation',
    instructions:'Rank the meme that frames the action, event, or social dynamic itself as the joke. Reward a clear depiction of what happened between the people. Avoid generic emotion-only reactions.'
  }
];

export function hasMultiplePerspectives(comment) {
  if(typeof comment!=='string') return false;
  const hasNarrator=/\b(?:i|me|my|mine|we|us|our|ours)\b/i.test(comment);
  const hasOtherPronoun=/\b(?:they|them|their|theirs|he|him|his|she|her|hers|you|your|yours)\b/i.test(comment);
  const hasOtherRole=/\b(?:my|our)\s+(?:sibling|brother|sister|friend|coworker|colleague|boss|manager|client|partner|roommate|parent|mother|father|mom|dad|child|kid|neighbor|neighbour|team|teammate|vendor)s?\b/i.test(comment);
  return hasNarrator&&(hasOtherPronoun||hasOtherRole);
}

export function needsSeriousHandling(comment) {
  const helpSeeking=/\b(help me|please help|i need|we need|tell me|give me|what can i say|what should i|how (?:do|can|should) i|want to (?:send|write|say)|guidance|steps to take)\b/i;
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

function scoreCandidates(candidates,labels,result) {
  const scores=labels.map(label=>Number(result.scores[label]));
  if(scores.some(score=>!Number.isFinite(score)||score<0||score>1)) throw new Error('Classifier returned incomplete candidate scores.');
  if(scores.length>1&&scores.every(score=>score===scores[0])) throw new Error('Classifier returned flat candidate scores.');
  return candidates.map((record,index)=>({...record,classifier_score:scores[index],retrieval_rank:index+1}));
}

export async function humourBelongs(comment,{fetchImpl=fetch,timeoutMs=3000}={}) {
  const result=await classify({
    comment,
    labels:[HUMOUR_LABEL,SERIOUS_LABEL],
    instructions:'Decide whether sending a meme is socially appropriate. Choose serious whenever the person needs urgent help, safety, care, factual guidance, an apology, condolences, or sincere support, unless the text is explicitly joking.',
    fetchImpl,
    timeoutMs
  });
  return result.label===HUMOUR_LABEL;
}

export async function rankCandidates(comment,candidates,{fetchImpl=fetch,timeoutMs=3000,limit=3}={}) {
  if(!Array.isArray(candidates)||candidates.length<limit) throw new Error('Classifier needs enough candidates to rank.');
  const labels=candidates.map(record=>`${record.id} | ${record.name}: ${record.message} Social dynamic: ${record.relational_pattern}`);
  const result=await classify({
    comment,
    labels,
    instructions:'Rank the existing meme reaction whose social meaning, emotional tone, speaker-target relationship, and sendability best match the situation. Do not choose by shared keywords alone.',
    fetchImpl,
    timeoutMs
  });
  const scored=scoreCandidates(candidates,labels,result);
  return rankRelevanceCandidates(scored,{limit});
}

export async function rankCandidatesByPerspective(comment,candidates,{fetchImpl=fetch,timeoutMs=3000,limit=3}={}) {
  if(!Array.isArray(candidates)||candidates.length<limit) throw new Error('Perspective ranking needs enough candidates to rank.');
  const labels=candidates.map(record=>`${record.id} | ${record.name}: ${record.message} Social dynamic: ${record.relational_pattern}`);
  const results=await Promise.all(PERSPECTIVES.slice(0,limit).map(async perspective=>{
    const result=await classify({comment,labels,instructions:perspective.instructions,fetchImpl,timeoutMs});
    const scored=scoreCandidates(candidates,labels,result);
    return {perspective,ranked:rankRelevanceCandidates(scored,{limit:candidates.length})};
  }));

  const selected=[];
  const usedIds=new Set();
  for(const {perspective,ranked} of results) {
    const candidate=ranked.find(record=>!usedIds.has(record.id));
    if(!candidate) continue;
    usedIds.add(candidate.id);
    selected.push({...candidate,perspective:perspective.key,perspective_label:perspective.label});
  }
  if(selected.length<limit) throw new Error('Perspective ranking could not produce distinct candidates.');
  return selected.sort((left,right)=>right.classifier_score-left.classifier_score||left.perspective.localeCompare(right.perspective)).slice(0,limit);
}
