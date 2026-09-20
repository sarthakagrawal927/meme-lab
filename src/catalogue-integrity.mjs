const normalize=value=>String(value??'').toLowerCase().replaceAll(/[^a-z0-9]+/g,' ').trim();

export function normalizeMedia(record) {
  const mediaType=record.media_type??(record.media?.type==='gif'?'gif':'image');
  const mediaUrl=record.media_url??record.media?.url??record.image_url??record.media?.image_url;
  const previewUrl=record.preview_url??record.media?.preview_url??mediaUrl;
  const mimeType=record.mime_type??record.media?.mime_type??(mediaType==='gif'?'image/gif':mediaUrl?.endsWith('.png')?'image/png':mediaUrl?.endsWith('.webp')?'image/webp':'image/jpeg');
  if(!['image','gif'].includes(mediaType)) throw new Error(`${record.id??record.name} has an unsupported media type.`);
  if(typeof mediaUrl!=='string'||!mediaUrl.startsWith('https://')) throw new Error(`${record.id??record.name} needs an HTTPS media URL.`);
  if(typeof previewUrl!=='string'||!previewUrl.startsWith('https://')) throw new Error(`${record.id??record.name} needs an HTTPS preview URL.`);
  if(mediaType==='gif'&&mimeType!=='image/gif') throw new Error(`${record.id??record.name} needs an image/gif MIME type.`);
  return {...record,image_url:mediaUrl,media_type:mediaType,media_url:mediaUrl,preview_url:previewUrl,mime_type:mimeType};
}

export function canonicalCoverage(records,manifest) {
  const haystacks=records.map(record=>({
    id:record.id,
    text:normalize([record.id,record.name,record.message,record.relational_pattern,...(record.tags??[])].join(' '))
  }));
  const items=manifest.items.map(item=>{
    const needles=[item.name,...item.aliases].map(normalize).filter(Boolean);
    const match=haystacks.find(record=>needles.some(needle=>record.text.includes(needle)));
    return {...item,status:match?'covered':'missing',catalogue_id:match?.id??null};
  });
  return {
    version:manifest.version,
    total:items.length,
    covered:items.filter(item=>item.status==='covered').length,
    missing:items.filter(item=>item.status==='missing').length,
    items
  };
}

export function catalogueIntegrity(records,{excludedProvider='National Gallery of Art, Washington'}={}) {
  const providerCounts={};
  const mediaTypeCounts={};
  const rightsCounts={};
  for(const record of records) {
    const provider=record.provenance?.provider??'inherited meme catalogue';
    providerCounts[provider]=(providerCounts[provider]??0)+1;
    const mediaType=record.media_type??'image';
    mediaTypeCounts[mediaType]=(mediaTypeCounts[mediaType]??0)+1;
    const rights=record.media_status==='approved'?'established':'not_established';
    rightsCounts[rights]=(rightsCounts[rights]??0)+1;
    if(provider===excludedProvider||record.id?.startsWith('nga-')) throw new Error(`Artwork filler ${record.id} cannot enter the meme catalogue.`);
  }
  return {records:records.length,providers:providerCounts,media_types:mediaTypeCounts,rights_status:rightsCounts,excluded_providers:[excludedProvider]};
}
