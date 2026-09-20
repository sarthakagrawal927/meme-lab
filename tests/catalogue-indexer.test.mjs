import test from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';

const stage3000Url=new URL('../worker/tools/stage-3000-catalogue.json',import.meta.url);
let indexer;
try {
  await access(stage3000Url);
  indexer=await import('../worker/tools/catalogue-indexer.mjs');
} catch {}

test('catalogue indexer selects only explicit supported stages',{skip:indexer?false:'stage-3000 catalogue has not been generated yet'},()=>{
  assert.deepEqual({stage:indexer.configuredCatalogue({}).stage,records:indexer.configuredCatalogue({}).records.length},{stage:300,records:300});
  assert.deepEqual({stage:indexer.configuredCatalogue({CATALOGUE_STAGE:'1000'}).stage,records:indexer.configuredCatalogue({CATALOGUE_STAGE:'1000'}).records.length},{stage:1000,records:1000});
  assert.deepEqual({stage:indexer.configuredCatalogue({CATALOGUE_STAGE:'3000'}).stage,records:indexer.configuredCatalogue({CATALOGUE_STAGE:'3000'}).records.length},{stage:3000,records:3000});
  assert.throws(()=>indexer.configuredCatalogue({CATALOGUE_STAGE:'unexpected'}),/Unsupported catalogue stage/);
});

test('stage-3000 seeding marks the first thousand records as core',{skip:indexer?false:'stage-3000 catalogue has not been generated yet'},async()=>{
  const upserts=[];
  const env={
    CATALOGUE_STAGE:'3000',
    AI:{run:async(_model,input)=>({data:input.text.map(()=>[1,0,0])})},
    MEME_INDEX:{
      deleteByIds:async()=>({count:0}),
      upsert:async entries=>{upserts.push(...entries);return{count:entries.length};}
    }
  };
  const response=await indexer.default.fetch(new Request('https://example.test/seed?start=999&limit=2',{method:'POST'}),env);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.deepEqual({start:body.range_start,end:body.range_end,upserted:body.upserted},{start:999,end:1001,upserted:4});
  assert(upserts.slice(0,2).every(entry=>entry.metadata.core===true));
  assert(upserts.slice(2).every(entry=>entry.metadata.core===false));
});

test('stage-3000 hybrid queries broad and core meaning/example views',{skip:indexer?false:'stage-3000 catalogue has not been generated yet'},async()=>{
  const filters=[];
  const env={
    CATALOGUE_STAGE:'3000',
    AI:{run:async()=>({data:[[1,0,0]]})},
    MEME_INDEX:{query:async(_vector,options)=>{
      filters.push(options.filter);
      const id=options.filter.core?'core':'broad';
      return {matches:[{id:`${id}-${options.filter.view}`,score:.9,metadata:{catalogue_id:id,view:options.filter.view,...(options.filter.core?{core:true}:{})}}]};
    }}
  };
  const response=await indexer.default.fetch(new Request('https://example.test/query?q=surprise&topK=30&hybrid=1'),env);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.core_reserve,10);
  assert.equal(body.control_reserve,0);
  assert.deepEqual(filters,[{view:'meaning'},{view:'example'},{core:true,view:'meaning'},{core:true,view:'example'}]);
  assert.deepEqual(body.matches.map(match=>match.id),['broad','core']);
});
