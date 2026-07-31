# Nexus end-to-end debugging report

## Executive summary

The authoritative pass ran against detached `origin/master` commit
`784377c499899529145c0dac7f1d0000329e0794`. The main worktree remained at
`38860855b9a59acfd9abdf18182fa3b0d6a64310`; no product source or product test
was edited.

Two new, non-duplicate release-gate defects were confirmed:

1. localized docs directory aliases return HTTP 404 during SSR and make the
   production build fail on 24 prerender routes;
2. five Vitest files live under `server/api`, so the required API route-tree
   guard fails.

Store hydration mismatch and the stable full-suite failures are covered by open
Issue #327. Vue Router/Volar resolution warnings remain #332. Missing deployed
OAuth/Dashboard/bfcache evidence remains #324.

## Environment and isolation

| Item                            | Value                                             |
| ------------------------------- | ------------------------------------------------- |
| Main worktree                   | `/Users/tagzixian/Workspace/Projects/talex-touch` |
| Main worktree HEAD              | `38860855b9a59acfd9abdf18182fa3b0d6a64310`        |
| Authoritative detached worktree | `/tmp/tuff-nexus-origin-784377c`                  |
| Authoritative commit            | `784377c499899529145c0dac7f1d0000329e0794`        |
| Node                            | `v24.18.0`                                        |
| pnpm                            | `10.34.4`                                         |
| Chrome                          | `150.0.7871.187`                                  |
| Nexus                           | `1.0.0`                                           |
| Local Cloudflare dev            | `127.0.0.1:3123`                                  |
| Pure Nuxt dev                   | `127.0.0.1:3124`                                  |
| Browser profile                 | disposable `/tmp/nexus-chrome-profile*`           |

The detached worktree was installed frozen. TuffEx was then built explicitly
because its workspace exports point to `dist`; the first missing-module
typecheck and `layers.test.ts` failure before this build were environment
prerequisite artifacts, not product defects.

No production credential, cookie, OAuth flow, Dashboard session, signed URL, or
remote mutation was used. Public production probes were bounded unauthenticated
GET/HEAD requests only.

## Data-flow map

### Docs route

```text
GET /:locale/docs/<directory>
  -> custom locale catch-all in nuxt.config.ts
  -> pages/docs/[...slug].vue
  -> normalizeDocsPagePath(route.path)
  -> GET /api/docs/page?path=<directory>&locale=<locale>&body=0
  -> buildDocsPageLookupPaths()
  -> queryCollection() resolves <directory>/index.<locale>
  -> isDocsPageRecordForRoute(response, requested directory, locale)
  -> strict path comparison rejects the valid index fallback
  -> doc=null -> setResponseStatus(404)
  -> client fetch later adopts the same record and visually recovers
```

### Store first load

```text
GET /store
  -> SSR useAsyncData(server:false) stays non-pending
  -> SSR renders empty-store container
  -> client useAsyncData starts pending
  -> client expects loader spans
  -> Vue hydration node/class mismatch
  -> GET /api/store/search resolves empty local synthetic result
```

### API route tree

```text
pnpm check:api-routes
  -> recursively scans server/api
  -> rejects __tests__, *.test.ts, *.api.test.ts, test-utils.ts
  -> finds five intelligence route tests introduced by 7faea27bf
  -> exits 1 before release acceptance
```

## Automated command matrix

| Command                                          | Outcome                      | Classification                                                          |
| ------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------- |
| Focused docs/store/release/auth/dashboard matrix | 17/19 files, 133/136 tests   | Three stale source guards; #327                                         |
| Full Nexus test, run 1                           | 164/173 files, 874/886 tests | Stable #327 baseline                                                    |
| Full Nexus test, run 2                           | 164/173 files, 874/886 tests | Identical to run 1; #327                                                |
| `pnpm typecheck`                                 | exit 0                       | Two known Volar warnings; #332                                          |
| `pnpm build`                                     | exit 1                       | 24 docs directory aliases prerender as 404; new defect                  |
| `pnpm build:analyze-worker`                      | exit 1                       | Inconclusive partial output after aborted build; not a separate finding |
| `pnpm check:api-routes`                          | exit 1                       | Five tests under `server/api`; new defect                               |
| `pnpm check:mdc-fences`                          | pass                         | No MDC fence regression                                                 |
| `pnpm check:runtime-evidence`                    | exit 1                       | Isolated evidence directory absent; expected #324 boundary              |
| `pnpm check:runtime-evidence:template`           | pass                         | Template renders without secrets                                        |
| deployed collector `--dry-run`                   | pass                         | Plan only; no deployed claim                                            |

