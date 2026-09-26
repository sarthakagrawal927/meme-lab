import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonl} from '../src/expansion.mjs';
import {dialogueScreeningSignals} from '../src/dialogue-expansion.mjs';
import {linkDialogueSources,summarizeDialogueLinks} from '../src/dialogue-linkage.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const cornellInput=resolve(root,'expansion/sources/dialogue-cornell-memorable.jsonl');
const wikiquoteInput=resolve(root,'expansion/sources/dialogue-wikiquote-pilot.jsonl');
const candidateInput=resolve(root,'expansion/candidates/dialogue-cornell-reaction-candidates.jsonl');
const output=resolve(root,'expansion/sources/dialogue-cross-source-links.jsonl');
const reportOutput=resolve(root,'expansion/sources/dialogue-cross-source-links-report.json');
const rankedOutput=resolve(root,'expansion/candidates/dialogue-ranked-candidates.jsonl');

const cornell=parseJsonl(await readFile(cornellInput,'utf8'),'Cornell memorable dialogue');
const wikiquote=parseJsonl(await readFile(wikiquoteInput,'utf8'),'Wikiquote dialogue pilot');
const candidates=parseJsonl(await readFile(candidateInput,'utf8'),'Cornell reaction dialogue candidates');
const links=linkDialogueSources(cornell,wikiquote);
const linksById=new Map(links.map(link=>[link.cornell_dialogue_id,link]));
const tierOrder={A:0,B:1,C:2,D:3};
const ranked=candidates.map(record=>{
  const screening=dialogueScreeningSignals(record.quote,{speaker:record.speaker});
  const link=linksById.get(record.id);
  const evidence_tier=link?.match_kind==='exact_normalized_quote'?'A':link?'B':screening.high_signal?'C':'D';
  return {
    ...record,
    screening,
    evidence_tier,
    evidence_label:{A:'cornell_memorable_plus_exact_wikiquote_match',B:'cornell_memorable_plus_near_wikiquote_match',C:'cornell_memorable_plus_high_structural_signal',D:'cornell_memorable_needs_stricter_reaction_review'}[evidence_tier],
    evidence_rank_score:screening.screening_score+(evidence_tier==='A'?15:evidence_tier==='B'?10:0),
    cross_source_corroboration:link?{match_kind:link.match_kind,similarity:link.similarity,wikiquote_dialogue_id:link.wikiquote_dialogue_id,wikiquote_provenance:link.provenance.wikiquote}:null,
    review_status:'evidence_ranked_needs_owner_review',
    human_validated:false,
    production_eligible:false
  };
}).sort((left,right)=>tierOrder[left.evidence_tier]-tierOrder[right.evidence_tier]||right.evidence_rank_score-left.evidence_rank_score||left.id.localeCompare(right.id));
const report={
  version:'dialogue-cross-source-linkage-v1',
  created_at:new Date().toISOString(),
  cornell_records:cornell.length,
  wikiquote_records:wikiquote.length,
  ...summarizeDialogueLinks(links),
  near_match_threshold:.8,
  ranked_candidates:ranked.length,
  evidence_tiers:Object.fromEntries(['A','B','C','D'].map(tier=>[tier,ranked.filter(record=>record.evidence_tier===tier).length])),
  uncertainty:'Cross-source presence is corroboration, not proof of sendability, factual independence, or production rights.',
  production_eligible:false
};
await mkdir(dirname(output),{recursive:true});
await writeFile(output,`${links.map(link=>JSON.stringify(link)).join('\n')}\n`);
await writeFile(rankedOutput,`${ranked.map(record=>JSON.stringify(record)).join('\n')}\n`);
await writeFile(reportOutput,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({...report,output,ranked_output:rankedOutput,report_output:reportOutput},null,2));
