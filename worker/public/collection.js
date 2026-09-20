const grid=document.querySelector('#collection-grid');
const search=document.querySelector('#catalogue-search');
const count=document.querySelector('#collection-count');
const empty=document.querySelector('#collection-empty');
const pagination=document.querySelector('#collection-pagination');
const pageLabel=document.querySelector('#collection-page-label');
const previous=document.querySelector('#collection-previous');
const next=document.querySelector('#collection-next');
let catalogue=[];
let filtered=[];
let page=1;
const pageSize=24;

function imageFor(meme,index) {
  const frame=document.createElement('div');
  frame.className='collection-media';
  if(!meme.image_url) {
    frame.append(Object.assign(document.createElement('span'),{className:'media-fallback',textContent:'Preview unavailable'}));
    return frame;
  }
  const image=document.createElement('img');
  image.alt=`${meme.name} meme reference`;
  image.loading=index<6?'eager':'lazy';
  image.decoding='async';
  image.referrerPolicy='no-referrer';
  image.onerror=()=>frame.replaceChildren(Object.assign(document.createElement('span'),{className:'media-fallback',textContent:'Preview unavailable'}));
  image.src=meme.image_url;
  frame.append(image);
  return frame;
}

function render() {
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
  page=Math.min(page,pages);
  const start=(page-1)*pageSize;
  const items=filtered.slice(start,start+pageSize);
  grid.replaceChildren();
  const fragment=document.createDocumentFragment();
  for(const [index,meme] of items.entries()) {
    const card=document.createElement('article');
    card.className=`collection-card collection-card-${meme.availability}`;
    const copy=document.createElement('div');
    copy.className='collection-copy';
    const tags=document.createElement('div');
    tags.className='tag-list';
    for(const tag of meme.tags.slice(0,3)) tags.append(Object.assign(document.createElement('span'),{textContent:tag}));
    copy.append(
      Object.assign(document.createElement('span'),{className:`collection-state collection-state-${meme.availability}`,textContent:meme.availability==='live'?'Live now':'Experimental'}),
      Object.assign(document.createElement('h2'),{textContent:meme.name}),
      Object.assign(document.createElement('p'),{textContent:meme.message}),
      tags
    );
    card.append(imageFor(meme,index),copy);
    fragment.append(card);
  }
  grid.append(fragment);
  empty.hidden=items.length!==0;
  count.textContent=filtered.length===0?'0 memes':`Showing ${start+1}–${start+items.length} of ${filtered.length} memes`;
  pagination.hidden=filtered.length<=pageSize;
  pageLabel.textContent=`Page ${page} of ${pages}`;
  previous.disabled=page===1;
  next.disabled=page===pages;
}

function filterCollection() {
  const query=search.value.trim().toLocaleLowerCase();
  filtered=query?catalogue.filter(meme=>[meme.name,meme.message,meme.relational_pattern,...meme.tags].join(' ').toLocaleLowerCase().includes(query)):catalogue;
  page=1;
  render();
}

try {
  const response=await fetch('/collection.json');
  if(!response.ok) throw new Error('Could not load the collection.');
  catalogue=await response.json();
  filtered=catalogue;
  render();
  search.addEventListener('input',filterCollection);
  previous.addEventListener('click',()=>{page-=1;render();grid.scrollIntoView({behavior:'smooth',block:'start'});});
  next.addEventListener('click',()=>{page+=1;render();grid.scrollIntoView({behavior:'smooth',block:'start'});});
} catch(error) {
  count.textContent=error.message;
  empty.hidden=false;
  empty.textContent='The collection could not load. Please try again.';
}
