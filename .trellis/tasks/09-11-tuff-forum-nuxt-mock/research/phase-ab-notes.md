# Phase A + B notes — tuff-forum scaffold and Tuffex wiring

Recorded 2026-09-11 by the implement agent. Everything below was observed in this session; commands are reproducible from `/Users/tagzixian/Workspace/Projects/tuff-forum`.

## Outcome

- Phase A (scaffold) and Phase B (Tuffex integration) complete. `pnpm typecheck` = 0 errors, `pnpm lint` = 0 problems, dev server serves `/` with the probe page rendered by headless Chrome and **zero** `[Vue warn]` / `Uncaught` / `Failed to resolve component` lines on cold and warm Vite caches.
- Registration variant that worked: **bare package subpath** (`filePath: '@talex-touch/tuffex/<dir>'`), design §3.2 primary path. The absolute-path fallback was not needed.
- 213 components registered from 148 barrels (aliases `TuffInput`/`TxInput` etc. counted separately); 42 icon classes safelisted (39 carbon/ri + 3 simple-icons).
- Nothing committed anywhere (per dispatch). The dev server and headless Chrome were killed at the end; port 3456 is free.

## Deviations from design.md / the dispatch (and why)

1. **pnpm settings live in `pnpm-workspace.yaml`, not `package.json`/`.npmrc`.**
   pnpm 11.24.0 prints `The "pnpm" field in package.json is no longer read by pnpm. The following keys were ignored: "pnpm.peerDependencyRules"` and ignored `.npmrc` `auto-install-peers=false` too — the first install produced `settings.autoInstallPeers: true` in the lockfile and pulled `electron@41.10.7` (metadata only, 1.1 MB; no binary because `onlyBuiltDependencies` blocked its postinstall). Moving `autoInstallPeers: false`, `strictPeerDependencies: false`, `peerDependencyRules.ignoreMissing: [electron]` into `pnpm-workspace.yaml` (no `packages:` key, so it is *not* a workspace) fixed it: lockfile now says `autoInstallPeers: false`, `grep -c '^  electron@' pnpm-lock.yaml` = 0, `@talex-touch/utils` resolves as `@talex-touch+utils@2.1.0_vue@3.5.42_typescript@5.9.3_`. `.npmrc` keeps the two legacy keys as documentation for older pnpm.
2. **`allowBuilds` in `pnpm-workspace.yaml`.** pnpm 11 hard-fails (`ERR_PNPM_IGNORED_BUILDS`) rather than warning about un-approved build scripts; the three it reported (`esbuild`, `unrs-resolver`, `vue-demi`) are allow-listed. pnpm also wrote a `minimumReleaseAgeExclude` list for the exact-pinned `unocss@66.10.2` family and `@iconify-json/carbon@1.2.27` (they are younger than the default `minimumReleaseAge`); kept as pnpm generated it.
3. **`tsconfig.json` uses Nuxt 4 project references, not `extends`.** With `{ "extends": "./.nuxt/tsconfig.json" }`, `nuxt typecheck` (which runs `vue-tsc -b --noEmit`) checked nothing at the root and passed on a deliberate `const x: number = "str"` in `uno.config.ts`. Switched to `files: []` + `references` to `.nuxt/tsconfig.{app,server,shared,node}.json`, and added `typescript.nodeTsConfig.include: ['../uno.config.ts', '../vitest.config.ts']` in `nuxt.config.ts` because Nuxt's node project only includes `modules/*.*` and `nuxt.config.*`. Mutation-tested: an injected type error in each of `uno.config.ts`, `vitest.config.ts`, `modules/tuffex-components.ts`, `app/pages/index.vue`, `nuxt.config.ts` makes `pnpm typecheck` exit 2 with the right file:line; clean tree exits 0.
4. **`resolveDistRoot()` resolves the CJS main, not `package.json`.** `@talex-touch/tuffex`'s `exports["./*"]` wildcard shadows `package.json`, so `require.resolve('@talex-touch/tuffex/package.json')` throws `Cannot find module …/dist/lib/package.json/index.js`. Both the Nuxt module and `scripts/tuffex-icon-classes.mjs` resolve `@talex-touch/tuffex` (→ `dist/lib/index.js`) and step to `../es`.
5. **`optimizeDeps.include` for every registered subpath** (added in the module). Without it, Vite discovers `@talex-touch/tuffex/<dir>` only when the page first imports it, re-optimizes, and the *first* load of a cold cache logs `Failed to fetch dynamically imported module …/pages/index.vue` + `NUXT_E1005` + `VUE_ROUTER_R0010/R0011` (the second load is clean). With the include list the cold-cache first load is clean too (verified after `rm -rf node_modules/.cache/vite`).
6. **`scripts/tuffex-icon-classes.d.mts`** added so `uno.config.ts` importing the `.mjs` type-checks under `strict`.
7. `eslint` resolved to `9.39.5` (spec `^9.39.4`), `vitest` to `3.2.7` (spec `^3.2.7`). All exact pins landed exactly.
8. UnoCSS dev stylesheet URL: `http://localhost:3456/__uno.css` returns 200 but is a **Vite JS module** wrapping the CSS in `const __vite__css = "..."`; a plain `grep` on it finds nothing. Decode the JSON string (see verification) before asserting on rules. Phase H's smoke script must do the same.

## Installed versions (`pnpm list --depth 0`)

