# macOS OTA beta.31 -> beta.32

## Classification

- Result: **pass**. Official Beta31 discovered and downloaded official Beta32, resumed from the persisted ready state after a separate source-process crash, completed an explicit Settings UI install, replaced the app without elevation, launched Beta32, and reached token-bound startup health.
- Scope: disposable official macOS arm64 app bundle and isolated profile under `/private/tmp`; the real `/Applications` bundle and normal user profile were not used.
- Attempt: `d372f6b1-6b18-4325-8fc5-8f1a3e4a9358`; download task `be8d181e-cbfc-42f5-97ef-17e8a8353aec`.

## Sanitized Timeline

| UTC time | Evidence |
| --- | --- |
| 2026-09-07T19:36:48.942Z | Official Beta31 created the persisted update attempt for Nexus `v2.4.14-beta.32`. |
| 2026-09-07T19:36:52.254Z | Download entered `downloading` for the macOS arm64 DMG. |
| 2026-09-07T19:41:44.721Z | Download completed: `512529137 / 512529137` bytes, no persisted error, duration `292 s`. The lifecycle reached `ready`. |
| 2026-09-08T05:21:55.729Z | Real Settings UI action `Restart to Update` was clicked after a fresh Beta31 restart recovered the same ready task. |
| 2026-09-08T05:21:59.372Z | Install attempt committed `install-now`; the handoff plan bound Beta31, Beta32, the cached task, package digest, and a 120 s health deadline. |
| 2026-09-08T05:22:00.968Z | Beta31 completed module teardown and started the update helper. |
| 2026-09-08T05:23:50Z | Helper finished direct replacement without elevated privileges. |
| 2026-09-08T05:23:56.956Z | LaunchServices started the replaced Beta32 bundle. |
| 2026-09-08T05:23:59.093Z | Beta32 completed foreground startup health in `2.0 s`. |
| 2026-09-08T05:24:00.278Z | Beta32 wrote the attempt-bound health acknowledgement with status `healthy` and version `2.4.14-beta.32`; SQLite reached revision 8 / `healthy` with no error code. |

## Integrity And Handoff

- Source: official signed/notarized `2.4.14-beta.31` macOS arm64 bundle with attestation commit `2dc227ed1e9785e872f0257650149308d2c80b74`.
- Target: official `v2.4.14-beta.32` macOS arm64 DMG, `512529137` bytes.
- Target SHA-256: `f5a3add492f860be642cfdd6818eace2ed0af4a5186228d8aaf110afcdad89d1`; manifest match and detached RSA/SHA-256 signature verification both passed before install.
- Replaced bundle: version `2.4.14-beta.32`, arm64, attestation commit `a0854d8a901dd0cd4db59ed725725554e7ee0af5`; deep strict codesign and Gatekeeper notarization assessment passed.
- Helper log records `installed without elevated privileges`. No sudo, AppleScript, password prompt, or UAC-style confirmation occurred.
- The attempt used `rollbackCompatible=false`; no rollback was claimed or exercised.
- No attempt-specific DMG mount remained after completion.

## Separate Soak Finding

- Before the install action, the long-running Beta31 source process aborted after a clipboard `vision.ocr` invocation. The minidump resolves the native frames to `tuff_native_ocr.node`, `Napi::AsyncWorker::OnWorkComplete`, and `Napi::Error::ThrowAsJavaScriptException`.
- The parent called `worker.terminate()` as soon as the one-shot child posted its terminal result, even though the native completion callback could still be unwinding. The fix lets terminal success/error messages settle the promise and leaves forced termination to the pre-message timeout path.
- Focused CoreApp OCR tests pass `18/18`; the regression turns red when immediate terminal-message termination is restored. A real Electron probe completed 200 native OCR workers with a result and natural exit code 0 for every worker. Beta32 still contains the old lifecycle, so this remains a promotion risk until a later official build carries the fix.
- This crash is not counted as an OTA transition failure: the persisted `ready` task survived, Beta31 restarted cleanly, and the subsequent handoff reached `healthy`.

## Evidence Boundary

- No token-bound health secret, signed URL query, cookie, credential, private key, complete log, minidump, downloaded package, or real user profile is stored in repository evidence.
- This closes the official macOS N/N+1 requirement in AC6 for Beta31 -> Beta32.
- Windows and Linux N/N+1 runtime evidence remains open.
