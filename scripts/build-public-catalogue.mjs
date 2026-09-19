import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=JSON.parse(await readFile(resolve(root,'original/meme_references_v1/memes.json'),'utf8'));
const records=source
  .filter(record=>record.delivery?.suggested_mode!=='caption_template')
  .map(record=>({
    id:record.id,
    name:record.name,
    message:record.interpretation?.message??'',
    relational_pattern:record.interpretation?.relational_pattern??'',
    example_context:record.interpretation?.example_context??'',
    near_miss_context:record.interpretation?.near_miss_context??'',
    tags:record.interpretation?.tags??[],
    image_url:record.asset?.url??null,
    media_status:record.asset?.redistribution_permission==='established'?'approved':'source-preview'
  }));

if(records.length!==30) throw new Error(`Expected 30 reaction candidates, found ${records.length}.`);
const destination=resolve(root,'worker/src/catalogue.generated.mjs');
await mkdir(dirname(destination),{recursive:true});
await writeFile(destination,`// Generated from the canonical catalogue. Do not edit.\nexport const catalogue=${JSON.stringify(records,null,2)};\n`);
console.log(`Generated ${records.length} public catalogue records.`);
