# Meme Lab product contract

Meme Lab turns one pasted comment or situation into a useful meme immediately.

## Audience and outcome

The first user is the owner, but the playground is public for lightweight feedback. The best match appears first, followed by four scored backups. When a comment contains both a narrator and another participant, the system looks independently for the narrator's reaction, the other person's side, and the situation itself, then fills the remaining backup slots with the strongest unused matches. Weak backups stay visible with honestly low scores. A low-confidence best match stays visibly low confidence, while a serious or genuinely mismatched input gets no meme.

## Product behavior

The live catalogue contains 3,000 searchable references. Every reference has a specific meaning, social dynamic, example, near-miss, provenance, media state, meme-strength score, and image-quality score.

Runtime ranking is deliberately bounded:

1. Two semantic searches retrieve 30 likely references.
2. Jev independently rates all 30 candidates as wrong, weak, plausible, strong, or exact. Multi-person comments first select distinct candidates through three explicit lenses—**My reaction**, **Their side**, and **The situation**—then rate the selected five on the same ordinal scale.
3. Static meme strength and image quality remain separate catalogue signals; they are not presented as contextual relevance.
4. The primary result and four ranked backups remain visible even when some options are weak. The UI shows ordinal fit labels rather than presenting Jev's competitive score as a probability.
5. Feedback records whether the recommendation landed or missed. There is no generated explanation step on the normal path; the larger language model runs only if classifier ranking fails.

## Evidence boundary

Catalogue metadata, strength, quality, uniqueness, and evaluation labels are model-authored unless explicitly marked otherwise. They are useful engineering evidence, not human-validated cultural truth. Media provenance and rights state remain visible; CC0 open originals are labelled separately from source previews whose redistribution rights are not established.

## Next decision

Improve ranking from live misses and the 100-case evaluation set. Once the 3,000-meme pipeline is stable, expand toward 30,000 reactions with movie dialogue as a separate routed corpus.
