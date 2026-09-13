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
## User-directed Qwen Audio Flash implementation

8. Add an explicit DashScope Qwen Audio Flash synchronous adapter. Build the model-specific generation payload, Base64 WAV input, bounded response normalizer, cancellation/timeout handling, and stable pre-acceptance errors without exposing provider details.
9. Keep the existing Filetrans adapter for its explicit model, add a Qwen Audio Flash provider template, and resolve the selected server-side model/transport from registry metadata with fail-closed validation.
10. Extend the ASR request lifecycle for a synchronous `reserved -> settled` result. Store only a private owner-bound, TTL-bounded normalized result object for same-key recovery; never add transcript or audio to D1 request/ledger projections.
11. Update the CoreApp Nexus STT client to accept an already-settled response and use the existing authenticated `audio.stt` route. Add the main Voice Session's final-only buffered stream fallback only when `audio.asr` has no enabled binding and `audio.stt` resolves to a ready Nexus route.
12. Configure the local Nexus registry with the exact `qwen-audio-3.0-asr-flash` model through the existing secure credential form, then run a single authorized local smoke. Do not send or log an API key from the browser or renderer.
13. Preserve one UUID idempotency key across buffered recovery and give only buffered post-capture requests a 150-second deadline; retain realtime providers’ 30-second connection budget and fresh retry identities.
14. Raise the bounded PCM/Data URI pair coherently so five minutes of 16 kHz mono PCM16 fits without weakening Nexus’s independent 20 MiB ingress and duration validation.
15. Persist the reservation ledger ID, settle stored normalized results before releasing unused credits, bind release to the original team/month, and resume failed settlement or release from same-key replay without Provider redispatch.
16. Add request-driven, throttled result retention cleanup with a durable per-row deletion marker and multi-page forward-progress coverage.
17. Bind buffered capture/recovery to the capture-start user and Nexus origin; reject and purge on authority change while allowing same-user token refresh. Give the recovery request a 180-second transport envelope.
18. Replace unbounded body buffering with auth-first atomic rate limiting plus byte-, fragment-, RIFF-, format-, duration-, and Base64-bounded admission. Qwen accepts only 16 kHz mono PCM16 and writes no source handoff object.
19. Add durable `credits_released_at` and `result_deleted_at` markers. Reconcile expired reserved evidence and incomplete settled releases before object deletion, then TTL-delete pre-acceptance released request rows.
20. Resolve/persist original reservation ledgers for legacy in-flight rows, backfill only provably old settled rows, and accept only the exact old release hash that differs by the newly added reservation-ledger metadata.
21. Require R2 before result settlement, bind each `waitUntil` to its owning execution context, fence retry-buffer mutations by capture ID, serialize concurrent recovery, and preserve non-retryable error metadata while purging its PCM.
