import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WIKIQUOTE_FILM_INDEXES,
  auditDialogueDuplicates,
  dialogueScreeningSignals,
  parseWikiquoteFilmPage,
  selectStratifiedFilmTitles,
  stripDialogueStageDirections,
  stripWikiMarkup,
  summarizeDialogueScreeningModel,
  summarizeDialogueReviews,
  validateDialogueReviewBatch
} from '../src/dialogue-expansion.mjs';

const page={
  title:'Example Film',
  pageid:42,
  revid:84,
  timestamp:'2026-09-22T00:00:00Z',
  observedOn:'2026-09-22',
  wikitext:`Intro text.
== Alice ==
* '''This''' is a clear standalone quotation.
** A source note that is not dialogue.
== Dialogue ==
:''[Alice enters the room]''
:'''Alice''': I knew you would come back!
:'''Bob''': But this sentence trails away...
== Misattributed ==
* This must never be retained.
== Cast ==
* Actor — Alice
== External links ==
* [https://example.com Site]`
};

test('Wikiquote parser keeps character quotes and attributed dialogue only',()=>{
  const parsed=parseWikiquoteFilmPage(page);
  assert.equal(parsed.raw_candidate_lines,3);
  assert.deepEqual(parsed.candidates.map(record=>record.speaker),['Alice','Alice','Bob']);
  assert.deepEqual(parsed.candidates.map(record=>record.quote),['This is a clear standalone quotation.','I knew you would come back!','But this sentence trails away...']);
  assert(parsed.candidates.every(record=>record.provenance.revision_id===84&&record.human_validated===false));
  assert(!parsed.candidates.some(record=>/never be retained|Actor|Site/.test(record.quote)));
});

test('Wikiquote parser removes nested dialogue colons and rejects cast-list bullets',()=>{
  const parsed=parseWikiquoteFilmPage({
    title:'Formatting Test',
    pageid:1,
    revid:2,
    timestamp:'2026-01-01T00:00:00Z',
    observedOn:'2026-01-02',
    wikitext:[
      '== Dialogue ==',
      ":'''Alex''': : This should start with words, not markup.",
      '== Supporting ==',
      '* - Supporting Actor'
    ].join('\n')
  });
  assert.equal(parsed.candidates[0].quote,'This should start with words, not markup.');
  assert.equal(parsed.rejections[0].rejection,'nested_list_or_cast_entry');
});

test('markup stripping preserves link labels and removes directions and formatting',()=>{
  assert.equal(stripWikiMarkup("'''Wait''' for [[The Return|the answer]] ''[quietly]'' &mdash; now."),'Wait for the answer — now.');
});

test('dialogue cleanup removes descriptive stage directions without deleting spoken asides',()=>{
  assert.equal(stripDialogueStageDirections("(On the phone with Michael): It's good to hear your voice."),"It's good to hear your voice.");
  assert.equal(stripDialogueStageDirections("(being pushed) All right, I'm going."),"All right, I'm going.");
  assert.equal(stripDialogueStageDirections('Yes, Sergeant! (Claude and Berger leave the barracks) Sir?'),'Yes, Sergeant! Sir?');
  assert.equal(stripDialogueStageDirections('(Really?) I doubt it.'),'(Really?) I doubt it.');
});

test('Wikiquote parser rejects unmatched quotation marks',()=>{
  const parsed=parseWikiquoteFilmPage({...page,wikitext:'== Alice ==\n* "An acre is the area of a rectangle'});
  assert.equal(parsed.candidates.length,0);
  assert.equal(parsed.rejections[0].rejection,'unbalanced_quotation_mark');
});

test('screening labels complete compact lines above dangling fragments',()=>{
  const complete=dialogueScreeningSignals('I knew you would come back!',{speaker:'Alice'});
  const dangling=dialogueScreeningSignals('But this sentence trails away...',{speaker:'Bob'});
  assert(complete.screening_score>dangling.screening_score);
  assert.equal(complete.high_signal,true);
  assert.equal(dangling.dangling_fragment,true);
});

test('stratified sampling is deterministic, proportional and unique',()=>{
  const groups=WIKIQUOTE_FILM_INDEXES.map((_,group)=>Array.from({length:(group+1)*20},(_,index)=>`Film ${group}-${String(index).padStart(3,'0')}`));
  const first=selectStratifiedFilmTitles(groups,80);
  const second=selectStratifiedFilmTitles(groups,80);
  assert.deepEqual(first,second);
  assert.equal(first.titles.length,80);
  assert.equal(new Set(first.titles).size,80);
  assert.equal(first.allocations.reduce((sum,count)=>sum+count,0),80);
  assert(first.allocations.at(-1)>first.allocations[0]);
});

test('duplicate audit removes exact text and flags close variants',()=>{
  const records=[
    {id:'a',quote:'I will always come back for you.'},
    {id:'b',quote:'I will always come back for you!'},
    {id:'c',quote:'I will always come back for all of you.'},
    {id:'d',quote:'This is an unrelated reaction.'}
  ];
  const audit=auditDialogueDuplicates(records,{nearThreshold:0.7});
  assert.equal(audit.unique.length,3);
  assert.equal(audit.exact.length,1);
  assert(audit.near.some(pair=>pair.left_id==='a'&&pair.right_id==='c'));
});

test('local dialogue reviews are validated and summarized against a strict gate',()=>{
  const value={reviews:[
    {id:'good',standalone:4,sendable:4,emotional_clarity:3,memorable_phrasing:3,context_dependence:2,reason:'A clear reaction that works without its original scene.'},
    {id:'weak',standalone:1,sendable:1,emotional_clarity:1,memorable_phrasing:1,context_dependence:4,reason:'The fragment depends entirely on missing scene context.'}
  ]};
  const reviews=validateDialogueReviewBatch(value,new Set(['good','weak']));
  assert.equal(reviews[0].passes_quality_gate,true);
  assert.equal(reviews[1].passes_quality_gate,false);
  assert.deepEqual(summarizeDialogueReviews(reviews),{
    reviewed:2,
    passed:1,
    pass_rate:0.5,
    average_scores:{standalone:2.5,sendable:2.5,emotional_clarity:2,memorable_phrasing:2,context_dependence:3,quality_score:50}
  });
  assert.throws(()=>validateDialogueReviewBatch({reviews:[{...value.reviews[0],id:'unknown'}]},new Set(['good'])),/unknown/);
});

test('screening-model summary flags collapsed local classifiers',()=>{
  const collapsed=Array.from({length:20},(_,index)=>({keep:index!==0,standalone:'strong',strength:index===0?'generic':'memorable'}));
  const summary=summarizeDialogueScreeningModel(collapsed);
  assert.equal(summary.status,'degenerate_distribution');
  assert.equal(summary.keep_rate,.95);
  assert(summary.warnings.includes('keep_rate_above_90_percent'));
  assert(summary.warnings.includes('standalone_label_concentration_above_90_percent'));
});
