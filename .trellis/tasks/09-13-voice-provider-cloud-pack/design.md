# Design: Cloud-delivered voice provider pack

## Decision

Add `voice-provider` as a third signed whole-pack type in the CatalogService family and resolve `metadata.voiceAsr.protocol = 'nexus-pack'` against the activated pack. The pack is declarative data: it may move endpoints, model lists, header allowlists, and limits, but it may not define protocol semantics, carry credentials, or execute code.

The alternative — shipping an executable script and running it in the main process — is rejected. The repository has no sandbox for untrusted remote code: the widget `new Function` sandbox shares renderer intrinsics and its own test says it is not an isolation boundary, and the plugin host's Node `vm` is a plugin isolation protocol, not a containment boundary for arbitrary downloaded code. Accepting that shape would put microphone capture, text injection, and credential-adjacent code behind a downloaded artifact.

**D3 implemented as authenticated per-pack key delivery.** The build step encrypts the canonical payload with a random AES-256-GCM nonce and a release-provisioned per-pack DEK; the signed manifest binds the ciphertext envelope digest plus `{ algorithm, keyId }`. Public R2 serves only the envelope. After sign-in, a host-only request fetches the matching DEK from a `private, no-store` Nexus route backed by the `VOICE_PROVIDER_CATALOG_KEYS` secret map. The key remains in main-process memory and is zeroed after verification/decryption. This protects anonymous/static inspection; an authenticated user can still extract the key, which remains an explicit non-goal rather than a hidden claim.

## Reusable cloud-control extension contract

Future cloud-controlled features reuse only the **delivery plane**: `CatalogManifestV1`, pinned release signature, content-addressed payload, optional per-pack A256GCM envelope/key identity, authenticated fetch, SQLite lifecycle, and safe diagnostics. Each new `CatalogPackType` must still ship a compile-time typed schema/normalizer, its own persistence projection, and a code-owned runtime adapter. The shared layer never interprets arbitrary fields and never executes downloaded code.

Remote checks, downloads, key delivery, and activation require a loaded signed-in account; status and local rollback remain available offline for diagnosis/recovery. A remotely delivered pack cannot enable an optional local feature. Voice input stays off by default and requires a manual local switch independently of login or pack activation. Material new pack categories or purposes require agreement/notice updates before rollout.

## Data flow

```text
Nexus (Cloudflare Pages + R2)
  build: pack JSON + per-pack DEK -> AES-256-GCM envelope
         -> manifest signs ciphertext SHA-256 + encryption key id
  public read-only: GET /api/v1/catalogs/voice-provider/latest
                    GET /api/v1/catalogs/voice-provider/:packId/:version/:sha256.json
  authenticated:    GET /api/v1/catalogs/voice-provider/:packId/:version/keys/:keyId
        |
        v   (login once, or explicit manual sync)
CoreApp main
  verify RSA manifest + ciphertext digest
    -> fetch matching DEK with Nexus session token (memory only, no-store)
    -> AES-256-GCM decrypt with identity AAD
    -> strict normalizer (unknown keys, bounds, https-only, closed protocol enum, minSdkApi)
    -> SQLite transaction (catalog_packs + voice_provider_entries)
    -> explicit activate (persist first, then republish the in-memory registry)
        |
        v
active voice-provider registry (read-only facade)
        |
        v
VoiceService -> getConfiguredAsrProvider -> voice-provider-runtime
   metadata.voiceAsr.protocol === 'nexus-pack'
     -> descriptor lookup -> sdkapi/protocol/model validation -> adapter assembly
        |
        v
Nexus POST /api/v1/ai/audio/transcribe (session token, raw body, content-type, x-idempotency-key)
  -> GET /api/v1/ai/audio/transcriptions/:requestId -> normalized transcript
```

## Contract

`VoiceProviderPackV1` payload (`schemaVersion: 1`):

- `packId`, `version` (monotonic), `minSdkApi`, optional `expiry`;
- `providers[]`: stable `id`, localized `displayName`, `protocol` from the closed enum, `transport`, `endpoint { baseUrl, submitPath, pollPath? }`, `auth { mode: 'nexus-session' | 'secure-store-ref', ref? }`, `request { body, contentTypePolicy, headers?, idempotencyHeader? }`, `models[]`, `limits { maxBytes, maxDurationSec, timeoutMs }`.

Normalization rules the normalizer owns (one reason per rejection):

