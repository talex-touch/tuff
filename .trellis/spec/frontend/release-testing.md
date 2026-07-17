# Release Acceptance Testing

> Contract for validating an already-published Tuff release from the user-facing download path through an isolated packaged runtime.

## 1. Scope / Trigger

Run this contract whenever the user says **“发版测试”**, “release test”, “下载当前发版验证”, or asks whether a published desktop release is usable.

Default target: the version shared by root `package.json` and `apps/core-app/package.json`. A user-supplied tag overrides the default. A release test validates downloaded release bytes; workspace `dist` is never substituted.

The standard gate order is fixed:

1. Remote release identity and matrix.
2. Real host-asset download and integrity/security checks.
3. Isolated packaged runtime smoke.
4. Sanitized evidence summary and cleanup.

## 2. Signatures

```text
version := package.json.version == apps/core-app/package.json.version
tag := explicitTag ?? `v${version}`
baseUrl := https://tuff.tagzxia.com
hostPair := process.platform/process.arch
workRoot := /tmp/tuff-release-acceptance/<tag>
```

Required existing entry points:

```bash
gh release view "$TAG" --repo "talex-touch/tuff" --json tagName,isDraft,isPrerelease,publishedAt,url,assets
node "scripts/check-release-gates.mjs" \
  --tag "$TAG" --version "$VERSION" --stage gate-e \
  --base-url "https://tuff.tagzxia.com" \
  --manifest "$WORK_ROOT/downloads/tuff-release-manifest.json"
node "scripts/update-validate-release-manifest.mjs" \
  --manifest "$WORK_ROOT/downloads/tuff-release-manifest.json"
pnpm -C "apps/core-app" run visible:experience:indexing-diagnostics-probe -- \
  --appBundle "$WORK_ROOT/unpacked/tuff.app" \
  --userDataDir "$WORK_ROOT/profile" \
  --outputDir "<task-evidence-dir>" \
  --seedRecentTaskEvidence
```

macOS host checks:

```bash
shasum -a 256 "$HOST_ASSET"
/usr/bin/ditto -x -k "$HOST_ASSET" "$WORK_ROOT/unpacked"
/usr/bin/plutil -extract CFBundleShortVersionString raw "$APP/Contents/Info.plist"
/usr/bin/lipo -archs "$APP/Contents/MacOS/tuff"
/usr/bin/codesign --verify --deep --strict --verbose=4 "$APP"
/usr/sbin/spctl --assess --type execute --verbose=4 "$APP"
```

## 3. Contracts

### Release identity

- Root version, CoreApp version, GitHub tag, manifest `release.version/tag/channel`, Nexus release, and channel-specific latest must describe one release.
- GitHub prerelease state must match BETA/SNAPSHOT versus RELEASE.
- Record the complete GitHub inventory, but Nexus platform matrix contains only the preferred downloadable artifact per platform/architecture pair.

### Download and integrity

- Download the host artifact through the Nexus signed download URL and follow its redirect to the release asset; do not record `exp` or `sig` values.
- Download the manifest as a separate GitHub metadata asset.
- Local SHA-256 must equal both manifest SHA-256 and GitHub digest.
- Manifest validation is authoritative. Missing signature fields, duplicate platform/architecture entries, or noncanonical names remain release failures even when bytes hash correctly.

### macOS trust

- Bundle version, Mach-O architecture, and executable mode must match the target before launch.
- Ad-hoc signing (`Signature=adhoc`, no team identifier) is not release signing.
- `codesign --verify --deep --strict` must pass.
- `spctl` output containing `override=security disabled` is **blocked evidence**, not a Gatekeeper pass.
- Never remove quarantine, ad-hoc re-sign, disable Gatekeeper, or install into `/Applications` to make a release test pass.

### Isolated runtime

- Launch only the downloaded app with disposable userData and a supervised CDP port.
- Reuse the packaged indexing diagnostics probe as the minimum packaged UI contract: renderer target, Settings shell, indexed-source diagnostics, detail dialog, and typed audit fields.
- Do not log in, use provider keys, modify the real profile, or trigger updater installation.
- Windows/Linux are `static-only` on a macOS runner unless real platform evidence is supplied.

### Evidence and cleanup

- Persist only bounded, sanitized summaries. Remove signed query values, personal paths, raw userData, downloaded binaries, unpacked apps, and full logs.
- A test run may complete while the release result is `fail`; never turn a completed test execution into a successful release claim.
- Stop the supervised process and remove `/tmp/tuff-release-acceptance/<tag>` after curated evidence is written.

### Release creation

