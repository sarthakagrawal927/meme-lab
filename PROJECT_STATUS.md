# Meme Lab project status

**Updated:** 20 September 2026  
**Lifecycle:** Live personal meme picker with an evidence-labelled evaluation pipeline.

## Live product

- Paste one complete comment or situation and receive the best meme first, up to two alternatives, a Jev fit score, and confidence.
- Multi-person comments now return distinct viewpoints where available: **My reaction**, **Their side**, and **The situation**.
- Browse and search 3,000 live references in a paginated collection.
- See meme strength and image quality separately from contextual fit. Relevance chooses the eligible three; static scores only break close calls.
- Serious help, safety, care, grief, apology, and factual-guidance requests are guarded before humour is considered.
- One-tap feedback is retained for 30 days.

## How 3,000 was built

- The original 1,000 references remain intact.
- The stage-3,000 source pool contained 2,227 candidates: 827 canonical meme templates and 1,400 National Gallery of Art CC0 open originals.
- Exact URLs, perceptual hashes, normalized names, aliases, and local CLIP image embeddings check uniqueness. Six hard duplicates and ten near-copy embedding candidates are excluded.
- Local quantized CLIP scores reaction usefulness, image quality, and embedding uniqueness. The final 2,000 additions are selected from the remaining buffer.
- Local Qwen writes meaning-specific message, social-dynamic, example, near-miss, and tag metadata. These annotations are assistant-authored and remain pending owner feedback.
- Production still uses bounded retrieval: two BGE embedding views return 30 candidates, with ten shortlist slots reserved for the original 1,000. Jev ranks ordinary comments once and multi-person comments through three parallel perspective lenses. Its scores return directly; general alternatives below 10/100 and perspective alternatives below 25/100 are omitted. The 70B Workers AI selector runs only when classifier ranking fails.

## Evaluation

- The existing fresh 60-case shadow set remains the independent regression check: 45 humour and 15 no-meme prompts.
- Stage 3,000 adds 40 long-tail cases for a 100-case suite: 30 humour and 10 no-meme cases.
- On the assistant-authored labels, the final gate reached 72% retrieval-at-30, 67% top-one, 71% top-three, and 96% correct serious-content abstention. The fresh long-tail slice reached 93% retrieval and top-three; when an acceptable meme reached retrieval, reranking placed one in the top three 98% of the time.
- Labels are assistant-authored and not human validated. Metrics are directional until owner feedback accumulates.
- A focused 14-case routing set now covers multi-person situations, quoted first-person speech, inanimate pronouns, and negation. It checks when perspective mode should and should not run; the labels remain assistant-authored pending owner review.
- Release proof requires 3,000 catalogue records, 6,000 indexed vectors, passing package checks, a healthy public route, and browser verification.

## Next stage

- Keep improving misses from live feedback and the 100-case evaluation set.
- At 30,000, add movie-dialogue reactions as a separate corpus and route each input to meme, dialogue, or none before corpus-specific retrieval.

Tracking: [public beta #1](https://github.com/sarthakagrawal927/meme-lab/issues/1), [catalogue expansion #2](https://github.com/sarthakagrawal927/meme-lab/issues/2).
