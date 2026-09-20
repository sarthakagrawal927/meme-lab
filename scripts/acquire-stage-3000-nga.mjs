import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const repositoryUrl='https://github.com/NationalGalleryOfArt/opendata';
const objectsUrl='https://raw.githubusercontent.com/NationalGalleryOfArt/opendata/main/data/objects.csv';
const imagesUrl='https://raw.githubusercontent.com/NationalGalleryOfArt/opendata/main/data/published_images.csv';
const provider='National Gallery of Art, Washington';
const license='CC0 1.0 Universal';
const licenseUrl='https://creativecommons.org/publicdomain/zero/1.0/';
const policyUrl='https://www.nga.gov/terms-and-notices';
const observedOn=new Date().toISOString().slice(0,10);
const userAgent='Meme-Lab-Dataset/1.0 (+https://github.com/sarthakagrawal927/meme-lab)';
const sensitivePattern=/\b(?:abuse|assault|behead(?:ed|ing)?|blood(?:y|shed)?|brothel|cadaver|corpse|crucifixion|dead|death|decapitat(?:ed|ion)|erotic|execution|genital|hanged|hanging|killing|lynch(?:ed|ing)?|massacre|martyr|murder|naked|nude|nudity|pornograph(?:ic|y)|prostitut(?:e|ion)|rape|raped|saint|sexual|slave|slavery|suicide|torture|violence|virgin mary|wound(?:ed|ing)?)\b|\bchrist\b.*\bcross\b/i;
const unhelpfulTitlePattern=/^(?:untitled|unknown|unidentified|fragment|object|study|sketch|design|plate|page|folio|proof|copy|drawing|photograph|portrait|landscape|figure|figures|head|man|woman|child|group)(?:\s*(?:no\.?|number)?\s*\d+)?$/i;
const supportedClassificationPattern=/(?:drawing|painting|photograph|print|sculpture|decorative art)/i;
const reactionSignals=[
  {category:'joy',pattern:/\b(?:applaud(?:ing)?|celebrat(?:e|ing|ion)|cheer(?:ing)?|dance|dancing|delight(?:ed)?|happy|joy(?:ful)?|laugh(?:ing)?|party|smil(?:e|ing))\b/i},
  {category:'surprise',pattern:/\b(?:alarm(?:ed)?|astonish(?:ed|ment)?|gasp(?:ing)?|shock(?:ed)?|startled|surpris(?:e|ed)|wonder)\b/i},
  {category:'conflict',pattern:/\b(?:angry|argument|arguing|battle|confront(?:ation|ing)?|fight(?:ing)?|pointing|protest(?:ing)?|scold(?:ing)?|shout(?:ing)?)\b/i},
  {category:'sadness',pattern:/\b(?:cry(?:ing)?|despair|grief|melancholy|mourning|sad(?:ness)?|sorrow)\b/i},
  {category:'thinking',pattern:/\b(?:contemplat(?:e|ing|ion)|ponder(?:ing)?|read(?:ing)?|reflect(?:ing|ion)?|study(?:ing)?|think(?:ing)?|writ(?:e|ing))\b/i},
  {category:'waiting',pattern:/\b(?:bored|daydream(?:ing)?|sleep(?:ing)?|tired|wait(?:ing)?)\b/i},
  {category:'action',pattern:/\b(?:chase|climb(?:ing)?|escape|fall(?:ing)?|flee(?:ing)?|jump(?:ing)?|run(?:ning)?|swim(?:ming)?)\b/i},
  {category:'conversation',pattern:/\b(?:conversation|gather(?:ed|ing)?|meeting|speaking|talk(?:ing)?|whisper(?:ing)?)\b/i},
  {category:'animals',pattern:/\b(?:animal|bear|bird|cat|cow|dog|donkey|elephant|fish|goat|horse|lion|monkey|owl|rabbit|sheep|tiger)\b/i},
  {category:'reaction',pattern:/\b(?:expression|facepalm|gaze|gesture|grimace|shrug|stare|staring)\b/i}
];