The two correctly prepared full-suite runs failed in the same nine files and 12
tests. They cover pricing locale/source guards, Store source guards, governance,
notification source guards, app-auth token arguments, D1 batch mocking, plugin
security/signing fixtures, and Intelligence error semantics. These groups are
already enumerated in #327.

## Docs SSR and build reproduction

Both pure Nuxt and local Cloudflare dev produced the same boundary:

| Route/API                                        | Status                         |
| ------------------------------------------------ | ------------------------------ |
| `/en/docs/dev`                                   | 404                            |
| `/en/docs/dev/index`                             | 200                            |
| `/en/docs/dev/components`                        | 404                            |
| `/en/docs/dev/components/index`                  | 200                            |
| `/zh/docs/guide`                                 | 404                            |
| `/zh/docs/guide/index`                           | 200                            |
| `/api/docs/page?path=/docs/dev&locale=en&body=0` | 200, path `/docs/dev/index.en` |

`pnpm build` failed on 24 routes: the root docs directory plus dev/api,
dev/components, dev/getting-started, dev/intelligence, dev/reference,
dev/release, dev/tools, guide, guide/features/plugins, and guide/tips for both
English and Chinese.

After JavaScript hydration, Chrome displayed the expected Developer Hub or
component content on an alias route. This recovery does not repair the initial
HTTP 404 and cannot help Nitro prerender, crawlers, or no-JS clients.

The strict route-record predicate was introduced by commit `b57b9649f40c89e185b69031af999664d93a5696`.
It correctly prevents stale cross-route content, but it does not canonicalize
`/directory` and `/directory/index` before comparing them.

## Browser coverage

Fresh-profile Chrome covered desktop `1440x900` and mobile `390x844`.

- Landing, Pricing, Store, Updates, Sign-in, explicit docs index/detail, and both
  locales rendered expected titles and H1 values.
- Mobile samples had `scrollWidth === innerWidth`; no horizontal overflow was
  observed.
- Reload on `/zh/docs/guide` recovered the expected document after the initial
  404 response.
- Back `/store -> /pricing` and forward `/pricing -> /store` preserved route and
  title.
- `/device-auth`, `/dashboard`, and `/auth/app-callback` redirected to Sign-in
  while unauthenticated.
- Protected local APIs returned canonical 401 responses.
- No page exception or failed request was recorded in the representative route
  matrix.
- Store emitted `Hydration completed but contains mismatches.` with and without
  hardware WebGL. Pure Nuxt and local Cloudflare dev both reproduced it.
- The unauthenticated Dashboard shell also emitted its already-budgeted hydration
  mismatch; this remains part of #324 evidence work.

Store's mismatch was introduced by `6852742edac0621e6563bbb536d28d97ae3076ed`,
which added `lazy: true, server: false` while retaining a pending-vs-empty
conditional whose initial state differs between SSR and client. This maps to
#327's existing Store first-load/performance boundary.

## Local API coverage

Representative read-only results:

| API                         | Result                                     |
| --------------------------- | ------------------------------------------ |
| docs navigation/search/page | 200 with expected JSON                     |
| store search/list           | 200, empty synthetic list                  |
| updates                     | 200 with local release notices             |
| latest release              | 200, explicit no-published-release payload |
| auth current-user           | 401 unauthenticated                        |
| Dashboard updates           | 401 unauthenticated                        |

Test-like paths under `server/api` returned 404 for local GET and synthetic empty
POST probes, so current Nuxt did not expose them as callable routes in this run.
That does not make the route-tree gate green or justify weakening it.

## Public production read-only coverage

Bounded no-cookie GET/HEAD requests to `https://tuff.tagzxia.com` returned 200
for `/`, `/pricing/`, `/store/`, representative docs aliases, explicit index
paths, and docs details. Index paths currently redirect/canonicalize to directory
URLs. The observed production HTML had build ID
`2b692e5c-5b40-4bdc-9d4e-43680e1ab761`.

This shows the deployed site remains available; it does not prove that commit
`784377c` can be built or deployed. No authenticated or mutation endpoint was
requested.

## Limitations and blockers

- Intended production build did not complete, so final Worker budget output and
  post-build Wrangler preview cannot be treated as valid evidence.
- Deployed preview, OAuth, authenticated Dashboard, and real bfcache evidence are
  intentionally unavailable and remain #324.
- Auth.js advisories remain #329 and were not exercised with credentials.
- Three missing English auth locale keys use explicit English fallbacks. They
  produce build warnings but no confirmed visible failure, so they are retained
  as low-risk cleanup rather than a new Issue.

## Product-change audit

No file under `apps/nexus`, `packages/tuffex`, or any product test directory was
modified. Durable output contains summaries only; raw logs, screenshots, and
browser profiles remained under `/tmp` for cleanup.
