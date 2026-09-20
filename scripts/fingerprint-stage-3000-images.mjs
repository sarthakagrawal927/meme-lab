import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalizeUrl} from './audit-stage-3000-uniqueness.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const outputPath=resolve(root,'expansion/sources/stage-3000-image-fingerprints.json');
const inputs=[
  'worker/public/collection.json',
  'expansion/sources/stage-300-source.jsonl',
  'expansion/sources/stage-1000-source.jsonl',
  'expansion/sources/stage-3000-source.jsonl'
];
const MAX_BYTES=12*1024*1024;
const CONCURRENCY=8;

async function loadRecords(path) {
  const text=await readFile(resolve(root,path),'utf8');
  return path.endsWith('.jsonl')
    ? text.trim().split('\n').filter(Boolean).map(JSON.parse)
    : JSON.parse(text);
}

async function download(url) {
  let lastError;
  for(let attempt=1;attempt<=3;attempt+=1) {
    try {
      const response=await fetch(url,{
        headers:{'User-Agent':'Meme-Lab-Uniqueness-Audit/1.0 (+https://memes.significanthobbies.com)'},
        redirect:'follow',
        signal:AbortSignal.timeout(20_000)
      });
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType=(response.headers.get('content-type')??'').split(';')[0].toLowerCase();
      if(!contentType.startsWith('image/')) throw new Error(`unexpected content type ${contentType||'unknown'}`);
      const declared=Number(response.headers.get('content-length')??0);
      if(declared>MAX_BYTES) throw new Error(`declared size ${declared} exceeds ${MAX_BYTES}`);
      const chunks=[];
      let size=0;
      for await (const chunk of response.body) {
        size+=chunk.length;
        if(size>MAX_BYTES) throw new Error(`download exceeds ${MAX_BYTES} bytes`);
        chunks.push(chunk);
      }
      return {bytes:Buffer.concat(chunks),contentType,finalUrl:response.url};
    } catch(error) {
      lastError=error;
      if(attempt<3) await new Promise(resolveDelay=>setTimeout(resolveDelay,attempt*400));
    }
  }
  throw lastError;
}

function rawGrayPixels(bytes) {
  return new Promise((resolvePixels,reject)=>{
    const process=spawn('ffmpeg',[
      '-hide_banner','-loglevel','error','-i','pipe:0',
      '-vf','scale=32:32:flags=area,format=gray','-frames:v','1',
      '-f','rawvideo','-pix_fmt','gray','pipe:1'
    ],{stdio:['pipe','pipe','pipe']});
    const output=[];
    const errors=[];
    process.stdout.on('data',chunk=>output.push(chunk));
    process.stderr.on('data',chunk=>errors.push(chunk));
    process.on('error',reject);
    process.stdin.on('error',error=>{
      if(error.code!=='EPIPE') reject(error);
    });
    process.on('close',code=>{
      const pixels=Buffer.concat(output);
      if(code!==0||pixels.length!==1024) {
        reject(new Error(`ffmpeg failed (${code}); ${Buffer.concat(errors).toString('utf8').trim()||`${pixels.length} output bytes`}`));
        return;
      }
      resolvePixels(pixels);
    });
    process.stdin.end(bytes);
  });
}

function differenceHash(pixels) {
  let value=0n;
  for(let row=0;row<8;row+=1) {
    for(let column=0;column<8;column+=1) {
      const y=Math.floor((row+0.5)*32/8);
      const leftX=Math.floor(column*31/8);
      const rightX=Math.floor((column+1)*31/8);
      value=(value<<1n)|(pixels[y*32+leftX]>pixels[y*32+rightX]?1n:0n);
    }
  }
  return value.toString(16).padStart(16,'0');
}

const COSINES=Array.from({length:8},(_,frequency)=>Array.from({length:32},(_,position)=>Math.cos(((2*position+1)*frequency*Math.PI)/64)));
function perceptualHash(pixels) {
  const coefficients=[];
  for(let vertical=0;vertical<8;vertical+=1) {
    for(let horizontal=0;horizontal<8;horizontal+=1) {
      let sum=0;
      for(let y=0;y<32;y+=1) {
        for(let x=0;x<32;x+=1) sum+=pixels[y*32+x]*COSINES[horizontal][x]*COSINES[vertical][y];
      }
      coefficients.push(sum);
    }
  }
  const median=[...coefficients.slice(1)].sort((left,right)=>left-right)[31];
  let value=0n;
  for(const coefficient of coefficients) value=(value<<1n)|(coefficient>median?1n:0n);
  return value.toString(16).padStart(16,'0');
}

