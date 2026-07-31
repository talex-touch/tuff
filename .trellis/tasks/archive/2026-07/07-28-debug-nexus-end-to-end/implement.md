# Implementation Plan: Nexus end-to-end debugging

## 1. Baseline and inventory

- [x] Fetch `origin/master`; record commit, host, Node/pnpm, Nexus version, browser,
      and product-path parity.
- [x] Read parent research, Nexus AGENTS/specs, `TODO-nexus.md`, README runtime
      boundaries, and Issues #324/#327/#329/#332.
- [x] Capture scoped pre-run `git status --short` and product/task-path diffs so
      unrelated user changes are never attributed to this task.
- [x] Map route families, public/protected APIs, middleware, binding adapters, build
      guards, and evidence ownership into the initial candidate ledger.

## 2. Focused contract pass

```bash
corepack pnpm -C apps/nexus exec vitest run \
  build/check-worker-bundle.test.ts \
  build/docs-prerender-routes.test.ts \
  app/pages/docs/docs-page-performance.test.ts \
  app/pages/store-page-performance.test.ts \
  test/api/docs \
  test/api/store \
  test/api/releases \
  test/api/auth \
  test/api/dashboard/auth
```

- [x] Add focused files only when the mapped flow reaches them.
- [x] Record source guard drift separately from runtime behavior regressions.
- [x] Use task-local or `/tmp` diagnostics only; do not edit product tests.

## 3. Automated gates

```bash
corepack pnpm -C apps/nexus test
corepack pnpm -C apps/nexus test
corepack pnpm -C apps/nexus run typecheck
corepack pnpm -C apps/nexus run check:api-routes
corepack pnpm -C apps/nexus run build
corepack pnpm -C apps/nexus run build:analyze-worker
corepack pnpm -C apps/nexus run check:runtime-evidence
corepack pnpm -C apps/nexus run check:runtime-evidence:template
env -u NEXUS_DEPLOYED_PREVIEW_URL \
  -u NEXUS_DEPLOYED_AUTH_STATE \
  -u NEXUS_DEPLOYED_PROVIDER_CALLBACK_EVIDENCE \
  node apps/nexus/scripts/collect-deployed-preview-evidence.mjs --dry-run
```

- [x] Map full-suite failures to #327, dependency findings to #329, and Volar
      resolution messages to #332.
- [x] Treat the evidence checker/template/dry-run as guard validation, not deployed
      proof. Do not run `--require-deployed-preview` as a completion claim.

## 4. Pure Nuxt runtime and browser

- [x] Create `/tmp/tuff-nexus-debug-<run>/{profile,evidence}` and select free loopback
      ports.
- [x] Start `corepack pnpm -C apps/nexus run dev:pure` when port 3200 is free;
      otherwise invoke Nuxt through the package executor with
      `--host 127.0.0.1 --port <selected-port>` under supervision.
- [x] Launch Chromium with a fresh profile and CDP; exercise desktop `1440x900` and
      mobile `390x844` for landing, store, pricing, updates, sign-in, both docs locales,
      unauthenticated Dashboard, and app-auth callback shell.
- [x] For each route capture status, title/H1, locale, console/page errors, failed
      requests, translation-key leak, horizontal overflow, loading/error state, reload,
      and back/forward outcome.
- [x] Probe representative public APIs and verify protected APIs fail with canonical
      unauthenticated status/reason.

## 5. Local Cloudflare mode

- [x] If repository-local synthetic bindings are available, start local Wrangler
      preview without remote mode and repeat docs full-body, release/store, auth shell,
      Dashboard 401, and representative route probes.
- [x] If bindings are missing, record exact environment blockers; do not invent
      fallback success or use production credentials.

## 6. Approved deployed read-only checks

- [x] Use bounded no-cookie GET/HEAD requests against
      `https://tuff.tagzxia.com` for representative public routes and APIs only.
- [x] Record status, redirects, cache headers, response content type/size, and bounded
      schema checks. Strip signed query values and request IDs from durable output.
- [x] Send no POST/PATCH/PUT/DELETE and stop at any authentication boundary.

## 7. Candidate closure

- [x] Reproduce each candidate twice or pair browser/runtime evidence with a focused
      executable contract.
- [x] Search open/closed Issues, tasks/audits, blame, and recent commits by acceptance
      boundary.
- [x] Write `research/report.md` and `research/candidates.md` and classify every
      observation.

## 8. Child validation

```bash
git diff --check -- .trellis/tasks/07-28-debug-nexus-end-to-end
python3 ./.trellis/scripts/task.py validate 07-28-debug-nexus-end-to-end
git status --short
```

Verify scoped product/task diffs contain only this child's planned research,
unrelated worktree changes are unchanged, and no Nuxt/Wrangler/Chrome process or
temporary browser profile remains.
