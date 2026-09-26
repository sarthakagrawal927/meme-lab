export function normalizeDialogueTitle(value) {
  return String(value??'').normalize('NFKD').toLowerCase()
    .replace(/\([^)]*film[^)]*\)|\(\d{4}[^)]*\)/g,' ')
    .replace(/\bfilm\b/g,' ')
    .replace(/[^a-z0-9]+/g,' ')
    .trim()
    .replace(/^the /,'');
}

export function normalizeDialogueText(value) {
  return String(value??'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9']+/g,' ').trim();
}

export function tokenDice(left,right) {
  const a=new Set(normalizeDialogueText(left).split(' ').filter(Boolean));
  const b=new Set(normalizeDialogueText(right).split(' ').filter(Boolean));
  if(!a.size||!b.size) return 0;
  let intersection=0;
  for(const token of a) if(b.has(token)) intersection+=1;
  return 2*intersection/(a.size+b.size);
}

export function quoteSimilarity(left,right) {
  const a=normalizeDialogueText(left);
  const b=normalizeDialogueText(right);
  if(!a||!b) return 0;
  if(a===b) return 1;
  let similarity=tokenDice(a,b);
  if((a.includes(b)||b.includes(a))&&Math.min(a.length,b.length)>=20) similarity=Math.max(similarity,Math.min(a.length,b.length)/Math.max(a.length,b.length));
  const negations=new Set(['no','not','never','neither','nor','nothing','nobody','cannot',"can't","won't","don't","didn't","isn't","wasn't"]);
  const aNegated=a.split(' ').some(token=>negations.has(token));
  const bNegated=b.split(' ').some(token=>negations.has(token));
  if(aNegated!==bNegated) similarity*=.5;
  return Number(similarity.toFixed(4));
}

export function linkDialogueSources(cornellRecords,wikiquoteRecords,{nearThreshold=.8}={}) {
  const wikiquoteByTitle=new Map();
  for(const record of wikiquoteRecords) {
    const key=normalizeDialogueTitle(record.work_title);
    const rows=wikiquoteByTitle.get(key)??[];
    rows.push(record);
    wikiquoteByTitle.set(key,rows);
  }
  const links=[];
  for(const cornell of cornellRecords) {
    const candidates=wikiquoteByTitle.get(normalizeDialogueTitle(cornell.work_title))??[];
    let best=null;
    for(const wikiquote of candidates) {
      const similarity=quoteSimilarity(cornell.quote,wikiquote.quote);
      if(!best||similarity>best.similarity) best={wikiquote,similarity};
    }
    if(!best) continue;
    const exact=best.similarity===1;
    const minimumTokens=Math.min(normalizeDialogueText(cornell.quote).split(' ').length,normalizeDialogueText(best.wikiquote.quote).split(' ').length);
    if(!exact&&(best.similarity<nearThreshold||minimumTokens<4)) continue;
    links.push({
      cornell_dialogue_id:cornell.id,
      wikiquote_dialogue_id:best.wikiquote.id,
      work_title:cornell.work_title,
      quote:cornell.quote,
      wikiquote_quote:best.wikiquote.quote,
      match_kind:exact?'exact_normalized_quote':'near_quote',
      similarity:best.similarity,
      provenance:{cornell:cornell.provenance,wikiquote:best.wikiquote.provenance},
      review_status:'cross_source_corroborated_needs_owner_review',
      human_validated:false,
      production_eligible:false
    });
  }
  return links;
}

export function summarizeDialogueLinks(links) {
  return {
    linked_quotes:links.length,
    linked_films:new Set(links.map(link=>normalizeDialogueTitle(link.work_title))).size,
    exact_normalized_quotes:links.filter(link=>link.match_kind==='exact_normalized_quote').length,
    near_quotes:links.filter(link=>link.match_kind==='near_quote').length
  };
}
