# Baseline — before this task's changes

Source: `apps/nexus/dist` built 2026-09-21 14:07 from the then-HEAD (the last production-layout
build on this machine), plus the 2026-09-23 production probes recorded in
`../09-23-nexus-docs-perf-cms-remediation/research/audit-2026-09-23.md`.

| Item | Baseline |
| --- | --- |
| `dist/404.html` | absent |
| `dist/_redirects` | `/terms\t/license\t307` (one line) |
| `dist/_routes.json` exclude entries | 76 (cap 100) |
| `dist/_headers` rules | 25; docs blocks `/en/docs/*`, `/zh/docs/*`; no `/en/docs`, `/zh/docs` |
| `node build/check-worker-bundle.mjs` | exit 1 — pre-existing findings: docs/public initial-asset budgets, shared entry CSS icon budgets, 4 client chunks > 585.9 KiB, dist total 76.80 MiB > 60 MiB, and `Missing static route exclusions: /en/docs/dev, …` (the check matched exact entries only, so routes covered by the `/en/docs/*` pattern were reported missing on every build) |
| Production `/en/docs/<unknown>` | 200, `index.html` body (SPA fallback) |
| Production `/docs`, `/docs/**` | 308 from the Worker middleware, 3–5 s TTFB from CN |
| Production `/en/docs` (root) | `cache-control: public, max-age=0, must-revalidate` |
| Production docs HTML / JSON / `.md` / `_i18n` | `cf-cache-status: DYNAMIC` on repeat requests; `/_nuxt/*` MISS → HIT |

Gate output captured before the change: `/tmp/nexus-gate.log` (2026-09-23 session).
