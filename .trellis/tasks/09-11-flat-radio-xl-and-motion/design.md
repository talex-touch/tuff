# Design — FlatRadio `xl` size and silky indicator motion

Scope: `packages/tuffex/.../flat-radio/`, one core-app wrapper type, the Nexus gallery cell,
and the docs the change makes stale. No behaviour change for any existing caller.

---

## 1. Boundaries

| Owner | Files | Change |
| --- | --- | --- |
| Component | `flat-radio/src/{types.ts,TxFlatRadio.vue,TxFlatRadioItem.vue}` | `xl` tier, motion rework |
| Component tests | `flat-radio/__tests__/flat-radio.test.ts` | new contracts, one assertion replaced |
| core-app wrapper | `components/tuff/TuffBlockFlatRadio.vue` | `radioSize` union widened |
| Docs showcase | `DocsComponentsGallery.vue` (+ `.css` if a row needs it) | cell → 3-row stack |
| Docs demo | `demos/FlatRadioSizesDemo.vue` | `xl` row |
| Docs prose | `flat-radio.{zh,en}.mdc`, `fine-tune-card.{zh,en}.mdc` | sizes, contract, coverage |

Untouched by design: `StoreHeader.vue`, `SettingLanguage.vue`, `TxFineTuneCard.vue`, the six
other `FlatRadio*Demo.vue`, `demo-registry.ts` (no new demo component).

---

## 2. The sizing contract must stay inline CSS variables

`TxFineTuneCard` drives the segmented control's geometry like this:

```vue
<TxFlatRadio size="sm" :style="SEGMENTED_STYLE" />   <!-- --tx-flat-radio-height: 28px, … -->
```

It works because a parent's fallthrough `style` merges over the child's own `:style` binding
on the same root element — the source comment says so explicitly, and a descendant CSS rule
would lose to the inline binding. So:

> **Constraint C1.** Geometry stays delivered as inline custom properties from
> `cssVars`. Moving the ladder to `.is-xl`-style classes would silently un-break
> FineTuneCard's override (classes lose to inline styles), with nothing red.

`xl` therefore is one more row in the existing `sizeConfig` map, nothing structural.

### The ladder

| Token | sm | md | lg | **xl** |
| --- | --- | --- | --- | --- |
| `height` | 24px | 30px | 36px | **44px** |
| `padding` | 2px | 3px | 4px | **5px** |
| `fontSize` | 12px | 13px | 14px | **15px** |
| `gap` | 2px | 4px | 4px | **6px** |
| `radius` | 6px | 8px | 10px | **14px** |
| `itemRadius` | 4px | 6px | 8px | **10px** |
| `itemPadding` *(new)* | 0 8px | 0 8px | 0 8px | **0 16px** |
| `itemGap` *(new)* | 4px | 4px | 4px | **6px** |

The two new rows exist because item padding (`0 8px`) and icon↔label gap (`4px`) are
hard-coded today; at 15px type they are visibly cramped. Both default to the current
hard-coded value on sm/md/lg, so R1's "byte-identical" holds, and FineTuneCard — which
overrides the other six but not these two — keeps exactly the padding it has now.

`itemGap` is read directly inside `TxFlatRadioItem` (custom properties inherit), not pushed
through the parent's `:deep()` block.

Because `sizeConfig` is `Record<TxFlatRadioSize, …>`, adding `'xl'` to the union makes the
compiler demand the row. That is the whole enforcement mechanism; no runtime guard.

---

## 3. Motion: the five defects and their fixes

### D1 — selection changes the selected item's own width

`.is-selected { font-weight: 500 }` reflows that item. Sibling items shift, and the
indicator's `width` target moves *while it is animating toward the old one*. This is the
largest single contributor to the jitter and no easing change can hide it.

**Chosen fix — constant weight, colour-only selection.** Every item renders at
`font-weight: 500`; unselected keeps `--tx-text-color-secondary`, selected takes
`--tx-text-color-primary`. Layout becomes selection-independent, and it holds for arbitrary
slot content.

Rejected:

- **Ghost sizer** (`::after { content: attr(data-label); font-weight: 500 }` reserving the
  bold width). Preserves today's exact look, but only when the `label` prop is used —
  `StoreHeader` and `TxFineTuneCard` both pass slot content, so the two call sites that
  matter get nothing.
- **Render the slot twice, grid-stacked**, one copy hidden at weight 500 as the sizer. Slot-
  safe, but it mounts user-supplied content twice; a slot holding a stateful component or an
  `id` would break in a way this component cannot see.
- **Drop the weight to 400 everywhere.** Also layout-stable, but it weakens selection
  instead of strengthening the rest, and selection is the thing the control exists to show.

Cost accepted: unselected labels sit one weight step heavier than on `master`.

### D2 — travel and resize run on different curves

Today `transform` overshoots over 0.25s while `width` eases over 0.2s, so on labels of
different widths the thumb arrives and *then* finishes resizing.

Both properties get one duration and one curve, exposed as contract variables:

```scss
--tx-flat-radio-duration: 0.26s;
--tx-flat-radio-ease: cubic-bezier(0.32, 1.28, 0.5, 1);

transition:
  transform var(--tx-flat-radio-duration) var(--tx-flat-radio-ease),
  width     var(--tx-flat-radio-duration) var(--tx-flat-radio-ease),
  opacity   0.15s ease;
```

