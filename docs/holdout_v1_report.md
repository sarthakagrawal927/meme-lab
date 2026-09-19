# Holdout v1 — paired blind experiment

Date: 20 September 2026

## Status

- 30 frozen cases: 20 humour-appropriate, 10 no-meme
- 30 complete paired experiments / 60 successful model runs
- Model: `qwen2.5:3b` through local Ollama
- Candidate pool: 30 reaction references
- Fixed seeds: 1001–1030
- Dataset hash: `271997061620a8c381b4dc887cf13e012e65b2b7835aa33477586389f61bc56e`
- Prompt hash: `f1a9cc0b37d1143b639424c946a943118ab63917496d95681b625c8e189e0617`
- Remote inference spend: $0

The holdout was kept outside the catalogue and smoke fixtures. Conditions, rationales and frozen pre-labels were hidden from two independent agent reviewers. The reviewers saw only the situation and anonymous A/B output. They agreed on the independent humour/no-meme label for all 30 cases.

These are **agent-review results, not owner taste labels or an independent human benchmark**. The owner-review queue remains available for the decisive preference pass.

## Result

| Condition | Meme coverage | Top-1 sendable, strict agreement | Top-3 sendable, strict agreement | Correct abstention | Inappropriate joking |
|---|---:|---:|---:|---:|---:|
| Names only | 1/30 | 0/20 | 1/20 | 10/10 | 0/10 |
| Meaning + relationships | 30/30 | 7/20 | 15/20 | 0/10 | 10/10 |

Per-reviewer enriched top-three sendability was 15/20 and 20/20. Exact candidate-level verdict agreement was 53/87; this confirms that meme taste varies even where both reviewers agree the situation permits humour.

The continuation gate required one condition to reach both at least 14/20 top-three sendability and at least 8/10 correct abstentions. Neither condition passed:

- Names only passed abstention but failed useful retrieval.
- Enriched metadata passed the humour-case threshold but failed every no-meme case.

## Interpretation

Metadata is doing real work: it changed the system from near-total abstention to a sendable suggestion in at least 15 of 20 humour cases under strict reviewer agreement. The earlier five-case smoke result was therefore not just random coverage.

The failure is equally clear. The enriched prompt treats semantic relatedness as permission to joke. More catalogue entries will not fix that. A stronger or separately frozen appropriateness gate should decide whether the selector runs at all; enriched selection should only happen after that gate passes.

## Review integrity

- Arm order was seeded and persisted.
- Arm model seeds do not collide with structured-output repair seeds.
- The resumable queue omits representation, rationale and pre-label.
- The batch uses an isolated store under `results/holdout-v1/runs`.
- Reviewer artifacts are preserved as `reviewer-a.json` and `reviewer-b.json`.
- Machine-readable metrics are preserved in `summary.json`.

## Next decision

Complete the owner blind review before treating sendability as a product-quality result. If owner judgments broadly confirm the agent review, keep enriched metadata and add an appropriateness gate. Do not expand the catalogue yet.
