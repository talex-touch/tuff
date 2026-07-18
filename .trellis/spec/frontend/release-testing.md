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

| Condition                                                                              | Classification                                                    |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Root/Core version mismatch                                                             | `fail`; stop target resolution                                    |
| GitHub/Nexus/latest/manifest identity mismatch                                         | `fail`                                                            |
| Host artifact missing                                                                  | `fail`; runtime blocked                                           |
| Local SHA differs from manifest or GitHub digest                                       | `fail`; never extract/launch                                      |
| Manifest lacks signatures or duplicates a platform pair                                | `fail`; independent hash checks may continue                      |
| Nexus signed URL missing/invalid or does not download binary bytes                     | `fail`                                                            |
| Signature endpoint 404 or signing public key absent                                    | `fail`                                                            |
| CoreApp/Nexus PEM or worker fallback fingerprints diverge                              | `fail`; stop before collecting release assets                     |
| CI package lacks build attestation or its private key mismatches the pinned public key | `fail`; package creation stops                                    |
| Runtime attestation signature/identity/`app.asar` digest mismatch                      | `fail`; `isOfficialBuild=false`, security banner remains eligible |
| Bundle version/architecture/executable mismatch                                        | `fail`; runtime blocked                                           |
| Deep strict codesign failure or ad-hoc-only signature                                  | `fail`                                                            |
| `spctl` says security assessment disabled                                              | `blocked`, never `pass`                                           |
| Packaged probe cannot obtain CDP/renderer                                              | `fail`                                                            |
| Packaged probe passes with disposable profile                                          | runtime `pass`; does not erase integrity/signing failures         |
| Non-host platform only has metadata/download evidence                                  | `static-only`                                                     |
| Authenticated GitHub query is rate-limited/unavailable                                 | retry once; then `blocked`                                        |

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

| Condition                                             | Result                                          |
| ----------------------------------------------------- | ----------------------------------------------- |
| All Apple/CSC secrets absent                          | `waived`; build and release may continue        |
| Only one of `CSC_LINK` / `CSC_KEY_PASSWORD` present   | `fail`; partial certificate configuration       |
| Certificate complete, notarization absent             | `fail`; incomplete `developer-id` configuration |
| Notarization fields partially populated               | `fail`; partial notarization configuration      |
| `developer-id` checks all pass                        | `pass`; `macosNativeTrust: true`                |
| Any `developer-id` check fails                        | `fail`; release blocked                         |
| `waived` evidence has the wrong/missing policy reason | `fail`; malformed waiver evidence               |
| Detached signature fails in either mode               | `fail`; Apple waiver does not apply             |

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

## Scenario: Runtime OTA Provider and Integrity Boundary

### 1. Scope / Trigger

- Trigger: changing CoreApp update discovery, Nexus/GitHub fallback, release cache, manifest parsing, update download requests, package hash/signature verification, or installer handoff.
- This contract prevents a renderer-supplied URL, an unsigned historical asset, a provider failure misclassification, or a network-supplied public key from reaching installation.

### 2. Signatures

```ts
interface UpdateDownloadRequest {
  tag: string
}

type UpdateProviderOutcome =
  | { kind: 'candidate'; source: 'nexus' | 'github'; release: GitHubRelease; usedNetwork: boolean }
  | { kind: 'none'; source: 'nexus' | 'github'; authoritative: boolean; message?: string }
  | { kind: 'policy-block'; source: 'nexus'; reason: string }
  | { kind: 'transient-failure'; source: 'nexus' | 'github'; reason: string }

validateUpdateReleaseManifest(payload, expectation):
  | { valid: true; manifest: UpdateReleaseManifest; artifact: UpdateReleaseArtifact }
  | { valid: false; reason: string }

SignatureVerifier.verifyFileSignatureWithCache(filePath, signatureUrl, signatureCachePath):
  Promise<{ valid: boolean; reason?: string }>
```

### 3. Contracts

