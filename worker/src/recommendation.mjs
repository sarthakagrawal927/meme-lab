import {catalogue} from './catalogue.stage300.generated.mjs';

export const MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const allowedIds=new Set(catalogue.map(record=>record.id));
const publicById=new Map(catalogue.map(record=>[record.id,{
  id:record.id,
  name:record.name,
  image_url:record.image_url,
  media_status:record.media_status
}]));

export function validateSelection(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('The model returned an invalid result.');
  if(!['meme','none'].includes(value.decision)||!['high','medium','low'].includes(value.confidence)||typeof value.none_reason!=='string'||!Array.isArray(value.candidates)) throw new Error('The model returned an invalid result.');
  if(value.candidates.length>3) throw new Error('The model returned too many candidates.');
  const seen=new Set();
  for(const candidate of value.candidates) {
    if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)||!allowedIds.has(candidate.id)||typeof candidate.reason!=='string'||!candidate.reason.trim()||candidate.reason.length>300) throw new Error('The model returned an unknown candidate.');
    if(!Number.isInteger(candidate.score)||candidate.score<0||candidate.score>100) throw new Error('The model returned an invalid fit score.');
    if(seen.has(candidate.id)) throw new Error('The model returned a duplicate candidate.');
    seen.add(candidate.id);
  }
  if(value.decision==='meme'&&value.candidates.length===0) throw new Error('The model returned no meme candidates.');
  if(value.decision==='none'&&(value.candidates.length>0||!value.none_reason.trim())) throw new Error('The model returned a contradictory result.');
  if(value.decision==='none'&&value.confidence!=='low') throw new Error('The model returned a contradictory confidence.');
  return value;
}

export function normalizeSelection(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.candidates)) return value;
  const confidence=['high','medium','low'].includes(value.confidence)?value.confidence:'low';
  if(value.candidates.length>0) return {...value,decision:'meme',confidence,none_reason:'',candidates:[...value.candidates].sort((a,b)=>(b.score??-1)-(a.score??-1))};
  return {...value,decision:'none',confidence:'low',none_reason:typeof value.none_reason==='string'&&value.none_reason.trim()?value.none_reason:'None of the current references is a natural fit.'};
}

export function presentSelection(selection) {
  return {
    request_id:crypto.randomUUID(),
    decision:selection.decision,
    confidence:selection.confidence,
    none_reason:selection.decision==='none'?selection.none_reason:'',
    candidates:selection.candidates.map((candidate,rank)=>({
      ...publicById.get(candidate.id),
      rank:rank+1,
      reason:candidate.reason,
      score:candidate.score
    }))
  };
}
