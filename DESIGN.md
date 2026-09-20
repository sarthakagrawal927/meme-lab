# Meme Lab design contract

## Direction

Meme Lab uses the owner-selected **Clean Canvas** system: a crisp white workspace, pale-blue surfaces, mint and yellow state accents, restrained borders, friendly type, and minimal decoration. It should feel like a small, pleasant personal tool rather than a landing page, dark console, meme feed, or generic card dashboard.

## Hierarchy

- The comment composer and **Find the meme** action are the first-viewport focus.
- The best match receives the strongest image and type hierarchy.
- Up to four backups stay compact and clearly secondary in a two-column grid.
- For multi-person comments, label each result by perspective and introduce the alternatives as other angles on the same moment.
- Contextual fit remains the primary score. Meme strength and image quality appear as one quiet supporting sentence.
- Low confidence is visibly labelled without hiding the result. A no-meme decision gets its own calm, unambiguous state.
- Collection and How it works remain simple secondary navigation surfaces.

## Interaction rules

- Load image previews automatically from allowlisted providers and fall back to the reference name without blocking the result.
- Keep the input examples as complete, natural sentences so people understand they can describe the whole situation.
- Keep result cards immediate and scannable: image, meme name, perspective, fit score, and quiet catalogue signals without generated reasoning.
- Keep all four ranked backups visible and use their fit scores to make weak options obvious.
- Keep one-tap feedback close to the result and state its 30-day retention.
- Keep all 3,000 references searchable and paginated; no experimental/live filtering exists in the personal tool.
- Media provenance stays visible: distinguish CC0 open originals from source previews whose redistribution rights are not established.

## Responsive behavior

Use a two-column best-result layout and a two-column grid of up to four compact backup cards when space permits. Stack the result, controls, alternatives, and footer on narrow screens. Preserve readable controls, touch targets, focus indicators, bottom-aligned page footers, and zero page-level horizontal overflow at 390 px.

## Evidence

Design-workflow artifacts live in `artifacts/design/`; the current receipt is `.fleet/design-review.json`.
