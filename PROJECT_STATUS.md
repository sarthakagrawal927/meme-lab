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
- **50-case eval draft:** 20 seed humour, 10 no-meme, and 20 expansion-only humour cases, all pending owner review before they can count as human-validated evidence.
- **Vectorize trial:** a 300-record index is provisioned with BGE Base 1.5 embeddings and a top-30 semantic shortlist.
- **Control-preservation run:** a 50-candidate probe (all 30 live controls plus 20 retrieved expansion records) reached 100% top-three relevance and 80% correct abstention on the original 30 cases, but p95 latency rose to 4.9 seconds.
- **Expansion-only pilot:** after replacing placeholder metadata for the 24 external references targeted by the draft holdout, expansion-only Recall@30 reached 95%, top-three relevance reached 80%, and p95 latency was 3.85 seconds across 20 assistant-labelled cases.
- **Remaining blocker:** the pilot clears the 70% retrieval and relevance bar, but all 50 labels remain unreviewed and most non-pilot candidate descriptions are still generic. Stage 300 is not promotion-ready.
- **Next implementation:** owner-confirm the 20 expansion labels, then scale meaning-specific metadata curation across the remaining candidate pool with the new placeholder-content guard.

Tracking: [public beta #1](https://github.com/sarthakagrawal927/meme-lab/issues/1), [catalogue expansion #2](https://github.com/sarthakagrawal927/meme-lab/issues/2).
