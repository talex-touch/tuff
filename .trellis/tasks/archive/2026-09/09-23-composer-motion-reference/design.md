# Design — Composer 动效：托盘换位 / 墨色悬停 / 芯片模糊变身

Decisions D1–D3 are in `prd.md`. Measured reference numbers are in `research/reference-motion.md`. This file is the technical shape only.

## Parts and boundaries

| # | Part | Where | Nature |
|---|---|---|---|
| A | `TxChatComposer`: stable shell/card DOM, reference restyle, optional tray with placement choreography | `packages/tuffex/packages/components/src/chat/src/TxChatComposer.vue`, `types.ts` | changed component (visible default change, per D1) |
| B | `TxModeChip`: new morphing state chip | `packages/tuffex/packages/components/src/mode-chip/` | new component |
| C | `TxTextTransformer` fade mode gains its missing reduced-motion escape | `text-transformer/src/TxTextTransformer.vue` | one-rule fix the chip depends on |
| D | `TxAiComposer` overrides migrated to the new DOM | `packages/intelligence-uikit/src/style/index.scss` | downstream of A |
| E | Docs, demos, registration, gallery | `apps/nexus/**`, READMEs, barrels | per `tuffex-docs-sync.md` and the registration chain |

`TxPromptBar` and `TxStatusBadge` are untouched.

## A. TxChatComposer

### DOM: one structure whether or not a tray exists

```
div.tx-chat-composer            ← root/shell: fallthrough class & attrs, drag/drop handlers
  [Transition] div.tx-chat-composer__tray.is-top      (tray slot, placement = top)
  div.tx-chat-composer__card    ← the white surface; z-index above the tray
    __attachments / __input > __textarea / __toolbar | __actions(-left/-right) / footer slot
  [Transition] div.tx-chat-composer__tray.is-bottom   (tray slot, placement = bottom)
```

- The root must not switch between "card" and "shell" depending on the tray. Switching would move fallthrough classes (for example `.tx-ai-composer`) between elements, and adding a tray would remount the textarea, dropping focus and IME state.
- Every existing internal class name is kept, so `intelligence-uikit` selectors keep matching. The `footer` slot stays inside the card, after the actions (compat).
- Tray visibility is `!!slots.tray`. Placement comes from the new prop `trayPlacement?: 'top' | 'bottom'` (default `'bottom'`). An optional `trayLabel?: string` puts `role="group"` + `aria-label` on the tray. The tray has no visible string of its own.
- **Props are declared as a runtime object** in the SFC (`defineProps({ … } satisfies Record<keyof ChatComposerProps, unknown>)`), the pattern `TxFilterChips`, `TxTabs` and `TxTabBar` use. The interface stays exported from `types.ts` for callers. Reason: with the type-only form, a field added to an imported props interface never reaches the compiled props in the Vite and Nuxt dev servers (confirmed twice, 2026-09-06 and 2026-09-11). `trayPlacement` would silently read as its default there while vitest passes. `TxModeChip` is declared the same way from day one.

### Restyle (D1)

- **Shell**: `border-radius: var(--tx-chat-composer-radius, 18px)`, no padding. The fill `var(--tx-fill-color-light)` applies only when a tray exists (`.has-tray`). With no tray the shell is invisible and the card reads as the whole composer.
- **Card**:
  - `background: var(--tx-fill-color-blank)`, `border-radius: inherit`;
  - an inset ring instead of a border, `box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter), var(--tx-elevation-1)` (design rule: shadow ⇒ ring);
  - `:focus-within` darkens the ring to `--tx-border-color`;
  - padding clears the 18px radius (≥14px horizontal).
- **Textarea**:
  - `border: 0; background: transparent; padding: 0; font: inherit; resize: none`;
  - 14px text, line-height 1.6. `font: inherit` fixes the monospace placeholder seen in the gallery.
  - Auto-grow uses `field-sizing: content`, bounded by `min-height = minRows × 1.6em` and the existing `max-height = maxRows × 1.6em` var. Browsers without `field-sizing` keep fixed `rows=minRows` and scroll. This replaces the drag grip, which has no place in a borderless card.
- **Toolbar**:
  - The attach button becomes an icon-only `+` (`aria-label` = `attachmentButtonText`).
  - The send button becomes a compact round icon button (arrow-up, `aria-label` = `sendButtonText`, ink fill `--tx-text-color-primary` with inverse icon `--tx-bg-color`). Disabled uses `--tx-fill-color` fill and placeholder ink.
  - Both use ink-only hover: secondary → primary ink, immediate (D3).
  - The send button's form is D5. The reference crops it out, so it is our call, approved 2026-09-24.
