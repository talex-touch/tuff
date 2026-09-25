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
| `## 用法` / `## Usage` (`### <变体>` / `### <variant>`) | The change is user-visible. It needs its own demo section, not just a table row |
| `## API 参考` / `## API Reference` → `### 属性` / `### Props` / `Events` / `Slots` | A prop/event/slot is added, removed, renamed, or a default changes |
| `## 概述` / `## Overview` (was 交互契约 / Interaction Contract) | DOM, ARIA, class names, focus/keyboard behaviour, or blocking rules change |
| `### 最佳实践` / `### Best Practices` (inside Usage) | There is now a right and a wrong way to drive the new state |
| `## 技术实现` / `## Technologies` (holds the old Review Notes → Verified coverage lines) | Tests were added or their assertions changed |
| CSS-variable table (inside `## API 参考` / `## API Reference`) | A `--tx-*` or component-local variable starts or stops being read |

The canonical page shape — section order, which section owns what, and the sidebar grouping above it — is [Nexus Docs Structure](./nexus-docs-structure.md).

zh and en stay section-for-section identical in count and order. `check:doc-parity` enforces the count only; matching prose is on the author.

Record rejected designs in `## 技术实现` / Technologies (the section that replaced Review Notes). "Keeping the checkbox fill and drawing a white ring on it was tried first and is invisible on a light page" is what stops the next person re-trying it.

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

