import {createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdir,readFile,rename,stat,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {promisify} from 'node:util';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {
  CORNELL_QUOTES_ARCHIVE,
  CORNELL_QUOTES_LANDING,
  CORNELL_QUOTES_PAPER,
  buildCornellOutputs,
  decodeCornellText,
  parseCornellMemorablePairs,
  parseCornellMemorableQuotes,
  parseCornellScriptLine,
  summarizeCornellOutputs
} from '../src/dialogue-cornell.mjs';

const execFileAsync=promisify(execFile);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const cacheDir=resolve(root,'results/source-cache');
const archive=resolve(cacheDir,'cornell_movie_quotes_corpus.zip');
const memorableOutput=resolve(root,'expansion/sources/dialogue-cornell-memorable.jsonl');
const candidatesOutput=resolve(root,'expansion/candidates/dialogue-cornell-reaction-candidates.jsonl');
const pairsOutput=resolve(root,'eval/dialogue_cornell_memorability_pairs.jsonl');
const reportOutput=resolve(root,'expansion/sources/dialogue-cornell-report.json');

async function ensureArchive() {
  try {
    if((await stat(archive)).size>30_000_000) return;
  } catch(error) { if(error.code!=='ENOENT') throw error; }
  await mkdir(cacheDir,{recursive:true});
  const temporary=`${archive}.partial`;
  const response=await fetch(CORNELL_QUOTES_ARCHIVE,{headers:{'user-agent':'Meme-Lab-Dataset/1.0 (+https://github.com/sarthakagrawal927/meme-lab)'},signal:AbortSignal.timeout(300_000)});
  if(!response.ok||!response.body) throw new Error(`Cornell archive returned HTTP ${response.status}.`);
  await pipeline(Readable.fromWeb(response.body),createWriteStream(temporary));
  await rename(temporary,archive);
}

async function zipEntry(name,maxBuffer=12_000_000) {
  const {stdout}=await execFileAsync('unzip',['-p',archive,name],{encoding:'buffer',maxBuffer});
  return decodeCornellText(stdout);
}

async function selectedScriptLines(lineIds) {
  const child=spawn('unzip',['-p',archive,'moviequotes.scripts.txt'],{stdio:['ignore','pipe','pipe']});
  child.stdout.setEncoding('latin1');
  let stderr='';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data',chunk=>{stderr+=chunk;});
  const resolved=new Map();
  const lines=createInterface({input:child.stdout,crlfDelay:Infinity});
  for await (const latin1Line of lines) {
    const firstSeparator=latin1Line.indexOf(' +++$+++ ');
    if(firstSeparator<1) continue;
    const lineId=latin1Line.slice(0,firstSeparator);
    if(!lineIds.has(lineId)) continue;
    const decoded=decodeCornellText(Buffer.from(latin1Line,'latin1'));
    const parsed=parseCornellScriptLine(decoded);
    if(parsed) resolved.set(parsed.line_id,parsed);
  }
  const exitCode=await new Promise((resolvePromise,reject)=>{
    child.once('error',reject);
    child.once('close',resolvePromise);
  });
  if(exitCode!==0) throw new Error(`Could not stream Cornell scripts: ${stderr.trim()||`unzip exited ${exitCode}`}`);
  return resolved;
}

await ensureArchive();
const [memorableText,pairsText]=await Promise.all([
  zipEntry('moviequotes.memorable_quotes.txt'),
  zipEntry('moviequotes.memorable_nonmemorable_pairs.txt')
]);
const memorable=parseCornellMemorableQuotes(memorableText);
const pairs=parseCornellMemorablePairs(pairsText);
if(memorable.length!==6282||pairs.length!==2197) throw new Error(`Unexpected Cornell corpus counts: ${memorable.length} memorable, ${pairs.length} pairs.`);
const requestedLineIds=new Set([
  ...memorable.map(item=>item.matched_line.line_id),
  ...pairs.flatMap(pair=>[pair.memorable_line.line_id,pair.non_memorable_line.line_id])
]);
const scriptLines=await selectedScriptLines(requestedLineIds);
const output=buildCornellOutputs(memorable,pairs,scriptLines);
const summary=summarizeCornellOutputs(output.records,output.pairs,{candidates:output.candidates,requestedLineIds:requestedLineIds.size,resolvedLineIds:scriptLines.size});
const archiveHash=createHash('sha256').update(await readFile(archive)).digest('hex');
const report={
  version:'cornell-movie-quotes-import-v1',
  created_at:new Date().toISOString(),
  source:{provider:'Cornell Movie-Quotes Corpus v1.0',landing_url:CORNELL_QUOTES_LANDING,archive_url:CORNELL_QUOTES_ARCHIVE,paper_url:CORNELL_QUOTES_PAPER,archive_sha256:archiveHash,release:'2012-07'},
  ...summary,
  label_definition:'Memorable quotes were collected from IMDb Memorable Quotes pages. Pair negatives are nearby same-speaker, same-word-count lines absent from the IMDb memorable list.',
  validation:'The Cornell README reports high-precision automatic quote-to-script matching, but not every match was manually checked.',
  rights_boundary:'The README states no explicit reuse license. Underlying film dialogue may be copyrighted; all records remain research-only, source-linked, and production-ineligible.',
  raw_archive:`results/source-cache/${archive.split('/').at(-1)}`,
  outputs:{memorable:`expansion/sources/${memorableOutput.split('/').at(-1)}`,reaction_candidates:`expansion/candidates/${candidatesOutput.split('/').at(-1)}`,paired_eval:`eval/${pairsOutput.split('/').at(-1)}`}
};
await Promise.all([
  mkdir(dirname(memorableOutput),{recursive:true}),
  mkdir(dirname(candidatesOutput),{recursive:true}),
  mkdir(dirname(pairsOutput),{recursive:true})
]);
await Promise.all([
  writeFile(memorableOutput,`${output.records.map(row=>JSON.stringify(row)).join('\n')}\n`),
  writeFile(candidatesOutput,`${output.candidates.map(row=>JSON.stringify(row)).join('\n')}\n`),
  writeFile(pairsOutput,`${output.pairs.map(row=>JSON.stringify(row)).join('\n')}\n`),
  writeFile(reportOutput,`${JSON.stringify(report,null,2)}\n`)
]);
console.log(JSON.stringify({status:'completed',...summary,output:memorableOutput,candidate_output:candidatesOutput,paired_eval:pairsOutput,report:reportOutput},null,2));
