# Implement: Cloud-delivered voice provider pack

Phases are ordered and independently revertible. P3 began only after explicit user coordination; its changes preserve the pre-existing buffered-STT implementation.

## Current implementation state (2026-09-13)

- **P1 complete at code/focused-test level:** typed pack contract, strict normalizer, additive Catalog type, SQLite migration, signed import, activate, rollback, and full journal-chain schema regression.
- **P2 complete at code/focused-test level:** AES-256-GCM artifact builder, ciphertext-only object projection, RSA signature over ciphertext digest/encryption metadata, authenticated no-store key route, secret-map/key-rotation identity, public manifest/payload routes, and server-side withdrawal.
- **P3 complete at code/focused/local-smoke level:** Nexus runtime metadata selects `nexus-pack`; the active registry retains pack compatibility/expiry metadata; descriptor id/model/protocol/transport/auth/origin/limits are validated before capture; the existing buffered adapter freezes the route and applies the smaller local/pack bounds; no active pack keeps the built-in Nexus route.
- **P4 complete at code/focused-test level:** one fire-and-forget sync per login/account transition, queued account-switch handling, host-only typed controls, serialized sync/rollback mutations, safe diagnostics, and voice Settings controls. Signed-out check/sync now return `CATALOG_AUTH_REQUIRED` before network work; status and local rollback remain available.
- **P5 covered at focused-test level:** forged signature, ciphertext/payload tamper, wrong key/tag/AAD/key id, missing encryption, older-version replay, withdrawn payload, wrong catalog type, untrusted replacement key, account-switch race, signed-out remote controls, unknown protocol, expiry, origin/model mismatch, size/deadline limits, key-buffer zeroization, and secret-canary exclusion. No paid real-Provider request was made by the local smoke.

### Reusable cloud-control and consent boundary

The shared Catalog layer is a delivery plane, not a script engine: future types reuse manifest/signature/content-address/envelope/key identity/login/lifecycle primitives but must ship their own typed normalizer, persistence adapter, and runtime consumer. Remote packs cannot add executable semantics or enable local optional features. Voice input remains off on fresh/malformed settings and displays an explicit default-off/manually-enabled tag. CoreApp’s bundled agreement plus Nexus English/Chinese Terms and Software Agreement disclose the mechanism, login gate, credential/code exclusion, and local opt-out.

### D3 authenticated per-pack key delivery

Selected implementation: each published pack uses a 32-byte DEK and random 12-byte nonce. The builder writes only an A256GCM envelope to the public artifact tree; the RSA-signed manifest binds the ciphertext length/digest and `{ algorithm, keyId }`. `VOICE_PROVIDER_CATALOG_KEYS` is a secret JSON map keyed as `voice-provider/<packId>/<version>/<keyId>`. An app-authenticated `private, no-store` route returns the matching key after login; CoreApp keeps it in main memory, verifies/decrypts with identity AAD, then zeroes both the caller-held and verifier-held buffers.

Threat boundary remains explicit: this prevents anonymous/static artifact inspection and supports rotation/revocation, but an authenticated user can extract a key delivered to their client. No credential or executable code is permitted in the pack. A fixed embedded client key remains prohibited.

### Current evidence

- `apps/core-app`: full Catalog/P3/storage/default-off/Settings consent surface **16 files / 184 tests**; node typecheck and scoped ESLint exit 0. An exact isolated feature-tree snapshot also passes renderer typecheck after its normal TuffEx build; the shared dirty checkout’s renderer typecheck is independently red on concurrent uncommitted TuffEx Charts imports (`d3-*`/duplicate `TxGrid`), which this commit excludes.
- `packages/utils`: full i18n contracts + typed Settings SDK + host-only provider metadata boundary **8 files / 172 tests**; encrypted builder + migration ratchet **2 files / 14 tests** plus strict standalone TypeScript compilation.
- `apps/nexus`: catalog/key/secret/policy suites **5 files / 67 tests**; route-tree and Nuxt typecheck pass. Local Node 26 policy API resolves `/app/license.zh`, `/app/protocol.zh`, and English `/app/license` with the declarative-cloud-control, login, no-executable/credential, default-off voice, and opt-out clauses.
- Exact feature-tree verification: isolated offline dependency install, TuffEx build, CoreApp node/web typechecks, Nexus typecheck, `electron-vite build`, repository signing/migration gates, and every feature-focused suite pass. Real TuffEx `TuffBlockSwitch` + `TxTag` smoke rendered an in-viewport, hit-testable “Off by default” marker (`aria-checked=false`), then a trusted click changed it to “Manually enabled” (`aria-checked=true`); integration tests pin the same state inside `SettingSpeechRecognition`.
- Throwaway encrypted round trip: real CLI build → public envelope with no endpoint/model plaintext → signed manifest check → exact authenticated key request `/api/v1/catalogs/voice-provider/e2e.voice/1/keys/voice-e2e-1` → A256GCM decrypt → strict parse → SQLite import/activate. Result: active `e2e.voice@1`, registry endpoint restored, and `catalog_state` persisted the same identity. The RSA/AES files and scratch database were deleted afterwards.
- Isolated Electron UI (`TUFF_PACKAGED_ACCEPTANCE_ISOLATED=1`, throwaway user-data/file roots): `/setting/intelligence/voice` renders the Cloud voice routing group in the real 560px drawer. Browser geometry confirmed both 82px rows and all three controls inside the viewport; the initial fixed-height overlap was found visually and repaired. Component tests pin the encrypted-copy and never-checked-vs-current status semantics. The profile and process were removed.
- P3 runtime regression is included above. Its active-pack case drove synthetic PCM through resolver → existing buffered adapter → mocked Nexus client and observed `final` then `end`; missing/expired/signature/schema/sdkapi/origin/model failures returned stable `VOICE_ASR_PACK_*` codes.
- Local Electron smoke: `electron-vite build` passed; an isolated dev runtime used a throwaway HOME/user-data/file root with native audio/OCR disabled. After normal onboarding, `/setting/intelligence/voice` opened the real 560px voice-settings Drawer; status/check/sync/refresh text rendered, scroll-to-control geometry placed all controls inside the 1100×820 viewport, and `elementFromPoint` hit each control. Refresh exercised the typed status transport. Chromium screenshot capture timed out, so the evidence is DOM text + geometry + ancestor overflow + hit-testing, not a claimed screenshot. All isolated profiles/processes were removed.
- The consent smoke used only a throwaway Vite entry and isolated profile; both are removed during cleanup. No microphone, speaker, login, remote catalog fetch, or paid Provider request was used.

