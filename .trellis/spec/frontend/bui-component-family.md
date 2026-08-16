# BUI Component Family (Beautiful UI port)

> Conventions for the 24 tuffex component directories adapted from Beautiful UI (beautifului.dev, MIT, © 2026 Shane Levine), landed 2026-08-15 via `.trellis/tasks/08-15-beautiful-ui-port`. These rules bind any future work on `tx-bui-*` components and any new pixel-matched family.

---

## Token layer

- `packages/tuffex/packages/components/style/bui-tokens.scss` defines `--tx-bui-*` (33 colour/shadow tokens × light/dark + radius-chip/control/card + `--tx-bui-font-mono`). Values are upstream originals **on purpose** — they deliberately do NOT resolve to the `--tx-*` semantic ramp (nearest-neighbour ΔRGB reaches 96 in dark). Hosts wanting brand colours override the variables in their own scope.
- Dark selector is the shared `[data-theme='dark'], .dark` pair — same switch as `variables.scss`, zero adaptation.
- `--shadow-overlay` swaps its ring from `line` to `line-strong` in dark: the one structural (not numeric) light/dark difference. Do not generate both themes from one template.
- High-contrast themes intentionally do NOT remap `--tx-bui-*` (documented limitation in the ai-suite doc).
- BUI visual language uses **ring shadows instead of borders** (`0 0 0 1px` spread). Never both — double-line trap. Never `@include elevation()` for these components.

## Mixins & keyframes

- `style/mixins.scss` carries `bui-scope` (local reset + 13px base — BUI layouts assume Tailwind preflight, tuffex ships no global reset), 9 `bui-keyframes-*` mixins (`tx-bui-*` names), and surface mixins (`bui-shimmer-text`, `bui-fade-up`, `bui-pop-in`, `bui-disclosure-collapse`, `bui-tabular-nums`, `bui-card-bar/pad`, `bui-press-scale`).
- Keyframes are emitted **per component via mixin**, never in the global stylesheet — subpath consumers only get their component's CSS (same rationale as `skeleton-keyframes`, documented at `mixins.scss`).
- `--tx-ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1)` in `variables.scss` is the family's master easing.

## Hard rules for tx-bui components

1. **Pure controlled primitives.** Demo timelines (stage machines, tick arrays, reveal cadences) live in nexus demo SFCs, not components. Exceptions require the machine to BE the component's semantic (TxDiffTable's play stages, TxWorkingIndicator's timer).
2. **Reduced motion per component**: cut tweens, keep state machines, zero delays too, and never rely on a base `opacity: 0` that only an animation reveals — resting styles must be visible. JS/WAAPI motion needs a `matchMedia` guard; CSS `animation: none` handles the rest. Verify with a compiled-SCSS contract test (`sass.compileString` + assertions; see `context-cards-motion.test.ts`, `fine-tune-card-motion.test.ts`).
3. Class prefix `tx-bui-<component>__element`; never attach `.tx-card` / `.tx-base-surface` / `.fake-background` (the `data-tx-coloring` layer adds a second ring).
4. `<style lang="scss">` non-scoped; every `var()` carries an inline fallback; `color-mix(in oklab, …)` when reproducing BUI translucency; no `@supports` fallback layers.
5. Half-pixel font sizes (13/12.5/11.5/10.5px) are the density language — keep them. Numbers use `tabular-nums`; signed figures use U+2212 `−`.
6. Links never self-navigate — `href` renders for affordance, `preventDefault` + `@open` emit (TxSources convention, Electron rule).
7. a11y is ported to tuffex standard, not upstream's: combobox pattern for token menus, listbox keyboard nav for search, `aria-checked="mixed"` for tri-state, `inert` + `aria-hidden` on collapsed content. Bind inert as `:inert="open ? undefined : true"` — Vue renders `:inert="false"` as `inert="false"`, which is still inert.
8. MIT header in every component SFC: `Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.`

## Registration chain for a new tuffex component (6 stops, all audited or load-bearing)

1. `packages/components/src/components.ts` — full-path ASCII order (`-` sorts before `/`: `card-item` < `card/`).
2. `README.md` + `README_ZHCN.md` — total count line + category line (entries per line must equal the parenthesised count; `audit:readme` gates CI).
3. `apps/nexus/app/plugins/tuffex.ts` — `from*` loader + `GLOBAL_TUFFEX_COMPONENTS` entry. **Composables are NOT registered** (useTokenMenu, useSelectionAnchor, useIndicatorBox, useElapsed — plain imports). Beware: an mdc demo using an unregistered global tag fails only at render time, silently in CI.
4. `apps/nexus/app/components/content/demo-registry.ts` — alphabetical.
5. Doc pair `content/docs/dev/components/<kebab>.{zh,en}.mdc` — 8-field frontmatter, `since: 2.5.0`+ for new adds, 中文段名, zh/en equal section counts.
6. `pnpm -C packages/tuffex build` before any downstream typecheck (exports resolve to `dist/`), then `pnpm -C apps/nexus typecheck` (wrapper, not `:raw`).

## Traps confirmed during this port

- **Vue casts an absent boolean prop to `false`, not `undefined`** — any `props.x ?? internal` dual-mode boolean needs an explicit `x: undefined` in `withDefaults`, or the fallback is dead.
- Suites mounting components with document-level listeners need `enableAutoUnmount(afterEach)` — a mounted leftover consumes events and corrupts the *next* test.
- jsdom: no `isContentEditable` (pair the property check with a `closest('[contenteditable]')` walk), no `PointerEvent` constructor, `getContext('2d')` returns null (keep canvas painting in a separate testable module).
- eslint must run per-package (`pnpm -C packages/tuffex exec eslint`, same for nexus) — the root config cannot parse either package's SFCs.
- `TxScroll`'s default (BetterScroll transform) kills `position: sticky` descendants — sticky tables need native `overflow: auto`.
