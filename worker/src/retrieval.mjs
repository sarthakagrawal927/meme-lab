import {catalogue} from './catalogue.stage1000.generated.mjs';

export const EMBEDDING_MODEL='@cf/baai/bge-base-en-v1.5';
const byId=new Map(catalogue.map(record=>[record.id,record]));

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

export async function retrieveCandidates(env,comment,topK=30) {
  const embedded=await env.AI.run(EMBEDDING_MODEL,{text:[comment],pooling:'cls'});
  const vector=embedded?.data?.[0];
  if(!Array.isArray(vector)||vector.length===0) throw new Error('Embedding model returned an invalid vector.');
  const result=await env.MEME_INDEX.query(vector,{topK,returnMetadata:'all'});
  const seen=new Set();
  const candidates=(result?.matches??[])
    .map(match=>byId.get(match.metadata?.catalogue_id??match.id))
    .filter(record=>record&&!seen.has(record.id)&&seen.add(record.id));
  if(candidates.length===0) throw new Error('Semantic retrieval returned no known memes.');
  return candidates;
}
