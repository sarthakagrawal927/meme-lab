import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  WIKIQUOTE_FILM_INDEXES,
  auditDialogueDuplicates,
  parseWikiquoteFilmPage,
  selectStratifiedFilmTitles
} from '../src/dialogue-expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const API='https://en.wikiquote.org/w/api.php';
const USER_AGENT='Meme-Lab-Dataset/1.0 (+https://github.com/sarthakagrawal927/meme-lab)';
const TARGET_PAGES=500;
const TITLE_SAMPLE_SIZE=700;
const BATCH_SIZE=50;
const output=resolve(root,'expansion/sources/dialogue-wikiquote-pilot.jsonl');
const reportOutput=resolve(root,'expansion/sources/dialogue-wikiquote-pilot-report.json');
const sleep=milliseconds=>new Promise(resolvePromise=>setTimeout(resolvePromise,milliseconds));

async function fetchApi(params,{method='GET'}={}) {
  let lastError;
  for(let attempt=1;attempt<=3;attempt+=1) {
    const body=new URLSearchParams({...params,format:'json',formatversion:'2',maxlag:'5'});
    const url=method==='GET'?`${API}?${body}`:API;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),20_000);
    try {
      const response=await fetch(url,{
        method,
        headers:{'user-agent':USER_AGENT,...(method==='POST'?{'content-type':'application/x-www-form-urlencoded'}:{})},
        ...(method==='POST'?{body}:{}),
        signal:controller.signal
      });
      clearTimeout(timer);
      if((response.status===429||response.status>=500)&&attempt<3) {
        const retryAfter=Number(response.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter)?retryAfter*1000:500*attempt);
        continue;
      }
      if(!response.ok) throw new Error(`MediaWiki API returned HTTP ${response.status}.`);
      const payload=await response.json();
      if(payload.error) throw new Error(`MediaWiki API error: ${payload.error.code??'unknown'} ${payload.error.info??''}`.trim());
      return payload;
    } catch(error) {
      clearTimeout(timer);
      lastError=error;
      if(attempt<3) await sleep(500*attempt);
    }
  }
  throw lastError;
}

async function filmIndexLinks(page) {
  const payload=await fetchApi({action:'parse',page,prop:'links'});
  if(!Array.isArray(payload.parse?.links)) throw new Error(`${page} returned no link list.`);
  return payload.parse.links
    .filter(link=>link.ns===0)
    .map(link=>link.title??link['*'])
    .filter(title=>title&&!/^List of films\b/i.test(title));
}

async function fetchPages(titles) {
  const payload=await fetchApi({
    action:'query',
    prop:'revisions',
    titles:titles.join('|'),
    redirects:'1',
    rvprop:'ids|timestamp|content',
    rvslots:'main'
  },{method:'POST'});
  if(!Array.isArray(payload.query?.pages)) throw new Error('Wikiquote page batch returned no pages.');
  const byTitle=new Map(payload.query.pages.map(page=>[page.title,page]));
  return titles.map(title=>byTitle.get(title)).filter(Boolean);
}

function counts(values) {
  return Object.fromEntries([...values.entries()].sort((left,right)=>right[1]-left[1]||left[0].localeCompare(right[0])));
}

function percentile(values,fraction) {
  if(values.length===0) return 0;
  const sorted=[...values].sort((left,right)=>left-right);
  return sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*fraction))];
}

const observedOn=new Date().toISOString().slice(0,10);
const indexGroups=[];
for(const indexPage of WIKIQUOTE_FILM_INDEXES) {
  const links=await filmIndexLinks(indexPage);
  indexGroups.push(links);
  console.error(`Indexed ${indexPage}: ${links.length} mainspace links.`);
  await sleep(200);
}
const sample=selectStratifiedFilmTitles(indexGroups,TITLE_SAMPLE_SIZE);
const pages=[];
const failures=[];
for(let offset=0;offset<sample.titles.length;offset+=BATCH_SIZE) {
  const titles=sample.titles.slice(offset,offset+BATCH_SIZE);
  try {
    pages.push(...await fetchPages(titles));
  } catch(error) {
    failures.push({offset,titles,error:error.message});
  }
  console.error(`Checked ${Math.min(offset+BATCH_SIZE,sample.titles.length)}/${sample.titles.length} sampled titles.`);
  await sleep(250);
}

const existingPages=[];
const seenPageIds=new Set();
for(const page of pages) {
  if(page.missing||!page.revisions?.[0]||seenPageIds.has(page.pageid)) continue;
  seenPageIds.add(page.pageid);
  existingPages.push(page);
  if(existingPages.length===TARGET_PAGES) break;
}
if(existingPages.length<TARGET_PAGES) throw new Error(`Expected ${TARGET_PAGES} existing film pages; resolved ${existingPages.length} from ${TITLE_SAMPLE_SIZE} sampled titles.`);

