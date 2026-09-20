export function directRetriever(catalogue) {
  return async()=>catalogue;
}

export function semanticRetriever({catalogue,embed,query,limit=30}) {
  if(!Array.isArray(catalogue)||catalogue.length===0) throw new Error('Semantic retrieval needs a catalogue.');
  if(typeof embed!=='function'||typeof query!=='function') throw new Error('Semantic retrieval needs embed and query adapters.');
  if(!Number.isInteger(limit)||limit<1||limit>50) throw new Error('Semantic retrieval limit must be between 1 and 50.');
  const byId=new Map(catalogue.map(record=>[record.id,record]));
  return async comment=>{
    if(typeof comment!=='string'||!comment.trim()) throw new Error('Semantic retrieval needs a comment.');
    const vector=await embed(comment);
    if(!Array.isArray(vector)||vector.length===0||vector.some(value=>typeof value!=='number'||!Number.isFinite(value))) throw new Error('Embedding adapter returned an invalid vector.');
    const matches=await query(vector,{topK:limit});
    if(!Array.isArray(matches)) throw new Error('Vector query returned an invalid result.');
    const seen=new Set();
    const shortlist=[];
    for(const match of matches) {
      if(typeof match?.id!=='string'||seen.has(match.id)||!byId.has(match.id)) continue;
      seen.add(match.id);
      shortlist.push(byId.get(match.id));
      if(shortlist.length===limit) break;
    }
    if(shortlist.length===0) throw new Error('Semantic retrieval returned no known catalogue IDs.');
    return shortlist;
  };
}
