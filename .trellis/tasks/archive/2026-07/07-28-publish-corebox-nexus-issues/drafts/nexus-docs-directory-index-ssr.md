## Priority

P0 - current Nexus production build exits on 24 docs prerender routes.

## Summary

Audited on default-branch commit [`784377c499899529145c0dac7f1d0000329e0794`](https://github.com/talex-touch/tuff/commit/784377c499899529145c0dac7f1d0000329e0794) under pure Nuxt, local Cloudflare dev, Nitro production build, and a fresh Chrome profile.

Localized docs directory routes such as `/en/docs/dev`, `/en/docs/dev/components`, and `/zh/docs/guide` return HTTP 404 during SSR even though their index documents exist.

The docs page API resolves these requests successfully to records such as `/docs/dev/index.en`, and explicit `/index` routes return 200. Client JavaScript later fetches and displays the correct document, which masks the invalid initial status during interactive browsing.

`corepack pnpm -C apps/nexus build` fails because Nitro sees 24 English/Chinese directory aliases as prerender errors.

## Reproduction

1. Start pure Nuxt or local Cloudflare dev from commit `784377c`.
2. Request `/en/docs/dev` and observe HTTP 404.
3. Request `/en/docs/dev/index` and observe HTTP 200 with Developer Hub content.
4. Request `/api/docs/page?path=/docs/dev&locale=en&body=0` and observe HTTP 200 with record path `/docs/dev/index.en`.
5. Repeat with nested aliases such as `/en/docs/dev/components` and with Chinese docs.
6. Run `corepack pnpm -C apps/nexus build`.
7. Observe 24 localized directory aliases under `Errors prerendering` and exit code 1.

## Expected

A docs directory alias renders its index document with HTTP 200 or returns an intentional canonical redirect. The production build completes.

## Actual

SSR discards the valid index record, sets HTTP 404, and blocks Nitro prerender. A hydrated browser later recovers visually, but the initial response remains invalid.

## Evidence and root cause

- [The prerender route generator intentionally emits both index paths and directory aliases](https://github.com/talex-touch/tuff/blob/784377c499899529145c0dac7f1d0000329e0794/apps/nexus/build/docs-prerender-routes.ts#L30-L51).
- [The docs API intentionally tries localized index fallback paths](https://github.com/talex-touch/tuff/blob/784377c499899529145c0dac7f1d0000329e0794/apps/nexus/server/api/docs/page.get.ts#L98-L120).
- [`isDocsPageRecordForRoute()` compares the returned record path to the requested directory without index-alias canonicalization](https://github.com/talex-touch/tuff/blob/784377c499899529145c0dac7f1d0000329e0794/apps/nexus/app/utils/docs-page-client-cache.ts#L36-L55).
- [A rejected record leaves the SSR view in `not-found` and sets response status 404](https://github.com/talex-touch/tuff/blob/784377c499899529145c0dac7f1d0000329e0794/apps/nexus/app/pages/docs/%5B...slug%5D.vue#L478-L489).

The strict route-record predicate was added by [`b57b9649f`](https://github.com/talex-touch/tuff/commit/b57b9649f40c89e185b69031af999664d93a5696) to prevent stale content from a previous route being adopted after remount. That protection is valid, but `/directory` and `/directory/index` need equivalent canonical identities.

## Impact

- Current `origin/master` cannot produce the intended Nexus production artifact.
- Crawlers, no-JavaScript clients, and status-sensitive caches receive a false 404.
- Client recovery makes the failure easy to miss during manual interactive testing.
- Final Worker analysis and downstream local production evidence cannot run against a valid completed build.

## Required outcome

Canonicalize docs index aliases consistently across response matching and related cache identities while preserving locale checks and stale-route rejection.

## Acceptance criteria

- [ ] Every generated English and Chinese docs directory alias returns 200 or an intentional canonical redirect, never an accidental 404.
- [ ] Explicit `/index` and non-index detail routes retain their current content, title, locale, and canonical URL behavior.
- [ ] The docs page API may return an index record for a directory request without that record being discarded.
- [ ] A stale record from another directory or locale is still rejected.
- [ ] Reload, client navigation, back/forward, metadata-only fetch, and deferred full-body fetch do not show stale content or hydration errors.
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

Probe representative root/nested directory aliases and their explicit `/index` forms in both locales under pure Nuxt and local Cloudflare mode.

## Non-goals

- Removing stale-route protection.
- Disabling Nitro prerender failures or dropping directory aliases to make the build green.
- Changing deployed OAuth or Dashboard evidence scope.
