# Verification — 2026-09-24 (isolated worktree build at HEAD 8446e512c + this task's diff)

Build: `/tmp/nexus-build-wt` (detached worktree, per-entry `node_modules` symlinks with a private
`.cache`, `packages/tuffex/dist` and `.data` copied). Command: `node node_modules/nuxt/bin/nuxt.mjs
build` + the five post-build steps from `package.json`. Exit 0; prerendered 2332 routes in 48.9 s
(`/__not-found` 4.2 s, no error). Log: `/tmp/nexus-build-after.log`.

## Artifacts

| Item | Result |
| --- | --- |
| `dist/404.html` | 9,027 B, `<title>Page not found · Tuff Nexus</title>`, `robots: noindex, nofollow`, `#__nuxt` populated, `aria-label="404"` present; `dist/__not-found.html` removed |
| `dist/_redirects` | `/docs /en/docs 308` · `/terms /license 307` · `/docs/* /en/docs/:splat 308` (the first build also carried `/* /404.html 404`; removed after review, see below) |
| `dist/_routes.json` | 70 excludes; contains `/docs`, `/docs/*`, `/__not-found` |
| `dist/_headers` | 27 rules; blocks for `/en/docs` and `/zh/docs` present |

## Gate (`node build/check-worker-bundle.mjs`)

New/changed checks all pass: `Static route exclusions verified: 32 routes + 3 patterns + 2 markdown
roots + 2 redirect sources` (the baseline's "Missing static route exclusions" finding is gone — the
check now honours `/en/docs/*` patterns), `Static cache headers 10/10` (was 8/8), `Static redirects
2/2`, `Static 404 fallback 1/1`, `Early hint 14/14`, `_headers 27 rules`.

Exit code stays 1 on pre-existing families; per-section counts baseline → now: client chunk 4 → 4,
docs detail HTML payload 580 → 590, docs initial lifecycle 8 → 10, page initial asset budgets
590 → 600, shared entry CSS 16 → 16, size 1 → 1. The +10 in the per-page families equals the +10
docs pages that landed on master since the 2026-09-21 baseline build (580 → 590 docs detail
routes); for pages present in both builds the findings are byte-for-byte the same category and
within 0.5 KiB (e.g. `en/docs/guide/tips.html`: `js assets 23 > 16, css assets 10 > 7` in both).

## Local acceptance (`wrangler pages dev dist`, `/tmp/nexus-verify.sh`)

| Request | Result |
| --- | --- |
| `/docs` | 308 → `/en/docs`, body 0 B (Pages static layer, not the Worker) |
| `/docs/dev` | 308 → `/en/docs/dev` |
| `/docs/dev/components/button.md` | 308 → `/en/docs/dev/components/button.md` (suffix kept) |
| `/docs/dev/api/box.en.md` | 308 → `/en/docs/dev/api/box.en.md` (documented divergence: splat does not normalise) |
| `/en/docs/nope` | **404**, 9,027 B, the rendered not-found page (was: landing page, 200) |
| `/en/docs/dev/components/button` | 200, 244,323 B, 9 `<h2>`, docs cache window |
| `/en/docs`, `/zh/docs` | 200 with `cache-control: public, max-age=300, s-maxage=3600, …` (was Pages default) |
| `/this-does-not-exist` | 404 from the Worker (unchanged) |
| `/api/docs/navigation/en/all` | 200, `application/json`, docs cache window |

Two facts learned on the way, both now guarded:

1. A literal `/404.html` prerender comes out of Nuxt as a no-SSR shell (3.6 KB, empty `#__nuxt`,
   no title). Hence the private `/__not-found` route + `materialize-not-found.mjs`, and
   `checkStaticFallback()` rejecting an empty shell.
2. With `/docs/*` still in the Worker's share, wrangler answered `/docs/dev/api/box.en.md` with the
   middleware's normalised target — proof the `_redirects` rules never ran. Hence `/docs` and
   `/docs/*` in `cloudflare.pages.routes.exclude`, and `checkRoutes()` asserting both.

## Edge-cache probe, before the Cache Rule

`pnpm -C apps/nexus probe:docs-edge-cache -- --label before` →
`output/evidence/docs-edge-cache-2026-09-24-before.json`: 0/28 second requests served from the
edge cache (all `DYNAMIC`, colo HKG), control `/_nuxt/r34uyRku.js` MISS → HIT; static-HTML ttfb
p50 82 ms from this network at that hour (the earlier session saw 0.26–3.2 s of server wait on the
same URLs — the variance is the point). Re-run with `--label after` once the rule exists.

## Tests / static checks (main checkout)

`vitest run` on the 7 touched test files: 74 passed. Full `pnpm exec vitest run` (259 files, 1922
tests) passed before the final not-found rework; the reworked files re-ran green. `nuxt typecheck`
via `pnpm run typecheck`: exit 0. eslint on every touched file: 0 errors. `git diff --check`: clean.

## Correction after trellis-check (2026-09-24, later the same morning)

