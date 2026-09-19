# Meme Lab — local reference-selection experiment

**Version:** 0.1 · **Date:** 19 September 2026 · **Owner:** Sarthak  
**Decision to test:** Can a model recall an apt existing cultural reference for a new situation—rather than return a vaguely related reaction?

## 1. Product

A local playground: paste a situation or short conversation, receive up to three existing memes or a genuine **no strong match**, then choose what you would actually send. The first audience is the owner, using English-oriented internet references. The long-term direction is movie dialogue and audiovisual reactions, but neither is required to validate this experiment.

Example distinction: “Build a streaming service by Friday for $20” is an unreasonable demand; “My client asked for that” is a complaint inviting solidarity; “What can I realistically prototype for $20?” is a sincere question. The agent must distinguish the speaker, the target, and the underlying mismatch, not merely match the words “budget” and “software.”

**Success is a reference that lands, not a joke explanation that sounds convincing.**

## 2. Starting material — use what is already here

The complete previous release is preserved under `original/meme_references_v1/`, and its original ZIP is included separately. Its [README](original/meme_references_v1/README.md), [source audit](original/meme_references_v1/source_audit.md), [validation report](original/meme_references_v1/validation_report.json), and per-record flags remain authoritative for what that release actually checked.

| Material | Role in v0.1 |
|---|---|
| 30 reaction candidates | Default selectable pool; candidate does **not** mean display-ready. |
| 30 caption-dependent templates | Browsable; optional all-60 reference experiment, clearly marked unfinished. |
| Full JSON/JSONL, schema, validator, checksum manifest | Canonical input and reproducibility. |
| Five GIF page leads | Preserved, not selectable media assets. |
| Twelve source audits and structured source records | Visible in the app and preserved in full. |
| Original HTML and historical screenshot | Retained; the screenshot's older counts are not current dataset counts. |
| Earlier dataset, research, Jev and Sherpa links | Indexed in [research_index.md](docs/research_index.md); parked, not prerequisites. |

No bulk scraping, new tagging pipeline, mandatory annotation project, embeddings, or database migration before the first trial. Existing interpretation and usage annotations are assistant-authored hypotheses, not human labels. No underlying meme media files or rights clearance are supplied. See the [handoff audit](docs/audit_addendum.md).

## 3. Core experience

**Try a situation.** Paste up to 6,000 characters, optionally choose a synthetic smoke case, select playful/gentle/dry delivery, and run a selector. Context includes the whole pasted exchange. Recent chosen references can be supplied as a preference, not a hard ban.

**Inspect the result.** Show zero to three distinct catalogue references, best first. Permit NONE without filling empty slots. Display the exact source-linked asset only after an explicit image-load action. Surface missing captions, crop issues, unavailable media, and unreviewed status. Keep a brief fit explanation available; do not mistake that explanation for independent evidence of quality.

**Judge the choice.** Save “I'd send this,” “related, not apt,” or “miss.” Separate **no meme belongs here** from **a better meme exists but none of these fit**. Allow a replacement from all 60 references and a free-text note for missing references. Log whether the asset had actually loaded when it was rated.

**Browse and inspect evidence.** Search meanings and relationships, filter reaction/template/provider/spot-check status, open the original HTML, and access all source/audit documents. A dedicated history view shows runs and latest verdicts; JSONL export retains all events.

## 4. Selection design

```text
Pasted conversation + style + recent reference IDs
             ↓
Whole selected catalogue: names only OR enriched metadata
             ↓
One model call → structured selection or NONE
             ↓
Validate IDs, uniqueness and response shape
             ↓
Resolve source asset locally → optional external image load → user feedback
```

Start with direct comparison over all 30 candidates. That avoids a retrieval stage hiding the correct reference before the selector sees it. An explicit all-60 mode tests catalogue expansion without pretending caption-dependent templates are finished responses.

Run three conditions on the same fresh situations: **keyword baseline**, **model with names only**, and **the same model with meanings, relationships, examples and near misses**. The lexical method is a diagnostic control, never a fallback disguised as AI. It does not understand style, perspective, or whether joking is appropriate.

The current model adapter is text-only. It tests reference selection from metadata—not end-to-end visual understanding. Model output contains only an allowed ID and short public rationale per candidate. No generated quotes, URLs, captions, assets, confidence percentages, or automatic messages to other people.

## 5. Local implementation

