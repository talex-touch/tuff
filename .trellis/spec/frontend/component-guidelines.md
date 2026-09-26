# Component Guidelines

> How Vue components are built in this project.

---

## Overview

Most UI is Vue 3 with TypeScript. CoreApp and plugins use Vue SFCs; Nexus uses Nuxt/Vue; TuffEx owns reusable primitives. Match the existing surface before introducing new structure.

---

## Component Structure

Use `<script setup lang="ts">` for new Vue SFCs unless the local file already uses another pattern.

For reusable TuffEx primitives:

```vue
<script setup lang="ts">
import type { FileUploaderEmits, FileUploaderProps } from './types'
import { computed, ref } from 'vue'

defineOptions({ name: 'TxFileUploader' })

const props = withDefaults(defineProps<FileUploaderProps>(), {
  multiple: true,
  disabled: false,
})

const emit = defineEmits<FileUploaderEmits>()
</script>
```

This pattern is used by `packages/tuffex/packages/components/src/file-uploader/src/TxFileUploader.vue`.

For smaller components, local interfaces are acceptable:

```ts
interface Props {
  title?: string
  name?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  arrowIcon: 'chevron-down',
})
```

See `packages/tuffex/packages/components/src/collapse/src/TxCollapseItem.vue`.

---

## Props And Emits

- Prefer typed `Props` / `Emits` interfaces or imported `types.ts` definitions.
- Use `withDefaults` for default prop values.
- Use `defineEmits` with explicit event signatures.
- For two-way TuffEx component state, follow existing `modelValue` / `update:modelValue` patterns and emit a secondary `change` event only when the component already uses that convention.
- Preserve public class names and event names when migrating semantic markup; many tests and downstream surfaces depend on class contracts.

---

## Composition

- CoreApp page-level business components may compose TuffEx primitives and local semantic components.
- New primitive behavior should go into TuffEx, not into CoreApp's legacy primitive directories.
- CoreApp business composition layers such as `TuffGroupBlock` can remain, but new interactive primitive logic should delegate to TuffEx.
- In Nexus pages, explicitly import custom components where the page already does so; do not rely on broad global component magic for new complex components.
- Plugin UI should use plugin SDK facades and should not bypass host permission or clipboard gates.

---

## Styling Patterns

- Use scoped styles in SFCs unless the owning package uses a documented global style entry.
- TuffEx primitives use stable BEM-like class names, CSS variables, and reset styles when a semantic element would otherwise inherit browser defaults.
- Prefer `@talex-touch/tuffex/base.css` plus component subpath styles in plugin UI; do not add a full `@talex-touch/tuffex/style.css` import unless working in an existing legacy full-style surface.
- Avoid changing visual class contracts while fixing semantics.

### `:global()` in scoped styles

Vue's scoped-style compiler replaces the **whole selector** with the contents of `:global(…)`. Anything written after the parentheses is dropped, so a partial `:global` does not scope the rest — it deletes it:

```css
/* Wrong — compiles to the bare `.dark, [data-theme="dark"] { … }` */
:global(.dark) .hero__shape::after,
:global([data-theme='dark']) .hero__shape::after { background: radial-gradient(…); }

/* Right — scoped: compiles to `.dark .hero__shape[data-v-x]::after` */
.dark .hero__shape::after,
[data-theme='dark'] .hero__shape::after { background: radial-gradient(…); }

/* Also right — the whole selector is global (use when the target is not this component's) */
:global(.dark .hero__shape::after) { … }
```

The wrong form never errors and never reaches its intended target; it paints its declarations onto every element matching the bare selector. Landed instance (fixed 2026-09-23): `TuffexDocsHeroBackground.vue` shipped four such rules for four months, putting a white radial gradient, a white 34px shadow and a text colour on `<html class="dark">` and on every tuffex root that sets `data-theme="dark"` (`TxMarkdownView`, `TxStreamMarkdown`, `TxCodeEditor`, `TxMarkdownEditor`) — the "grey glow" behind markdown and code specimens — whenever the hero background had loaded, while the hero itself never got its dark styles.

