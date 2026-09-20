import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const defaultFiles=[
  'fit_score_raw_candidates_v1.jsonl',
  'fit_score_compact_candidates_v1.jsonl',
  'fit_score_full30_candidates_v1.jsonl',
  'fit_score_full30_compact_candidates_v1.jsonl'
];
const files=process.argv.slice(2).length?process.argv.slice(2):defaultFiles;
const outputName=process.env.FIT_SCORE_UNION_OUTPUT??'fit_score_selection_union_v1.jsonl';
const parseJsonl=text=>text.trim().split('\n').filter(Boolean).map(JSON.parse);
const sets=await Promise.all(files.map(file=>readFile(resolve(root,'eval',file),'utf8').then(parseJsonl)));
const contexts=new Map();
for(const rows of sets) for(const row of rows) {
  const existing=contexts.get(row.case_id)??{case_id:row.case_id,context:row.context,candidate_ids:new Set()};
  if(existing.context!==row.context) throw new Error(`Context mismatch for ${row.case_id}.`);
  for(const id of row.candidate_ids) existing.candidate_ids.add(id);
  contexts.set(row.case_id,existing);
}
const rows=[...contexts.values()].sort((left,right)=>left.case_id.localeCompare(right.case_id)).map(row=>({
  case_id:row.case_id,
  context:row.context,
  candidate_ids:[...row.candidate_ids].sort((left,right)=>left.localeCompare(right)),
  review_status:'pending_blind_review'
}));
if(rows.length!==12||rows.some(row=>row.candidate_ids.length<5)) throw new Error('The selection union is incomplete.');
await writeFile(resolve(root,'eval',outputName),`${rows.map(row=>JSON.stringify(row)).join('\n')}\n`);
console.log(JSON.stringify({cases:rows.length,unique_pairs:rows.reduce((total,row)=>total+row.candidate_ids.length,0),largest_case:Math.max(...rows.map(row=>row.candidate_ids.length))},null,2));
