# Release Matrix v2.4.14-beta.32

## Classification

- Result: **pass**. Strict production Gate E completed with `18/18` checks passing.
- Scope: published GitHub release, release workflow, Nexus latest projection, manifest v2, preferred platform assets, canonical download routes, package integrity, macOS native trust, and packaged attestation.
- Privacy: signed URL queries, credentials, cookies, tokens, complete remote payloads, full logs, and downloaded binaries are not retained here.

## Release Identity And Workflow

- GitHub release `v2.4.14-beta.32` is a published prerelease targeting commit `a0854d8a901dd0cd4db59ed725725554e7ee0af5`; it contains 26 assets.
- Build and Release run `34152177281` completed successfully. The same-SHA Release Quality job, macOS, Windows, and Linux build jobs, and Create Release job all passed.
- The manifest identifies version `2.4.14-beta.32`, channel `BETA`, tag `v2.4.14-beta.32`, rollback source `2.4.14-beta.31`, and `rollbackCompatible=false`.
- Nexus latest resolves the same tag/version and projects all four preferred platform pairs with signed same-origin download routes plus immutable GitHub fallback routes.

## Gate E And Artifact Integrity

- Command: `node scripts/check-release-gates.mjs --tag "v2.4.14-beta.32" --version "2.4.14-beta.32" --stage "gate-e" --manifest <downloaded-manifest> --base-url "https://tuff.tagzxia.com" --timeout-ms "60000"`.
- Result: `pass`; status counts were `{ pass: 18 }`; no non-pass checks were returned.
- The official macOS arm64 updater asset is `512529137` bytes. Its downloaded SHA-256 is `f5a3add492f860be642cfdd6818eace2ed0af4a5186228d8aaf110afcdad89d1`, matching the manifest, and its detached RSA/SHA-256 signature verifies with the repository release public key.
- The installed target bundle reports `2.4.14-beta.32`, arm64, and attestation commit `a0854d8a901dd0cd4db59ed725725554e7ee0af5`.
- The replaced bundle passes `codesign --verify --deep --strict` and Gatekeeper reports `source=Notarized Developer ID`.

## Boundary

- This closes the release-matrix portion of AC5 for Beta32.
- It does not substitute static release metadata for N/N+1 runtime evidence; the macOS runtime transition is recorded separately.
- Windows and Linux still require their own real N/N+1 runtime evidence before AC7 can pass.
