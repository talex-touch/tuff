# Release Matrix v2.4.14-beta.54

## Classification

- Result: **pass** for the published release matrix and for the remote production Gate E checks. The single non-pass entry in the host-side Gate E run is a local checkout-state artifact (`version-baseline`), whose assertion is independently verified true for the released commit.
- Observed on 2026-09-30 (UTC) from the host, against published GitHub and Nexus artifacts only.
- Scope: tag/commit identity, same-SHA quality dependency, three-platform build jobs, release assets, updater metadata, manifest v2, Nexus BETA projection, rollback target, RELEASE-channel non-regression, canonical download/signature routes, and macOS native trust of the published DMG.
- Privacy: signed download queries, credentials, cookies, tokens, complete remote payloads, full logs, and installed user profiles are not retained here.

## Release Identity And Workflow

- Annotated tag `v2.4.14-beta.54` resolves to tag object `f33a71d9a4b74b1b17afd63d32cca71755166a22`, whose target is commit `1924e469cdd6cbe8ec48b7e6b0552b49a3e2f8cc` ("Merge pull request #2020 from talex-touch/task/chore/beta-2.4.14-beta.54", committed 2026-09-29T23:26:33Z, parents `2d39fe45c303ab0aedd24180966eccf149d112da` and `29da1b9fff6692d9fc757a63603cd196533be115`), tagged 2026-09-29T23:27:53Z.
- GitHub release `v2.4.14-beta.54` is a published prerelease (`isDraft=false`, `isPrerelease=true`, `publishedAt=2026-09-30T00:38:32Z`, `targetCommitish=master`) with 26 assets. URL: <https://github.com/talex-touch/tuff/releases/tag/v2.4.14-beta.54>
- Build and Release run `36645346385` was triggered by the tag push (`event=push`, `head_branch=v2.4.14-beta.54`, `head_sha=1924e469cdd6cbe8ec48b7e6b0552b49a3e2f8cc`), created 2026-09-29T23:27:58Z, updated 2026-09-30T00:40:55Z, `run_attempt=2`, conclusion `success`. URL: <https://github.com/talex-touch/tuff/actions/runs/36645346385>
- Attempt 1 of that run (2026-09-29T23:28:00Z to 23:38:17Z) has its four jobs all in conclusion `cancelled`, sharing one cancellation timestamp, and produced no release. Attempt 2 contains the six successful jobs:

| Job | Job ID | Runner label | Conclusion |
| --- | --- | --- | --- |
| Release Quality (same SHA) | 109670645295 | ubuntu-24.04 | success |
| Build and Release Tuff App (macos-latest) | 109673712469 | macos-26 | success |
| Build and Release Tuff App (ubuntu-latest) | 109673712520 | ubuntu-24.04 | success |
| Build and Release Tuff App (windows-2022) | 109673712534 | windows-2022 | success |
| Create Release | 109685274598 | ubuntu-latest | success |
| Sync Nexus Release | 109686034328 | ubuntu-latest | success |

- The same tag push also ran Branch Policy run `36645346358` (`success`). No other workflow run exists for this tag.
- Same-SHA hard gate, from `.github/workflows/build-and-release.yml`: `build-and-release` declares `needs: release-quality` plus `if: needs.release-quality.result == 'success'`; `create-release` declares `needs: [release-quality, build-and-release]` and requires `needs.release-quality.result == 'success'`; `sync-nexus-release` declares `needs: [release-quality, create-release]` and again requires `needs.release-quality.result == 'success'`. The Release Quality job checks out the release ref and runs `pnpm quality:release`; the build jobs check out `needs.release-quality.outputs.sha`, so the built bytes are bound to the SHA the gate passed on.
- `quality:release` = `pnpm lint && pnpm typecheck:all && pnpm test:targeted && pnpm -C apps/core-app exec electron-builder --version && pnpm -F @talex-touch/core-app run build`.
- Released commit versions: `package.json` and `apps/core-app/package.json` at `1924e469cdd6cbe8ec48b7e6b0552b49a3e2f8cc` both declare `2.4.14-beta.54` (read from `raw.githubusercontent.com` at that commit).

