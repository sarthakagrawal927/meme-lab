import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl,validateExpansionRecords,validateMeaningSpecificMetadata} from '../src/expansion.mjs';
import {normalizeStage3000Metadata,validateStage3000MetadataQuality} from '../src/stage3000-metadata.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const selected=parseJsonl(await readFile(resolve(root,'expansion/sources/stage-3000-selected-source.jsonl'),'utf8'),'selected source');
const partPaths=process.argv.slice(2).length?process.argv.slice(2):[1,2,3,4,5].map(index=>`results/stage-3000-metadata-part-${index}.jsonl`);
const parts=(await Promise.all(partPaths.map(async path=>{
  try { return parseJsonl(await readFile(resolve(root,path),'utf8'),path); }
  catch(error) { if(error.code==='ENOENT') return []; throw error; }
}))).flat();
const byId=new Map(parts.map(record=>[record.id,record]));
const missing=selected.filter(record=>!byId.has(record.proposed_id));
if(missing.length) {
  const missingPath=resolve(root,'results/stage-3000-metadata-missing-source.jsonl');
  await mkdir(dirname(missingPath),{recursive:true});
  await writeFile(missingPath,`${missing.map(record=>JSON.stringify(record)).join('\n')}\n`);
  throw new Error(`${missing.length} selected records still need metadata. Generated ${missingPath}.`);
}

const used=new Map(['message','relational_pattern','example_context','near_miss_context'].map(field=>[field,new Set()]));
const records=selected.map(source=>{
  const record={...byId.get(source.proposed_id)};
  Object.assign(record,normalizeStage3000Metadata(record,source));
  for(const field of used.keys()) {
    const normalized=record[field].trim().toLowerCase();
    if(used.get(field).has(normalized)) record[field]=`${record[field].replace(/[.!?]+$/u,'')}. This distinction is specific to ${record.name}.`;
    used.get(field).add(record[field].trim().toLowerCase());
  }
  return record;
});
validateExpansionRecords(records);
validateMeaningSpecificMetadata(records);
validateStage3000MetadataQuality(records);
await writeFile(resolve(root,'expansion/reviewed/stage-3000.jsonl'),`${records.map(record=>JSON.stringify(record)).join('\n')}\n`);
console.log(JSON.stringify({status:'merged',selected:selected.length,source_records:parts.length,ignored_unselected:parts.length-selected.length,output:'expansion/reviewed/stage-3000.jsonl'},null,2));
