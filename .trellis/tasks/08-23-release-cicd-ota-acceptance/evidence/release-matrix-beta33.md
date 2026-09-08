# Release Matrix v2.4.14-beta.33

## Classification

- Result: **pass**. The first macOS build attempt failed at DMG cleanup because the hosted runner could not eject a busy device; the failed run was not published. The failed macOS job was rerun, then the release was created and Nexus was synchronized successfully.
- Scope: published GitHub release, same-SHA quality gate, three-platform builds, macOS signing/notarization, Nexus latest projection, manifest v2, preferred platform assets, and production Gate E.
- Privacy: signed URL queries, credentials, cookies, tokens, complete remote payloads, full logs, and downloaded binaries are not retained here.

## Release Identity And Workflow

- GitHub release `v2.4.14-beta.33` is a published prerelease targeting master merge commit `58e6a8da7e67d0cce530e865fc4afe100afb86b8`; it contains 26 assets.
- Build and Release workflow run `34205184498` completed successfully after the failed macOS job was rerun. Final jobs: Release Quality, Ubuntu 24.04, Windows 2022, macOS 26, Create Release, and Sync Nexus all passed.
- The first macOS attempt failed only at `dmgbuild` detach with `hdiutil: couldn't eject ... Resource busy`; no release was created from that attempt. The rerun completed the same build, signing, notarization, artifact verification, and smoke steps.
- The manifest identifies version `2.4.14-beta.33`, channel `BETA`, tag `v2.4.14-beta.33`, rollback source `2.4.14-beta.32`, and `rollbackCompatible=false`.
- Nexus latest resolves the same tag/version and exposes all four preferred platform pairs with signed same-origin download projection plus GitHub fallback and signature metadata.

## Gate E And Artifact Integrity

- Command: `node scripts/check-release-gates.mjs --tag "v2.4.14-beta.33" --version "2.4.14-beta.33" --stage "gate-e" --manifest <downloaded-manifest> --base-url "https://tuff.tagzxia.com" --timeout-ms "60000"`.
- Result: `pass`; status counts were `{ pass: 18 }`; no non-pass checks were returned.
- The manifest and Nexus projection agree on the preferred asset sizes and SHA-256 values. The macOS arm64 DMG is `512650125` bytes with SHA-256 `7fcd24bb1b5c8164dacfb18402a5b4997077586ebf66fd18d47a555ab8514858`; its detached RSA/SHA-256 signature verifies with the repository release public key.
- The macOS arm64 artifact contains version `2.4.14-beta.33`, arm64 executable metadata, and attestation commit `58e6a8da7e67d0cce530e865fc4afe100afb86b8`.
- The installed target bundle passes `codesign --verify --deep --strict`; Gatekeeper reports `source=Notarized Developer ID`.

## Boundary

- This closes the Beta33 release-matrix and production Gate E evidence.
- It does not substitute release metadata for N/N+1 runtime evidence; the actual Beta32 -> Beta33 transition is recorded separately.
- Windows and Linux still require their own real N/N+1 runtime evidence before AC7 can pass.
