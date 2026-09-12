# Nexus performance: prod round trips, dev source consumption, content HMR

## Goal

Make the Nexus docs site, and component pages in particular, materially faster in the two places where the 2026-09-11 measurement showed the time actually goes: the production request chain before the first demo renders, and the local dev loop on component pages.

## Source measurement (2026-09-11)

Production (`tuff.tagzxia.com`, Cloudflare Pages, reader in CN routed to LAX; ~1–2 s per round trip):

| Metric (component page `/en/docs/dev/components/button`) | Cold cache | Warm cache |
|---|---|---|
| 308 trailing-slash redirect | 1.8 s | – |
| FCP | 14.6 s | ~5 s |
| Hydration complete | ~44 s | ~7 s |
| First demo rendered | 45.4 s | 7.2 s |
| Long tasks total | 0.61 s | 0.70 s |

JS execution is not the bottleneck. Serial round trips are: redirect → HTML → i18n messages (blocks hydration, fetched twice) → docs navigation (fetched twice) → auth session (worker) → demo renderer chunk → demo registry chunk → demo chunk. Prerendered HTML, docs JSON and i18n messages are all served `max-age=0, must-revalidate` and show `cf-cache-status: DYNAMIC`.

Dev (`pnpm dev`, this machine):

| Metric | Value |
|---|---|
| Cold first component page | 27 s (1670 Vite transforms) |
| Full browser load of a component page | 250 requests / 7.4 MB / 75 CSS |
| `__uno.css` | 865 KB–1.3 MB, re-pushed on every SFC edit |
| Late `optimizeDeps` discovery | full page reload mid-session (shiki, @better-scroll/*, dompurify) |
| HMR under `app/components/content/**` | no client update in 30 s (sibling dirs: 50–83 ms) |

## Child task map

| Child | Deliverable | Verifies independently by |
|---|---|---|
| `09-11-nexus-perf-prod-roundtrips` | Fewer serial round trips + cacheable docs assets in the production build | Unit tests on the changed handlers/components, `pnpm -C apps/nexus run build` + `check:api-routes`, inspection of `dist/_headers`, `_routes.json`, prerendered HTML |
| `09-11-nexus-perf-dev-source` | Dev consumes tuffex `dist` unless opted into source; late deps pre-optimized | Dev boot with both modes, transform counts from `DEBUG=vite:transform`, no "optimized dependencies changed" reload on a component page |
| `09-11-nexus-perf-content-hmr` | Root cause + fix for silent HMR under `app/components/content/**` | Edit probe: a template edit in a demo reaches the browser without manual reload |

Ordering: the three children are independent. `dev-source` and `content-hmr` both touch dev boot; land `dev-source` first so `content-hmr` is probed against the final dev configuration.

## Requirements

- Every change must be measurable against the baseline above; each child records before/after numbers in its own `prd.md` or a `research/` note.
- No change may alter what a docs page renders or its SEO head (canonical, alternate, JSON-LD) except the trailing-slash form of prerendered docs URLs, which must stay self-consistent (links, canonical, sitemap-free) across the site.
- Prerendered content must remain readable from its own HTML (`.trellis/spec/frontend/nexus-docs-rendering-contract.md`).
- Dev changes must keep the "edit a tuffex component and see it in Nexus" workflow available behind an explicit opt-in.

## Cross-child acceptance criteria

- [ ] `pnpm -C apps/nexus run test` passes.
- [ ] `pnpm -C apps/nexus run typecheck` passes.
- [ ] `pnpm -C apps/nexus run build` succeeds and `check:api-routes` + `build:analyze-worker` still pass.
- [ ] A component docs page in a real browser against the local production build (`nuxt preview` or `wrangler pages dev`) mounts its first demo with fewer serial requests than the baseline chain listed above.
- [ ] Dev: cold first component page and full-load request count are lower than the baseline; a demo template edit hot-updates.

## Notes

- Network placement (CN → LAX) is outside this task; only the number of round trips and their cacheability are in scope.
- The machine used for the baseline was swapping (20.8/22.5 GB) with two dev servers running; re-measure from a clean state before comparing dev numbers.
