# Meme Lab project status

**Updated:** 21 September 2026
**Lifecycle:** Live personal meme picker; corrected meme-and-GIF catalogue prepared locally and pending owner-authorized release.

## Live product

- Paste one complete comment or situation and receive the best meme first, four backups, ordinal fit labels, and honest confidence.
- Multi-person comments now return distinct viewpoints where available: **My reaction**, **Their side**, and **The situation**.
- The production release contains the corrected 3,000-reference snapshot: 1,805 static memes and 1,195 usage-backed reaction GIFs, with no National Gallery artwork or inert editing canvases.
- See meme strength and image quality separately from contextual fit. Popularity and asset quality do not masquerade as relevance.
- Serious help, safety, care, grief, apology, and factual-guidance requests are guarded before humour is considered.
- One-tap feedback is retained for 30 days.

## Correcting the 3,000 catalogue

- An audit found that 1,189 of the earlier 3,000 records were public-domain artworks without evidence of meme use. They are excluded from the corrected catalogue.
- The honest static baseline is 1,805 named meme templates: six blank backgrounds and empty panel layouts were removed after owner feedback.
- The replacement tranche contains 1,195 reaction GIFs. 1,194 come from the GIF Reply research dataset of 1.56 million observed conversation-to-GIF replies, with at least 108 observed uses per selected GIF. “My Name Is Jeff” is an explicit owner-requested canonical entry.
- The catalogue now records `media_type`, full media URL, preview URL, MIME type, source provenance, evidence state, and rights state. GIFs animate in results while collection cards load lighter previews.
- A checked-in 41-item canonical coverage manifest reports recognizable gaps directly instead of letting the raw count conceal them. It includes the owner-requested “My Name Is Jeff” and “I Love You 3000” references.
- Local Qwen writes meaning-specific message, social-dynamic, example, near-miss, and tag metadata. These annotations remain assistant-authored pending owner feedback.
- Production still uses bounded retrieval: two BGE embedding views return 30 candidates, with ten shortlist slots reserved for the original 1,000. The Worker calls TypeSafe Jev directly and independently rates all 30 with five ordered fit levels in one request. Multi-person comments batch three perspective lenses into one request, fill remaining slots with the strongest unused matches, and receive one final ordinal rescore. The UI shows fit labels rather than probabilities. If Jev is rate-limited, the Worker returns five semantic-retrieval matches marked low confidence and weak fit; it never invokes a large text-generation model.

## Evaluation

- The existing fresh 60-case shadow set remains the independent regression check: 45 humour and 15 no-meme prompts.
- Stage 3,000 keeps the 60-case independent shadow set and replaces the invalid artwork-specific slice with 30 GIF-focused humour cases plus 10 no-meme cases.
- Prior stage-3,000 metrics are invalidated because they evaluated the removed artwork records. New retrieval and ranking results must be generated after the corrected Vectorize index is seeded.
- Labels are assistant-authored and not human validated. Metrics are directional until owner feedback accumulates.
- A focused 14-case routing set now covers multi-person situations, quoted first-person speech, inanimate pronouns, and negation. It checks when perspective mode should and should not run; the labels remain assistant-authored pending owner review.
- A corrected 12-case hard-ranking set compares five scoring strategies across 101 unique candidate pairs. Blind model review selected rich ordinal Jev: exact first choices improved from 7/12 to 9/12 and the best returned candidate ranked first on 10/12 rather than 7/12. This evidence is independent of scorer output but is not human ground truth.
- Release proof requires 3,000 catalogue records, 6,000 indexed vectors, passing package checks, a healthy public route, and browser verification.

## Next stage

- Continue owner review of the fresh 100-case stage-3,000 evaluation and use production feedback to improve the weakest GIF metadata.
- Keep improving canonical-coverage misses and owner-labelled evaluation cases.
- At 30,000, add movie-dialogue reactions as a separate corpus and route each input to meme, dialogue, or none before corpus-specific retrieval.

Tracking: [public beta #1](https://github.com/sarthakagrawal927/meme-lab/issues/1), [catalogue expansion #2](https://github.com/sarthakagrawal927/meme-lab/issues/2), [verified meme and GIF rebuild #4](https://github.com/sarthakagrawal927/meme-lab/issues/4).
