# Nexus DashScope Filetrans Contract

## Scenario: Nexus-owned asynchronous Filetrans transcription

### 1. Scope / Trigger

Apply when changing Nexus `audio.transcribe`, DashScope provider routing, Filetrans media delivery, ASR credits, or transcription status routes. CoreApp-local voice channels do not own this product route.

### 2. Signatures

```text
POST /api/v1/ai/audio/transcribe
Authorization: Bearer <app access token>
X-Idempotency-Key: opaque key (8–128 characters)
Content-Type: audio/wav

GET /api/v1/ai/audio/transcriptions/{requestId}
GET /api/v1/ai/audio/handoff/{requestId}?token={opaque delivery token}
```

- `startAsrTranscription(event, userId, { audio, contentType, idempotencyKey })`
- `pollAsrTranscription(event, userId, requestId)`
- `countTranscriptUnits(text)` and `calculateFiletransCredits(text, billedSeconds)` own metering.

### 3. Contracts

- The client sends only WAV bytes and an idempotency key. It never selects a provider, model, endpoint, price, duration, storage key, or URL.
- Only one enabled `dashscope` provider that declares `audio.transcribe` may be routed. Ambiguity or no route fails before upstream dispatch; there is no provider fallback.
- Ingress is limited to 20 MiB and 10 minutes of parsed PCM/float WAV. This supplies a bounded 10-credit/second reservation before dispatch.
- Nexus writes the source to private R2 and gives DashScope one 15-minute HTTPS handoff URL. D1 retains only the delivery token SHA-256 digest; raw delivery tokens, source bytes, transcript text, credential, endpoint, and native provider errors never enter D1, ledger, logs, analytics, or client status projections.
- The handoff route resolves only its own ASR request, checks an active state, expiry, and token digest in constant time, and returns audio with `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.
- Submit returns `202 dispatching`; the client polls. Only the final direct response contains transcript text. Terminal state invalidates the handoff and attempts private-object deletion.
- Filetrans final charge is `ceil(max(transcriptUnits, billedSeconds × 4))`; one CJK character is one unit and one contiguous Latin/digit word is two. Unused reservation is released through the same team/user credits projection.

### 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| Missing/invalid app access token | reject before audio read |
| Non-WAV, empty, >20 MiB, invalid/over-10-minute WAV | stable 4xx before private storage or provider call |
| Missing/ambiguous/uncredentialed DashScope capability | `ASR_ROUTE_UNAVAILABLE` or stable provider configuration failure; no reservation |
| Insufficient credits / reservation debit rejects | release request without refunding an unconsumed hold; no provider task; retain `ASR_REQUEST_FAILED` and rethrow original error |
| Reservation debit succeeds but reserved-state persistence fails | compensate the full hold once, release request and invalidate/delete handoff; retain `ASR_REQUEST_FAILED` and rethrow original error |
| Replayed idempotency key, same WAV | return persisted ASR request state; no second dispatch or debit |
| Replayed key, different WAV | `409` conflict |
| Handoff wrong/expired token, terminal request, or unknown ID | `404`; no object/key disclosure |
| DashScope rejects submission | release entire hold, invalidate/delete handoff; retain the safe `DashScopeAsrError.code` and rethrow original error |
| DashScope task succeeds | settle exactly once, release unused hold, return direct transcript |
| Accepted task response cannot be normalized or exceeds hold | stable failed state; no fabricated retry or refund |

### 5. Good / Base / Bad Cases

- **Good**: a 30-second WAV reserves 300 credits, DashScope reports 120 transcript units and 30 billed seconds, Nexus settles 120 and releases 180.
- **Base**: a DashScope task remains `dispatching`; polling returns its safe request state and neither exposes a provider task ID nor creates another task.
- **Bad**: forwarding a caller-provided URL, persisting a raw handoff token or transcript in the billing row, permitting arbitrary content types, or falling back after Filetrans accepts a task.

### 6. Tests Required

- Transcript unit tests cover CJK, Latin/digit boundaries, punctuation, NFKC normalization, and audio-second floor.
- WAV tests cover valid PCM duration and malformed/unsupported containers before storage.
- Adapter tests use injected fetch: submit URL/body, pending/failed/success normalization, malformed response, and credential non-disclosure.
- Credit tests prove one reservation release decrements both team/user balances once and idempotent retry cannot release twice.
- Pre-acceptance service regressions cover rejected debit, failed reservation-state persistence after debit, and typed provider submit rejection; all preserve original error identity and safe terminal codes without refunding unconsumed or accepted-task reservations.
- Run focused Vitest, Nexus typecheck, `check:api-routes`, scoped ESLint, and `git diff --check`.

### 7. Wrong vs Correct

```ts
// Wrong: a provider is asked to fetch untrusted caller media.
await dashscope.submit({ file_urls: [body.url] })

// Correct: Nexus owns private media and mints a short-lived opaque handoff.
const handoffUrl = resolveHandoffUrl(event, request.id, deliveryToken)
await dashscope.submit(event, provider, handoffUrl)
```
