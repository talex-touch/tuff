# TuffEx Docs Sync

> A change under `packages/tuffex/packages/components/src/` is not finished when the tests pass. Every component has a Nexus docs page that **displays** it, the pages are hand-written prose, nothing regenerates them, and no gate reads them. These rules bind any prop/event/slot/DOM/class/ARIA/visual change to the docs that describe it.

---

## The failure this prevents

A prop is added, the component's own docs page is updated, and the docs of every **wrapper** component that forwards that prop keep describing the old behaviour. Nothing goes red. `check:doc-parity` counts zh/en sections, `check:demo-registry` checks wiring — neither notices that a paragraph now lies.

Landed instance: `loading` was added to `TxSwitch` (2026-08-30) and `TxBlockSwitch` was rewired to it. `switch.{zh,en}.mdc` was updated in full; `group-block.{zh,en}.mdc` got two table rows, and its `## 交互契约` bullets still described a spinner that no longer rendered and a row-dimming that no longer happened.

---

## Blast radius — resolve before writing any docs

```bash
COMP=switch   # directory name under packages/tuffex/packages/components/src/

# 1. The component's own pages (zh and en are separate files)
ls apps/nexus/content/docs/dev/components/$COMP.{zh,en}.mdc

# 2. Wrappers — every tuffex component that renders it. Search by import path,
#    not tag name: tags get re-aliased. THIS is the step that gets skipped.
rg -l "\.\./\.\./$COMP'" packages/tuffex/packages/components/src --glob '*.vue'

# 3. Any docs page that names the component
rg -l "TuffSwitch|TxSwitch" apps/nexus/content/docs --glob '*.mdc'
```

Every wrapper from (2) owns its own `.zh.mdc` / `.en.mdc` and must be checked. `TxBlockSwitch` wrapping `TuffSwitch` is the canonical case. Hits from (3) are usually filler inside another component's demo — confirm they make no behavioural claim, then leave them.

---

## What goes stale

| Section (zh / en) | Goes stale when |
| --- | --- |
| `## Demo` / `### <变体>` | The change is user-visible. It needs its own demo section, not just a table row |
| `### Props` / `Events` / `Slots` | A prop/event/slot is added, removed, renamed, or a default changes |
| `## 交互契约` / Interaction Contract | DOM, ARIA, class names, focus/keyboard behaviour, or blocking rules change |
| `## 最佳实践` / Best Practices | There is now a right and a wrong way to drive the new state |
| `## 审阅说明` → `实测覆盖` / Review Notes → Verified coverage | Tests were added or their assertions changed |
| CSS-variable table | A `--tx-*` or component-local variable starts or stops being read |

zh and en stay section-for-section identical in count and order. `check:doc-parity` enforces the count only; matching prose is on the author.

Record rejected designs in `## 审阅说明` / Review Notes. "Keeping the checkbox fill and drawing a white ring on it was tried first and is invisible on a light page" is what stops the next person re-trying it.

---

## Placement: place it, do not append it

Appending to the end of a section, table, or bullet list is the default and is almost always wrong. These lists are ordered by meaning and readers skim the first two items. Read the whole list, then decide where the item belongs.

- **Demo sections** — group by kind. A new state (`loading`) sits beside the other states (`disabled`), not after the composition/slot examples.
- **Props table** — mirror `defineProps` order and keep siblings adjacent: `loading` directly after `disabled`, never at the bottom under `ariaLabel`.
- **Best Practices** — put the new rule next to the rule it qualifies or contradicts. A `loading` rule belongs beside the `disabled` rule, or right after the bullet claiming the control is "immediate", because that is the claim it amends. Layout and styling tips stay last.
- **Review Notes** — the shape is: what was reviewed → contracts → a11y notes → motion/degradation → **coverage last**. New contract notes go in the middle, never between the coverage line and the notes grouped with it.
- **Interaction Contract** — follow the control flow the component actually runs, so a blocking rule sits with the other blocking rules.

Adjacency is the point: two rules about one concept must read together. An item with no natural neighbour means the section needs a new grouping, not a longer tail.

If every line you added landed at the bottom of its list, you never considered placement.

---

## Demos

A table row is not a display. A user-visible change ships:

