# After-build evidence — core change only (retry/error state not yet written)

Change under test: `[...slug].vue` no longer requests metadata-only bodies for rendering.
`shouldRequestMetadataOnlyDocBody` / `currentDocsPageBodyMode` deleted; replaced by
`const DOCS_PAGE_RENDER_BODY_MODE = '1'` feeding both the fetch key and the query.

Log: `/tmp/nexus-build-after.log`. Exit 0.

## Build gate: PASSED

| Metric | Baseline | After | Delta |
| --- | --- | --- | --- |
| Exit code | 0 | 0 | — |
| Prerender | 563 routes / 78.159s | 563 routes / **68.477s** | −12% |
| dist total | 70 MB | 83 MB | +18.6% |
| dist file count | 3139 | **3139** | unchanged |
| HTML files | 573 | 573 | unchanged |
| Docs HTML bytes | 12,496,539 | 26,149,603 | 2.09x |

Wall-clock totals are NOT comparable between the two runs: six subagents were competing
for CPU during the second build (client bundling alone went 56s → 171s, and that phase
is untouched by this change). The prerender phase — the one this change actually loads —
came out faster, so the feared prerender blow-up does not exist. File count is identical,
which is the Cloudflare Pages limit that actually bites (20,000 files); per-file size is
orders of magnitude under the 25 MiB cap.

## Body now in the HTML: CONFIRMED

| Page | Before | After |
| --- | --- | --- |
| `en/docs/dev/components/button` | 22,267 B, **0** `<h2>` | 222,867 B, **9** `<h2>` |
| `en/docs/guide/start` | 20,838 B, **0** | 28,464 B, **6** |
| `zh/docs/dev/components/tabs` | 22,661 B, **0** | 92,293 B, **7** |
| `en/docs` (control, already body=1) | 24,768 B, 3 | 24,768 B, 3 — **byte-identical** |

The control staying byte-identical is the useful part: the change affects exactly the
routes that were broken and nothing else.

## Page weight: the real cost, and why it is acceptable

Raw HTML across 560 docs pages: min 21 KB, p50 41 KB, p90 70 KB, p99 164 KB, max 218 KB.

The max page (`components/button`) compresses to **20.5 KB gzip / 14.9 KB brotli**, which
is what Cloudflare actually serves. Compare with the flow it replaces on that same page:
a 22 KB shell plus a separate ~18.8 KB JSON body fetch, over TWO round trips. Measured
round-trip cost from the reporting user's network was 1.4–5s each, with intermittent
resets. So the change trades a few KB of transfer for eliminating a round trip whose
failure mode was a permanently blank page.

Page weight is the one axis that got worse, and it is bounded and compressible. If it
ever becomes a problem the follow-up is to stop double-encoding the body (it currently
ships as rendered DOM *and* as JSON in `__NUXT_DATA__`, because hydration needs the
data) — recorded as out of scope in the PRD.
