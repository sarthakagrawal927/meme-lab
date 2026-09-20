# Meme Lab project status

**Updated:** 20 September 2026  
**Lifecycle:** Public relevance experiment with a staged catalogue expansion.

## Shipped

- Public comment-to-meme picker with automatic previews, up to three ranked options, confidence, abstention, and 30-day feedback retention.
- Searchable collection of 30 live reaction references.
- Technical How it works page covering the live selector, planned semantic retrieval, evaluation, and the 30 → 300 → 1,000 → 3,000 promotion path.

## Expansion state

- **30 live:** direct all-candidate control.
- **270 candidates:** 30 existing caption-template records plus 240 assistant-selected public templates. Metadata, media rights, and delivery review are still required; none are presented as human-approved.
- **300 sourced:** the first-stage pool is full (30 live + 270 candidates), so sourcing is no longer the stage-300 blocker.
- **30-case eval draft:** 20 humour and 10 no-meme cases, all pending owner review before they can count as human-validated evidence.
- **Vectorize trial:** a 300-record index is provisioned with BGE Base 1.5 embeddings and a top-30 semantic shortlist.
- **Latest assistant-labelled run:** stage 300 reached 90% top-three relevance and 80% correct abstention; the 30-record control reached 95% and 90%. Stage 300 therefore remains experimental even though it meets the absolute draft thresholds.
- **Next implementation:** owner-confirm the eval labels, improve the candidate metadata and two retrieval misses, then rerun parity before promotion.

Tracking: [public beta #1](https://github.com/sarthakagrawal927/meme-lab/issues/1), [catalogue expansion #2](https://github.com/sarthakagrawal927/meme-lab/issues/2).