- `create-release` must fail before publishing when `RELEASE_SIGNING_PRIVATE_KEY` is missing, malformed, or does not match the public key pinned in CoreApp/Nexus.
- Every published CoreApp package gets an RSA-SHA256 base64 `.sig`; manifest `artifacts` contains only one preferred package per `platform/arch` and names its sidecar without listing the sidecar as a downloadable artifact.
- Nexus sync consumes only validated manifest entries. Each linked asset carries the manifest SHA-256 and the matching GitHub sidecar `signatureUrl`; it must not infer or upsert `.sig` files as platform assets.
- Official macOS jobs require Developer ID credentials plus one complete Apple notarization credential set. The postprocess must preserve the electron-builder signature, use a metadata-preserving archive, and emit passed codesign/TeamIdentifier/Gatekeeper/notarization evidence before upload.
- Before GitHub Release creation, the workflow re-hashes every preferred asset, verifies every published package sidecar, merges macOS native-trust evidence, writes `release-test-summary.json` / `.md`, and appends Markdown to the Actions step summary. A failed summary blocks release creation.
- Every CI release build must create `build-attestation.json` plus `build-attestation.json.sig` inside the packaged resources before native code signing. The signed payload binds `appId`, version/channel, platform/architecture, commit, pinned-key fingerprint, and the physical `app.asar` SHA-256. Missing/mismatched `RELEASE_SIGNING_PRIVATE_KEY` fails the build; local builds may remain explicitly unsigned.
- Packaged runtime verification is offline and fail closed for malformed, mismatched, or tampered attestations: verify the detached signature with the embedded public key, validate build identity, and hash the physical `app.asar` through Electron `original-fs`. Only a valid result sets `isOfficialBuild=true`; a package with no attestation stays unsigned without being misreported as a verification failure.
- `create-release` must run `scripts/check-release-signing-trust-roots.mjs` before collecting assets. CoreApp PEM, Nexus resource PEM, Nexus server PEM, and the Cloudflare worker fallback module must resolve to one SPKI SHA-256 fingerprint; any drift blocks publication.

## 4. Validation & Error Matrix

| Condition | Classification |
|---|---|
| Root/Core version mismatch | `fail`; stop target resolution |
| GitHub/Nexus/latest/manifest identity mismatch | `fail` |
| Host artifact missing | `fail`; runtime blocked |
| Local SHA differs from manifest or GitHub digest | `fail`; never extract/launch |
| Manifest lacks signatures or duplicates a platform pair | `fail`; independent hash checks may continue |
| Nexus signed URL missing/invalid or does not download binary bytes | `fail` |
| Signature endpoint 404 or signing public key absent | `fail` |
| CoreApp/Nexus PEM or worker fallback fingerprints diverge | `fail`; stop before collecting release assets |
| CI package lacks build attestation or its private key mismatches the pinned public key | `fail`; package creation stops |
| Runtime attestation signature/identity/`app.asar` digest mismatch | `fail`; `isOfficialBuild=false`, security banner remains eligible |
| Bundle version/architecture/executable mismatch | `fail`; runtime blocked |
| Deep strict codesign failure or ad-hoc-only signature | `fail` |
| `spctl` says security assessment disabled | `blocked`, never `pass` |
| Packaged probe cannot obtain CDP/renderer | `fail` |
| Packaged probe passes with disposable profile | runtime `pass`; does not erase integrity/signing failures |
| Non-host platform only has metadata/download evidence | `static-only` |
| Authenticated GitHub query is rate-limited/unavailable | retry once; then `blocked` |

## 5. Good / Base / Bad Cases

- **Good:** identity, manifest, signed platform matrix, local digest, native signature/Gatekeeper, and isolated packaged probe all pass; temporary state is removed.
- **Base:** host bytes, version, architecture, and runtime pass, but signatures are absent. Report release `fail` with a separate runtime `pass`—do not collapse the two.
- **Bad:** launch a workspace build instead of the downloaded artifact, install over the user's app, reuse the real profile, redact a failure, claim Windows/Linux runtime from macOS, or call a production write endpoint.

## 6. Tests Required

Each “发版测试” run must assert and record:

- GitHub tag/prerelease and full asset inventory.
- Nexus release/latest identity and preferred three-platform matrix.
- Manifest validator result and exact issue categories.
- Real Nexus host download reaches binary bytes and matches manifest/GitHub SHA-256.
- Signature endpoint results and signing-key configuration.
- Repository trust-root gate passes and the built Nexus `/api/releases/signing-key` fallback returns the same SPKI fingerprint.
- Host bundle version, architecture, executable mode, deep codesign, and Gatekeeper result.
- Packaged probe `ok`, renderer target count, Settings/diagnostics/detail visibility, audit-field gate, profile removal, and process termination.
- Packaged build-attestation result: official packages report `isOfficialBuild=true`; an attestation or `app.asar` mutation reports `verificationFailed=true`.
- Sanitization: no signed query values, credentials, personal paths, raw profiles, or downloaded packages remain in committed evidence.

## 7. Wrong vs Correct

### Wrong

```bash
# Local build and real profile prove neither the published bytes nor isolation.
pnpm build:beta:mac
open "apps/core-app/dist/mac-arm64/tuff.app"
# Treat an HTTP redirect or ad-hoc signature as release success.
```

### Correct

