try {
  const response=await fetch('/expansion-status.json');
  if(!response.ok) throw new Error('Expansion status unavailable.');
  const status=await response.json();
  const values={
    live_records:status.live_records,
    sourced_records:status.sourced_records,
    records_to_source:status.records_to_source,
    eval_cases:status.eval.pending_owner_review_total,
    eval_humour:status.eval.humour,
    eval_no_meme:status.eval.no_meme,
    eval_expansion:status.eval.expansion_cases??0,
    ultimate_target:status.ultimate_target.toLocaleString('en-US'),
    records_to_ultimate_target:status.records_to_ultimate_target.toLocaleString('en-US'),
    ultimate_progress_percent:status.ultimate_progress_percent
  };
  for(const [name,value] of Object.entries(values)) {
    for(const element of document.querySelectorAll(`[data-status="${name}"]`)) element.textContent=String(value);
  }
  const ultimateProgress=document.querySelector('#ultimate-progress');
  if(ultimateProgress) ultimateProgress.style.width=`${status.ultimate_progress_percent}%`;
  const progress=document.querySelector('#expansion-progress');
  if(progress) {
    const source=status.stage_3000_source;
    progress.textContent=source
      ? source.status==='live'
        ? `${status.live_records} references are live. The 2,000 additions passed local strength, image-quality, perceptual-hash, and CLIP embedding checks; their semantic metadata was generated locally and remains pending owner feedback.`
        : source.remaining_source_gap===0
        ? `${status.live_records} references are live. The raw source gap is closed: ${source.raw_source_records} candidates are acquired, ${source.unique_after_hard_blocks} survive hard duplicate checks, and ${source.visual_review_candidates} fuzzy matches need review before semantic curation.`
        : `${status.live_records} references are live. ${source.raw_source_records} raw candidates are acquired: ${source.unique_after_hard_blocks} remain after hard duplicate checks, ${source.visual_review_candidates} need visual review, and ${source.remaining_source_gap} more unique sources are still needed for the ${status.next_target}-reaction stage.`
      : `${status.live_records} references are live in the personal tool. ${status.records_to_source} more sourced records would reach the ${status.next_target}-meme stage.`;
  }
  const evalStatus=document.querySelector('#eval-status');
  const experiment=status.latest_experiment;
  if(evalStatus&&experiment) {
    const percent=value=>`${Math.round(value*100)}%`;
    const stage3000=status.latest_stage_3000_experiment;
    const stage1000=status.latest_stage_1000_experiment;
    const stage=experiment.stage_300;
    const coverage=status.latest_expansion_coverage_experiment;
    evalStatus.innerHTML=stage3000
      ? `<strong>Current 100-case set:</strong> retrieval reached ${percent(stage3000.relevance.retrieval_at_30)} at 30, ${percent(stage3000.relevance.top_1)} top-one relevance, and ${percent(stage3000.relevance.top_3)} top-three relevance. The serious-content gate reached ${percent(stage3000.safety.correct_abstention)} correct abstention. The prior-shadow and new long-tail slices remain visible separately; all labels still need owner review.`
      : stage1000
      ? `<strong>Fresh shadow set:</strong> dual-view retrieval reached ${percent(stage1000.shadow_relevance.retrieval_at_30)} retrieval, ${percent(stage1000.shadow_relevance.top_1)} top-one relevance, ${percent(stage1000.shadow_relevance.top_3)} top-three relevance, and ${percent(stage1000.shadow_safety.correct_abstention)} correct serious-content abstention. The separate tuned regression set remains at ${percent(stage1000.tuned_regression.top_3)} top-three. All assistant-authored labels still need owner review.`
      : coverage
      ? `<strong>Latest draft:</strong> the 300 path reached ${percent(stage.top_3)} top-three relevance and ${percent(stage.correct_abstention)} correct abstention on the original cases. A meaning-specific metadata pilot reached ${percent(coverage.metrics.retrieval_at_30)} expansion-only retrieval and ${percent(coverage.metrics.top_3)} top-three relevance. A classifier bake-off now guides the 3,000-to-30,000 pipeline. The personal tool is live; these assistant-authored labels guide continued tuning.`
      : `<strong>Latest draft:</strong> the 300 path reached ${percent(stage.top_3)} top-three relevance and ${percent(stage.correct_abstention)} correct abstention on assistant-authored labels. The personal tool remains live while evaluation improves it.`;
  }
} catch(error) {
  console.warn(error.message);
}
