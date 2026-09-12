# Design — static docs JSON, Sentry off hydration, icon CSS split, chunk/style inlining, Early Hints

## R1 — Static docs JSON

**Route shape.** `/api/docs/page/<locale>/<mode>/<docs path>.json`, e.g.
`/api/docs/page/en/body/dev/components/button.json` and `/api/docs/page/en/meta/dev/components/button.json`.
Path-shaped, so nitro prerenders it to a file (`isImplicitHTML` is false for JSON, the file lands
at exactly that path) and `_routes.json` excludes it from the Worker like the other prerendered
docs JSON. The `.json` suffix keeps Pages' MIME guess right even without the `_headers` rule.

**Handler.** `server/api/docs/page/[locale]/[mode]/[...path].get.ts` re-uses the resolver in
`page.get.ts`: extract `resolveDocsPage` (and its helpers) into `server/utils/docsPageResolver.ts`;
`page.get.ts` becomes the query-string front, the new file the path-shaped front. Both call the
same cached resolver, so the `defineCachedFunction` key space is shared and the existing
`page.get.test.ts` keeps passing against the query handler. A new test exercises the path handler:
param parsing (`.json` stripped, `mode` ∈ `meta|body`, locale validation) and delegation.

**Prerender list.** `createDocsPageApiPrerenderRoutes(nexusRoot)` returns, for every docs content
file × locale, both `meta` and `body` routes (≈ 552 docs × 2 locales × 2 modes = 2 200 routes,
bodies total 4.9 MB, median 8 KB). The test that pinned it to `[]` changes to assert the new shape.
`docsStaticJsonHeaderRoutes` gains `/api/docs/page/**` so `_headers` covers it, and
`check-worker-bundle` keeps requiring the Worker chunk for the query handler (dev/fallback).

**Client.** `requestDocsPage()` in `docs-page-client-cache.ts` builds the static URL first
(`resolveStaticDocsPageUrl(path, locale, body)`), fetches it with `requestJson`, and on a
non-2xx/network failure falls back to the query API once. The in-memory request cache and the
pending-map dedupe are keyed the same as today, so nothing above it changes. Dev: nitro serves the
path route dynamically (same resolver), so the static URL works in dev too — no environment branch.

**Evidence budgets.** `collect-deployed-preview-evidence.mjs`' `docs-tabs` budget counts
`/api/docs/` requests (`maxDocs: 1`); the static JSON path still starts with `/api/docs/` so the
count is unchanged for the first page. `check-runtime-evidence` `docsApiRequestCount !== 6` is a
PWA-route count — verify after the build which of the six moved, and update the constant with the
measured number rather than guessing.

## R2 — Sentry after mount

`@sentry/nuxt` generates `sentry-client-config` (`order: 0`, `await import(config)`) and
`sentry-client-integrations` (`order: 1`, `dependsOn: ['sentry-client-config']`); both run in the
plugin phase, before hydration. The module has no option to defer them.

**Change.** Keep the module (source maps, server side, error-handler wiring) but replace the two
client plugins with our own `app/plugins/sentry-deferred.client.ts`:
- `nuxt.hook('app:resolve')` in `nuxt.config.ts` (the hook already exists for sidebase) drops the
  two module-generated client plugins by `src` (`sentry-client-config.mjs`,
  `runtime/plugins/sentry.client`), the same way `removeSidebaseAuthAppRuntime` does.
- The deferred plugin installs `window.onerror` / `unhandledrejection` buffers immediately
  (cheap, no SDK), and on `app:mounted` schedules `requestIdleCallback` (2 s timeout fallback)
  to `import('@sentry/nuxt')` + `Sentry.init(...)` with the same DSN/options as
  `sentry.client.config.ts`, then flushes the buffer via `captureException`, then attaches the
  Vue integration (`vueIntegration({ app })`) and the `vue:error`/`app:error` hooks the module
  plugin used to attach.
- `sentry.client.config.ts` is kept as the single source of the init options (exported), so the
  module's `findDefaultSdkInitFile` still finds it (it decides whether the module wires the client
  side at all) — but its side-effect `Sentry.init` moves behind an exported `initSentryClient()`;
  the file's top level no longer calls init. Verify the module does not choke on a config file
  with no top-level init (it only `await import`s it).

The pure buffering logic lives in `app/utils/sentry-deferred.ts` with unit tests (buffer before
init, flush order, cap at 20 entries, no double-install).

## R3 — Icons out of the entry CSS

