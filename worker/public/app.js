const $=selector=>document.querySelector(selector);
const form=$('#meme-form');
const comment=$('#comment');
const submit=$('#submit');
const status=$('#status');
const loading=$('#loading');
const result=$('#result');
const noMatch=$('#no-match');

function showOnly(target) {
  loading.hidden=target!=='loading';
  result.hidden=target!=='result';
  noMatch.hidden=target!=='none';
}

function media(candidate,className) {
  const wrap=document.createElement('div');
  wrap.className=className;
  if(!candidate.image_url) {
    wrap.append(Object.assign(document.createElement('span'),{className:'media-fallback',textContent:'Preview unavailable'}));
    return wrap;
  }
  const image=document.createElement('img');
  image.alt=`Meme preview: ${candidate.name}`;
  image.referrerPolicy='no-referrer';
  image.loading='eager';
  image.decoding='async';
  image.onerror=()=>wrap.replaceChildren(Object.assign(document.createElement('span'),{className:'media-fallback',textContent:'Preview unavailable'}));
  image.src=candidate.image_url;
  wrap.append(image);
  return wrap;
}

function renderBest(candidate) {
  const host=$('#best-result');
  host.replaceChildren();
  const copy=document.createElement('div');
  copy.className='result-copy';
  const rank=Object.assign(document.createElement('span'),{className:'rank',textContent:'BEST MATCH'});
  const title=Object.assign(document.createElement('h2'),{textContent:candidate.name});
  const reason=Object.assign(document.createElement('p'),{textContent:candidate.reason});
  const source=Object.assign(document.createElement('p'),{className:'source-note',textContent:'Source preview · media rights not established'});
  copy.append(rank,title,reason,source);
  host.append(media(candidate,'hero-media'),copy);
}

function renderAlternatives(candidates) {
  const host=$('#alternatives');
  host.replaceChildren();
  $('#alternatives-wrap').hidden=!candidates.length;
  for(const candidate of candidates) {
    const card=document.createElement('article');
    card.className='alternative';
    const copy=document.createElement('div');
    copy.className='alternative-copy';
    copy.append(
      Object.assign(document.createElement('span'),{textContent:`#${candidate.rank}`}),
      Object.assign(document.createElement('h3'),{textContent:candidate.name}),
      Object.assign(document.createElement('p'),{textContent:candidate.reason})
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
      $('#no-match-reason').textContent=data.none_reason;
      showOnly('none');
      return;
    }
    renderBest(data.candidates[0]);
    renderAlternatives(data.candidates.slice(1));
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
