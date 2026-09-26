const UNSAFE=/\b(?:nsfw|porn|hentai|futanari|nude|nudity|boobs?|tits?|panties|facesit|sex(?:y|ual)?|fetish|xxx|onlyfans|cum|orgasm|rape|slur)\b/i;
const WATERMARK=/\b(?:4gifs?|gifsec|gifsoup|makeagif|reactiongifs?|tumblr|imgur|giphy|tenor|wifflegif|[a-z0-9-]{3,}\s+(?:com|net|org))\b/i;
const GENERIC_TAGS=new Set(['animated','animation','gif','reaction','reactions']);

export function normalizePhrase(value='') {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replaceAll(/[^a-z0-9]+/g,' ')
    .replaceAll(/\s+/g,' ')
    .trim();
}

export function parseReactionGifTags(value='') {
  const tags=[];
  for(const match of value.matchAll(/'((?:\\'|[^'])*)'/g)) {
    const tag=normalizePhrase(match[1].replaceAll("\\'","'"));
    if(tag&&!tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

export function cleanReactionGifOcr(value='') {
  const frames=value.split('[INTER_FRAME_SEP]');
  const unique=[];
  const seen=new Set();
  for(const frame of frames) {
    const cleaned=frame
      .replaceAll(/\s+/g,' ')
      .replaceAll(/^[-_.,:;]+|[-_.,:;]+$/g,'')
      .trim();
    const key=normalizePhrase(cleaned);
    if(key.length<2||seen.has(key)) continue;
    seen.add(key);
    unique.push(cleaned);
  }
  return unique.join(' / ').slice(0,400);
}

export function isUsefulReactionText(value='') {
  return /[a-z]{3}/i.test(value)&&!UNSAFE.test(value);
}

export function reactionGifMetadataQuality({tags=[],ocr=''}) {
  const usefulTags=tags.filter(tag=>!GENERIC_TAGS.has(normalizePhrase(tag))&&!WATERMARK.test(tag));
  const normalizedOcr=normalizePhrase(ocr);
  const ocrWords=normalizedOcr?normalizedOcr.split(' '):[];
  const watermarkOnly=Boolean(normalizedOcr)&&WATERMARK.test(normalizedOcr)&&ocrWords.length<=8;
  const usefulOcr=isUsefulReactionText(ocr)&&!watermarkOnly;
  const distinctWords=new Set([...usefulTags.flatMap(tag=>normalizePhrase(tag).split(' ')),...(usefulOcr?ocrWords:[])]).size;
  let score=0;
  score+=Math.min(45,usefulTags.length*11);
  if(usefulOcr) score+=ocrWords.length>=2&&ocrWords.length<=24?28:18;
  if(distinctWords>=3) score+=15;
  if(distinctWords>=6) score+=12;
  if(watermarkOnly) score-=45;
  return {
    score:Math.max(0,Math.min(100,score)),
    usefulTags,
    usefulOcr,
    watermarkOnly,
    distinctWords
  };
}

export function reactionGifSemanticKey({tags=[],ocr=''}) {
  const quality=reactionGifMetadataQuality({tags,ocr});
  const tagKey=[...quality.usefulTags].sort().join('|');
  const ocrKey=quality.usefulOcr?normalizePhrase(ocr):'';
  return `${tagKey}::${ocrKey}`||'unknown';
}

export function rankReactionGifCandidates(candidates,{limit,maxPerSemanticKey=8,minimumUses=1}={}) {
  if(!Number.isInteger(limit)||limit<1) throw new Error('Reaction GIF selection needs a positive integer limit.');
  if(!Number.isInteger(maxPerSemanticKey)||maxPerSemanticKey<1) throw new Error('Semantic bucket cap must be a positive integer.');
  if(!Number.isInteger(minimumUses)||minimumUses<1) throw new Error('Minimum observed uses must be a positive integer.');
  const maximumUsage=Math.max(1,...candidates.map(candidate=>candidate.usageCount??0));
  const uniqueByGiphy=new Map();
  for(const candidate of candidates) {
    if(!uniqueByGiphy.has(candidate.giphyId)) uniqueByGiphy.set(candidate.giphyId,candidate);
  }
  const ranked=[...uniqueByGiphy.values()].filter(candidate=>(candidate.usageCount??0)>=minimumUses).map(candidate=>{
    const metadataQuality=reactionGifMetadataQuality(candidate);
    const usageScore=Math.log1p(candidate.usageCount??0)/Math.log1p(maximumUsage)*100;
    const selectionScore=usageScore*0.64+metadataQuality.score*0.36;
    return {...candidate,metadataQuality,usageScore,selectionScore,semanticKey:reactionGifSemanticKey(candidate)};
  }).filter(candidate=>candidate.metadataQuality.score>=22&&!candidate.metadataQuality.watermarkOnly)
    .sort((left,right)=>right.selectionScore-left.selectionScore||right.usageCount-left.usageCount||left.giphyId.localeCompare(right.giphyId));

  const bucketCounts=new Map();
  const selected=[];
  let diversitySkips=0;
  for(const candidate of ranked) {
    const count=bucketCounts.get(candidate.semanticKey)??0;
    if(count>=maxPerSemanticKey) { diversitySkips+=1;continue; }
    bucketCounts.set(candidate.semanticKey,count+1);
    selected.push(candidate);
    if(selected.length===limit) break;
  }
  return {selected,eligible:ranked.length,diversitySkips,bucketCounts};
}

export function parseGifDimensions(bytes) {
  const view=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  if(view.length<10) return null;
  const signature=String.fromCharCode(...view.slice(0,6));
  if(!['GIF87a','GIF89a'].includes(signature)) return null;
  return {width:view[6]|view[7]<<8,height:view[8]|view[9]<<8};
}

export function gifMeetsReleaseResolution({width,height},{minimumLongSide=320,minimumShortSide=180}={}) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1) return false;
  return Math.max(width,height)>=minimumLongSide&&Math.min(width,height)>=minimumShortSide;
}

export const reactionGifSelectionPatterns={unsafe:UNSAFE,watermark:WATERMARK};
