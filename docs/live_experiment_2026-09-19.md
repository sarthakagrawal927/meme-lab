# Live local-model experiment — 19 September 2026

This is an exploratory engineering session, not a human taste benchmark. No result below was rated as the owner's preference, and no top-one or top-three sendability claim is made.

## Frozen setup

- Runtime: Ollama 0.34.2 on loopback
- Model: `qwen2.5:3b`
- Pool: 30 reaction candidates
- Style: playful
- Recent-reference preference: empty
- Dataset hash: `271997061620a8c381b4dc887cf13e012e65b2b7835aa33477586389f61bc56e`
- Conditions: names only (`minimal`) and meaning + relationships (`enriched`)
- Five paired situations: three humour-appropriate and two pre-labelled no-meme cases
- Pair order: deterministically alternated from recorded seeds 201–205

The first comparison used prompt hash `41d822790490533c4c14ed6ce3765a3672d1e2218295158a3ce736d580185f11`.

## Original five-pair result

| Case | Pre-label | Names only | Meaning + relationships |
|---|---|---|---|
| ignored deployment warning | humour | NONE | Spider-Man Pointing; It's a Trap!; I Was Told There Would Be Cake |
| impossible marketplace scope | humour | NONE | Absolute Cinema |
| fragile nineteen-tab spreadsheet | humour | NONE | Absolute Cinema; This Is Fine; Charlie Conspiracy |
| colleague's bereavement | no meme | NONE | This Is Fine; Sad Pablo Escobar; Hide the Pain Harold |
| routine appointment confirmation | no meme | NONE | This Is Fine; Sad Pablo Escobar; Spider-Man Pointing |

Observed selection behavior:

- Names only emitted a meme in **0/3** humour cases and abstained in **2/2** no-meme cases.
- Enriched metadata emitted a meme in **3/3** humour cases, but also joked in **2/2** no-meme cases.
- These are coverage and abstention counts, not sendability scores. The owner has not judged whether any humour-case reference actually lands.
- Median wall time was 1,769 ms for names only and 3,901 ms for enriched metadata.
- Two of ten arms needed one model repair after producing an invalid `NONE + candidates` combination. Both repaired outputs passed local validation. No lexical result was substituted.

The dominant observed failure is abstention calibration: metadata improves willingness to connect a reference, but this small model treats a related emotion as permission to joke.

## Prompt-gate tuning smoke

The selector prompt was changed to decide whether humour is socially appropriate before comparing candidates, with generic guidance for bereavement, crises, routine scheduling, factual questions and practical help. This produced prompt hash `f1a9cc0b37d1143b639424c946a943118ab63917496d95681b625c8e189e0617`.

The same five inputs were rerun with new seeds 301–305. The aggregate behavior did **not** improve:

- Names only again emitted a meme in **0/3** humour cases and abstained in **2/2** no-meme cases.
- Enriched metadata again emitted a meme in **3/3** humour cases and joked in **2/2** no-meme cases.
- Candidate identities changed, but the coverage/false-positive split did not.

Because the same five cases informed the prompt change, this rerun is a tuning smoke test, not a holdout.

## Additional adapter evidence

`qwen3:4b` was tried first. Four direct arms returned truncated JSON (`Unexpected end of JSON input`) under the current 1,200-token output cap, so that batch was stopped and excluded from the five-pair comparison. This is a model/runtime compatibility finding, not a meme-quality result.

## Decision

Do not expand the catalogue yet. The next owner session should use the blind A/B UI to rate the five stored pairs, then collect the planned 20 humour and 10 no-meme holdout cases. If enriched metadata continues to force jokes on sincere inputs, test a separately frozen appropriateness gate or a stronger local model; do not tune further on these five situations.

Experiment IDs for the original comparison:

- `59ac2278-3d6d-4a83-b424-d567d55c53e1`
- `27766741-0c5a-4860-a24c-5962bc642a16`
- `301a41a0-5b6e-4d3c-a51d-778970cfa2ad`
- `1b143d0d-0518-4bfb-b51b-67eb8b0a2125`
- `852e4ed4-d62f-4763-be97-da0b83244bae`

Experiment IDs for the tuning smoke:

- `59b172e7-eb93-4cb8-a07c-654d43ce5b0c`
- `1b74b2a8-5397-41fb-aa91-435dd7ed33dc`
- `c82acade-9de7-4393-9986-9fe45f47e308`
- `d19fc2c9-65dc-4282-bdc6-572c5b5808b4`
- `f555d94e-52de-45e3-bd44-d2a05e042aba`
