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

This is deliberate, and it is the reason `TxTextMorph` and `TxLiquid` settle on the same curves.
(`TxSlider`'s thumb left this compiler on 2026-09-06: it and every sliding indicator now integrate
the jelly spring per frame through `utils/animation/jelly.ts` / `utils/use-jelly-indicator.ts`,
because their targets move under them; see component-guidelines "Sliding indicators ride
`useJellyIndicator`".) Do not reintroduce a second spring compiler, and do not "tidy" the
cross-directory import away — `liquid/src/spring.ts` is a leaf module with no Vue and no CSS,
so importing it costs nothing.

One deviation worth knowing: `easingFunction` never returns `null` (an unparsable spec
degrades to a clamped linear ramp) where upstream's `parseEasing` did. The `null` branches in
`container.ts` are kept anyway so a future resolver change cannot fall through unnoticed.

### Frame-driven motion uses `springSteps`, not a new integrator

`resolveTransition` compiles a preset into a fixed CSS `linear()` curve, and a fixed curve
always starts from rest: retarget it mid-flight and the motion restarts at zero velocity. Motion
that JS draws frame by frame (SVG geometry, a path `d`, per-frame transforms) and that must keep
its momentum through a retarget integrates the **same presets** with `springSteps` (added
2026-09-26 for `TxFusionSurface`; the core-app send split uses it through the
`@talex-touch/tuffex/fusion-surface` re-export).

```ts
// liquid/src/spring.ts
export function springSteps(
  position: number,
  velocity: number,
  target: number,
  config: TransitionPreset | SpringConfig,
  dt: number, // wall-clock seconds since the last frame
): [position: number, velocity: number]
```

| Input | Result |
|---|---|
| `dt <= 0` or `NaN` | `[position, velocity]` unchanged |
| unknown preset name | integrates `presets.smooth` |
| missing / non-finite `stiffness` / `damping` / `mass` | that field falls back to `300 / 24 / 1` (the raw-spring default `resolveTransition` uses) |
| integration produces a non-finite value | `[target, 0]` — a frame loop only sleeps once its springs rest, and `NaN` never does |
| a long frame (2 s) | more substeps, never a bigger one; lands on the target instead of diverging |

- Substeps are capped at `DT = 1/240 s`, the step `simulate()` compiles the CSS curves with —
  **not** the 1/60 s cap in `observer.ts`'s private `springSteps`. At 1/60 s snappy drifts
  10.7% off its own compiled curve (smooth 5.7%, bouncy 10.1%), so a JS-driven and a CSS-driven
  element on one preset would visibly disagree; at 1/240 s the gap is 0.2%.
- `observer.ts` keeps its private copy on purpose (upstream port, kept diffable). Do not
  "dedupe" it onto `springSteps`: its 1/60 s cap is part of how `TxLiquid` currently looks.
- Guarded by `liquid/__tests__/spring.test.ts`: it traces the compiled curve within 1%, survives a
  2 s frame, is slice-invariant, keeps velocity across a retarget, and never returns `NaN`.

```ts
// Wrong — a new hand-rolled spring for new frame-driven motion: its own constants, step and drift
v += (k * (target - x) - c * v) * dt; x += v * dt

// Correct — the library's presets, the library's step
;[x, v] = springSteps(x, v, target, 'smooth', dt)
```

Carve-out: sliding indicators keep `useJellyIndicator`'s own per-frame integrator (Radio's
reference feel, extracted unchanged; JELLY 110/12, `dt ≤ 24 ms`). Porting it onto `springSteps`
would re-tune every indicator's feel, so do not "dedupe" it — see component-guidelines "Sliding
indicators ride `useJellyIndicator`" → "Relation to springSteps".

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
| `TxModeChip` | Label goes through `TxTextTransformer mode="fade"` (a whole-label blur crossfade, as in its motion reference), 50ms behind the icon; the chip FLIPs its own width, and narrows the layers' transition to `opacity, filter` so an inherited ink change never eases. |

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
- **The fade path must commit its setup state before it animates** (fixed 2026-09-24; before
  that, fade mode had never faded in).
  - `runTransition` sets `has-prev`, which parks the current layer at opacity 0 plus blur, then
    sets `is-animating` inside a `requestAnimationFrame`.
  - A rAF callback runs *before* that frame's style recalc, so both classes landed in one
    recalc and nothing transitioned. The new text appeared at once, and only the old one
    blurred out.
  - The fix has two halves, and both are load-bearing:
    - `.has-prev:not(.is-animating) .tx-text-transformer__layer { transition: none }`, so the
      setup state applies instantly instead of starting a 1→0 tween;
    - `void root.offsetWidth` after the `nextTick` and before the rAF, so it is committed.
  - `text-transformer.test.ts` spies on the forced read (exactly one, taken in the setup
    state), and a style-contract test pins the rule.
  - Any future "set class A, then class B next frame" animation needs the same treatment.

## Verification

- `packages/tuffex/packages/components/src/text-morph/__tests__/engine.test.ts` — segmentation,
  diff pairing, place-value matching, the spring fusion contract, reduced-motion fallback.
- `packages/tuffex/packages/components/src/text-morph/__tests__/text-morph.test.ts` — component
  mount, value updates, teardown.
- jsdom ships no WAAPI. `engine/metrics.ts` routes every `element.animate` call through
  `animateElement`, which returns `null` and lets callers settle straight to the end state.
  Tests that need to observe timing install a `HTMLElement.prototype.animate` stub.
