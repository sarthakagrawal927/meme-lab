import {catalogue} from './catalogue.stage1000.generated.mjs';

export const EMBEDDING_MODEL='@cf/baai/bge-base-en-v1.5';
const byId=new Map(catalogue.map(record=>[record.id,record]));

export function directRetriever(records) {
  return async()=>records;
}

export function reciprocalRankFuse(resultSets,{limit=30,rankConstant=60}={}) {
  const fused=new Map();
  for(const matches of resultSets) {
    for(const [index,match] of (matches??[]).entries()) {
      const catalogueId=match?.metadata?.catalogue_id??match?.id;
      if(typeof catalogueId!=='string'||!catalogueId) continue;
      const current=fused.get(catalogueId)??{...match,catalogue_id:catalogueId,best_vector_id:match.id,best_metadata:match.metadata,rrf_score:0,best_rank:Number.POSITIVE_INFINITY};
      current.rrf_score+=1/(rankConstant+index+1);
      current.best_rank=Math.min(current.best_rank,index+1);
      if(Number(match.score)>Number(current.score)) {
        current.score=match.score;
        current.best_vector_id=match.id;
        current.best_metadata=match.metadata;
      }
      fused.set(catalogueId,current);
    }
  }
  return [...fused.values()]
    .sort((a,b)=>b.rrf_score-a.rrf_score||a.best_rank-b.best_rank||Number(b.score)-Number(a.score)||a.catalogue_id.localeCompare(b.catalogue_id))
    .slice(0,limit);
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

export async function retrieveCandidates(env,comment,topK=30) {
  const embedded=await env.AI.run(EMBEDDING_MODEL,{text:[comment],pooling:'cls'});
  const vector=embedded?.data?.[0];
  if(!Array.isArray(vector)||vector.length===0) throw new Error('Embedding model returned an invalid vector.');
  const perViewTopK=Math.min(50,Math.max(topK,30));
  const [meaningResult,exampleResult]=await Promise.all([
    env.MEME_INDEX.query(vector,{topK:perViewTopK,filter:{view:'meaning'},returnMetadata:'all'}),
    env.MEME_INDEX.query(vector,{topK:perViewTopK,filter:{view:'example'},returnMetadata:'all'})
  ]);
  const seen=new Set();
  const candidates=reciprocalRankFuse([meaningResult?.matches,exampleResult?.matches],{limit:topK})
    .map(match=>byId.get(match.catalogue_id))
    .filter(record=>record&&!seen.has(record.id)&&seen.add(record.id))
    .slice(0,topK);
  if(candidates.length===0) throw new Error('Semantic retrieval returned no known memes.');
  return candidates;
}
