# Implementation Plan — Preview Secret Configuration #475

## RED

- [ ] Add deterministic tests for deployable Preview configuration, required Secret inventory, fail-closed missing names, and redacted output.
- [ ] Add runtime tests rejecting missing, short, documented placeholder, and local-only values outside development.

## GREEN

- [ ] Remove credential values from `wrangler.toml` Preview vars.
- [ ] Add a shared Preview Secret inventory and Cloudflare inventory preflight.
- [ ] Wire the deploy command through the preflight before build/deploy.
- [ ] Add non-local runtime credential validation at the earliest server boundary.
- [ ] Update README/SETUP with name-only Cloudflare Secret provisioning and verification.

## REFACTOR / VERIFY

- [ ] Reuse one placeholder policy across preflight/runtime where feasible.
- [ ] Run focused tests, Nexus typecheck, scoped lint, deterministic config scan, and `git diff --check`.
- [ ] Query Cloudflare Preview Secret names read-only; run remote smoke only if existing inventory and access permit.
- [ ] Independent review reports no open P0/P1/P2.

## Guardrails

- Never print, store, compare remotely, or request Secret values through Wrangler APIs.
- Do not write Cloudflare Secrets or deploy without explicit approval.
- Do not modify unrelated dirty files.
- No new dependency.
