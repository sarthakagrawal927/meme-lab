# Source audit

Review date: 2026-09-19.

This is a source-fit assessment for contextual English meme replies, not a benchmark of humour quality. Checks were selective: official documentation, live public catalogue responses, selected entries, and relevant terms. There was no full-site scrape, authenticated API evaluation, bulk media download, or legal clearance.

## Decision

Use Imgflip and Memegen for a selected asset-reference catalogue. Use Know Your Meme and Reaction GIFs to investigate cultural meaning and usage. The other sources are discovery channels, future dialogue extensions, or permission-dependent integrations.

## 1. Imgflip

**Role:** Primary template catalogue

**Recommendation:** Use a selected catalogue subset; do not equate a blank template with a finished reply.

**Observed:**

- A live get_memes response returned IDs, names, asset URLs, dimensions and template box counts.
- The response includes broadly used English-oriented formats such as This Is Fine, Two Buttons and Absolute Cinema.

**Access:** Public catalogue endpoint read successfully. Paid search and caption endpoints not exercised.

**Context:** Names and template metadata; no validated situation-to-reaction labels.

**Included:** 40 source-listed URLs retained. Four of those images were visually spot-checked; not a complete image download.

**Limitations:** Popularity/captioning activity is not a quality or conversational-fit score. Underlying media rights were not established. Provider search has caching/integration requirements; do not assume the same rules apply to every endpoint.

**Primary references:**

- https://imgflip.com/api
- https://api.imgflip.com/get_memes


## 2. Memegen

**Role:** Primary structured template/example catalogue

**Recommendation:** Use selected named records and source-listed examples; deduplicate and inspect before display.

**Observed:**

- The live catalogue exposes template IDs, names, blank and example URLs, keywords and source links.
- The observed response contained duplicate astronaut and db IDs and an incomplete both record.

**Access:** Public catalogue read successfully. No bulk media download completed.

**Context:** Metadata and reference leads, not reliable standalone usage explanations.

**Included:** 20 source-listed URLs retained: 19 example URLs and one blank facepalm image. Facepalm was visually spot-checked.

**Limitations:** Example captions can be situation-specific, not universal reactions. The software repository licence does not establish clearance of underlying movie, TV or other images. Not every source link was independently read.

**Primary references:**

- https://github.com/jacebrowning/memegen
- https://api.memegen.link/templates/


## 3. Know Your Meme

**Role:** Cultural-context reference

**Recommendation:** Use selected entries to investigate meaning, variations and origin; keep factual claims distinct from proposed uses.

**Observed:**

- The site describes editorial/community research with review by editors and moderators.
- Selected entries explain meaning and usage beyond the image appearance.

**Access:** About page and selected meme pages read. No public bulk export or supported bulk API verified.

**Context:** The strongest cultural reference source in this comparison, as an assessment of the inspected pages, not a measured benchmark.

**Included:** No media copied from this source.

**Limitations:** An explanatory article is not a set of human preference labels. Do not assume bulk copying or redistribution permission.

**Primary references:**

- https://knowyourmeme.com/about
- https://knowyourmeme.com/memes/this-is-fine
- https://knowyourmeme.com/memes/absolute-cinema
- https://knowyourmeme.com/memes/you-guys-are-getting-paid
- https://knowyourmeme.com/memes/monkey-puppet


## 4. Reaction GIFs

**Role:** Usage-context reference and future reaction assets

**Recommendation:** Prioritize for reaction-use ideas; do not pretend page descriptions are a downloadable licensed GIF dataset.

**Observed:**

- Several inspected entries include How It’s Used sections.
- The Stone Cold entry describes a shift from amusement into seriousness when a statement turns out not to be a joke.

**Access:** Home, tag index and selected entries read. Raw media links for the evaluated pages could not be resolved with the available web tool; no bulk export/API verified.

**Context:** Strong direct relevance to choosing replies; editorial claims were not systematically fact-checked.

**Included:** Five additional page-level leads are supplied separately without direct media URLs. None is counted among the core 60.

**Limitations:** GIF timing may carry meaning that a still frame loses. Do not train on guessed actor/origin credits. No media redistribution permission established.

**Primary references:**

- https://www.reactiongifs.com/
- https://www.reactiongifs.com/stone-cold-laugh-turns-serious/
- https://www.reactiongifs.com/jack-nicholson-nodding-yes/
- https://www.reactiongifs.com/jeremiah-johnson-nodding/
- https://www.reactiongifs.com/leonardo-dicaprio-gatsby-cheers/
- https://www.reactiongifs.com/you-sit-on-a-throne-of-lies/


## 5. KLIPY

**Role:** Hosted catalogue/API integration

**Recommendation:** Evaluate with an authorized API key when you need maintained GIF/meme/clip delivery, rather than a static dataset dump.

**Observed:**

- Official developer pages offer meme, GIF, sticker and clip APIs.
- The documentation distinguishes standard media delivery from approved caching integrations.

**Access:** Developer documentation inspected. No authenticated request, production approval or catalogue-wide sample inspected.

**Context:** Search/API availability is documented; actual relevance quality was not tested.

**Included:** No data or media included.

