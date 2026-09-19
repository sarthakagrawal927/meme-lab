# Build and preservation test report

**Tested:** 19 September 2026. **Build:** Meme Lab 0.2.0.

Version 0.2 adds seeded blind A/B experiments, paired review/reveal, condition-specific history/reporting and one constrained same-model repair attempt for invalid structured output. The original 0.1 browser evidence remains below; current direct-Chrome responsive evidence is stored under `artifacts/design/`.

## Passed checks

| Area | Observed result |
|---|---|
| Node runtime | Node.js v22.16.0. |
| Automated code/API tests | **31 passed, 0 failed**, including paired experiment blinding, review/reveal, reporting, seeded order and one-attempt model repair. |
| Original file preservation | All **13 archived files** match original ZIP bytes; the separately supplied four loose files match their archived versions. The copied original ZIP is byte-identical. |
| Original checksum manifest | All 12 entries validated; the manifest itself is additionally covered by the archive-byte comparison. |
| Dataset integrity | 60 unique reference IDs/families, 30 reaction candidates, 30 templates; JSON/JSONL equivalence; 12 source assessments. |
| Original Python validator | Passed. No semantic/media validation is performed by that script. |
| Synthetic fixtures | 20 smoke cases, explicitly not human labels or a holdout. |
| Model output validation | Known IDs only, no duplicates, at most three candidates, valid NONE combinations, malformed/extra fields rejected. |
| Paired experiment API | Same context/style/pool/model across names-only and enriched arms; opaque A/B response; reveal blocked until successful arms are reviewed; failures never become lexical results. |
| Direct Chrome design QA | Real local app opened in Chrome; 390/768/1440 screenshots captured; no page-level horizontal overflow in the inspected responsive surface; browser console errors: 0. |
| Native and compatible API adapters | Actual local HTTP fixture servers verified payload paths, schema, response parsing, usage handling and failure/timeout behavior. No live model used. |
| Local HTTP behavior | Health/catalogue, prompt export, run saving, feedback validation, export, restart persistence, cross-origin/missing-header rejection, private-path blocking. |
| Browser | Chromium 144.0.7559.96 via Playwright; actual supplied HTML, CSS and JS rendered. |
| UI checks | Model disabled when unconfigured; 30/60/5 catalogue filters; search; 12 source cards; lexical selection; feedback/history; user input displayed as text. |
| Startup external requests | **0** in the rendering test. |
| JavaScript page errors | **0** in the tested flows. |
| Mobile | 390 px viewport; no page-level horizontal overflow on playground/catalogue. |
| Media controls | Explicit click required. Failure placeholder tested by aborting a request. Successful image plumbing tested with an artificial one-pixel PNG, not a real meme. |

Machine-readable details: [browser report](browser_test_report.json), [preservation report](preservation_report.json). Raw test output: `node_test_output.txt`.

## Browser-test transport qualification

This environment's Chromium policy blocks direct navigation to loopback URLs. The browser test therefore embedded the **actual app HTML/CSS/JS** in a local browser context and used a Python binding to transport API requests to the actual running Node server. Separate Node tests exercised the server over direct localhost HTTP. The screenshots are of the app's real frontend, but are **not proof of a full direct-navigation browser session on the user's computer**. Direct launch in the user's browser remains a first-run check.

## Not tested or established

A live loopback Ollama engineering session was run with `qwen2.5:3b`, plus a stopped compatibility attempt with `qwen3:4b`; see [live_experiment_2026-09-19.md](live_experiment_2026-09-19.md). It is not an independent human evaluation or a model-quality benchmark. No hosted model, Jev integration, full asset-availability audit, media licence clearance, production security audit, Windows startup, or Safari-specific browser run was completed. Prompt-injection fixtures test input handling and output validation, not a formal guarantee of model robustness. Caching, background crawling, fine-tuning, sound and video are not implemented.

The unit tests and screenshots must not be described as a successful demonstration of meme taste. The next useful test is an actual configured model on fresh situations, rated by the owner.

## Reproduce

```bash
npm test
npm run check
python3 original/meme_references_v1/validate_dataset.py
```

The first two commands use Node only. The Python validator is optional. The browser check is also optional: `python3 tests/browser_check.py` requires an installed Playwright Python package and Chromium. Set `CHROMIUM_PATH` when the executable is not discoverable. These are testing dependencies, not app runtime dependencies.

Screenshots: [empty playground](local_lab_preview.png), [labelled lexical result](local_lab_baseline_preview.png), [mobile catalogue](local_lab_mobile.png). No screenshot is presented as a live AI selection result.