function parseInteger(value,label,{minimum=1,maximum=Number.MAX_SAFE_INTEGER}={}) {
  const parsed=Number.parseInt(value,10);
  if(!Number.isInteger(parsed)||parsed<minimum||parsed>maximum) throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  return parsed;
}

function parseArgs(argv) {
  const options={limit:1400,maxImageRows:150000,outputDir:resolve(root,'expansion/sources')};
  for(let index=0;index<argv.length;index+=1) {
    const argument=argv[index];
    if(argument==='--help') {
      console.log('Usage: node scripts/acquire-stage-3000-nga.mjs [--limit 1..2000] [--max-image-rows 1..250000] [--output-dir PATH]');
      process.exit(0);
    }
    const value=argv[index+1];
    if(argument==='--limit') options.limit=parseInteger(value,'--limit',{maximum:2000});
    else if(argument==='--max-image-rows') options.maxImageRows=parseInteger(value,'--max-image-rows',{maximum:250000});
    else if(argument==='--output-dir') {
      if(!value||value.startsWith('--')) throw new Error('--output-dir requires a path.');
      options.outputDir=resolve(value);
    } else throw new Error(`Unknown argument: ${argument}`);
    index+=1;
  }
  return options;
}

function normalize(value) {
  return String(value??'').toLowerCase().normalize('NFKD').replaceAll(/[\u0300-\u036f]/g,'').replaceAll(/[^a-z0-9]+/g,' ').trim();
}

function slugify(value) {
  return normalize(value).replaceAll(' ','-').slice(0,72).replaceAll(/-+$/g,'');
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol==='https:';
  } catch {
    return false;
  }
}

function iiifImageUrl(baseUrl) {
  return `${baseUrl.replace(/\/$/,'')}/full/!1200,1200/0/default.jpg`;
}

async function fetchCsv(url) {
  const response=await fetch(url,{
    headers:{Accept:'text/csv','User-Agent':userAgent},
    redirect:'follow',
    signal:AbortSignal.timeout(180000)
  });
  if(!response.ok||!response.body) throw new Error(`${url} failed with HTTP ${response.status}.`);
  return {
    response,
    metadata:{
      url,
      final_url:response.url,
      etag:response.headers.get('etag'),
      last_modified:response.headers.get('last-modified'),
      content_length:Number(response.headers.get('content-length'))||null
    }
  };
}

async function* csvRows(response,label) {
  const reader=response.body.pipeThrough(new TextDecoderStream('utf-8')).getReader();
  let row=[];
  let field='';
  let quoted=false;
  let pendingQuote=false;
  let firstChunk=true;
  try {
    while(true) {
      const {done,value}=await reader.read();
      if(done) break;
      let chunk=value;
      if(firstChunk) {
        chunk=chunk.replace(/^\uFEFF/,'');
        firstChunk=false;
      }
      for(const character of chunk) {
        if(quoted) {
          if(pendingQuote) {
            if(character==='"') {
              field+='"';
              pendingQuote=false;
              continue;
            }
            quoted=false;
            pendingQuote=false;
          } else if(character==='"') {
            pendingQuote=true;
            continue;
          } else {
            field+=character;
            continue;
          }
        }
        if(character==='"'&&field.length===0) quoted=true;
        else if(character===',') {
          row.push(field);
          field='';
        } else if(character==='\n') {
          row.push(field.replace(/\r$/,''));
          field='';
          yield row;
          row=[];
        } else if(character!=='\r') field+=character;
      }
    }
    if(quoted&&!pendingQuote) throw new Error(`${label} ended inside a quoted field.`);
    if(field.length>0||row.length>0) {
      row.push(field);
      yield row;
    }
  } finally {
    await reader.cancel().catch(()=>{});
  }
}

function requireColumns(header,required,label) {
  const indexes=Object.fromEntries(header.map((column,index)=>[column.toLowerCase(),index]));
  const missing=required.filter(column=>indexes[column]===undefined);
  if(missing.length) throw new Error(`${label} is missing required columns: ${missing.join(', ')}.`);
  return indexes;
}

