# Implement — Nexus dev: consume tuffex dist by default and pre-optimize late deps

Work in `apps/nexus/`.

## 1. Mode helper + guard

- [ ] `build/tuffex-dev-mode.ts`: `resolveTuffexDevMode({ isDev, env, distEntryExists })` → `'source' | 'dist'`; throws the documented error when `dist` is selected but missing. Unit test `build/tuffex-dev-mode.test.ts` (three cases: flag → source; no flag + dist present → dist; no flag + dist missing → throws with the build command in the message; not dev → dist).

## 2. nuxt.config.ts

- [ ] Replace `useWorkspaceSource` with `tuffexDevMode === 'source'` for all tuffex entries; keep `tuffBusinessSourceEntry`/`tuffexChartsSourceEntry` unconditional.
- [ ] `@tuffex-components/*` alias + tsconfig path follow the mode.
- [ ] `tuffexOnDemandStylePlugin({ enabled: tuffexDevMode === 'dist' })`.
- [ ] `optimizeDeps.include` additions (only resolvable specifiers).

## 3. modules/tuffex-components.ts

- [ ] Register `filePath` as `@talex-touch/tuffex/<dir>` in dist mode, `@tuffex-components/<dir>` in source mode.

## 4. Tests

- [ ] `app/components/content/demo-client-boundary.test.ts` "normalizes TuffEx dev component aliases to one source module id": update to assert the mode-driven mapping (both branches present in config).
- [ ] `pnpm exec vitest run build/tuffex-dev-mode.test.ts app/components/content/demo-client-boundary.test.ts test/guards/component-auto-import.test.ts`

## 5. README

- [ ] Add the two dev modes under the dev section.

## 6. Verification

- [ ] `pnpm dev:pure` (dist mode): open `/en/docs/dev/components/button` in a browser, record request count / bytes / css count and confirm tuffex URLs contain `/dist/es/`; then `/select` — dev log has no `optimized dependencies changed`.
- [ ] `NUXT_TUFFEX_SOURCE=true pnpm dev:pure`: same page serves `/packages/components/src/`, a tuffex SFC template edit hot-updates.
- [ ] Temporarily rename `packages/tuffex/dist` → confirm the boot error message → restore.
- [ ] `pnpm run typecheck`, `pnpm run test`.
- [ ] Record numbers in `research/results.md`.
