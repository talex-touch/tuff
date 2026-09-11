# FlatRadio xl size and silky indicator motion

## Goal

Two complaints on the Nexus component gallery's FlatRadio cell (screenshot, 2026-09-11):
the control reads tiny inside a 236px stage, its motion is not silky, and the cell only
shows one basic specimen while neighbouring cells show a ladder.

Fix all three without moving any existing caller: add an `xl` tier on top of the size
ladder (defaults unchanged), make the sliding indicator genuinely smooth, and rebuild the
gallery cell into a multi-row showcase.

## Requirements

### R1 — New `xl` size, existing tiers untouched

- `TxFlatRadioSize` gains `'xl'`; `sm` / `md` / `lg` keep their current geometry values
  (24/30/36px height) and `md` stays the default.
- Every existing caller renders byte-identically: `StoreHeader` (`sm` ×2),
  `SettingLanguage`, `TuffBlockFlatRadio` (default `sm`), `TxFineTuneCard`,
  `PromptBarPromptBarDemo` (`sm`), `AiSuiteChatShowcaseDemo` (`sm`), and all seven
  `FlatRadio*Demo.vue` files.
- `TxFineTuneCard` drives geometry by passing `--tx-flat-radio-*` as a fallthrough inline
  `style`. That override mechanism must keep working, so sizing stays delivered as inline
  CSS variables from the component — it must not move to size classes.
- `TuffBlockFlatRadio.radioSize` in core-app duplicates the union by hand; it must accept
  `xl` too.

### R2 — Silky indicator motion

"Silky" is not a feeling here, it is these five defects:

1. **Selecting an item changes its own measured width.** `.is-selected` flips
   `font-weight` 400 → 500, which reflows that item, shifts its siblings, and moves the
   indicator's target mid-flight. Selection must not change any item's measured width.
2. **The thumb slides and resizes on two different curves.** `transform` runs
   `0.25s cubic-bezier(0.34, 1.56, 0.64, 1)` (overshoot) while `width` runs
   `0.2s cubic-bezier(0.4, 0, 0.2, 1)`. Travel and resize must share one duration and one
   curve so the thumb reads as a single body.
3. **Integer-rounded geometry.** `offsetLeft` / `offsetWidth` round to whole pixels, so the
   thumb lands up to 1px off its item. Geometry must be sub-pixel accurate.
4. **No press feedback.** Pressing an item does nothing until the mouse is released.
5. **No `prefers-reduced-motion` support.** The indicator animates regardless.

### R3 — Gallery cell shows the component's range

- `DocsComponentsGallery.vue`'s FlatRadio cell becomes a centered stack of rows, following
  the IconChip cell's idiom (`docs-gallery__stack--center` + `docs-gallery__row`).
- The `xl` text control is the hero row; the remaining rows cover icon+label and
  multi-select, so the cell shows what the component can do rather than one specimen.
- The cell keeps its `ClientOnly` + `docs-gallery__ph` fallback and stays inside the
  existing `236px` stage at both grid widths (two-column ≥640px, single-column below).

### R4 — Docs stay true (binding: `.trellis/spec/frontend/tuffex-docs-sync.md`)

- Blast radius resolved: own pages `flat-radio.{zh,en}.mdc`; in-repo consumer
  `TxFineTuneCard` → `fine-tune-card.{zh,en}.mdc`; passing mentions in
  `index.{zh,en}.mdc` and `ai-suite.{zh,en}.mdc` make no behavioural claim.
- `xl` and the motion contract land in the size prose, the Props table, the Interaction
  Contract, Best Practices, and Review Notes → verified coverage — placed by meaning, not
  appended.
- `FlatRadioSizesDemo.vue` gains an `xl` row; zh and en stay section-for-section identical.

## Acceptance Criteria

- [ ] `size="xl"` renders a taller, roomier control; `sm` / `md` / `lg` CSS-variable values
      are unchanged from `master` and `md` is still the default.
- [ ] A test asserts selecting an item leaves every item's measured width unchanged.
- [ ] A test asserts `transform` and `width` share one duration and one timing function on
      `.tx-flat-radio__indicator` (replaces the current `/transform 0\.25s/` assertion).
- [ ] Indicator geometry comes from fractional rects, not `offsetLeft` / `offsetWidth`.
- [ ] Pressing an item gives visible feedback before release.
- [ ] Under `prefers-reduced-motion: reduce` the indicator jumps instead of animating.
- [ ] `TuffBlockFlatRadio.radioSize` accepts `'xl'` and core-app `typecheck:web` is clean.
- [ ] The gallery FlatRadio cell renders ≥3 rows, fits the 236px stage, and does not
      overflow at 640px — confirmed on a screenshot of the live page, not by reading CSS.
- [ ] `packages/tuffex`: `test`, `lint`, `typecheck` green.
- [ ] `apps/nexus`: `check:doc-parity`, `check:mdc-fences`, `check:demo-registry` green.

## Out of Scope

- Retuning `sm` / `md` / `lg` (the user chose "add `xl`, defaults unchanged" over
  "raise the whole ladder" on 2026-09-11).
- Migrating any existing call site onto `xl`.
- Other gallery cells.

## Notes

- A Nexus dev server is live on `:3200`. `tuffex-docs-sync.md` records that
  `pnpm typecheck` / `nuxt typecheck` / core-app `typecheck:web` kill or 503 it; batch
  those with the server stopped, and restart with `pnpm -C apps/nexus dev:pure`.
- `audit:vocab` is report-only by design, so a fourth vocabulary value fails no gate.
