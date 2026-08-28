# Baseline build evidence (before any change)

Command: `/usr/bin/time -l pnpm -C apps/nexus build`
Log: `/tmp/nexus-build-baseline.log`
Tree: `HEAD=242bc7bee`, dirty=303 paths (shared working tree, other agents active),
`[...slug].vue` blob = `579185607a675c280318116a7d955191367f8e23`.

## Metrics

| Metric | Baseline |
| --- | --- |
| Wall clock | 5m50s (06:03:46 → 06:09:36 PDT) |
| Exit code | 0 |
| Prerender | 563 routes in 78.159s |
| Output dir | `apps/nexus/dist` (NOT `.output/public`) |
| dist total | 70 MB, 3139 files, 573 HTML |
| Docs HTML | 560 files, 12,496,539 bytes total (~22.3 KB avg) |

Prerendered doc HTML path shape: `dist/<locale>/docs/<...path>/index.html`
(e.g. `dist/en/docs/dev/components/button/index.html`). Directory aliases exist as
sibling dirs.

## Positive control (proves the probe works AND proves the bug)

`shouldSplitDocsPageBody` exempts `/docs` and `/docs/index`, so the docs root is the one
route that already fetches `body=1` on the server. Predicted: root HTML has body markup,
every other doc route does not. Measured:

| File | bytes | `<h2` count | `__NUXT_DATA__` |
| --- | --- | --- | --- |
| `dist/en/docs/index.html` | 24,768 | **3** | 1 |
| `dist/en/docs/dev/components/button/index.html` | 22,267 | **0** | 1 |
| `dist/en/docs/guide/start/index.html` | 20,838 | **0** | 1 |
| `dist/zh/docs/dev/components/tabs/index.html` | 22,661 | **0** | 1 |

Both halves of the prediction hold. So:

1. The grep probe is not silently broken (root page proves it detects body markup).
2. Body SSR of an MDC doc already works end-to-end in this build — the docs root does it
   today. The change is to extend that to every doc route, not to invent a new path.
3. Every non-root doc page ships an empty shell, matching production.

## Growth budget implication

Docs HTML today: 12.50 MB across 560 files. If body-bearing pages average ~3x the shell
(rendered DOM + inlined `__NUXT_DATA__` copy, since `payloadExtraction` is false),
expect roughly 35-40 MB of docs HTML and a dist around 95-100 MB. Compare against
Cloudflare Pages limits in the R3 findings (file count unchanged at 3139; per-file size
far under 25 MiB).