**Limitations:** Published integration/caching requirements must be followed. Provider marketing scale claims are not benchmark evidence.

**Primary references:**

- https://klipy.com/developers
- https://docs.klipy.com/memes-api
- https://docs.klipy.com/attribution


## 6. GIFDB

**Role:** Manual discovery only in this release

**Recommendation:** Exclude from automated collection without permission.

**Observed:**

- The site has ready-made reaction categories.
- Its Access section says ordinary automated scripts/bots are not the intended access method, except public XML RSS feeds.
- Its Linking section restricts direct large-file linking and integration without permission.

**Access:** Category and terms pages inspected; no automated media collection undertaken.

**Context:** Category labels are broad; no systematic situation-use annotations verified.

**Included:** No data or media included.

**Limitations:** Terms are a concrete collection blocker for the proposed bulk dataset, not merely an absent API.

**Primary references:**

- https://gifdb.com/memes
- https://gifdb.com/terms/


## 7. Memedroid

**Role:** Discovery of community memes

**Recommendation:** Use for discovering candidates, not as automatically trusted training labels.

**Observed:**

- The inspected site exposes finished user-submitted memes, tags, votes and time-window browsing.

**Access:** Home and terms inspected. No bulk export or supported API verified.

**Context:** Votes signal engagement with a post, not appropriateness as a reply to a different conversation.

**Included:** No data or media included.

**Limitations:** Topic-specific captions and variable moderation make blind ingestion unsuitable. Bulk access and redistribution rights not established.

**Primary references:**

- https://www.memedroid.com/
- https://www.memedroid.com/tos


## 8. Memebase / Cheezburger

**Role:** Editorial discovery feed

**Recommendation:** Use to discover formats and finished examples; do not treat collections as clean reaction records.

**Observed:**

- The site publishes themed collections of memes and internet humour.

**Access:** Home and terms inspected. No structured bulk export or supported dataset API verified.

**Context:** Collection-level editorial framing; uneven per-image context.

**Included:** No data or media included.

**Limitations:** A compilation can mix formats, screenshots and content that only makes sense in its original post. Bulk permissions not established.

**Primary references:**

- https://memebase.cheezburger.com/
- https://cheezburger.com/terms-of-service


## 9. Frinkiac

**Role:** Dialogue/frame retrieval for The Simpsons

**Recommendation:** A strong source to investigate in the dialogue phase; not a general meme corpus.

**Observed:**

- The creator’s May 2026 account describes improved subtitle alignment, neighbouring transcripts and GIF/comic tools.
- It describes deduplicating neighbouring frames so search results do not overrepresent one scene.

**Access:** Creator documentation read. The application was not fully inspectable in the text browser; no supported bulk export verified.

**Context:** Dialogue and local scene context are useful; conversational deployment labels are still missing.

**Included:** No frames, subtitles or media included.

**Limitations:** One-show cultural scope. A site supporting sharing is not blanket permission to distribute its entire media archive.

**Primary references:**

- https://frinkiac.com/
- https://langui.sh/2026/05/04/ten-years-of-frinkiac/


## 10. Morbotron

**Role:** Dialogue/frame retrieval for Futurama

**Recommendation:** A focused dialogue extension after meme selection works.

**Observed:**

- The creator describes search, meme and GIF functionality for Futurama.
- The May 2026 modernization account says the shared updates are live on both Frinkiac and Morbotron.

**Access:** Creator launch and modernization accounts read. No supported bulk export verified.

**Context:** Scene/transcript context; not human-ranked reply preferences.

**Included:** No media included.

**Limitations:** Do not use the 2016 launch counts as current catalogue size. One-show scope and unresolved bulk media rights.

**Primary references:**

- https://morbotron.com/
- https://langui.sh/2016/08/08/morbotron-futurama/
- https://langui.sh/2026/05/04/ten-years-of-frinkiac/


## 11. Clip.Cafe

**Role:** Movie/TV scene discovery

**Recommendation:** Reserve for dialogue research or an explicitly authorized integration; exclude from this archive.

**Observed:**

- The site offers transcript/scene-description searches with movie, character and duration filters.
- The terms state access for personal use subject to restrictions and reserve intellectual-property rights.

**Access:** Interface and terms inspected. No open bulk dataset or approved app integration verified.

**Context:** Potentially useful scene context; retrieval suitability for meme replies not benchmarked.

**Included:** No clips, scripts or transcripts included.

**Limitations:** Personal-use website access is not a demonstrated right to package clips in a public dataset.

**Primary references:**

- https://clip.cafe/
- https://clip.cafe/termsandconditions/


## 12. Meme Depot

**Role:** Curated-collection discovery

**Recommendation:** Interesting material to browse, but not a verified exportable dataset backbone.

**Observed:**

- The landing page describes saving images/GIFs/videos with AI tagging and searchable collections.

**Access:** Public landing page and visible collection descriptions inspected; no public API or export verified.

**Context:** AI tags may assist discovery; label quality and cultural coverage were not tested.

**Included:** No data or media included.

**Limitations:** Collection counts need not represent unique reusable reactions. No blanket reuse permission established.

**Primary references:**

- https://memedepot.com/

