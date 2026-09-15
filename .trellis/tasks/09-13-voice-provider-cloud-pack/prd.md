# Cloud-delivered voice provider pack

## Goal

Make "how the client talks to Nexus voice" a signed, versioned payload that Nexus can change without a client release, instead of the endpoint, limits, and model list that are compiled into CoreApp today.

Product/system PRD, decision record, and the full option analysis live in
[`docs/plan-prd/03-features/voice-provider-cloud-pack-prd.md`](../../../docs/plan-prd/03-features/voice-provider-cloud-pack-prd.md).
This file is the task record; it does not restate that analysis.

## Confirmed facts

- Voice routing is main-owned. `voice-provider-runtime.ts` resolves an Intelligence capability binding and switches on normalized `metadata.voiceAsr.protocol`; the internal `nexus-pack` value resolves an active signed descriptor while the three direct Provider protocols keep their existing adapters.
- `apps/core-app/src/main/modules/nexus/asr-client.ts` retains the built-in `/api/v1/ai/audio/transcribe` + poll path, 20 MiB/600 s/10 min hard ceilings, state machine, HTTP error mapping, WAV validation, and billing projection. An active normalized `nexus-pack` may only tighten those bounds and replace the same-origin submit/poll paths and allowlisted headers.
- Nexus already serves ASR at `apps/nexus/server/api/v1/ai/audio/transcribe.post.ts` with `requireAppAuth`, raw-body audio, `content-type`, and `x-idempotency-key`, plus `GET /api/v1/ai/audio/transcriptions/[requestId]`.
- Planning baseline: CatalogService already provided pinned-RSA verification, content addressing, atomic SQLite import, activate/rollback, and an offline domain-lexicon baseline, but its remote path had no runtime caller. This task adds the separately typed voice-provider path without changing domain-lexicon behavior.
- Planning baseline: `apps/nexus` had no `/api/v1/catalogs/**` route; P2 now owns the public manifest/ciphertext routes and authenticated payload-key route.
- The login-triggered sync channel (`modules/sync`) already exists and pushes/pulls user data with `enc:v1` payloads, but carries no signature semantics and is not a trusted-content channel.
- There is no cloud-script execution path in the repository: `config/script-bridge.json` does not exist, and the only dynamic execution surfaces are the plugin host's Node `vm` (a plugin isolation protocol) and the widget `new Function` sandbox (its own test states it is not an isolation boundary).

## Decisions (locked)

Locked from the system PRD §3 and §12. Changing any of these requires re-opening the PRD, not this task.

1. **D1 — Payload shape:** a declarative, strictly normalized descriptor. No remote JavaScript, Python, or shell execution in this task. Parameters may be delivered; protocol semantics may not.
2. **D2 — Delivery channel:** the Catalog family (signed whole-pack), not the sync channel and not `.tpex` plugins.
3. **D3 — Cryptography:** RSA signature (authenticity/integrity) is mandatory; AES-256-GCM envelope encryption is transport/at-rest confidentiality only. "The user cannot obtain the protocol" is a non-goal.
4. **D4 — Trigger:** one check after login, plus an explicit manual check; no startup fetch, no polling.
5. **D5 — Coverage:** Nexus voice only in this task. Migrating the three hardcoded protocols into packs is a later task.
6. **D6 — Shape of the type change:** this task owns the additive genericization of the catalog pack type; `09-03` consumes it for `app-semantic-alias` instead of duplicating the refactor.
7. **D7 — Envelope key delivery:** one 32-byte DEK per published pack, provisioned by secret lookup id `voice-provider/<packId>/<version>/<keyId>` and returned only by an app-authenticated, no-store route. Fixed client keys are prohibited.
8. **D8 — Reusable architecture:** future cloud-controlled features reuse the signed/encrypted Catalog delivery plane but must add their own client-shipped typed normalizer, persistence adapter, and runtime consumer. No universal script interpreter.
9. **D9 — Login and local consent:** remote check/download/activation requires sign-in. Pack activation never enables voice input; the fresh default is off and the user must turn it on manually through a clearly labelled UI.

