const $=selector=>document.querySelector(selector);
const state={items:[],catalogue:new Map(),index:0,busy:false,showComplete:false};

async function api(path,body) {
  const response=await fetch(path,body===undefined?{}:{
    method:'POST',
    headers:{'Content-Type':'application/json','X-Meme-Lab':'1'},
    body:JSON.stringify(body)
  });
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

function renderMedia(item) {
  const host=$('#candidate-media');
  const record=state.catalogue.get(item.candidate_id);
  host.replaceChildren();
  const url=record?.asset?.url;
  if(!/^https:\/\/(i\.imgflip\.com|api\.memegen\.link)\//.test(url||'')) {
    host.append(Object.assign(document.createElement('p'),{textContent:'Preview unavailable. Judge the reference name instead.'}));
    return;
  }
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

function render() {
  updateProgress();
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
  $('#situation-text').textContent=item.context;
  $('#candidate-title').textContent=item.candidate_name;
  $('#review-note').value=item.review?.note||'';
  $('#saved-state').textContent=item.review?'Saved · click to revise':'Unreviewed';
  $('#saved-state').classList.toggle('complete',!!item.review);
  for(const button of document.querySelectorAll('.verdict')) {
    button.setAttribute('aria-pressed',String(button.dataset.verdict===item.review?.verdict));
    button.disabled=state.busy;
  }
  $('#previous-item').disabled=state.index===0||state.busy;
  $('#next-item').disabled=state.index===state.items.length-1||state.busy;
  renderMedia(item);
}

function nextUnreviewed(afterIndex) {
  for(let offset=1;offset<=state.items.length;offset+=1) {
    const index=(afterIndex+offset)%state.items.length;
    if(!state.items[index].review) return index;
  }
  return -1;
}

async function save(verdict) {
  if(state.busy) return;
  state.busy=true;
  render();
  const item=state.items[state.index];
  try {
    const result=await api('/api/candidate-review',{
      experiment_id:item.experiment_id,
      blind_id:item.blind_id,
      candidate_id:item.candidate_id,
      verdict,
      note:$('#review-note').value
    });
    item.review={verdict:result.review.verdict,note:result.review.note,timestamp:result.review.timestamp};
    announce(`${item.candidate_name} marked ${verdict.replace('_',' ')}.`);
    const next=nextUnreviewed(state.index);
    if(next>=0) {
      state.index=next;
      state.showComplete=false;
    }
    else {
      state.showComplete=true;
      return;
    }
  } catch(error) {
    announce(error.message);
  } finally {
    state.busy=false;
    render();
  }
}

for(const button of document.querySelectorAll('.verdict')) button.addEventListener('click',()=>save(button.dataset.verdict));
$('#previous-item').addEventListener('click',()=>{ if(state.index>0){state.showComplete=false;state.index-=1;render();} });
$('#next-item').addEventListener('click',()=>{ if(state.index<state.items.length-1){state.showComplete=false;state.index+=1;render();} });
$('#revisit-items').addEventListener('click',()=>{state.showComplete=false;state.index=0;render();});
document.addEventListener('keydown',event=>{
  if(event.target.matches('textarea,input,select')) return;
  if(event.key==='1') save('relevant');
  else if(event.key==='2') save('not_relevant');
  else if(event.key==='3') save('unsure');
  else if(event.key==='ArrowLeft'&&state.index>0){state.showComplete=false;state.index-=1;render();}
  else if(event.key==='ArrowRight'&&state.index<state.items.length-1){state.showComplete=false;state.index+=1;render();}
});

try {
  const [queue,catalogue]=await Promise.all([api('/api/candidate-review-queue'),api('/api/catalogue')]);
  state.items=queue.items;
  state.catalogue=new Map(catalogue.map(record=>[record.id,record]));
  const firstUnreviewed=state.items.findIndex(item=>!item.review);
  state.index=firstUnreviewed>=0?firstUnreviewed:0;
  state.showComplete=state.items.length>0&&firstUnreviewed<0;
  render();
} catch(error) {
  $('#progress-count').textContent='Could not load';
  $('#progress-remaining').textContent=error.message;
  announce(error.message);
}
