# Results: static payloads round (items 2–6)

Measured 2026-09-12 on two isolated production builds served by `wrangler pages dev` behind an
HTTP/2 proxy, Chrome with `Network.emulateNetworkConditions` latency 500 ms, cache disabled,
cookies cleared, three cold loads per build in alternating order (medians below).

- **Before**: `d8ffa23bf` (end of the round-trips task, before this one).
- **After**: working tree of this task (R1 static JSON twins, R2 Sentry after mount, R3 icons
  layer after mount, R4 chunk floor, R5 Early Hints, `/api/docs/page/*` in `_routes.json`).

## Component docs page, cold load at 500 ms per hop (HTTP/2)

| `/en/docs/dev/components/button` | Before | After |
|---|---|---|
| DOMContentLoaded | 1065 ms | 1052 ms |
| Hydrated (`$nuxt.isHydrating === false`) | 2719 ms | 2039 ms |
| First demo rendered | 3460 ms | 2517 ms |
| Requests issued before hydration | 99 | 87 |
| JS files before hydration | 64 | 53 |
| Requests, whole load | 102 | 92 |
| `/_i18n` fetches / `/api` calls | 1 / 1 | 1 / 1 |

Hydration moves ~0.7 s earlier and the first demo ~0.9 s earlier at this latency. At the 1–2 s
per hop measured from CN the same round trips are worth 2–4× that.

## What each item changed in the build

| Metric (production build, component docs page `/en/docs/dev/components/button`) | Before (d8ffa23bf) | After |
|---|---|---|
| Render-blocking entry CSS | 380 KB / 68 KB gzip, 226 icon rules | 196 KB / 29 KB gzip, 0 icon rules |
| Icons stylesheet (after mount) | — (inside entry) | 183 KB / 38 KB gzip |
| `modulepreload` tags in the page | 61 | 50 |
| Client JS chunks in `dist/_nuxt` | 1192 | 952 |
| Docs HTML gzip | 26 KB | 26 KB |
| Static docs JSON twins | 0 | 1104 |
| `_routes.json` exclude entries (cap 100) | 63 | 64, including the `/api/docs/page/*` pattern |
| dist size (guard count) | 65.85 MiB | 71.66 MiB (+5.8 MiB of JSON twins) |
| Sentry SDK before mount | yes (awaited in plugin phase) | no (idle after mount) |
| `Link` early-hint header on docs pages | none | entry script + 10 shared sheets, crossorigin |

## Client-side navigation (R1)

Button → Select via the sidebar: 0 requests to `/api/docs/page?path=…`; the page reads the
prerendered `meta` and `body` twins (`/api/docs/page/en/<mode>/dev/components/select.json`),
served `application/json; charset=utf-8` with the docs cache window. Only 36 of the 1 104
twins fit nitro's per-file `_routes.json` list (100-entry cap); the `/api/docs/page/*` exclude
pattern covers the rest and the guard now requires it.

## Early Hints (R5): two things the first attempt got wrong

1. **A second `/en/docs/*` block replaced the first.** Pages keys `_headers` rules by pattern,
   so appending a `Link` block for a pattern nitro had already written dropped the docs
   `cache-control` (guard: `cache-control is ""`). `write-early-hints.mjs` now merges the
   `Link` line into nitro's block; only patterns nitro did not write get their own block.
2. **Hints without `crossorigin` were never matched.** Nuxt renders every stylesheet and script
   tag with `crossorigin`; a preload with a different credentials mode is a separate fetch.
   Chrome logged "A preload for … is found, but is not used because the request credentials
   mode does not match" and downloaded every hinted stylesheet **twice** (10 duplicates on the
   docs page). With `; crossorigin` on every entry: 0 duplicates, 0 warnings.

`wrangler pages dev` does not emit `103` responses, so the hint's own gain (entry CSS fetched
during the HTML round trip) is only measurable after a deploy; the guard checks the header is
present, every target exists, every entry carries `crossorigin`, no line exceeds 2 000 chars,
no pattern repeats, and the rule count stays under 100.

## Style inlining (R4): tried and reverted

`features.inlineStyles` with the chunk floor: 9 of 24 linked sheets were inlined **and** still
linked (tuffex imports its `.css` from inside SFCs through the on-demand style plugin), 78 KB
of duplicated CSS, docs HTML 25 → 35 KB gzip, dist 64.8 → 81.8 MiB, no fewer requests. Only the
chunk floor was kept (1192 → 952 chunks, 61 → 50 preloads, bytes unchanged).

## Guard delta against the control build

Same finding families before and after; the only new lines are the two `i-ri-settings-3-*`
aliased icons now reported as missing from the *icons stylesheet* instead of from the entry
(they are absent from both builds — pre-existing), and the dist size growing by the 5.8 MiB
of JSON twins. Every `docs initial assets` line improves (js assets 28 → 20 on a guide page,
css bytes budgets now pass).

## Not measured here

- Real `103 Early Hints` and the CN round-trip: needs a preview deploy (user confirmation).
- Item 1 (demo hydrate-on-visible) was left out of scope by the user.