The reviewer showed, with a wrangler 4.107 fixture, that `/* /404.html 404` is an invalid
`_redirects` rule: Pages accepts only 200/301/302/303/307/308 and logs
`Found 1 invalid redirect rule … Got 404` before dropping the line; with or without it every probe
above answers identically, because the top-level `404.html` is served natively. Changes: the
writer no longer appends a fallback and now drops any line with a status Pages rejects;
`checkStaticFallback()` asserts only the three real properties of `404.html` (present, not a
shell, rendered hero); `checkStaticRedirects()` gained a finding for invalid-status lines;
`materialize-not-found.mjs` became re-runnable; the dead `.html` branch in `routeToDistPath`
was removed. Re-verified on the same worktree `dist` by re-running the post-build chain, the
gate and `/tmp/nexus-verify.sh` (results appended below by the session).

### Re-verification after the correction (same `dist`, 07:41–07:43)

- `node build/materialize-not-found.mjs` → `verified existing 404.html from /__not-found (9027 bytes)`;
  `node build/write-static-redirects.mjs` → `_redirects` is now exactly `/docs /en/docs 308`,
  `/terms /license 307`, `/docs/* /en/docs/:splat 308`.
- Gate: `Static route exclusions verified: 32 routes + 3 patterns + 2 markdown roots + 2 redirect
  sources`, `Static cache headers 10/10`, `Static redirects 2/2`, `Static 404 fallback 1/1`; no
  `_redirects` / 404 / routes findings; the pre-existing families unchanged.
- `/tmp/nexus-verify.sh`: identical answers to the table above (`/docs*` 308 with 0-byte bodies,
  `/en/docs/nope` 404 with the rendered page, button page 200 with 9 `<h2>`), and
  `/tmp/nexus-wrangler.log` contains no `invalid redirect rule` warning.
- Tests: 7 files / 77 passed; eslint 0 errors on touched files; `git diff --check` clean.

## Production (2026-09-24 09:32, merge eeff74b4d via PR #1957, Pages deployment 80b95775)

Preview deployment of the branch (`a51c44a7.tuff-dso.pages.dev`) answered identically before the
merge. Production, from the workstation (colo SJC):

| Request | Result |
| --- | --- |
| `/docs`, `/docs/dev`, `/docs/dev/components/button.md`, `/docs/dev/api/box.en.md` | 308 from the static layer (0-byte bodies), targets as designed; ttfb 0.7–0.9 s after the first connection (the Worker path measured 3–5 s on 2026-09-23) |
| `/en/docs/nope` | **404**, 9,027 B, `<title>Page not found · Tuff Nexus</title>`, hero present (was: landing page, 200) |
| `/en/docs/dev/components/button` | 200, 244,323 B, 9 `<h2>`, docs cache window |
| `/en/docs`, `/zh/docs` | 200, `cache-control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400` (was Pages default) |
| `/this-does-not-exist` | 404 from the Worker (unchanged) |
| `cf-cache-status` | still `DYNAMIC` on every docs response — expected until the zone Cache Rule exists (R4) |

Landing path: direct pushes to `master` are rejected by branch protection (7 required checks), so the
three commits were cherry-picked onto `origin/master` as `nexus/static-delivery-closeout` and merged
with a merge commit once the checks passed. The first attempt (#1956, the whole local master) failed
on two other sessions' commits (core-app typecheck in `nexus-route-marker-ownership.test.ts`,
tuff-voice `perfectionist/sort-imports`) and on this task's own `DOC-TASK-META` (an `in_progress`
task needs non-empty `meta.nextAction/blocker/evidence`), which is fixed in the merged commit.

## Cache Rule (R4), 2026-09-24 ~09:50

Created in the dashboard through ego (the wrangler OAuth token has `zone:read` only): rule
"nexus docs static (HTML/JSON/i18n, 5 min edge TTL)", custom expression over `tuff.tagzxia.com`
for `/en/docs*`, `/zh/docs*`, `/api/docs/page/*`, `/api/docs/navigation/*`, `/api/docs/search/*`,
`/api/docs/sidebar-components/*`, `/api/docs/component-sync`, `/_i18n/*`; cache eligible; Edge TTL
"ignore cache-control, 300 s"; Browser TTL "respect origin". Zone plan: Free — the rule took.

`probe:docs-edge-cache --label after` (`output/evidence/docs-edge-cache-2026-09-24-after.json`):
**28/28** second requests `HIT` (before: 0/28 `DYNAMIC`); control asset MISS → HIT; three manual
repeat requests to the button page answered `HIT` with `age` 19 → 22 → 26. Decision: keep.
`DOCS_STATIC_CACHE_CONTROL` lowered to `public, max-age=300, s-maxage=300` (no SWR) so `_headers`
matches the rule; this ships in the follow-up PR.

## Cache-window alignment (PR #1958), 2026-09-24 10:48–11:18

Merged as `6cfe5c923` (merge commit; auto-merge waited on the Pages preview check and on a
CodeRabbit thread about the documented 2-hour minimum Edge Cache TTL on Free — answered with the
live evidence: entries `EXPIRED`/`REVALIDATED` within the hour, so the 5-minute override is
honoured; fallback recorded in the spec). The first production build failed inside Cloudflare's
build image (`node-build: definition not found: 26.0.0`, the plugin's git pull of node-build
definitions failed with `could not read Username for 'https://github.com'`) — infrastructure, not
code; the retry via `POST …/deployments/<id>/retry` (deployment `a6f8067f`) built and deployed.
Fresh-origin responses (`?v=<ts>` cache-busting) now carry
`cache-control: public, max-age=300, s-maxage=300` on docs HTML and JSON.