- Detect in the browser: list `document.styleSheets` rules whose selector is exactly `.dark` or `[data-theme="dark"]` and whose source is a component sheet (tuffex's `base.css` token blocks are the only legitimate ones), or check `getComputedStyle(document.documentElement).backgroundImage` on a dark page.
- Detect in source: `rg -n ':global\([^)]*\)\s+[^\s{,]' apps/nexus/app --glob '*.vue'`, then discard hits whose `:global(` contains nested parentheses (`:global(.a:has(.b) .c)` is a whole-selector global and is fine) and hits inside comments (both fixed files keep a comment quoting the wrong form). The second instance, `app/components/updates/UpdatesAllView.vue` (`:global(.dark) .UpdatesAllTitle`, leaking `color: rgb(248, 250, 252)` onto `<html>`), was fixed 2026-09-24; the source search above now returns no true positives in `apps/nexus/app` — its remaining hits are nested-parenthesis selectors (`HeaderUserMenu.vue`) and those two comments.

### Styling slot content from a wrapper

A wrapper component that lays out children it did not render (`TxAvatarGroup`, any list/stack primitive) cannot style them with a plain scoped selector — slot vnodes carry the *parent's* scope id. The usual workaround is injecting inline styles via `cloneVNode`, and it is a trap: **an inline value outranks every selector, so anything injected inline can never have a `:hover`, `:focus-visible` or media-query variant.**

`:deep()` from the wrapper's own root does reach slot content, because it compiles to `.wrapper[data-v-x] .child` and the root is rendered by the wrapper:

```css
.tx-avatar-group :deep(.tx-avatar-group__item) { margin-left: calc(var(--gap) * -1); }
.tx-avatar-group.is-hover-lift :deep(.tx-avatar-group__item:hover) { transform: translateY(-4px); }
```

Rules of thumb:

- Inject inline only what will never have a state variant (a static ring border). Everything positional goes in the stylesheet.
- Per-item values that must vary (a stacking index) get injected as a **CSS custom property** inline and consumed by the rule; the rule's own properties stay overridable.
- Group-wide state (a hover that fans the whole row) changes one variable on the wrapper root and lets inheritance carry it — do not re-derive it per item.
- Content that gets **teleported** (a popover panel the wrapper renders) is no longer a descendant of the root, so `:deep()` from the root will not match it. Write those as standalone selectors; they still carry the scope id because the wrapper rendered them.

### Icon boxes, state ink, and colours read back from CSS

Four small contracts that each cost a visible bug before they were written down.

**A box that holds an icon class must size it.** UnoCSS `presetIcons` (both Nexus and CoreApp) emits `width`/`height` in `em` but no `display`, so an `<i :class="iconClass">` inside an inline `<span>` stays `display: inline` and measures 0×0 — only the row's `gap` shows. Make the wrapper `display: inline-flex` (or `flex`) so the `<i>` is a flex item. `TxTabItem`'s icons were invisible in every host until 2026-09-26; `TxTabBar`'s always showed because its icon wrapper was already flex.

```scss
// Wrong: the glyph class sets 1.2em × 1.2em on an inline box, which ignores both
.tx-tab-item__icon { font-size: 18px; line-height: 1; }
// Correct
.tx-tab-item__icon { display: inline-flex; align-items: center; justify-content: center; font-size: 18px; line-height: 1; }
```

**Switch state ink through variables on the root, not with stronger child selectors.** A host restyles a part with one class of its own (`.debug-tabs :deep(.tx-tab-item__name) { color: inherit }`, specificity 0,3,0). An active rule written as `.tx-tab-item.is-active .tx-tab-item__name` (0,4,0 once scoped) silently beats it — LingPan's hard-dark panel would have turned dark text on dark in the light theme. Set `--tx-tab-item-ink` / `--tx-tab-item-icon-ink` on `.is-active` and read them in the part's single-class rule; the host's override still wins.

**A colour read with `getComputedStyle` is a snapshot.** `TxStatCard` tints its aura from the icon's computed colour; success / warning / danger resolve to different values per theme, so the read must be redone when the theme flips. Subscribe to one shared observer (a `MutationObserver` on `<html>` `class` / `data-theme` plus `prefers-color-scheme`), created lazily on the first subscriber, disconnected with the last, coalescing re-reads into one frame — `stat-card/src/theme-change.ts`. Never read at module scope or in setup (SSR), and write the result to a custom property only the script owns.

**Lift a derived ink before reading the colour back.** When the stylesheet inks an element with a mix of the very colour the script reads off it, every re-read mixes the mix: each theme switch walks the stored colour further towards the mix target (seen 2026-09-26 — two toggles turned `TxStatCard`'s blue aura slate grey). Gate the derived rule behind a class and set that class around the read; `getComputedStyle` recalculates synchronously, so nothing paints in between.

```scss
// Wrong: the read-back colour feeds the rule that changes it
.tx-stat-card--tinted .tx-stat-card__icon { color: color-mix(in oklab, var(--tx-stat-card-icon-color) 60%, var(--tx-text-color-primary)); }
// Correct: the script adds --reading around getComputedStyle(icon).color
.tx-stat-card--tinted:not(.tx-stat-card--reading) .tx-stat-card__icon { color: color-mix(in oklab, var(--tx-stat-card-icon-color) 60%, var(--tx-text-color-primary)); }
```

### Floating layers around non-rectangular triggers

`TxBaseAnchor` sets `inheritAttrs: false` and forwards attrs to the *teleported panel*, so `class`/`style` on `TxPopover` style the floating layer, not the trigger. Use the `referenceClass` prop to reach the trigger wrapper.

That wrapper is a plain rectangle. Two consequences when the trigger itself is round:

- `box-shadow` follows the wrapper's `border-radius`, so a hover shadow applied to it renders as a square halo around a circular trigger. Apply the shadow to the element inside.
- A `transform` on the wrapper moves the anchor's reference rect out from under an already-open panel. Transform the inner element instead.

### One writer per CSS custom property

A `:style` binding and an imperative `style.setProperty()` must not share a custom property. Vue's `setStyle` turns a `null`/`undefined` value into `''`, and for a `--*` name that is `style.setProperty(name, '')`, which **deletes** the declaration — on every patch of that element, not only when the bound value changes. Anything another code path wrote imperatively is gone after the next re-render.

This is how every `TxBaseAnchor` panel ignored `maxHeight` until 2026-09-06: the floating-ui `size` middleware wrote `--tx-ba-max-height` in `apply()`, the root carried `'--tx-ba-max-height': isUnlimitedHeight ? 'none' : undefined`, and each positioning pass triggered a re-render that wiped the value. Panels rendered at the CSS `420px` fallback while positioned for the clamped height, so they overflowed their trigger (regression: `base-anchor-max-height.test.ts`).

```ts
// Wrong: two writers, the binding wins on every patch
:style="[floatingStyles, { '--tx-ba-max-height': unlimited ? 'none' : undefined }]"
elements.floating.style.setProperty('--tx-ba-max-height', `${maxH}px`)

// Correct: the middleware owns the property for both cases
:style="[floatingStyles, { zIndex }]"
elements.floating.style.setProperty('--tx-ba-max-height', unlimited ? 'none' : `${maxH}px`)
```

Rules of thumb:

- If a value comes from a layout pass (floating-ui, ResizeObserver, measurement), the imperative side owns it; the template never binds that name.
- Binding a custom property conditionally is fine only when nothing else writes it. `undefined` in a style object is not "leave it alone"; it is "remove it".
- To catch the wipe in a test, spy on `CSSStyleDeclaration.prototype.setProperty` and assert no `''` write for the property after the panel settles and after a forced re-render.

### State motion: compile the spring, do not keyframe the bounce

A press/drag bounce written as a multi-stop `@keyframes` where each segment carries its own overshooting bezier reverses velocity at **every** keyframe boundary. It reads as jitter at any amplitude, and shrinking the numbers does not fix it — the structure is the defect. `TxSlider` carried four such stops (scale 1 → 0.90 → 1.32 → 1.08 → 1.16, 43 % swing, four reversals) until 2026-09-02.

The replacement is one transition whose easing *is* the spring:

- Compile it with `resolveTransition({ stiffness, damping })` from `packages/tuffex/packages/components/src/liquid/src/spring.ts`, which emits a CSS `linear()` sample list plus a duration.
- Paste that string **statically** into an `@supports (transition-timing-function: linear(0, 1))` block when the component never varies its stiffness; a runtime resolve costs a `CSS.supports` probe and a style write per instance for nothing. Lock the static string to the compiler with a unit test — `spring.ts` caches the probe module-wide, so stub `CSS.supports` before the first call or you silently assert against the bezier fallback.
- The fallback outside that block must **not** overshoot. A bezier faking a bounce is worse than no bounce.
- Target one visible reversal and 2–5 % overshoot. `spring.ts`'s own simulator gives you both; count reversals outside a ±0.1 % settle band, because the compiler pins the last sample to exactly 1 and that manufactures a sub-visible wiggle at the tail. Measured: 480/34 → +1.4 %, 560/34 → +3.0 % / 362 ms / 1 reversal, 580/34 → 2 reversals.
- Give hover its own shorter, non-overshooting clock. Hover in and out must never bounce, so it cannot share the spring variable.

### Sliding indicators ride `useJellyIndicator`

**Scope.** Any single shape that travels between sibling elements to mark a selection or a hover: `TxRadioGroup` (button type), `TxTabs`, `TxTabBar`, `TxFlatRadio`, `TxSidebarNav`. Since 2026-09-26 they share one engine, `packages/tuffex/packages/utils/use-jelly-indicator.ts`, in one of two materials:

- **`jelly`** (default) — `TxRadioGroup` only. One spring, squash and stretch (`jellyScale`, `JELLY` in `utils/animation/jelly.ts`): Radio's reference feel.
- **`glide`** — the tabs family: `TxTabs`, `TxTabBar`, `TxFlatRadio`, `TxSidebarNav`. The two ends along the travel ride separate springs: the leading end the glide spring, the trailing end the same spring time-scaled by `1 − lag / 2`. Which end leads is decided per trip from the centres. Cross-axis position and size ride the leading spring. The shape lengthens a little and gathers again, never scales, and has no emerge / sink pops. Defaults `GLIDE` 420 / 38 / lag 0.45; `timeScaleSpring(spring, durationMs, referenceMs)` maps a duration prop onto it.

The jelly was tried on the tabs family and rejected the same day (review: "不够丝滑、简单"). Its phase pops (1.06 × 1.08 emerge, 0.97 sink) are discontinuous uniform scales and its stretch saturates with speed, so a tab pill jumped from frame to frame and read as a tall capsule. Do not move a tabs-family host back onto it.

This is a different tool from the compiled spring above: a CSS `linear()` spring animates a known start and end, while an indicator's target moves under it (hover sweeps, retargets mid-flight, drag), so it is integrated per frame.

**Exception: the CoreBox result list's selection block** (`useSelectionBlock`, D8 of `09-25-corebox-list-motion`). It travels between rows, but only the keyboard steps it. An adjacent step is one WAAPI ease-out of at most 90ms (`SELECTION_STEP_MS`). A step that arrives inside that window (a held arrow key), or while a list FLIP is carrying the block, lands at once instead of retargeting. With no moving target there is nothing for a per-frame spring to integrate, and a spring would lag behind key repeat, which is the trail the block was built to remove. So it deliberately does not use `useJellyIndicator`. Its rest position sits in `translate`, so the list FLIP's `transform` composes on top of it. Contract: [CoreBox Results Contracts](./corebox-results-contracts.md#scenario-the-selection-block-d8-and-hover-rule-k).

**Signature.**

```ts
const engine = useJellyIndicator({
  axis?: MaybeRefOrGetter<'x' | 'y'>,          // travel axis
  material?: 'jelly' | 'glide',                 // default 'jelly'
  glide?: { stiffness?, damping?, lag? },       // glide: default GLIDE 420 / 38 / 0.45; lag 0 = rigid slide, capped 0.85
  integrate?: JellySpringStep,                  // glide: pass springSteps; without it a glide move lands in place
  elastic?, stiffness?, damping?,               // jelly: default JELLY 110 / 12; jellySpring(ms) time-scales it
  deform?: number | { along?, across? },        // jelly: 1 = Radio's; 0 = rigid
  maxGrowth?: number,                           // jelly: px cap on swelling, per axis
  bounds?: { start, end } | null,               // walls along the travel axis (container coords)
  onSettle?: () => void,                        // every arrival, including direct landings
  onFrame?: (frame: { visible, rect: Readonly<JellyRect>, scaleX, scaleY, moving, phase }) => void,
})
engine.moveTo(rect | null, { animate?: boolean })
engine.grab() / drag(rect, velocity, { atEdge }) / release(kick)   // Radio's drag only
```

**`integrate: springSteps`.** The glide is integrated with `springSteps` from `components/src/liquid/src/spring.ts`, the library's frame spring (1/240 s substeps, any `dt` safe; see `tuffex-text-motion.md` "Frame-driven motion uses `springSteps`"). utils cannot import from components (the utils build's `rootDir` is `utils`), so each glide host passes it in, and engine tests import it in the test file only. A host that forgets it gets an indicator that lands on the next frame, never one that hangs mid-trip.

**Host contract.** The host measures (in its container's padding-box coordinates, scale-normalised like `useIndicatorBox`) and paints; the engine only moves.

| Host event | Call |
| --- | --- |
| selection changed by click / keyboard / `v-model` / hover | `moveTo(rect, { animate: true })` |
| first measurement, ResizeObserver, size tier or layout change | `moveTo(rect, { animate: false })` — lands at rest, only retargets mid-flight |
| variant / placement / offset changed (new box, same target) | re-measure; the host picks: TxTabs travels (`animate: true`, a pill melting into a line), TxTabBar lands its `indicator` / `size` switch |
| nothing to point at (multi-select, `indicator="none"`) | `moveTo(null)` |
| a zero-size measurement (hidden panel, jsdom) | TxTabs hides with `moveTo(null)` until a real box exists, so it never travels out of zero; the other hosts land on it, which paints nothing |

- Paint from `onFrame` onto the element with `style.transform = translate3d(x, y, 0) scale(sx, sy)` plus `width` / `height`, and never bind those properties in the template (see "One writer per CSS custom property"). A render-function component (`TxTabs`) must paint this way: re-running its render re-evaluates every slot.
- No CSS `transition` on `transform`, `width`, `height` or `top` of the indicator, anywhere — including a wrapper's override (`TxFineTuneCard` used to ease FlatRadio's thumb, which would re-ease every frame). Keep only an `opacity` fade, with its reduced-motion escape.
- `prefers-reduced-motion: reduce` is the engine's job: every move lands and the scale is identity. Hosts do not branch on it.
- Inside a container that clips (`overflow: hidden` frames, TxTabs' scrolling tablist), pass `bounds` = the container's extent along the travel. On the glide an end that would cross a wall stops there; on the jelly the whole shape stops and lands as a squash, so draw its walls in by `maxGrowth / 2` to keep the squash inside. A target beyond a wall moves the wall out to it, so an edge-flush target (TabBar's first `line`) is still reached. Tabs, TabBar, FlatRadio and SidebarNav pass walls; Radio passes none — its pill poking past the group is the reference look. Verify with a round trip first → last → first over every style write. In jsdom stub the extent (`clientWidth` / `scrollHeight` read 0): a zero extent pins the walls to the target's own span, and an end that starts beyond it snaps to it — on SidebarNav's return trip the plate collapsed to zero height for its first frames until the test stubbed `scrollHeight`.
- Jelly only: the material scales by ratio (1.36× is +10px on a 28px pill, +72px on a 200px row), so `maxGrowth` and `deform.across` size the swell to a container. No host passes them today; the glide has nothing to cap.

**Relation to `springSteps`.** The glide *is* `springSteps`, so it needs no carve-out from `tuffex-text-motion.md`'s "Frame-driven motion uses `springSteps`". The jelly keeps its own integrator: Radio's shipped one (one semi-implicit step per frame, `dt ≤ JELLY.maxFrameS`, `JELLY` 110 / 12), lifted verbatim because its trajectory is Radio's reference feel (browser-verified frame-identical to the pre-extraction Radio). Re-basing it onto `springSteps` would be a retune of Radio, compared frame by frame, never a dedupe.

**Tests required.** Fake `setTimeout`, `clearTimeout`, `requestAnimationFrame`, `cancelAnimationFrame` and `performance` together (`vi.useFakeTimers({ toFake: [...] })`). Assert the first measurement lands (`scale(1.000, 1.000)` at the target), a `matchMedia` reduce stub lands directly, and a switch settles exactly on its target. On the glide, sample every frame of the switch: the box passes between the ends, its travel-axis size exceeds both its start and end size at some frame (the lag), and the scale is `(1.000, 1.000)` on every frame; a round trip keeps both ends inside the container on every frame. On the jelly (Radio), the scale is ≠ 1 mid-flight. The vitest setup's `matchMedia` answers `false` for every query, so the spring runs unless a test says otherwise.

**Wrong vs correct.**

```ts
// Wrong: CSS eases the geometry and a keyframe fakes the bounce on top
el.style.transform = `translate3d(${x}px, 0, 0)`   // .pointer { transition: transform .35s }
el.classList.add('pointer--motion-stretch-x')      // @keyframes with overshooting segments

// Wrong: a tabs-family host on the jelly — it pops and squashes (rejected 2026-09-26)
useJellyIndicator({ axis: 'x', maxGrowth: 16, onFrame: paint })

// Correct: the engine owns the motion on the glide; the host only measures and paints
const engine = useJellyIndicator({ axis: 'x', material: 'glide', integrate: springSteps, bounds, onFrame: paint })
engine.moveTo(measureActive(), { animate: true })
```

### Pointer-driven reordering (`TxSortableList`)

HTML5 drag and drop cannot feel direct: the browser draws a translucent drag image, nothing can make it springy, and the rows swap instantly under it. `TxSortableList` defaults to `dragMode: 'pointer'` since 2026-09-26; `'native'` is only for a host that needs `dragstart` / `dataTransfer` to move items between lists (Nexus `TemplateCmsBoardDemo`).

| Concern | Contract |
|---|---|
| Order | The DOM order is frozen while a row is carried. The row follows the pointer on `translate`; passed rows step aside on theirs by the carried row's height plus the gap. Release commits once (`update:modelValue` + `reorder`), then every row FLIPs from its drawn centre. |
| Clocks | Individual `translate` / `scale`, not `transform`: the carried row's translate has no transition while its lift springs. The script owns each row's whole `transition` list (base transitions included); a stylesheet transition on either property would re-ease every pointer frame. Springs come from `resolveTransition` (room `{ 480, 30 }`, lift / land `'bouncy'`). |
| Geometry | Slots are read from `offsetTop` / `offsetHeight` (transform-free) when the drag starts. The target index is the slot the carried row would sit centred closest to — top-aligned above its origin, bottom-aligned below — so it swaps past half-way at any heights and reaches the last slot without overscroll. Past the ends it follows at 0.3. Scroll during the drag is subtracted via the list's viewport top. |
| Click | A 4px threshold keeps a click a click; the click produced by a drag's release is swallowed by a capture listener removed a macrotask later. |
| Surface | A carried row passes over others, so it sits on an opaque surface (`--tx-bg-color-overlay`); `--tx-fill-color-blank` is `transparent` in the dark theme. |
| Touch | `touch-action: none` on the row, or only on `[data-tx-sort-handle]` in `handle` mode. |

Do **not** FLIP a native `dragover` reorder: hit-testing follows transforms, so a row still sliding out from under the pointer catches the next `dragover` and swaps straight back.

Tests (jsdom has no layout): stub `offsetTop` / `offsetHeight` per row, dispatch `MouseEvent`s with `pointerId` / `isPrimary` defined, and flush a macrotask between cases (`afterEach(() => new Promise(r => setTimeout(r, 0)))`) or one case's click-swallow listener eats the next case's click.

### TuffEx semantic hues in dark mode

`--tx-color-success | warning | danger` live in `packages/tuffex/packages/components/style/variables.scss`. Until 2026-09-02 the `.dark` block did not define them and inherited the `:root` light values — mid-saturation hues tuned for a white page. Mixed at the pill family's 12 % fill / 32 % border onto `#141414` they gave olive / ochre / maroon fills and a hard dark hairline on `TxStatusBadge`, `TxBadge`, `TxTag` and `TxAlert` at once.

- When a whole family looks wrong in one theme, suspect the token block before the component recipe. Changing the recipe in one component splits the family; the two high-contrast mixins had carried their own three hues correctly all along, which is the tell.
- Dark values sit one step lighter than the light ramp (Tailwind-400: `#4ade80` / `#fbbf24` / `#f87171`), not at the high-contrast pastels — white ink on `#fda4af` is 1.8:1.
- **Ink and solid-fill pull in opposite directions and can have an empty intersection.** AAA 7:1 ink on `#141414` needs relative luminance ≥ 0.349; keeping white ink on a solid fill at 2.90:1 needs ≤ 0.312. No red satisfies both, so danger is held to AA as ink and the fill-side number is recorded, not gated. Print the feasible window before writing either bound into an acceptance criterion.
- The hand-written `--tx-color-*-rgb` triplets in the same block do not derive from the hex. Update them together and assert the equality in a test; `rgb(var(--tx-color-success-rgb) / .2)` silently keeps the old hue otherwise.
- Semantic colour as a **solid fill under white ink** is not a supported pairing in this library (`TxStep` completed icon 1.74:1, `TxTabBar` badge and `TxToolConfirmation .is-dangerous` 2.77:1). Lightening the token makes those slightly worse; the fix is dark ink on those three, not a darker token.

### Shell colour tokens

The app shell has one palette, `--shell-*` in `apps/core-app/src/renderer/src/styles/shell-tokens.scss`, defined across four blocks: `:root`, `.dark`, `html.contrast`, `html.dark.contrast`. Shell surfaces read tokens only — a hex literal or `rgba()` in a renderer component is a bug, because it survives the theme swap and the high-contrast accessibility mode.

- Four semantic hues exist — `primary`, `success`, `warning`, `danger`, `info` — each with a base ink, a `-soft` fill and a `-border`. A status chip is `-soft` fill plus same-hue base ink; that is the whole shape.
- Both contrast blocks re-point every hue to the tuffex contrast ramp (`--tx-color-*` and its `-light-9`) and replace the alpha `-border` with the solid base: a 24 %-alpha hairline disappears at high contrast.
- **Chip ink is measured against its own `-soft` fill, not against the page background** — that composite is the real reading surface and is what must clear AA 4.5:1. Two of the artboard's light-mode values missed it, so the palette carries darkened values with the measurement recorded in the file. Reproduce that check before adding or changing a hue, and record the number.
- Colour is additive to a text label, never the sole carrier of state.
- Reserve accent colour for primary buttons, switch-on, progress fill and selected state. An expected outcome does not get an error colour — a probe that runs and finds nothing is amber at most, because red on a routine result only teaches people to ignore red.

---

## Loading States

A skeleton is the default loading state, not an optional polish pass. Ship it with the first version of a view; do not leave it as follow-up work.

**When a skeleton applies**

- First load of a page or region whose layout is known before the data arrives.
- Not for a background refresh of already-rendered content: keep the content on screen. Replacing it with a skeleton is a regression, not a loading state.
- Not for a small local action: use the control's own pending state instead.
- Not when the layout depends on the data (unknown row counts, variable-shape results): use an empty state or a plain pending affordance.

**Match the real layout**

- The skeleton must mirror the loaded layout: same group count, same row count, same row height and spacing.
- A skeleton that does not match still shifts the page when content lands, which is the one thing it exists to prevent. "The page shows a skeleton" is not the bar; "nothing moves when data arrives" is.
- Build the skeleton from the same containers the loaded view uses, so the two cannot drift apart.
- Row height comes from the same line box, not from a number. A loaded row is as tall as its label's line box (font-size × the inherited line-height; CoreApp's page line-height is 1.5, set by the Tailwind preflight that ships with the Milkdown theme) plus its padding and borders. A skeleton row sized by `min-height: <number>` drifts by the difference on every row: the 2026-09-26 sidebar skeleton was 30 px against 33.5 px rows and slid 3.5 px further per row. Put the placeholder bar inside an element with the real label's `font-size` and `height: 1lh`, and check the rendered heights in the real app (an insertion-time `getBoundingClientRect` snapshot across a reload); jsdom has no layout, so a unit test can only pin the shared source, not the height.

**Reuse the primitives**

- Settings-style rows: `TxRowSkeleton` from `@talex-touch/tuffex/skeleton`, with `rows`, `leading`, `description`, `trailing`, and `separated` describing the real row.
- CoreApp settings pages: `SettingSkeleton` (`components/settings/SettingSkeleton.vue`), which composes `SettingSection` + `TxRowSkeleton` and declares the real group structure.
- Free-form bars: `TxSkeleton`. App shell: `TxLayoutSkeleton`.
- Do not hand-roll placeholder `div`s or a local `@keyframes`. The shimmer, its timing, and the reduced-motion guard live in the `skeleton-surface` / `skeleton-keyframes` mixins in `packages/tuffex/packages/components/style/mixins.scss`; a component emits the keyframes once and applies the surface per placeholder element.
- Tune colour through `--tx-skeleton-base-color` rather than restyling the bars.

**Do not let it flash**

- Bind the skeleton through `useDeferredLoading` from `@talex-touch/tuffex/skeleton`. Data that arrives inside `delay` shows no skeleton at all, and a skeleton that does appear stays for `minDuration` instead of vanishing half-drawn.

**Accessibility**

- Skeletons are decorative: mark them `aria-hidden="true"` and keep focusable elements out of them.
- Animation must respect `prefers-reduced-motion: reduce`. The shared mixin already drops the motion while keeping the placeholder, since the placeholder is what holds the layout steady.

### Ready results must not wait for reveal motion

CoreBox's recommendation grid and search list must patch in the same Vue update
as the selected-result footer. Do not wrap that branch switch in
`<Transition mode="out-in">`: it defers mounting the next branch until the old
one's animation frames/end callback complete, while the footer can already show
the new item. Chromium frame throttling then looks like slow search rendering.

Render the current grid/list branch directly. Optional `.result-layout-motion`
and per-item stagger effects are transform-only on already-opaque rows; neither
`opacity: 0` keyframes nor a delayed reveal class may gate ready content. Keep
low-battery and `prefers-reduced-motion` behavior without a readiness callback.

Regression: mount CoreBox with VTU's Transition stub disabled, hold all
requestAnimationFrame callbacks, replace a sectioned recommendation grid with a
ready wx result and compare the list against its footer after nextTick. Cover
rapid replacement and the reverse layout change. Real acceptance additionally
pauses CSS animations at currentTime=0 and inspects visible pixels, ancestor
opacity/geometry and reduced-motion; DOM text or provider duration alone is not
proof that the result appeared.

---

## Accessibility

Interactive controls must be semantic.

- Use native `button type="button"` for clickable action zones, headers, tabs, drop zones, and icon actions.
- Do not add new `div role="button"` or `span @click` debt for ordinary controls.
- Preserve or add `aria-label`, `aria-expanded`, `aria-controls`, `aria-pressed`, and disabled behavior where the control needs it.
- Reset button appearance with CSS instead of downgrading to non-semantic markup.

Current examples:

- `TxCollapseItem` uses a real `button` with `aria-expanded` and `aria-controls`.
- `TxFileUploader` uses a real drop-zone button and a real remove button.
- `docs/engineering/reports/coreapp-button-migration.md` records the current CoreApp button migration direction.

### Grid keyboard geometry

- A grid's renderer and keyboard navigation must resolve the same effective column count. If a section caps or overrides the container's declared columns, keep that rule in one shared helper rather than duplicating it in the component and keyboard hook.
- Section-aware navigation applies even when only one section is visible. Do not gate rendered-row geometry on `sections.length > 1`, and do not calculate vertical movement from the raw container column count when the rendered section uses fewer columns.
- Regression coverage for an overridden section must use the production mismatch shape, not a matching synthetic layout. CoreBox recommendations declare eight container columns but render an intelligence section at five columns; with ten items, ArrowDown moves `4 → 9` and ArrowUp moves `9 → 4`.

---

## I18n

- CoreApp user-facing text belongs in `apps/core-app/src/renderer/src/modules/lang/`.
- Nexus text belongs in the existing Nexus i18n locale files.
- Plugins can use localized manifest metadata or their local i18n setup.
- Do not directly access `window.$t` or `window.$i18n` in new CoreApp renderer code.
- Use shared localized value helpers when resolving plugin manifest text, such as `packages/utils/i18n/localized.ts`.

---

## Virtual List Keys and Height Caches

`TxConversationStream` (and any future dynamic-height virtual list) positions rows by a
prefix-sum of measured heights keyed by `item-key`. Two contracts follow:

- Item ids fed to a virtual list must be **globally unique across datasets**, not per-collection
  counters. A keep-alive'd instance switching threads with `user-1`-style ids inherited another
  thread's measured heights and stacked rows on top of each other (fixed 2026-08: uuid message
  ids + `PositionCache.syncKeys` pruning + per-conversation `:key` on the stream).
- Hosts that pad or prepend content above the transcript rely on the component's measured spacer
  origin — never reintroduce "scrollTop is spacer-relative" assumptions.

Regression guards live in `packages/tuffex/.../conversation-stream/__tests__/` (observe-coverage,
prune, spacer origin) and `useHomeConversation.test.ts` (id uniqueness after restore + drops).

---

## Common Mistakes

- Replacing a native control with `div @click` to preserve styling.
- Binding a CSS custom property in `:style` that another code path also writes with `setProperty()`; an `undefined` value deletes the imperative write on every re-render (see One writer per CSS custom property).
- Easing a sliding indicator's `transform` / `width` with a CSS transition, or faking its bounce with keyframes, instead of `useJellyIndicator` (see Sliding indicators ride `useJellyIndicator`).
- Wrapping an icon class in an inline element: the glyph measures 0×0 (see Icon boxes, state ink, and colours read back from CSS).
- Reading a colour back off an element whose ink the stylesheet derives from that same colour; each re-read mixes the mix (see Icon boxes, state ink, and colours read back from CSS).
- Painting a carried or lifted surface with `--tx-fill-color-blank`, which is transparent in the dark theme, or FLIP-animating a native `dragover` reorder (see Pointer-driven reordering).
- Adding a CoreApp-only primitive when a TuffEx primitive already exists.
- Changing class names during semantic migrations without updating focused tests.
- Reading browser-only state in Nexus SSR paths.
- Using browser-native clipboard APIs inside plugin UI instead of plugin clipboard SDK gates.

---

## TuffEx Suite Taxonomy (concepts / templates / base / pro / ai / data / flow)

Since 2026-08-30 every tuffex component belongs to exactly one docs suite; these places must stay in sync. Only two are enforced in CI — the barrels (`suite-barrels.test.ts`) and the hub links (the docs coverage test, below). `recategorize-component-docs.py --check` errors on docs missing from `TAXONOMY`, but it is a local script, not a CI step. Everything else here — the `docs-suites.ts` maps, the sidebar, the gallery bands, the hub's suite sections and counts — is convention only, so check it by eye:

- `apps/nexus/scripts/recategorize-component-docs.py` — `TAXONOMY` is the single source of truth for `category` frontmatter (27 categories; suites: concepts = Foundations, templates = TemplateApp/TemplateContent/TemplateAi/TemplateData, base = BaseSuite/Basic/Form/Layout/Navigation/Data/Feedback/Status, pro = ProSuite/Advanced/Effects/Primitives, ai = AiSuite/AiChat/AiAgent/AiReasoning/AiContext, data = DataSuite/Charts/Visualization, flow = FlowSuite/Flow). Rerun with `--apply`; it errors on docs missing from the table.
- `apps/nexus/app/utils/docs-suites.ts` — `DocsSuiteKey`, `DOCS_SUITE_KEYS`, `SUITE_CATEGORY_KEYS`, `CATEGORY_SUITE_MAP` and `CATEGORY_I18N_KEY`: the suite ↔ category maps that both the sidebar and `DocsSuiteCatalog` read. Labels live under `docsSidebar.suites.*` / `docsSidebar.categories.*` in both locales.
- `apps/nexus/app/components/DocsSidebar.vue` — `SUITES` + `SECTION_ORDER['/docs/dev/components']` drive the sidebar: a 组件/扩展 segmented control over a suite switcher (`TxDropdownMenu` listing `SUITES` as-is — icon, label, one-line description, doc count; picking one calls `selectSuite`). A new suite needs an entry in `SUITE_ICONS` and a `docsSidebar.suiteDescriptions.<key>` string in both locales, or it renders with a folder icon and no description. `suiteOfRoute` falls back to the suites' `standalonePages` before the component metadata lands, so an overview page names its own suite on SSR and the first client frame. The `misc`/其他 bucket must stay empty — it is the canary for taxonomy drift. Dark-mode rules in this file use the `:global(.dark .selector)` whole-selector form (or a plain `.dark .selector`); see "`:global()` in scoped styles" above for why `:global(.dark) .selector` is never acceptable.
- `COMPONENT_FAMILIES` (same file) folds same-component doc siblings (avatar + avatar-variants) into one expandable sidebar entry. Rendering-only: members keep their own `TAXONOMY` category and `SECTION_ORDER` rows, and the fold happens per category child list after `used` bookkeeping, so the misc canary is unaffected. The family row is a toggle (never navigates), collapsed by default, auto-expanded when the route is a member; member label overrides live under `docsSidebar.families.*` in both locales (the head member needs one so it doesn't repeat the family label). Members split across categories simply render flat.
- `packages/tuffex/packages/components/src/{base,pro,ai}/index.ts` — category entry barrels; their union must equal `components.ts` with no overlap, guarded by `packages/components/src/__tests__/suite-barrels.test.ts`. The barrels stay three-way: the `data` and `flow` suites are docs-level only — Visualization components and the chart-family `charts` entry keep importing through the pro barrel, `flowchart` through the ai barrel; the public chart-family subpath is `@talex-touch/tuffex/charts`.
- `apps/nexus/app/components/docs/DocsComponentsGallery.vue` — one hand-written `v-if="props.suite === '…'"` band per suite, and the `suite` prop union. A suite without a band renders its overview page's Preview section empty, with no error and no warning (the flow suite shipped that way on 2026-09-21). The ai and data bands are exhaustive (one cell per component, so a new component there needs a cell); base and pro are curated.
- Hub `content/docs/dev/components/index.{zh,en}.mdc` — one H2 section per component suite (Basics/Pro/AI/Data/Flow) and a Suite Overview table whose per-suite counts are hand-maintained; every exported slug must be linked from **both** hubs.

**The docs coverage contract is enforced only by the nexus test suite, not by the gate scripts.** `check:mdc-fences`, `check:doc-parity`, `check:demo-registry` and `recategorize --check` all pass on a new component whose docs fail CI. `apps/nexus/test/docs/tuffex-component-docs-coverage.test.ts` requires, for every slug exported from `components.ts`, in both locales: a live `TuffDemoWrapper`, a `## API` H2, a `Props`/`属性` heading, a best-practice heading spelled exactly `Best Practices` (en) / `最佳实践` (zh), and a link from that locale's hub. The en match is case-sensitive — `## Best practices` fails — and English doc headings are Title Case throughout (`Basic Usage`, `Interaction Contract`). Run it the way CI does: `pnpm -C packages/tuffex build`, then `pnpm -C apps/nexus exec vitest run`.

Every suite's first sidebar entry is its overview page (`standalonePages` in `SUITES`): concepts is the components index itself (`index.mdc`, category `Foundations`), then base-suite (`BaseSuite`), pro-suite (`ProSuite`), ai-suite (`AiSuite`), data-suite (`DataSuite`) and flow-suite (`FlowSuite`). The exception is **templates** (2026-09-24): full-page compositions of the other suites' components, not components, so it has `standalonePages: []` and an `entryPage` (`template-shell`) that `suiteOverviewLink()` falls back to when a tab is picked. Overview pages embed `::DocsComponentsGallery{suite="…"}` for the specimen grid and `::DocsSuiteCatalog{suite="…"}` for the category-grouped list (data-driven from `category` frontmatter, so it needs no per-component edit).

Adding a component now also means: add its slug to `TAXONOMY` (pick the suite/category), add the dir to the matching suite barrel (base/pro/ai only), keep `SECTION_ORDER` in the same order as `TAXONOMY`, link it from both hubs under its suite (and bump that suite's count in the Suite Overview table), and — in the ai or data suite — give it a gallery cell. Adding a *suite* additionally means a `DocsSuiteKey` plus its entries in the three `docs-suites.ts` maps, a `SUITES` entry, i18n labels in both locales, an overview doc with its own `*Suite` category, a gallery band plus the prop union, and a hub H2 plus a Suite Overview row. A docs-only suite with no components — templates is the one instance — deliberately skips four of those: no overview doc (the tab lands on `entryPage`), no gallery band (there are no specimens), no hub H2 or Suite Overview row (the table counts importable components), and no barrel. Do not add them back from this checklist; the templates contract is [Nexus Docs Templates](./nexus-docs-templates.md). New chart components go to data/Visualization in the docs, with their import staying in the pro barrel; chart-family internals belong beneath `src/charts`, whose only public surface is `@talex-touch/tuffex/charts`.
