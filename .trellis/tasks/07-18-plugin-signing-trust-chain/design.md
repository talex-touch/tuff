# Plugin Signing Trust Chain - Design

## Trust Layers

1. **Content integrity**: SHA-256 of final `.tpex` bytes and file-map digest.
2. **Publisher identity**: publisher Ed25519 signature over a canonical payload.
3. **Nexus admission**: Nexus Ed25519 attestation over the verified publisher payload, policy/scan decisions and artifact digest.
4. **CoreApp trust**: pinned/updated Nexus trust roots plus publisher key status from the signed attestation.

These fields use distinct names; the existing registry `signature` digest is migrated to `artifactSha256`.

## Canonical Payload

Use an explicit versioned object and deterministic UTF-8 serialization with sorted keys and no optional-field ambiguity:

```ts
interface PluginSigningPayloadV1 {
  contract: 'talex.plugin-signing/v1'
  policyVersion: string
  pluginId: string
  pluginName: string
  version: string
  channel: PluginChannel
  artifactSha256: string
  fileMapSha256: string
  issuedAt: string
  expiresAt?: string
}
```

Nexus attestation adds publisher key id, publisher signature digest, scan report digest/decision, review identity/time and Nexus key id.

## Key Management

- Publisher private keys come from OS keychain, CI secret provider or HSM adapter; CLI accepts a signer interface, not a raw key embedded in config.
- Public keys are registered to authenticated publisher identities with key id, algorithm, created/valid/revoked times and audit owner.
- Nexus private keys remain server-side secret bindings; CoreApp ships trusted public roots/key set metadata.
- `key.talex` is removed from trust semantics and eventually from packages; it is never interpreted as a private/public signing key.

## Verification Order

Nexus: artifact digest -> package policy/integrity -> publisher signature/key status -> security scan -> review -> admission attestation.

CoreApp: download digest/size -> attestation signature/root -> payload identity/version/channel -> publisher signature/key status recorded by attestation -> package extraction/install.

Verification stops before extraction/enable on failure and returns stable codes without raw crypto errors.

## Rotation and Revocation

Key sets are versioned and signed. Rotation supports an overlap window with both keys valid. Revocation is append-only, carries effective time/reason, invalidates Nexus eligibility immediately and is considered by CoreApp for new installs/updates. Historical evidence retains the key status at verification time plus current revocation state.

## Migration

Shadow-generate signatures while existing digest fields remain readable, backfill current approved artifacts, then hard-cut official registry admission/install to signed attestations. No indefinite unsigned official fallback remains. Local developer install uses a separate explicit dev-trust decision.

## Rollback

Rollback may pin the previous trusted Nexus key set or verifier implementation; it never re-enables revoked keys or treats a digest as an identity signature.