1. `apps/nexus/app/components/content/demos/<Comp><Variant>Demo.vue` — follow the neighbours: `useI18n()` plus a `labels` / `copy` computed with `zh` and `en` branches, `<style scoped>` last. Clear timers and listeners in `onBeforeUnmount`; these demos live on a long-lived docs page.
2. One alphabetical line in `apps/nexus/app/components/content/demo-registry.ts`.
3. A `:::TuffDemoWrapper{demo="<Name>Demo" code-lang="vue"}` block in **both** `.zh.mdc` and `.en.mdc`.

The `code:` block inside the mdc is an idealized snippet, not the literal demo source — existing demos carry i18n scaffolding the snippet omits. Keep it readable, keep it truthful about props and behaviour.

---

## Gates and their traps

```bash
# apps/nexus — these can actually fail
node build/check-demo-registry-orphans.mjs
node build/check-mdc-fences.mjs
node build/check-doc-translation-parity.mjs
```

- `.bin` shims in this checkout are stale. Call the real entries and resolve the versioned directory with `ls -d`, never hardcoded:
  `node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs`, `.../eslint/bin/eslint.js`, `.../vue-tsc/bin/vue-tsc.js`.
- `apps/nexus` resolves `@talex-touch/tuffex/<sub>` through `packages/tuffex/dist/`. A source-only change is invisible to the docs dev server and to `nuxt typecheck` until `node ./node_modules/gulp/bin/gulp.js -f packages/script/build/index.ts` runs in `packages/tuffex`. If that fails with `Cannot find module '.../corepack/v1/pnpm/<v>/bin/pnpm.cjs'`, the corepack cache is marker-only; `corepack install` no-ops on it, so `rm -rf` that one version directory first.
- `nuxt typecheck` exits 0 with errors on stdout, and `build/check-typecheck-plugin-resolution.mjs` exits 0 even when `nuxt` is not on PATH. Run it directly and grep the output for `error TS` yourself.
- **Three typecheck wrappers kill the running nexus dev server** (observed 2026-09-02, three parallel agents, ~40 minutes of outage). `pnpm typecheck` in `apps/nexus` lets pnpm 10 verify-deps run `pnpm install` (node-gyp rebuild of tuff-native) under the live process; `nuxt typecheck` itself runs `nuxt prepare`, which regenerates `.nuxt/` and leaves the server serving 503 "`.nuxt/dist` directory has been removed. Restarting Nuxt…" until it is killed and restarted (it does not self-heal; `.nuxt/content/database.compressed.mjs` is gone); core-app `npm run typecheck` → `typecheck:web` rebuilds `packages/tuffex/dist` first, and nexus dev resolves tuffex through that dist, so every page 503s for the ~20 s of the build. While the server is up run only direct entries — `tsc -p tsconfig.node.json`, `vue-tsc -p tsconfig.web.json`, the vitest entry, `node build/check-*.mjs`. Batch the real typecheck scripts into one pass with the server stopped, then restart it (`pnpm -C apps/nexus dev:pure`, listening after ~10 s). With several agents sharing one checkout, one owner restarts the server and one `mkdir` lock guards the tuffex build; the build inside `typecheck:web` bypasses any such lock.

---

## Verify the rendered page

Docs are a display; confirm the page shows the change rather than assuming the file edit was enough.

- Fetch the page and assert the new section title appears in the stripped text.
- **The docs dev server lags on `.mdc` edits.** A page can serve the previous parse for a minute or more; every probe returns `false` with no error page, which reads exactly like "my section never rendered". Re-poll before concluding anything.
- For a pure visual change, SSR-render the real component against the built CSS and screenshot it headless (`renderToString` from `packages/tuffex` so bare `vue` resolves, plus `dist/es/<comp>/style.css` and compiled `packages/components/style/variables.scss`). Pause animations in the harness (`animation-play-state: paused` with a negative `animation-delay`) so the still frame is readable.
- **Re-render the SSR body after every rebuild.** Scoped styles are keyed by a `data-v-<hash>` that changes with the SFC. Reusing HTML from the previous build leaves only unscoped rules matching and the component renders as giant unstyled boxes, which looks like a layout regression you caused. Assert the body hash and CSS hash match before believing the screenshot.
