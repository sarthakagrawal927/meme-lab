import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeStage3000Metadata,validateStage3000MetadataQuality} from '../src/stage3000-metadata.mjs';

test('stage-3000 metadata repair replaces fragments and placeholder tags with complete specific sentences',()=>{
  const candidate={name:'Bonk',categories:['reaction','impact']};
  const normalized=normalizeStage3000Metadata({message:'Use Bonk when.',relational_pattern:'.',example_context:'.',near_miss_context:'.',tags:['tags here... 3-6 lowercase, no','spaces','or']},candidate);
  assert.match(normalized.message,/^Use Bonk when .{30,}[.]$/);
  assert.match(normalized.relational_pattern,/Bonk frames/);
  assert.match(normalized.example_context,/^For example,/);
  assert.match(normalized.near_miss_context,/^Avoid Bonk/);
  assert.deepEqual(normalized.tags,['reaction','impact','social contrast']);
  assert.deepEqual(validateStage3000MetadataQuality([{id:'bonk',name:'Bonk',...normalized}]),{records:1});
});

test('stage-3000 metadata repair preserves complete model-authored sentences',()=>{
  const metadata={
    message:'Use Tired Dog when a small task feels exhausting before it has even properly started.',
    relational_pattern:'Visible exhaustion meets an expectation that everyone else considers routine and manageable.',
    example_context:'For example, send Tired Dog when the first calendar invite already drains the whole team.',
    near_miss_context:'Avoid Tired Dog when the person is energized and genuinely eager to take on the work.',
    tags:['exhaustion','work','reluctance']
  };
  assert.deepEqual(normalizeStage3000Metadata(metadata,{name:'Tired Dog',categories:[]}),metadata);
});
