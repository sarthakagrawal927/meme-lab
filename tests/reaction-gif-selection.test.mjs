import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanReactionGifOcr,
  gifMeetsReleaseResolution,
  parseReactionGifTags,
  parseGifDimensions,
  rankReactionGifCandidates,
  reactionGifMetadataQuality
} from '../src/reaction-gif-selection.mjs';

test('reaction GIF OCR collapses repeated animation frames',()=>{
  assert.equal(
    cleanReactionGifOcr('[INTER_FRAME_SEP] EXACTLY! [INTER_FRAME_SEP] exactly [INTER_FRAME_SEP] EXACTLY!'),
    'EXACTLY!'
  );
});

test('reaction GIF tags normalize and deduplicate source values',()=>{
  assert.deepEqual(parseReactionGifTags("['Face Palm', 'face-palm', 'I\\'m done']"),['face palm',"i m done"]);
});

test('watermark-only OCR is rejected as low-quality metadata',()=>{
  const result=reactionGifMetadataQuality({tags:[],ocr:'4GIFS.com 4GIFS.com'});
  assert.equal(result.watermarkOnly,true);
  assert.equal(result.score,0);
});

test('normalized domain watermarks are rejected',()=>{
  const result=reactionGifMetadataQuality({tags:[],ocr:'GIFSOUP COM'});
  assert.equal(result.watermarkOnly,true);
  assert.equal(result.score,0);
});

test('quality ranking caps repeated generic semantic buckets',()=>{
  const candidates=Array.from({length:12},(_,index)=>({
    gifId:`hash-${index}`,
    giphyId:`giphy-${index}`,
    usageCount:100-index,
    tags:['laugh','amused'],
    ocr:''
  }));
  candidates.push({gifId:'specific',giphyId:'specific',usageCount:30,tags:['awkward laugh','caught lying','nervous'],ocr:''});
  const result=rankReactionGifCandidates(candidates,{limit:4,maxPerSemanticKey:3});
  assert.equal(result.selected.length,4);
  assert.equal(result.selected.filter(candidate=>candidate.semanticKey==='amused|laugh::').length,3);
  assert.ok(result.selected.some(candidate=>candidate.giphyId==='specific'));
  assert.ok(result.diversitySkips>0);
});

test('quality ranking can require repeated real-world use',()=>{
  const result=rankReactionGifCandidates([
    {gifId:'popular',giphyId:'popular',usageCount:20,tags:['awkward','smile'],ocr:''},
    {gifId:'rare',giphyId:'rare',usageCount:2,tags:['perfect','specific','reaction'],ocr:'Exactly right'}
  ],{limit:1,maxPerSemanticKey:3,minimumUses:15});
  assert.equal(result.selected[0].giphyId,'popular');
  assert.equal(result.eligible,1);
});

test('GIF header parsing and release resolution use actual asset dimensions',()=>{
  const header=Uint8Array.from([71,73,70,56,57,97,224,1,14,1]);
  assert.deepEqual(parseGifDimensions(header),{width:480,height:270});
  assert.equal(gifMeetsReleaseResolution({width:480,height:270}),true);
  assert.equal(gifMeetsReleaseResolution({width:245,height:166}),false);
  assert.equal(parseGifDimensions(Uint8Array.from([0,1,2,3,4,5,6,7,8,9])),null);
});
