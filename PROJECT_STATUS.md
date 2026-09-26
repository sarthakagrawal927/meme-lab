# Meme Lab project status

**Updated:** 23 September 2026
**Lifecycle:** Live personal meme picker with the corrected 3,000-item meme-and-GIF catalogue and crawlable catalogue pages.

## Live product

- Paste one complete comment or situation and receive the best meme first, four backups, ordinal fit labels, and honest confidence.
- Multi-person comments now return distinct viewpoints where available: **My reaction**, **Their side**, and **The situation**.
- The production release contains the corrected 3,000-reference snapshot: 1,805 static memes and 1,195 usage-backed reaction GIFs, with no National Gallery artwork or inert editing canvases.
- See meme strength and image quality separately from contextual fit. Popularity and asset quality do not masquerade as relevance.
- Serious help, safety, care, grief, apology, and factual-guidance requests are guarded before humour is considered.
- One-tap feedback is retained for 30 days.

## Search and discovery

- The checkout now lives at the canonical Fleet path, `/Users/sarthak/Desktop/fleet/meme-lab`.
- The SEO build provides a server-rendered page for every one of the 3,000 meme references, plus self-referencing canonical metadata, Open Graph metadata, JSON-LD, `robots.txt`, and a 3,003-URL sitemap.
- Successful recommendations link the best match and all four backups to those stable catalogue pages. Raw submitted comments remain private 30-day feedback data and are never placed in public URLs, metadata, page source, or the sitemap.
- API and 404 responses remain explicitly `noindex`; public product and meme pages are indexable.

## Correcting the 3,000 catalogue

- An audit found that 1,189 of the earlier 3,000 records were public-domain artworks without evidence of meme use. They are excluded from the corrected catalogue.
- The honest static baseline is 1,805 named meme templates: six blank backgrounds and empty panel layouts were removed after owner feedback.
- The replacement tranche contains 1,195 reaction GIFs. 1,194 come from the GIF Reply research dataset of 1.56 million observed conversation-to-GIF replies, with at least 108 observed uses per selected GIF. “My Name Is Jeff” is an explicit owner-requested canonical entry.
- The catalogue now records `media_type`, full media URL, preview URL, MIME type, source provenance, evidence state, and rights state. GIFs animate in results while collection cards load lighter previews.
- A checked-in 41-item canonical coverage manifest reports recognizable gaps directly instead of letting the raw count conceal them. All 41 are now covered, including the owner-requested “My Name Is Jeff,” “I Love You 3000,” Side Eyeing Chloe, and Sleeping Shaq references.
- Local Qwen writes meaning-specific message, social-dynamic, example, near-miss, and tag metadata. These annotations remain assistant-authored pending owner feedback.
- Production still uses bounded retrieval: two BGE embedding views return 30 candidates, with ten shortlist slots reserved for the original 1,000. The Worker calls TypeSafe Jev directly and independently rates all 30 with five ordered fit levels in one request. Multi-person comments batch three perspective lenses into one request, fill remaining slots with the strongest unused matches, and receive one final ordinal rescore. The UI shows fit labels rather than probabilities. If Jev is rate-limited, the Worker returns five semantic-retrieval matches marked low confidence and weak fit; it never invokes a large text-generation model.

## Evaluation

- The existing fresh 60-case shadow set remains the independent regression check: 45 humour and 15 no-meme prompts.
- Stage 3,000 keeps the 60-case independent shadow set and replaces the invalid artwork-specific slice with 30 GIF-focused humour cases plus 10 no-meme cases.
- Prior stage-3,000 metrics are invalidated because they evaluated the removed artwork records. New retrieval and ranking results must be generated after the corrected Vectorize index is seeded.
- Labels are assistant-authored and not human validated. Metrics are directional until owner feedback accumulates.
- A focused 14-case routing set now covers multi-person situations, quoted first-person speech, inanimate pronouns, and negation. It checks when perspective mode should and should not run; the labels remain assistant-authored pending owner review.
- A corrected 12-case hard-ranking set compares five scoring strategies across 101 unique candidate pairs. Blind model review selected rich ordinal Jev: exact first choices improved from 7/12 to 9/12 and the best returned candidate ranked first on 10/12 rather than 7/12. This evidence is independent of scorer output but is not human ground truth.
- A focused 22-case canonical-gap diagnostic now separates data, retrieval, safety, provider, ranking, and ordering failures. After adding the two missing records, improving eight weak family variants, narrowing two over-broad safety phrases, and re-indexing only affected vectors, retrieval recall@30 improved from 15/22 to 22/22, final recall@5 from 14/22 to 22/22, and exact top-one from 11/22 to 17/22. Five remaining cases are ordering disagreements with the expected meme still in positions 2–4. These labels are assistant-authored and not human ground truth.
- “I Love You 3000” now ranks first for “When I want to say I love you” from its catalogue meaning and embeddings; the temporary phrase-specific runtime pin has been removed.
- Release proof requires 3,000 catalogue records, 6,000 indexed vectors, passing package checks, a healthy public route, and browser verification.

## Next stage

- Continue owner review of the fresh 100-case stage-3,000 evaluation and use production feedback to improve the weakest GIF metadata.
- Convert the focused canonical set into owner-labelled evaluation data and use feedback to resolve the five remaining ordering disagreements.
- The next catalogue expansion is GIF-first, not a standalone movie-dialogue corpus. Cornell dialogue remains research/evaluation material and is not a production source.
- A 5,000-GIF staging pool is now built from the full official GIF Reply exports. It contains 4,134 entries not present in the earlier 1,189-record source set, requires at least ten observed reply uses, has no exact record, media, or dataset-GIF-ID duplicates, and caps identical semantic buckets at eight.
- The staging pool is deliberately not live yet. A browser-measured 63-GIF stratified sample found 10 assets (15.9%) below the 320-by-180-equivalent release floor, one timed-out asset, and both visible watermarks and genuinely strong tail entries. Every new record now has an unknown asset-quality score, a pending visual-quality status, and `production_eligible: false`; no record can enter production until measured. The 120-record review sample remains owner-unvalidated, and 4,134 net-new records still need meaning-specific full-sentence retrieval metadata before release qualification.
- A focused curation pass visually inspected seven distinct candidates, checked their actual GIF dimensions and reaction meaning, and replaced seven live records whose names and retrieval descriptions were watermark text or broken OCR. The generated catalogue remains exactly 3,000 records. These seven changes are prepared locally; the public Worker and vector index still need a coordinated release before visitors can retrieve them.

Tracking: [public beta #1](https://github.com/sarthakagrawal927/meme-lab/issues/1), [catalogue expansion #2](https://github.com/sarthakagrawal927/meme-lab/issues/2), [verified meme and GIF rebuild #4](https://github.com/sarthakagrawal927/meme-lab/issues/4), [canonical retrieval gaps #5](https://github.com/sarthakagrawal927/meme-lab/issues/5), [crawlable catalogue #6](https://github.com/sarthakagrawal927/meme-lab/issues/6).
