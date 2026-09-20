# Meme Lab product contract

Meme Lab turns one pasted comment or situation into a useful meme immediately.

## Audience and outcome

The first user is the owner, but the playground is public for lightweight feedback. The best match appears first, followed by up to two scored alternatives. When a comment contains both a narrator and another participant, the system looks independently for the narrator's reaction, the other person's side, and the situation itself; it shows only the viewpoints with enough support. A low-confidence best match stays visibly low confidence, while a serious or genuinely mismatched input gets no meme.

## Product behavior

The live catalogue contains 3,000 searchable references. Every reference has a specific meaning, social dynamic, example, near-miss, provenance, media state, meme-strength score, and image-quality score.

Runtime ranking is deliberately bounded:

1. Two semantic searches retrieve 30 likely references.
2. A classifier chooses up to three relevant candidates. Multi-person comments are ranked through three explicit lenses: **My reaction**, **Their side**, and **The situation**.
3. Static strength and image quality may reorder only candidates within a narrow relevance margin.
4. Jev's ranking score becomes the displayed fit score. General alternatives below 10/100 and perspective alternatives below 25/100 are omitted instead of padding the result.
5. Feedback records whether the recommendation landed or missed. The larger language model runs only if classifier ranking fails.

## Evidence boundary

Catalogue metadata, strength, quality, uniqueness, and evaluation labels are model-authored unless explicitly marked otherwise. They are useful engineering evidence, not human-validated cultural truth. Media provenance and rights state remain visible; CC0 open originals are labelled separately from source previews whose redistribution rights are not established.

## Next decision

Improve ranking from live misses and the 100-case evaluation set. Once the 3,000-meme pipeline is stable, expand toward 30,000 reactions with movie dialogue as a separate routed corpus.
