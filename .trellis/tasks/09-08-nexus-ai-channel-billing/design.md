# Design: Nexus-owned DashScope batch ASR

## Boundary

```text
Authenticated client
  -> POST /api/v1/ai/audio/transcribe (opaque request key + audio)
  -> ASR product service (input normalization + admission)
  -> reservation record + monthly credit projection
  -> provider registry capability selection
  -> encrypted credential resolution
  -> DashScope adapter
  -> provider response normalization
  -> ASR request finalization + immutable credit/provider usage evidence
  -> safe client response
```

The public capability is `audio.transcribe`. Provider names, model names, endpoints, credentials, price rules, and metering inputs are all Nexus-owned server state. Initial ingress accepts only a 20 MiB-or-smaller WAV body with a parsed maximum duration of 10 minutes plus an opaque idempotency key; it rejects unbounded or caller-hosted media before storage.

Nexus writes that body to one private R2 object and creates an ASR request whose only public-media reference is an opaque request ID, an expiry, and a SHA-256 token digest. It submits a single HTTPS handoff URL containing the raw token to DashScope. The raw token exists only while that provider request is in flight; it is never stored, logged, returned, or included in a ledger projection. The unauthenticated handoff route resolves only its own request ID, verifies the hash in constant time, checks expiry/state, and streams the stored object with `no-store` and `nosniff` headers. It accepts no object key, owner, URL, endpoint, or credential from the request.

`provider_registry` remains the sole product-level upstream catalog. Add `dashscope` to its vendor union and server template/normalization. A DashScope provider must be enabled, have an encrypted credential reference, and declare `audio.transcribe` before it can be selected.

Routing resolves one enabled, credentialed DashScope capability deterministically. The first slice does not fail over: rerouting after an upstream attempt could duplicate an upstream bill. Unsupported/ambiguous routing fails before reservation finalization and before a provider request.

DashScope safe metadata owns the endpoint region and batch model. Defaults are server constants; unknown metadata is rejected at provider configuration normalization. The adapter receives decrypted credentials only inside the server execution path.

## ASR request state

A server-owned record uses an opaque UUID and states:

```text
reserved -> dispatching -> settled
                     \-> released
                     \-> failed
```

- `reserved`: a bounded maximum charge is held against both the active team and user monthly balances using an idempotent credit ledger reservation.
- `dispatching`: DashScope accepted the one provider task; no alternate provider is attempted.
- `settled`: provider polling returned a normalized transcript and billable seconds; the reservation is reduced to the final debit, and the direct polling response alone carries the transcript.
- `released`: DashScope did not accept or complete billable work. The reservation is released.
- `failed`: DashScope may have accepted work but the response cannot be safely normalized or covered by the reservation. It stays visible only through a stable code and request ID; no automatic retry/refund is invented.

The request table stores no audio or transcript. Its identity and metering projections are the source of truth for idempotent retried API responses.

## Metering

The final bill is computed only after the provider response is normalized:

```text
transcriptUnits = CJK character × 1 + Latin/digit word × 2
filetransCredits = ceil(max(transcriptUnits, billedSeconds × 4))
```

Billed seconds come from the provider's final result; a caller's declared duration is neither stored nor used. WAV parsing produces a maximum-duration reservation at 10 credits/second before dispatch. Final charges use the lower `max(transcriptUnits, billedSeconds × 4)` formula and release the unused hold.

Provider cost evidence stores only decimal amount/currency and stable model/route identifiers; raw upstream payloads and text are discarded after response normalization. Source audio is held only in the private handoff object and removed when the request reaches a terminal state.

## Idempotency

The existing `creditsStore` accounts a reservation as a normal idempotent team-and-user debit and records a matching idempotent positive ledger release for unused or rejected work. The ASR request is created before its reservation so the same client key resolves to one persisted request state; dispatch proceeds only after the reserve transition. This avoids a duplicate upstream task after retries without creating a second balance system.

## API contract

POST /api/v1/ai/audio/transcribe
Authorization: Bearer <Nexus access token>
X-Idempotency-Key: <opaque client-generated key>
Content-Type: audio/wav

The submission responds `202` with a `dispatching` request ID. The authenticated caller polls:

```text
GET /api/v1/ai/audio/transcriptions/{requestId}
```

Only the terminal polling response includes the transcript:

```json
{
  "requestId": "asr_...",
  "status": "settled",
  "transcript": "...",
  "creditsCharged": 123,
  "billedSeconds": 20
}
```

The transcript belongs only in the direct response, not ledgers/audit/analytics. Error responses expose stable Nexus codes, never upstream native text.

## Compatibility and rollout

No existing CoreApp route changes in this slice. The endpoint is additive and unavailable until a valid DashScope provider exists. Existing generic intelligence providers, legacy app-local ASR channels, credits UI, public pricing, and subscriptions remain unchanged.

Rollback is route/provider disablement. Previously settled ledger rows remain immutable; no schema or code rollback reinterprets charges.

## CoreApp extension

`Tuff Nexus` implements the existing `audio.stt` adapter method and calls a main-owned Nexus ASR client. The client reuses the AuthModule access/refresh lifecycle, sends raw WAV with a UUID idempotency key, pins the Nexus origin and user for the operation, and owns bounded cancellable polling. One definitive 401 may refresh and replay the same bytes/key; other submit failures never auto-replay. No model/provider/price is sent. `nexus-audio-transcribe` is only a product-facing capability alias.

The STT result optionally carries `{ requestId, creditsCharged, billedSeconds }` as `billing`; missing provider confidence remains absent. The file-transcription event forwards that receipt unchanged. Generic STT caching is disabled: an ArrayBuffer is not an identity-bearing JSON cache key, and an earlier transcript or charge must not masquerade as a new request. Once a Nexus STT attempt starts, provider fallback stops. Repeated terminal Nexus GETs may retrieve the same provider task result without billing again or storing the transcript.

Existing realtime `audio.asr` stays provider-stream-only. Filetrans is not exposed as a fake streaming adapter. Existing channel opt-ins and local credentials are preserved.
