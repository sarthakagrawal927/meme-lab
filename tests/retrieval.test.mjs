import test from 'node:test';
import assert from 'node:assert/strict';
import {directRetriever,semanticRetriever} from '../worker/src/retrieval.mjs';

const catalogue=[
  {id:'waiting-skeleton',name:'Waiting Skeleton'},
  {id:'this-is-fine',name:'This Is Fine'},
  {id:'facepalm',name:'Facepalm'}
];

test('direct retrieval preserves the seed control catalogue',async()=>{
  assert.equal(await directRetriever(catalogue)(),catalogue);
});

test('semantic retrieval returns bounded, known, distinct records in score order',async()=>{
  let receivedTopK;
  const retrieve=semanticRetriever({
    catalogue,
    limit:2,
    embed:async text=>{assert.equal(text,'still waiting');return[0.1,0.2,0.3];},
    query:async(vector,options)=>{assert.deepEqual(vector,[0.1,0.2,0.3]);receivedTopK=options.topK;return[{id:'waiting-skeleton'},{id:'unknown'},{id:'waiting-skeleton'},{id:'facepalm'}];}
  });
  assert.deepEqual((await retrieve('still waiting')).map(record=>record.id),['waiting-skeleton','facepalm']);
  assert.equal(receivedTopK,2);
});

test('semantic retrieval rejects invalid vectors and empty known results',async()=>{
  await assert.rejects(semanticRetriever({catalogue,embed:async()=>[],query:async()=>[]})('hello'),/invalid vector/);
  await assert.rejects(semanticRetriever({catalogue,embed:async()=>[1],query:async()=>[{id:'unknown'}]})('hello'),/no known/);
});