async function existingIdentitySets() {
  const names=new Set();
  const imageUrls=new Set();
  const sourceIds=new Set();
  const collectionPath=resolve(root,'worker/public/collection.json');
  try {
    const records=JSON.parse(await readFile(collectionPath,'utf8'));
    for(const record of records) {
      const name=normalize(record.name??record.title);
      if(name) names.add(name);
      if(isHttpsUrl(record.image_url)) imageUrls.add(record.image_url);
    }
  } catch(error) {
    if(error?.code!=='ENOENT') throw error;
  }
  const sourceDir=resolve(root,'expansion/sources');
  let sourceFiles=[];
  try {
    sourceFiles=(await readdir(sourceDir)).filter(file=>file.endsWith('.jsonl'));
  } catch(error) {
    if(error?.code!=='ENOENT') throw error;
  }
  for(const file of sourceFiles) {
    const text=await readFile(resolve(sourceDir,file),'utf8');
    for(const line of text.split('\n')) {
      if(!line.trim()) continue;
      const record=JSON.parse(line);
      const name=normalize(record.name??record.title);
      if(name) names.add(name);
      if(isHttpsUrl(record.image_url)) imageUrls.add(record.image_url);
      if(record.provider===provider&&record.source_id) sourceIds.add(String(record.source_id));
    }
  }
  return {names,imageUrls,sourceIds};
}

function reactionCategory(text) {
  for(const signal of reactionSignals) if(signal.pattern.test(text)) return signal.category;
  return null;
}

function makeCandidate(object,image,category) {
  const objectUrl=`https://www.nga.gov/artworks/${object.objectId}-${slugify(object.title)}`;
  const imageUrl=iiifImageUrl(image.iiifUrl);
  return {
    proposed_id:`nga-${object.objectId}-${slugify(object.title)}`,
    source_id:`${object.objectId}:${image.uuid}`,
    name:object.title,
    title:object.title,
    categories:['fine-art','public-domain',category],
    image_url:imageUrl,
    image_width:image.width,
    image_height:image.height,
    assistive_text:image.assistiveText,
    creator:object.attribution||'Unknown',
    object_date:object.displayDate,
    medium:object.medium,
    classification:object.classification,
    credit_line:object.creditLine,
    object_url:objectUrl,
    provider,
    source_url:objectUrl,
    catalogue_url:repositoryUrl,
    observed_on:observedOn,
    rights_status:'cc0-public-domain',
    license,
    license_url:licenseUrl,
    credit:'Courtesy National Gallery of Art, Washington',
    provenance:{
      source_type:'official_downloadable_csv',
      objects_csv:objectsUrl,
      published_images_csv:imagesUrl,
      object_id:object.objectId,
      image_uuid:image.uuid,
      iiif_base_url:image.iiifUrl,
      openaccess:1,
      viewtype:'primary'
    },
    review_status:'needs_meme_fit_review',
    human_validated:false
  };
}

function validateCandidate(candidate) {
  if(!candidate.proposed_id.startsWith('nga-')) throw new Error(`Invalid proposed_id for NGA record ${candidate.source_id}.`);
  if(!candidate.name||candidate.name!==candidate.title) throw new Error(`Invalid title for NGA record ${candidate.source_id}.`);
  if(!isHttpsUrl(candidate.image_url)||!isHttpsUrl(candidate.object_url)||!isHttpsUrl(candidate.source_url)) throw new Error(`Invalid HTTPS provenance for NGA record ${candidate.source_id}.`);
  if(candidate.rights_status!=='cc0-public-domain'||candidate.license!==license||candidate.provider!==provider) throw new Error(`Invalid rights metadata for NGA record ${candidate.source_id}.`);
  if(candidate.provenance.openaccess!==1||candidate.provenance.viewtype!=='primary'||candidate.human_validated!==false) throw new Error(`Invalid open-access or review metadata for NGA record ${candidate.source_id}.`);
}

