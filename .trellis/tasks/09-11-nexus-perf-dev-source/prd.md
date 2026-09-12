# Nexus dev: consume tuffex dist by default and pre-optimize late deps

Child of `09-11-nexus-perf`. Baseline numbers are in the parent `prd.md`.

## Goal

Make the local dev loop on Nexus component pages fast by default: consume the built tuffex package (one module + on-demand style per component) unless a developer opts into tuffex source, and stop Vite from discovering dependencies mid-session.

## Requirements

### R1 — Workspace-source consumption is opt-in
`nuxt.config.ts` currently hard-codes `useWorkspaceSource = isDev`. It must instead read an explicit env flag (`NUXT_TUFFEX_SOURCE=true`) so that plain `pnpm dev` consumes `packages/tuffex/dist/es` with the existing `tuffexOnDemandStylePlugin`, and `NUXT_TUFFEX_SOURCE=true pnpm dev` keeps today's source behaviour. `tuffex-charts` and `tuff-business` keep their existing source aliases (they have no dist ordering guarantee).

### R2 — Missing dist fails loudly
If `packages/tuffex/dist/es/index.js` does not exist when dist mode is selected, dev must fail at config time with a message naming the build command (`pnpm -C packages/tuffex run build`) rather than falling through to an unresolvable alias.

### R3 — The `@tuffex-components/*` module registration follows the mode
`modules/tuffex-components.ts` registers every component via `@tuffex-components/<dir>`; the alias for that specifier must point at dist in dist mode and at source in source mode. The `demo-client-boundary.test.ts` assertions about the source alias must be updated to reflect the new contract rather than deleted.

### R4 — Late dependency discovery is eliminated for docs routes
The dependencies Vite discovered mid-session during the baseline (`shiki`, `@shikijs/*`, `@better-scroll/core`, `@better-scroll/scroll-bar`, `@better-scroll/pull-down`, `@better-scroll/pull-up`, `dompurify`) are added to `vite.optimizeDeps.include` so a component page does not trigger "optimized dependencies changed, reloading".

### R5 — Documented
`apps/nexus/README.md` (dev section) states the two modes and when to use each.

## Constraints

- Production build behaviour is unchanged (already dist).
- `pnpm -C apps/nexus run typecheck` must pass in both modes; tsconfig path aliases follow the same flag.
- Do not remove the on-demand style plugin or the style-deps mechanism.

## Acceptance Criteria

- [ ] `pnpm dev` (no flag): a component docs page loads with tuffex served from `dist/es` (network shows `/_nuxt/@fs/.../packages/tuffex/dist/es/...`, not `.../components/src/...`), and the request count for a full load of `/en/docs/dev/components/button` is below the baseline 250.
- [ ] `NUXT_TUFFEX_SOURCE=true pnpm dev`: same page serves tuffex from `packages/components/src` and a tuffex SFC edit hot-updates.
- [ ] With dist missing and no flag, `pnpm dev` exits with the documented message.
- [ ] Dev log for a cold visit to `/en/docs/dev/components/button` then `/select` contains no `optimized dependencies changed` line.
- [ ] `pnpm -C apps/nexus run test` and `typecheck` pass.
