# Nexus candidate ledger

## N1 - Confirmed new defect: docs directory aliases fail SSR/prerender

- **Severity:** P0 release blocker.
- **Expected:** A localized docs directory alias either renders its index document
  with HTTP 200 or returns an intentional redirect to the canonical route; the
  production build completes.
- **Actual:** 24 English/Chinese directory aliases return HTTP 404 in pure Nuxt,
  local Cloudflare dev, and Nitro prerender. Explicit `/index` routes and the docs
  page API return 200. `pnpm build` exits 1.
- **Reproduction:** reproduced in both local runtime modes and the production
  build. Chrome visually recovers only after hydration.
- **Root cause:** `isDocsPageRecordForRoute()` compares `/docs/dev/index` to
  `/docs/dev` without index-alias canonicalization, so SSR discards the valid API
  fallback. Introduced by `b57b9649f`.
- **Impact:** current `origin/master` cannot produce the intended Nexus artifact;
  initial HTTP status is wrong for crawlers/no-JS clients; client recovery masks
  the defect during casual browsing.
- **Duplicate search:** no open/closed Issue mentions docs directory alias 404,
  index fallback rejection, or prerender failure. #327 owns known test-suite
  failures but does not list this runtime/build failure.
- **Classification:** draft a new Issue.

## N2 - Confirmed new defect: API route-tree guard rejects five tests

- **Severity:** P1 release/process gate.
- **Expected:** `server/api` contains route handlers only and
  `pnpm check:api-routes` passes.
- **Actual:** five `*.test.ts` files under intelligence API directories make the
  guard exit 1.
- **Reproduction:** direct guard run at `784377c`; historical TODO evidence says
  this guard passed after an earlier misplaced test was moved on 2026-07-10.
- **Root cause:** commit `7faea27bf` added the five tests beside route handlers
  instead of under `test/api`.
- **Impact:** the documented API/routes quality gate is red. Current Nuxt returned
  404 for direct test-like GET/POST paths, so route exposure was not observed;
  co-location still creates scanner/version risk and violates repository policy.
- **Duplicate search:** no open/closed Issue or active task owns these five paths
  or the failing route-tree guard.
- **Classification:** draft a new Issue.

## N3 - Confirmed, covered by #327: Store hydration mismatch

- **Severity:** P1 within existing Issue.
- **Expected:** SSR and client initial trees match while Store performs its lazy
  first request.
- **Actual:** SSR renders the empty state while the client expects loading spans;
  Vue reports node and class mismatches plus the canonical hydration error.
- **Reproduction:** twice in Chrome, under local Cloudflare dev and pure Nuxt,
  including a run with working WebGL.
- **Root cause:** `6852742ed` added `lazy: true, server: false` without aligning the
  initial pending/empty state.
- **Impact:** noisy runtime evidence and non-deterministic first paint; Vue warns
  that production does not rectify the class mismatch.
- **Duplicate search:** #327 explicitly owns Store first-load/performance guard
  drift and requires real regressions to be fixed rather than guards weakened.
- **Classification:** do not create a duplicate Issue; add evidence to #327 when
  remote updates are approved.

## N4 - Confirmed, covered by #327: stable full-suite failures

- Two prepared runs were identical: 164/173 files and 874/886 tests passed.
- Nine files and 12 tests failed across the exact #327 groups.
- The pre-TuffEx `layers.test.ts` failure disappeared after the required workspace
  package build and is not a product defect.
- **Classification:** existing Issue #327.

## N5 - Known boundaries

- Typecheck exits 0 but emits the two Vue Router/Volar export errors: #332.
- Runtime evidence directory is absent in the detached worktree and deployed
  auth/bfcache evidence is unavailable: #324.
- Auth.js/NextAuth advisories were not reclassified: #329.
- Worker analysis ran against an aborted partial build and is not standalone
  evidence.
- Three auth locale lookups have explicit English fallbacks; warning-only cleanup,
  not a confirmed new defect.
