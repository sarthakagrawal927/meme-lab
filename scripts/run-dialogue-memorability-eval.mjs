import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl} from '../src/expansion.mjs';
import {selectMemorabilityCases,summarizeMemorabilityRun} from '../src/dialogue-memorability-eval.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const input=resolve(root,'eval/dialogue_cornell_memorability_pairs.jsonl');
const model=process.env.DIALOGUE_MEMORABILITY_MODEL??'qwen3:4b';
const endpoint=process.env.OLLAMA_URL??'http://127.0.0.1:11434/api/chat';
const limit=Math.max(20,Number(process.env.DIALOGUE_MEMORABILITY_LIMIT??'200'));
const promptVersion='cornell-memorability-pairwise-v1';
const slug=model.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const outputDir=resolve(root,'results/dialogue-memorability-v1');
const resultsOutput=resolve(outputDir,`${slug}.jsonl`);
const reportOutput=resolve(outputDir,`${slug}-report.json`);

const pairs=parseJsonl(await readFile(input,'utf8'),'Cornell memorability pairs');
const cases=selectMemorabilityCases(pairs,limit);
let results=[];
try { results=parseJsonl(await readFile(resultsOutput,'utf8'),'Dialogue memorability results'); }
catch(error) { if(error.code!=='ENOENT') throw error; }
if(results.some(result=>result.model!==model||result.prompt_version!==promptVersion||!cases.some(row=>row.case_id===result.case_id))) throw new Error('Existing results do not match this model, prompt, or case set.');
const completed=new Set(results.map(result=>result.case_id));
const schema={type:'object',additionalProperties:false,properties:{choice:{type:'string',enum:['A','B']}},required:['choice']};
const system='Choose which line is more memorable based only on its phrasing. Memorable means distinctive, quotable, and likely to stick in someone’s mind. Ignore film fame and do not assume missing scene context. Return only A or B through the supplied JSON schema.';

async function judge(row,attempt=1) {
  const started=performance.now();
  const response=await fetch(endpoint,{
    method:'POST',
    headers:{'content-type':'application/json'},
    signal:AbortSignal.timeout(30_000),
    body:JSON.stringify({
      model,
      stream:false,
      think:false,
      keep_alive:'15m',
      options:{temperature:0,seed:42,num_ctx:1024,num_predict:16},
      format:schema,
      messages:[{role:'system',content:system},{role:'user',content:`A: ${row.left}\nB: ${row.right}`}]
    })
  });
  if(!response.ok) throw new Error(`Ollama returned HTTP ${response.status}.`);
  try {
    const payload=await response.json();
    const parsed=JSON.parse(payload.message?.content??'');
    if(!['A','B'].includes(parsed.choice)) throw new Error('Model returned an invalid choice.');
    return {case_id:row.case_id,choice:parsed.choice,expected_choice:row.expected_choice,correct:parsed.choice===row.expected_choice,duration_ms:Math.round(performance.now()-started),model,prompt_version:promptVersion};
  } catch(error) {
    if(attempt<2) return judge(row,attempt+1);
    throw error;
  }
}

await mkdir(outputDir,{recursive:true});
for(const [index,row] of cases.entries()) {
  if(completed.has(row.case_id)) continue;
  const result=await judge(row);
  results.push(result);
  completed.add(row.case_id);
  if((index+1)%20===0||index+1===cases.length) {
    await writeFile(resultsOutput,`${results.map(item=>JSON.stringify(item)).join('\n')}\n`);
    console.error(`Evaluated ${results.length}/${cases.length} pairs.`);
  }
}
const summary=summarizeMemorabilityRun(cases,results);
const report={version:'dialogue-memorability-eval-v1',created_at:new Date().toISOString(),model,prompt_version:promptVersion,dataset:'Cornell Movie-Quotes Corpus v1.0 controlled memorable/non-memorable pairs',human_validated:false,...summary,uncertainty:'The positive label is presence on IMDb Memorable Quotes, not owner sendability or text-to-dialogue relevance.'};
await writeFile(reportOutput,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({...report,results_output:resultsOutput,report_output:reportOutput},null,2));