- Renderer download requests carry only a release tag. Main reloads the persisted release and rejects missing, stale, mismatched, or unknown tags; renderer-provided URLs/checksums/signatures are never trusted.
- Official discovery is Nexus-first. A valid Nexus candidate, authoritative no-update, or policy block ends the lookup. Only timeout, network-unreachable, HTTP 429, or HTTP 5xx may query GitHub.
- Explicit HTTP status wins over message regex classification: `NETWORK_HTTP_STATUS_404` is not a network timeout and must not fall through to GitHub.
- Nexus/GitHub caches are isolated by provider identity and channel. A stale verified candidate is eligible only after both provider attempts fail.
- Both providers produce a release with explicit `source`; `UpdateSystem` resolves one normalized candidate from a schema-valid manifest and the current `platform/arch` Core artifact.
- Main streams SHA-256 and RSA-SHA256 verification. Core installation requires manifest SHA-256, detached signature URL, a locally cached signature payload, and the public key embedded in the app bundle; quit preflight never re-fetches the signature.
- `signatureKeyUrl`, runtime signing-key download, and `TUFF_UPDATE_REQUIRE_SIGNATURE` are forbidden. Missing integrity metadata is an install failure, not a compatibility mode.

### 4. Validation & Error Matrix

| Condition                                          | Result                                          |
| -------------------------------------------------- | ----------------------------------------------- |
| Nexus returns published candidate                  | Use Nexus; do not call GitHub                   |
| Nexus returns no release                           | Authoritative `none`; do not call GitHub        |
| Nexus returns non-published release                | `policy-block`; do not call GitHub              |
| Nexus 404/other non-transient 4xx                  | Fail; do not call GitHub                        |
| Nexus timeout/429/5xx                              | Query GitHub                                    |
| Both providers fail, verified stale cache exists   | Return stale candidate with `usedNetwork=false` |
| Manifest identity/pair/SHA/signature field invalid | Reject candidate                                |
| Renderer sends unknown/stale tag                   | Reject download request                         |
| SHA-256 mismatch or signature/key missing/invalid  | Never trigger installer/openPath                |

### 5. Good / Base / Bad Cases

- **Good:** Nexus returns a signed release; main resolves its tag, streams hash/signature verification with the embedded key, and only then exposes installer handoff.
- **Base:** Nexus times out, GitHub returns the same complete manifest contract, and the normalized GitHub candidate follows the same verifier.
- **Bad:** send a full release object from renderer, treat every `NETWORK_*` error as transient, reuse one cache across providers/channels, infer a package from filename when manifest is missing, or fetch the verification key beside the signature.

### 6. Tests Required

- Provider matrix: Nexus candidate, authoritative none, policy block, timeout, 429, 5xx, non-transient 404, cache source/channel isolation, and stale cache only after both failures.
- Manifest guard: valid target pair plus identity mismatch, duplicate pair, missing target, malformed SHA-256, and missing signature sidecar name.
- Download boundary: renderer/tag request resolves a main-owned persisted release; unknown/stale tag fails.
- Integrity: every hash/signature stream chunk is consumed; no whole-package `readFile`; mismatch/missing key/missing signature cannot spawn/open an installer.

### 7. Wrong vs Correct

#### Wrong

```ts
updateSdk.download(release); // renderer controls URL and integrity metadata
if (!signatureUrl) await triggerInstallation(path);
const key = await fetch(`${origin}/api/releases/signing-key`);
```

#### Correct

```ts
updateSdk.download({ tag: release.tag_name });
const trustedRelease = await updateRepository.getRecordByTag(tag);
const candidate = await resolveUpdateCandidate(trustedRelease);
await verifySha256AndPinnedSignature(candidate);
await updateInstallCoordinator.scheduleInstallNow(verifiedTaskId);
```

## Scenario: Persistent OTA Lifecycle

### 1. Scope / Trigger