const candidates=[];
const rejectionCounts=new Map();
const rejectionSamples=[];
const perFilm=[];
let rawCandidateLines=0;
let missingPages=0;
for(const page of existingPages) {
  const revision=page.revisions?.[0];
  const wikitext=revision?.slots?.main?.content;
  if(page.missing||typeof wikitext!=='string') {
    missingPages+=1;
    continue;
  }
  const parsed=parseWikiquoteFilmPage({
    title:page.title,
    pageid:page.pageid,
    revid:revision.revid,
    timestamp:revision.timestamp,
    wikitext,
    observedOn
  });
  rawCandidateLines+=parsed.raw_candidate_lines;
  candidates.push(...parsed.candidates);
  perFilm.push({title:page.title,retained:parsed.candidates.length,high_signal:parsed.candidates.filter(record=>record.screening.high_signal).length,rejected:parsed.rejections.length});
  for(const rejection of parsed.rejections) {
    rejectionCounts.set(rejection.rejection,(rejectionCounts.get(rejection.rejection)??0)+1);
    if(rejectionSamples.length<40) rejectionSamples.push({title:page.title,...rejection});
  }
}

const duplicates=auditDialogueDuplicates(candidates);
const retained=duplicates.unique;
const highSignal=retained.filter(record=>record.screening.high_signal);
const scores=retained.map(record=>record.screening.screening_score);
const nonEmptyFilms=perFilm.filter(film=>film.retained>0).length;
const report={
  version:'wikiquote-dialogue-pilot-v1',
  created_at:new Date().toISOString(),
  human_validated:false,
  production_eligible:false,
  source:{
    provider:'English Wikiquote',
    backend:'documented_mediawiki_api',
    api:API,
    index_pages:WIKIQUOTE_FILM_INDEXES,
    total_unique_index_links:sample.available,
    sample_strategy:'proportional allocation across eight alphabetical indexes, evenly spaced within each index',
    title_sample_size:TITLE_SAMPLE_SIZE,
    existing_page_target:TARGET_PAGES,
    group_sizes:sample.group_sizes,
    group_allocations:sample.allocations
  },
  requests:{
    index_requests:WIKIQUOTE_FILM_INDEXES.length,
    page_batch_requests:Math.ceil(TITLE_SAMPLE_SIZE/BATCH_SIZE),
    titles_attempted:TITLE_SAMPLE_SIZE,
    response_rows:pages.length,
    existing_pages_resolved:existingPages.length,
    redlinks_or_missing:pages.filter(page=>page.missing||!page.revisions?.[0]).length,
    failed_batches:failures.length,
    failures
  },
  extraction:{
    raw_candidate_lines:rawCandidateLines,
    structurally_retained_before_deduplication:candidates.length,
    retained_unique:retained.length,
    high_signal_heuristic:highSignal.length,
    films_with_retained_dialogue:nonEmptyFilms,
    films_without_retained_dialogue:perFilm.length-nonEmptyFilms,
    retained_per_film:Number((retained.length/Math.max(1,perFilm.length)).toFixed(2)),
    high_signal_per_film:Number((highSignal.length/Math.max(1,perFilm.length)).toFixed(2)),
    speaker_attribution_coverage:Number((retained.filter(record=>record.speaker).length/Math.max(1,retained.length)).toFixed(4)),
    rejection_reasons:counts(rejectionCounts)
  },
  duplicates:{
    exact_duplicates:duplicates.exact.length,
    near_duplicate_pairs:duplicates.near.length,
    exact_samples:duplicates.exact.slice(0,20),
    near_samples:duplicates.near.slice(0,20)
  },
  screening:{
    name:'deterministic structural screening; not a learned quality score',
    threshold_for_high_signal:75,
    score_percentiles:{p10:percentile(scores,0.1),p50:percentile(scores,0.5),p90:percentile(scores,0.9)},
    projected_high_signal_at_current_index_size:Math.round(highSignal.length/Math.max(1,TARGET_PAGES)*sample.available),
    projection_warning:'The projection is a directional yield estimate, not evidence that every projected line is relevant, memorable, lawful to republish, or production-ready.'
  },
  review_samples:{
    highest_screening:[...retained].sort((left,right)=>right.screening.screening_score-left.screening.screening_score||left.id.localeCompare(right.id)).slice(0,30),
    lowest_retained:[...retained].sort((left,right)=>left.screening.screening_score-right.screening.screening_score||left.id.localeCompare(right.id)).slice(0,30),
    rejected:rejectionSamples
  },
  per_film:{
    lowest_yield:[...perFilm].sort((left,right)=>left.retained-right.retained||left.title.localeCompare(right.title)).slice(0,30),
    highest_yield:[...perFilm].sort((left,right)=>right.retained-left.retained||left.title.localeCompare(right.title)).slice(0,30)
  },
  rights_boundary:'Wikiquote page contributions have reuse terms, but underlying film dialogue may remain copyrighted. Every record stays source-linked and rights-unestablished pending a separate release decision.',
  uncertainty:'Structural screening measures parseability, attribution and surface-level sendability signals. It does not establish cultural recognition, contextual independence, semantic usefulness, factual accuracy, copyright status or human preference.'
};

await mkdir(dirname(output),{recursive:true});
await Promise.all([
  writeFile(output,`${retained.map(record=>JSON.stringify(record)).join('\n')}\n`),
  writeFile(reportOutput,`${JSON.stringify(report,null,2)}\n`)
]);
console.log(JSON.stringify({
  status:failures.length?'completed_with_failures':'completed',
  sampled_films:TARGET_PAGES,
  titles_checked:TITLE_SAMPLE_SIZE,
  pages_received:existingPages.length,
  retained_unique:retained.length,
  high_signal_heuristic:highSignal.length,
  high_signal_per_film:report.extraction.high_signal_per_film,
  exact_duplicates:duplicates.exact.length,
  near_duplicate_pairs:duplicates.near.length,
  output,
  report:reportOutput
},null,2));
