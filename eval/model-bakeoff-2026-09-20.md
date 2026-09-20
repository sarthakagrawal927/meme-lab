# Meme Lab model bake-off

**Run:** 20 September 2026  
**Status:** exploratory; the fit-score candidates were rated by independent models blind to scorer output and still need owner review.

## Decision

Keep vector retrieval for candidate discovery and use Jev fast as the live shortlist scorer. Remove generated sentence explanations from the normal interaction path, retain the generative model only as a structural fallback, and use GLiNER only as a possible safety, tone, and social-dynamic feature extractor.

For 30,000 references, route the comment to `meme`, `movie_dialogue`, or `none` before searching. Meme and dialogue records stay in separate corpora, each with its own retrieval and evaluation slice.

## Results

| Arm | Task | Result | Latency | Disposition |
|---|---|---:|---:|---|
| Current Llama 3.3 70B | 300-catalogue relevance | 80% top-three on 20 expansion-only cases | 3.85s p95 | Keep only as structural fallback |
| Dual-view vector top 30 + Jev fast | Fresh 1,000-catalogue shadow relevance | 55.6% top-one; 64.4% top-three; 100% top-three given retrieval | Classifier stage only | Best generalization signal; retrieval remains the bottleneck |
| Dual-view vector top 30 + Jev fast | Tuned 1,000-catalogue regression | 84.4% top-one; 95.6% top-three; 97.7% top-three given retrieval | Classifier stage only | Regression coverage, not an unbiased quality estimate |
| Serious cue + Jev gate | Fresh 1,000-catalogue shadow safety | 100% correct abstention; 0% inappropriate joking; 0% false abstention | Classifier runs on 20% of cases | Live safety path with deterministic factual-request guards |
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
- The original stage-1,000 set was used to repair metadata, so its 97.8% top-three result is now a regression score, not a clean estimate of generalization.
- On the independently drafted and cross-audited shadow set, the old single-view retriever reached 57.8% retrieval, 51.1% top-one, and 55.6% top-three. Dual-view retrieval raised those to 64.4%, 55.6%, and 64.4% without changing the classifier. The labels remain pending owner review.
- Jev placed an acceptable meme in the first three for every shadow case where retrieval found one. That makes retrieval coverage—not shortlist ranking—the clearest current accuracy bottleneck.
- The shadow safety set had 15 serious prompts and 45 humour prompts. The current gate abstained on all 15 serious prompts and allowed all 45 humour prompts, but this is still a small assistant-authored set.
- On the harder end-to-end run, Jev saw the actual vector-retrieved top 30 rather than hand-picked options. It improved top-three coverage from 80% to 90%, while the Jev-to-Llama ensemble improved top one from 75% to 80% but did not improve top three. This supports using Jev as a feature or candidate injection, not pruning the shortlist blindly.
- Jev cannot replace retrieval. The tested API accepts at most 100 labels, so 3,000 or 30,000 records still need vector search first.
- The BGE cross-encoder is cheap and useful for literal semantic relevance, but it does not understand whether humour belongs and cannot write explanations.
- GLiNER extracted useful features such as grief, medical emergency, authority overreach, and pretending everything is fine. Its direct routing score was not strong enough to make the final decision.
- Laya and the local Qwen models were heavily biased toward abstaining. They may improve with supervised examples, but they are not promotion candidates from this run.
- Gemini was not called because no experiment-only Gemini client or credential is configured in the project. The harness should be added only when a bounded credential is deliberately provided.

## Fit-score experiment

The current percentage is Jev's probability within a 30-candidate competition. It is useful for ordering that shortlist, but it is not the probability that a meme is a good reply.

Twelve fixed humour cases were replayed twice. The first audit found and corrected a contradictory evaluation sentence: an expensive refrigerator was described as using “every feature except” the clock when the intended scenario was using no features except the clock. After rebuilding retrieval, five finalist systems produced a 101-pair union. A fresh independent model rated that union from 0 to 4 without seeing arm identity or scorer output.

| Arm | Exact first | Sendable first | Mean first rating | Best returned candidate ranked first | NDCG@5 | Ordinal error | p95 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Current raw 30-way Jev | 7/12 | 9/12 | 3.25 / 4 | 7/12 | 0.895 | 42.1 | 1,270ms |
| Compact ordinal on current five | 8/12 | 10/12 | 3.50 / 4 | 9/12 | 0.930 | 20.4 | 712ms |
| Rich ordinal across all 30 | 9/12 | 10/12 | 3.58 / 4 | 10/12 | 0.950 | 22.7 | 1,600ms |
| Compact ordinal across all 30 | 9/12 | 10/12 | 3.58 / 4 | 9/12 | 0.940 | 21.8 | 1,196ms |
| Specificity-biased ordinal across all 30 | 9/12 | 10/12 | 3.58 / 4 | 9/12 | 0.925 | 22.5 | 1,775ms |

The quality winner is one Jev fast call that independently gives all 30 retrieved candidates one of five ordered fit levels using the full candidate metadata, then returns the best five. It replaces the existing 30-way competition rather than adding another serial model call. Compact metadata is the lower-latency fallback. Balanced pairwise comparisons, calibration examples, extra specificity wording, Qwen 3 4B, and Jev smart did not win; Jev smart alone took 10.2–14.0 seconds.

Do not display any value as a probability yet. The product-safe output is an ordinal phrase such as `weak`, `plausible`, `strong`, or `exact` until owner-reviewed five-level labels support calibration.

## Recommended staged architecture

1. **1,000 → 3,000 memes:** store separate meaning and usage-example vectors, fuse both retrieval lists, independently score all 30 candidates with Jev fast's five ordered fit labels, and return the best five directly. Do not add a generative explanation step to the interactive path.
2. **3,000 → 30,000 reactions:** add `corpus_type`, route to meme/dialogue/none, retrieve within the chosen corpus, then run the same ordinal scoring stage without adding generated explanations to the interactive path.
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