## P1 — Pack contract and additive type generalization

1. Add the shared pack contract next to the existing catalog contract: `VoiceProviderPackV1`, the closed protocol enum reuse, and `normalizeVoiceProviderPack()` with one typed rejection reason per rule in `design.md`.
   - Target: `packages/utils/i18n/` (sibling of `catalog.ts`) or a new `packages/utils/voice/catalog.ts` if the voice contract does not belong in the i18n directory. Read `packages/utils/i18n/catalog.ts` first and follow its normalization/error-code style.
2. Widen `CatalogPackType` to a union and move per-type behavior behind an explicit type adapter. `domain-lexicon` must keep identical behavior, manifest shape, and error codes.
   - Targets: `packages/utils/i18n/catalog.ts`, `apps/core-app/src/main/modules/catalog/catalog-service.ts`, `catalog-repository.ts`, `catalog-verifier.ts`, `index.ts`.
3. Add `voice_provider_entries` and widen the pack identity key in an additive migration; register it the way this repo registers migrations (see existing `resources/db/migrations/` and the migration registration step).
   - Targets: `apps/core-app/src/main/db/schema.ts`, `apps/core-app/resources/db/migrations/`.
4. Implement activate/rollback for the new type: import writes pack metadata and typed rows in one transaction; activation rebuilds the active registry from SQLite.
5. Tests (focused, behaviour-level): every normalizer rejection reason; forged signature and tampered payload leave the previous active pack untouched; replayed older version refused; domain-lexicon suite unchanged.

Verification: `cd apps/core-app && npx vitest run src/main/modules/catalog` and the `packages/utils` i18n suite.

## P2 — Nexus read-only routes

1. Add `GET /api/v1/catalogs/voice-provider/latest` and `GET /api/v1/catalogs/voice-provider/[packId]/[version]/[sha256].json` under `apps/nexus/server/api/v1/catalogs/`, validating route identity against a static artifact projection and returning stored bytes; never parse, sign, or mutate at request time.
   - Do not store pack bytes in D1 business tables.
2. Add the build/sign step that produces the manifest and content-addressed payload, following the existing release-signing trust-root script conventions (`scripts/check-release-signing-trust-roots.mjs`).
3. Withdrawal deletes the content-addressed payload and its secret-map key, blocking clients that have not imported it. Already-activated clients require a newer signed fixed pack or local rollback; a signed remote withdrawal command is a separate future contract and `latest` never points backward.

Verification: local Pages + local storage round trip; assert returned bytes are digest-equal to the stored payload; unknown identity returns 404.

## P3 — Runtime resolution

1. Extend `voice-provider-runtime` so `metadata.voiceAsr.protocol === 'nexus-pack'` resolves the descriptor from the active registry and validates `minSdkApi`, protocol, models, and limits before capture begins.
2. Assemble the adapter from the descriptor via `packages/tuff-voice` (registry or a generic buffered adapter); do not add a fourth hand-written provider unless the descriptor cannot express the route.
3. Surface typed failures (`unsupported`, `expired`, `signature-invalid`, `schema-invalid`, `not-configured`) through the existing recognition-status projection.
4. Tests: descriptor → adapter assembly; `minSdkApi` too new fails closed; no active pack keeps the built-in Nexus route working.

## P4 — Trigger surface

1. One fire-and-forget check on login success, off the startup critical path.
2. Manual `check -> download -> import -> activate` entry with version, hash, signature state, and rollback.

## P5 — Negative gate matrix

Forged signature, tampered payload, replayed manifest, expired pack, revocation, key rotation, account switch, non-enumerated protocol, oversized payload, secret scan of logs/config/sync payload. Each row needs an assertion; `N/A` is not an accepted result.

## Doc sync (after implementation, per PRD-QUALITY-BASELINE §6)

`docs/plan-prd/03-features/voice-provider-cloud-pack-prd.md` status, `TODO.md` only if the execution lane reaches it, `CHANGES.md` on landing, `INDEX.md` if navigation changes.
