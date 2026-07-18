# Plugin Signing Trust Chain - Implementation Plan

## Ordered Checklist

1. [ ] Rename current package digest fields/types away from ambiguous `signature`; inventory every CLI/Nexus/CoreApp caller before changing exports.
2. [ ] Define canonical publisher payload, Nexus attestation payload, stable serialization and trust-result/error types in the shared owning package.
3. [ ] Implement cross-runtime Ed25519 test vectors for sign/verify and canonical serialization.
4. [ ] Add CLI signer abstraction backed by environment/keychain/CI secret providers; ensure private material never enters package/log/config.
5. [ ] Add Nexus publisher public-key registration/status/rotation/revocation persistence and authorization.
6. [ ] Verify publisher signature after digest/policy and before scan/review; persist bounded result.
7. [ ] Sign Nexus admission attestation only after scan and human review; persist attestation and expose safe download metadata.
8. [ ] Add CoreApp trust-root/key-set verification before package extraction/enable; separate official and explicit local-dev trust.
9. [ ] Backfill/shadow-verify current approved artifacts, then hard-cut official admission/install to signed attestations.
10. [ ] Remove `key.talex` trust fallback/semantics after all readers migrate; coordinate physical file removal with CLI shim task.
11. [ ] Document key operations, rotation, revocation and incident rollback without private material.

## Contract Tests

- published canonical vectors across CLI/Nexus/CoreApp;
- every payload field tamper and artifact-byte tamper;
- unknown, wrong-owner, expired, not-yet-valid and revoked publisher key;
- invalid/unknown Nexus trust root and attestation audience;
- rotation overlap and post-overlap rejection;
- local dev trust cannot set official/Nexus-trusted status;
- no private key/key.talex in package inventory, logs or evidence;
- failure occurs before extraction/installation mutation.

## Verification Commands

```bash
corepack pnpm -C packages/utils exec vitest run __tests__/plugin/plugin-signing.test.ts
corepack pnpm -C packages/tuff-cli-core exec vitest run src/__tests__/signer.test.ts
corepack pnpm -C apps/nexus exec vitest run server/utils/__tests__/plugin-signing.test.ts
corepack pnpm -C apps/core-app exec vitest run src/main/modules/plugin/signature-verifier.test.ts src/main/modules/plugin/plugin-installer-trust.test.ts
corepack pnpm -C packages/utils run typecheck
corepack pnpm -C apps/nexus run typecheck
corepack pnpm -C apps/core-app run typecheck:node
corepack pnpm lint:changed
git diff --check
# Packaged isolated-profile install smoke with signed and tampered fixtures
```

## Risky Boundaries

Cryptographic canonicalization, key storage, D1 migrations, CoreApp trust-root updates, pre-extraction ordering and compatibility migration. Never log raw crypto inputs/keys or weaken errors into unsigned fallback.

## Rollback

Rollback pins a previously trusted Nexus key set/verifier and previous signed contract version. Revoked keys stay revoked. If signing service is unavailable, new admission stops; it does not publish unsigned packages.
