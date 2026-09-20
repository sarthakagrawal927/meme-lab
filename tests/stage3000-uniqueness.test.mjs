import test from 'node:test';
import assert from 'node:assert/strict';
import {auditUniqueness,canonicalizeUrl,hammingDistanceHex,nameAliasKeys,normalizeName} from '../scripts/audit-stage-3000-uniqueness.mjs';

test('canonical image URLs collapse provider transforms and tracking noise',()=>{
  assert.equal(
    canonicalizeUrl('https://www.i.imgflip.com/4/abc123.jpg?width=500&utm_source=test',{image:true}),
    'https://i.imgflip.com/abc123.jpg'
  );
  assert.equal(canonicalizeUrl('https://example.test/a.png?b=2&a=1',{image:true}),'https://example.test/a.png?a=1&b=2');
});

test('name normalization decodes entities and generates conservative alias keys',()=>{
  assert.equal(normalizeName('They&#039;re The Same Picture'),"they re the same picture");
  assert.deepEqual(nameAliasKeys({name:'Woman Yelling at a Cat'}).loose,['at cat woman yelling']);
  assert.deepEqual(nameAliasKeys({name:'Cat',aliases:['Judgmental Cat Meme']}).strict,['cat','judgmental cat meme']);
});

test('hamming distance accepts equal-length hexadecimal hashes only',()=>{
  assert.equal(hammingDistanceHex('0f','0e'),1);
  assert.equal(hammingDistanceHex('ffff','0000'),16);
  assert.equal(hammingDistanceHex('0f','000f'),Number.POSITIVE_INFINITY);
});

test('audit separates blocking identities from review-only perceptual and semantic candidates',()=>{
  const references=[{
    id:'known-cat',
    name:'Woman Yelling At Cat',
    image_url:'https://i.imgflip.com/abc.jpg',
    provider:'Provider',
    source_id:'1',
    message:'Accusing someone while another person reacts with visible confusion.',
    relational_pattern:'One person confronts another who cannot understand the accusation.',
    example_context:'A roommate blames the cat for moving the missing keys.',
    tags:['accusation','confusion']
  },{
    id:'known-plan',
    name:'Detailed Plan',
    image_url:'https://images.example/plan.png',
    message:'A complicated plan falls apart because everyone ignored the obvious flaw.',
    relational_pattern:'A group confidently commits to a plan with a visible failure point.',
    example_context:'The launch checklist forgets to include the application itself.',
    tags:['planning','failure']
  }];
  const targets=[{
    proposed_id:'new-cat',
    name:'Woman Yelling at a Cat Template',
    image_url:'https://i.imgflip.com/4/abc.jpg?width=800',
    provider:'Other',
    source_id:'9',
    message:'One person makes an accusation while the other reacts in total confusion.',
    relational_pattern:'A confrontation leaves its target unable to understand the accusation.',
    example_context:'Someone insists the cat deliberately hid a set of keys.',
    tags:['confusion','accusation']
  }];
  const fingerprints=[
    {image_url:'https://i.imgflip.com/abc.jpg',sha256:'one',dhash:'0000000000000000'},
    {image_url:'https://i.imgflip.com/4/abc.jpg?width=800',sha256:'two',dhash:'0000000000000001'}
  ];
  const report=auditUniqueness({targets,references,fingerprints,semanticThreshold:0.3});
  assert.equal(report.conflicts.exact_image_url.length,0);
  assert.equal(report.conflicts.canonical_image_url.length,1);
  assert.equal(report.conflicts.alias_name.length,1);
  assert.equal(report.conflicts.near_semantic_metadata.length,1);
  assert.equal(report.conflicts.perceptual_image.length,1);
  assert.equal(report.summary.incomplete_fingerprint_coverage,false);
  assert.equal(report.summary.incomplete_semantic_coverage,false);
  assert.equal(report.summary.blocked_targets,1);
  assert.equal(report.summary.eligible_after_hard_blocks,0);
});

test('audit reports missing perceptual and semantic evidence instead of claiming uniqueness',()=>{
  const report=auditUniqueness({targets:[{proposed_id:'raw',name:'Raw Candidate',image_url:'https://example.test/raw.jpg'}]});
  assert.equal(report.summary.blocked_targets,0);
  assert.equal(report.summary.incomplete_fingerprint_coverage,true);
  assert.equal(report.summary.incomplete_semantic_coverage,true);
});

test('hard target-to-target duplicates keep one deterministic survivor',()=>{
  const targets=[
    {proposed_id:'first',name:'First',image_url:'https://example.test/first.jpg'},
    {proposed_id:'second',name:'Second',image_url:'https://example.test/second.jpg'}
  ];
  const fingerprints=[
    {image_url:targets[0].image_url,sha256:'same',phash:'0000000000000000'},
    {image_url:targets[1].image_url,sha256:'same',phash:'0000000000000000'}
  ];
  const report=auditUniqueness({targets,fingerprints});
  assert.deepEqual(report.summary.blocked_target_ids,['second']);
  assert.equal(report.summary.eligible_after_hard_blocks,1);
});
