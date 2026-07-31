# Debug Nexus end to end

## Goal

Debug Nexus public and unauthenticated flows end to end on the current default-branch
product code, using local synthetic data plus approved deployed public read-only
probes, and produce a redacted report and classified candidate ledger without fixing
product code or mutating production state.

## Background

- Nexus owns docs, public/store/release surfaces, auth shells, Dashboard, provider
  registry, governance, sync, and Cloudflare adapters under `apps/nexus`.
- Real deployed preview, OAuth callback, authenticated Dashboard, and bfcache evidence
  remain owned by #324 and are not available in this task.
- The full Nexus suite baseline is owned by #327. Volar/Vue Router typecheck noise is
  owned by #332. Auth.js/NextAuth runtime advisories are owned by #329.
- Existing runtime evidence intentionally distinguishes local Wrangler, local static,
  and deployed production evidence. Missing deployed evidence is not a new defect.
- The user authorized only local synthetic data and public read-only deployed probes
  against `https://tuff.tagzxia.com`.

## Requirements

### R1. Static and automated coverage

- Map Nuxt routing, SSR/prerender, hydration, locale synchronization, docs/store/release
  APIs, auth middleware, unauthenticated Dashboard boundaries, service/binding
  adapters, PWA, Worker route ownership, and build/evidence guards.
- Run focused route/API/performance/build tests, full Nexus tests, typecheck, route
  tree, production build, Worker bundle analysis, and local runtime evidence guard.
- Classify known full-suite, dependency, and Volar signatures against #327/#329/#332.

### R2. Local API and browser coverage

- Use `dev:pure` for pure Nuxt behavior and a local Cloudflare/Wrangler preview when
  repository bindings can be provided synthetically.
- Exercise representative landing, store, pricing, sign-in, docs index/detail in both
  locales, unauthenticated Dashboard shell, app-auth callback shell, reload, back/
  forward, desktop/mobile layouts, and loading/empty/error states.
- Probe representative public docs/store/releases/auth-session APIs and protected
  Dashboard APIs. Expected unauthenticated 401/redirect behavior is a pass, not a bug.
- Capture console warnings/errors, page exceptions, failed requests, status/schema,
  hydration mismatches, translation-key leaks, horizontal overflow, and route timing.

### R3. Public deployed read-only coverage

- Send only bounded GET/HEAD requests to the canonical public origin with no cookies,
  auth headers, signed download URLs, or mutation methods.
- Verify public route/API status, redirect, cache, and response-shape behavior without
  claiming Cloudflare preview, OAuth, authenticated Dashboard, bfcache, D1, or R2
  acceptance.
- Stop immediately if an endpoint requires credentials or would create/update/delete
  state.

### R4. Candidate confirmation and deliverables

- Reproduce each candidate twice or pair local runtime evidence with a focused
  executable contract and exact source path.
- Write `research/report.md` with environment, command matrix, API/browser results,
  blockers, and redacted evidence references.
- Write `research/candidates.md` with expected/actual, reproduction, impact, root
  cause, severity, duplicate search, and classification.

## Acceptance Criteria

- [ ] Exact baseline, scoped pre-run worktree status/diff, local modes, synthetic
  bindings, ports, browser version, and disposable profile are recorded.
- [ ] Focused/full tests, typecheck, route tree, production build, Worker analysis,
  and runtime-evidence guard have recorded outcomes.
- [ ] Representative public and unauthenticated routes/APIs pass through static,
  local runtime, browser, and approved read-only checks where supported.
- [ ] Desktop/mobile, both docs locales, reload/back-forward, hydration, console,
  network, overflow, and auth-boundary outcomes are recorded.
- [ ] Known #324/#327/#329/#332 failures are linked rather than republished.
- [ ] Every new candidate is repeatable, independently actionable, source-anchored,
  severity-ranked, and deduplicated.
- [ ] No token, cookie, auth state, signed query, private path, or production write
  appears in durable evidence.
- [ ] Product source remains unchanged; only task research/evidence artifacts are
  added.

## Out of Scope

- Product fixes or test expectation changes.
- Real OAuth, authenticated Dashboard, bfcache completion, production D1/R2, deploys,
  or mutation requests.
- Exhaustively walking every admin page or every TuffEx component document.
- Treating local/static evidence as deployed production completion.