async function loadEligibleImages(existing,options) {
  const {response,metadata}=await fetchCsv(imagesUrl);
  const rows=csvRows(response,'published_images.csv');
  const first=await rows.next();
  if(first.done) throw new Error('published_images.csv is empty.');
  const columns=requireColumns(first.value,['uuid','iiifurl','viewtype','width','height','openaccess','depictstmsobjectid','assistivetext'],'published_images.csv');
  const images=new Map();
  const retainedObjectIds=new Set();
  const rejected={};
  let rowsRead=0;
  const bufferTarget=Math.min(options.maxImageRows,Math.max(500,options.limit*8));
  for await(const row of rows) {
    rowsRead+=1;
    if(rowsRead>options.maxImageRows||images.size>=bufferTarget) break;
    const objectId=String(row[columns.depictstmsobjectid]??'').trim();
    const uuid=String(row[columns.uuid]??'').trim();
    const iiifUrl=String(row[columns.iiifurl]??'').trim();
    const assistiveText=String(row[columns.assistivetext]??'').replaceAll(/\s+/g,' ').trim();
    const width=Number.parseInt(row[columns.width],10);
    const height=Number.parseInt(row[columns.height],10);
    const imageUrl=isHttpsUrl(iiifUrl)?iiifImageUrl(iiifUrl):'';
    let reason=null;
    if(row[columns.openaccess]!=='1') reason='not_open_access';
    else if(row[columns.viewtype]!=='primary') reason='not_primary_view';
    else if(!objectId||!uuid||!isHttpsUrl(iiifUrl)) reason='missing_source_identity_or_https_iiif_url';
    else if(!Number.isInteger(width)||!Number.isInteger(height)||Math.min(width,height)<400) reason='image_too_small';
    else if(assistiveText.length<60) reason='missing_useful_assistive_text';
    else if(sensitivePattern.test(assistiveText)) reason='sensitive_metadata';
    else if(existing.imageUrls.has(imageUrl)) reason='known_image_url';
    else if(existing.sourceIds.has(`${objectId}:${uuid}`)||retainedObjectIds.has(objectId)) reason='duplicate_source_identity';
    const category=reason?null:reactionCategory(assistiveText);
    if(!reason&&!category) reason='no_reaction_signal';
    if(reason) {
      rejected[reason]=(rejected[reason]??0)+1;
      continue;
    }
    images.set(objectId,{uuid,iiifUrl,width,height,assistiveText,category});
    retainedObjectIds.add(objectId);
  }
  return {images,metadata,rowsRead,rejected,bufferTarget};
}

async function collectCandidates(images,existing,options) {
  const {response,metadata}=await fetchCsv(objectsUrl);
  const rows=csvRows(response,'objects.csv');
  const first=await rows.next();
  if(first.done) throw new Error('objects.csv is empty.');
  const columns=requireColumns(first.value,['objectid','accessioned','title','displaydate','medium','attribution','creditline','classification','isvirtual'],'objects.csv');
  const retained=[];
  const retainedNames=new Set();
  const rejected={};
  let rowsRead=0;
  for await(const row of rows) {
    rowsRead+=1;
    if(retained.length>=options.limit) break;
    const objectId=String(row[columns.objectid]??'').trim();
    const image=images.get(objectId);
    if(!image) continue;
    const title=String(row[columns.title]??'').trim();
    const normalizedTitle=normalize(title);
    let reason=null;
    if(row[columns.accessioned]!=='1') reason='not_accessioned';
    else if(row[columns.isvirtual]==='1') reason='virtual_object';
    else if(!title) reason='missing_title';
    else if(sensitivePattern.test(`${title} ${image.assistiveText}`)) reason='sensitive_metadata';
    else if(unhelpfulTitlePattern.test(title)) reason='unhelpful_title';
    else if(!supportedClassificationPattern.test(row[columns.classification]??'')) reason='unsupported_classification';
    else if(existing.names.has(normalizedTitle)||retainedNames.has(normalizedTitle)) reason='duplicate_title';
    if(reason) {
      rejected[reason]=(rejected[reason]??0)+1;
      continue;
    }
    const object={
      objectId,
      title,
      displayDate:String(row[columns.displaydate]??'').trim(),
      medium:String(row[columns.medium]??'').trim(),
      attribution:String(row[columns.attribution]??'').trim(),
      creditLine:String(row[columns.creditline]??'').trim(),
      classification:String(row[columns.classification]??'').trim()
    };
    const candidate=makeCandidate(object,image,image.category);
    validateCandidate(candidate);
    retained.push(candidate);
    retainedNames.add(normalizedTitle);
  }
  return {retained,metadata,rowsRead,rejected};
}

