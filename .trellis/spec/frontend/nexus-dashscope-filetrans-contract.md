# Nexus DashScope ASR Contract

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

## Scenario: Nexus-owned synchronous Qwen Audio Flash recognition

### 1. Scope / Trigger

Apply when changing `qwen-audio-3.0-asr-flash`, the Nexus `audio.stt` product route, synchronous-result recovery, or the final-only Voice Session bridge. This model is recorded-audio HTTP recognition, not realtime WebSocket ASR.

### 2. Signatures

```text
CoreApp Voice Session
  -> audio.stt (provider: tuff-nexus-default, model: nexus-audio-transcribe)
  -> POST /api/v1/ai/audio/transcribe

DashScope
  POST {workspaceBaseUrl}/api/v1/services/aigc/multimodal-generation/generation
  X-DashScope-SSE: disable
  model: qwen-audio-3.0-asr-flash
```

- Registry metadata must consistently select `adapter: dashscope-qwen-audio-asr`, `transport: qwen-audio-sync`, and the exact model.
- A successful submit may return `200 settled` with transcript and billing immediately; `GET /api/v1/ai/audio/transcriptions/{requestId}` recovers the same settled result without another Provider call.

### 3. Contracts

- CoreApp sends validated WAV bytes and one opaque idempotency key only. Buffered recovery reuses that key for the same audio and serializes concurrent callers into one Provider/delivery operation. Capture snapshots the signed-in user and Nexus origin; a change before upload or delivery aborts and purges owner-fenced recoverable audio while same-user token refresh remains valid.
- Nexus accepts the Qwen route only as canonical 16 kHz mono PCM16, rejects malformed/ambiguous RIFF chunks and encoded overflow before request creation or reservation, and sends the validated sample rate. CoreApp’s 10 MiB PCM bound covers five minutes; the 150-second client and 120-second Provider deadlines remain separate and bounded.
- Credits are reserved before dispatch and the reservation ledger identity is persisted with the request. A normalized response is written to a private owner-bound result object, the final charge and `settled` state are persisted, then unused credits are released against the original team/month. `credits_released_at` is written only after the idempotent release succeeds.
- Private result writes require the configured R2 bucket and fail before settlement when durable storage is unavailable; process-local memory is never a recovery authority. At expiry, background maintenance reconciles reserved result evidence and incomplete settled releases before deletion; this expiry bypass is never available to POST/GET clients. Cleanup durably marks result deletion, removes expired pre-acceptance `released` tombstones, and retains billing rows.
- A missing response, HTTP 408/5xx, or malformed successful response is accepted-uncertain: fail terminally and do not retry or refund. Only definitive 4xx Provider rejection is pre-acceptance. Once a normalized result exists, interrupted settlement/release and concurrent CAS losers converge without another Provider call.
- When `audio.asr` has no enabled binding, only the exact built-in Nexus `audio.stt` product alias may back Voice Session through the final-only buffer. It emits `ready`, one `final`, then `end`; it never replaces an explicitly configured broken realtime binding. Authenticated submissions are atomically rate-limited before their streaming 20 MiB body read.
- The API route must obtain the upload through H3 `getRequestWebStream(event)`. Never reach into `event.web` or async-iterate `event.node.req` directly: Cloudflare/Nitro may expose an already-buffered `_requestBody`, `rawBody`, `body`, or `__unenv__` request shape. The content-length gate, 20 MiB byte cap, and transport-chunk cap still run before or during that canonical stream read.

### 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| Registry declarations disagree or name another model | `ASR_PROVIDER_CONFIGURATION_INVALID` before request creation |
| WAV is non-canonical, not 16 kHz mono PCM16, exceeds five minutes, or exceeds encoded/body limits | stable 4xx before request creation, credential read, reservation, or Provider call |
| Missing encrypted credential or invalid HTTPS `/api/v1` endpoint | stable configuration failure before network I/O |
| Definitive Provider 4xx response | release reservation once; no replay |
| Transport failure, HTTP 408/5xx, or unnormalizable 2xx | `ASR_DISPATCH_STATE_UNCERTAIN`; retain hold; no Provider replay |
| Settled result is unavailable or expired | finish any pending idempotent credit release, then return `ASR_RESULT_UNAVAILABLE`; never expose expiry-only reconciliation or fabricate an empty transcript |
| Existing enabled `audio.asr` binding is unavailable | surface its stable error; do not fall back to buffered STT |

### 5. Good / Base / Bad Cases

- **Good**: an authenticated 16 kHz microphone session resolves the bound Nexus STT route, records PCM until stop, settles once, and produces `ready -> final -> end`.
- **Base**: a same-key retry reads the private settled result and returns the original receipt without another reservation or Provider call.
- **Bad**: label this model realtime, emit fake partials, send the DashScope key to CoreApp, retry after an uncertain dispatch, or persist transcript text in D1.

### 6. Tests Required

- Adapter tests assert the exact generation URL/body/headers, Base64 bound, endpoint and credential preflight, response text variants, duration bounds, abort/transport uncertainty, and secret non-disclosure.
- Service/store tests assert `reserved -> settled`, private owner/TTL recovery, same-key no-replay, reservation release/retention rules, and no transcript in D1 projections.
- CoreApp tests assert immediate-settled response handling, bounded PCM-to-WAV conversion, final-before-end ordering, cancellation, and no fallback over an enabled broken `audio.asr` binding.
- Real acceptance requires a persisted encrypted Provider Registry credential and a real `audio.stt` call through the authenticated CoreApp/Nexus path; mock success is not Provider evidence.

### 7. Wrong vs Correct

```ts
// Wrong: pretend a synchronous file model is a realtime socket.
audioAsrRegistry.register('qwen-audio-3.0-asr-flash', websocketAdapter)

// Correct: buffer the selected Nexus STT route and publish one terminal result.
const provider = createBufferedSttVoiceProvider({ providerId, model: 'nexus-audio-transcribe' })
```
