const $=selector=>document.querySelector(selector);
const displayCase=value=>value&&value===value.toLowerCase()?value.replace(/(^|[\s"(-])([a-z])/g,(_,prefix,letter)=>prefix+letter.toUpperCase()):value;
const state={mode:new URLSearchParams(location.search).get('dataset')==='dialogue'?'dialogue':'meme',items:[],catalogue:new Map(),index:0,busy:false,showComplete:false,drafts:new Map(),calibration:null};

async function api(path,body) {
  const response=await fetch(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Meme-Lab':'1'},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok) throw new Error(data.error||`HTTP ${response.status}`);
  return data;
}

function announce(message) { $('#review-status').textContent=message; }
function reviewedCount() { return state.items.filter(item=>item.review).length; }
function updateProgress() {
  const reviewed=reviewedCount();
  const total=state.items.length;
  $('#progress-count').textContent=`${reviewed} / ${total}`;
  $('#progress-remaining').textContent=total===reviewed?'Complete':`${total-reviewed} remaining`;
  $('#progress-bar').style.width=total?`${(reviewed/total)*100}%`:'0%';
}

function updateCalibration() {
  const dialogue=state.mode==='dialogue';
  const card=$('#calibration-card');
  card.hidden=!dialogue;
  if(!dialogue) return;
  const report=state.calibration;
  const metrics=$('#calibration-metrics');
  if(!report) {
    $('#calibration-title').textContent='Loading checkpoint…';
    $('#calibration-copy').textContent='The model stays hidden while you label the source lines.';
    metrics.hidden=true;
    return;
  }
  if(report.status==='calibration_ready') {
    $('#calibration-title').textContent=`Calibration ready on ${report.reviewed} labels`;
    $('#calibration-copy').textContent='These scores compare the local quality gate with your keep/reject labels. They do not measure retrieval relevance yet.';
    $('#calibration-precision').textContent=report.metrics.precision===null?'—':`${Math.round(report.metrics.precision*100)}%`;
    $('#calibration-recall').textContent=report.metrics.recall===null?'—':`${Math.round(report.metrics.recall*100)}%`;
    $('#calibration-accuracy').textContent=report.metrics.accuracy===null?'—':`${Math.round(report.metrics.accuracy*100)}%`;
    metrics.hidden=false;
    return;
  }
  const labelCopy=report.labels_until_minimum
    ?`${report.labels_until_minimum} more labels before the first honest model check.`
    :'The total is sufficient; keep going until there are at least 10 clear keeps and 10 clear rejects.';
  $('#calibration-title').textContent=`${report.reviewed} of ${report.minimum_reviewed} labels`;
  $('#calibration-copy').textContent=`${labelCopy} Model scores remain hidden to avoid biasing your decisions.`;
  metrics.hidden=true;
}

function configureMode() {
  const dialogue=state.mode==='dialogue';
  $('[data-review-mode="meme"]').setAttribute('aria-pressed',String(!dialogue));
  $('[data-review-mode="dialogue"]').setAttribute('aria-pressed',String(dialogue));
  $('#review-heading').textContent=dialogue?'Would you keep this movie line?':'Does this meme fit?';
  $('#review-eyebrow').textContent=dialogue?'OWNER DATASET · MOVIE DIALOGUE':'OWNER DATASET · BLIND REVIEW';
  $('#review-description').textContent=dialogue?'Judge whether the exact line is reusable, understandable, and worth keeping. The source and screening prior stay hidden.':'Judge the connection only. The model condition, rationale, and pre-label stay hidden.';
  $('#situation-block').hidden=dialogue;
  $('#meme-candidate-copy').hidden=dialogue;
  $('#candidate-media').hidden=dialogue;
  $('#dialogue-candidate-copy').hidden=!dialogue;
  $('#meme-verdicts').hidden=dialogue;
  $('#dialogue-verdicts').hidden=!dialogue;
  $('#complete-heading').textContent=dialogue?'Dialogue review complete':'Dataset review complete';
  $('#complete-copy').textContent=dialogue?'All 200 lines now have owner labels. Export them to calibrate the local quality gate.':'Every candidate has a relevance judgment. You can still revisit and revise any item.';
  $('#dialogue-export').hidden=!dialogue;
  $('#keyboard-hint').textContent=dialogue?'Keys 1–3 choose sendability · Enter saves · arrows navigate':'Keys 1–3 save · arrows navigate';
  $('#review-footnote').textContent=dialogue?'Sendability, standalone clarity, and line strength stay separate so a famous quote cannot pass on recognition alone.':'“Relevant” is deliberately narrower than “I would send this.” Your relevance labels improve retrieval; sendability remains a separate taste judgment.';
}

function renderMedia(item) {
  const host=$('#candidate-media');
  const record=state.catalogue.get(item.candidate_id);
  host.replaceChildren();
  const url=record?.asset?.url;
  if(!/^https:\/\/(i\.imgflip\.com|api\.memegen\.link)\//.test(url||'')) return host.append(Object.assign(document.createElement('p'),{textContent:'Preview unavailable. Judge the reference name instead.'}));
  const image=document.createElement('img');
  image.alt=`Meme preview: ${item.candidate_name}`;
  image.referrerPolicy='no-referrer';
  image.loading='eager';
  image.decoding='async';
  image.fetchPriority='high';
  const copy=Object.assign(document.createElement('p'),{textContent:'Loading preview…'});
  image.onload=()=>{ copy.textContent='Source preview'; };
  image.onerror=()=>{ host.replaceChildren(Object.assign(document.createElement('p'),{textContent:'Preview failed to load. Judge the reference name instead.'})); };
  host.append(image,copy);
  image.src=url;
}

function draftFor(item) {
  if(!state.drafts.has(item.case_id)) state.drafts.set(item.case_id,{sendability:item.review?.sendability??null,standalone:item.review?.standalone??null,strength:item.review?.strength??null});
  return state.drafts.get(item.case_id);
}
function renderDialogueSelections(item) {
  const draft=draftFor(item);
  for(const button of document.querySelectorAll('[data-dialogue-field]')) button.setAttribute('aria-pressed',String(draft[button.dataset.dialogueField]===button.dataset.value));
  $('#save-dialogue-review').disabled=state.busy||!draft.sendability||!draft.standalone||!draft.strength;
}

function render() {
  configureMode();
  updateProgress();
  updateCalibration();
  if(!state.items.length||state.showComplete) {
    $('#review-card').hidden=true;
    $('#review-complete').hidden=false;
    $('#revisit-items').disabled=!state.items.length;
    return;
  }
  const item=state.items[state.index];
  $('#review-complete').hidden=true;
  $('#review-card').hidden=false;
  $('#case-label').textContent=`ITEM ${state.index+1} OF ${state.items.length}`;
  $('#situation-text').textContent=item.context??'';
  $('#review-note').value=item.review?.note||'';
  $('#saved-state').textContent=item.review?'Saved · click to revise':'Unreviewed';
  $('#saved-state').classList.toggle('complete',!!item.review);
  $('#previous-item').disabled=state.index===0||state.busy;
  $('#next-item').disabled=state.index===state.items.length-1||state.busy;
  if(state.mode==='dialogue') {
    $('#dialogue-quote').textContent=`“${item.quote}”`;
    $('#dialogue-speaker').textContent=displayCase(item.speaker);
    $('#dialogue-title').textContent=displayCase(item.work_title);
    $('#dialogue-source').href=item.source_url;
    renderDialogueSelections(item);
  } else {
    $('#candidate-title').textContent=item.candidate_name;
    for(const button of document.querySelectorAll('#meme-verdicts .verdict')) {
      button.setAttribute('aria-pressed',String(button.dataset.verdict===item.review?.verdict));
      button.disabled=state.busy;
    }
    renderMedia(item);
  }
}

function nextUnreviewed(afterIndex) {
  for(let offset=1;offset<=state.items.length;offset+=1) {
    const index=(afterIndex+offset)%state.items.length;
    if(!state.items[index].review) return index;
  }
  return -1;
}
function advanceAfterSave() {
  const next=nextUnreviewed(state.index);
  if(next>=0) { state.index=next; state.showComplete=false; }
  else state.showComplete=true;
}

async function saveMeme(verdict) {
  if(state.busy||state.mode!=='meme') return;
  state.busy=true;
  const item=state.items[state.index];
  try {
    const result=await api('/api/candidate-review',{experiment_id:item.experiment_id,blind_id:item.blind_id,candidate_id:item.candidate_id,verdict,note:$('#review-note').value});
    item.review={verdict:result.review.verdict,note:result.review.note,timestamp:result.review.timestamp};
    announce(`${item.candidate_name} marked ${verdict.replace('_',' ')}.`);
    advanceAfterSave();
  } catch(error) { announce(error.message); }
  finally { state.busy=false; render(); }
}

async function saveDialogue() {
  if(state.busy||state.mode!=='dialogue') return;
  const item=state.items[state.index];
  const draft=draftFor(item);
  if(!draft.sendability||!draft.standalone||!draft.strength) return announce('Choose all three judgments before saving.');
  state.busy=true;
  renderDialogueSelections(item);
  try {
    const result=await api('/api/dialogue-review',{case_id:item.case_id,...draft,note:$('#review-note').value});
    item.review={sendability:result.review.sendability,standalone:result.review.standalone,strength:result.review.strength,note:result.review.note,timestamp:result.review.timestamp};
    state.calibration=result.calibration;
    announce(`Dialogue marked ${result.review.sendability}.`);
    advanceAfterSave();
  } catch(error) { announce(error.message); }
  finally { state.busy=false; render(); }
}

async function loadMode(mode) {
  state.mode=mode;
  state.items=[];
  state.index=0;
  state.showComplete=false;
  state.drafts.clear();
  state.calibration=null;
  history.replaceState(null,'',mode==='dialogue'?'/review?dataset=dialogue':'/review');
  render();
  try {
    if(mode==='dialogue') {
      const [queue,calibration]=await Promise.all([api('/api/dialogue-review-queue'),api('/api/dialogue-review-report')]);
      state.items=queue.items;
      state.calibration=calibration;
    } else {
      const [queue,catalogue]=await Promise.all([api('/api/candidate-review-queue'),api('/api/catalogue')]);
      state.items=queue.items;
      state.catalogue=new Map(catalogue.map(record=>[record.id,record]));
    }
    const firstUnreviewed=state.items.findIndex(item=>!item.review);
    state.index=firstUnreviewed>=0?firstUnreviewed:0;
    state.showComplete=state.items.length>0&&firstUnreviewed<0;
    render();
  } catch(error) {
    $('#progress-count').textContent='Could not load';
    $('#progress-remaining').textContent=error.message;
    announce(error.message);
  }
}

for(const button of document.querySelectorAll('#meme-verdicts .verdict')) button.addEventListener('click',()=>saveMeme(button.dataset.verdict));
for(const button of document.querySelectorAll('[data-dialogue-field]')) button.addEventListener('click',()=>{const item=state.items[state.index];if(!item)return;draftFor(item)[button.dataset.dialogueField]=button.dataset.value;renderDialogueSelections(item);});
for(const button of document.querySelectorAll('[data-review-mode]')) button.addEventListener('click',()=>loadMode(button.dataset.reviewMode));
$('#save-dialogue-review').addEventListener('click',saveDialogue);
$('#previous-item').addEventListener('click',()=>{ if(state.index>0){state.showComplete=false;state.index-=1;render();} });
$('#next-item').addEventListener('click',()=>{ if(state.index<state.items.length-1){state.showComplete=false;state.index+=1;render();} });
$('#revisit-items').addEventListener('click',()=>{state.showComplete=false;state.index=0;render();});
document.addEventListener('keydown',event=>{
  if(event.target.matches('textarea,input,select,button')) return;
  if(['1','2','3'].includes(event.key)) {
    const values=state.mode==='dialogue'?['sendable','maybe','reject']:['relevant','not_relevant','unsure'];
    if(state.mode==='dialogue') { const item=state.items[state.index]; if(item){draftFor(item).sendability=values[Number(event.key)-1];renderDialogueSelections(item);} }
    else saveMeme(values[Number(event.key)-1]);
  } else if(event.key==='Enter'&&state.mode==='dialogue') saveDialogue();
  else if(event.key==='ArrowLeft'&&state.index>0){state.showComplete=false;state.index-=1;render();}
  else if(event.key==='ArrowRight'&&state.index<state.items.length-1){state.showComplete=false;state.index+=1;render();}
});

loadMode(state.mode);