```bash
# Resolve one published tag, download through the user-facing signed endpoint,
# cross-check the exact bytes, then launch the downloaded bundle in isolation.
node scripts/check-release-gates.mjs --tag "$TAG" --version "$VERSION" \
  --stage gate-e --base-url "https://tuff.tagzxia.com" \
  --manifest "$WORK_ROOT/downloads/tuff-release-manifest.json"
shasum -a 256 "$HOST_ASSET"
pnpm -C "apps/core-app" run visible:experience:indexing-diagnostics-probe -- \
  --appBundle "$WORK_ROOT/unpacked/tuff.app" \
  --userDataDir "$WORK_ROOT/profile" \
  --outputDir "<task-evidence-dir>" --seedRecentTaskEvidence
```

## Scenario: Deferred Apple Developer Signing

### 1. Scope / Trigger

- Trigger: every macOS release build until the repository owner explicitly states that Apple Developer signing and notarization credentials are configured.
- This is a deliberate product-risk waiver, not evidence that ad-hoc signing passes Gatekeeper. Detached release signatures remain mandatory on every platform.

### 2. Signatures

```text
TUFF_MAC_NATIVE_SIGNING_MODE := "waived" | "developer-id"
verify-macos-release-signing.mjs --mode <mode> --app-bundle <path> --output <json>

MacSigningEvidence := {
  mode: "waived" | "developer-id",
  status: "waived" | "pass" | "fail",
  policyReason: "apple-developer-not-configured" | null,
  signingKind: "developer-id" | "ad-hoc-or-missing",
  teamIdentifier: string | null,
  checks: { codesign: boolean, gatekeeper: boolean, notarization: boolean }
}

ReleaseTestSummary.checks.macosNativeTrust := true | "waived"
```

### 3. Contracts

- No `CSC_*` and no Apple notarization secrets -> select `waived`, set `TUFF_OFFICIAL_RELEASE_BUILD=false`, retain ad-hoc postprocess, and publish explicit waived evidence.
- Complete `CSC_LINK` / `CSC_KEY_PASSWORD` plus one complete notarization credential set -> select `developer-id`, set `TUFF_OFFICIAL_RELEASE_BUILD=true`, and enforce electron-builder signing/notarization.
- Partial certificate or partial notarization configuration -> fail before build. Never hide misconfiguration behind the waiver.
- `waived` evidence may let the release summary pass only when manifest, SHA-256, and every detached `.sig` pass. The summary and release asset must visibly retain `policyReason: apple-developer-not-configured` and `macosNativeTrust: waived`.
- The waiver stays active until the owner explicitly announces Apple Developer setup; agents must not repeatedly request purchase/configuration before then.

### 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| All Apple/CSC secrets absent | `waived`; build and release may continue |
| Only one of `CSC_LINK` / `CSC_KEY_PASSWORD` present | `fail`; partial certificate configuration |
| Certificate complete, notarization absent | `fail`; incomplete `developer-id` configuration |
| Notarization fields partially populated | `fail`; partial notarization configuration |
| `developer-id` checks all pass | `pass`; `macosNativeTrust: true` |
| Any `developer-id` check fails | `fail`; release blocked |
| `waived` evidence has the wrong/missing policy reason | `fail`; malformed waiver evidence |
| Detached signature fails in either mode | `fail`; Apple waiver does not apply |

### 5. Good / Base / Bad Cases

- **Good:** Apple credentials are complete, Developer ID/TeamIdentifier/Gatekeeper/notarization pass, and detached signatures pass.
- **Base:** all Apple credentials are absent, evidence is explicitly `waived`, detached signatures pass, and the release summary preserves the accepted risk.
- **Bad:** label ad-hoc signing as trusted, silently downgrade partially configured credentials, or waive detached signatures because Apple Developer is unavailable.

### 6. Tests Required

- Credential-mode resolver: all absent -> `waived`; complete certificate + either complete notarization set -> `developer-id`; every partial combination -> error.
- macOS verifier: unsigned/ad-hoc fixture + `waived` -> status `waived`; same fixture + `developer-id` -> non-zero and status `fail`.
- Release summary: valid waived evidence -> overall pass with `macosNativeTrust: "waived"`; wrong reason or failed detached signature -> non-zero fail summary.
- Workflow YAML parse plus a focused assertion that only `developer-id` exports `TUFF_OFFICIAL_RELEASE_BUILD=true`.

### 7. Wrong vs Correct

#### Wrong

```bash
# Missing Apple credentials block every beta forever, or are mislabeled as trusted.
test -n "$CSC_LINK" || exit 1
echo 'macosNativeTrust=true'
```

#### Correct

```bash
# Absence is an explicit accepted-risk mode; partial setup is still an error.
if no_apple_credentials; then
  export TUFF_MAC_NATIVE_SIGNING_MODE=waived
  export TUFF_OFFICIAL_RELEASE_BUILD=false
elif complete_developer_id_credentials; then
  export TUFF_MAC_NATIVE_SIGNING_MODE=developer-id
  export TUFF_OFFICIAL_RELEASE_BUILD=true
else
  exit 1
fi
```
