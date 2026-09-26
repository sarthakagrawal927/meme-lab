import {createHash} from 'node:crypto';

export const WIKIQUOTE_FILM_INDEXES=[
  'List of films (A–C)',
  'List of films (D–F)',
  'List of films (G–I)',
  'List of films (J–L)',
  'List of films (M–O)',
  'List of films (P–S)',
  'List of films (T–V)',
  'List of films (W–Z)'
];

const EXCLUDED_SECTION=/^(?:about|cast|taglines?|external links?|see also|references?|notes?|misattributed|unsourced|production|soundtrack|lyrics?|trivia|marketing|home media|further reading)\b/i;
const GENERIC_SECTION=/^(?:dialogue|quotes?|others?|other characters?|characters?)$/i;
const STOP_WORDS=new Set(['a','an','and','are','as','at','be','but','by','for','from','he','her','hers','him','his','i','in','is','it','its','me','my','of','on','or','our','ours','she','so','that','the','their','them','they','this','to','us','was','we','were','you','your','yours']);

function decodeHtmlEntities(value) {
  return String(value??'')
    .replace(/&#(\d+);/g,(_,number)=>String.fromCodePoint(Number(number)))
    .replace(/&#x([\da-f]+);/gi,(_,number)=>String.fromCodePoint(Number.parseInt(number,16)))
    .replace(/&(amp|apos|quot|lt|gt|nbsp|mdash|ndash|hellip);/gi,(_,entity)=>({amp:'&',apos:"'",quot:'"',lt:'<',gt:'>',nbsp:' ',mdash:'—',ndash:'–',hellip:'…'}[entity.toLowerCase()]));
}

function removeTemplates(value) {
  let result=value;
  for(let pass=0;pass<5;pass+=1) {
    const next=result.replace(/\{\{[^{}]*\}\}/g,' ');
    if(next===result) break;
    result=next;
  }
  return result;
}

export function stripWikiMarkup(value) {
  let result=String(value??'')
    .replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref\s*>/gi,' ')
    .replace(/<ref\b[^>]*\/\s*>/gi,' ')
    .replace(/<br\s*\/?\s*>/gi,' ')
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g,'$1')
    .replace(/\[(?:https?:\/\/\S+)(?:\s+([^\]]+))?\]/g,'$1')
    .replace(/'{2,5}/g,'');
  result=removeTemplates(result)
    .replace(/<[^>]+>/g,' ')
    .replace(/\[(?:[^\][]{0,180})\]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
  return decodeHtmlEntities(result).replace(/\s+/g,' ').trim();
}

export function stripDialogueStageDirections(value) {
  const stageDirection=/\((?=[^)]*(?:\s+[^)]*){2,})[^)]{5,180}\)\s*:?/g;
  const shortLeadingDirection=/^\([a-z][^)?!.]{2,80}\)\s*:?\s*/;
  return String(value??'').replace(shortLeadingDirection,'').replace(stageDirection,' ').replace(/\s+/g,' ').trim();
}

export function normalizeQuote(value) {
  return decodeHtmlEntities(String(value??''))
    .normalize('NFKC')
    .replace(/[“”]/g,'"')
    .replace(/[‘’]/g,"'")
    .replace(/[—–]/g,'-')
    .replace(/\s+/g,' ')
    .trim();
}

export function normalizedQuoteKey(value) {
  return normalizeQuote(value).toLowerCase().replace(/[^\p{L}\p{N}']+/gu,' ').trim();
}

function words(value) {
  return normalizeQuote(value).match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)??[];
}

function slug(value) {
  return String(value??'').normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,72)||'film';
}

function stableDialogueId({title,speaker,quote}) {
  const digest=createHash('sha256').update(`${title}\0${speaker??''}\0${normalizedQuoteKey(quote)}`).digest('hex').slice(0,12);
  return `dialogue-${slug(title)}-${digest}`;
}