- **Drag-over**: the ring turns primary and the card gets a `--tx-color-primary-light-9` wash. The dashed border cannot survive as a ring.
- **Disabled**: `opacity: 0.75` on the shell (unchanged).

### Tray placement choreography (R1)

FLIP on the card plus a Vue `<Transition>` for the leaving tray. It is driven from a `watch([trayPlacement, hasTray])`:

1. `flush: 'pre'`: read FIRST (`card.getBoundingClientRect().top − shell.top` and shell height). A rect read includes any running transform, so an interrupted slide starts from where the card visibly is. Then cancel running animations.
2. Vue patches:
   - the old-side tray leaves via `Transition name="tx-chat-composer-tray"`. The leave-active state is `position: absolute` pinned to its side, `opacity → 0`, `filter: blur(2px)`, 200ms `ease-out`. It does not take space, and the card slides over it.
   - The new-side tray enters with **no** transition. It sits under the card and is uncovered by the slide (reference: incoming content is revealed, not faded).
3. `nextTick`: read LAST, then animate
   - `card.animate([{ transform: translateY(Δ) }, { transform: 'none' }], { duration: 450, delay: 70, easing: 'cubic-bezier(0.65, 0.16, 0.1, 0.88)', fill: 'backwards' })`. The curve is the least-squares fit to the reference samples, 0.87 video px RMS; standard curves are ≥2px RMS.
   - If shell height changed (tray added or removed, or unequal heights): animate `shell.height` on the same timing while `.is-resizing` sets `overflow: hidden`, then drop it on finish. Keeping it off otherwise stops the card's elevation shadow from being clipped.
4. Focus: if `document.activeElement` was inside the leaving tray, focus the textarea (`preventScroll`) after the patch.

Guards:
- reduced motion (`matchMedia` in JS, `transition: none` in CSS) skips steps 1/3 and the leave transition, landing on the final layout;
- no `element.animate` (jsdom) settles immediately;
- watchers never run in SSR.

Timings live as named constants in the SFC, with a comment pointing at `research/reference-motion.md`.

## B. TxModeChip

**Name.** `TxModeChip` (D4). `TxStateChip` was the working name, dropped because `*-state` in this library already means full-page state views (`EmptyState`, `ErrorState`, `LoadingState`, `OfflineState`, `PermissionState`, `GuideState`), and "StateChip" would read and sort as one of them.

**API**
- `label: string`
- `icon?: string` (class string, the library convention: `TxButton`, `TxStatusBadge`)
- `tone?: StatusTone` (default `'muted'`, the union exported by `status-badge/src/types.ts`)
- `disabled?: boolean`
- Native `<button type="button">`. Attrs fall through (for example `aria-pressed`, `title`), so there is no custom click event beyond the native one.
- One size (28px, 13px text). A `size` union is deferred until a second size is needed (design rules: do not mint vocabulary speculatively).

**DOM**

```
button.tx-mode-chip.is-<tone>[.is-morphing]
  span.tx-mode-chip__icon[aria-hidden]  > Transition(name=tx-mode-chip-icon) > i[key=icon][class=icon]
  TxTextTransformer.tx-mode-chip__label  mode="fade" :text="displayLabel" duration-ms=280 blur-px=6
```

**Morph (R3)**

When `label`, `icon` or `tone` changes:

1. Set `.is-morphing`. This alone enables `transition: background-color 240ms, color 240ms`. Hover never animates colour, because the transition does not exist outside a morph (D3 and the design rule both hold).
2. The icon swaps immediately. Leave: `scale(0.5)` + `opacity 0` over 160ms. Enter: `scale(0.5) → 1` + `opacity` over 240ms, `--tx-ease-out-strong`. The leaving icon is absolutely positioned in a fixed square box, so the icon never changes chip width.
3. After 50ms (icon leads text, as in the reference), `displayLabel = label`. The blur crossfade is `TxTextTransformer`'s own; no second text engine (`tuffex-text-motion.md`).
4. Width FLIP at the `displayLabel` change: `chip.animate(width: first → last)`, 300ms, `--tx-ease-out-strong`.
5. Clear `.is-morphing` after the longest leg (~330ms).

Under reduced motion, everything lands at once: no delay, no WAAPI, and the transitions are cut by media query.

**Tones**
- `muted`: transparent fill, `--tx-text-color-regular` ink; hover changes ink to `--tx-text-color-primary` immediately. `--tx-text-color-secondary` measured only 3.08:1 in light, so it cannot be the resting ink at 13px.
- Other tones:
  - fill `--tx-color-<tone>-light-9`;
  - hover fill is `color-mix(in srgb, var(--tx-color-<tone>) 20%, var(--tx-bg-color))`, because `--tx-color-danger-light-8` is **absent** in two theme blocks of `variables.scss`, so `-light-8` cannot be relied on;
  - ink is `color-mix(in srgb, var(--tx-color-<hue>) P%, var(--tx-text-color-primary))`, with P = 45 (success, warning), 55 (danger), 50 (info). This is still hue-derived and built only from tokens.
