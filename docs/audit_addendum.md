# Handoff audit addendum

**Date:** 19 September 2026. This document supplements, not replaces, the original twelve-source audit.

## Preservation

The original ZIP contained 13 files. All are extracted unchanged under `original/meme_references_v1/`; the ZIP itself is also retained. The loose `memes.jsonl`, `reaction_candidates.jsonl`, `source_audit.md`, and `preview.html` supplied in the conversation match the archived versions. A new integrity check compares bytes against the original archive. The original schema, validator, manifest and validation report remain in place.

## Screenshot discrepancy

The supplied screenshot is an earlier iteration: it displays 50 reference families, 22 static reactions, 20 templates, 8 optional GIFs and an eight-image inspection claim. The supplied **final archive**, however, contains 60 references, 30 reaction candidates, 30 caption-dependent templates, 5 additional GIF page leads, and records 5 assistant image spot-checks.

Preserve that screenshot as `original/historical-preview.png`, not as evidence for final counts. The new app derives its selection pool from the final JSON. Current UI screenshots, if present under `docs/`, are from the new local build. No annotation or inspection claim from the older screenshot has been imported into the dataset.

## Data is not a verified media library

No meme-image, GIF or clip binaries are included in the original catalogue. URLs are source-listed references. A record's name may describe a familiar caption even when the exact template image does not contain that caption. Several delivery notes explicitly record missing text or crop review. Failed render attempts in the original audit do not prove global link failure.

All proposed usage meanings, relational interpretations, examples, near misses and tags remain assistant-authored hypotheses. A public page read is not a human preference judgment. An assistant visual spot-check is not audience validation. Source IDs and URLs were selected/transcribed from observed metadata; the original package did **not** include raw API response snapshots.

## Source research is preserved, not silently re-certified

The twelve original assessments are available as both Markdown and JSON and are displayed in the app. We did not repeat every historical website, rights, origin or media-availability check during this build. Existing caveats and access restrictions remain attached to their sources. The additional research index preserves earlier datasets/papers/tools as links; unless explicitly marked otherwise, those links were **not** re-opened or downloaded in this handoff. Earlier claimed paper findings, counts and vendor promises are not adopted as new verified results.

Implementation documentation newly checked for this handoff: Ollama's chat endpoint, structured outputs and compatibility documentation. Exact links are in the research index. Tests of this app establish software behavior only, not the truth of every underlying meme interpretation or the quality of a model's taste.

## Local is not automatically offline

The application runs on loopback. Metadata browsing and the lexical control need no internet. Optional model calls go to the configured endpoint; a local runtime can still invoke a cloud-backed model. Non-loopback model endpoints require explicit opt-in and HTTPS. Image loads contact the original provider after a click. Prompt export does not itself call a provider; pasting that prompt into another product shares its input there.

Runs store full pasted conversations and short public model output locally in plaintext. Credentials are not part of run logs. No analytics, autosending, broad crawl or automatic bulk media download is implemented. Do not expose this unauthenticated development server publicly.

## Rights and scope

No new legal clearance has been obtained. Preserving source URLs and software does not grant rights to third-party films, TV, images, GIFs, article text or music. Research papers are linked, not copied into the package. Sources previously excluded or permission-dependent remain so; no unapproved acquisition mechanism is added. No public upload or Library mutation was performed.

## Testing boundary

The companion `test_report.md` states observed tests and unperformed checks. Native/compatible model routes are exercised against local mock HTTP servers; no live local model-quality result is claimed. Browser tests exercise the actual UI. A mocked image-success response proves only the preview plumbing, not actual upstream availability.