| Rejection | Rule |
| --- | --- |
| `unknown-key` | any key outside the schema |
| `bad-endpoint` | `baseUrl` not `https:`, or carries userinfo, query, or hash |
| `bad-protocol` | `protocol` outside the closed enum |
| `bad-header` | header name outside the allowlist (`authorization`/`cookie` are never pack-settable) |
| `duplicate-provider` | repeated `providers[].id` |
| `sdkapi-too-new` | `minSdkApi` greater than the client's `sdkapi` |
| `expired` | `expiry` in the past |
| `too-large` | payload bytes, string length, or array length beyond the bound |

Client-side limits are applied as `min(pack value, local hard cap)`, so a pack can never widen `MAX_AUDIO_BYTES`, `MAX_AUDIO_SECONDS`, or the poll deadline.

What deliberately stays in code (not deliverable): the accepted-state machine, HTTP error mapping, billing field projection, WAV header parsing, and base64 decoding. These are protocol semantics; delegating them to a payload would let the server redefine the client's contract.

## Type generalization

`CatalogPackType` is currently the literal `"domain-lexicon"` and the service signatures are domain-lexicon shaped (`VerifiedDomainLexiconPack`, `getActiveRegistry(): DomainLexiconRegistry`). The generalization must be additive:

- widen `CatalogPackType` to a union and route per-type behavior through an explicit per-type adapter rather than a shared untyped blob (a generic JSON blob would discard the type safety that makes the current verifier trustworthy);
- keep `catalog_packs` identity and the verification path unchanged for `domain-lexicon`;
- add `voice_provider_entries` in an additive migration; the pack-identity key widens to `(type, pack_id)`;
- activate/rollback rebuild the active registry from SQLite only, never from the in-memory verified pack.

`09-03-remote-app-alias-catalog` consumes this generalization for `app-semantic-alias`; it does not own it.

## Nexus API

- `GET /api/v1/catalogs/voice-provider/latest` returns manifest bytes.
- `GET /api/v1/catalogs/voice-provider/:packId/:version/:sha256.json` returns payload bytes for a known identity, 404 otherwise.
- The server validates route identity against a static catalog-artifact projection and returns stored bytes. It does not parse, sign, or mutate at request time. Authoring, signing-secret provisioning, and production storage are deferred, exactly as `09-03` recorded.
- Pack bytes are not stored in D1 business tables.

## Trigger surface

| Trigger | Behavior |
| --- | --- |
| Login success | one `checkUpdates('voice-provider')`, fire-and-forget, failure degrades silently with a recorded reason |
| Settings manual check | explicit `check -> download -> import -> activate`, with version, hash, signature state, and a rollback entry |
| Startup | no fetch (keeps the load off the startup critical path) |
| Rollback | `rollback('voice-provider', reason)` restores the previous imported pack; with no previous pack it fails closed and keeps the active route |

## Failure semantics

`unsupported` (minSdkApi), `expired`, `signature-invalid`, `schema-invalid`, `not-configured`. All are user-visible with a recovery path; none may surface as a silent fallback to a different provider, and none may return an empty success.

## Invariants

1. Nexus never supplies a verification key; the trust root is read from the packaged PEM only.
2. Persist before republishing the registry; a failed import or activation leaves the previous active pack in place.
3. A pack never carries a credential. Nexus calls use the session token from the auth module; other providers use `authRef` into the secure store.
4. No new dynamic execution. No `eval`, no `new Function`, no downloaded interpreter.

## Phases

| Phase | Content | Exit |
| --- | --- | --- |
| P1 | pack contract + normalizer + additive type generalization + typed table + activate/rollback | focused catalog suite green, domain-lexicon behavior unchanged |
| P2 | Nexus read-only routes + signed artifact build step | local Pages + local R2 round trip, digest-equal bytes |
| P3 | `nexus-pack` resolution in `voice-provider-runtime` + adapter assembly + typed failure reasons | VoicePanel dictation through the pack route; built-in route still works when no pack is active |
| P4 | login + manual trigger, status projection, rollback entry | end-to-end evidence |
| P5 | negative gate matrix | evidence matrix |

P3 coordination gate resolved on 2026-09-13: the user explicitly resumed the task after no live owner remained. The integration preserved the buffered-STT adapter and added only its descriptor limits/invoker seams.

## Risks

- **Already-activated client withdrawal.** Deleting the content-addressed payload and matching key-map entry prevents every client that has not imported it from activating the pack. It cannot reach a client that already activated the bytes, and `latest` must never point backward to simulate revocation. A future signed withdrawal command is a separate contract; until then the safe forward recovery is a newer signed fixed pack or local rollback.
- **Type generalization churn.** Widening catalog types touches a contract another planned task depends on; the additive constraint above is the mitigation, and the existing suite is the regression proof.
- **Scope creep into script execution.** The descriptor will be argued to be too weak. That argument belongs in a separate task with its own sandbox, budget, and threat model.
