# Implementation: Nexus-owned DashScope batch ASR

1. Locate the existing provider registry templates, credential resolver, scene adapter registry, safe API response/error conventions, and D1 test harnesses.
2. Add the `dashscope` provider vendor and its safe configuration/template path. Add the DashScope Filetrans adapter and response normalizer with dependency injection for focused tests.
3. Create the private R2 handoff owner: bounded upload, opaque request ID + hashed delivery token, expiry/state checks, unauthenticated delivery route, and terminal deletion/invalidation.
4. Create an ASR billing owner that extends the existing monthly credit ledger with request-hash/idempotency, reserve, settle, and release transitions. Keep pricing and transcript-unit normalization in one module.
5. Add the authenticated additive batch transcription route. Normalize/limit audio and headers at the route boundary; resolve a registered capability; invoke exactly one adapter; return a safe direct transcript response.
6. Add focused tests for vendor validation, credential redaction, token-handoff denial/expiry, metering, reservation/settlement/release/idempotency, insufficient balance, disabled/missing capability, and malformed provider output.
7. Run Nexus focused tests, typecheck, API route-tree check, and `git diff --check`. Do not deploy or alter public pricing.

## Risk points

- `creditsStore` is shared and the worktree is dirty. Touch only narrowly scoped lines and re-ground after every edit.
- A D1 batch is not a rollback guarantee if a dependent statement is silently a no-op; check each mutation result and surface a stable accounting failure.
- Never log, persist, or return the provider credential, endpoint, raw audio, raw response, or provider-native error.
- The active CoreApp ASR-channel task owns local persisted channel configuration. This task owns Nexus product routing only.

## Validation

```bash
pnpm -C apps/nexus exec vitest run <focused ASR/provider/credit tests>
pnpm -C apps/nexus run typecheck
pnpm -C apps/nexus run check:api-routes
git diff --check
```

## CoreApp continuation

1. Extend the existing auth request executor for main-owned cancellation/deadline/no-retry options; implement the bounded Nexus ASR client and `NexusProvider.stt`.
2. Add the built-in STT capability and idempotent configuration migration; reuse existing channel/capability UI and app-auth readiness.
3. Propagate optional billing to file-transcription settings; classify stable errors and explicitly describe batch limits/cancellation semantics.
4. Integrate voice-service signal/deadline and SDK non-caching/non-replay boundaries; make terminal Nexus polls recoverable without another charge.
5. Run focused tests and type/lint checks, then exercise the actual CoreApp surface and local protocol smoke. Do not deploy or spend production quota without a separately verified authorized target.
