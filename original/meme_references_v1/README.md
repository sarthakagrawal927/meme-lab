# Meme references — English-first starter v1.0

**Research date: 19 September 2026.**

A deliberately small, source-linked retrieval catalogue for choosing existing pictorial references in conversation. This is a **metadata + proposed-annotation release**, not an image archive, a licensed media dataset, or a human-validated training benchmark.

## Start here

Open `preview.html` locally to browse and search. The default view shows the **30 reaction candidates**. It works offline for text; each image loads from the external provider only when you explicitly click its button. External images require network access and can fail. The file does not contain copied media.

For an agent, load `reaction_candidates.jsonl` first. Each record has a stable local ID, a provider ID, a source-listed image URL, an intended message, an underlying relationship, a hypothetical example, a near-miss example and a retrieval text field. Select an ID, not an invented URL. Always retain a NONE/no-good-match option.

`caption_templates.jsonl` is a separate expansion set. These references usually need additional text or a different finished variant. They are NOT 30 ready-made conversational replies. Keeping them separate avoids turning your recall experiment into an accidental meme-generation project.

## What is actually included

| Component | Count | Meaning |
|---|---:|---|
| Core references | 60 | One record per selected family, not repeated caption variants. |
| Reaction candidates | 30 | Potentially usable through an existing pose or fixed caption; not all exact images are display-ready. |
| Caption-dependent templates | 30 | Require a caption or another finished variant. |
| Imgflip records | 40 | Metadata selected from the observed public catalogue. |
| Memegen records | 20 | Source-listed blank/example URLs and template identities. |
| Source audit | 12 | Assessment of all source sites discussed. |
| Additional GIF page leads | 5 | Page URLs only, no resolved media URLs; excluded from the core count. |
| Image visual spot checks | 5 | Assistant vision via the web tool; not human review. |
| Human/audience preference labels | 0 | No claim of validated meme taste. |
| Media files bundled | 0 | This ZIP contains no images, GIFs or video. |

## Provenance — read before training

**Observed data:** provider IDs, catalogue identities and source-listed asset URLs were transcribed from official live responses. Display names were occasionally normalized. `source.catalogue_url` identifies the endpoint; `source.provider_id` is the provider's identifier. This is a selected transcription, not a byte-for-byte raw response snapshot.

**Proposed annotations:** all interpretation text, hypothetical conversation examples, near misses, tags, and delivery suggestions were authored by the assistant. They are suggestions for retrieval, **not publisher labels, human judgments, or ground truth**. A subset was informed by source pages that were read. `context_source_checks` distinguishes pages read from reference links that were merely supplied or retained as leads. Source-origin and actor credits were not independently verified or compiled.

**Asset verification:** the exact images for Absolute Cinema, This Is Fine, Monkey Puppet, Facepalm, and You Guys Are Getting Paid were rendered and inspected using assistant vision. No local media copies were obtained. Three attempted URLs could not be rendered by the research tool; this does not establish that they are globally dead. The remaining URLs were observed in catalogues, not individually HTTP-tested. Per-record flags preserve this distinction.

**Examples of issues caught:** This Is Fine includes its fixed caption. The You Guys Are Getting Paid template does not include the dialogue. Absolute Cinema is a captionless pose. Monkey Puppet includes a large empty caption area and needs crop review. These differences matter when selecting a ready-made reply.

**English-first, not language-certified:** annotations are English and sources were chosen for English-oriented internet references. Text in uninspected images was not systematically verified. The selection favours reusable mainstream formats; it is not a survey of the newest September 2026 trends, nor an objective popularity ranking.

## Selection principles

Prefer a distinct reusable communicative pattern over many variants of the same image. Preserve distinctions between what an image depicts, what a reference may communicate, and whether a particular audience would choose it. Include near misses to expose weak associations. Keep uncertain records marked uncertain instead of manufacturing quality scores.

This set was selected for a broad mix of disbelief, awkwardness, approval, disappointment, warnings, role reversals, self-inflicted problems and expectation mismatches. It was not constructed from a representative sample of all English meme cultures. It is only a starter for finding whether a selector makes apt connections.

## Files

- `memes.json` / `memes.jsonl`: equivalent full 60-record catalogue.
- `reaction_candidates.jsonl`: the 30-record initial experiment.
- `caption_templates.jsonl`: the separate 30-record expansion set.
- `gif_source_leads.jsonl`: five additional page-only reaction leads.
- `sources.json` / `source_audit.md`: the 12-source research assessment and direct references.
- `preview.html`: searchable local browser; remote images are opt-in.
- `schema.json`: JSON Schema for individual core records.
- `validate_dataset.py`: offline structural/integrity checks, standard library only.
- `validation_report.json`: checks performed during creation, including explicit unperformed checks.
- `manifest.sha256`: file-integrity hashes; no media hashes are claimed.

## Evaluation guardrails

Do not evaluate on the same example_context strings that you indexed: the model can simply retrieve a copied example. Create separate situations, allow multiple acceptable references, and split by conversation. For tests of novel-reference generalization, also keep entire template families held out.

A useful first test is blind comparison of selected replies against your own choices. Measure whether you would actually send the result and how often the agent correctly abstains, not whether it emits a meme every time. No such test was run for this release.

## Permissions and collection limitations

No blanket grant covering the underlying images was established. Public image links and open-source generation software do not by themselves establish permission to redistribute third-party imagery. The archive contains source references and original proposed annotations, **not a sublicense for the depicted media**. Check the current provider terms and intended use before shipping. This is a record of what was verified, not legal clearance.

GIFDB was excluded from automated collection because its terms restrict bot access and media integration. Clip.Cafe's personal-use wording does not establish permission to package its clips into an application dataset. KLIPY should be evaluated as an authorized hosted integration with its caching/attribution rules, not treated as an unrestricted dump. For other sites, lack of a verified export is recorded as uncertainty, not proof that an API does not exist.

## Recommendation

For this project, use **Imgflip + Memegen for the selected catalogue**, and selected **Know Your Meme + Reaction GIFs pages as contextual evidence**. Consider Frinkiac/Morbotron in the dialogue stage. The valuable next validation is whether the 30 reaction candidates lead to apt choices on new situations—not simply increasing the row count.