- Trigger: changing update check/download/verification/install state, `update:get-status`, DownloadCenter update-task projection, updater restart recovery, or normal-quit installation settings.
- The contract prevents renderer booleans, DownloadCenter completion, or a legacy pending-version string from becoming application-update truth.

### 2. Signatures

```ts
type UpdateLifecyclePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'install-scheduled'
  | 'handoff-started'
  | 'awaiting-health'
  | 'healthy'
  | 'recovery-required'
  | 'recovering'
  | 'recovered'
  | 'failed'

UpdateAttemptRepository.createChecking(input): Promise<UpdateLifecycleSnapshot>
UpdateAttemptRepository.transition({ attemptId, expectedRevision, expectedPhase, to, patch }):
  Promise<UpdateLifecycleSnapshot>
UpdateGetStatusResponse = UpdateOpResponse<UpdateLifecycleSnapshot>
shouldAcceptUpdateLifecycleSnapshot(current, incoming): boolean
```

### 3. Contracts

- `app_update_attempts` is the lifecycle source of truth. Release records own discovery/user decisions; DownloadCenter owns bytes and progress only.
- One partial unique SQLite index permits exactly one non-terminal attempt. Every transition is an atomic compare-and-transition on attempt id, revision, and expected phase.
- Revisions increase once per committed transition. Invalid edges, stale revisions, cross-attempt commands, and terminal resurrection fail closed.
- Download completion enters `verifying`; only streamed checksum and pinned detached-signature success enters `ready`. Completion alone never launches an installer.
- `update:get-status` and update action responses expose the authoritative snapshot. Renderer accepts a same-attempt snapshot only when its revision is not older, and orders different attempts by `createdAt`.
- `installOnNormalQuit` replaces the legacy immediate-handoff setting and defaults true. New-key values win; legacy true/false values migrate once; unlinked pending-version strings are removed, not promoted to `ready`.

### 4. Validation & Error Matrix

| Condition                                                   | Result                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------- |
| Second active attempt                                       | SQLite unique constraint / lifecycle conflict           |
| Expected revision or phase changed                          | `UPDATE_LIFECYCLE_CONFLICT`; persisted row unchanged    |
| Download cancelled                                          | `downloading -> available`; task reference cleared      |
| Download failed                                             | `failed` with stable retryable error                    |
| Checksum/signature fails                                    | `failed`; installer handoff forbidden                   |
| Process restarts during DownloadCenter task                 | Restore attempt by task id and resume status monitoring |
| Process restarts during verification                        | Re-run verification before `ready`                      |
| Incoming renderer snapshot is stale                         | Retain the newer snapshot                               |
| Legacy pending version lacks trusted task/integrity linkage | Remove it and require a new download                    |

### 5. Good / Base / Bad Cases

- **Good:** a persisted attempt survives process restart, DownloadCenter reports completion, verification commits `ready`, and all consumers observe the same revisioned snapshot.
- **Base:** a download is cancelled, the attempt returns to `available`, and a later explicit download can retry without another active row.
- **Bad:** infer ready from a completed task, keep lifecycle in renderer refs, update phase without CAS, resurrect a terminal attempt, or treat a pending version string as verified state.

### 6. Tests Required

- Reducer: full healthy path, every legal edge, cancellation, stable failure, invalid edge, stale revision, cross-attempt command, terminal duplicate.
- Repository: production migration, restart restore, revision CAS, stale write preservation, one-active uniqueness, terminal-to-new-attempt behavior.
- Service/settings: snapshot responses, download completion never auto-hands-off, new/legacy/missing setting precedence, and legacy-key removal.
- Renderer/shared: stale revision, terminal resurrection, and cross-attempt `createdAt` ordering.

### 7. Wrong vs Correct

#### Wrong

```ts
if (downloadTask.status === "completed") downloadReady.value = true;
settings.pendingInstallVersion = version;
await installUpdate(taskId); // completion path launches installer
```

#### Correct

