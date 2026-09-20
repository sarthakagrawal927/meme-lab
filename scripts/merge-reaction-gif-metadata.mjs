import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl,validateExpansionRecords,validateMeaningSpecificMetadata,validateReactionGifCandidates} from '../src/expansion.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=parseJsonl(await readFile(resolve(root,'expansion/sources/stage-3000-reaction-gifs.jsonl'),'utf8'),'reaction GIF source');
validateReactionGifCandidates(source,{minimum:1189});
const paths=[1,2,3,4,5].map(index=>resolve(root,`results/stage-3000-gif-metadata-part-${index}.jsonl`));
const parts=(await Promise.all(paths.map(async path=>parseJsonl(await readFile(path,'utf8'),path)))).flat();
const byId=new Map(parts.map(record=>[record.id,record]));
const missing=source.filter(candidate=>!byId.has(candidate.proposed_id));
if(missing.length) throw new Error(`${missing.length} reaction GIFs still need metadata.`);

const usedByField=new Map(['message','relational_pattern','example_context','near_miss_context'].map(field=>[field,new Set()]));
const generic=/collides with|conversation moves from|situation lacks both|frames .* against|this wording is specific to|this distinction is specific to/i;
const records=source.map(candidate=>{
  const record=structuredClone(byId.get(candidate.proposed_id));
  const previousName=record.name;
  record.name=candidate.name;
  for(const field of ['message','relational_pattern','example_context','near_miss_context']) record[field]=record[field].replaceAll(previousName,record.name);
  const cues=record.tags.filter(tag=>!['reaction','reaction-gif','social contrast','long tail','context'].includes(tag));
  const firstCue=cues[0]??'emotion';
  const secondCue=cues.find(tag=>tag!==firstCue)??'the surrounding moment';
  const fallback={
    message:`Use ${record.name} when you want to respond with ${firstCue} to a moment involving ${secondCue}.`,
    relational_pattern:`${record.name} communicates ${firstCue} in response to ${secondCue}, making the intended emotion clear.`,
    example_context:`For example, share ${record.name} when a moment involving ${secondCue} deserves a clear ${firstCue} response.`,
    near_miss_context:`Avoid ${record.name} when the conversation is unrelated to either ${firstCue} or ${secondCue}.`
  };
  for(const field of Object.keys(fallback)) if(generic.test(record[field])) record[field]=fallback[field];
  for(const [field,used] of usedByField) {
    let normalized=record[field].trim().toLowerCase();
    if(used.has(normalized)) {
      if(field==='relational_pattern') record[field]=`${record.name} conveys ${record[field].replace(/^[Tt]he reaction\s+/u,'').replace(/[.!?]+$/u,'')}.`;
      if(field==='example_context') record[field]=`For example, share ${record.name} when ${record[field].replace(/^For example,\s*/u,'').replace(/[.!?]+$/u,'')}.`;
      if(field==='near_miss_context') record[field]=`Avoid ${record.name} when ${record[field].replace(/^Avoid(?:\s+when)?\s*/u,'').replace(/[.!?]+$/u,'')}.`;
      normalized=record[field].trim().toLowerCase();
    }
    used.add(record[field].trim().toLowerCase());
  }
  return record;
});
validateExpansionRecords(records);
validateMeaningSpecificMetadata(records);
await writeFile(resolve(root,'expansion/reviewed/stage-3000-reaction-gifs.jsonl'),`${records.map(record=>JSON.stringify(record)).join('\n')}\n`);
console.log(JSON.stringify({status:'merged',source_records:source.length,metadata_records:parts.length,output:'expansion/reviewed/stage-3000-reaction-gifs.jsonl'},null,2));