## Requirements

1. Define `VoiceProviderPackV1` with strict normalization (unknown-key rejection, string/array bounds, `https`-only endpoint validation, closed protocol enum, `minSdkApi` floor) and a unit-tested normalizer that owns every rejection reason.
2. Extend the catalog pack type from the `domain-lexicon` literal to a union with per-type handling, keeping existing domain-lexicon behavior byte-identical (same manifest shape, same verification path, same activation semantics).
3. Persist voice-provider entries in their own typed table inside the same SQLite transaction as the pack metadata; activate/rollback rebuild the active registry from SQLite only.
4. Add Nexus public read-only routes for `latest` and the content-addressed ciphertext envelope, plus app-authenticated `GET /api/v1/catalogs/voice-provider/:packId/:version/keys/:keyId`; public routes never parse/sign/mutate payloads, and the key route never caches or logs the DEK.
5. Resolve `metadata.voiceAsr.protocol = 'nexus-pack'` in `voice-provider-runtime` from the active registry, failing closed with a typed reason when the pack is missing, expired, not activated, or below the client's `sdkapi`.
6. Reuse the pinned RSA trust root from `resources/keys/release-signing-public.pem`; the signature binds ciphertext SHA-256 and encryption metadata. Decrypt A256GCM only after matching the authenticated per-pack key, using identity AAD, and zero key buffers after use. Nexus never supplies a verification key.
7. The descriptor may carry endpoint paths, header allowlists, model lists, and limits, but never a credential. Client-side limits apply as `min(pack value, local hard cap)`.
8. Keep the built-in Nexus route working when no pack is active, so the feature is additive and revertible.
9. Keep status and local rollback available while signed out, but reject remote check/sync with `CATALOG_AUTH_REQUIRED` before any network or catalog mutation.
10. Disclose declarative cloud configuration, login gating, and optional voice-input behavior in the Terms/Software Agreement.

## Acceptance Criteria

- [x] `VoiceProviderPackV1` normalizer rejects unknown keys, non-`https` endpoints, userinfo/query/hash in `baseUrl`, duplicate provider ids, non-enumerated protocols, oversized payloads, and a `minSdkApi` newer than the client.
- [x] A forged signature, a tampered payload, or a manifest whose `keyId` is not the literal trust-root id fails closed and leaves the previously active pack untouched.
- [x] Existing domain-lexicon catalog tests still pass unchanged, proving the type generalization is additive.
- [x] Nexus routes serve the exact stored bytes (digest-equal round trip) and 404 on an unknown pack identity.
- [x] Public artifacts contain only the AES-256-GCM envelope; wrong key/tag/AAD/key id fails closed, the authenticated key response is `private, no-store`, and key buffers are zeroed after success or failure.
- [x] With an active pack, the locally driven dictation stream completes through the frozen pack-described route; with no active pack, the built-in Nexus buffered route remains selected.
- [x] Replayed manifest (older version after a newer activation) is refused; one logged-in check and one manual check are both observable in status.
- [x] The fresh voice-input default is off; the Settings switch shows an explicit “off by default” / “manually enabled” marker, and an activated pack cannot change that preference.
- [x] Signed-out manual check/sync returns `CATALOG_AUTH_REQUIRED` with zero remote calls; status and local rollback remain available.
- [x] The English and Chinese agreements disclose signed declarative cloud configuration, no downloaded execution/credentials, login gating, local opt-out, and the independent voice-input switch.

## Out of Scope

- Executing any downloaded code, in any language, on the desktop.
- Migrating `bailian-paraformer`, `dashscope-qwen-asr-realtime`, or `doubao` into packs.
- Admin authoring/publish UI or a mutable server-side catalog store; the host Settings status/sync/rollback controls are in scope.
- Realtime/streaming voice protocol delivery; this task covers the buffered/upload route.
- Replacing or weakening the separately authored buffered-STT semantics; P3 composes the active descriptor with that existing adapter and preserves its built-in fallback.
