# Nexus prod: static docs JSON, Sentry off hydration, icon CSS split, chunk/style inlining, Early Hints

Child of `09-11-nexus-perf`. Follows `09-11-nexus-perf-prod-roundtrips` (committed 2026-09-11,
`719ceb9c5..d8ffa23bf`), whose measurements are the baseline here.

## Goal

Remove the next set of serial round trips a reader pays on Nexus docs pages, in the order the
user asked for: (2) page-to-page navigation no longer hits the Worker, (3) Sentry no longer sits
between DOMContentLoaded and hydration, (4) icon SVGs leave the render-blocking shared CSS, (5)
tiny chunks and tiny stylesheets stop costing a request each, (6) the entry JS/CSS is announced
by Early Hints before the HTML arrives.

Docs pages are already pure SSG (`_routes.json` excludes `/en/docs/*` and `/zh/docs/*` from the
Worker); nothing here adds a runtime render. The only Worker request left on the docs path is the
one item R1 removes.

## Requirements

### R1 — Client-side docs navigation reads static JSON
Every client-side fetch of a docs document (SPA navigation, hover/focus prefetch, body streaming
after a metadata-only navigation) reads a prerendered file under a path-shaped route with no
query string, so it is a static asset on Pages and never a Worker request. The dynamic
`/api/docs/page?path=…` handler stays as the fallback for dev, for routes not on the prerender
list, and for a failed static read. Prerendered docs JSON carries the same `_headers` cache window
and `application/json` content type as the other docs JSON.

### R2 — Sentry initialises after mount
The client Sentry SDK is not awaited before the app mounts. Errors thrown before it is ready are
still delivered (buffered and flushed once the SDK is up). Server-side Sentry is untouched.
`NUXT_DISABLE_SENTRY` / `NUXT_ENABLE_SENTRY` semantics are unchanged.

### R3 — Icon SVGs leave the shared entry CSS
The UnoCSS icons layer is emitted as its own stylesheet, loaded non-render-blocking, so the
shared entry CSS no longer carries ~184 KB raw / 38 KB gz of inline SVG on every page. Icons must
not flash from empty to drawn on SSR pages in a way that shifts layout (they are sized boxes).
Landing-only `i-logos-*` glyphs (11 KB gz) must not ship on docs pages at all.

### R4 — Fewer, larger chunks and inlined small styles
Chunks under a size floor are merged by Rollup; `.vue` component styles below a gzip threshold are
inlined into the SSR HTML instead of linked, without the whole entry CSS or the UnoCSS output
being inlined (they stay linked so the browser can cache them across pages).

### R5 — Early Hints for the entry assets
The post-build step writes, for every prerendered HTML route family, a `Link` header carrying
`rel=modulepreload` for the entry script and `rel=preload; as=style` for the entry stylesheet and
the route family's layout stylesheet, so Cloudflare Pages emits them as `103 Early Hints`. The
file names are read from the built HTML, never hard-coded.

## Constraints

- Prerendered pages must keep embedding the body (`nexus-docs-rendering-contract.md`); R1 changes
  only what the *client* fetches on navigation.
- The reverted query-string prerender (`af99441e0`, reverted in `88df316b7`) must not be
  reintroduced; static routes must be path-shaped.
- `check:api-routes`, `build:analyze-worker` (its pre-existing findings excepted) and the
  deployed-evidence budget for `docs-tabs` (`maxDocs: 1`) must be updated in the same change.
- No change to what a page renders or to SEO head output.

## Acceptance Criteria

- [ ] SPA navigation between two component pages in a real browser issues zero `/api/docs/page`
      requests; the body arrives from `/…/<route>.json` with `cf-cache-status`-eligible headers
      (`wrangler pages dev`: `content-type: application/json`, docs `cache-control`).
- [ ] The first client request after DOMContentLoaded on a docs page is no longer the Sentry
      config chunk; an error thrown before Sentry initialises is still captured (unit test on the
      buffering plugin).
- [ ] Shared entry CSS gzip drops by ≥ 30 KB versus the `09-11-nexus-perf-prod-roundtrips`
      build (68 KB gz); docs HTML contains no `i-logos-*` rule; landing HTML still renders logos.
- [ ] Docs page preload list shrinks below 40 entries and the stylesheet list below 15 with the
      byte budgets unchanged or lower.
- [ ] `dist/_headers` carries a `Link` block for `/en/docs/*`, `/zh/docs/*` and the public
      routes whose targets exist in `dist/_nuxt/`; the worker-bundle guard verifies the targets.
- [ ] `pnpm -C apps/nexus run test`, `typecheck`, `build`, `check:api-routes` pass;
      `build:analyze-worker` reports no finding that HEAD does not already report.

## Out of scope

- Demo SSR / `hydrate-on-visible` (item 1 of the follow-up list) — separate task.
- Deploying to preview and re-measuring from CN — needs the user's Cloudflare confirmation.