- Why that ink recipe (measured 2026-09-24): the design rule's plain "same-hue ink on `-light-9`" fails in the light theme. Measured ratios were success 2.08, warning 2.03, danger 2.61, info 2.53, and `-dark-2` inks reach only 3.12 / 3.82. The mixed inks reach worst cases of 4.79 / 4.74 / 4.58 / 4.83, across all four theme blocks, at rest and on hover, over both the page and the tray.
- The measured table lives in the SFC comment. The measurement was taken against a tree that contained the in-flight dark `-light-8/-9` change from 09-23-nexus-base-gallery-sidebar, and is re-run once that change is committed.

**Class prefix and style**: `tx-mode-chip`, scoped SCSS except the `TxTextTransformer` child styling done through `:deep()`. Not a BUI-family component: no `tx-bui-` prefix, no MIT header.

## C. TxTextTransformer

Two changes, both in the fade path; there is no API change.

1. Add `@media (prefers-reduced-motion: reduce) { .tx-text-transformer__layer { transition: none; } }`, so the class flip lands instantly.
2. **Fade-in bug (found during implementation, 2026-09-24).** `runTransition` sets `has-prev` (the setup state: current layer at opacity 0 + blur) and then sets `is-animating` inside a single rAF. A rAF callback runs before that frame's style recalc, so the browser computes the setup and animating states together and the new text never fades in. The old text only blurs out, or both swap instantly.
   - Fix: `.has-prev:not(.is-animating) .tx-text-transformer__layer { transition: none }`, so the setup state is applied without a transition.
   - Plus a forced style commit (`void root.offsetWidth`) after the `nextTick` and before the rAF.
   - Consequence: every fade-mode consumer now actually fades in, including `TxSwitch` labels. Record it in the `text-transformer` and `switch` docs.

Add one Review Notes line to `text-transformer.{zh,en}.mdc`.

## D. intelligence-uikit

`.tx-ai-composer` currently paints the root as the card: border-color, radius 20, background, shadow, padding, `:focus-within`, plus the submitting glow pseudo-elements. It also re-borders the textarea.

After A:
- The root is the shell. Drop the root-surface and textarea-border overrides, so the dashboard adopts the new card per D1.
- Keep the `is-submitting` glow pseudo-elements on the root: with no tray, the shell box equals the card box.
- Keep the attachment and button spacing overrides only where they still apply.

Verify in the intelligence-uikit playground (`src/playground/App.vue`) and, if reachable locally, the Nexus dashboard `IntelligenceAgentWorkspace`.

## E. Docs and registration

- `chat-composer.{zh,en}.mdc`:
  - two new demo sections next to 基础用法: 托盘换位 / Tray placement, 搭配模式芯片 / With a mode chip;
  - Props `trayPlacement`, `trayLabel` and Slot `tray`, placed by meaning;
  - Interaction Contract: choreography, focus handoff, reduced motion;
  - Best Practices: single-line tray content, equal heights top/bottom;
  - Review Notes: reference link and numbers; rejected options (fading the incoming tray, the video's 120ms hover ease).
- `mode-chip.{zh,en}.mdc` plus demo, demo-registry, both hubs (`index`, `ai-suite`), `DocsSidebar.vue`, gallery AI-band cell.
- Also `components.ts`, `ai/index.ts` barrel, `README.md` and `README_ZHCN.md` counts.
- Wrapper and mention sweep: `chat`, `prompt-bar`, `ai-suite` docs, `AiSuiteChatShowcaseDemo.vue`, gallery ChatComposer cell.
- `text-transformer.{zh,en}.mdc`: one reduced-motion note.

## Compatibility

- Props, events, slots and internal class names are all kept. New props and slot are additive.
- The visible default changes, as agreed in D1:
  - borderless textarea in a ring card;
  - icon-only attach and send buttons;
  - auto-grow in place of the drag grip.
- Root semantics change: the root is now the shell. A consumer styling `.tx-chat-composer` as the card must retarget to `.tx-chat-composer__card`. The only in-repo case is `intelligence-uikit` (part D). Called out in the docs Review Notes.

## Rollback

Parts are separable. B, and the gallery/docs entries for it, revert as one directory plus the registration lines. A and D revert together (SFC, tests, uikit styles). C is one rule.