```
dependencies: @iconify-json/carbon@1.2.27 @iconify-json/ri@1.2.10 @nuxtjs/color-mode@4.0.1 @pinia/nuxt@1.0.2
  @talex-touch/tuffex@0.5.0 @unocss/nuxt@66.10.2 @unocss/reset@66.10.2 @vueuse/core@14.4.0 @vueuse/nuxt@14.4.0
  dayjs@1.11.23 nuxt@4.5.2 pinia@4.0.3 unocss@66.10.2 vue@3.5.42
devDependencies: @nuxt/eslint@1.17.0 eslint@9.39.5 typescript@5.9.3 vitest@3.2.7 vue-tsc@3.3.11
```
Nuxt banner: `Nuxt 4.5.2 (with Nitro 2.13.4, Vite 8.2.2 and Vue 3.5.42)`. `@talex-touch/utils@2.1.0` installed as a tuffex dependency; Electron **not** installed.

## Verification evidence

```
$ pnpm install            → Done; postinstall "nuxt prepare": ℹ [tuffex-components] registered 213 components from 148 barrels
$ pnpm typecheck          → exit 0 (no "error TS" lines)
$ pnpm lint               → exit 0; eslint -f json lists 9 files, all errors=0 warnings=0
$ node scripts/tuffex-icon-classes.mjs | wc -l   → 42
$ grep -c "typeof import(\"@talex-touch/tuffex/" .nuxt/components.d.ts → 426 (213 × eager+Lazy)
  sanity: TxButton TxPagination TxBreadcrumb TxSidebarNav TxMarkdownEditor TxEmptyState TxToastHost TxSteps TxStep
          TxCommandPalette TxFilterChips TxDataTable TxCellLink TxStatCard TxTuffLogoStroke TxRowSkeleton — all present
$ pnpm dev (bg) ; curl -s -o /dev/null -w '%{http_code}' http://localhost:3456/ → 200 within 2 s
  <html lang="zh-CN" class="light" …> ; <body class="min-h-screen bg-$tx-bg-color-page text-$tx-text-color-primary [font-family:var(--tx-font-family)] antialiased">
  <link rel="stylesheet" href=…/@unocss/reset/tailwind-compat.css> and …/@talex-touch/tuffex/dist/es/components.css both injected
$ curl -s http://localhost:3456/__uno.css → 200, Vite module; decoded CSS 162,395 bytes, layers preflights/icons/default
  39/42 safelisted classes have a `--un-icon:url(...)` rule; the 3 missing are i-simple-icons-* (collection not installed — expected, TxOsIcon only)
  .i-carbon-chevron-right / .i-carbon-search / .i-ri-bold / .i-carbon-add / .i-carbon-moon / .i-carbon-sun → rule ok
  .bg-\$tx-bg-color-page{background-color:var(--tx-bg-color-page)}  .text-\$tx-text-color-primary{color:var(--tx-text-color-primary)}
  .\[font-family\:var\(--tx-font-family\)\]{font-family:var(--tx-font-family)}  .min-h-screen  .antialiased → present
$ headless Chrome --headless=new --virtual-time-budget=10000 --dump-dom http://localhost:3456/  (watchdog kill after 40 s; Chrome never exits on macOS)
  cold Vite cache: DOM 2,006,005 bytes; problem lines 0   |   warm: DOM 2,006,005 bytes; problem lines 0
  markers: class="tx-pagination" ×21, tx-empty-state ×158, tx-markdown-editor ×117, i-carbon-* ×32, i-ri-* ×44
  icon elements in DOM: i-carbon-chevron-left/right, i-carbon-moon, i-carbon-add, i-carbon-search, i-carbon-warning, …; all 14 i-ri-* toolbar icons
  only console lines: "[vite] connecting/connected", "<Suspense> is an experimental feature", Nuxt DevTools banner
```

Not verified in this phase (needs CDP or eyes, Phase H): `getComputedStyle(el).maskImage !== 'none'` on the icon elements — the CSS rules and the DOM classes are both proven above, but the composite was not measured.

## Tuffex 0.5.0 package observations (not fixed here)

- `exports["./*"]` shadows `./package.json`; consumers cannot `require.resolve('@talex-touch/tuffex/package.json')` (see deviation 4).
- `dist/es/packages/` and `dist/es/_virtual/` ship in the tarball; neither has an `index.d.ts`, so the barrel scan skips them naturally.
- `dist/es/*/index.js` files do **not** import their own CSS (as the inventory said); `style.css` must be host-imported — done in `nuxt.config.css`.
- `TxOsIcon` renders `i-simple-icons-{apple,linux,windows}`; `@iconify-json/simple-icons` is not installed, so those three classes have no rule. Harmless unless the forum uses `TxOsIcon`.
- The `<Suspense> is an experimental feature` console line comes from Nuxt's own app shell, not Tuffex.

## Files created (all under /Users/tagzixian/Workspace/Projects/tuff-forum)

`.gitignore` `.npmrc` `pnpm-workspace.yaml` `package.json` `pnpm-lock.yaml` `tsconfig.json` `eslint.config.mjs` `vitest.config.ts` `nuxt.config.ts` `uno.config.ts`
`modules/tuffex-components.ts` `scripts/tuffex-icon-classes.mjs` `scripts/tuffex-icon-classes.d.mts` `app/app.vue` `app/pages/index.vue` (throwaway Phase-B probe; Phase E replaces it)
