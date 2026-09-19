# Experiment protocol

## Questions, in order

1. **Recognition:** Does a model select apt references when every candidate is available?
2. **Metadata value:** Do relational meanings and usage examples improve on names alone?
3. **Delivery:** Does the exact source asset express the selected reference without missing captions, awkward cropping, or a failed load?
4. **Coverage:** Are frequent misses due to a limited catalogue rather than poor selection?

Do not add a retrieval layer until these are separated. With 30 candidates, direct catalogue selection is the default.

## Smoke session — available now

Use the 20 scenarios in `eval/smoke_cases.jsonl` to check UI behavior, perspective changes, NONE handling, injection resistance, and model formatting. They are assistant-authored and may reflect the design of the catalogue. Their `expected_ids` are deliberately null. They are not human-validated labels or an independent holdout.

Use **Run blind A/B** for names-only and enriched comparisons. The app freezes the shared inputs, randomizes arm labels from a recorded seed, and hides condition labels and rationales until every successful arm is reviewed. Meme names remain visible, so this is a blind condition review rather than a fully blinded media study. The lexical baseline cannot make a reliable no-meme judgment; do not use it as a safety filter.

## Personal holdout — collect before tuning

Author 30 fresh conversations without copying catalogue examples: 20 that invite humour and 10 where a sincere/non-meme response is appropriate. Mark that intent before seeing the model. Include first-person versus third-party complaints, ordinary versus unreasonable asks, literal versus ironic wording, multiple acceptable reactions, and cross-topic analogies. Use consented or deliberately authored text; remove identifying details from real conversations.

Keep these conversations outside the catalogue, prompts, and personalization examples. Save them in a separate private file. A local owner-only study tests this owner's taste, not universal meme quality. Familiarity with a specific reference should be recorded separately from whether it fits.

## Controlled comparison

Freeze dataset hash, prompt hash, candidate scope, model version, runtime settings, and input text. Run lexical, names-only model, and enriched model conditions. The paired workflow automates seeded A/B ordering and hides representation labels and rationales until review; keep lexical runs separate as a diagnostic control. Rate the reference first, then reveal the explanation to diagnose misses.

Do not count the same situation rerun three times as three independent situations. Compare 30- and 60-reference pools separately; a template selected in the all-60 pool can be a good *reference* but fail as a finished *reply*.

## Labels

| UI verdict | Meaning |
|---|---|
| `send` | I would actually send this candidate in this situation. |
| `related` | A connection exists, but this does not land well enough. |
| `miss` | The chosen candidate misreads the situation, perspective, or desired response. |
| `none_is_right` | A meme does not belong here, whether or not the model abstained. |
| `none_of_these` | Humour is appropriate, but the model/library did not supply a fitting reference. |

Replacement ID and notes refine the diagnosis. `asset_state` distinguishes a loaded/failed/unrequested asset at judgment time. Feedback events are append-only; the current history uses the last verdict for a run. Earlier clicks are revisions, not additional independent people or cases. Multiple-candidate acceptability is not fully modelled in the starter's last-verdict history: use the exported events carefully or collect a dedicated holdout label file before computing top-three metrics.

## Scorecard — manual first

Report method, representation and pool before every result. Use count/denominator, not a single universal “humour score.”

- **Top-one sendability:** cases where the first candidate is acceptable / humour-appropriate cases with usable labels.
- **Top-three sendability:** cases with at least one acceptable candidate / humour-appropriate cases. An abstention on such a case is a miss, not removed from the denominator.
- **Coverage:** cases in which the model emitted a meme / all valid cases. Interpret alongside appropriateness, not as a goal to maximize.
- **Correct no-meme:** no-meme cases where the model abstained / all no-meme cases.
- **Inappropriate joking:** no-meme cases where it proposed a meme / all no-meme cases.
- **Wrong target:** individually reviewed perspective errors; do not infer from a thumbs-down alone.
- **Delivery:** unavailable, incomplete or unreadable assets / assets explicitly attempted. Do not treat unrequested images as successful loads.
- **Latency/usage:** median and slow-tail wall time per method; distinguish first-load from warmed local inference. Do not invent price estimates without a provider/model-specific tariff.

Proposed continuation gate: sendable top-three in at least 14/20 humour cases, correct no-meme in at least 8/10 no-meme cases, zero accepted invalid IDs. These are project decision thresholds, **not achieved outcomes** or statistical guarantees.

## Diagnose before expanding

No suitable reference in pool → add a specific missing family. Suitable reference present but not selected → improve interpretation/selection or metadata. Good conceptual match with blank or broken asset → fix delivery, not the selector. Related but unfunny despite correct interpretation → collect preference comparisons. Do not fine-tune until you have repeated, reviewed failure patterns and a held-out comparison.
