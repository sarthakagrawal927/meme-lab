const placeholder=/tags here|no punctuation|broadly relatable|recognizable visual|situation calls for|^\s*[.!?]|\bwhen[.!?]?$/i;
const words=value=>String(value??'').trim().split(/\s+/u).filter(Boolean).length;
const sentence=value=>{
  const text=String(value??'').trim().replaceAll(/[<>]/g,'');
  return text&&/[.!?]$/.test(text)?text:text?`${text}.`:'';
};

function usableTag(tag) {
  const value=String(tag??'').toLowerCase().trim().replaceAll(/[^a-z0-9 -]+/g,' ').replaceAll(/\s+/g,' ').trim();
  if(!value||value.length>30||value.split(' ').length>3||placeholder.test(value)||['or','and','spaces','punctuation','tag'].includes(value)) return '';
  return value;
}

export function normalizeStage3000Metadata(metadata,candidate) {
  const name=candidate.name;
  const tags=[...new Set([
    ...(Array.isArray(metadata.tags)?metadata.tags:[]),
    ...(Array.isArray(candidate.categories)?candidate.categories:[])
  ].map(usableTag).filter(tag=>tag&&!['uncategorized','public-domain','fine-art'].includes(tag)))].slice(0,6);
  for(const fallback of ['reaction','social contrast','long tail','context']) if(tags.length<3&&!tags.includes(fallback)) tags.push(fallback);
  const [firstCue,secondCue]=tags;
  const fallback={
    message:`Use ${name} when ${firstCue} collides with ${secondCue}, and that mismatch becomes the point of the conversation.`,
    relational_pattern:`${name} frames ${firstCue} against ${secondCue}, turning the contrast into a concise social reaction.`,
    example_context:`For example, send ${name} when a conversation moves from ${firstCue} to ${secondCue} and everyone notices the mismatch.`,
    near_miss_context:`Avoid ${name} when the situation lacks both ${firstCue} and ${secondCue}; the image would suggest the wrong relationship.`
  };
  const normalized={tags};
  const rules={
    message:value=>value.startsWith(`Use ${name} when`)&&words(value)>=10&&!placeholder.test(value),
    relational_pattern:value=>words(value)>=8&&!placeholder.test(value),
    example_context:value=>value.startsWith('For example,')&&words(value)>=10&&!placeholder.test(value),
    near_miss_context:value=>value.startsWith('Avoid')&&words(value)>=10&&!placeholder.test(value)
  };
  for(const field of Object.keys(rules)) {
    const value=sentence(metadata[field]).replaceAll(`<${name}>`,name);
    normalized[field]=rules[field](value)?value:fallback[field];
  }
  return normalized;
}

export function validateStage3000MetadataQuality(records) {
  for(const record of records) {
    const normalized=normalizeStage3000Metadata(record,record);
    for(const field of ['message','relational_pattern','example_context','near_miss_context']) if(normalized[field]!==sentence(record[field]).replaceAll(`<${record.name}>`,record.name)) throw new Error(`${record.id} has low-quality ${field}.`);
    if(normalized.tags.join('\n')!==record.tags.join('\n')) throw new Error(`${record.id} has low-quality tags.`);
  }
  return {records:records.length};
}
