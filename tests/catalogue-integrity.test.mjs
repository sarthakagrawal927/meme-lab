import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalCoverage,catalogueIntegrity,normalizeMedia} from '../src/catalogue-integrity.mjs';

test('media normalization preserves images and makes GIF delivery explicit',()=>{
  const image=normalizeMedia({id:'still',image_url:'https://example.com/still.jpg'});
  assert.deepEqual({type:image.media_type,url:image.media_url,preview:image.preview_url,mime:image.mime_type},{type:'image',url:'https://example.com/still.jpg',preview:'https://example.com/still.jpg',mime:'image/jpeg'});
  const gif=normalizeMedia({id:'moving',media_type:'gif',media_url:'https://example.com/moving.gif',preview_url:'https://example.com/poster.gif',mime_type:'image/gif'});
  assert.equal(gif.image_url,gif.media_url);
  assert.throws(()=>normalizeMedia({id:'bad',media_type:'video',media_url:'https://example.com/file.mp4'}),/unsupported media type/);
});

test('canonical coverage reports gaps and resolves aliases',()=>{
  const report=canonicalCoverage([{id:'gif-jeff',name:'22 Jump Street Jeff',message:'An awkward introduction.',tags:['channing tatum']}],{version:'v1',items:[
    {id:'my-name-is-jeff',name:'My Name Is Jeff',aliases:['22 jump street']},
    {id:'this-is-fine',name:'This Is Fine',aliases:['this is fine dog']}
  ]});
  assert.equal(report.covered,1);
  assert.equal(report.missing,1);
  assert.equal(report.items[0].catalogue_id,'gif-jeff');
  assert.equal(report.items[1].status,'missing');
});

test('catalogue integrity rejects artwork filler and counts media types',()=>{
  const report=catalogueIntegrity([
    {id:'still',media_type:'image',media_status:'source-preview'},
    {id:'gif',media_type:'gif',media_status:'source-preview',provenance:{provider:'GIF Reply dataset / GIPHY'}}
  ]);
  assert.deepEqual(report.media_types,{image:1,gif:1});
  assert.throws(()=>catalogueIntegrity([{id:'nga-1',media_type:'image'}]),/Artwork filler/);
});
