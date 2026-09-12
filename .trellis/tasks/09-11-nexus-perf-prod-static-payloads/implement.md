# Implement — static docs JSON, Sentry off hydration, icon CSS split, chunk/style inlining, Early Hints

Work in `apps/nexus/`; one commit per requirement, in this order.

## R1 — static docs JSON
- [x] `server/utils/docsPageResolver.ts`: move `resolveDocsPage` + helpers out of
      `server/api/docs/page.get.ts`; keep the query handler thin. Keep the strings the perf test
      pins (`parseFrontmatterMetadata`, `readDevDocsPageFromFile`, …) — update the test's file
      handle to the new module.
- [x] `server/api/docs/page/[locale]/[mode]/[...path].get.ts` + `test/api/docs/page-static.get.test.ts`.
- [x] `shared/utils/docs-path.ts`: `toStaticDocsPageJsonPath(path, locale, mode)`; unit test.
- [x] `build/docs-prerender-routes.ts`: real `createDocsPageApiPrerenderRoutes`; update
      `docs-prerender-routes.test.ts` (the `[]` pins).
- [x] `build/nexus-static-routes.mjs`: `/api/docs/page/**` in `docsStaticJsonHeaderRoutes`.
- [x] `app/utils/docs-page-client-cache.ts`: static-first `requestDocsPage` with one fallback;
      tests for URL shape + fallback.
- [x] `scripts/collect-deployed-preview-evidence.mjs` probe list: add the static JSON probe.
- [x] Run: `vitest run test/api/docs build/docs-prerender-routes.test.ts app/utils/docs-page-client-cache.test.ts app/pages/docs/docs-page-performance.test.ts`, `check:api-routes`.

## R2 — Sentry after mount
- [x] `app/utils/sentry-deferred.ts` (+ test): error buffer, `installErrorBuffer(window)`,
      `flushInto(capture)`.
- [x] `sentry.client.config.ts`: export `sentryClientOptions` / `initSentryClient()`, no top-level init.
- [x] `app/plugins/sentry-deferred.client.ts`: buffer now, init on `app:mounted` + idle, attach
      Vue integration + error hooks, flush.
- [x] `nuxt.config.ts` `app:resolve`: drop the module's two client plugins (guarded by `disableSentry`).
- [x] `demo-client-boundary.test.ts` Sentry assertions still hold; add one for the removal hook.

## R3 — icons out of entry CSS
- [ ] `nuxt.config.ts`: `unocss.autoImport: false`; plugin template importing the non-icon layers  ← not needed: importing `uno:icons.css` from a client plugin drops the layer from `uno.css` (UnoCSS per-layer virtual entries); no template change.
      (list derived from the resolved Uno config at build time); `app/plugins/unocss-icons.client.ts`
      importing `uno:icons.css` after mount.
- [x] `uno.config.ts`: sizing preflight for `[class^="i-"], [class*=" i-"]` so boxes keep their
      size before the icons sheet lands.
- [x] `check-worker-bundle.mjs`: entry css must contain no `data:image/svg`; icon budgets move to
      the icons sheet; `check-worker-bundle.test.ts` updated.
- [x] Dev smoke: `/en/docs/dev/components/button` icons render after mount, no layout jump.

## R4 — chunks + inline styles
- [x] `nuxt.config.ts`: `vite.build.rollupOptions.output.experimentalMinChunkSize`;
      `unocss.disableNuxtInlineStyle: false`; `features.inlineStyles` predicate with the large-SFC
      exclusion list (constant in `build/nexus-static-routes.mjs` next to the other budgets).
- [ ] Guard: `htmlInitialAssetBudgets` docs family `maxCssCount` ≤ 15 after the change; verify  ← style inlining reverted (duplicated tuffex sheets, +10 KB gzip per page); only the chunk floor was kept, so the css budgets stay as they were.
      HTML size stays under `maxDocsDetailHtmlBytes`.

## R5 — Early Hints
- [x] `build/write-early-hints.mjs` (+ test with fixture HTML/_headers); wire into
      `package.json` `build` after the alias step.
- [x] `check-worker-bundle.mjs`: `checkEarlyHints()` — every `Link` target exists.

## Verification (full-scope)
- [x] `pnpm run test`, `typecheck`, per-file eslint, `git diff --check`.
- [x] Isolated worktree production build (see memory `nexus-isolated-prod-build-worktree`),
      `check:api-routes`, `build:analyze-worker` diffed against HEAD's findings.
- [x] `wrangler pages dev` + real browser at 500 ms/hop over the h2 proxy: SPA navigation waterfall
      (zero `/api/docs/page`), first request after DCL (not Sentry), docs preload/stylesheet
      counts, `Link` header present on `/en/docs/dev/components/button`.
- [x] Record before/after in `research/results.md`.
