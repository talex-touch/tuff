# TuffEx Text Motion

> Which animation a changing text value gets, and where the engine behind it lives.

---

## One engine for text value changes

`packages/tuffex/packages/components/src/text-morph/src/engine/` is the only place TuffEx
animates a text value changing. It is a port of [lochie/torph](https://github.com/lochie/torph)
(MIT), landed 2026-09-08.

Do not write a second one. Before adding any per-character, per-digit, or crossfade
animation to a component, check whether `TxTextMorph` already expresses it.

The engine's shape, in the order a morph runs:

1. **segment** — `Intl.Segmenter` cuts the value into words (spaced values) or graphemes
   (unspaced ones), with an ID allocator guaranteeing uniqueness across the whole value.
   Numeric words are re-cut per character in a second pass, carrying a `digit`/`symbol` kind.
2. **diff** — word-level LCS, then an exact-match reorder pass, then similarity pairing
   (`MIN_SIMILARITY = 0.4`). Paired words diff again at the character level, so survivors
   keep their element and their identity.
3. **number** — digits pair by distance from the decimal separator, not left to right.
   A magnitude jump of `MAGNITUDE_JUMP = 3` places or more carries nothing.
4. **flip / dom** — one measuring pass over every child of the root, transform subtracted so
   the reading stays subpixel; exiting segments leave the flow before reconciliation.
5. **animate** — WAAPI, not CSS transitions, because only WAAPI can be asked how far a
   running animation got when the next morph interrupts it.

## The spring comes from `liquid/src/spring.ts`

`engine/container.ts` and `engine/morph.ts` import `resolveTransition` and `easingFunction`
from `packages/tuffex/packages/components/src/liquid/src/spring.ts`. Upstream torph shipped
its own spring compiler and CSS-easing parser; both were dropped in the port.

This is deliberate, and it is the reason `TxTextMorph`, `TxLiquid` and `TxSlider` all settle
on the same curves. Do not reintroduce a second spring compiler, and do not "tidy" the
cross-directory import away — `liquid/src/spring.ts` is a leaf module with no Vue and no CSS,
so importing it costs nothing.

One deviation worth knowing: `easingFunction` never returns `null` (an unparsable spec
degrades to a clamped linear ramp) where upstream's `parseEasing` did. The `null` branches in
`container.ts` are kept anyway so a future resolver change cannot fall through unnoticed.

## Styles are not scoped, on purpose

Every segment is built with `document.createElement`, so it never receives the `data-v-*`
attribute a `<style scoped>` block keys on. `TxTextMorph.vue`'s style block is therefore
**unscoped**, and containment comes from the `tx-morph-*` attribute names instead.

Two rules there are load-bearing and must not be simplified:

- `[tx-morph-slot]` uses `clip-path: inset(0 -100vw)`, **not** `overflow`. An inline-block
  whose overflow is anything but `visible` has its baseline synthesized to the bottom margin
  edge (CSS 2.1 §10.8.1), which drops every digit off the text baseline.
- `[tx-morph-sr]` is clipped rather than `display: none`, or the accessible value leaves the
  a11y tree along with it, and carries `user-select: none`, or a copied selection pastes the
  value twice.

## What each component uses

| Component | Behaviour |
|---|---|
| `TxTextMorph` | The engine itself, full surface. |
| `TxTextTransformer` | `mode="morph"` by default (renders `TxTextMorph`); `mode="fade"` is the original blur crossfade. |
| `TxBadge` | Numeric values render through `TxTextMorph`. |
| `TxSwitch` | Labels go through `TxTextTransformer`, so they morph. |

`TxTextTransformer` forces `fade` regardless of `mode` in two cases, both structural rather
than stylistic: the default slot is in play (a slot renders arbitrary nodes and the engine
owns plain-text segments it builds itself), or `wrap` is on (the engine lays its segments out
on one nowrap line and animates the container's width, which a reflowing value cannot be
measured against). Neither is negotiable from the call site.

## Consequences to plan around

- **No truncation under morph.** `.tx-text-transformer.is-morph` sets `overflow: visible`,
  because exiting segments sit wherever the old value put them — routinely past the new
  width — and clipping cuts the exit in half. A value that must ellipsise wants `mode="fade"`.
- **`@number-flow/vue` is gone** from both `packages/tuffex` and `apps/nexus` (2026-09-08).
  Numeric animation is first-party now; do not add it back.
- **Vue stops owning the children after mount.** The component renders the initial value once
  for SSR hydration and then freezes; re-rendering there wipes the segments mid-morph.
- **Reduced motion clears the segment record.** `disabled` and
  `prefers-reduced-motion: reduce` both write `textContent` directly *and* reset
  `previousSegments` / `isInitialRender`. Skipping that reset makes the next enabled morph
  FLIP against elements that are no longer in the DOM.

## Verification

- `packages/tuffex/packages/components/src/text-morph/__tests__/engine.test.ts` — segmentation,
  diff pairing, place-value matching, the spring fusion contract, reduced-motion fallback.
- `packages/tuffex/packages/components/src/text-morph/__tests__/text-morph.test.ts` — component
  mount, value updates, teardown.
- jsdom ships no WAAPI. `engine/metrics.ts` routes every `element.animate` call through
  `animateElement`, which returns `null` and lets callers settle straight to the end state.
  Tests that need to observe timing install a `HTMLElement.prototype.animate` stub.
