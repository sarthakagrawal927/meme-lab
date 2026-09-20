# Meme Lab design contract

## Direction

Meme Lab uses the owner-selected **Clean Canvas** system: a crisp white workspace, pale-blue surfaces, mint and yellow state accents, restrained borders, friendly type, and minimal decoration. It should feel like a small, pleasant personal tool rather than a landing page, dark console, meme feed, or generic card dashboard.

## Hierarchy

- The comment composer and **Find the meme** action are the first-viewport focus.
- The best match receives the strongest image and type hierarchy.
- Up to two alternatives stay compact and clearly secondary.
- Contextual fit remains the primary score. Meme strength and image quality appear as one quiet supporting sentence.
- Low confidence is visibly labelled without hiding the result. A no-meme decision gets its own calm, unambiguous state.
- Collection and How it works remain simple secondary navigation surfaces.

## Interaction rules

- Load image previews automatically from allowlisted providers and fall back to the reference name without blocking the result.
- Preserve sentence-based explanations that name the meme and map it to a concrete detail in the comment.
- Never pad the alternatives list with misleading options.
- Keep one-tap feedback close to the result and state its 30-day retention.
- Keep all 3,000 references searchable and paginated; no experimental/live filtering exists in the personal tool.
- Media provenance stays visible: distinguish CC0 open originals from source previews whose redistribution rights are not established.

## Responsive behavior

Use a two-column best-result layout and two compact alternative cards when space permits. Stack the result, controls, alternatives, and footer on narrow screens. Preserve readable controls, touch targets, focus indicators, bottom-aligned page footers, and zero page-level horizontal overflow at 390 px.

## Evidence

Design-workflow artifacts live in `artifacts/design/`; the current receipt is `.fleet/design-review.json`.
