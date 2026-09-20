# Meme Lab product contract

Meme Lab turns one pasted comment or situation into a useful meme immediately.

## Audience and outcome

The first user is the owner, but the playground is public for lightweight feedback. The best match appears first, followed by up to two scored alternatives. A low-confidence match stays visibly low confidence; a serious or genuinely mismatched input gets no meme.

## Product behavior

The live catalogue contains 3,000 searchable references. Every reference has a specific meaning, social dynamic, example, near-miss, provenance, media state, meme-strength score, and image-quality score.

Runtime ranking is deliberately bounded:

1. Two semantic searches retrieve 30 likely references.
2. A classifier chooses the three most relevant candidates.
3. Static strength and image quality may reorder only candidates within a narrow relevance margin.
4. A language model writes a short, comment-specific explanation and fit score.
5. Feedback records whether the recommendation landed or missed.

## Evidence boundary

Catalogue metadata, strength, quality, uniqueness, and evaluation labels are model-authored unless explicitly marked otherwise. They are useful engineering evidence, not human-validated cultural truth. Media provenance and rights state remain visible; CC0 open originals are labelled separately from source previews whose redistribution rights are not established.

## Next decision

Improve ranking from live misses and the 100-case evaluation set. Once the 3,000-meme pipeline is stable, expand toward 30,000 reactions with movie dialogue as a separate routed corpus.
