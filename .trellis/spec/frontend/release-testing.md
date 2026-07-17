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
- Host bundle version, architecture, executable mode, deep codesign, and Gatekeeper result.
- Packaged probe `ok`, renderer target count, Settings/diagnostics/detail visibility, audit-field gate, profile removal, and process termination.
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