## Manifest, Assets And Updater Metadata

- Manifest v2 (`tuff-release-manifest.json`, 1493 bytes) declares `version=2.4.14-beta.54`, `channel=BETA`, `tag=v2.4.14-beta.54`, `rollbackFromVersion=2.4.14-beta.53`, `rollbackCompatible=false`, and four preferred core artifacts. Asset URL: <https://github.com/talex-touch/tuff/releases/download/v2.4.14-beta.54/tuff-release-manifest.json>

| Platform | Arch | File | Size (bytes) | Manifest SHA-256 |
| --- | --- | --- | --- | --- |
| win32 | x64 | `windows-2022-beta-tuff-2.4.14-beta.54-setup.exe` | 300269760 | `2f2f4f738fdca8236283421cf9f31e527ff89225e1241f646db7229b41d73d4b` |
| darwin | arm64 | `macos-latest-beta-tuff-2.4.14-beta.54-macos-arm64.dmg` | 521365822 | `a4426b7441dac17a6c0881a777f4f0ef20ccbf829b5f012a88b7871c8297d073` |
| darwin | x64 | `macos-latest-beta-tuff-2.4.14-beta.54-macos-x64.dmg` | 525430847 | `cc409d426d2a3d60af8b467c6714bcf88cc74a1606636a341264cbb7937945fa` |
| linux | x64 | `ubuntu-latest-beta-tuff-2.4.14-beta.54.AppImage` | 346656744 | `fe1b5529ed318a5165af9f25534d8b49d168666cbac860a28fafaf3509e5db97` |

- The release carries 26 assets: the four preferred packages plus `macos-...-arm64.app.zip`, `macos-...-macos-arm64.zip`, `macos-...-macos-x64.zip` and `ubuntu-...-2.4.14-beta.54.deb` — eight signed packages, each with a 685-byte `.sig` sidecar — plus per-platform `*-beta-latest*.yml`, `*-beta-builder-debug.yml`, the manifest, `tuff-release-notes.json`, `release-test-summary.json` and `release-test-summary.md`.
- Published release notes asset `tuff-release-notes.json` (6481 bytes) declares `schemaVersion`, `tag=v2.4.14-beta.54`, `version=2.4.14-beta.54`, `channel=BETA` and `notes.{zh,en}`.
- Updater metadata is bound to the same version:
  - `windows-2022-beta-latest.yml`: `version: 2.4.14-beta.54`, `path: tuff-2.4.14-beta.54-setup.exe`, `releaseDate: 2026-09-30T00:17:01.174Z`.
  - `ubuntu-latest-beta-latest-linux.yml`: `version: 2.4.14-beta.54`, AppImage (346656744, `blockMapSize: 360444`) and deb (473984180), `releaseDate: 2026-09-30T00:10:11.800Z`.
  - `macos-latest-beta-latest-mac.yml`: `version: 2.4.14-beta.54`, x64/arm64 zip (597223287 / 592199703) and x64/arm64 dmg (525430847 / 521365822) with `releaseDate: 2026-09-30T00:30:33.140Z`.

## Artifact Integrity, Architecture And Native Trust

