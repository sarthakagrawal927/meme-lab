# Meme Lab — local experiment

Read [PRD.md](PRD.md) for the product scope. This folder includes a runnable starter **and the complete original dataset release**, not just a mockup.

## Open it locally

Requires **Node.js 22 or newer**. No dependency installation or build step.

```bash
cd meme_lab
node server.mjs
```

Open **http://127.0.0.1:4317**. `npm start` is equivalent. Stop with Ctrl+C. To use another port, set `PORT=4318 node server.mjs` or edit `.env`.

Immediately available without an AI model: the four-tab interface, catalogue/search, all source audits, opt-in image previews, prompt export, the **explicitly labelled keyword baseline**, local feedback and JSONL export. The baseline is not a functioning cultural-reasoning model.

The unchanged standalone browser can also be opened directly at `original/meme_references_v1/preview.html`. Its text works offline; source-hosted images require an explicit click and an internet connection. `public/index.html` is the new app shell and requires the local server—do not open that file directly.

## Enable a model already on your machine

```bash
cp .env.example .env
# Edit .env: set MEME_MODEL to an exact model name available in your runtime.
# For an existing Ollama installation, `ollama list` shows installed models.
node server.mjs
```

Example configuration, with a placeholder to replace:

```dotenv
MEME_MODEL=your-installed-model-name
MEME_API_STYLE=ollama
MEME_API_BASE_URL=http://127.0.0.1:11434
MEME_ALLOW_REMOTE=false
```

Ollama must already be running. The native adapter sends the catalogue as text to `/api/chat`, asks for structured JSON, and validates IDs locally. It does not see image pixels. Use an instruction-following model with sufficient context for the catalogue. The default context setting is 16,384 tokens; context allocation and runtime memory depend on your chosen model. No model is bundled, chosen for you, downloaded, or benchmarked here.

An existing **chat-completions-compatible** server can instead be configured with `MEME_API_STYLE=chat_completions` and a base URL ending at its API root, such as `http://127.0.0.1:1234/v1`. The adapter appends `/chat/completions`. Leave native Ollama's base URL without `/api/chat` or `/v1`.

Compatibility varies by provider. Set `MEME_JSON_MODE=false` only if your compatible endpoint rejects `response_format`; local validation still applies. A cloud endpoint requires HTTPS, the appropriate authorized API key, and `MEME_ALLOW_REMOTE=true`. The UI identifies a non-loopback endpoint. A loopback runtime can still invoke cloud models: use a genuinely local model for private conversations.

Jev is **not** assumed to implement either route. Its documentation is preserved as a future-adapter lead, not a claimed working integration.

## First run

Load a smoke situation or paste your own. Start with the 30 reaction candidates and enriched descriptions. Compare **Choose with model** against names-only and the lexical control. Load a source image explicitly when needed. Add an optional replacement/note, then choose a verdict. “No meme belongs here” and “a better match exists” mean different things; the app keeps them separate.

For the controlled comparison, pre-label whether humour belongs, then choose **Run blind A/B**. The app freezes the context, style, pool and model; runs names-only and enriched conditions in seeded order; hides condition labels and rationales; and reveals them only after every successful arm is reviewed. Paired runs remain grouped in history, with condition-specific counts rather than one combined score.

If a model returns malformed or contradictory structured output, the adapter makes one constrained repair attempt through the same model. A failed repair remains an error; it never becomes a keyword result. The run records whether repair was attempted.

Each submission creates a local run file. Each verdict creates a feedback event; the history screen shows the latest verdict per run or paired arm. Exports retain all events. The smoke inputs are synthetic fixtures, not an independently labelled quality benchmark. See [the protocol](docs/experiment_protocol.md) before treating results as evidence. The first live local-model engineering session is recorded in [live_experiment_2026-09-19.md](docs/live_experiment_2026-09-19.md). The frozen 30-case paired holdout and its blind agent-review results are recorded in [holdout_v1_report.md](docs/holdout_v1_report.md).

## Holdout workflow

With a local model configured, the frozen holdout can be resumed without duplicating completed cases:

```bash
npm run experiment:holdout
npm run experiment:review
```

Open **http://127.0.0.1:4318** for the isolated owner-review queue. Use **http://127.0.0.1:4318/review** to label each returned candidate as relevant, not relevant or unsure. Allowlisted candidate previews load automatically. The relevance queue is resumable and keeps conditions, rationales and pre-labels hidden. `npm run experiment:summarize` validates both blind-review artifacts and regenerates `results/holdout-v1/summary.json`.

## Included

| Path | Contents |
|---|---|
| `PRD.md`, `AGENT_HANDOFF.md` | Product spec and coding-agent handoff. |
| `public/`, `server.mjs`, `src/` | Local UI, selectors, model adapters, safe local server, event store. |
| `prompts/`, `schemas/` | Inspectable selector instructions and response schema. |
| `eval/smoke_cases.jsonl` | 20 synthetic UI/behavior smoke cases. |
| `private/holdout_v1.jsonl` | Frozen 30-case holdout, never served by the app. |
| `results/holdout-v1/` | Isolated paired runs, blind queues, reviews and machine-readable summary. |
| `tests/`, `scripts/` | Offline, HTTP/mock-adapter, and package-integrity checks. |
| `docs/` | Complete research index, audit addendum, experiment protocol, tests, current screenshots. |
| `original/meme_references_v1/` | Every original release file, unchanged. |
| `original/meme_references_v1.zip` | The exact previously supplied ZIP. |
| `original/historical-preview.png` | Supplied older screenshot, visibly labelled historical by its filename. |
| `runs/` | Private local run/feedback files; starts empty and is ignored by Git. |

## Check the build

```bash
npm test
npm run check
# Optional original validator:
python3 original/meme_references_v1/validate_dataset.py
```

See [test_report.md](docs/test_report.md) for packaged test coverage. A live `qwen2.5:3b` Ollama holdout was subsequently run locally; its quality evidence and limitations are documented separately in [holdout_v1_report.md](docs/holdout_v1_report.md). External asset availability was not comprehensively re-audited.

## Data and privacy boundaries

Annotations are drafts; zero original human preference labels. Sixty references are not sixty verified ready-to-send images. Thirty entries are caption-dependent. Five GIF leads contain page URLs, not GIF binaries. Meme media is not bundled. The audit and source documents retain their limitations; no new permission clearance is implied.

The app listens on `127.0.0.1`, makes no model request until asked, and does not prefetch remote images. Media loads contact the original provider. Pasting an exported prompt into another service shares its content. Local run files contain your full pasted conversations in plaintext; do not commit or share them accidentally. To reset, stop the server and remove the JSON event files inside `runs/`, retaining `.gitkeep`. There is no production authentication; do not expose this server through a tunnel or bind it publicly.

Keep `.env` out of Git. Original assets/annotations are never edited by the app. The preserved screenshot has outdated 50-reference counts; use the JSON catalogue and current UI for the 60-reference release. [Audit addendum](docs/audit_addendum.md) explains the discrepancy and what is still unverified.
