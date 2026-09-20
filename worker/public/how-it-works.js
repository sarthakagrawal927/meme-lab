try {
  const response=await fetch('/expansion-status.json');
  if(!response.ok) throw new Error('Expansion status unavailable.');
  const status=await response.json();
  const values={
    live_records:status.live_records,
    sourced_records:status.sourced_records,
    records_to_source:status.records_to_source,
    eval_cases:status.eval.cases+(status.eval.expansion_cases??0)+(status.eval.stage_1000_cases??0),
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
    progress.textContent=`${status.live_records} references are live in the personal tool. ${status.records_to_source} more sourced records would reach the ${status.next_target}-meme stage.`;
  }
  const evalStatus=document.querySelector('#eval-status');
  const experiment=status.latest_experiment;
  if(evalStatus&&experiment) {
    const percent=value=>`${Math.round(value*100)}%`;
    const stage1000=status.latest_stage_1000_experiment;
    const stage=experiment.stage_300;
    const coverage=status.latest_expansion_coverage_experiment;
    evalStatus.innerHTML=stage1000
      ? `<strong>Latest draft:</strong> the live 1,000 path reached ${percent(stage1000.jev_ranking.retrieval_at_30)} retrieval, ${percent(stage1000.jev_ranking.top_1)} top-one relevance, ${percent(stage1000.jev_ranking.top_3)} top-three relevance, and ${percent(stage1000.serious_gate.correct_abstention)} correct serious-content abstention. These twice-audited assistant labels still need owner review.`
      : coverage
      ? `<strong>Latest draft:</strong> the 300 path reached ${percent(stage.top_3)} top-three relevance and ${percent(stage.correct_abstention)} correct abstention on the original cases. A meaning-specific metadata pilot reached ${percent(coverage.metrics.retrieval_at_30)} expansion-only retrieval and ${percent(coverage.metrics.top_3)} top-three relevance. A classifier bake-off now guides the 3,000-to-30,000 pipeline. The personal tool is live; these assistant-authored labels guide continued tuning.`
      : `<strong>Latest draft:</strong> the 300 path reached ${percent(stage.top_3)} top-three relevance and ${percent(stage.correct_abstention)} correct abstention on assistant-authored labels. The personal tool remains live while evaluation improves it.`;
  }
} catch(error) {
  console.warn(error.message);
}
