# Nexus Docs Layout Chrome

> The fixed layers of `apps/nexus/app/layouts/docs.vue` — the header band, the top/bottom edge fade, the stacking order they depend on — and the one way to build a progressive blur edge that actually hides what scrolls under it.

---

## 1. Scope / Trigger

Read before touching `.docs-edge-blur*`, the stacking (`z-index`, `isolation`) of `.docs-layout-root` / `.docs-layout-stage` / `.docs-layout-foreground`, `TheHeader`'s position, or before adding any `backdrop-filter` layer to a docs surface.

## 2. Stacking tree (verified 2026-09-25)

```
html
└ .docs-layout-root            relative + isolation: isolate   (bg-white / dark:bg-dark = #121212)
  ├ .docs-layout-stage         relative + isolation: isolate
  │  ├ .docs-layout-background fixed, z 0     (tuffex hero / tutorial wash / docs background)
  │  ├ .docs-layout-foreground relative, z 2  → its own stacking context: sidebars (z-30), gallery,
  │  │                                          image thumbnails, in-page demos all stay inside it
  │  ├ .docs-edge-blur--top / --bottom   fixed, z 20
  │  └ TheHeader .TuffHeader   fixed, z 10000 (the `z-30` class on it loses to the scoped rule)
  ├ TuffFooter .docs-layout-footer   z 3 in the root layer → above the whole stage
  └ BackToTop                        fixed, z 40
```

- Nothing in the foreground can paint above the edge strips; content that "looks unblurred" under a strip is low-frequency (a gradient thumbnail), not above it.
- The header pill is `top: 1rem` inside an 88px transparent band; content scrolls on the window, so it passes under the pill and through the 16px above it.
- The footer sits above the stage, so the strips never cover it — its background is not `#121212`, and a fade over it would draw a band.

## 3. Edge fade contract

```vue
<div class="docs-edge-blur docs-edge-blur--top" aria-hidden="true">
  <span v-for="layer in 4" :key="layer" class="docs-edge-blur__layer" />
</div>
```

| Part | Rule |
| --- | --- |
| Container `.docs-edge-blur` | `position: fixed; left: 0; right: 0; z-index: 20; height: var(--docs-edge-height); pointer-events: none` and **nothing else**: no `opacity`, `mask`, `filter`, `backdrop-filter`, `will-change` (any of them makes it the layers' backdrop root, and they blur only the empty container) |
| Direction | `--docs-edge-dir: to top` (top strip) / `to bottom` (bottom); 0% is the inner edge, 100% the viewport edge. No `rotate(180deg)` |
| Four `.docs-edge-blur__layer` | full size (`inset: 0` — blur samples only its own box, narrow bands seam), `backdrop-filter: blur(1 / 2 / 4 / 8px)`, band masks as TxGradualBlur `divCount=4`, **no `opacity`** |
| `::after` | gradient from transparent to `--docs-edge-color`, painted over the layers; the top strip is solid over the outer 20% (the 16px above the pill) |
| `--docs-edge-color` | the root's real background: `#fff`, dark `#121212` (uno `dark`), tutorial `--tx-bg-color` / dark `#090a0d` — **not** `--tx-bg-color` (#141414) on normal docs |
| Tutorial (`/docs/guide*`) | layers `display: none`; colour fade only |
| No `backdrop-filter` support | `@supports not (…)` hides the layers |

Heights: top 88px (header pill 16→66px), bottom 64px.

## 4. Validation matrix

| Symptom | Cause |
| --- | --- |
| Half a line of text readable above the header | the strip is translucent at the viewport edge (opacity on the blur, or no colour fade) |
| Text at the bottom looks like a grey ghost, images look crisp | single blur layer + `opacity < 1`: the sharp page shows through at `1 − opacity`; low-frequency images hide the blur |
| Layers render but blur nothing | an effect property on the container (backdrop root) |
| A band at the edge | fade colour ≠ page colour (`--tx-bg-color` vs `#121212`) |

## 5. Good / Base / Bad

- Good: four effect-free full-size layers + colour fade to the measured page colour.
- Base: colour fade only (tutorial) — zero compositing cost, no blur texture.
- Bad: one `backdrop-filter` element with `opacity: 0.72` and a linear mask (shipped until 2026-09-26): a cross-fade between sharp and one blur, never a progressive blur.

## 6. Tests and verification

- `app/layouts/docs.performance.test.ts` requires the two class attributes verbatim (`class="docs-edge-blur docs-edge-blur--top"` …) and forbids `TxGradualBlur` in the layout — add classes on children or via `:class`, never inside that attribute.
- Browser (ego): park a text line at y 0–16 and a gallery row at the bottom edge, dark and light; compare text vs image fade; check tutorial, 960px and 390px; scroll to the footer.

## 7. Wrong vs Correct

```css
/* Wrong: opacity applies to the filtered backdrop too — 28% of the sharp page stays visible */
.docs-edge-blur { backdrop-filter: blur(0.55rem); opacity: 0.72; mask-image: linear-gradient(…); }

/* Correct: effect-free container, stacked layers, fade to the page colour on top */
.docs-edge-blur { position: fixed; z-index: 20; height: var(--docs-edge-height); }
.docs-edge-blur__layer { position: absolute; inset: 0; backdrop-filter: blur(var(--docs-edge-blur)); mask-image: linear-gradient(var(--docs-edge-dir), var(--docs-edge-band)); }
.docs-edge-blur::after { content: ''; position: absolute; inset: 0; background: linear-gradient(var(--docs-edge-dir), transparent 0%, var(--docs-edge-color) 92%); }
```
