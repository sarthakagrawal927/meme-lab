# Research and source index

All twelve original source audits are preserved in [source_audit.md](../original/meme_references_v1/source_audit.md) and [sources.json](../original/meme_references_v1/sources.json). The runnable experiment uses their selected catalogue, not newly downloaded research datasets.

This index has **66 entries and 96 distinct links**. The full 60 exact image URLs and provider IDs remain in [memes.jsonl](../original/meme_references_v1/memes.jsonl); five additional GIF page leads remain in [gif_source_leads.jsonl](../original/meme_references_v1/gif_source_leads.jsonl).

**Evidence labels matter.** “Original audit” preserves the earlier assessment without claiming a fresh site-wide check. “Prior discussion” means a retained link, not a newly verified paper finding, download, current capability or licence. Only the implementation documentation below was newly read for the model adapter. Full papers, private vendor accounts and raw historical web responses are not bundled.

## Original source audits

### Imgflip
Primary template catalogue

**Status:** `preserved_original_audit_not_repeated_in_handoff`.

- [Reference 1](https://imgflip.com/api)
- [Reference 2](https://api.imgflip.com/get_memes)

### Memegen
Primary structured template/example catalogue

**Status:** `preserved_original_audit_not_repeated_in_handoff`.

- [Reference 1](https://github.com/jacebrowning/memegen)
- [Reference 2](https://api.memegen.link/templates/)

### Know Your Meme
Cultural-context reference

**Status:** `preserved_original_audit_not_repeated_in_handoff`.

- [Reference 1](https://knowyourmeme.com/about)
- [Reference 2](https://knowyourmeme.com/memes/this-is-fine)
- [Reference 3](https://knowyourmeme.com/memes/absolute-cinema)
- [Reference 4](https://knowyourmeme.com/memes/you-guys-are-getting-paid)
- [Reference 5](https://knowyourmeme.com/memes/monkey-puppet)

### Reaction GIFs
Usage-context reference and future reaction assets

**Status:** `preserved_original_audit_not_repeated_in_handoff`.

- [Reference 1](https://www.reactiongifs.com/)
- [Reference 2](https://www.reactiongifs.com/stone-cold-laugh-turns-serious/)
- [Reference 3](https://www.reactiongifs.com/jack-nicholson-nodding-yes/)
- [Reference 4](https://www.reactiongifs.com/jeremiah-johnson-nodding/)
- [Reference 5](https://www.reactiongifs.com/leonardo-dicaprio-gatsby-cheers/)
- [Reference 6](https://www.reactiongifs.com/you-sit-on-a-throne-of-lies/)

### KLIPY
Hosted catalogue/API integration

**Status:** `preserved_original_audit_not_repeated_in_handoff`.

- [Reference 1](https://klipy.com/developers)
- [Reference 2](https://docs.klipy.com/memes-api)
- [Reference 3](https://docs.klipy.com/attribution)

### GIFDB
Manual discovery only in this release

**Status:** `preserved_original_audit_not_repeated_in_handoff`.

- [Reference 1](https://gifdb.com/memes)
- [Reference 2](https://gifdb.com/terms/)

### Memedroid
Discovery of community memes

**Status:** `preserved_original_audit_not_repeated_in_handoff`.

- [Reference 1](https://www.memedroid.com/)
- [Reference 2](https://www.memedroid.com/tos)

### Memebase / Cheezburger
Editorial discovery feed

**Status:** `preserved_original_audit_not_repeated_in_handoff`.

- [Reference 1](https://memebase.cheezburger.com/)
- [Reference 2](https://cheezburger.com/terms-of-service)

### Frinkiac
Dialogue/frame retrieval for The Simpsons

**Status:** `preserved_original_audit_not_repeated_in_handoff`.

- [Reference 1](https://frinkiac.com/)
- [Reference 2](https://langui.sh/2026/05/04/ten-years-of-frinkiac/)

### Morbotron
Dialogue/frame retrieval for Futurama

**Status:** `preserved_original_audit_not_repeated_in_handoff`.

- [Reference 1](https://morbotron.com/)
- [Reference 2](https://langui.sh/2016/08/08/morbotron-futurama/)
- [Reference 3](https://langui.sh/2026/05/04/ten-years-of-frinkiac/)

### Clip.Cafe
Movie/TV scene discovery

**Status:** `preserved_original_audit_not_repeated_in_handoff`.

- [Reference 1](https://clip.cafe/)
- [Reference 2](https://clip.cafe/termsandconditions/)

### Meme Depot
Curated-collection discovery

**Status:** `preserved_original_audit_not_repeated_in_handoff`.

- [Reference 1](https://memedepot.com/)

## Earlier dataset candidates

### MemeCap
Earlier English meme-understanding seed candidate.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://github.com/eujhwang/meme-cap)
- [Reference 2](https://arxiv.org/abs/2305.13703)
- [Reference 3](https://huggingface.co/datasets/Leonardo6/memecap)

### MemeCMD
Conversational meme retrieval and annotation design lead.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://arxiv.org/abs/2507.00891)

### MemeCULT-1K
South Asian cultural-context dataset lead; release availability must be rechecked.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://github.com/TawsifDipto17/MemeCULT-1K)
- [Reference 2](https://arxiv.org/abs/2609.01772)

### MemeLens
Multilingual understanding dataset lead; not part of the runnable catalogue.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://huggingface.co/datasets/QCRI/MemeLens)
- [Reference 2](https://huggingface.co/QCRI/MemeLens-VLM)
- [Reference 3](https://arxiv.org/abs/2601.12539)

### CM50
Template-aware text retrieval and annotation lead.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://github.com/Seefreem/meme_text_retrieval_p1)
- [Reference 2](https://arxiv.org/abs/2501.13851)
- [Reference 3](https://github.com/Seefreem/meme_text_retrieval_p1/blob/main/data/50_template_info.json)

### MemeMatch
Larger retrieval-dataset lead; download and media coverage not validated for this handoff.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://github.com/TriAnLe171/MemeMatch-v1.0)
- [Reference 2](https://doi.org/10.34740/kaggle/dsv/14510064)
- [Reference 3](https://ojs.aaai.org/index.php/ICWSM/article/view/42785)
- [Reference 4](https://github.com/TriAnLe171/Meme_Recommendation_Project)

### MemeReaCon
Conversational meme-understanding evaluation lead.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://aclanthology.org/2025.emnlp-main.176/)
- [Reference 2](https://arxiv.org/abs/2505.17433)

### StickerConv
Sticker-conversation research lead; media access caveats were raised in discussion.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://github.com/ZhangYiqun018/StickerConv)

## Reference-selection research

### Learning When and What to Quote
Quotation recommendation; closest prior task discussed for dialogue replies.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://aclanthology.org/2022.findings-emnlp.225/)

### Quotation Recommendation and Interpretation Based on Transformation from Queries to Quotations
Query-to-quotation associations and interpretation.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://aclanthology.org/2021.acl-short.95/)

### MAC/FAC: A Model of Similarity-Based Retrieval
Cognitive model referenced for retrieval versus structural matching.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://onlinelibrary.wiley.com/doi/10.1207/s15516709cog1902_1)

### Learning in the Rational Speech Acts Model
Speaker/listener intention and pragmatics lead.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://arxiv.org/abs/1510.06807)

### Beyond the Literal
Pragmatic-intent preprint link from earlier discussion; bibliographic details not revalidated here.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://arxiv.org/abs/2606.03604)

### Personalized Language Modeling from Personalized Human Feedback
Preference-learning lead; not a humour-specific result asserted here.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://arxiv.org/abs/2402.05133)

### MemeBench
Meme-understanding preprint link from earlier discussion; details not revalidated here.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://arxiv.org/abs/2607.27798)

### Reasoning-intensive retrieval lead
Earlier query-expansion/retrieval citation; retained without reasserting its experimental claims.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://arxiv.org/abs/2508.07995)

## Jev and retrieval tooling

### TypeSafe System One models and Jev
Original vendor introduction discussed for catalogue selection.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://typesafe.ai/blog/introducing-system-one-models-and-jev)

### Jev Choice
Future selector interface lead; no Jev integration is implemented.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://docs.typesafe.ai/primitives/choice)

### Jev skill-suggestion cookbook
Catalogue-selection example from earlier discussion.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://docs.typesafe.ai/cookbooks/skill_suggestion)

### Jev state and input modalities
Input representation documentation lead.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://docs.typesafe.ai/concepts/state)

### Jev models
Model/language/pricing lead; no old price or model-limit claim is treated as current.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://docs.typesafe.ai/models)

### Jev jaggedness
Earlier limitations page; model/version scope must be rechecked before conclusions.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://docs.typesafe.ai/model-jaggedness/jev-1.13)

### Jev confidence
Scoring documentation; a distribution is not a human humour rating.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://docs.typesafe.ai/confidence)

### pgvector
Possible retrieval component later, not an MVP dependency.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://github.com/pgvector/pgvector)

## Story memory and audio — parked

### Pocket FM Sherpa
Original product considered for story memory and audio ideas.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://pocketfm.com/sherpa)

### Pocket FM Narrative World Model
Story-memory paper lead from the discussion.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://arxiv.org/abs/2607.05577)

### Pocket FM listener-agent audit
Earlier audience-model evaluation lead; original PDF is linked, not bundled.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://pocketfm.com/about-us/research/listener-agents.pdf)

### SAGA — Script-to-Audio Generation Agent
Later music/sound-effect planning lead; no BGM work in v0.1.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://pocketfm.com/about-us/research/saga.pdf)

## Additional access and discovery references

### GIPHY API documentation
Earlier provider constraints lead; no integration or dataset collected.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://developers.giphy.com/docs/api/)

### Tenor support notice
Earlier service-status reference; consult current notice before using it.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://support.google.com/tenor/answer/10455265?hl=en)

### Imgflip template browser
Human browsing entry point.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://imgflip.com/memetemplates)

### Know Your Meme home
Context-reference entry point.

**Status:** `prior_conversation_reference_not_reverified_in_handoff`.

- [Reference 1](https://knowyourmeme.com/)

## Additional per-reference context links

### It's a Trap! context reference
Preserved provenance link for the supplied annotation.

**Status:** `original_record_check_reference_link_only_not_independently_read`.

- [Reference 1](http://knowyourmeme.com/memes/its-a-trap)

### Ain't Nobody Got Time for That context reference
Preserved provenance link for the supplied annotation.

**Status:** `original_record_check_reference_link_only_not_independently_read`.

- [Reference 1](https://knowyourmeme.com/memes/sweet-brown-aint-nobody-got-time-for-that)

### Do You Want Ants? context reference
Preserved provenance link for the supplied annotation.

**Status:** `original_record_check_reference_link_only_not_independently_read`.

- [Reference 1](http://knowyourmeme.com/memes/do-you-want-ants)

### Life Finds a Way context reference
Preserved provenance link for the supplied annotation.

**Status:** `original_record_check_reference_link_only_not_independently_read`.

- [Reference 1](https://www.youtube.com/watch?v=dMjQ3hA9mEA)

### Milk Was a Bad Choice context reference
Preserved provenance link for the supplied annotation.

**Status:** `original_record_check_reference_link_only_not_independently_read`.

- [Reference 1](https://www.youtube.com/watch?v=DeY0yPqibb0)

### It Ain't Much, But It's Honest Work context reference
Preserved provenance link for the supplied annotation.

**Status:** `original_record_check_reference_link_only_not_independently_read`.

- [Reference 1](https://knowyourmeme.com/memes/but-its-honest-work)

### Why Shouldn't I Keep It? context reference
Preserved provenance link for the supplied annotation.

**Status:** `original_record_check_reference_link_only_not_independently_read`.

- [Reference 1](https://knowyourmeme.com/memes/after-all-why-not-why-shouldnt-i-keep-it)

### What's in the Box? context reference
Preserved provenance link for the supplied annotation.

**Status:** `original_record_check_reference_link_only_not_independently_read`.

- [Reference 1](https://screenrant.com/hilarious-se7en-memes/)

### I Was Told There Would Be Cake context reference
Preserved provenance link for the supplied annotation.

**Status:** `original_record_check_reference_link_only_not_independently_read`.

- [Reference 1](https://www.youtube.com/watch?v=mDOKGa92NRo)

### I Am the Captain Now context reference
Preserved provenance link for the supplied annotation.

**Status:** `original_record_check_reference_link_only_not_independently_read`.

- [Reference 1](https://www.youtube.com/watch?v=dvA-mimf2yg)

### A Center for Ants? context reference
Preserved provenance link for the supplied annotation.

**Status:** `original_record_check_reference_link_only_not_independently_read`.

- [Reference 1](http://knowyourmeme.com/memes/what-is-this-a-center-for-ants)

### You Were the Chosen One! context reference
Preserved provenance link for the supplied annotation.

**Status:** `original_record_check_reference_link_only_not_independently_read`.

- [Reference 1](http://knowyourmeme.com/memes/you-were-the-chosen-one)

### I Feel Like I'm Taking Crazy Pills context reference
Preserved provenance link for the supplied annotation.

**Status:** `original_record_check_reference_link_only_not_independently_read`.

- [Reference 1](http://knowyourmeme.com/memes/i-feel-like-im-taking-crazy-pills)

### Stop Trying to Make Fetch Happen context reference
Preserved provenance link for the supplied annotation.

**Status:** `original_record_check_reference_link_only_not_independently_read`.

- [Reference 1](http://knowyourmeme.com/memes/stop-trying-to-make-fetch-happen)

### First Try! context reference
Preserved provenance link for the supplied annotation.

**Status:** `original_record_check_reference_link_only_not_independently_read`.

- [Reference 1](https://www.youtube.com/watch?v=44-RsrF_V_w)

### Michael Scott No God No context reference
Preserved provenance link for the supplied annotation.

**Status:** `original_record_check_reference_link_only_not_independently_read`.

- [Reference 1](https://www.youtube.com/watch?v=31g0YE61PLQ)

### Shut Up and Take My Money! context reference
Preserved provenance link for the supplied annotation.

**Status:** `original_record_check_reference_link_only_not_independently_read`.

- [Reference 1](http://knowyourmeme.com/memes/shut-up-and-take-my-money)

### Facepalm context reference
Preserved provenance link for the supplied annotation.

**Status:** `original_record_check_reference_link_only_not_independently_read`.

- [Reference 1](http://knowyourmeme.com/memes/facepalm)

### Afraid to Ask Andy context reference
Preserved provenance link for the supplied annotation.

**Status:** `original_record_check_reference_link_only_not_independently_read`.

- [Reference 1](http://knowyourmeme.com/memes/afraid-to-ask-andy)

## Implementation documentation

### Ollama chat endpoint
Native text-chat request/response contract.

**Status:** `official_documentation_read_for_this_handoff_2026-09-19`.

- [Reference 1](https://docs.ollama.com/api/chat)

### Ollama structured outputs
JSON-schema response format used by the native adapter.

**Status:** `official_documentation_read_for_this_handoff_2026-09-19`.

- [Reference 1](https://docs.ollama.com/capabilities/structured-outputs)

### Ollama compatibility
Chat-completions-compatible request and response example.

**Status:** `official_documentation_read_for_this_handoff_2026-09-19`.

- [Reference 1](https://docs.ollama.com/api/openai-compatibility)

