# Meme Lab design contract

## Direction

Meme Lab uses the owner-selected **Clean Canvas** system: a crisp white workspace, pale-blue navigation, mint/yellow state accents, restrained borders and minimal decoration. It should feel like a small, pleasant local tool rather than a landing page, dark console, meme feed or generic card dashboard.

## Hierarchy

- The context composer and experiment controls are the operational core and begin in the first viewport.
- **Run blind A/B** is the recommended primary action.
- Single model selection and the lexical control are secondary diagnostic actions.
- A/B arms must have equal visual authority and conceal representation labels and rationales until review.
- History groups paired arms and reports condition-specific numerators and denominators.
- Catalogue, sources and history remain secondary navigation surfaces in the workspace rail.

## Interaction rules

- Pre-label whether humour belongs before running a pair.
- Keep context, style, pool and model fixed across both arms.
- Show candidate names for judgment; hide condition identity and fit explanations.
- Require a review of every successful arm before reveal.
- Permit append-only revisions and identify the latest review.
- Automatically load candidate previews from the established allowlisted image providers; fail back to the reference name without blocking review.
- Model failures remain visible and never become keyword results.

## Responsive behavior

Use two columns for paired arms when space permits. Keep setup compact and full-width so the situation is easy to scan before comparison. On narrow screens, turn the workspace rail into a horizontal navigation strip and stack controls, arms, score cells and history arms. Preserve readable controls, touch targets, focus indicators and zero page-level horizontal overflow at 390 px.

## Evidence

Design-workflow artifacts live in `artifacts/design/`; the current receipt is `.fleet/design-review.json`.
