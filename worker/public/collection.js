const grid=document.querySelector('#collection-grid');
const search=document.querySelector('#catalogue-search');
const count=document.querySelector('#collection-count');
const empty=document.querySelector('#collection-empty');
const filters=[...document.querySelectorAll('[data-collection-filter]')];
let catalogue=[];
let activeFilter='all';

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

function render(items) {
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
  const scopeTotal=activeFilter==='all'?catalogue.length:catalogue.filter(meme=>meme.availability===activeFilter).length;
  count.textContent=`${items.length} of ${scopeTotal} ${activeFilter==='all'?'sourced':activeFilter} memes`;
}

function filterCollection() {
  const query=search.value.trim().toLocaleLowerCase();
  const scoped=activeFilter==='all'?catalogue:catalogue.filter(meme=>meme.availability===activeFilter);
  if(!query) return render(scoped);
  render(scoped.filter(meme=>[meme.name,meme.message,meme.relational_pattern,...meme.tags].join(' ').toLocaleLowerCase().includes(query)));
}

try {
  const response=await fetch('/collection.json');
  if(!response.ok) throw new Error('Could not load the collection.');
  catalogue=await response.json();
  render(catalogue);
  search.addEventListener('input',filterCollection);
  for(const filter of filters) filter.addEventListener('click',()=>{
    activeFilter=filter.dataset.collectionFilter;
    for(const button of filters) button.setAttribute('aria-pressed',String(button===filter));
    filterCollection();
  });
} catch(error) {
  count.textContent=error.message;
  empty.hidden=false;
  empty.textContent='The collection could not load. Please try again.';
}
