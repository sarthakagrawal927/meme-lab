import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const BOILERPLATE_NAME_TOKENS=new Set(['a','an','the','blank','image','meme','picture','reaction','template']);
const SEMANTIC_STOP_WORDS=new Set([
  'a','an','and','are','as','at','be','because','but','by','for','from','has','have','in','into','is','it','its','of','on','or','that','the','their','them','then','there','they','this','to','use','when','where','while','with','you','your'
]);

function decodeHtmlEntities(value) {
  return String(value??'')
    .replace(/&#(\d+);/g,(_,number)=>String.fromCodePoint(Number(number)))
    .replace(/&#x([\da-f]+);/gi,(_,number)=>String.fromCodePoint(Number.parseInt(number,16)))
    .replace(/&(amp|apos|quot|lt|gt);/gi,(_,entity)=>({amp:'&',apos:"'",quot:'"',lt:'<',gt:'>'}[entity.toLowerCase()]));
}

export function normalizeName(value) {
  return decodeHtmlEntities(value)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu,'')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,' ')
    .trim()
    .replace(/\s+/g,' ');
}

export function nameAliasKeys(record) {
  const values=[record?.name,...(Array.isArray(record?.aliases)?record.aliases:[])];
  const strict=new Set();
  const loose=new Set();
  for(const value of values) {
    const normalized=normalizeName(value);
    if(!normalized) continue;
    strict.add(normalized);
    const tokens=normalized.split(' ').filter(token=>!BOILERPLATE_NAME_TOKENS.has(token));
    if(tokens.length) loose.add([...new Set(tokens)].sort().join(' '));
  }
  return {strict:[...strict],loose:[...loose]};
}