Use the included Node.js 22+ server and plain HTML/CSS/JavaScript. There are no package dependencies, build step, user accounts, telemetry, or hosted database. Run `node server.mjs`; tests use `npm test`.

The default model route is a locally configured Ollama `/api/chat` endpoint with a JSON schema. An optional chat-completions-compatible adapter is included. Its documented request/response basis is listed in [implementation sources](docs/research_index.md#implementation-documentation). Configure a model already available to the user; do not automatically download a large model or purchase API access.

Keep credentials and endpoint configuration in `.env` or server environment variables. Non-loopback inference requires explicit opt-in. Binding the app to localhost does not guarantee private inference: a model runtime can route to cloud models. Select a genuinely local model for private inputs. Copying the prompt to another service also shares its contents.

Store immutable run and feedback event files in `runs/`. Preserve dataset hash, prompt hash, selector version, input, pool, representation, selected IDs, model identifier, latency, available usage counts, and errors. Do not log credentials or hidden reasoning. The original dataset is read-only; future edits should be versioned separately.

## 6. Scope and exclusions

**P0:** local four-tab UI; full existing catalogue; opt-in remote media; default 30-reference pool; named lexical control; configurable model adapter; strict output validation; prompt export; local feedback, replacement and history; complete audits and research index; tests and reproducible startup.

**Later, only after evidence:** model-blind side-by-side comparison, structured human holdout import, individually reviewed display assets, a Jev adapter, catalogue expansion, retrieval/reranking, scene-aware movie-dialogue records, and optional approved-media storage.

**Out of scope:** social integrations, automatic sending, mobile app, user accounts, fine-tuning, a knowledge graph of cinema, background crawlers, mass GIF downloads, caption/image generation, soundtrack composition, and BGM timing. Preserve their research links, not their implementation burden.

## 7. Experiment and decision gate

The 20 supplied situations are **synthetic smoke fixtures**, not a benchmark. Use them to exercise the UI, inspect errors, and check perspective/abstention behavior. Do not reuse indexed `example_context` strings as evaluation queries.

Before tuning on personal choices, create 30 fresh situations: 20 that invite a reaction and 10 where a sincere response/no meme is appropriate. Label the distinction before seeing outputs; multiple references may be acceptable. Keep evaluation inputs out of candidate annotations. Compare methods with model identities and explanations concealed during judgment; the included exploratory UI does **not** automate blinding.

**Proposed continuation gate—not an achieved result:** at least one actually-sendable top-three choice on 14/20 reaction cases, no inappropriate meme suggestion on at least 8/10 no-meme cases, and zero accepted unknown/duplicate IDs. Report numerators and denominators, not just percentages. These are practical project thresholds, not statistically established performance claims.

Record top-one preference, top-three sendability, meme coverage, correct abstention, false-positive joking, wrong-target mistakes, media failures, and latency separately. Do not combine lexical/model runs, names/enriched settings, or 30/60 pools. Repeated feedback on one run is not a new test case. Diagnose **coverage**, **selection**, **perspective/taste**, and **asset delivery** as separate failure classes. Details: [experiment protocol](docs/experiment_protocol.md).

## 8. Acceptance criteria

A fresh checkout opens locally with `node server.mjs`, even without a model. The model action stays disabled until configured; model errors never silently become lexical results. All 60 records are browsable, 30 are the default pool, and all 12 original source assessments are accessible. The old standalone HTML remains usable.

The selector rejects unknown IDs, duplicates, extra output fields, malformed JSON and invalid NONE combinations. The API enforces input bounds, loopback binding, origin/host checks and request headers; arbitrary upstream URLs cannot be submitted from the browser. `.env` and raw event files are not statically served.

The app makes no external image requests on startup. Every remote image requires an explicit click; image failures produce a usable placeholder and source link. Context and model text are rendered as text, not executable HTML. Feedback survives restart and can be exported.

All supplied original files match their archived bytes. No unverified annotation becomes “human validated,” no missing image is silently represented as present, and no live model-quality test is claimed from mocked integration tests. Desktop/mobile rendering and test results are recorded in [test_report.md](docs/test_report.md).

## 9. First session

Start the app, browse several reactions, configure an existing model, and run five genuinely different situations in names-only and enriched modes. Rate the selections before reading long explanations. Use the misses to decide whether to repair annotations, replace a bad asset, or expand coverage. Do **not** restart dataset research before this experiment produces evidence.
