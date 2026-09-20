# Meme Lab project status

**Updated:** 20 September 2026  
**Lifecycle:** Public relevance experiment with a staged catalogue expansion.

## Shipped

- Public comment-to-meme picker with automatic previews, up to three ranked and scored options, confidence, abstention, and 30-day feedback retention.
- Searchable, paginated collection of all 300 live references.
- Technical How it works page covering semantic retrieval, reranking, evaluation, and the 30 → 300 → 1,000 → 3,000 → 30,000 expansion path.

## Expansion state

- **300 live:** the personal tool retrieves a semantic top 30, then returns up to three reranked memes with 0–100 fit scores.
- **1,000 building:** a bounded 14-page API acquisition retained 1,000 unique non-live candidates after excluding all 300 live records. Every candidate remains unreviewed and needs meaning, delivery-fit, provenance, and media review before promotion.
- **3,000 north star:** 300 / 3,000 are live (10%); 2,700 remain. “I love you 3,000” is the memorable product milestone.
- **30,000 reaction library:** after 3,000 memes, add movie-dialogue reactions as a separate corpus. Route each comment to meme, dialogue, or none before per-corpus retrieval and ranking.
- **Catalogue provenance:** 30 seed reactions, 30 former caption-template records, and 240 assistant-selected public templates. Media rights are not established and are disclosed on the result surface.
- **50-case eval draft:** 20 seed humour, 10 no-meme, and 20 expansion-only humour cases, all pending owner review before they can count as human-validated evidence.
- **Vectorize trial:** a 300-record index is provisioned with BGE Base 1.5 embeddings and a top-30 semantic shortlist.
- **Control-preservation run:** a 50-candidate probe (all 30 live controls plus 20 retrieved expansion records) reached 100% top-three relevance and 80% correct abstention on the original 30 cases, but p95 latency rose to 4.9 seconds.
- **Expansion-only pilot:** after replacing placeholder metadata for the 24 external references targeted by the draft holdout, expansion-only Recall@30 reached 95%, top-three relevance reached 80%, and p95 latency was 3.85 seconds across 20 assistant-labelled cases.
- **Evaluation caveat:** all 50 labels remain unreviewed and most non-pilot descriptions are still generic. This no longer blocks personal use, but the metrics remain provisional.
- **Classifier bake-off:** Jev fast reached 19/20 on an enriched 20-case relevance slice; BGE reranking reached 45% top-three; GLiNER and local Qwen/Laya were useful experiments but were not strong enough to make the final decision. All results are directional until the labels are owner-reviewed.
- **Next implementation:** curate 700 records from the stage-1,000 source pool, expand the held-out evaluation set, then trial vector retrieval → Jev fast scoring → generative sentence explanations before promotion.

Tracking: [public beta #1](https://github.com/sarthakagrawal927/meme-lab/issues/1), [catalogue expansion #2](https://github.com/sarthakagrawal927/meme-lab/issues/2).
