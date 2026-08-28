# Implementation Plan — Nexus docs true SSG

Working set (code): `apps/nexus/app/pages/docs/[...slug].vue`,
`apps/nexus/app/utils/docs-page-client-cache.ts`,
`apps/nexus/app/pages/docs/docs-page-performance.test.ts`,
`apps/nexus/i18n/locales/{en,zh}.ts`.
Read-only context: `apps/nexus/server/api/docs/page.get.ts`,
`apps/nexus/build/{docs-prerender-routes.ts,nexus-prerender-routes.ts,materialize-docs-index-aliases.mjs,trim-content-assets.mjs}`,
`apps/nexus/nuxt.config.ts`.

Repo cautions: concurrent agents share this tree — verify per-file with
`git show HEAD:path`, never stash/checkout (memory: git-verify-per-file). Build output
dir for `preview:cf` is `dist` per package.json — confirm actual output dir before
grepping HTML.

## Step 0 — Baseline (before any edit) `[gate]`

- [ ] `cd apps/nexus && /usr/bin/time -l pnpm build 2>&1 | tee /tmp/nexus-build-baseline.log`
      Record: wall time, `maximum resident set size`, output dir size (`du -sh`).
- [ ] Positive control for the HTML probe: built `/en/docs/` (non-split root) HTML
      CONTAINS body markup; `/en/docs/dev/components/button/` HTML LACKS `<h2` today.
      Both greps must behave as predicted or the probe itself is broken
      (memory: absence-scan-positive-control).

## Step 1 — Core: initial render carries the body

- [ ] `[...slug].vue`: add per-mount `adoptServerBody = import.meta.server ||
      useNuxtApp().isHydrating`; gate `shouldRequestMetadataOnlyDocBody` on
      `!adoptServerBody && shouldSplitDocBody`. No other call-site changes expected —
      list every reader of `shouldRequestMetadataOnlyDocBody` / body mode first.
- [ ] Confirm `seedFullDocFromCurrentDoc` adopts the hydrated body (no code change
      expected; verify by reading, then in Step 4 by network trace).

## Step 2 — Resilience: retry + error state for SPA-nav body fetch

- [ ] Check `docs-page-client-cache.ts`: rejected requests must not be memoized as
      cache entries; evict pending/failed keys so retry refetches.
- [ ] `loadFullDocForRoute`: bounded retry (2 retries, ~800/2400ms backoff),
      `isStaleDocFetch` re-checked before each attempt.
- [ ] `fullDocError` ref + inline error block with retry button (immediate fetch, no
      idle delay) replacing the skeleton on final failure; cleared on route change.
- [ ] i18n: add error/retry strings to `en.ts` + `zh.ts` (both locales, same keys).

## Step 3 — Tests and static checks `[gate]`

- [ ] Update `docs-page-performance.test.ts` literal assertions to the new contract
      (adoptServerBody gate, retry/error affordances); keep unrelated assertions.
- [ ] `cd apps/nexus && pnpm test` (vitest run) — green.
- [ ] `cd apps/nexus && pnpm typecheck` and `pnpm lint` on touched files — green.
      (Use the package's own commands, not root equivalents — memory:
      verify-with-cis-own-command.)

## Step 4 — Build + runtime verification `[gate]`

- [ ] `/usr/bin/time -l pnpm build 2>&1 | tee /tmp/nexus-build-after.log`; compare
      time/peak-RSS vs Step 0. Build must complete; if it cannot, STOP and switch to
      design.md's Plan B (path-shaped static payloads) — do not force-land.
- [ ] Grep built HTML: `button`, `guide/start`, `/en/docs/`, `/zh/docs/dev`, plus ≥5
      routes across sections contain `<h2`/body text; aliased index copies too
      (materialize-docs-index-aliases output).
- [ ] Serve the build (`pnpm preview:cf`, root `.wrangler` is the live persist dir —
      memory: two-wrangler-state-dirs) and with headless Chrome/CDP
      (memory: nexus-cdp-visual-verification):
      - initial load of a component doc issues NO `/api/docs/page` request;
      - no hydration warnings in console on a demo-heavy component doc;
      - SPA nav to another doc lazy-loads body (request observed, body renders);
      - block `/api/docs/page` → SPA nav shows error state; unblock + retry recovers.