- **`TuffDemoWrapper` does not isolate a demo from the article's prose styles.** `github-markdown.css` and the `.docs-prose` rules in `pages/docs/[...slug].vue` style every bare `p`, `ul`, `li`, `h3`, `a`, `table` and `[type=button]` that is not inside `.not-prose`. A demo that renders its own bare elements marks its root `not-prose`; otherwise it picks up prose margins and sizes in the column and loses them the moment it is teleported, so the layout jumps.
- **The docs page's code scripts skip `.not-prose` too** (since 2026-09-24). Inline-code click-to-copy (`getInlineCodeElement`), `enhanceInlineCode`, `enhanceCodeBlocks` in `pages/docs/[...slug].vue` and `plugins/highlight.client.ts` all exclude that subtree. Before, clicking inline code inside a live demo wrote it to the reader's clipboard and toasted, and a demo mounted before the enhancers ran got `role=button` on its inline code, a `.docs-code-header` inside its `pre` and highlight.js markup. A new enhancer on that page must keep the exclusion.
- **`public/geo/world-countries.geo.json` must keep d3-geo winding** (clockwise exterior rings). One counter-clockwise ring turns that feature into "the sphere minus the island", and `TxBubbleMap` / `TxChoroplethMap` paint the whole map in land colour, with no coastlines. Bermuda did this until 2026-09-25. Check with `d3.geoArea(feature) > 2 * Math.PI` after editing the file.
- **The wrapper mounts a demo 240px before it scrolls in** (`DEMO_LAZY_ROOT_MARGIN`). Scripted playback started in `onMounted` is often half over when the reader arrives; start it on visibility (`TemplateFrame`'s `@enter`, or an IntersectionObserver of your own).
- **In a production build `@talex-touch/tuffex/utils` and the auto-registered components are two module instances.** `modules/tuffex-components.ts` registers components from tuffex **source** when not in dev, while `/utils` and every `@talex-touch/tuffex/<dir>` import resolve to dist (`nuxt.config.ts`). Anything with module state splits: `toast()` pushes to the dist queue and the auto-registered `<TxToastHost>` renders its own, so demo toasts never appear on the deployed site (seen in the 2026-09-21 bundle for `ToastToastDemo` and `ComponentsFeedbackTaskCenterDemo`); `reserveOverlayLayer()` raises the dist z-index allocator, which source-built overlays never read. Dev resolves both to dist, so a dev-server screenshot cannot show this. In demos use controlled components (`TxToastPanel`) and do not coordinate layers through `/utils`.
- Page-level compositions belong in the Templates tab, not in a component page: see [Nexus Docs Templates](./nexus-docs-templates.md).

---

## Gallery specimens

`apps/nexus/app/components/docs/DocsComponentsGallery.vue` renders one live cell per component on each suite overview page. What the cells rely on:

- **Every stage's `<ClientOnly>` is `DocsGallerySpecimen.vue`**, bound to that name by a local import at the top of the gallery's `<script setup>`. It renders Nuxt's `ClientOnly`, keys the slot on a counter, and adds the hover/focus reset button (`.docs-gallery__replay`, label `docs.demo.reset`) that bumps it. A new cell written with a plain `<ClientOnly>` directly inside `.docs-gallery__stage` gets the button; importing Nuxt's `ClientOnly` into the gallery would silently take it off every cell.
- **Reset remounts the slot and nothing else.** CSS animations and `appear` transitions on the remounted nodes replay. The gallery's own refs (`switchOn`, an open flag) and any timer started in the gallery's `onMounted` survive. A specimen driven by state — a loop, an auto-advance, a scripted scroll — lives in its own component under `docs/gallery/` and starts that in its own `onMounted`, so a reset restarts it. `useGalleryLoop(step, intervalMs, firstDelayMs)` in `gallery/use-gallery-loop.ts` does this and skips readers who ask for reduced motion.
- **Text behind `aria-live` does not loop.** `TxTextTransformer` announces every change; its cell advances once on mount and then waits for the Next button.
- **Teleported content cannot read `--docs-*`.** Those tokens live on `.docs-root`; a TxModal or TxFlipOverlay body renders under `<body>`, where `var(--docs-muted)` is invalid and the property falls back to inheritance. Use `--tx-*` inside anything that teleports.
- **The docs article is a containing block for `position: fixed`.** `.docs-prose` carries `content-visibility: auto` (`pages/docs/[...slug].vue`), which implies layout containment. A fixed overlay rendered in place is laid out against the whole article instead of the viewport — TxFlipOverlay's card centred on the article and focusing it scrolled the page 870px, until it teleported (2026-09-23). An overlay shown in docs has to teleport.
- **Icon classes named inside tuffex are invisible to Nexus in dev.** Nexus resolves tuffex from `dist/*.js`, which its UnoCSS pipeline does not scan, and installs only `carbon`, `cib`, `logos` and `twemoji` — `ri` is kept out on purpose (`build/check-worker-bundle.test.ts`, `build/check-icon-collections.mjs`). A component that draws icons by class exports them from a plain `.ts` module, and `apps/nexus/uno.config.ts` spreads that into `safelist` with the module listed in `configDeps`: `markdown-editor/src/toolbar-icons.ts` → `MARKDOWN_EDITOR_ICON_CLASSES` is the worked case. A class Uno cannot generate renders as a `currentColor` square — the preflight sizes every `i-*` box and TxIcon fills it, waiting for a mask that never arrives.
- **A test that measures one token's CSS passes `safelist: false`.** `uno.generate(token)` appends every safelisted rule by default, so a length check reads non-zero as soon as the config has a safelist.

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
- **A build is not always enough: a running docs dev server keeps what it loaded.** Two cases were confirmed on 2026-09-24 by comparing scope ids.
  - After a rebuild, :3200 kept serving the old `TxTextTransformer` module: the rendered layers carried `data-v-356252ac` while `dist/es/text-transformer/style.css` had moved to `data-v-c33c0db7`. The fade-in fix never ran, and the new sheet matched nothing.
  - `tuffexOnDemandStylePlugin` reads `dist/es/style-deps.json` once, in `buildStart`. A component that is new since the server started (`TxModeChip`) gets its own `style.css` injected but none of its dependencies' sheets (`text-transformer`, `text-morph`, `liquid`). The symptom is a crossfade whose two layers sit side by side at full opacity.

  After a rebuild that adds a component, or changes a component other components depend on, restart the server (see "Restarting :3200" below) before judging the page. To check whether the page is running current code, compare the element's `data-v-*` with the one in that component's `dist/es/<dir>/style.css`.
- `nuxt typecheck` exits 0 with errors on stdout, and `build/check-typecheck-plugin-resolution.mjs` exits 0 even when `nuxt` is not on PATH. Run it directly and grep the output for `error TS` yourself.
- **Three typecheck wrappers kill the running nexus dev server** (observed 2026-09-02, three parallel agents, ~40 minutes of outage). `pnpm typecheck` in `apps/nexus` lets pnpm 10 verify-deps run `pnpm install` (node-gyp rebuild of tuff-native) under the live process; `nuxt typecheck` itself runs `nuxt prepare`, which regenerates `.nuxt/` and leaves the server serving 503 "`.nuxt/dist` directory has been removed. Restarting Nuxt…" until it is killed and restarted (it does not self-heal; `.nuxt/content/database.compressed.mjs` is gone); core-app `npm run typecheck` → `typecheck:web` rebuilds `packages/tuffex/dist` first, and nexus dev resolves tuffex through that dist, so every page 503s for the ~20 s of the build. While the server is up run only direct entries — `tsc -p tsconfig.node.json`, `vue-tsc -p tsconfig.web.json`, the vitest entry, `node build/check-*.mjs`. Batch the real typecheck scripts into one pass with the server stopped, then restart it (`pnpm -C apps/nexus dev:pure`, listening after ~10 s). With several agents sharing one checkout, one owner restarts the server and one `mkdir` lock guards the tuffex build; the build inside `typecheck:web` bypasses any such lock.
- **The tuffex dist build runs `pnpm install` unless told not to** (observed 2026-09-23). The gulp script shells out to `pnpm run build`, and pnpm 11's verify-deps turns that into an install: node-gyp rebuild of tuff-native, root postinstall, and `nuxt prepare` in `apps/nexus`. If the prepare lands while `dist/` is cleaned, the dev server re-reads `nuxt.config.ts`, throws `[nexus] tuffex dist is missing`, and keeps serving that 500 after the build finishes. Build with verify-deps off — install skipped, 22 s instead of 40 s:
  ```bash
  npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false \
    node ./node_modules/gulp/bin/gulp.js -f packages/script/build/index.ts
  ```
  If a server is already stuck on that 500, `touch apps/nexus/nuxt.config.ts` once `dist/es/index.js` exists makes it reload the config; no restart needed.
- **Any `pnpm install` under a live `nuxt dev` can kill it** — even `--offline --filter @talex-touch/tuff-nexus --ignore-scripts`, which only relinked one package (2026-09-23, :3200 exited). Restart it detached so it does not die with your session: `cd apps/nexus && NUXT_USE_CLOUDFLARE_DEV=true CLOUDFLARE_DEV_ENVIRONMENT=preview nohup node node_modules/nuxt/bin/nuxt.mjs dev --port 3200 > /tmp/nexus-dev-3200.log 2>&1 &` (what `pnpm dev` runs, minus pnpm's own verify-deps). The first page after a lockfile change can 504 "Outdated Optimize Dep"; reload once.
- **Restarting :3200: the port outlives the parent.** Killing the `nuxt dev` process leaves its CLI worker holding the port for ~3 minutes (2026-09-24). A server started in that window does not fail — it binds the next free port (`[::1]:3001`) and :3200 stays dark while everything looks healthy. Stop the workers too, wait until `lsof -nP -iTCP:3200 -sTCP:LISTEN` is empty, start, then confirm the listener's PID is the new process. Add `NUXT_IGNORE_LOCK=1` when another instance of the app (a verification server on :3000) is already running. With several sessions on one checkout, announce a restart and let one session own it; three sessions restarting in turn is how :3200 went dark for five minutes.
- A nexus typecheck that leaves `.nuxt/` alone: `node <vue-tsc.js> --noEmit -p .nuxt/tsconfig.app.json` from `apps/nexus` (~15 s). Twelve errors in `nuxt.config.ts` and `server/utils/cloudflare.ts` predate 2026-09-24; filter for the files you touched.
- **`check:icon-collections` checks the collection, not the name.** `i-carbon-clipboard` passes it and renders nothing — carbon has no such icon. Check names against the installed set:
  ```bash
  cd apps/nexus && node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(require.resolve('@iconify-json/carbon/icons.json'),'utf8'));let bad=0;for(const f of process.argv.slice(1))for(const m of fs.readFileSync(f,'utf8').matchAll(/i-carbon-([a-z0-9-]+)/g))if(!d.icons[m[1]]&&!(d.aliases||{})[m[1]]){bad++;console.log(f+': '+m[0])}process.exit(bad?1:0)" <files>
  ```
- **No gate parses frontmatter.** An unquoted `: ` inside a value (`description: A launcher: search and preview`) makes the whole block invalid YAML; the page renders, but `category` is `null` and it drops into the sidebar's misc bucket in every suite (2026-09-24: four en template pages). The fence, parity and taxonomy checks all pass. After adding pages, ask the sidebar API for rows without a category: `curl -s localhost:3200/api/docs/sidebar-components/en` and filter `!item.category` (evict `.nuxt/cache/nitro/functions/docs-sidebar-components/` first — it caches for 5 minutes).

---

## Verify the rendered page

Docs are a display; confirm the page shows the change rather than assuming the file edit was enough.

- Fetch the page and assert the new section title appears in the stripped text.
- **The docs dev server lags on `.mdc` edits.** A page can serve the previous parse for a minute or more; every probe returns `false` with no error page, which reads exactly like "my section never rendered". Re-poll before concluding anything.
- For a pure visual change, SSR-render the real component against the built CSS and screenshot it headless (`renderToString` from `packages/tuffex` so bare `vue` resolves, plus `dist/es/<comp>/style.css` and compiled `packages/components/style/variables.scss`). Pause animations in the harness (`animation-play-state: paused` with a negative `animation-delay`) so the still frame is readable.
- **Re-render the SSR body after every rebuild.** Scoped styles are keyed by a `data-v-<hash>` that changes with the SFC. Reusing HTML from the previous build leaves only unscoped rules matching and the component renders as giant unstyled boxes, which looks like a layout regression you caused. Assert the body hash and CSS hash match before believing the screenshot.