```ts
const verifying = await attempts.transition({
  expectedPhase: "downloading",
  to: "verifying",
});
await updateSystem.verifyDownloadedUpdate(verifying.taskId!);
const ready = await attempts.transition({
  expectedPhase: "verifying",
  to: "ready",
});
if (shouldAcceptUpdateLifecycleSnapshot(current, ready)) current = ready;
```

## Scenario: Unified OTA Install Handoff and Recovery

### 1. Scope / Trigger

- Trigger: changing install-now, normal-quit installation, Electron quit handling, platform installer commands, startup health, or previous-version recovery.
- This contract prevents system shutdown from installing, modules from closing before OTA preflight, helper replay, and a launched installer from being reported as a healthy update.

### 2. Signatures

```ts
type QuitIntentKind =
  | 'user-normal'
  | 'update-now'
  | 'system-shutdown'
  | 'startup-failure'
  | 'duplicate-instance'
  | 'other'

UpdateInstallCoordinator.scheduleInstallNow(taskId): Promise<UpdateLifecycleSnapshot>
UpdateInstallCoordinator.handleBeforeQuit(intent): Promise<void>
UpdateInstallCoordinator.handleWillQuit(intent): void
UpdateInstallCoordinator.confirmStartupHealth(): Promise<void>

UpdateHandoffPlanV1 := {
  schemaVersion: 1
  attemptId: string
  token: string
  parentPid: number
  currentVersion: string
  targetVersion: string
  taskId: string
  packagePath: string
  ackPath: string
  markerPath: string
  handoff: UpdateHandoffCommand
  recovery: UpdateHandoffCommand | null
}
```

### 3. Contracts

- `UpdateInstallCoordinator` is the only application-update installer owner. Transport actions schedule a verified task and request typed quit; they never spawn/open an installer directly.
- `user-normal` may hand off only when `installOnNormalQuit=true`; `update-now` may hand off only an `install-now` lifecycle. System shutdown, startup failure, duplicate instance, and other exits never prepare or launch OTA.
- `ModuleManager` awaits `BEFORE_MODULES_UNLOAD` before stop/destroy. OTA hash, cached detached-signature verification, plan persistence, previous selection, and `handoff-started` CAS complete there while SQLite is writable.
- Actual `will-quit` performs only detached helper spawn/unref. The helper waits for the parent PID to exit, rejects escaped/stale/mismatched/replayed plans, and performs at most one recovery.
- macOS uses DownloadCenter plus apply/restore scripts and a retained `.app` backup. Windows resolves interactive NSIS/MSI commands. Linux accepts only executable AppImage or `xdg-open` deb handoff. Unsupported formats fail closed.
- A detached signature is fetched and cached during verification; install preflight re-verifies package bytes against the local cache and pinned key without network access.
- Target startup moves `handoff-started -> awaiting-health`; only target-version match plus completed renderer/main/module readiness and writable repository moves to `healthy` and writes the token-bound ack.
- Healthy startup atomically promotes exactly one verified package as future previous. A recovery marker plus old-version startup moves `recovery-required -> recovering -> recovered`; helper/runtime JSON never overrides another SQLite attempt or token.

### 4. Validation & Error Matrix

| Condition                                                                          | Result                                                        |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Quit intent is not `user-normal`/`update-now`                                      | Leave `ready` unchanged; no plan/helper                       |
| Normal quit setting is false                                                       | Leave `ready` unchanged                                       |
| Task, checksum, cached signature, schema, path, token, or platform command invalid | `failed`; no helper                                           |
| Duplicate BEFORE/WILL/helper execution                                             | Idempotent; one plan and one helper/recovery                  |
| Target version starts and readiness completes                                      | `awaiting-health -> healthy`; promote previous; ack           |
| Current/previous version remains intact                                            | `recovery-required -> recovering -> recovered`; recovered ack |
| Unrelated version or recovery unavailable                                          | Stay `recovery-required`; never mark healthy                  |
| Health timeout with previous asset                                                 | Write marker and launch previous once                         |
| Health timeout without previous asset                                              | Write `recovery-required`; no fake rollback success           |