## Step 5 — Finish

- [ ] Spec update (3.3): record the docs rendering contract (initial render embeds
      body; split applies to SPA navs only) where the frontend spec indexes it.
- [ ] Commit via repo convention; stage+commit in one step (memory:
      staged-index-is-shared-state). PR against master.
- [ ] Post-deploy probe (after merge): curl prod component-doc HTML → contains body
      text; re-run the 530-route status sweep — still all 200.

## Execution status — 2026-08-27

Done: Step 0 (baseline + positive control, `research/baseline-build.md`), Step 1 (core
change), Step 2 (retry + error state + i18n, per `research/retry-patch-spec.md` plus a
required correction adding a staleness re-check after the backoff await), Step 3 (tests
updated, 37/37 green, lint clean on all four touched files), Step 4 build gate
(`research/after-build-core-change.md` — exit 0, prerender not slower, file count
unchanged) and the first runtime pass (`verify/RESULTS.md` run 1 — 18 pass / 0 fail).

All acceptance criteria are met. Runtime verification is **20 passed / 0 failed /
0 not-implemented** (`verify/RESULTS.md` run 2), the full nexus suite is **1399/1399**
across 223 files, lint is clean on all four touched files, and the build exits 0 with the
prerender phase unchanged in cost.

Completing C5 surfaced two further defects, both fixed and both documented in
`verify/RESULTS.md`: the harness was blocking the metadata request as well as the body
request, and — once that was narrowed — the page was found showing "Document not found"
for a document that exists, because `startFullDocFetchForRoute` bumped `activeDocFetchId`
from `onMounted` and invalidated the in-flight metadata response. That second one is
pre-existing and was what made the new error state unreachable.

Still not done:
- **Commit (step 3.4)**, deliberately: the working tree carries 300+ dirty paths from
  concurrent work and the staging index is shared state, so the commit is left to the
  maintainer. This task's changes are exactly four files: the docs page, its performance
  test, and both locale files.

### Full-suite failures are a moving target and none of them are ours

Three full runs 40 minutes apart returned three different failure sets, while the suite
grew from 1329 to 1380 tests — other agents are actively adding and editing tests:

| Run | Result | Failing files |
| --- | --- | --- |
| 1 | 4 failed / 1329 | dashboard admin i18n coverage, IntelligenceAdminPanel, i18n-key-existence |
| 2 (I3) | 2 failed / 1299 | i18n-key-existence |
| 3 (final) | 5 failed / 1380 | DashboardNav.routing, docAnalyticsTokenSecret, dashboard/admin/intelligence |

Attribution for the final set: `DashboardNav.routing.test.ts` is untracked at HEAD,
`dashboard/admin/intelligence.test.ts` is ` M`, and `docAnalyticsTokenSecret.test.ts` fails
against an unmodified `docAnalyticsStore.ts` that has never contained the fail-closed throw
the test demands. None of the three read any file this task changed (grepped). Run 1's
i18n failures were separately traced: HEAD's `subscriptions.vue` does not reference
`dashboard.sections.codes.copyFailed` at all, so the missing keys came from someone else's
in-flight edit, not from the three `docs.bodyError*` keys added here.

`docs-page-performance.test.ts`: 37/37 green in every run.

### Assertion quality note

The patch spec's proposed `toMatch(/…[\s\S]*…/)` assertions — the file's house style —
would have passed with the new staleness check deleted, because `[\s\S]*` walks forward to
one of the **7** other `isStaleDocFetch(fetchId, path, locale)` call sites in the same
file. They were rewritten line-scoped, and the negative control was run twice
independently (by I3 and again here): red with the check removed, green with it restored.
Recorded as a reusable lesson in agent memory.

## Rollback points

- Any step: `git revert` the task commit(s) — no data/schema/API surface changes.
- Step 4 build failure: abandon Step 1 mode change is NOT needed — keep client work,
  pivot payload strategy per design.md Plan B (new task if scope grows).
