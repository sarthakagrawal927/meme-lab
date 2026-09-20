import {catalogue} from './catalogue.stage3000.generated.mjs';
import {staticCandidateSignals} from './candidate-signals.mjs';

export const MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const MINIMUM_VISIBLE_FIT=0.1;
export const MINIMUM_VISIBLE_PERSPECTIVE_FIT=0.25;
const allowedIds=new Set(catalogue.map(record=>record.id));
const publicById=new Map(catalogue.map(record=>{
  const {meme_strength,asset_quality,signal_summary}=staticCandidateSignals(record);
  return [record.id,{
    id:record.id,
    name:record.name,
    image_url:record.image_url,
    media_status:record.media_status,
    license_url:record.license_url,
    meme_strength,
    asset_quality,
    signal_summary
  }];
}));
const comparable=value=>value.toLocaleLowerCase().replaceAll(/[^\p{L}\p{N}]+/gu,' ').trim();

function hasCompleteExplanation(reason,candidateId) {
  if(typeof reason!=='string') return false;
  const trimmed=reason.trim();
  const wordCount=trimmed.split(/\s+/u).filter(Boolean).length;
  const memeName=publicById.get(candidateId)?.name;
  const generic=/^(generally|sometimes|rarely),|\b(?:represents|is used for)\b|\bsituation template\b/i;
  return wordCount>=8&&wordCount<=40&&!generic.test(trimmed)&&/^[A-Z0-9]/u.test(trimmed)&&/[.!?]$/u.test(trimmed)&&typeof memeName==='string'&&comparable(trimmed).includes(comparable(memeName));
}

function normalizeExplanation(candidate) {
  if(!candidate||typeof candidate!=='object'||typeof candidate.reason!=='string') return candidate;
  const memeName=publicById.get(candidate.id)?.name;
  let reason=candidate.reason.trim();
  if(!memeName||!reason) return {...candidate,reason};
  if(!comparable(reason).includes(comparable(memeName))) {
    const explanation=reason.replace(/[.!?]+$/u,'');
    reason=`${memeName} fits because ${explanation.charAt(0).toLocaleLowerCase()}${explanation.slice(1)}`;
  }
  if(!/[.!?]$/u.test(reason)) reason+='.';
  if(reason.split(/\s+/u).filter(Boolean).length<8) reason=`${reason.replace(/[.!?]+$/u,'')}, matching this specific social situation.`;
  return {...candidate,reason};
}

export function validateSelection(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('The model returned an invalid result.');
  if(!['meme','none'].includes(value.decision)||!['high','medium','low'].includes(value.confidence)||typeof value.none_reason!=='string'||!Array.isArray(value.candidates)) throw new Error('The model returned an invalid result.');
  if(value.candidates.length>3) throw new Error('The model returned too many candidates.');
  const seen=new Set();
  for(const candidate of value.candidates) {
    if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)||!allowedIds.has(candidate.id)) throw new Error('The model returned an unknown candidate.');
    if(!hasCompleteExplanation(candidate.reason,candidate.id)) throw new Error('The model returned an incomplete explanation.');
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
  if(value.candidates.length>0) return {...value,decision:'meme',confidence,none_reason:'',candidates:value.candidates.map(normalizeExplanation).sort((a,b)=>(b.score??-1)-(a.score??-1))};
  return {...value,decision:'none',confidence:'low',none_reason:typeof value.none_reason==='string'&&value.none_reason.trim()?value.none_reason:'None of the current references is a natural fit.'};
}

export function normalizeRankedSelection(value,rankedIds) {
  if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.candidates)) return value;
  const byId=new Map(value.candidates.map(candidate=>[candidate?.id,normalizeExplanation(candidate)]));
  const candidates=rankedIds.map(id=>byId.get(id)).filter(Boolean);
  let previous=101;
  for(const candidate of candidates) {
    const proposed=Number.isInteger(candidate.score)?candidate.score:60;
    candidate.score=Math.max(0,Math.min(100,proposed,previous-1));
    previous=candidate.score;
  }
  return {
    decision:'meme',
    confidence:['high','medium','low'].includes(value.confidence)?value.confidence:'low',
    none_reason:'',
    candidates
  };
}

export function validateRankedSelection(value,rankedIds) {
  const selection=validateSelection(value);
  if(selection.decision!=='meme'||selection.candidates.length!==rankedIds.length) throw new Error('The model did not explain every ranked candidate.');
  if(selection.candidates.some((candidate,index)=>candidate.id!==rankedIds[index])) throw new Error('The model changed the classifier ranking.');
  return selection;
}

export function selectionFromRanking(ranked,{minimumVisibleFit=MINIMUM_VISIBLE_FIT,minimumVisiblePerspectiveFit=MINIMUM_VISIBLE_PERSPECTIVE_FIT}={}) {
  if(!Array.isArray(ranked)||ranked.length===0) throw new Error('A ranked selection needs at least one candidate.');
  if(!Number.isFinite(minimumVisibleFit)||minimumVisibleFit<0||minimumVisibleFit>1) throw new Error('The visible-fit threshold must be between zero and one.');
  if(!Number.isFinite(minimumVisiblePerspectiveFit)||minimumVisiblePerspectiveFit<0||minimumVisiblePerspectiveFit>1) throw new Error('The perspective-fit threshold must be between zero and one.');
  const candidates=ranked
    .filter((candidate,index)=>index===0||candidate.classifier_score>=(candidate.perspective?minimumVisiblePerspectiveFit:minimumVisibleFit))
    .map(candidate=>({id:candidate.id,score:Math.round(candidate.classifier_score*100)}));
  const bestScore=candidates[0].score;
  return {
    decision:'meme',
    confidence:bestScore>=50?'high':bestScore>=20?'medium':'low',
    none_reason:'',
    candidates
  };
}

export function presentSelection(selection,{perspectives=new Map()}={}) {
  return {
    request_id:crypto.randomUUID(),
    decision:selection.decision,
    confidence:selection.confidence,
    none_reason:selection.decision==='none'?selection.none_reason:'',
    candidates:selection.candidates.map((candidate,rank)=>{
      const perspective=perspectives.get(candidate.id);
      return {
        ...publicById.get(candidate.id),
        rank:rank+1,
        ...(candidate.reason?{reason:candidate.reason}:{}),
        score:candidate.score,
        perspective:perspective?.perspective??'best_match',
        perspective_label:perspective?.perspective_label??'Best match'
      };
    })
  };
}
