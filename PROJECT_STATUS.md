# Meme Lab project status

**Updated:** 20 September 2026  
**Lifecycle:** Live personal meme picker with an evidence-labelled evaluation pipeline.

## Live product

- Paste one complete comment or situation and receive the best meme first, four backups, ordinal fit labels, and honest confidence.
- Multi-person comments now return distinct viewpoints where available: **My reaction**, **Their side**, and **The situation**.
- Browse and search 3,000 live references in a paginated collection.
- See meme strength and image quality separately from contextual fit. Popularity and asset quality do not masquerade as relevance.
- Serious help, safety, care, grief, apology, and factual-guidance requests are guarded before humour is considered.
- One-tap feedback is retained for 30 days.

## How 3,000 was built

- The original 1,000 references remain intact.
- The stage-3,000 source pool contained 2,227 candidates: 827 canonical meme templates and 1,400 National Gallery of Art CC0 open originals.
- Exact URLs, perceptual hashes, normalized names, aliases, and local CLIP image embeddings check uniqueness. Six hard duplicates and ten near-copy embedding candidates are excluded.
- Local quantized CLIP scores reaction usefulness, image quality, and embedding uniqueness. The final 2,000 additions are selected from the remaining buffer.
- Local Qwen writes meaning-specific message, social-dynamic, example, near-miss, and tag metadata. These annotations are assistant-authored and remain pending owner feedback.
- Production still uses bounded retrieval: two BGE embedding views return 30 candidates, with ten shortlist slots reserved for the original 1,000. Jev independently rates all 30 with five ordered fit levels and returns five distinct results. Multi-person comments use three parallel perspective lenses, fill remaining slots with the strongest unused matches, and receive one final ordinal rescore. The UI shows fit labels rather than probabilities. The 70B Workers AI selector runs only when classifier ranking fails.

## Evaluation

- The existing fresh 60-case shadow set remains the independent regression check: 45 humour and 15 no-meme prompts.
- Stage 3,000 adds 40 long-tail cases for a 100-case suite: 30 humour and 10 no-meme cases.
- On the assistant-authored labels, the final gate reached 72% retrieval-at-30, 67% top-one, 71% top-three, and 96% correct serious-content abstention. The fresh long-tail slice reached 93% retrieval and top-three; when an acceptable meme reached retrieval, reranking placed one in the top three 98% of the time.
- Labels are assistant-authored and not human validated. Metrics are directional until owner feedback accumulates.
- A focused 14-case routing set now covers multi-person situations, quoted first-person speech, inanimate pronouns, and negation. It checks when perspective mode should and should not run; the labels remain assistant-authored pending owner review.
- A corrected 12-case hard-ranking set compares five scoring strategies across 101 unique candidate pairs. Blind model review selected rich ordinal Jev: exact first choices improved from 7/12 to 9/12 and the best returned candidate ranked first on 10/12 rather than 7/12. This evidence is independent of scorer output but is not human ground truth.
- Release proof requires 3,000 catalogue records, 6,000 indexed vectors, passing package checks, a healthy public route, and browser verification.

## Next stage

- Keep improving misses from live feedback and the 100-case evaluation set.
- At 30,000, add movie-dialogue reactions as a separate corpus and route each input to meme, dialogue, or none before corpus-specific retrieval.

Tracking: [public beta #1](https://github.com/sarthakagrawal927/meme-lab/issues/1), [catalogue expansion #2](https://github.com/sarthakagrawal927/meme-lab/issues/2).
