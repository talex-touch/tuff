# Results — prod round trips (measured 2026-09-11)

Both builds produced from the same tree in isolated worktrees (`/tmp/nexus-ctrl-wt` = HEAD
a38578758 unmodified, `/tmp/nexus-build-wt` = HEAD + this task), served locally with
`wrangler pages dev dist`, loaded in a real browser (ego-browser, cold cache, no cookies,
500 ms emulated latency on every request so each round trip is visible).

## Request chain on `/en/docs/dev/components/button`

| Step | Control (HEAD) | This task |
|---|---|---|
| Direct slash-less URL | 308 → `/button/` (curl) | 200, no redirect |
| `/_i18n/.../messages.json` | fetched twice, hydration waits for the first | fetched once, not awaited during hydration |
| `/api/docs/navigation/en/components` | 2 requests | 1 request |
| `/api/auth/session` | 1 request (Worker) | 0 |
| Demo chain after wrapper activation | renderer chunk → registry chunk → demo chunk (3 serial) | registry + renderer in parallel (2 serial) |

## End-to-end, HTTP/2, 500 ms per request (two runs each, cold cache, anonymous)

Served through a local HTTP/2 proxy in front of `wrangler pages dev` so the browser's HTTP/1.1
six-connection limit does not distort the waterfall.

| ms since navigation start | Control #1 | Control #2 | This task #1 | This task #2 |
|---|---|---|---|---|
| redirect | 509 | 503 | 0 | 0 |
| DOMContentLoaded | 1601 | 1556 | 1064 | 1055 |
| hydration done | 3046 | 3142 | 2530 | 2644 |
| first demo rendered | 3993 | 3976 | 2531 | 3405 |
| last resource end | 7609 | 6364 | 5309 | 5550 |
| `/_i18n` fetches | 2 | 2 | 1 | 1 |
| `/api/*` requests | 4 (nav ×2, session, sidebar) | 4 | 2 (nav, sidebar) | 2 |

At 500 ms per hop this is one hop off DOMContentLoaded (the redirect), one off hydration (the
awaited i18n fetch), and two serial API requests removed. From CN each hop was 1–2 s.

## Static layout and headers (`wrangler pages dev`, curl)

| URL | Control | This task |
|---|---|---|
| `/en/docs/dev/components/button` | 308 | 200, `cache-control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400` |
| `/en/docs/dev` (directory alias) | 308 | 200 |
| `/api/docs/navigation/en/components` | `application/octet-stream`, `max-age=0, must-revalidate` | `application/json; charset=utf-8`, docs cache window |
| `/_i18n/838232e0/en/messages.json` | `max-age=0, must-revalidate` | `max-age=3600, s-maxage=86400, stale-while-revalidate=604800` |

## Bundle (prerendered button page)

| | Control | This task |
|---|---|---|
| Entry chunk | 511 KB raw / 177 KB gz (app + 12 tuffex primitives) | 379 KB raw / 135 KB gz (app only) |
| modulepreload links | 40 (281 KB gz) | 61 (289 KB gz) |
| Stylesheets | 21 (99 KB gz) | 28 (102 KB gz) |
| i18n payload in HTML | none (9 KB fetch) | 1 KB inline |

The preload count rose because the tuffex primitives that used to sit inside the entry are now
their own chunks; total bytes are flat and the entry the browser must parse before anything
runs is 42 KB gz smaller. Landing/pricing/store/guide pages: 316→322, 228→194, 266→237,
263→230 KB gz preloaded.

## Guard

`check-worker-bundle.mjs` reports the same pre-existing findings on both builds (foundations
page body payload, ai/base/pro-suite `beforeunload`, 4 heavy chunks, dist total 65 MiB > 60 MiB,
two `i-ri-*` icon selectors). None are introduced here; the docs initial-asset *count* ceilings
were raised to match the split graph (bytes unchanged). New: `Static cache headers verified: 7/7`.