UnoCSS emits the `icons` layer (`layer: 'icons'`, `layers: { icons: -30 }`) into the single
`uno.css` virtual entry, which `@unocss/nuxt` imports from its plugin → bundled into `entry.css`.
`@unocss/vite` resolves `uno:<layer>.css` to one layer (`VIRTUAL_ENTRY_ALIAS`), and `uno.css`
minus that layer is expressible as the remaining layers? Not directly: `uno.css` always means all
layers. Approach:
- `unocss.mode` stays `global`; set `autoImport: false` in `nuxt.config.ts` and add our own
  plugin template `app/plugins/unocss-entry.ts` importing `uno:default.css`, `uno:preflights.css`,
  `uno:shortcuts.css` … — fragile (layer list grows with presets).
- Preferred: keep `autoImport: true` (all layers in `entry.css`) but move icons out of UnoCSS
  altogether for the docs-critical path is a rewrite. Rejected.
- Chosen: keep UnoCSS as is, but split by **collection**: `presetIcons` gets `collections` for
  `carbon`+`cib` only in the base config; `logos` moves to a second Uno layer via a custom rule
  set? UnoCSS presetIcons cannot scope a collection to a layer.

Given the above, the mechanically sound split is: import `uno.css` **without** the icons layer
by listing the non-icon layers in the plugin template (`uno:preflights.css`, `uno:shortcuts.css`,
`uno:default.css`, plus preset layers that exist in this config, discovered from
`createGenerator(unoConfig)` at config time so the list cannot drift), and import `uno:icons.css`
from a tiny client-only async path: a `<link rel="stylesheet" media="print" onload="this.media='all'">`
is not expressible for a bundled asset, so instead the icons stylesheet is imported by a plugin
that runs after mount (`app:mounted` → `import('uno:icons.css')`), which makes Vite emit it as a
separate CSS asset loaded after hydration. SSR pages render icon spans as empty boxes until then
(they have `width/height` from the `i-*` rule — which is *in* the icons layer, so the box would
collapse). To avoid layout shift, `presetIcons({ extraProperties: { display: 'inline-block', width: '1.2em', height: '1.2em' } })`
box rules are duplicated into a tiny preflight in the default layer (`.\[class*='i-'\]` sizing).
Landing `i-logos-*`: with icons loading after mount there is no per-page split; `logos` stays in
the icons stylesheet (it is one file, cached across pages, off the critical path). The
requirement "docs HTML contains no `i-logos-*` rule" is met because docs HTML no longer contains
any icon rule.

Guard: `checkSharedEntryCssBudget` gains "no `data:image/svg` in entry css"; the existing
aliased-icon budgets move to the icons stylesheet.

## R4 — Chunks and small styles

- `vite.build.rollupOptions.output.experimentalMinChunkSize: 4096` (Rollup 4.62 supports it):
  chunks < 4 KB raw are merged into an importer when it does not increase work for any entry.
- `features.inlineStyles: (id) => small(id)` cannot be size-aware at config time. Use
  `unocss.disableNuxtInlineStyle: false` to re-enable Nuxt's default (`.vue` styles inlined) and
  pass `features.inlineStyles: (id) => !!id && id.includes('.vue') && !LARGE_SFC_RE.test(id)` where
  `LARGE_SFC_RE` lists the few SFCs whose styles are ≥ 3 KB gz on the docs page (`layouts/docs.vue`,
  `pages/docs/[...slug].vue`, `TxBaseAnchor.vue`, `DocApiTable.vue`) so they stay linked and
  cacheable. Nuxt then inlines the rest (~17 sheets, ≤ 1.4 KB gz each) into the HTML and drops
  their `<link>`s. HTML grows by ~10 KB gz per docs page; 577 pages × 10 KB is fine for Pages.

## R5 — Early Hints

`build/write-early-hints.mjs` (run after `materialize-docs-index-aliases.mjs`): for each route
family (`/`, `/en/docs/*`, `/zh/docs/*`, `/pricing`, `/store`, …) read one representative HTML,
extract the entry `<script type=module src>`, the stylesheet `<link>`s that are shared across the
family (entry css + layout css; determined as the intersection of two sample pages), and append a
block to `dist/_headers`:

```
/en/docs/*
  Link: </_nuxt/<entry>.js>; rel=modulepreload, </_nuxt/entry.<hash>.css>; rel=preload; as=style, </_nuxt/docs.<hash>.css>; rel=preload; as=style
```

Cloudflare Pages turns `Link` headers with `rel=preload`/`preconnect` into 103 Early Hints
(documented behaviour; the docs page fetch failed twice from this machine, so the exact supported
`rel` set is verified against the deployed preview later — `modulepreload` may be passed through
as a normal header only). The guard checks every `Link` target exists in `dist/_nuxt/`.

## Compatibility / rollback

Each requirement is one commit. R1's client fallback means a deploy where the JSON is missing
degrades to today's behaviour. R2 is the only one with a behavioural window (errors before idle
are buffered, not lost). R3 changes paint order for icons only. R4/R5 are build-output only.
