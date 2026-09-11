# Implement — FlatRadio `xl` size and silky indicator motion

Read `design.md` first; this file is the order, the commands, and the gates.

**Standing hazard.** A Nexus dev server is live on `:3200` (pid seen 2026-09-11) and other
Claude sessions share this working tree. Two consequences run through every step:

- `pnpm typecheck` / `nuxt typecheck` / core-app `typecheck:web` and the tuffex gulp build
  either kill that server or 503 it. They are batched into **Step 8**, once, deliberately.
- `git add -A` is forbidden. Stage the files this task names, and after committing run
  `git grep MUTATION HEAD` (a stray `// MUTATION` marker from a parallel session has landed
  on a green branch here before).

---

## Step 1 — Component: the `xl` tier

1. `flat-radio/src/types.ts` — `TxFlatRadioSize` gains `'xl'`.
2. `TxFlatRadio.vue` — widen the `sizeConfig` map's value type with `itemPadding` and
   `itemGap`, then fill all four rows per `design.md` §2. `sm`/`md`/`lg` values must not
   move; `itemPadding` is `0 8px` and `itemGap` is `4px` on all three, which is what is
   hard-coded today.
3. `TxFlatRadio.vue` — `cssVars` emits `--tx-flat-radio-item-padding` and
   `--tx-flat-radio-item-gap`; the `:deep(.tx-flat-radio-item)` block reads
   `padding: var(--tx-flat-radio-item-padding, 0 8px)`.
4. `TxFlatRadioItem.vue` — `gap: var(--tx-flat-radio-item-gap, 4px)`.

> Do **not** convert the ladder to size classes — constraint C1 in `design.md` §2;
> `TxFineTuneCard` overrides these variables inline and classes would lose to it silently.

## Step 2 — Component: motion (D1–D5)

In order, because D1 is what the rest is measured against:

1. **D1** — `TxFlatRadioItem.vue`: move `font-weight: 500` from `.is-selected` onto
   `.tx-flat-radio-item` itself; `.is-selected` keeps only the colour change.
2. **D2** — `TxFlatRadio.vue`: add `--tx-flat-radio-duration` / `--tx-flat-radio-ease` to the
   indicator rule and give `transform` and `width` the same pair.
3. **D3** — `TxFlatRadio.vue`: replace `offsetLeft` / `offsetWidth` in `updateIndicator` with
   the `readGeometry` helper from `design.md` §3.
4. **D4** — `TxFlatRadioItem.vue`: `:active:not(.is-disabled)` scales `__label` / `__icon` to
   `0.94`. Never the item box — `readGeometry` measures it.
5. **D5** — both SFCs: a `prefers-reduced-motion: reduce` block dropping `transform`/`width`
   from the indicator transition (keep the `opacity` fade) and the press scale.

## Step 3 — Tests

`flat-radio/__tests__/flat-radio.test.ts`, per `design.md` §4. The existing
`expect(body).toMatch(/transform 0\.25s/)` is **replaced**, not deleted — the new assertion
is that the `transform` and `width` transition segments are identical apart from the
property name. Keep the `color-mix` / `--tx-bg-color-overlay` assertions untouched.

```bash
node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run \
  --root packages/tuffex packages/components/src/flat-radio
```

## Step 4 — Gate A (component is self-contained here)

```bash
cd packages/tuffex
node ../../node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run
node ../../node_modules/.pnpm/eslint@*/node_modules/eslint/bin/eslint.js src/flat-radio --ext .ts,.vue
node ../../node_modules/.pnpm/vue-tsc@*/node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.json
```

Resolve the versioned `.pnpm` directory with `ls -d`; the `.bin` shims in this checkout are
stale (`tuffex-docs-sync.md`). **Rollback point 1:** everything so far is two SFCs and one
test file — `git checkout -- packages/tuffex/packages/components/src/flat-radio`.

## Step 5 — Publish the type to the consumers

`apps/nexus` and `apps/core-app` resolve `@talex-touch/tuffex/flat-radio` through
`packages/tuffex/dist/`, so `xl` does not exist for them until:

```bash
cd packages/tuffex && node ./node_modules/gulp/bin/gulp.js -f packages/script/build/index.ts
```

This 503s the `:3200` dev server for the duration. Run it once, here. If it dies with
`Cannot find module '.../corepack/v1/pnpm/<v>/bin/pnpm.cjs'`, the corepack cache is
marker-only — `rm -rf` that one version directory and retry (`corepack install` no-ops).

Then `apps/core-app/src/renderer/src/components/tuff/TuffBlockFlatRadio.vue`: import
`TxFlatRadioSize` alongside the existing `TxFlatRadioValue` type import and use it for
`radioSize`, replacing the hand-copied union. Default stays `'sm'`.