export function canonicalizeUrl(value,{image=false}={}) {
  if(typeof value!=='string'||!value.trim()) return '';
  try {
    const url=new URL(value.trim());
    url.hash='';
    url.hostname=url.hostname.toLowerCase().replace(/^www\./,'');
    if((url.protocol==='https:'&&url.port==='443')||(url.protocol==='http:'&&url.port==='80')) url.port='';
    const dropped=[];
    for(const key of url.searchParams.keys()) {
      if(/^utm_/i.test(key)||['fbclid','gclid'].includes(key.toLowerCase())||(image&&/^(?:format|h|height|q|quality|w|width)$/i.test(key))) dropped.push(key);
    }
    dropped.forEach(key=>url.searchParams.delete(key));
    url.searchParams.sort();
    url.pathname=url.pathname.replace(/\/{2,}/g,'/').replace(/\/$/,'')||'/';
    if(image&&url.hostname==='i.imgflip.com') url.pathname=url.pathname.replace(/^\/(?:2|4)\//,'/');
    return url.toString();
  } catch {
    return value.trim();
  }
}

function recordId(record,index,scope) {
  return String(record.id??record.proposed_id??record.source_id??`${scope}-${index+1}`);
}

function imageUrl(record) {
  return String(record.image_url??record.media?.image_url??'').trim();
}

function sourceIdentity(record) {
  const provider=record.provider??record.provenance?.provider;
  const sourceId=record.source_id??record.provenance?.provider_id;
  return provider&&sourceId?`${String(provider).toLowerCase()}:${String(sourceId).toLowerCase()}`:'';
}

function semanticText(record) {
  const fields=[record.message,record.relational_pattern,record.example_context,...(Array.isArray(record.tags)?record.tags:[])];
  return fields.filter(value=>typeof value==='string'&&value.trim()).join(' ');
}

function semanticSignature(record) {
  if(typeof record.message!=='string'||typeof record.relational_pattern!=='string') return '';
  return `${normalizeName(record.message)}|${normalizeName(record.relational_pattern)}`;
}

function semanticTokens(record) {
  return new Set(normalizeName(semanticText(record)).split(' ').filter(token=>token.length>2&&!SEMANTIC_STOP_WORDS.has(token)));
}

function jaccard(left,right) {
  if(!left.size||!right.size) return 0;
  let intersection=0;
  for(const token of left) if(right.has(token)) intersection+=1;
  return intersection/(left.size+right.size-intersection);
}

export function hammingDistanceHex(left,right) {
  if(typeof left!=='string'||typeof right!=='string'||!/^[\da-f]+$/i.test(left)||!/^[\da-f]+$/i.test(right)||left.length!==right.length) return Number.POSITIVE_INFINITY;
  let bits=BigInt(`0x${left}`)^BigInt(`0x${right}`);
  let distance=0;
  while(bits) {
    bits&=bits-1n;
    distance+=1;
  }
  return distance;
}

function normalizeFingerprints(value) {
  const rows=Array.isArray(value)?value:Object.entries(value??{}).map(([url,fingerprint])=>({image_url:url,...fingerprint}));
  const exact=new Map();
  const canonical=new Map();
  for(const row of rows) {
    const raw=String(row.image_url??row.url??'').trim();
    const key=canonicalizeUrl(raw,{image:true});
    if(raw) exact.set(raw,row);
    if(key&&!canonical.has(key)) canonical.set(key,row);
  }
  return {exact,canonical};
}

function conflict(left,right,kind,key,details={}) {
  return {
    kind,
    left:{id:left.id,name:left.record.name,scope:left.scope},
    right:{id:right.id,name:right.record.name,scope:right.scope},
    key,
    ...details
  };
}

function involvesTarget(left,right) {
  return left.scope==='target'||right.scope==='target';
}

function keyConflicts(rows,keysFor,kind) {
  const indexed=new Map();
  const conflicts=[];
  const seenPairs=new Set();
  for(const row of rows) {
    for(const key of keysFor(row).filter(Boolean)) {
      const previous=indexed.get(key)??[];
      for(const other of previous) {
        if(!involvesTarget(row,other)) continue;
        const pair=[row.id,other.id].sort().join('\0')+`\0${kind}`;
        if(seenPairs.has(pair)) continue;
        seenPairs.add(pair);
        conflicts.push(conflict(row,other,kind,key));
      }
      previous.push(row);
      indexed.set(key,previous);
    }
  }
  return conflicts;
}

export function auditUniqueness({targets,references=[],fingerprints=[],semanticThreshold=0.82,perceptualThreshold=0.08}) {
  const rows=[
    ...references.map((record,index)=>({record,id:recordId(record,index,'reference'),scope:'reference'})),
    ...targets.map((record,index)=>({record,id:recordId(record,index,'target'),scope:'target'}))
  ];
  const fingerprintIndex=normalizeFingerprints(fingerprints);
  const fingerprintFor=record=>{
    const raw=imageUrl(record);
    return fingerprintIndex.exact.get(raw)??fingerprintIndex.canonical.get(canonicalizeUrl(raw,{image:true}));
  };
  const conflicts={
    provider_source_id:keyConflicts(rows,row=>[sourceIdentity(row.record)],'provider_source_id'),
    exact_image_url:keyConflicts(rows,row=>[imageUrl(row.record)],'exact_image_url'),
    canonical_image_url:keyConflicts(rows,row=>[canonicalizeUrl(imageUrl(row.record),{image:true})],'canonical_image_url'),
    normalized_name:keyConflicts(rows,row=>nameAliasKeys(row.record).strict,'normalized_name'),
    alias_name:keyConflicts(rows,row=>nameAliasKeys(row.record).loose,'alias_name'),
    exact_semantic_metadata:keyConflicts(rows,row=>[semanticSignature(row.record)],'exact_semantic_metadata'),
    near_semantic_metadata:[],
    exact_image_content:[],
    perceptual_image:[]
  };

  const semanticRows=rows.map(row=>({...row,tokens:semanticTokens(row.record)})).filter(row=>row.tokens.size>=4);
  const inverted=new Map();
  const candidatePairs=new Set();
  semanticRows.forEach((row,index)=>{row.semanticIndex=index;});
  for(const row of semanticRows) {
    for(const token of row.tokens) {
      const previous=inverted.get(token)??[];
      for(const other of previous) if(involvesTarget(row,other)) candidatePairs.add(`${other.semanticIndex}:${row.semanticIndex}`);
      previous.push(row);
      inverted.set(token,previous);
    }
  }
  for(const pair of candidatePairs) {
    const [leftIndex,rightIndex]=pair.split(':').map(Number);
    const left=semanticRows[leftIndex];
    const right=semanticRows[rightIndex];
    const similarity=jaccard(left.tokens,right.tokens);
    if(similarity>=semanticThreshold&&semanticSignature(left.record)!==semanticSignature(right.record)) {
      conflicts.near_semantic_metadata.push(conflict(left,right,'near_semantic_metadata','',{similarity:Number(similarity.toFixed(4))}));
    }
  }

  const fingerprintRows=rows.map(row=>{
    const url=canonicalizeUrl(imageUrl(row.record),{image:true});
    return {...row,url,fingerprint:fingerprintFor(row.record)};
  }).filter(row=>row.fingerprint);
  const fingerprintPairs=new Set();
  for(let leftIndex=0;leftIndex<fingerprintRows.length;leftIndex+=1) {
    for(let rightIndex=leftIndex+1;rightIndex<fingerprintRows.length;rightIndex+=1) {
      const left=fingerprintRows[leftIndex];
      const right=fingerprintRows[rightIndex];
      if(!involvesTarget(left,right)) continue;
      const pair=[left.id,right.id].sort().join('\0');
      if(left.fingerprint.sha256&&left.fingerprint.sha256===right.fingerprint.sha256) {
        const key=`exact\0${pair}`;
        if(!fingerprintPairs.has(key)) {
          fingerprintPairs.add(key);
          conflicts.exact_image_content.push(conflict(left,right,'exact_image_content',left.fingerprint.sha256));
        }
        continue;
      }
      const leftHash=left.fingerprint.phash??left.fingerprint.dhash;
      const rightHash=right.fingerprint.phash??right.fingerprint.dhash;
      const distance=hammingDistanceHex(leftHash,rightHash);
      if(Number.isFinite(distance)) {
        const bits=leftHash.length*4;
        const ratio=distance/bits;
        const key=`perceptual\0${pair}`;
        if(ratio<=perceptualThreshold&&!fingerprintPairs.has(key)) {
          fingerprintPairs.add(key);
          conflicts.perceptual_image.push(conflict(left,right,'perceptual_image','',{distance,bits,ratio:Number(ratio.toFixed(4))}));
        }
      }
    }
  }

  const targetImageCount=targets.filter(record=>imageUrl(record)).length;
  const targetFingerprintCount=targets.filter(record=>fingerprintFor(record)).length;
  const targetSemanticCount=targets.filter(record=>semanticTokens(record).size>=4).length;
  const blockerKinds=['provider_source_id','exact_image_url','canonical_image_url','normalized_name','exact_semantic_metadata','exact_image_content'];
  const blockerCount=blockerKinds.reduce((count,kind)=>count+conflicts[kind].length,0);
  const reviewCount=['alias_name','near_semantic_metadata','perceptual_image'].reduce((count,kind)=>count+conflicts[kind].length,0);
  const targetOrder=new Map(targets.map((record,index)=>[recordId(record,index,'target'),index]));
  const targetIds=(kinds)=>new Set(kinds.flatMap(kind=>conflicts[kind]).flatMap(item=>[item.left,item.right]).filter(item=>item.scope==='target').map(item=>item.id));
  const blockedTargets=new Set();
  for(const item of blockerKinds.flatMap(kind=>conflicts[kind])) {
    if(item.left.scope==='reference'&&item.right.scope==='target') blockedTargets.add(item.right.id);
    else if(item.right.scope==='reference'&&item.left.scope==='target') blockedTargets.add(item.left.id);
    else if(item.left.scope==='target'&&item.right.scope==='target') {
      const leftIndex=targetOrder.get(item.left.id)??Number.MAX_SAFE_INTEGER;
      const rightIndex=targetOrder.get(item.right.id)??Number.MAX_SAFE_INTEGER;
      blockedTargets.add(leftIndex>rightIndex?item.left.id:item.right.id);
    }
  }
  const reviewTargets=targetIds(['alias_name','near_semantic_metadata','perceptual_image']);
  const reviewOnlyTargets=new Set([...reviewTargets].filter(id=>!blockedTargets.has(id)));
  const coverage={
    target_images:{present:targetImageCount,total:targets.length},
    target_image_fingerprints:{present:targetFingerprintCount,total:targetImageCount},
    target_semantic_metadata:{present:targetSemanticCount,total:targets.length}
  };
  return {
    version:'stage-3000-uniqueness-audit-v1',
    records:{targets:targets.length,references:references.length},
    thresholds:{semantic_jaccard:semanticThreshold,perceptual_hamming_ratio:perceptualThreshold},
    coverage,
    summary:{
      blocker_pairs:blockerCount,
      blocked_targets:blockedTargets.size,
      review_pairs:reviewCount,
      review_targets:reviewTargets.size,
      review_only_targets:reviewOnlyTargets.size,
      eligible_after_hard_blocks:targets.length-blockedTargets.size,
      blocked_target_ids:[...blockedTargets].sort(),
      review_only_target_ids:[...reviewOnlyTargets].sort(),
      incomplete_fingerprint_coverage:targetFingerprintCount<targetImageCount,
      incomplete_semantic_coverage:targetSemanticCount<targets.length
    },
    conflicts
  };
}

async function loadRecords(path) {
  const text=await readFile(path,'utf8');
  if(path.endsWith('.jsonl')) return text.trim().split('\n').filter(Boolean).map((line,index)=>{
    try { return JSON.parse(line); }
    catch { throw new Error(`${path} has invalid JSON on line ${index+1}.`); }
  });
  const value=JSON.parse(text);
  if(!Array.isArray(value)) throw new Error(`${path} must contain a JSON array or JSONL records.`);
  return value;
}

function parseArgs(argv) {
  const options={references:[]};
  for(let index=0;index<argv.length;index+=1) {
    const arg=argv[index];
    if(arg==='--target') options.target=argv[++index];
    else if(arg==='--reference') options.references.push(argv[++index]);
    else if(arg==='--fingerprints') options.fingerprints=argv[++index];
    else if(arg==='--output') options.output=argv[++index];
    else if(arg==='--strict') options.strict=true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function main() {
  const options=parseArgs(process.argv.slice(2));
  const target=resolve(options.target??'expansion/sources/stage-3000-source.jsonl');
  const referencePaths=(options.references.length?options.references:[
    'worker/public/collection.json'
  ]).map(path=>resolve(path));
  const [targets,referenceGroups,fingerprints]=await Promise.all([
    loadRecords(target),
    Promise.all(referencePaths.map(loadRecords)),
    options.fingerprints?readFile(resolve(options.fingerprints),'utf8').then(JSON.parse).then(value=>value.fingerprints??value):Promise.resolve([])
  ]);
  const report=auditUniqueness({targets,references:referenceGroups.flat(),fingerprints});
  const serialized=`${JSON.stringify(report,null,2)}\n`;
  if(options.output) await import('node:fs/promises').then(({writeFile})=>writeFile(resolve(options.output),serialized));
  process.stdout.write(serialized);
  if(options.strict&&(report.summary.blocked_targets>0||report.summary.incomplete_fingerprint_coverage||report.summary.incomplete_semantic_coverage)) process.exitCode=1;
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href) await main();