### 5. Good / Base / Bad Cases

- **Good:** verified task schedules typed update quit, pre-unload persists the plan, will-quit launches one helper, target startup becomes healthy, and one previous package remains.
- **Base:** first Windows/Linux install has no previous package; timeout records recovery-required without repeating an installer.
- **Bad:** call `shell.openPath`/`autoUpdater.quitAndInstall` from the action, infer success from UAC/process spawn, fetch signatures during quit, or unload SQLite before coordinator preflight.

### 6. Tests Required

- Quit intent priority/default plus duplicate/startup/system/user-normal gates.
- Coordinator schedule, BEFORE/WILL idempotence, task mismatch, target/wrong-version health, recovered/recovery-required reconciliation.
- ModuleManager assertion that async `BEFORE_MODULES_UNLOAD` completes before module stop/destroy.
- Plan/store path escape, schema/token mismatch, replay, one-previous atomic rotation, and stale-marker isolation.
- macOS/NSIS/MSI/AppImage/deb command selection and unsupported-format rejection.
- Helper parent wait, matching healthy/recovered ack, timeout recovery once, and no-previous marker using only temp fixtures.
- Detached-signature cache proves first download plus second offline verification and tamper failures.

### 7. Wrong vs Correct

#### Wrong

```ts
await shell.openPath(packagePath);
app.quit();
return { success: true }; // process launch is not install/health success
```

#### Correct

```ts
await updateInstallCoordinator.scheduleInstallNow(taskId);
// BEFORE_MODULES_UNLOAD: verify local bytes/cache, persist plan, CAS handoff-started
// will-quit: spawn detached helper once
// target startup readiness: CAS healthy, then write token-bound ack
```

## Scenario: Manifest v2 N-1 Rollback Compatibility

### 1. Scope / Trigger

- Trigger: changing OTA manifest generation/validation, Nexus release metadata, lifecycle persistence, normal-quit installation, automatic recovery, or downgrade acceptance evidence.
- The manifest owns the rollback target. Nexus, CoreApp, renderer, and evidence consumers must not derive a second target.

### 2. Signatures

```ts
type UpdateReleaseManifestV2 = {
  schemaVersion: 2
  release: {
    version: string
    channel: 'RELEASE' | 'BETA'
    tag: string
    rollbackFromVersion: string
    rollbackCompatible: boolean
  }
  artifacts: UpdateReleaseArtifact[]
}

type UpdateLifecycleSnapshotRollback = {
  rollbackFromVersion: string | null
  rollbackCompatible: boolean
  installOnNormalQuit: boolean
  previousVersion: string | null
  recoveryAvailable: boolean
}

app_update_attempts.rollback_from_version: TEXT NULL
app_update_attempts.rollback_compatible: INTEGER NOT NULL DEFAULT 0
```

```bash
node scripts/resolve-update-rollback-version.mjs --tag <vN> --remote <git-remote>
node scripts/update-validate-release-manifest.mjs \
  --manifest <json> --expected-rollback-from-version <N-1>
node scripts/validate-update-downgrade-evidence.mjs --evidence <json>
```

### 3. Contracts

- `schemaVersion` is exactly `2`. `rollbackFromVersion` is required, omits `v`, normalizes `ALPHA`/`BETA`/`SNAPSHOT` to channel `BETA`, normalizes `MASTER`/no suffix to `RELEASE`, and is strictly older than `release.version`.
- The release resolver semver-sorts remote tags and selects the highest strictly older normalized same-channel version. Missing N-1 fails the release; input tag order is never authoritative.
- `rollbackCompatible` defaults to `false`. Setting it to `true` requires canonical downgrade evidence bound to current=N-1, target=N, all required platform pairs, a real host packaged-isolated runtime result, and a detached SHA-256 signature verified by the pinned release public key.
- CoreApp may download/install a non-exact upgrade manually, but runtime compatibility is true only when the installed current version exactly equals manifest `rollbackFromVersion`. Prerelease suffixes are significant.
- SQLite persists compatibility on the attempt. `user-normal` handoff and automatic recovery require both attempt compatibility and the user setting. Explicit `install-now` remains allowed when compatibility is false.
- Windows/Linux recovery additionally requires a cached previous package whose exact version equals `rollbackFromVersion`. macOS restore requires the current bundle version to equal that target.
- Renderer state is a revision-guarded read-only lifecycle projection. Download completion is only a refresh trigger; it is never lifecycle truth.
- On a macOS host, win32/x64 and linux/x64 evidence remains `static-only`. Apple Developer absence is exactly `waived:apple-developer-not-configured`, never native-trust `pass`.