## Step 6 — Nexus showcase

1. `demos/FlatRadioSizesDemo.vue` — an `xl` block after `lg`, same shape as its siblings.
2. `DocsComponentsGallery.vue` — the FlatRadio cell (currently ~line 1274) becomes
   `docs-gallery__stack docs-gallery__stack--center` with three `docs-gallery__row`s:
   `xl` text (hero, keeps `flatRadioValue`), `md` icon+label, `sm` `multiple` icon-only.
   Two new refs beside `flatRadioValue`. Keep the `ClientOnly` + `docs-gallery__ph`
   fallback. No new CSS class unless a row genuinely needs one.
3. No `demo-registry.ts` line — `xl` ships inside the existing sizes demo, so no new demo
   component is created.

## Step 7 — Docs

Blast radius and placement are settled in `design.md` §5 — follow it rather than re-deriving.
Files: `flat-radio.{zh,en}.mdc` (sizes prose, sizes snippet, Props `size` row, Interaction
Contract, Best Practices, Review Notes) and `fine-tune-card.{zh,en}.mdc` (motion only — its
geometry is pinned by inline override, so no size line).

zh and en stay section-for-section identical in count and order.

```bash
cd apps/nexus
node build/check-doc-translation-parity.mjs
node build/check-mdc-fences.mjs
node build/check-demo-registry-orphans.mjs
```

## Step 8 — The batched typecheck window

Stop the `:3200` dev server first, run these together, then restart it:

```bash
# server down
cd apps/core-app && npm run typecheck          # typecheck:web rebuilds tuffex dist
cd apps/nexus && npx nuxt typecheck 2>&1 | grep 'error TS'   # exits 0 with errors on stdout
# server up
pnpm -C apps/nexus dev:pure                    # listening after ~10s
```

`nuxt typecheck` runs `nuxt prepare`, which wipes `.nuxt/dist` and leaves the server serving
503 until restarted — it does not self-heal. Hence the ordering.

## Step 9 — Verify the rendered page (required, not optional)

Reading the CSS is not evidence. Screenshot the live gallery cell:

```bash
# CDP harness already in-repo:
apps/nexus/scripts/audit-cdp-client.mjs   # createTarget / setViewport / screenshot
```

Assert on the image, at both widths:

- three rows visible, `xl` control clearly larger than the `md` and `sm` rows;
- nothing clipped by the 236px stage, no horizontal overflow at 640px;
- the thumb sits flush on its item (D3), and clicking across items does not shift the labels
  (D1).

`.mdc` edits lag the docs dev server by a minute or more with no error page — re-poll before
concluding a docs section did not render.

## Step 10 — Gate B, then commit

Full-scope re-check against `prd.md`'s acceptance list, every box ticked with the command or
screenshot that ticked it. Then stage **only** this task's files:

```
packages/tuffex/packages/components/src/flat-radio/{src/types.ts,src/TxFlatRadio.vue,src/TxFlatRadioItem.vue,__tests__/flat-radio.test.ts}
apps/core-app/src/renderer/src/components/tuff/TuffBlockFlatRadio.vue
apps/nexus/app/components/docs/DocsComponentsGallery.vue
apps/nexus/app/components/content/demos/FlatRadioSizesDemo.vue
apps/nexus/content/docs/dev/components/{flat-radio,fine-tune-card}.{zh,en}.mdc
.trellis/tasks/09-11-flat-radio-xl-and-motion/
```

`commit.gpgsign` is on and pinentry fails in this environment — commit with `--no-gpg-sign`.
Then `git grep MUTATION HEAD`.

**Rollback point 2:** the commit is one revert away; nothing here migrates data, changes an
API shape, or gates behind a flag.

---

## Validation summary

| Gate | Command | Blocks |
| --- | --- | --- |
| tuffex tests | `vitest run` (real entry, `packages/tuffex`) | Step 5 |
| tuffex lint | `eslint src/flat-radio` (real entry) | Step 5 |
| tuffex types | `vue-tsc --noEmit -p tsconfig.json` | Step 5 |
| docs parity | `check-doc-translation-parity.mjs` | Step 10 |
| mdc fences | `check-mdc-fences.mjs` | Step 10 |
| demo registry | `check-demo-registry-orphans.mjs` | Step 10 |
| core-app types | `npm run typecheck` (server down) | Step 10 |
| nexus types | `nuxt typecheck`, grep `error TS` (server down) | Step 10 |
| rendered page | CDP screenshot of the gallery cell | Step 10 |