- macOS arm64 DMG was downloaded from the published GitHub asset: HTTP 200, 521365822 bytes, SHA-256 `a4426b7441dac17a6c0881a777f4f0ef20ccbf829b5f012a88b7871c8297d073` — identical to the manifest and to the release summary matrix.
- Its detached sidecar (`...-macos-arm64.dmg.sig`, 685-byte base64 of a 512-byte signature) verifies with `openssl dgst -sha256 -verify apps/core-app/resources/keys/release-signing-public.pem -signature <decoded .sig> <dmg>` → `Verified OK`. The release-summary claim that all published CoreApp packages carry a verified RSA-SHA256 detached signature is therefore independently reproduced for this artifact.
- DMG mounted read-only (`hdiutil attach -readonly -nobrowse`, never installed):
  - `tuff.app` `CFBundleShortVersionString` and `CFBundleVersion` = `2.4.14-beta.54`; `lipo -archs` on the main executable = `arm64` and `file` reports Mach-O 64-bit executable arm64.
  - `Contents/Resources/build-attestation.json`: `schemaVersion=1`, `appId=com.tagzxia.app.tuff`, `version=2.4.14-beta.54`, `channel=BETA`, `platform=darwin`, `arch=arm64`, `commit=1924e469cdd6cbe8ec48b7e6b0552b49a3e2f8cc` (the release commit), `keyFingerprint=a340b58cff2413f11c64b406fa745e76910759d19a211b72d176686b021fb2ed`, `artifact={path: app.asar, sha256: 30b0a99fcf6acb07cae36b717169f2884476e6a20bcb513ab0af340fddc4746b}`; `build-attestation.json.sig` also verifies with the release public key (`Verified OK`).
  - `codesign --verify --deep --strict` → `valid on disk`, `satisfies its Designated Requirement`; authority chain `Developer ID Application: ZiXian Tang (2L5YC85FQ7)` → `Developer ID Certification Authority` → `Apple Root CA`, `TeamIdentifier=2L5YC85FQ7`, hardened-runtime flag set, timestamp Sep 29 2026 17:08:25.
  - `spctl -a -t exec -vv tuff.app` → `accepted`, `source=Notarized Developer ID`.
- Windows installer architecture: a 1 KiB range request against the published `...-setup.exe` returns `MZ`, `e_lfanew=0xd8`, valid `PE\0\0`, optional header magic `0x10b` (PE32) and machine `0x14c` (i386). The NSIS bootstrapper stub is therefore 32-bit; the `win32/x64` classification comes from the manifest and Nexus matrix, not from this header. The x64-ness of the packaged app payload was not independently extracted for beta.54.
- Linux AppImage architecture: a 1 KiB range request against the published `...AppImage` returns ELF (class 2 = 64-bit, little-endian) with `e_machine=0x3e` (x86-64), matching the manifest `linux/x64` pair.
- macOS x64 DMG: the manifest SHA-256 above is recorded, but the artifact was not downloaded or verified on this arm64 host.

## Nexus Projection, Rollback And Channel Non-Regression

- `GET https://tuff.tagzxia.com/api/releases/latest?channel=BETA` → HTTP 200 with `release.tag=v2.4.14-beta.54`, `release.version=2.4.14-beta.54`, `release.channel=BETA`, `release.status=published`.
- `GET https://tuff.tagzxia.com/api/releases/v2.4.14-beta.54?assets=true` → HTTP 200 with release id `6ae4e6e9-367a-4d63-8cdf-cc375d0c8106`, the same tag/version/channel, `rollbackFromVersion=2.4.14-beta.53`, `rollbackCompatible=false`, bilingual `notes`/`notesHtml`, and four assets whose sizes and SHA-256 values equal the manifest table above.
- Projection shape for all four pairs: `sourceType=github`, `fileKey=null`, `signatureKey=null`; `downloadUrl=/api/releases/v2.4.14-beta.54/download/<platform>/<arch>?exp=<10 digits>&sig=<64 hex>`; `signatureUrl` and `fallbackDownloadUrl` both on `github.com`. Observed with a manual-redirect request: the signed same-origin path returns HTTP **302** whose `Location` is the immutable GitHub release asset URL (verified for `darwin/arm64`, `darwin/x64`, `linux/x64`, `win32/x64`). The same path requested without `exp`/`sig` also returns 302 to the same GitHub asset. The signed route therefore gates and binds the request, while the bytes are served by GitHub: this release has no Nexus-hosted mirror copy.
- Nexus exposes no per-asset signature payload for this release: `GET /api/releases/v2.4.14-beta.54/signature/<platform>/<arch>` returns HTTP 404 (checked for `darwin/arm64` and `win32/x64`). The gate reaches the published `.sig` sidecars through the GitHub `signatureUrl` instead, recording source `external`, HTTP 200, valid payload, 685 bytes, kind `opaque-signature` for all four pairs.
- Rollback target: the Nexus BETA published list (`limit=50`) is headed by beta.54, beta.53, beta.52, beta.51, beta.50, beta.48, with `2.4.14-beta.53` present and `published`, consistent with the manifest `rollbackFromVersion`. `rollbackCompatible=false`, and `release-test-summary.md` reports no downgrade execution for any platform.
- Stable non-regression: GitHub `releases/latest` remains `v2.4.13` (published 2026-07-27T07:03:50Z, `prerelease=false`), and Nexus `/api/releases/latest?channel=RELEASE` remains `v2.4.13` `RELEASE` `published`. Beta54 did not become the GitHub "latest" release and did not move the stable channel.