### 4. Validation & Error Matrix

| Condition                                                          | Result                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------ |
| Manifest v1 or rollback fields missing/malformed                   | Reject manifest; no candidate download                       |
| Rollback equals/exceeds N, uses `v`, or crosses normalized channel | Reject manifest                                              |
| Published rollback target differs from resolved same-channel N-1   | Fail release validation                                      |
| `rollbackCompatible=true` without canonical signed evidence        | Fail asset preparation/release summary                       |
| Installed current version differs from `rollbackFromVersion`       | Persist compatibility false; manual install only             |
| Normal quit with compatibility false                               | Keep lifecycle `ready`; no handoff/helper                    |
| Recovery asset version differs, including beta suffix              | No recovery command; `recoveryAvailable=false`               |
| Nexus is transient and GitHub fallback validates                   | Overall remote gate remains `blocked`; never convert to pass |
| Non-host pair claims runtime or macOS trust waiver claims pass     | Reject evidence                                              |

### 5. Good / Base / Bad Cases

- **Good:** remote N-1 resolver selects the exact predecessor; canonical signed evidence binds N-1/N; all consumers preserve the metadata; exact-current normal quit and recovery are enabled.
- **Base:** manifest v2 is valid but compatibility is false or installed current is not exact N-1. Download and explicit install-now remain available; normal-quit and automatic recovery stay disabled.
- **Bad:** infer rollback from Nexus latest/current local state, accept manifest v1, compare only major/minor/patch while dropping prerelease suffixes, label static metadata as runtime, or treat a GitHub fallback as a successful Nexus gate.

### 6. Tests Required

- Shared/runtime/CLI validators: valid lower same-channel plus missing, malformed, equal, future, `v`-prefixed, cross-channel, and wrong expected N-1.
- Resolver: unsorted tags, current tag absent, preview aliases, prerelease sequence, and no predecessor.
- Asset preparation: compatibility false without evidence; compatibility true with missing/wrong/noncanonical evidence or signature; canonical exact signed evidence success.
- Attempt repository: migrations `0028 -> 0030`, false/null defaults, CAS update, and reload round-trip.
- Coordinator/platform adapters: incompatible normal quit blocked, explicit install-now allowed, exact previous package required, and prerelease suffix mismatch rejected.
- Renderer/evidence: revision/terminal guard, all lifecycle action gates, rollback/recovery/error fields, and explicit macOS waiver risk.
- Remote/summary gates: exact three-pair matrix, digest/metadata drift, Nexus transient blocked fallback, fake runtime, temporary profile, and native-trust false-pass rejection.

### 7. Wrong vs Correct

#### Wrong

```ts
const rollbackFromVersion = nexusLatest.version;
const recoveryAvailable = Boolean(previousAsset);
if (downloadFinished) lifecycle.phase = "ready";
```

#### Correct

```ts
const rollbackFromVersion = manifest.release.rollbackFromVersion;
const rollbackCompatible =
  manifest.release.rollbackCompatible &&
  installedVersion === rollbackFromVersion;
const recoveryAvailable =
  rollbackCompatible && previousAsset?.version === rollbackFromVersion;
// Renderer accepts only a revision-valid UpdateLifecycleSnapshot from main.
```
