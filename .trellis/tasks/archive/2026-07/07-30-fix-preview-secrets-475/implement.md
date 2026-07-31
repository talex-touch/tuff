# Implementation Plan — Preview Secret Configuration #475

## RED

- [x] Add deterministic tests for deployable Preview configuration, required Secret inventory, fail-closed missing names, and redacted output.
- [x] Add runtime tests rejecting missing, short, documented placeholder, and local-only values outside development.

## GREEN

- [x] Remove credential values from `wrangler.toml` Preview vars.
- [x] Add a shared Preview Secret inventory and Cloudflare inventory preflight.
- [x] Wire the deploy command through the preflight before build/deploy.
- [x] Add non-local runtime credential validation at the earliest server boundary.
- [x] Update README/SETUP with name-only Cloudflare Secret provisioning and verification.

## REFACTOR / VERIFY

- [x] Reuse one placeholder policy across preflight/runtime where feasible.
- [x] Run focused tests, Nexus typecheck, scoped lint, deterministic config scan, and `git diff --check`.
- [x] Query Cloudflare Preview Secret names read-only; run remote smoke only if existing inventory and access permit.
- [x] Independent review reports no open P0/P1/P2.

## Guardrails

- Never print, store, compare remotely, or request Secret values through Wrangler APIs.
- Do not write Cloudflare Secrets or deploy without explicit approval.
- Do not modify unrelated dirty files.
- No new dependency.

## Evidence

- Focused Preview/runtime/auth/emergency verification: 28 files, 134 tests passed; dedicated preflight/deploy suite 19/19 passed.
- Nexus typecheck, scoped ESLint/Prettier, four Node syntax checks, deterministic config scan, and `git diff --check` passed.
- `NUXT_DISABLE_PRERENDER=true pnpm -C apps/nexus run build` produced the Cloudflare Worker; standard build remains blocked by 22 pre-existing docs parent-route 404s.
- Cloudflare Pages Preview inventory passed with four required `secret_text` bindings and no credential-bearing `plain_text` bindings.
- Remote deployment `53cdd14c-7a5d-402f-876d-584157f200bd` targets environment `Preview`, branch `preview`, URL `https://53cdd14c.tuff-dso.pages.dev`, alias `https://preview.tuff-dso.pages.dev`.
- Remote smoke: home and NextAuth session returned 200; invalid app bearer returned 401; disabled emergency init returned fail-closed 404; no runtime credential error was exposed.
- Final independent review: P0=0, P1=0, P2=0.
