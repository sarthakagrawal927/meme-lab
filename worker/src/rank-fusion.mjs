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
