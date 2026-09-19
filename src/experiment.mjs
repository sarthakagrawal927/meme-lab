import { randomInt } from 'node:crypto';

export const representations = ['minimal', 'enriched'];

export function experimentSeed(value) {
  if (value === undefined || value === null) return randomInt(0, 2 ** 31);
  if (!Number.isSafeInteger(value) || value < 0 || value >= 2 ** 31) throw new Error('Experiment seed must be an integer from 0 to 2147483647.');
  return value;
}

export function orderedRepresentations(seed) {
  return seed % 2 === 0 ? [...representations] : [...representations].reverse();
}

export function blindArm(run, blindId, catalogue) {
  const arm = {blind_id: blindId, run_id: run.id, status: run.status, duration_ms: run.duration_ms};
  if (run.status !== 'ok') return {...arm, error: run.error};
  return {
    ...arm,
    decision: run.selection.decision,
    candidates: run.selection.candidates.map((candidate, index) => ({
      id: candidate.id,
      name: catalogue.find(record => record.id === candidate.id)?.name ?? candidate.id,
      rank: index + 1
    }))
  };
}

export function latestExperimentReviews(events, experimentId) {
  const latest = new Map();
  for (const event of events) {
    if (event.event_type === 'experiment_review' && event.experiment_id === experimentId) latest.set(event.blind_id, event);
  }
  return latest;
}

export function summarizeExperiments(events) {
  const runs = new Map(events.filter(event => event.event_type === 'run').map(event => [event.id, event]));
  const experiments = events.filter(event => event.event_type === 'experiment');
  const conditions = Object.fromEntries(representations.map(representation => [representation, {
    runs: 0, ok: 0, reviewed: 0, meme_decisions: 0, none_decisions: 0,
    humour_reviewed: 0, top_one_sendable: 0, top_three_sendable: 0,
    no_meme_cases: 0, correct_abstentions: 0, inappropriate_joking: 0,
    durations_ms: []
  }]));
  let fullyReviewed = 0;
  for (const experiment of experiments) {
    const reviews = latestExperimentReviews(events, experiment.experiment_id);
    const successfulArms = experiment.arms.filter(arm => runs.get(arm.run_id)?.status === 'ok');
    if (successfulArms.length === experiment.arms.length && successfulArms.every(arm => reviews.has(arm.blind_id))) fullyReviewed += 1;
    for (const arm of experiment.arms) {
      const run = runs.get(arm.run_id);
      const condition = conditions[arm.representation];
      condition.runs += 1;
      if (!run || run.status !== 'ok') continue;
      condition.ok += 1;
      condition.durations_ms.push(run.duration_ms);
      condition[run.selection.decision === 'meme' ? 'meme_decisions' : 'none_decisions'] += 1;
      if (experiment.intent_label === 'no_meme') {
        condition.no_meme_cases += 1;
        condition[run.selection.decision === 'none' ? 'correct_abstentions' : 'inappropriate_joking'] += 1;
      }
      const review = reviews.get(arm.blind_id);
      if (!review) continue;
      condition.reviewed += 1;
      if (experiment.intent_label === 'humour') {
        condition.humour_reviewed += 1;
        if (review.verdict === 'send') {
          condition.top_three_sendable += 1;
          if (run.selection.candidates[0]?.id === review.candidate_id) condition.top_one_sendable += 1;
        }
      }
    }
  }
  for (const condition of Object.values(conditions)) {
    condition.durations_ms.sort((a, b) => a - b);
    condition.median_duration_ms = condition.durations_ms.length ? condition.durations_ms[Math.floor((condition.durations_ms.length - 1) / 2)] : null;
    delete condition.durations_ms;
  }
  return {experiments: experiments.length, fully_reviewed: fullyReviewed, conditions};
}
