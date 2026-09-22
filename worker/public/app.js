const $=selector=>document.querySelector(selector);
const form=$('#meme-form');
const comment=$('#comment');
const submit=$('#submit');
const status=$('#status');
const loading=$('#loading');
const result=$('#result');
const noMatch=$('#no-match');
let currentRecommendation=null;
const fitText=candidate=>`${candidate.fit_label||'weak'}`.toUpperCase()+' FIT';
const displayText=value=>String(value??'')
  .replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code)))
  .replace(/&#x([\da-f]+);/gi,(_,code)=>String.fromCodePoint(Number.parseInt(code,16)))
  .replaceAll('&quot;','"')
  .replaceAll('&apos;',"'")
  .replaceAll('&amp;','&')
  .replaceAll('&lt;','<')
  .replaceAll('&gt;','>');

function showOnly(target) {
  loading.hidden=target!=='loading';
  result.hidden=target!=='result';
  noMatch.hidden=target!=='none';
}

function media(candidate,className) {
  const wrap=document.createElement('div');
  wrap.className=className;
  const mediaUrl=candidate.media_url||candidate.image_url;
  if(!mediaUrl) {
    wrap.append(Object.assign(document.createElement('span'),{className:'media-fallback',textContent:'Preview unavailable'}));
    return wrap;
  }
  const image=document.createElement('img');
  image.alt=`Meme preview: ${displayText(candidate.name)}`;
  image.referrerPolicy='no-referrer';
  image.loading='eager';
  image.decoding='async';
  image.onerror=()=>wrap.replaceChildren(Object.assign(document.createElement('span'),{className:'media-fallback',textContent:'Preview unavailable'}));
  image.src=mediaUrl;
  if(candidate.id) {
    const link=Object.assign(document.createElement('a'),{className:'media-link',href:`/memes/${encodeURIComponent(candidate.id)}`,'aria-label':`Open ${displayText(candidate.name)} meme details`});
    link.append(image);
    wrap.append(link);
  } else wrap.append(image);
  if(candidate.media_type==='gif') wrap.append(Object.assign(document.createElement('span'),{className:'media-kind',textContent:'GIF'}));
  return wrap;
}

function renderBest(candidate) {
  const host=$('#best-result');
  host.replaceChildren();
  const copy=document.createElement('div');
  copy.className='result-copy';
  const lowConfidence=currentRecommendation?.confidence==='low';
  const perspectiveAware=candidate.perspective&&candidate.perspective!=='best_match';
  const matchLabel=perspectiveAware?candidate.perspective_label.toUpperCase():'BEST MATCH';
  const rank=Object.assign(document.createElement('span'),{className:`rank${lowConfidence?' low-confidence':''}`,textContent:`${lowConfidence?'LOW CONFIDENCE · ':''}${matchLabel} · ${fitText(candidate)}`});
  const title=document.createElement('h2');
  title.append(Object.assign(document.createElement('a'),{href:`/memes/${encodeURIComponent(candidate.id)}`,textContent:displayText(candidate.name)}));
  const signals=Object.assign(document.createElement('p'),{className:'signal-note',textContent:candidate.signal_summary});
  const sourceText=candidate.license_url?'Open original · licensed source':candidate.media_status==='approved'?'Open approved source':'Open source preview · media rights not established';
  const source=document.createElement('p');
  source.className='source-note';
  if(candidate.source_url) {
    const link=Object.assign(document.createElement('a'),{textContent:sourceText,href:candidate.source_url,target:'_blank',rel:'noopener noreferrer'});
    source.append(link);
  } else source.textContent=sourceText;
  copy.append(rank,title,signals,source);
  host.append(media(candidate,'hero-media'),copy);
}

function renderAlternatives(candidates) {
  const host=$('#alternatives');
  host.replaceChildren();
  $('#alternatives-wrap').hidden=!candidates.length;
  const perspectiveAware=candidates.some(candidate=>candidate.perspective&&candidate.perspective!=='best_match');
  $('#alternatives-title').textContent=perspectiveAware?'OTHER PERSPECTIVES':'ALSO FITS';
  $('#alternatives-subtitle').textContent=perspectiveAware?'Different angles, ranked by fit.':'Four backups, ranked by fit.';
  for(const candidate of candidates) {
    const card=document.createElement('article');
    card.className='alternative';
    const copy=document.createElement('div');
    copy.className='alternative-copy';
    const title=document.createElement('h3');
    title.append(Object.assign(document.createElement('a'),{href:`/memes/${encodeURIComponent(candidate.id)}`,textContent:displayText(candidate.name)}));
    copy.append(
      Object.assign(document.createElement('span'),{textContent:`${candidate.perspective&&candidate.perspective!=='best_match'?candidate.perspective_label.toUpperCase():`#${candidate.rank}`} · ${fitText(candidate)}`}),
      title,
      Object.assign(document.createElement('p'),{className:'signal-note',textContent:candidate.signal_summary})
    );
    card.append(media(candidate,'alternative-media'),copy);
    host.append(card);
  }
}

async function findMeme() {
  const value=comment.value.trim();
  if(!value) { status.textContent='Paste a comment first.'; comment.focus(); return; }
  status.textContent='';
  submit.disabled=true;
  submit.querySelector('span').textContent='Finding it…';
  showOnly('loading');
  try {
    const response=await fetch('/api/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({comment:value})});
    const data=await response.json();
    if(!response.ok) throw new Error(data.error||'Could not find a meme.');
    if(data.decision==='none') {
      currentRecommendation=data;
      $('#no-match-reason').textContent=data.none_reason;
      showOnly('none');
      return;
    }
    currentRecommendation=data;
    renderBest(data.candidates[0]);
    renderAlternatives(data.candidates.slice(1));
    $('#feedback').hidden=!data.feedback_enabled;
    $('#feedback-status').textContent='';
    for(const button of document.querySelectorAll('[data-verdict]')) { button.disabled=false;button.removeAttribute('aria-pressed'); }
    showOnly('result');
    result.scrollIntoView({behavior:'smooth',block:'start'});
  } catch(error) {
    showOnly('form');
    status.textContent=error.message;
  } finally {
    submit.disabled=false;
    submit.querySelector('span').textContent='Find the meme';
  }
}

form.addEventListener('submit',event=>{event.preventDefault();findMeme();});
for(const button of document.querySelectorAll('[data-example]')) button.addEventListener('click',()=>{comment.value=button.dataset.example;comment.focus();});
$('#try-again').addEventListener('click',()=>{showOnly('form');comment.focus();window.scrollTo({top:0,behavior:'smooth'});});
$('#edit-comment').addEventListener('click',()=>{showOnly('form');comment.focus();window.scrollTo({top:0,behavior:'smooth'});});
for(const button of document.querySelectorAll('[data-verdict]')) button.addEventListener('click',async()=>{
  if(!currentRecommendation?.request_id||!currentRecommendation.candidates?.[0]) return;
  for(const peer of document.querySelectorAll('[data-verdict]')) peer.disabled=true;
  $('#feedback-status').textContent='Saving…';
  try {
    const response=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:currentRecommendation.request_id,verdict:button.dataset.verdict,candidate_id:currentRecommendation.candidates[0].id})});
    const data=await response.json();
    if(!response.ok) throw new Error(data.error||'Could not save feedback.');
    button.setAttribute('aria-pressed','true');
    $('#feedback-status').textContent='Saved. Thank you.';
  } catch(error) {
    $('#feedback-status').textContent=error.message;
    for(const peer of document.querySelectorAll('[data-verdict]')) peer.disabled=false;
  }
});
