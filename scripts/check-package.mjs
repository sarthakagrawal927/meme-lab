import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { catalogue, poolFor, sources } from '../src/selector.mjs';
const original=new URL('../original/meme_references_v1/',import.meta.url);
const lines=readFileSync(new URL('manifest.sha256',original),'utf8').trim().split('\n');
for(const line of lines){const [hash,name]=line.split(/\s+/);const actual=createHash('sha256').update(readFileSync(new URL(name,original))).digest('hex');assert.equal(actual,hash,`Original integrity mismatch: ${name}`);}
const jsonl=readFileSync(new URL('memes.jsonl',original),'utf8').trim().split('\n').map(JSON.parse);
assert.deepEqual(jsonl,catalogue);assert.equal(catalogue.length,60);assert.equal(poolFor().length,30);assert.equal(sources.length,12);
assert.equal(new Set(catalogue.map(r=>r.family_id)).size,60);
assert(catalogue.every(r=>r.asset.local_file===null&&!r.annotation_provenance.human_validated));
const cases=readFileSync(new URL('../eval/smoke_cases.jsonl',import.meta.url),'utf8').trim().split('\n').map(JSON.parse);
assert.equal(cases.length,20);assert(cases.every(c=>c.human_validated===false&&c.expected_ids===null));
for(const path of ['../PRD.md','../README.md','../AGENT_HANDOFF.md','../docs/research_index.md','../docs/audit_addendum.md','../docs/experiment_protocol.md'])assert(existsSync(new URL(path,import.meta.url)));
console.log(JSON.stringify({status:'passed',original_manifest_entries_verified:lines.length,records:60,reactions:30,templates:30,sources:12,synthetic_smoke_cases:20,media_reaudited:false},null,2));
