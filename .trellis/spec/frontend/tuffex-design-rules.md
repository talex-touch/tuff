# TuffEx Design Rules

> The typography, spacing, colour, border and motion rules every TuffEx component and every surface built from TuffEx must satisfy. Adapted from [Cloudflare Kumo's design skill](https://kumo-ui.com/skill/) and re-expressed against this repo's `--tx-*` tokens, SCSS mixins and BEM class contracts.

Kumo states its rules against Tailwind utilities (`text-kumo-subtle`, `ring-kumo-line`, `font-semibold`). TuffEx has no utility engine: the equivalent vocabulary is the token set in `packages/tuffex/packages/components/style/variables.scss` and the mixins in `style/mixins.scss`. Each rule below is stated in that vocabulary, with the repo evidence that makes it enforceable rather than aspirational.

---

## Typography

### Content text is 13–14px; 16px and up is reserved for headings

Body copy, button labels, table cells, input values, chips — everything a user reads or operates — sits at 13px or 14px. Counted across the library's SFCs, `12px` (96 uses), `13px` (69) and `14px` (40) are the working range, while `16px` appears 10 times and `18px` 11 times, almost entirely on headings and icon glyphs.

- Field-sized controls (`TxInput`, `TxSensitiveInput` at `md`) use **14px** for the value and **13px** for the label.
- Secondary text — descriptions, helper lines, empty-state copy — is **12px**.
- Metadata that is not read as prose (`TxTag` at 11px, `TxIconChip` at 7px) is exempt; it is a glyph, not text.

A component that needs 16px content is a component whose hierarchy is wrong. Fix the hierarchy.

### Headings are sentence case; product names are title case

`Recent requests`, not `Recent Requests`. `Account settings`, not `Account Settings`. Product and component names keep their own casing: `TuffEx`, `CoreBox`, `SensitiveInput`.

This applies to docs pages, demo titles and any label a component renders from a prop default.

### Never change tracking on body text

No `letter-spacing` on anything at body size. The library's 22 `letter-spacing` declarations are all on one of three shapes, and nothing else may join them:

- **Uppercase micro-labels** at ≤11px (`TxSidebarNav` section headers `0.08em`, `TxSelect` group headers `0.06em`, `TxCodeBlock` language chips `0.04em`). Uppercase without tracking is unreadable at that size; that is the entire justification.
- **Display numerals** ≥20px, negative tracking (`TxModal` title `-0.01em`, `TxInsightMetric` `-0.01em`). Large type sets loose by default.
- **Avatar initials**, where the glyph is centred art, not text.

### `font-weight: 600` for headings, `500` for emphasis; never `700` on prose

The current tree has 12 `font-weight: 700` declarations. Every surviving one is on a ≤11px uppercase micro-label or a ≥28px display number (`TxStatCard`). That is the only remaining licence.

- Heading / title: `600`.
- Emphasis inside a sentence: `500`.
- `bold` as a keyword: never. It resolves to 700 and skips the token conversation entirely.

### Inline monospace runs ~0.9em

A code span inside prose uses `font-size: 0.9em` relative to its surrounding text. Monospace faces carry a larger x-height than the UI face, so a 1em code span reads a step too big and breaks the line's rhythm.

---

## Spacing

### Related text is closer to its owner than to its neighbours

A label belongs to its field; a description belongs to its label. The gap inside that group is always smaller than the gap between groups.

`TxSensitiveInput` is the reference: `6px` between label → field → description inside the component, with the host owning the larger inter-field gap. `TxFormItem` uses `12px` between label column and control, `4px` between control and error message.

If a description sits the same distance from its own field as from the next field, the grouping is invisible and the user re-parses the form.

### Vertical padding is optically smaller than horizontal

Text carries its own line-height, so equal numeric padding reads bottom-heavy. `TxScrubField` states this explicitly: `padding: 4px 8px 4px 6px` on a 26px chip.

Rule of thumb: vertical ≈ 0.6–0.75 × horizontal for anything wrapping a single text line.

### Horizontal inset clears the corner radius

`TxInput` sets `padding: 0 12px` against `border-radius: 12px`, with the reason in the source: the caret and placeholder must clear the corner's curve rather than start inside it. Any field whose radius grows must grow its inset with it.

---

## Borders, rings and radii

### A ring, not a border, when the element has a shadow or a fixed height

`border` participates in layout: thickening it on focus moves everything inside by the delta and shifts the row. An `inset` `box-shadow` does not.

```scss
// Correct — the box stays exactly --tx-si-height tall through focus
box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6);
&:focus-within { box-shadow: inset 0 0 0 1.5px var(--tx-color-primary), 0 0 0 3px var(--tx-color-primary-light-9); }
```

`TxSensitiveInput` and `TxScrubField` (`box-shadow: 0 0 0 1px`, commented "Ring, not border: the field's box has to stay 26px tall next to its untinted neighbour") both do this. `TxInput` predates the rule and still uses a `1px solid` border; that is legacy, not a pattern to copy.

A drop shadow and a border on the same element are mutually exclusive: the border's hard edge and the shadow's soft one fight, and the corner reads doubled. Use the ring.

### Nested radii must be concentric

When two rounded edges sit ≤8px apart, the outer radius equals the inner radius plus the gap. `outer = inner + padding`. Anything else leaves a visibly uneven ring of background between the two curves.

`TxSensitiveInput`'s copy tab is the worked example: the tab is inset `8px` from the field's right edge, so its top corners are `calc(var(--tx-si-radius) - 6px)` — the field radius minus the inset, keeping the two curves parallel where they meet.

### A sticky element is separated by a border, not a shadow

Sticky headers, toolbars and footers that scroll content underneath use a `1px` line in `--tx-border-color`. A shadow under a sticky bar reads as elevation the element does not have and blurs the first row of content behind it.

---

## Colour

### Every colour comes from a `--tx-*` token

A hex literal or bare `rgba()` in a component is a bug: it survives the `.dark` swap and both high-contrast blocks (`tx-high-contrast-light` / `tx-high-contrast-dark` in `variables.scss`). The `var(--tx-token, #fallback)` form is the convention — the fallback exists for hosts that load a component's CSS without `variables.scss`, not as the real value.

Semantic hues are `--tx-color-{primary,success,warning,danger,info}` with their `-light-3/5/7/9` ramps. Ink is `--tx-text-color-{primary,regular,secondary,placeholder,disabled}`. Surfaces are `--tx-bg-color*` / `--tx-fill-color*`. Lines are `--tx-border-color*`.

> **Dark fills: `-light-8` / `-light-9` only** (danger has no `-light-8` in any theme — use `--tx-color-danger-light-9`, hand-picked `#4f2020` in dark). In the normal dark block (`[data-theme="dark"], .dark` in `variables.scss`) the fill tints mix toward the dark surface — primary's are hand-picked (`#18222c` is primary 10% over `#141414`), and since 2026-09-24 `--tx-color-primary-light-8` and success / warning / info `-light-8` / `-light-9` follow the same rule as `color-mix(in srgb, var(--tx-color-<hue>) 10%|20%, var(--tx-bg-color, #141414))` (they had been copied from the light theme as mixes toward white, so every soft badge, banner or selected row on them was a light tile on the dark page; `src/__tests__/dark-fill-tints.test.ts` guards it). The formula-derived lighter steps (success `-5 / -7`, warning `-3 / -5 / -7`, info `-3 / -6 / -7`, danger `-3`) still mix toward white in dark: core-app reads `--tx-color-warning-light-7` as ink on coloured fills, so turning that ladder needs its own audit. Do not build a dark-mode fill on those steps; use `-light-9` or `color-mix(in srgb, var(--tx-color-<hue>) 14%, transparent)`.

### Semantic colour is never the sole carrier of state

Colour is additive to a text label or an icon. A user who cannot distinguish the hue must still be able to read the state.

### White ink on a solid semantic fill is not a supported pairing

Recorded in `component-guidelines.md` with measurements: `TxStep`'s completed icon lands at 1.74:1, `TxTabBar`'s badge and `TxToolConfirmation.is-dangerous` at 2.77:1. Lightening the token makes those worse. Use dark ink on the fill, or use the `-light-9` tint as fill with same-hue ink.

"Same-hue ink" has to be measured; the plain hue on its own `-light-9` does **not** clear 4.5:1 for 13px text in the light theme. `TxModeChip` measured it on 2026-09-24: success 2.08, warning 2.03, danger 2.61, info/primary 2.53, and `-dark-2` inks only 3.12 / 3.82. The recipe that passes in all four theme blocks, resting and hovered, over both `--tx-bg-color` and `--tx-fill-color-light`, is the hue mixed toward the primary ink:

```scss
color: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 55%, var(--tx-text-color-primary, #303133));
```

It resolves darker in light themes and lighter in dark ones. P is 45 for success/warning, 55 for danger and 50 for info, the largest 5% step that passes; the worst case is 4.58. Record the measured table in the source, as `TxModeChip.vue` does, and re-measure whenever a `-light-9` token moves.

### Resting ink for 13px text is `regular`, not `secondary`

`--tx-text-color-secondary` measures 3.08:1 on white and 2.87:1 on `--tx-fill-color-light`, under the 4.5:1 that 13px text needs. A text action whose hover darkens to `--tx-text-color-primary` rests on `--tx-text-color-regular` (5.69:1 worst case, light theme on the tray), as `TxModeChip`'s `muted` tone and `TxChatComposer`'s tray do. `secondary` stays fine for icon-only glyphs, which need 3:1, and for 12px helper copy that nothing depends on reading.

### A surface that has to hide what is under it needs an opaque backstop

`--tx-fill-color-blank` is `transparent` in the normal dark block. A card that slides over other content, or masks it, cannot use it alone. `TxChatComposer`'s card paints `background-color: var(--tx-bg-color)` under `background-image: linear-gradient(var(--tx-fill-color-blank) 0 0)`: the light and high-contrast themes look identical, and the dark card becomes opaque `#141414` instead of showing the tray through it mid-slide.

`--tx-color-on-primary` exists for the one sanctioned exception and is per-theme (`#ffffff` light/dark, `#0a2540` in high-contrast dark, where `#7cc4ff` is too light for white).

---

## Motion

### Hover colour changes are immediate

Never put `color`, `background-color` or `border-color` in a `transition` that fires on `:hover`. A hover is a sub-100ms interaction; easing it makes the UI feel like it is lagging behind the pointer.

Transitioning `opacity`, `transform` or `box-shadow` geometry on hover is fine — those are motion, not colour. `TxSensitiveInput`'s copy tab transitions `opacity` alone for exactly this reason.

Legacy violations exist (`TxCopyButton` line 146 transitions `color`/`background-color`; `TxInput` line 197 transitions `border-color`). They are grandfathered; new components must not add more.

### A state change may ease colour; gate the transition on the change, not the element

A tone or mode switch (`muted` → `danger`) is not a hover, so easing its fill and ink is allowed. Declaring `transition: background-color …` on the element would ease every hover as well, though, because a transition applies to every change of the property. Put the colour transition on a class that exists only while the state is changing:

```scss
// Wrong — the hover rule below now eases too
.tx-mode-chip { transition: background-color 240ms, color 240ms; }

// Correct — TxModeChip: `.is-morphing` is set when label/icon/tone change and
// cleared after the longest leg (delay + max(fade, width) = 350ms)
.tx-mode-chip.is-morphing {
  transition: background-color 240ms var(--tx-ease-out-strong), color 240ms var(--tx-ease-out-strong);
  @media (prefers-reduced-motion: reduce) { transition: none; }
}
.tx-mode-chip:hover:not(:disabled) { background-color: var(--tx-mode-chip-fill-hover); } // instant
```

A child that inherits the ink needs the same care. `TxTextTransformer`'s layers declare their own `color` tween, so `TxModeChip` narrows them to `transition-property: opacity, filter` through `:deep()`. Without that, the label would ease on every hover.

Guard it with a compiled-style contract: sass-compile the SFC style, then assert that no rule outside `.is-morphing` transitions `color` or `background-color` (`mode-chip-motion.test.ts`, `chat-composer-style.test.ts`).

### Every transition has a reduced-motion escape

```scss
@media (prefers-reduced-motion: reduce) { transition: none; }
```

Non-negotiable for any declared transition or animation. Keyframe animations additionally must keep the *final* state visible when motion is dropped — a skeleton keeps its placeholder, a fade-in keeps its content.

Worked example: `TxEmptyState`'s illustrations (all variants since 2026-09-24). An element whose resting style is not a finished frame of its animation — a stroke at a full dash offset or a dot at opacity 0 (the hidden start), a bubble not yet shifted into place — must be set to the frame its animation ends on inside the reduced-motion block, not merely have `animation: none`; otherwise the still frame is missing that part or shows it out of place. `empty-state.test.ts` fails when any `animation: tx-empty-state-*` selector has no reduced-motion stop.

The inverse form is equally valid and smaller: declare the animation **only** inside `@media (prefers-reduced-motion: no-preference) { … }`, so reduced motion never starts it and the element simply rests in its declared (final) style. `TxStatCard`, the charts and `TxChoiceCard` use it (2026-09-26: it took ~0.4 KiB off `TxChoiceCard` with pixel-identical output). Pick one form per component; a style-contract test must then assert the form you picked — either every animated selector has a `reduce` stop, or every `animation:` declaration sits inside a `no-preference` block.

### Collapsing content keeps its size while it closes

A collapse that shrinks its content box during the close animation makes the text reflow on the way out, which reads as a glitch rather than a transition. Animate the container; leave the content at its measured size until the animation ends. See `bui-disclosure-collapse` in `style/mixins.scss`.

### A looping effect runs on the compositor, with its parameters outside the keyframes

A loading or ambient effect plays exactly while the main thread is busy (a search in flight, a model streaming), so no frame of it may need the main thread:

- Animate only `translate`, `scale`, `rotate` and `opacity`, as individual properties. Two animations on one element then never compete for `transform`, and a static `transform` can still hold a base size that the animated `scale` composes with.
- Keep `var()` out of `@keyframes`. Per-element parameters such as period, phase and hue sit on the element as custom properties and reach the animation through `calc()` in `animation-duration` / `animation-delay`, never through keyframe values.
- Write the per-instance custom properties inline and keep one rule for every instance, instead of generating a selector per instance.

Additive light only works on dark surfaces. `mix-blend-mode: plus-lighter` is what makes overlapping beams merge towards white on dark. On a near-white page it is invisible, and a white core reads as a grey smudge, so light mode keeps the core coloured and blends `normal`. `multiply` is not the fix: it turns blue over yellow into olive.

Worked example: `TxPrismGlow` (2026-09-26); `prism-glow.test.ts` covers it.

### A loading surface retracts when content lands under it

When results arrive and make the host of a loading effect taller, the effect must not share a frame with the content. Swap the fade-out for a short retract (about 140ms) the moment the host grows, and keep the effect off until the loading flag cycles. `TxPrismGlow`'s `collapseOnGrow` is the reference:

- Watch the height with a `ResizeObserver`. Its callbacks run after layout and before paint, and Vue flushes in the same step, so a frame showing grown content under a lit effect never paints.
- Ignore growth below about 8px: a late web font reflows the host by a few pixels, and that is not content.
- Growth during a fade-out counts too, because `items = data; loading = false` in one update is the common case. Speed up the running fade through `animation.playbackRate` rather than restarting it.
- An `inset: 0` layer stretches with a growing host, so pin the leaving layer to its pre-growth height in the Transition's `@before-leave` hook. A node that `v-if` is removing receives no new bindings; a reactive `:style` cannot pin it.

---

## Structure

### Overlays use an `open`/`visible` prop, never `v-if` on the root

`v-if` on a dialog's root destroys the component before its leave transition can run, so it vanishes instead of closing.

```vue
<!-- Correct: TxModal keeps Teleport + Transition mounted, gates the panel -->
<Teleport to="body">
  <Transition name="tx-modal">
    <div v-if="visible" class="tx-modal__overlay">…</div>
  </Transition>
</Teleport>
```

The `v-if` goes **inside** `Transition`, never around it.

### A full-viewport overlay teleports itself to `<body>`

`position: fixed` is relative to the viewport only until an ancestor has a `transform`, `filter`, `contain` or `content-visibility` — then that ancestor is the containing block. The component cannot know its host, so it teleports rather than relying on every caller to. TxModal, TxCommandPalette and (since 2026-09-23) TxFlipOverlay do; FlipOverlay used to render in place, and inside the Nexus docs article (`content-visibility: auto`) its card centred on the whole article and `focus()` scrolled the page 870px to reach it.

A Teleport root cannot take fallthrough attributes. Set `inheritAttrs: false` and bind `$attrs` on the element that used to receive them, so existing callers' classes and listeners land where they did.

Tests that `wrapper.find()` inside the overlay stub it: `config.global.stubs = { ...originalStubs, teleport: true }` in `beforeAll`, restored in `afterAll`.

### Interactive elements are semantic

A native `<button type="button">` with its appearance reset, not a `div @click`. A `role="button"` container is permitted only when the container must hold other interactive children — nesting a `<button>` inside a `<button>` is invalid HTML. `TxSensitiveInput`'s masked field is that case (it contains the eye and copy buttons) and therefore carries `role="button"`, `tabindex`, an `aria-label`, an `aria-describedby` instruction, and explicit Enter/Space handling. Anything less is a `div @click` wearing a role attribute.

### Icons align optically with the first line of text

An inline icon is optically the same size as the text beside it and is centre-aligned with the **first** line, not with the block. For multi-line text, wrap the icon in a box one line-height tall and centre it there.

### Never stack one card inside another

Two nested elevated surfaces produce a border-on-border seam and an ambiguous shadow direction. Group with whitespace, a hairline, or type hierarchy; reserve the card for a genuinely separate object.

---

## New component checklist

A component is not done when it renders. It is done when all of these hold:

1. Size vocabulary matches an existing one. Run `pnpm -C packages/tuffex audit:vocab` and reuse a union it already prints; do not mint a new one. `xs | sm | md | lg` is the spelling for new components — the button family is the reference (`button/src/size.ts`), trimmed to `sm | md | lg` because it renders three heights and nothing needs a fourth.
2. One spelling per component. The audit counts unions across the library, and a cross-component difference is tolerable — `TxAvatar` sizing in `large`/`small` hurts nobody. What is not tolerable is a single component accepting two spellings for one behaviour: `TxButton` typed six values for three tiers, so `size="small"` and `size="sm"` appeared side by side in the same template (372 callsites on the long spellings, 45 of them `mini`, which was pixel-identical to `sm`). If a size union contains both a short and a long spelling of the same tier, it is a defect, not a style.
3. Status vocabulary reuses `'default' | 'error'` (as `TxTextarea` and `TxSelect` do) unless the domain genuinely needs more states. `error` is the prop value even though the token is `--tx-color-danger`; `danger` as a prop value belongs to `variant`/`type`, which name a visual tone rather than a validation state.
4. Sizes are driven by component-local custom properties on the root (`--tx-si-height`, `--tx-si-pad`, …) set per size class, not by duplicated rule blocks per size.
5. Every user-visible string is a prop with a documented default. TuffEx owns no message catalog — see `SensitiveInputLabels` / `IconPickerLabels` for the shape.
6. Screen-reader-only text uses the clip pattern (`position: absolute; width: 1px; height: 1px; clip: rect(0,0,0,0)`), never `display: none`, which removes the node from the a11y tree.
7. A state that changes without user action gets a `role="status" aria-live="polite"` region. Swapping a visible label or an `aria-label` is never re-announced.
8. Registration chain complete: component dir → `components.ts` → the matching `base`/`pro`/`ai` barrel (guarded by `src/__tests__/suite-barrels.test.ts`) → `apps/nexus` taxonomy, sidebar, gallery, hub index → `.zh.mdc` + `.en.mdc` + demo + `demo-registry.ts`. See [TuffEx Docs Sync](./tuffex-docs-sync.md).
9. The stylesheet fits `pnpm -C packages/tuffex audit:size`. The full and on-demand CSS gates run with only a few KiB of headroom, so a new component slims before it asks for a gate change: stagger with one rule reading an inline `--<block>-index` custom property instead of generated `:nth-child` rules, put layout variants in container queries, let ink inherit instead of restating it per element, and never re-declare what a composed primitive (`TxSkeleton`, `TxIcon`) already ships. A gate bump, when it is unavoidable, rides in the same commit as the component that needs it, never in a later "fix CI" commit.

### Narrowing a published prop union

Removing a value from a prop union in a published package is safe only if the runtime keeps accepting it. A Vue prop union is erased at runtime, so a consumer who compiled against an older version keeps passing the old string from plain JS and Vue hands it straight through. Narrowing the type without keeping the mapping does not raise an error for them — it silently changes rendering.

The shape that works, as `button/src/size.ts` does it: canonical union exported as the prop type; the removed spellings kept only as keys of an untyped `Record<string, Canonical>` so they are unreachable from any typed callsite; one resolver used by every component in the family. Then rewrite every in-repo callsite in the same change and prove it — narrow the type, run the package and app typecheckers, and confirm a deliberate old-spelling callsite is rejected. An attribute-scanning script is not proof: a regex whose tag body excludes `<` stops at the first `:disabled="count <= 0"` and silently skips every attribute after it.

---

## Verification

- `pnpm -C packages/tuffex audit:vocab` — prints every `size` / `status` string union and its users. Report-only; read it before naming a new prop vocabulary.
- `pnpm -C packages/tuffex audit:cursor` — interactive elements without a `cursor` declaration.
- `packages/tuffex/packages/components/src/__tests__/bui-dark-neutral-ramp.test.ts` and `shadow-light-source.test.ts` — token-level guards on the dark ramp and shadow direction.
- Contrast claims must be measured and the number recorded in the source comment, as `variables.scss` does. An unmeasured contrast assertion is not evidence.