export function dialogueScreeningSignals(quote,{speaker}={}) {
  const tokens=words(quote);
  const normalizedTokens=tokens.map(token=>token.toLowerCase());
  const uniqueRatio=tokens.length?new Set(normalizedTokens).size/tokens.length:0;
  const meaningful=normalizedTokens.filter(token=>token.length>2&&!STOP_WORDS.has(token));
  const startsWithConnector=/^(?:and|but|because|so|then)\b/i.test(quote);
  const dangling=/[-,:;…]$|\.\.\.$/.test(quote.trim());
  const terminal=/[.!?"']$/.test(quote.trim());
  let score=10;
  if(speaker) score+=15;
  if(tokens.length>=4&&tokens.length<=18) score+=25;
  else if(tokens.length<=28) score+=17;
  else score+=8;
  if(terminal) score+=10;
  if(uniqueRatio>=0.72) score+=10;
  if(meaningful.length>=2) score+=10;
  if(/[!?]/.test(quote)) score+=5;
  if(startsWithConnector) score-=8;
  if(dangling) score-=12;
  return {
    word_count:tokens.length,
    unique_word_ratio:Number(uniqueRatio.toFixed(3)),
    starts_with_connector:startsWithConnector,
    dangling_fragment:dangling,
    terminal_punctuation:terminal,
    screening_score:Math.max(0,Math.min(100,score)),
    high_signal:score>=75
  };
}

function candidateFrom({page,section,speaker,quote,kind}) {
  const cleanedQuote=normalizeQuote(stripDialogueStageDirections(stripWikiMarkup(quote))).replace(/^:\s*/,'');
  const cleanedSpeaker=normalizeQuote(stripWikiMarkup(speaker));
  const signals=dialogueScreeningSignals(cleanedQuote,{speaker:cleanedSpeaker});
  let rejection=null;
  if(!cleanedSpeaker) rejection='missing_speaker';
  else if(/^[-–—]\s/.test(cleanedQuote)) rejection='nested_list_or_cast_entry';
  else if(signals.word_count<3) rejection='too_short';
  else if(signals.word_count>40) rejection='too_long';
  else if(!/[\p{L}\p{N}]/u.test(cleanedQuote)) rejection='nonverbal';
  else if((cleanedQuote.match(/"/g)?.length??0)%2!==0) rejection='unbalanced_quotation_mark';
  else if(/\{\{|\}\}|\[\[|\]\]|https?:\/\//i.test(cleanedQuote)) rejection='markup_residue';
  else if(/^\.{2,}$/.test(cleanedQuote)||/^[-–—]+$/.test(cleanedQuote)) rejection='placeholder';
  if(rejection) return {rejection,quote:cleanedQuote||String(quote).trim(),speaker:cleanedSpeaker||null,section};
  const sourceUrl=`https://en.wikiquote.org/wiki/${encodeURIComponent(page.title.replaceAll(' ','_'))}`;
  return {candidate:{
    id:stableDialogueId({title:page.title,speaker:cleanedSpeaker,quote:cleanedQuote}),
    content_type:'movie_dialogue',
    quote:cleanedQuote,
    speaker:cleanedSpeaker,
    work_title:page.title,
    section,
    source_kind:kind,
    screening:signals,
    provenance:{
      provider:'English Wikiquote',
      source_url:sourceUrl,
      page_title:page.title,
      page_id:page.pageid,
      revision_id:page.revid,
      revision_timestamp:page.timestamp,
      observed_on:page.observedOn
    },
    rights_status:'underlying_quote_not_established',
    review_status:'pilot_needs_semantic_review',
    human_validated:false
  }};
}

export function parseWikiquoteFilmPage(page) {
  const candidates=[];
  const rejections=[];
  let section='';
  let excluded=true;
  let rawCandidateLines=0;
  for(const rawLine of String(page.wikitext??'').split(/\r?\n/)) {
    const heading=rawLine.match(/^(={2,6})\s*(.*?)\s*\1\s*$/);
    if(heading) {
      section=normalizeQuote(stripWikiMarkup(heading[2]));
      excluded=!section||EXCLUDED_SECTION.test(section);
      continue;
    }
    if(excluded||!section) continue;
    const dialogue=rawLine.match(/^:+\s*'''(.+?)'''\s*:\s*(.+)$/);
    const labelledBullet=rawLine.match(/^\*\s*'''(.+?)'''\s*[:–—-]\s*(.+)$/);
    const characterBullet=!GENERIC_SECTION.test(section)?rawLine.match(/^\*\s+(?!\*)(.+)$/):null;
    const match=dialogue??labelledBullet;
    let speaker;
    let quote;
    let kind;
    if(match) {
      [,speaker,quote]=match;
      kind=dialogue?'dialogue_turn':'labelled_quote';
    } else if(characterBullet) {
      speaker=section;
      quote=characterBullet[1];
      kind='character_quote';
    } else continue;
    rawCandidateLines+=1;
    const parsed=candidateFrom({page,section,speaker,quote,kind});
    if(parsed.candidate) candidates.push(parsed.candidate);
    else rejections.push(parsed);
  }
  return {candidates,rejections,raw_candidate_lines:rawCandidateLines};
}

function proportionalAllocation(groups,total) {
  const available=groups.reduce((sum,group)=>sum+group.length,0);
  if(total>available) throw new Error(`Cannot sample ${total} titles from ${available}.`);
  const allocations=groups.map((group,index)=>{
    const exact=group.length/available*total;
    return {index,count:Math.floor(exact),remainder:exact-Math.floor(exact)};
  });
  let assigned=allocations.reduce((sum,item)=>sum+item.count,0);
  for(const item of [...allocations].sort((left,right)=>right.remainder-left.remainder||left.index-right.index)) {
    if(assigned===total) break;
    item.count+=1;
    assigned+=1;
  }
  return allocations.sort((left,right)=>left.index-right.index).map(item=>item.count);
}

function evenlySpaced(values,count) {
  if(count===0) return [];
  if(count===1) return [values[Math.floor(values.length/2)]];
  return Array.from({length:count},(_,index)=>values[Math.round(index*(values.length-1)/(count-1))]);
}

export function selectStratifiedFilmTitles(indexGroups,total=500) {
  if(!Array.isArray(indexGroups)||indexGroups.length!==WIKIQUOTE_FILM_INDEXES.length) throw new Error(`Expected ${WIKIQUOTE_FILM_INDEXES.length} film index groups.`);
  const seen=new Set();
  const groups=indexGroups.map(group=>[...new Set(group.filter(title=>typeof title==='string'&&title.trim()).map(title=>title.trim()))]
    .filter(title=>!seen.has(title)&&seen.add(title))
    .sort((left,right)=>left.localeCompare(right,'en')));
  const allocations=proportionalAllocation(groups,total);
  const titles=groups.flatMap((group,index)=>evenlySpaced(group,allocations[index]));
  if(titles.length!==total||new Set(titles).size!==total) throw new Error(`Stratified sample must contain ${total} unique titles; found ${titles.length}/${new Set(titles).size}.`);
  return {titles,allocations,available:groups.reduce((sum,group)=>sum+group.length,0),group_sizes:groups.map(group=>group.length)};
}

function tokenSet(value) {
  return new Set(words(value).map(token=>token.toLowerCase()).filter(token=>token.length>2&&!STOP_WORDS.has(token)));
}

function jaccard(left,right) {
  if(!left.size||!right.size) return 0;
  let intersection=0;
  for(const token of left) if(right.has(token)) intersection+=1;
  return intersection/(left.size+right.size-intersection);
}

export function auditDialogueDuplicates(records,{nearThreshold=0.86}={}) {
  const exactIndex=new Map();
  const exact=[];
  const unique=[];
  for(const record of records) {
    const key=normalizedQuoteKey(record.quote);
    const prior=exactIndex.get(key);
    if(prior) exact.push({kept_id:prior.id,duplicate_id:record.id,quote:record.quote});
    else { exactIndex.set(key,record); unique.push(record); }
  }
  const buckets=new Map();
  for(const record of unique) {
    const meaningful=[...tokenSet(record.quote)];
    if(meaningful.length<3) continue;
    const key=meaningful.slice(0,3).join(' ');
    if(!key) continue;
    const bucket=buckets.get(key)??[];
    bucket.push({...record,_tokens:new Set(meaningful)});
    buckets.set(key,bucket);
  }
  const near=[];
  for(const bucket of buckets.values()) {
    for(let leftIndex=0;leftIndex<bucket.length;leftIndex+=1) {
      for(let rightIndex=leftIndex+1;rightIndex<bucket.length;rightIndex+=1) {
        const left=bucket[leftIndex];
        const right=bucket[rightIndex];
        const similarity=jaccard(left._tokens,right._tokens);
        if(similarity>=nearThreshold) near.push({left_id:left.id,right_id:right.id,similarity:Number(similarity.toFixed(3)),left_quote:left.quote,right_quote:right.quote});
      }
    }
  }
  return {unique,exact,near};
}

const REVIEW_FIELDS=['standalone','sendable','emotional_clarity','memorable_phrasing','context_dependence'];

export function validateDialogueReviewBatch(value,allowedIds) {
  if(!value||typeof value!=='object'||!Array.isArray(value.reviews)) throw new Error('Dialogue review response needs a reviews array.');
  const seen=new Set();
  return value.reviews.map(review=>{
    if(typeof review?.id!=='string'||!allowedIds.has(review.id)||seen.has(review.id)) throw new Error(`Dialogue review has an unknown or duplicate ID: ${review?.id}.`);
    seen.add(review.id);
    for(const field of REVIEW_FIELDS) if(!Number.isInteger(review[field])||review[field]<0||review[field]>4) throw new Error(`${review.id} has an invalid ${field}.`);
    if(typeof review.reason!=='string'||review.reason.trim().length<8||review.reason.trim().length>180) throw new Error(`${review.id} needs a short review reason.`);
    const qualityScore=Math.round(100*(review.standalone+review.sendable+review.emotional_clarity+review.memorable_phrasing+(4-review.context_dependence))/20);
    const passes=review.standalone>=3&&review.sendable>=3&&review.emotional_clarity>=3&&review.memorable_phrasing>=2&&review.context_dependence<=2;
    return {...review,reason:review.reason.trim(),quality_score:qualityScore,passes_quality_gate:passes,human_validated:false};
  });
}

export function summarizeDialogueReviews(reviews) {
  const passes=reviews.filter(review=>review.passes_quality_gate);
  const average=field=>reviews.length?Number((reviews.reduce((sum,review)=>sum+review[field],0)/reviews.length).toFixed(3)):0;
  return {
    reviewed:reviews.length,
    passed:passes.length,
    pass_rate:Number((passes.length/Math.max(1,reviews.length)).toFixed(4)),
    average_scores:Object.fromEntries([...REVIEW_FIELDS,'quality_score'].map(field=>[field,average(field)]))
  };
}

export function summarizeDialogueScreeningModel(reviews) {
  const ratio=count=>Number((count/Math.max(1,reviews.length)).toFixed(4));
  const counts=field=>Object.fromEntries([...new Set(reviews.map(review=>review[field]))].sort().map(label=>[label,reviews.filter(review=>review[field]===label).length]));
  const keepCount=reviews.filter(review=>review.keep===true).length;
  const standalone=counts('standalone');
  const strength=counts('strength');
  const dominantShare=labels=>ratio(Math.max(0,...Object.values(labels)));
  const warnings=[];
  if(ratio(keepCount)>0.9) warnings.push('keep_rate_above_90_percent');
  if(dominantShare(standalone)>0.9) warnings.push('standalone_label_concentration_above_90_percent');
  if(dominantShare(strength)>0.9) warnings.push('strength_label_concentration_above_90_percent');
  return {
    status:warnings.length?'degenerate_distribution':'usable_for_owner_calibration',
    reviewed:reviews.length,
    keep_rate:ratio(keepCount),
    label_distribution:{standalone,strength},
    warnings
  };
}
