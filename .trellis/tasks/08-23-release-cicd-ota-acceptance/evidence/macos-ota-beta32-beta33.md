# macOS OTA beta.32 -> beta.33

## Classification

- Result: **pass**. Official Beta32 discovered and downloaded official Beta33, verified the package, completed a real Settings UI `Restart to Update`, replaced the app without elevation, launched Beta33, and reached the attempt-bound startup health acknowledgement.
- Scope: disposable official macOS arm64 app bundle and isolated profile under `/private/tmp`; the real `/Applications` bundle and normal user profile were not used.
- Attempt: `99589c2a-a856-4704-8ac9-e7a6998f0096`; download task `8ff4068c-9430-43e1-b790-7ad4c25cc27b`.

## Sanitized Timeline

| UTC time | Evidence |
| --- | --- |
| 2026-09-08T11:36:50Z | Official Beta32 started in the isolated profile and passed packaged startup health. |
| 2026-09-08T11:37:01.401Z | Nexus update discovery selected `v2.4.14-beta.33`; the macOS arm64 download task started. |
| 2026-09-08T11:42:30.328Z | Download completed: `512650125 / 512650125` bytes, persisted with no error. |
| 2026-09-08T12:11:52.853Z | The explicit Settings UI install action created the attempt and bound target version, task, package digest, and a 120 s health deadline. |
| 2026-09-08T12:11:55Z | macOS handoff helper started after Beta32 teardown. |
| 2026-09-08T12:13:12Z | Helper completed direct replacement without elevated privileges. |
| 2026-09-08T12:13:16Z | LaunchServices started the replaced Beta33 bundle. |
| 2026-09-08T12:13:17.920Z | Beta33 completed foreground startup health in `1.4 s`. |
| 2026-09-08T12:13:18.182Z | Beta33 wrote the attempt-bound health acknowledgement with status `healthy` and version `2.4.14-beta.33`; SQLite reached revision 8 / `healthy` with no error code. |

## Integrity And Handoff

- Source: official signed/notarized `2.4.14-beta.32` macOS arm64 bundle with attestation commit `a0854d8a901dd0cd4db59ed725725554e7ee0af5`.
- Target: official `v2.4.14-beta.33` macOS arm64 DMG, `512650125` bytes.
- Target SHA-256: `7fcd24bb1b5c8164dacfb18402a5b4997077586ebf66fd18d47a555ab8514858`; manifest match and detached RSA/SHA-256 signature verification passed before install.
- Replaced bundle: version `2.4.14-beta.33`, arm64, attestation commit `58e6a8da7e67d0cce530e865fc4afe100afb86b8`; deep strict codesign and Gatekeeper notarization assessment passed.
- Helper log records `installed without elevated privileges`. No sudo, AppleScript, password prompt, or elevation dialog occurred.
- The attempt used `rollbackCompatible=false`; no rollback was claimed or exercised.
- No recovery marker or attempt-specific DMG mount remained after completion.

## Packaged OCR Regression Smoke

- A separate fresh Beta33 packaged instance ran with `TUFF_OCR_WORKER_ENABLED=1` and the real native OCR worker. Eleven queued image jobs using the project fixture all completed with status `completed`, one attempt each, and recognized `TUFF` (`11/11`).
- The supervised packaged process remained alive after the OCR batch; no `Napi`, `SIGABRT`, or OCR failure record appeared in its isolated stderr/crash directory.
- This runtime smoke complements the source regression suite (`20/20`) and verifies the fix is present in a published packaged build. It is not a claim that every possible native Vision input is crash-free.

## Evidence Boundary

- No token-bound health secret, signed URL query, cookie, credential, private key, complete log, minidump, downloaded package, or real user profile is stored in repository evidence.
- This closes the macOS N/N+1 runtime evidence for Beta32 -> Beta33 and verifies the OCR lifecycle fix in the packaged target.
- Windows and Linux N/N+1 runtime evidence remains open.
