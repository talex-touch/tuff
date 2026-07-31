# Proposed GitHub Issues

No Issue has been published. Both drafts require explicit user approval.

## Draft 1

**Title**

`Docs: restore SSR status and prerendering for directory index routes`

**Labels**

`bug`

**Body**

## Priority

P0 - current Nexus production build exits on 24 docs prerender routes.

## Problem

Localized docs directory routes such as `/en/docs/dev`,
`/en/docs/dev/components`, and `/zh/docs/guide` return HTTP 404 during SSR even
though their index documents exist.

The docs page API resolves these requests successfully to records such as
`/docs/dev/index.en`, and explicit `/index` routes return 200. Client JavaScript
later fetches and displays the correct document, which masks the invalid initial
status during interactive browsing.

`corepack pnpm -C apps/nexus build` fails because Nitro sees 24 English/Chinese
directory aliases as prerender errors.

## Root cause

`isDocsPageRecordForRoute()` rejects the API's valid index fallback because it
compares the returned `/docs/<directory>/index` path to the requested
`/docs/<directory>` path without canonicalizing directory aliases.

The strict predicate was added by `b57b9649f` to prevent stale content from a
previous route being adopted after remount. That protection is valid, but index
aliases need equivalent canonical identities.

## Required work

- Canonicalize `/directory` and `/directory/index` consistently when matching a
  docs response to the active route and when deriving related cache keys.
- Preserve locale checks and stale/foreign route rejection.
- Add focused contracts for root and nested index aliases in both locales.
- Add an SSR/prerender status contract so a visually recovered client page cannot
  hide an invalid initial response.

## Acceptance criteria

- [ ] Every generated English and Chinese docs directory alias returns 200 or an
      intentional canonical redirect, never an accidental 404.
- [ ] Explicit `/index` and non-index detail routes retain their current content,
      title, locale, and canonical URL behavior.
- [ ] The docs page API may return an index record for a directory request without
      that record being discarded.
- [ ] A stale record from another directory or locale is still rejected.
- [ ] Reload, client navigation, back/forward, metadata-only fetch, and deferred
      full-body fetch do not show stale content or hydration errors.
- [ ] Nexus production build and Worker bundle analysis pass.

## Verification

```bash
corepack pnpm -C apps/nexus exec vitest run \
  app/utils/docs-page-client-cache.test.ts \
  app/pages/docs/docs-page-performance.test.ts \
  build/docs-prerender-routes.test.ts
corepack pnpm -C apps/nexus typecheck
corepack pnpm -C apps/nexus build
corepack pnpm -C apps/nexus build:analyze-worker
```

Probe representative root/nested directory aliases and their explicit `/index`
forms in both locales under pure Nuxt and local Cloudflare mode.

## Non-goals

- Removing stale-route protection.
- Disabling Nitro prerender failures or dropping directory aliases to make the
  build green.
- Changing deployed OAuth or Dashboard evidence scope.

## Draft 2

**Title**

`Build: keep Nexus test files outside the server API route tree`

**Labels**

`bug`

**Body**

## Priority

P1 - restore the documented Nexus API/routes quality gate.

## Problem

`corepack pnpm -C apps/nexus run check:api-routes` exits 1 because five Vitest
files live under `apps/nexus/server/api`:

```text
admin/analytics/intelligence.get.test.ts
admin/intelligence-agent/session/stream.post.test.ts
admin/intelligence-agent/session/trace.get.test.ts
v1/intelligence/invoke.post.test.ts
v1/intelligence/stream.post.test.ts
```

The guard intentionally reserves `server/api` for runtime handlers. The files
were added together by `7faea27bf`; an earlier misplaced app-auth route test had
already been moved out of this tree so the same guard could pass.

Current local Nuxt returned 404 for direct test-like GET and synthetic empty POST
paths, so this report does not claim that the files are currently exposed as
callable endpoints. The structural gate is still broken, and scanner behavior
must not depend on framework-version ignore rules.

## Required work

- Move the five tests into the established `apps/nexus/test/api` hierarchy.
- Update relative imports/mocks without weakening route handler assertions.
- Keep `check-server-api-route-tree.mjs` fail-closed for tests and test utilities.
- Run the route-tree guard in the Nexus release/CI quality path if it is not
  already enforced there.

## Acceptance criteria

- [ ] No `*.test.ts`, `*.api.test.ts`, `__tests__`, or `test-utils.ts` remains
      under `apps/nexus/server/api`.
- [ ] All five moved suites retain their positive, auth, quota, stream, and
      sanitization coverage.
- [ ] Production intelligence routes retain their existing URL, HTTP method, and
      authentication boundary.
- [ ] Test-like paths are absent from generated Nitro route/type manifests.
- [ ] `check:api-routes`, focused tests, typecheck, and production build pass.
- [ ] The route-tree guard is not weakened with new ignores for these files.

## Verification

```bash
corepack pnpm -C apps/nexus run check:api-routes
corepack pnpm -C apps/nexus exec vitest run \
  test/api/admin/analytics/intelligence.get.test.ts \
  test/api/admin/intelligence-agent/session/stream.post.test.ts \
  test/api/admin/intelligence-agent/session/trace.get.test.ts \
  test/api/v1/intelligence/invoke.post.test.ts \
  test/api/v1/intelligence/stream.post.test.ts
corepack pnpm -C apps/nexus typecheck
corepack pnpm -C apps/nexus build
```

## Non-goals

- Disabling test discovery or excluding all `server/api` files from typecheck.
- Weakening intelligence auth, fail-closed quota, stream, or error-redaction
  behavior.