async function fingerprint(row) {
  try {
    const fingerprintUrl=row.image_url.replace(/^(https:\/\/api\.nga\.gov\/iiif\/[^/]+)\/full\/![^/]+\/0\/default\.jpg$/,'$1/full/256,/0/default.jpg');
    const downloaded=await download(fingerprintUrl);
    const pixels=await rawGrayPixels(downloaded.bytes);
    return {
      image_url:row.image_url,
      canonical_url:row.canonical_url,
      fingerprint_url:fingerprintUrl,
      final_url:downloaded.finalUrl,
      content_type:downloaded.contentType,
      bytes:downloaded.bytes.length,
      sha256:createHash('sha256').update(downloaded.bytes).digest('hex'),
      dhash:differenceHash(pixels),
      phash:perceptualHash(pixels),
      status:'fingerprinted'
    };
  } catch(error) {
    return {image_url:row.image_url,canonical_url:row.canonical_url,status:'failed',error:error.message};
  }
}

const groups=await Promise.all(inputs.map(async path=>({path,records:await loadRecords(path)})));
const targets=new Set(groups.at(-1).records.map(record=>canonicalizeUrl(record.image_url,{image:true})));
const unique=new Map();
for(const group of groups) {
  for(const record of group.records) {
    const imageUrl=record.image_url??record.media?.image_url;
    if(typeof imageUrl!=='string'||!imageUrl.startsWith('https://')) continue;
    const canonicalUrl=canonicalizeUrl(imageUrl,{image:true});
    if(!unique.has(canonicalUrl)) unique.set(canonicalUrl,{image_url:imageUrl,canonical_url:canonicalUrl,sources:[group.path]});
    else if(!unique.get(canonicalUrl).sources.includes(group.path)) unique.get(canonicalUrl).sources.push(group.path);
  }
}

const queue=[...unique.values()];
const results=new Array(queue.length);
let previous=[];
try {
  const manifest=JSON.parse(await readFile(outputPath,'utf8'));
  previous=(manifest.fingerprints??[]).filter(row=>row.status==='fingerprinted'&&row.phash);
} catch {}
const cachedByCanonical=new Map(previous.map(row=>[row.canonical_url,row]));
let next=0;
let cached=0;
await Promise.all(Array.from({length:Math.min(CONCURRENCY,queue.length)},async()=>{
  while(next<queue.length) {
    const index=next++;
    const cachedRow=cachedByCanonical.get(queue[index].canonical_url);
    if(cachedRow) {
      cached+=1;
      results[index]={...cachedRow,image_url:queue[index].image_url,canonical_url:queue[index].canonical_url};
    } else results[index]=await fingerprint(queue[index]);
    results[index].sources=queue[index].sources;
    if((index+1)%100===0) process.stderr.write(`fingerprinted ${index+1}/${queue.length}\n`);
  }
}));

const failures=results.filter(row=>row.status!=='fingerprinted');
const targetFailures=failures.filter(row=>targets.has(row.canonical_url));
const output={
  version:'stage-3000-image-fingerprints-v1',
  generated_at:new Date().toISOString(),
  algorithm:{exact:'sha256',perceptual:'phash-32x32-dct-8x8',secondary:'dhash-sampled-from-32x32-grayscale',max_bytes:MAX_BYTES,timeout_ms:20_000,retries:3},
  inputs:groups.map(group=>({path:group.path,records:group.records.length})),
  summary:{unique_images:results.length,fingerprinted:results.length-failures.length,cached,downloaded:results.length-cached,failed:failures.length,target_images:targets.size,target_failed:targetFailures.length},
  fingerprints:results
};
await mkdir(dirname(outputPath),{recursive:true});
await writeFile(outputPath,`${JSON.stringify(output,null,2)}\n`);
process.stdout.write(`${JSON.stringify({status:targetFailures.length?'incomplete':'complete',...output.summary,output:outputPath},null,2)}\n`);
if(targetFailures.length) process.exitCode=1;