The overshoot applies to `width` too — deliberately. The thumb stretching slightly past its
target and settling is what reads as one physical body rather than a box being resized.

### D3 — integer-rounded geometry

`offsetLeft` / `offsetWidth` round to whole pixels, so the thumb can sit 1px off its item and
the error changes per item, which reads as wobble. Replaced by fractional rects:

```ts
function readGeometry(el: HTMLElement, root: HTMLElement) {
  const item = el.getBoundingClientRect()
  const box = root.getBoundingClientRect()
  // Rects are visual px — an ancestor transform or zoom scales them, while the
  // translateX below is in the container's own coordinate space. Normalise by
  // the container's own scale before using the delta.
  const ratio = root.offsetWidth > 0 ? box.width / root.offsetWidth : 1
  const scale = Number.isFinite(ratio) && ratio > 0 ? ratio : 1
  // `left: 0` on the indicator resolves against the padding box; rect deltas
  // start at the border box, so drop the border.
  return {
    left: (item.left - box.left) / scale - root.clientLeft,
    width: item.width / scale,
  }
}
```

`clientLeft` is the only term that matters for `bordered`, and it is 0 otherwise.

### D4 — no press feedback

The **label and icon** scale to `0.94` on `:active`, not the item box: the item box is what
`readGeometry` measures, so scaling it would feed the indicator a moving target and
re-introduce D1 through a different door.

### D5 — no reduced-motion path

A `@media (prefers-reduced-motion: reduce)` block drops `transform` and `width` from the
indicator's transition (the `opacity` fade stays, so appearance is still not a pop-in) and
removes the press scale.

### Not in scope

Directional squash — stretching the thumb toward its travel direction — needs a transient
JS-set `scaleX` composed with the `translateX` the same property already carries. It is a
second source of truth for `transform` and is not worth it for this pass.

---

## 4. Test contracts

`flat-radio.test.ts` already asserts against `TxFlatRadio.vue?raw`, so the style contracts
stay checkable in jsdom, where no layout runs.

| Contract | Shape |
| --- | --- |
| **Replaces** `/transform 0\.25s/` | Parse the `transition` declaration of `.tx-flat-radio__indicator`; assert the `transform` and `width` segments are identical once the property name is removed. This encodes D2 directly, rather than pinning a number a redesign would have to churn. |
| Indicator contrast | Unchanged (`color-mix` + `--tx-bg-color-overlay`). |
| D1 | Mount the group, read every `.tx-flat-radio-item`'s width, select a different value, read again — widths equal. In jsdom every width is 0, so this asserts the *source* instead: no `font-weight` inside an `.is-selected` rule. |
| D3 | Assert the source no longer reads `offsetLeft` / `offsetWidth` for geometry. |
| D5 | Assert a `prefers-reduced-motion: reduce` block exists and covers the indicator. |
| `xl` | Mount `size="xl"`, assert `--tx-flat-radio-height: 44px` on the root's inline style; assert `md` still yields 30px. |

---

## 5. Blast radius, resolved

Per `.trellis/spec/frontend/tuffex-docs-sync.md`:

1. **Own pages** — `flat-radio.{zh,en}.mdc`.
2. **Wrappers that render it** — `grep -rl flat-radio packages/tuffex/.../src --include='*.vue'`
   returns only `TxFineTuneCard`. It pins geometry by inline override, so `xl` cannot reach
   it; the **motion** change does. `fine-tune-card.{zh,en}.mdc` gets the motion line, not a
   size line.
3. **Pages that name it** — `index.{zh,en}.mdc` (link in a list) and `ai-suite.{zh,en}.mdc`
   ("reuses `TxFlatRadio`"). Neither makes a behavioural claim. Leave them.
4. **Outside tuffex** — `TuffBlockFlatRadio.vue` hand-copies `'sm' | 'md' | 'lg'`. It imports
   `TxFlatRadioValue` from `@talex-touch/tuffex/flat-radio` already, so it imports
   `TxFlatRadioSize` from the same entry and stops duplicating the union — which is what
   prevents this drift recurring on the next tier. It has no Nexus docs page.

### Placement inside the docs (not appends)

- Sizes prose `支持 sm、md（默认）、lg` → add `xl` at the end of the ladder, where it belongs
  in an ordered scale, and extend the `FlatRadioSizesDemo` snippet the same way.
- Props table `size` row: widen the union and keep the row where it is.
- **Interaction Contract**: the motion bullets join the existing indicator bullet at the top
  of that section — that bullet is already about the indicator, and the new rules amend it.
  The ARIA/keyboard block below stays untouched.
- **Best Practices**: the "selection no longer changes label weight" note goes beside the
  existing `sm` slot-content bullet, since both are about what labels may contain. The `xl`
  guidance goes beside it.
- **Review Notes**: new contract notes go *above* the `实测覆盖` / verified-coverage line,
  which stays last, and that line grows by the new test names.

---

## 6. Rollout / rollback

Single commit, no migration, no flag. Every change is additive except D1's weight rule and
D2's timing, both of which are pure CSS inside one scoped block — `git revert` restores the
prior look with no data or API consequence.

The one non-obvious ordering constraint: `apps/nexus` and `apps/core-app` resolve
`@talex-touch/tuffex/flat-radio` through `packages/tuffex/dist/`, so neither sees `xl` until
the gulp build runs. That is a sequencing item for `implement.md`, not a design choice.
