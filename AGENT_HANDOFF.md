# Coding-agent handoff

Read `PRD.md`, `README.md`, `docs/audit_addendum.md`, then the original release's `README.md` and `source_audit.md`.

This is already a runnable local starter. **Do not rebuild it in a new framework or start scraping more sites.** Start it with `node server.mjs`, run `npm test` and `npm run check`, inspect the UI, and connect one model the user already has available.

Immediate objective: show whether supplied contextual metadata improves apt reference selection over names alone. Default pool: 30 reaction candidates. Whole-60 is a separate reference experiment; half the collection needs captions or another finished variant.

Preserve all original files. New changes to metadata belong in a versioned derivative or sidecar, with provenance intact. The original screenshot is historical and has incorrect counts for the final archive. Do not rename it into a current proof-of-work screenshot.

The model route sends the entire selected text catalogue; no vector database or multi-agent planner is necessary. Do not silently replace provider errors or invalid outputs with keyword results. Do not claim that local browser hosting implies local inference. Keep credentials server-side, the app on loopback, and image loads explicit. The app sees text metadata, not image pixels.

First hands-on work: enable an existing model in `.env`, try five novel situations, compare names-only versus enriched, and save feedback. Then address the actual observed bottleneck. A small blind-review workflow is more useful next than infrastructure for a million memes.

Do not implement Jev, movie clips, BGM, fine-tuning, caption generation or social integrations unless the user explicitly expands the scope. All their research links are retained in `docs/research_index.md`.

Status boundary: adapters are coded and mock-tested; no live model or human taste benchmark was run while packaging. Consult `docs/test_report.md` rather than assuming end-to-end quality from unit tests.
