import test from 'node:test';
import assert from 'node:assert/strict';
import {linkDialogueSources,normalizeDialogueTitle,quoteSimilarity,summarizeDialogueLinks} from '../src/dialogue-linkage.mjs';

const provenance={provider:'test',source_url:'https://example.com'};

test('dialogue linkage normalizes film suffixes without merging different titles',()=>{
  assert.equal(normalizeDialogueTitle('The Thing (1982 film)'),'thing');
  assert.notEqual(normalizeDialogueTitle('Thing Two'),normalizeDialogueTitle('The Thing (film)'));
});

test('quote similarity accepts punctuation edits and rejects shallow overlap',()=>{
  assert.equal(quoteSimilarity("I say, let 'em crash.","I say let 'em crash!"),1);
  assert(quoteSimilarity('You do not get to tell me what to do again.','You do not get to tell me what to do ever again.')>.8);
  assert(quoteSimilarity('I am ready.','I am not ready.')<.8);
});

test('linkage keeps traceable exact and conservative near matches',()=>{
  const cornell=[
    {id:'c1',work_title:'Airplane',quote:"They knew what they were getting into. I say, let 'em crash.",provenance},
    {id:'c2',work_title:'Other Film',quote:'I am ready.',provenance}
  ];
  const wikiquote=[
    {id:'w1',work_title:'Airplane! (film)',quote:"They knew what they were getting into. I say let 'em crash!",provenance},
    {id:'w2',work_title:'Other Film',quote:'I am not ready.',provenance}
  ];
  const links=linkDialogueSources(cornell,wikiquote);
  assert.equal(links.length,1);
  assert.equal(links[0].match_kind,'exact_normalized_quote');
  assert.deepEqual(summarizeDialogueLinks(links),{linked_quotes:1,linked_films:1,exact_normalized_quotes:1,near_quotes:0});
});
