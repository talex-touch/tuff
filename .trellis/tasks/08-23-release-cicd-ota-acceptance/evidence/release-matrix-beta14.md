# Release Matrix v2.4.14-beta.14

## Classification

- Result: **partial**. Strict Gate E is `fail`; AC5 remains open.
- Scope: read-only production GitHub/Nexus metadata, canonical download routes, host artifact integrity, macOS native trust, packaged attestation, and isolated runtime evidence.
- Privacy: no signed redirect query, credential, cookie, token, raw profile, binary, or full Gate E JSON is retained here.

## Passed Evidence

- Root/Core version, GitHub tag, Nexus release/latest, and manifest identity all resolve to `2.4.14-beta.14` / `BETA`.
- GitHub release is a non-draft prerelease with 26 assets. All eight packages have digests and detached signature sidecars.
- The four preferred platform/architecture entries match manifest and GitHub names, SHA-256 values, and sidecar names.
- Manifest v2 validation passes with rollback target `2.4.14-beta.13` and `rollbackCompatible=false`.
- All four canonical download HEAD requests redirect. A host macOS Range request returns partial binary content; the full DMG SHA-256 matches manifest/GitHub and its detached signature verifies.
- Repository and production signing-key trust roots match.
- The macOS app has the expected beta.14 version and arm64 executable mode. Developer ID, deep strict codesign, stapler, Gatekeeper, build attestation, mutation fail-closed checks, and the isolated packaged probe pass.

## Failing Gate

- The production Nexus API still projects public GitHub fallback download URLs instead of same-origin signed Nexus download URLs.
- `remote-manifest-nexus-matrix` and `remote-download-endpoint` therefore fail strict Gate E.
- The production download signing secret is not active for this projection and unsigned fallback remains enabled. This run did not change production secrets.
- Canonical Nexus signature routes return `404` because the projection has no signature key. The configured external GitHub signature URLs remain valid, so this is recorded as projection debt rather than a separate integrity failure.

## Local Remediation (Not Deployed)

- The current worktree makes `missing-secret` fail closed when unsigned fallback is disabled for both GET and HEAD downloads; compatibility remains unchanged when fallback is enabled.
- Before the resolver fix, the two new regression cases failed because both methods served the asset instead of returning `403`. After the fix, all 14 focused cases pass; Nexus typecheck and scoped ESLint also pass.
- This code is not part of beta.14 and has not been deployed. The production observations and strict Gate E failure above remain unchanged.

## Re-Acceptance Gate

1. Configure the production download-signing secret through the authorized secret-management path and disable unsigned fallback as intended.
2. Deploy the projection change and rerun strict Gate E without persisting raw redirect URLs.
3. Require same-origin signed download metadata for all four preferred pairs, successful canonical signature routes, and unchanged artifact digests/native trust.
