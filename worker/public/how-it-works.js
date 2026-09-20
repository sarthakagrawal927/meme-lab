try {
  const response=await fetch('/expansion-status.json');
  if(!response.ok) throw new Error('Expansion status unavailable.');
  const status=await response.json();
  const values={
    live_records:status.live_records,
    sourced_records:status.sourced_records,
    records_to_source:status.records_to_source,
    eval_cases:status.eval.cases+(status.eval.expansion_cases??0),
    eval_humour:status.eval.humour,
    eval_no_meme:status.eval.no_meme,
    eval_expansion:status.eval.expansion_cases??0
  };
  for(const [name,value] of Object.entries(values)) {
    for(const element of document.querySelectorAll(`[data-status="${name}"]`)) element.textContent=String(value);
  }
  const progress=document.querySelector('#expansion-progress');
  if(progress) {
    const pending=status.candidate_records??Math.max(0,status.sourced_records-status.live_records);
    progress.textContent=status.records_to_source===0
      ? `${status.sourced_records} references are sourced: ${status.live_records} live and ${pending} candidates pending metadata, media, and delivery review. The pool is full; promotion now depends on evaluation.`
      : `${status.sourced_records} references are sourced. ${status.records_to_source} more quality records are needed for the ${status.next_target}-reference trial.`;
  }
  const evalStatus=document.querySelector('#eval-status');
  const experiment=status.latest_experiment;
  if(evalStatus&&experiment) {
    const percent=value=>`${Math.round(value*100)}%`;
    const stage=experiment.stage_300;
    const coverage=status.latest_expansion_coverage_experiment;
    evalStatus.innerHTML=coverage
      ? `<strong>Latest draft:</strong> the 300 path reached ${percent(stage.top_3)} top-three relevance and ${percent(stage.correct_abstention)} correct abstention on the original cases, but only ${percent(coverage.metrics.retrieval_at_50)} retrieval and ${percent(coverage.metrics.top_3)} top-three relevance on 20 expansion-only cases. It is not promoted.`
      : `<strong>Latest draft:</strong> the 300 path reached ${percent(stage.top_3)} top-three relevance and ${percent(stage.correct_abstention)} correct abstention on assistant-authored labels. It is not promoted.`;
  }
} catch(error) {
  console.warn(error.message);
}
