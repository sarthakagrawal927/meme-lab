import {catalogue} from './catalogue.stage3000.generated.mjs';

export const CLOSE_RELEVANCE_MARGIN=0.03;

const cataloguePosition=new Map(catalogue.map((record,index)=>[record.id,index]));
const clampScore=value=>Math.max(0,Math.min(100,Math.round(value)));

function inferredMemeStrength(record) {
  const position=cataloguePosition.get(record.id);
  if(position===undefined) return 50;
  if(position<30) return 90;
  if(position<300) return 76;
  return 62;
}

function inferredAssetQuality(record) {
  if(!record.image_url||record.media_status==='unavailable') return 0;
  if(record.media_status==='approved') return 92;
  try {
    const url=new URL(record.image_url);
    if(url.protocol!=='https:') return 20;
    if(url.hostname==='i.imgflip.com'&&/\.(?:jpe?g|png|webp)$/i.test(url.pathname)) return 78;
    if(url.hostname==='api.memegen.link') return 70;
    return 60;
  } catch {
    return 0;
  }
}

function assetLabel(score) {
  if(score>=86) return 'reviewed image';
  if(score>=72) return 'direct source preview';
  if(score>=50) return 'source preview needing review';
  if(score>0) return 'lower-quality source preview';
  return 'no usable preview';
}

export function staticCandidateSignals(record) {
  const memeStrength=clampScore(Number.isFinite(Number(record.meme_strength))?Number(record.meme_strength):inferredMemeStrength(record));
  const assetQuality=clampScore(Number.isFinite(Number(record.asset_quality))?Number(record.asset_quality):inferredAssetQuality(record));
  return {
    meme_strength:memeStrength,
    asset_quality:assetQuality,
    static_prior:Math.round(memeStrength*0.7+assetQuality*0.3),
    signal_summary:`Static signals rate meme strength at ${memeStrength}/100 and image quality at ${assetQuality}/100 (${assetLabel(assetQuality)}).`
  };
}

function relevanceScore(record) {
  const score=Number(record.classifier_score);
  return Number.isFinite(score)?score:0;
}

function relevanceOrder(left,right) {
  return relevanceScore(right)-relevanceScore(left)
    ||(left.retrieval_rank??Number.POSITIVE_INFINITY)-(right.retrieval_rank??Number.POSITIVE_INFINITY)
    ||String(left.id).localeCompare(String(right.id));
}

export function rankRelevanceCandidates(candidates,{limit=3,closeMargin=CLOSE_RELEVANCE_MARGIN}={}) {
  if(!Array.isArray(candidates)||!Number.isInteger(limit)||limit<1) throw new Error('Candidate ranking needs a positive limit.');
  if(!Number.isFinite(closeMargin)||closeMargin<0) throw new Error('Candidate ranking needs a non-negative close-call margin.');
  // Relevance alone decides which candidates are eligible. The static prior can
  // reorder only already-selected candidates whose relevance scores are close.
  const selected=[...candidates].sort(relevanceOrder).slice(0,limit).map(record=>({...record,...staticCandidateSignals(record)}));
  const groups=[];
  for(const candidate of selected) {
    const group=groups.at(-1);
    if(!group||relevanceScore(group[0])-relevanceScore(candidate)>closeMargin) groups.push([candidate]);
    else group.push(candidate);
  }
  return groups.flatMap(group=>group.sort((left,right)=>right.static_prior-left.static_prior||relevanceOrder(left,right)));
}