const options=parseArgs(process.argv.slice(2));
const existing=await existingIdentitySets();
const imageResult=await loadEligibleImages(existing,options);
const objectResult=await collectCandidates(imageResult.images,existing,options);
const sourcePath=resolve(options.outputDir,'stage-3000-source-nga.jsonl');
const reportPath=resolve(options.outputDir,'stage-3000-acquisition-nga.json');
const complete=objectResult.retained.length===options.limit;
const report={
  version:'stage-3000-acquisition-nga-v1',
  status:complete?'complete':'partial',
  observed_on:observedOn,
  backend:'official_downloadable_csv',
  provider,
  repository_url:repositoryUrl,
  source_files:[imageResult.metadata,objectResult.metadata],
  image_policy_url:policyUrl,
  license,
  license_url:licenseUrl,
  target_candidates:options.limit,
  retained_candidates:objectResult.retained.length,
  shortfall:Math.max(0,options.limit-objectResult.retained.length),
  max_image_rows:options.maxImageRows,
  object_rows_read:objectResult.rowsRead,
  buffered_reaction_images:imageResult.images.size,
  image_buffer_target:imageResult.bufferTarget,
  image_rows_read:imageResult.rowsRead,
  image_rejections:imageResult.rejected,
  object_rejections:objectResult.rejected,
  existing_names_checked:existing.names.size,
  existing_image_urls_checked:existing.imageUrls.size,
  existing_nga_source_ids_checked:existing.sourceIds.size,
  uniqueness_checks:['NGA object ID plus published image UUID','normalized title against current and staged catalogues','exact derived IIIF image URL against current and staged catalogues','one primary image per NGA object'],
  filters:['object must be accessioned and non-virtual','classification must be drawing, painting, photograph, print, sculpture, or decorative art','published image openaccess must equal 1','viewtype must equal primary','both image dimensions must be at least 400 pixels','title and assistive text must pass a conservative explicit-sensitivity filter','assistive text must be at least 60 characters and contain a person, animal, action, emotion, or social-interaction signal'],
  output_schema:['proposed_id','source_id','name','title','categories','image_url','image_width','image_height','assistive_text','creator','object_date','medium','classification','credit_line','object_url','provider','source_url','catalogue_url','observed_on','rights_status','license','license_url','credit','provenance','review_status','human_validated'],
  uncertainty:'These are licensed source candidates, not live meme records. The metadata filters reduce obvious sensitivity and low-context images, but meme meaning, delivery fitness, perceptual duplicates, cultural context, and audience suitability still require human review.'
};

await mkdir(options.outputDir,{recursive:true});
await Promise.all([
  writeFile(sourcePath,`${objectResult.retained.map(record=>JSON.stringify(record)).join('\n')}\n`),
  writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`)
]);

console.log(JSON.stringify({status:complete?'acquired':'partial',provider,target:options.limit,retained:objectResult.retained.length,shortfall:report.shortfall,object_rows:objectResult.rowsRead,image_rows:imageResult.rowsRead,image_rejections:imageResult.rejected,object_rejections:objectResult.rejected,output:sourcePath,report:reportPath},null,2));
if(!complete) process.exitCode=1;
