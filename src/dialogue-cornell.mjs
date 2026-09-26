import {createHash} from 'node:crypto';

export const CORNELL_QUOTES_LANDING='https://www.cs.cornell.edu/~cristian/memorability.html';
export const CORNELL_QUOTES_ARCHIVE='https://www.cs.cornell.edu/~cristian/memorability_files/cornell_movie_quotes_corpus.zip';
export const CORNELL_QUOTES_PAPER='https://www.cs.cornell.edu/~cristian/pdfs/memorability.pdf';

export function decodeCornellText(buffer) {
  return new TextDecoder('windows-1252').decode(buffer);
}

function blocks(text,expectedLines,label) {
  return String(text??'').trim().split(/\r?\n\r?\n+/).map((block,index)=>{
    const lines=block.split(/\r?\n/);
    if(lines.length!==expectedLines) throw new Error(`${label} block ${index+1} needs ${expectedLines} lines; found ${lines.length}.`);
    return lines;
  });
}

function lineRecord(value,label) {
  const match=String(value).match(/^(\d+)\s+([\s\S]+)$/);
  if(!match) throw new Error(`${label} needs a numeric line ID and quote text.`);
  return {line_id:match[1],quote:match[2].trim()};
}

export function parseCornellMemorableQuotes(text) {
  return blocks(text,3,'Memorable quote').map(([workTitle,annotationQuote,matchedLine])=>({
    work_title:workTitle.trim(),
    annotation_quote:annotationQuote.trim(),
    matched_line:lineRecord(matchedLine,'Memorable matched line')
  }));
}

export function parseCornellMemorablePairs(text) {
  return blocks(text,4,'Memorability pair').map(([workTitle,annotationQuote,memorableLine,nonMemorableLine])=>({
    work_title:workTitle.trim(),
    annotation_quote:annotationQuote.trim(),
    memorable_line:lineRecord(memorableLine,'Memorable pair line'),
    non_memorable_line:lineRecord(nonMemorableLine,'Non-memorable pair line')
  }));
}

export function parseCornellScriptLine(value) {
  const fields=String(value).split(' +++$+++ ');
  if(fields.length<6) return null;
  const [lineId,workTitle,lineNumber,speaker,replyTo,...textParts]=fields;
  if(!/^\d+$/.test(lineId)) return null;
  return {
    line_id:lineId,
    work_title:workTitle.trim(),
    line_number:Number(lineNumber),
    speaker:speaker.trim(),
    reply_to:replyTo.trim()||null,
    quote:textParts.join(' +++$+++ ').trim()
  };
}

export function normalizedCornellQuote(value) {
  return String(value??'').normalize('NFKC').toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^\p{L}\p{N}']+/gu,' ').trim();
}

export function stableCornellDialogueId(workTitle,lineId,quote) {
  const digest=createHash('sha256').update(`${workTitle}\0${lineId}\0${normalizedCornellQuote(quote)}`).digest('hex').slice(0,12);
  return `dialogue-cornell-${digest}`;
}

export function buildCornellOutputs(memorable,pairs,scriptLines) {
  const records=memorable.map(item=>{
    const script=scriptLines.get(item.matched_line.line_id);
    const quote=item.annotation_quote;
    return {
      id:stableCornellDialogueId(item.work_title,item.matched_line.line_id,quote),
      content_type:'movie_dialogue',
      quote,
      matched_script_quote:item.matched_line.quote,
      speaker:script?.speaker||null,
      work_title:item.work_title,
      memorability_label:'memorable',
      memorability_signal:'listed_on_imdb_memorable_quotes_and_automatically_matched_by_cornell',
      provenance:{
        provider:'Cornell Movie-Quotes Corpus v1.0',
        source_url:CORNELL_QUOTES_LANDING,
        archive_url:CORNELL_QUOTES_ARCHIVE,
        paper_url:CORNELL_QUOTES_PAPER,
        line_id:item.matched_line.line_id,
        release:'2012-07'
      },
      rights_status:'underlying_quote_not_established_dataset_readme_has_no_reuse_license',
      review_status:'research_signal_needs_owner_review',
      human_validated:false,
      production_eligible:false
    };
  });
  const recordByLineId=new Map(records.map(record=>[record.provenance.line_id,record]));
  const pairRows=pairs.map((pair,index)=>{
    const memorableRecord=recordByLineId.get(pair.memorable_line.line_id);
    const memorableScript=scriptLines.get(pair.memorable_line.line_id);
    const nonMemorableScript=scriptLines.get(pair.non_memorable_line.line_id);
    return {
      id:`cornell-memorability-pair-${String(index+1).padStart(4,'0')}`,
      work_title:pair.work_title,
      speaker:memorableScript?.speaker||nonMemorableScript?.speaker||null,
      memorable:{
        dialogue_id:memorableRecord?.id||stableCornellDialogueId(pair.work_title,pair.memorable_line.line_id,pair.annotation_quote),
        annotation_quote:pair.annotation_quote,
        matched_script_quote:pair.memorable_line.quote,
        line_id:pair.memorable_line.line_id
      },
      non_memorable:{quote:pair.non_memorable_line.quote,line_id:pair.non_memorable_line.line_id},
      controls:{reported_same_movie:true,reported_same_speaker:true,reported_same_word_count:true,reported_nearest_available_script_context:true},
      verification:{
        memorable_script_resolved:!!memorableScript,
        non_memorable_script_resolved:!!nonMemorableScript,
        script_speakers_match:memorableScript&&nonMemorableScript?memorableScript.speaker===nonMemorableScript.speaker:null
      },
      label_source:'cornell_imdb_memorable_quote_pairing',
      human_validated:false,
      production_eligible:false
    };
  });
  const seen=new Set();
  const candidates=records.filter(record=>{
    const wordCount=record.quote.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length??0;
    const key=normalizedCornellQuote(record.quote);
    if(!record.speaker||wordCount<3||wordCount>30||seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(record=>({
    ...record,
    word_count:record.quote.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length??0,
    selection_reason:'human_memorability_signal_attributed_unique_3_to_30_words',
    review_status:'reaction_candidate_needs_owner_review'
  }));
  return {records,candidates,pairs:pairRows};
}

export function summarizeCornellOutputs(records,pairs,{candidates=[],requestedLineIds,resolvedLineIds}={}) {
  const quoteKeys=records.map(record=>normalizedCornellQuote(record.quote));
  const duplicateQuotes=quoteKeys.length-new Set(quoteKeys).size;
  const sameSpeakerPairs=pairs.filter(pair=>pair.speaker).length;
  return {
    memorable_records:records.length,
    paired_eval_cases:pairs.length,
    reaction_candidates:candidates.length,
    reaction_candidate_movies:new Set(candidates.map(record=>record.work_title)).size,
    distinct_movies:new Set(records.map(record=>record.work_title)).size,
    unique_normalized_quotes:new Set(quoteKeys).size,
    duplicate_normalized_quotes:duplicateQuotes,
    speaker_coverage:Number((records.filter(record=>record.speaker).length/Math.max(1,records.length)).toFixed(4)),
    paired_speaker_coverage:Number((sameSpeakerPairs/Math.max(1,pairs.length)).toFixed(4)),
    verified_same_speaker_pairs:pairs.filter(pair=>pair.verification.script_speakers_match===true).length,
    unresolved_pair_speaker_checks:pairs.filter(pair=>pair.verification.script_speakers_match===null).length,
    requested_script_line_ids:requestedLineIds??null,
    resolved_script_line_ids:resolvedLineIds??null
  };
}
