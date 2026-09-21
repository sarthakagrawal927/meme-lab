import {catalogue} from './catalogue.stage3000.generated.mjs';
import {reciprocalRankFuse} from './rank-fusion.mjs';

export {reciprocalRankFuse} from './rank-fusion.mjs';

export const EMBEDDING_MODEL='@cf/baai/bge-base-en-v1.5';
export const CORE_RESERVE=10;
const byId=new Map(catalogue.map(record=>[record.id,record]));
const I_LOVE_YOU_3000_ID='198936244-i-love-you-3000';

export function canonicalCandidateFor(comment) {
  if(typeof comment!=='string') return null;
  const explicitDeclaration=/^\s*i\s+love\s+you(?:\s+so\s+much)?[.!?]*\s*$/i.test(comment);
  const declarationIntent=/\b(?:want|wanna|need|trying|going)\s+to\s+(?:say|tell)\b.{0,80}\b(?:i\s+love\s+you|love\s+(?:them|him|her))\b/i.test(comment);
  return explicitDeclaration||declarationIntent?byId.get(I_LOVE_YOU_3000_ID)??null:null;
}

export function directRetriever(records) {
  return async()=>records;
}

export function semanticRetriever({catalogue:records,embed,query,limit=30}) {
  if(!Array.isArray(records)||records.length===0) throw new Error('Semantic retrieval needs a catalogue.');
  if(typeof embed!=='function'||typeof query!=='function') throw new Error('Semantic retrieval needs embed and query adapters.');
  if(!Number.isInteger(limit)||limit<1||limit>50) throw new Error('Semantic retrieval limit must be between 1 and 50.');
  const recordsById=new Map(records.map(record=>[record.id,record]));
  return async comment=>{
    if(typeof comment!=='string'||!comment.trim()) throw new Error('Semantic retrieval needs a comment.');
    const vector=await embed(comment);
    if(!Array.isArray(vector)||vector.length===0||vector.some(value=>typeof value!=='number'||!Number.isFinite(value))) throw new Error('Embedding adapter returned an invalid vector.');
    const matches=await query(vector,{topK:limit});
    if(!Array.isArray(matches)) throw new Error('Vector query returned an invalid result.');
    const seen=new Set();
    const shortlist=[];
    for(const match of matches) {
      if(typeof match?.id!=='string'||seen.has(match.id)||!recordsById.has(match.id)) continue;
      seen.add(match.id);
      shortlist.push(recordsById.get(match.id));
      if(shortlist.length===limit) break;
    }
    if(shortlist.length===0) throw new Error('Semantic retrieval returned no known catalogue IDs.');
    return shortlist;
  };
}

export function mergeWithReserve(broadMatches,reservedMatches,{limit=30,reserve=CORE_RESERVE}={}) {
  const reservedSlots=Math.min(limit,Math.max(0,reserve));
  const broadSlots=Math.max(0,limit-reservedSlots);
  const ordered=[...broadMatches.slice(0,broadSlots),...reservedMatches.slice(0,reservedSlots),...broadMatches.slice(broadSlots)];
  const seen=new Set();
  return ordered.filter(match=>{
    const id=match?.catalogue_id??match?.id;
    return typeof id==='string'&&id&&!seen.has(id)&&seen.add(id);
  }).slice(0,limit);
}

async function retrieveViewPair(env,vector,topK,filter={}) {
  const perViewTopK=Math.min(50,Math.max(topK,30));
  const [meaningResult,exampleResult]=await Promise.all([
    env.MEME_INDEX.query(vector,{topK:perViewTopK,filter:{...filter,view:'meaning'},returnMetadata:'all'}),
    env.MEME_INDEX.query(vector,{topK:perViewTopK,filter:{...filter,view:'example'},returnMetadata:'all'})
  ]);
  return reciprocalRankFuse([meaningResult?.matches,exampleResult?.matches],{limit:topK});
}

export async function retrieveCandidates(env,comment,topK=30) {
  const embedded=await env.AI.run(EMBEDDING_MODEL,{text:[comment],pooling:'cls'});
  const vector=embedded?.data?.[0];
  if(!Array.isArray(vector)||vector.length===0) throw new Error('Embedding model returned an invalid vector.');
  const coreReserve=Math.min(CORE_RESERVE,Math.max(0,topK-1));
  const [broadMatches,coreMatches]=await Promise.all([
    retrieveViewPair(env,vector,topK),
    coreReserve>0?retrieveViewPair(env,vector,coreReserve,{core:true}):[]
  ]);
  const seen=new Set();
  const candidates=mergeWithReserve(broadMatches,coreMatches,{limit:topK,reserve:coreReserve})
    .map(match=>byId.get(match.catalogue_id))
    .filter(record=>record&&!seen.has(record.id)&&seen.add(record.id))
    .slice(0,topK);
  const canonical=canonicalCandidateFor(comment);
  const withCanonical=canonical?[canonical,...candidates.filter(record=>record.id!==canonical.id)].slice(0,topK):candidates;
  if(withCanonical.length===0) throw new Error('Semantic retrieval returned no known memes.');
  return withCanonical;
}
