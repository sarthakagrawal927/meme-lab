const grid=document.querySelector('#collection-grid');
const search=document.querySelector('#catalogue-search');
const count=document.querySelector('#collection-count');
const empty=document.querySelector('#collection-empty');
let catalogue=[];

function imageFor(meme) {
  const frame=document.createElement('div');
  frame.className='collection-media';
  if(!meme.image_url) {
    frame.append(Object.assign(document.createElement('span'),{className:'media-fallback',textContent:'Preview unavailable'}));
    return frame;
  }
  const image=document.createElement('img');
  image.alt=`${meme.name} meme reference`;
  image.loading='eager';
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
  for(const meme of items) {
    const card=document.createElement('article');
    card.className='collection-card';
    const copy=document.createElement('div');
    copy.className='collection-copy';
    const tags=document.createElement('div');
    tags.className='tag-list';
    for(const tag of meme.tags.slice(0,3)) tags.append(Object.assign(document.createElement('span'),{textContent:tag}));
    copy.append(
      Object.assign(document.createElement('h2'),{textContent:meme.name}),
      Object.assign(document.createElement('p'),{textContent:meme.message}),
      tags
    );
    card.append(imageFor(meme),copy);
    fragment.append(card);
  }
  grid.append(fragment);
  empty.hidden=items.length!==0;
  count.textContent=`${items.length} of ${catalogue.length} memes`;
}

function filterCollection() {
  const query=search.value.trim().toLocaleLowerCase();
  if(!query) return render(catalogue);
  render(catalogue.filter(meme=>[meme.name,meme.message,meme.relational_pattern,...meme.tags].join(' ').toLocaleLowerCase().includes(query)));
}

try {
  const response=await fetch('/catalogue.json');
  if(!response.ok) throw new Error('Could not load the collection.');
  catalogue=await response.json();
  render(catalogue);
  search.addEventListener('input',filterCollection);
} catch(error) {
  count.textContent=error.message;
  empty.hidden=false;
  empty.textContent='The collection could not load. Please try again.';
}
