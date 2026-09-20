import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl,validateOpenSourceCandidates,validateSourceCandidates} from '../src/expansion.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const phase1=parseJsonl(await readFile(resolve(root,'expansion/sources/stage-3000-source-phase1.jsonl'),'utf8'),'stage-3000 source phase 1');
const phase1Report=JSON.parse(await readFile(resolve(root,'expansion/sources/stage-3000-acquisition-phase1.json'),'utf8'));
const nga=parseJsonl(await readFile(resolve(root,'expansion/sources/stage-3000-source-nga.jsonl'),'utf8'),'stage-3000 NGA source');
const ngaReport=JSON.parse(await readFile(resolve(root,'expansion/sources/stage-3000-acquisition-nga.json'),'utf8'));

validateSourceCandidates(phase1,{minimum:800});
validateOpenSourceCandidates(nga,{minimum:1200});
const combined=[...phase1,...nga];
const ids=new Set();
const providerSourceIds=new Set();
for(const record of combined) {
  if(ids.has(record.proposed_id)) throw new Error(`Duplicate combined candidate ID: ${record.proposed_id}.`);
  ids.add(record.proposed_id);
  const sourceKey=`${record.provider}:${record.source_id}`;
  if(providerSourceIds.has(sourceKey)) throw new Error(`Duplicate combined provider identity: ${sourceKey}.`);
  providerSourceIds.add(sourceKey);
}

const targetAdditions=2000;
const report={
  version:'stage-3000-acquisition-v1',
  observed_on:[phase1Report.observed_on,ngaReport.observed_on].sort().at(-1),
  target_additions:targetAdditions,
  raw_source_records:combined.length,
  raw_source_buffer:Math.max(0,combined.length-targetAdditions),
  remaining_raw_source_gap:Math.max(0,targetAdditions-combined.length),
  providers:[
    {provider:phase1Report.provider,records:phase1.length,backend:phase1Report.backend,rights_status:'not_established'},
    {provider:ngaReport.provider,records:nga.length,backend:ngaReport.backend,rights_status:'cc0-public-domain'}
  ],
  human_validated:false,
  uncertainty:'The raw sourcing gap is closed, not the promotion gap. Every record still needs duplicate adjudication, meme-fit review, meaning metadata, safety review, and evaluation before it can join the live catalogue.'
};

await Promise.all([
  writeFile(resolve(root,'expansion/sources/stage-3000-source.jsonl'),`${combined.map(record=>JSON.stringify(record)).join('\n')}\n`),
  writeFile(resolve(root,'expansion/sources/stage-3000-acquisition.json'),`${JSON.stringify(report,null,2)}\n`)
]);
console.log(JSON.stringify({status:'built',raw_source_records:combined.length,raw_source_buffer:report.raw_source_buffer,remaining_raw_source_gap:report.remaining_raw_source_gap,providers:report.providers},null,2));
