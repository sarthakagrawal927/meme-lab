# Meme Lab model bake-off

**Run:** 20 September 2026  
**Status:** exploratory; the evaluation labels are assistant-authored and still need owner review.

## Decision

Keep vector retrieval for candidate discovery. Trial Jev fast as the shortlist scorer, keep the current generative model for sentence explanations and low-confidence fallback, and use GLiNER only to enrich safety, tone, and social-dynamic metadata.

For 30,000 references, route the comment to `meme`, `movie_dialogue`, or `none` before searching. Meme and dialogue records stay in separate corpora, each with its own retrieval and evaluation slice.

## Results

| Arm | Task | Result | Latency | Disposition |
|---|---|---:|---:|---|
| Current Llama 3.3 70B | 300-catalogue relevance | 80% top-three on 20 expansion-only cases | 3.85s p95 | Keep for explanations and fallback |
| Vector top 30 + Jev fast | 1,000-catalogue relevance | 88.9% top-one; 95.6% top-three; 100% top-three given retrieval | Classifier stage only | Live ranking path; labels pending owner review |
| Serious cue + Jev gate | 1,000-catalogue abstention | 93.3% correct abstention; 6.7% inappropriate joking | Included in gated run | Live safety path with a deterministic factual-request guard |
| Jev 1.13 fast via classifier.dev | Enriched shortlist relevance | 19/20 top-one; repeated run 19/20 top-three | 1.19s wall for 20 inputs | Best candidate for the scoring stage |
| Jev 1.13 fast on real retrieved top 30 | Expansion-only relevance | 70% top-one; 90% top-three; 94.7% top-three given retrieval | 923ms p50, 1.27s p95 | Strong shortlist signal; not the final judge |
| Jev top 12 then current Llama | Expansion-only relevance | 80% top-one; 80% top-three | 3.53s p50, 4.48s p95 | Improves first choice, but pruning loses alternative coverage |
| BGE reranker base | Retrieved shortlist relevance | 20% top-one; 45% top-three | 924ms p50, 1.83s p95 per case | Too lexical/semantic to decide sendability alone |
| GLiNER 2.5 base | Meme vs no-meme gate | 8/12 | 52ms mean per case | Use as a local feature and safety-label extractor |
| Laya SDK 0.3.4 | Meme/dialogue/none route | 8/12 overall, but 0/4 meme cases | ~60ms median | Research only |
| Qwen 3 4B local | Meme vs no-meme gate | 66.7% accuracy; 50% humour recall; 100% abstention | 1.43s p50, 2.45s p95 | Too conservative without tuning |
| Qwen 2.5 3B local | Meme vs no-meme gate | 53.3% accuracy; 30% humour recall; 100% abstention | 922ms p50, 1.53s p95 | Too conservative without tuning |
| Gemini structured output | Planned comparison | Not run | — | Requires an explicitly configured experiment credential |

## What the numbers mean

- Jev was the strongest direct classifier. Metadata mattered: its fast arm improved from 16/20 with names alone to 19/20 with name plus meaning metadata.
- On the 60-case stage-1,000 set, vector retrieval found an acceptable meme for 43 of 45 humour cases. Jev put an acceptable result first for 40 of 45 and in the first three for all 43 retrieved cases. The labels were independently audited twice by assistants and remain pending owner review.
- On the harder end-to-end run, Jev saw the actual vector-retrieved top 30 rather than hand-picked options. It improved top-three coverage from 80% to 90%, while the Jev-to-Llama ensemble improved top one from 75% to 80% but did not improve top three. This supports using Jev as a feature or candidate injection, not pruning the shortlist blindly.
- Jev cannot replace retrieval. The tested API accepts at most 100 labels, so 3,000 or 30,000 records still need vector search first.
- The BGE cross-encoder is cheap and useful for literal semantic relevance, but it does not understand whether humour belongs and cannot write explanations.
- GLiNER extracted useful features such as grief, medical emergency, authority overreach, and pretending everything is fine. Its direct routing score was not strong enough to make the final decision.
- Laya and the local Qwen models were heavily biased toward abstaining. They may improve with supervised examples, but they are not promotion candidates from this run.
- Gemini was not called because no experiment-only Gemini client or credential is configured in the project. The harness should be added only when a bounded credential is deliberately provided.

## Recommended staged architecture

1. **1,000 → 3,000 memes:** enrich metadata, retrieve 30, score with Jev fast, then use the generative model to produce complete sentence explanations without changing the ranked IDs.
2. **3,000 → 30,000 reactions:** add `corpus_type`, route to meme/dialogue/none, retrieve within the chosen corpus, then run the same scoring and explanation stages.
3. **Evaluation:** maintain balanced owner-reviewed cases for meme, dialogue, ambiguous, and none; report per-corpus top-one, top-three, abstention, calibration, and latency.
4. **Copyright boundary:** store short reaction lines, scene/source metadata, and permitted preview assets rather than bulk movie scripts or unlicensed media.

## Reproduce the repository-backed arms

```bash
pnpm exec wrangler dev --remote --config worker/tools/wrangler.jsonc --port 8788
npm run experiment:jev-reranker -- http://127.0.0.1:8788
npm run experiment:jev-ensemble
npm run experiment:bge-reranker -- http://127.0.0.1:8788
npm run experiment:local-router -- qwen3:4b
npm run experiment:local-router -- qwen2.5:3b
```

Generated JSON results remain under `eval/results/` and are intentionally excluded from Git.
