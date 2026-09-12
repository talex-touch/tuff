# Design — Nexus dev: consume tuffex dist by default and pre-optimize late deps

## Mode flag

`nuxt.config.ts` today:

```ts
const useWorkspaceSource = isDev
```

New:

```ts
const useTuffexSource = isDev && isEnvFlagEnabled(process.env.NUXT_TUFFEX_SOURCE)
```

Everything that keys off `useWorkspaceSource` for tuffex (base style entry, component entry, type path entry, utils entry, the `@talex-touch/tuffex` alias, `tuffexOnDemandStylePlugin({ enabled })`) switches to the new flag. `tuff-business` and `tuffex-charts` keep their unconditional source aliases (they are already `// Always source`).

## `@tuffex-components/*`

`modules/tuffex-components.ts` registers `filePath: '@tuffex-components/<dir>'` with `export: name`. The Vite alias `/^@tuffex-components\/(.+)$/` currently maps to source unconditionally (`tuffexComponentSourceEntry`), and the `demo-client-boundary.test.ts` pins that. In dist mode it must map to `${tuffexDistRoot}/$1/index.js` — the same target as `@talex-touch/tuffex/<dir>` — otherwise the same component would be bundled twice (source via the registry, dist via explicit imports). The on-demand style plugin only recognises `@talex-touch/tuffex/<name>` specifiers, so in dist mode the module's registration `filePath` becomes `@talex-touch/tuffex/<dir>` (the plugin then injects the component's style closure into whatever file Nuxt's component loader rewrites). In source mode it stays `@tuffex-components/<dir>` (styles come from the SFC `<style>` blocks). The module reads the mode from `nuxt.options.runtimeConfig`? No — from the same env flag through a tiny shared helper `build/tuffex-dev-mode.ts` (`resolveTuffexDevMode()`), imported by both `nuxt.config.ts` and the module.

Type paths (`typescript.tsConfig.compilerOptions.paths`) follow the same flag; `@tuffex-components/*` points to dist `index.d.ts` in dist mode.

## Missing dist guard

In `build/tuffex-dev-mode.ts`: when mode is `dist` and `packages/tuffex/dist/es/index.js` is absent, throw with:

```
[nexus] tuffex dist is missing. Run `pnpm -C packages/tuffex run build`, or set NUXT_TUFFEX_SOURCE=true to develop against tuffex source.
```

Production build already runs `pnpm -C packages/tuffex run build` first (see `package.json` `build` script) so the guard never fires there.

## optimizeDeps

Add to `vite.optimizeDeps.include`: `shiki`, `@shikijs/core`, `@shikijs/engine-javascript`, `@shikijs/langs`, `@shikijs/themes`, `@better-scroll/core`, `@better-scroll/scroll-bar`, `@better-scroll/pull-down`, `@better-scroll/pull-up`, `dompurify` (already present), `marked` (already present). Only entries that resolve from `apps/nexus` are added (verify with `require.resolve` in a one-off script; Vite errors at boot on an unresolvable include).

## Docs

`README.md` dev section: two lines describing `pnpm dev` (dist) vs `NUXT_TUFFEX_SOURCE=true pnpm dev` (source, needed when editing tuffex components).

## Compatibility

- Vitest (`vitest.config.ts`) resolves `@talex-touch/tuffex` how? Check and keep tests on source (tests import components by relative path or the source alias; the flag must default to source under `VITEST`).
- `check:typecheck-plugin-resolution` runs `nuxt typecheck` — it must pass in dist mode (default) and CI must have built tuffex first; the root `pnpm nexus:build` already does.

## Rollback

Single commit; revert restores `useWorkspaceSource = isDev`.