## Production Gate E

- Command (redacted form, manifest file passed as a local path):
  `node scripts/check-release-gates.mjs --tag "v2.4.14-beta.54" --version "2.4.14-beta.54" --stage "gate-e" --manifest <downloaded tuff-release-manifest.json> --base-url "https://tuff.tagzxia.com" --timeout-ms "60000" --report-only`
- Observed: 18 checks, **17 pass / 1 fail**. Every `remote-*` check passes: `remote-release`, `remote-release-metadata`, `remote-notes`, `remote-assets-matrix` (count 4), `remote-github-release-metadata`, `remote-manifest-asset`, `remote-manifest-rollback`, `remote-manifest-integrity`, `remote-manifest-nexus-matrix` (no mismatches), `remote-github-asset-inventory` (26 assets, no missing/duplicate/extra), `remote-asset-integrity`, `remote-signature-endpoint` (4/4 HTTP 200, valid payload, 685 bytes, source `external`), `remote-download-endpoint` (4/4 HTTP 302, `sameOrigin`, `hasExp`+`hasValidExp`, `hasSig`+`hasValidSig`, no duplicate/unexpected query, valid redirect), `remote-latest` (`latestTag=v2.4.14-beta.54`, `latestVersion=2.4.14-beta.54`, `latestChannel=BETA`, `latestStatus=published`).
- Local checks: `manifest` pass; `publish-manifests` pass; `publish-manifests-pack` pass **once `corepack` is resolvable**; `version-baseline` **fail** with detail `Root/Core version drift detected (target 2.4.14-beta.54)`, `rootVersion=2.4.14-beta.53`, `coreVersion=2.4.14-beta.53`.
- Interpretation of the single failure: this working tree is checked out at beta.53, so the check asserted against the wrong tree rather than against the release. The check compares root/core `package.json` versions to the target version, and both files declare `2.4.14-beta.54` at the released commit `1924e469…` (verified from `raw.githubusercontent.com`). The gate was **not** run on a beta.54 checkout during this session, so an 18/18 pass on the release SHA is not claimed here.
- Toolchain note for reproducing this gate: `scripts/check-release-gates.mjs` is not referenced by any workflow — it is an operator-run gate. This host pins Node `26.0.0` via `.node-version`, and that Node line no longer bundles `corepack`, so `publish-manifests-pack` fails with `spawnSync corepack ENOENT` before any package is inspected. With a `corepack` entry on `PATH` resolving to the repository's `packageManager` pnpm `11.24.0`, `node scripts/validate-publish-manifests.mjs --pack` exits 0 and validates `@talex-touch/tuffex`, `@talex-touch/utils`, `@talex-touch/unplugin-export-plugin`, `@talex-touch/tuff-cli`, `@talex-touch/tuff-intelligence`.

## Boundary

- This closes the Beta54 release-matrix and remote production Gate E evidence, and is the newest release-matrix row for AC5.
- It does not substitute release metadata for N/N+1 runtime evidence. `release-test-summary.md` inside this same release reports downgrade acceptance as `static-only` with native trust `not-assessed` and waiver `none` for win32/x64, darwin/arm64 and linux/x64, and the six release jobs contain no runtime update/OTA step. Therefore Beta54 Windows/Linux N/N+1 runtime acceptance and Beta54 macOS OTA are **not** evidenced by this release: AC7 stays blocked, and AC6 keeps its Beta32 → Beta33 evidence.
- The macOS DMG was mounted read-only and never installed; no real user profile, database or `apps/*/dist` tree was modified. `release-quality` passing on the same SHA proves lint/typecheck/tests/preflight/core-app build only — it is not runtime update evidence.
- Not reproduced here: macOS x64 DMG bytes, Windows installer payload architecture, and any real Windows/Linux host behavior.
