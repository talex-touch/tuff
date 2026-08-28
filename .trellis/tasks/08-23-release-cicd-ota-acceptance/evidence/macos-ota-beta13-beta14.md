# macOS OTA beta.13 -> beta.14

## Classification

- Result: **fail**. Download, signature verification, handoff, and in-place replacement succeeded; target startup health acknowledgement did not.
- Scope: disposable app bundle and profile under `/tmp`; the real `/Applications` bundle and real profile were not used.
- Recovery: unavailable because the published attempt reported `rollbackCompatible=false`. No manual recovery was performed.

## Sanitized Timeline

| Local time | Evidence |
| --- | --- |
| 2026-08-23T18:31:58-0700 | Attempt `c4a5caf8-3c6a-4050-ba21-fca87bd72522` reached revision 4 / `ready`. |
| 2026-08-23T20:05:21-0700 | Real Settings UI action committed revision 5 / `install-scheduled`. |
| 2026-08-23T20:05:22-0700 | Quit preflight committed revision 6 / `handoff-started`. |
| 2026-08-23T20:07:48-0700 | Helper completed direct replacement without elevation; bundle version became `2.4.14-beta.14`. |
| 2026-08-23T20:07:48-0700 | LaunchServices started the target bundle, but the process inherited `ELECTRON_RUN_AS_NODE=1` and exited before application bootstrap. |
| 2026-08-23T20:09:51-0700 | Helper timed out waiting for the token-bound health acknowledgement and wrote `recovery-required`; no rollback was attempted. |

## Integrity

- Source: official signed `2.4.14-beta.13` macOS arm64 bundle.
- Target: official `2.4.14-beta.14` macOS arm64 DMG.
- Target DMG SHA-256: `d485d30f0d56c6b172f5760103680136192c5cd80b9f6ddfb4edff4f2c869f85`.
- Replaced target bundle passed `codesign --verify --deep --strict` and retained version `2.4.14-beta.14`.
- No health acknowledgement exists. SQLite correctly remains at `handoff-started` until a target/recovery startup reconciles the marker.

## Root Cause And Fix

1. `UpdateInstallCoordinator` must launch its JavaScript helper with `ELECTRON_RUN_AS_NODE=1`, but the helper forwarded that variable to the platform handoff child. macOS `open` propagated it into the target Electron process, so the target ran as Node instead of booting the application.
2. The DMG cleanup compared the textual `/tmp/...` mount path with macOS's canonical `/private/tmp/...` output. The comparison missed the live mount, leaving the read-only volume and stage directory behind.
3. The helper now removes `ELECTRON_RUN_AS_NODE` from both waited and detached child environments. The macOS apply script now performs an unconditional best-effort detach by mountpoint.
4. Focused tests pass `8/8`. Negative mutations prove both regressions turn their owning tests red.

## Retained Failure Scene

- No Tuff main application process is running. One source-version crashpad helper remains attached to the isolated profile.
- The failed attempt's read-only DMG remains mounted and its `1.7 GiB` app backup remains available for diagnosis.
- No detach, process termination, marker deletion, SQLite mutation, manual restore, or stage cleanup was authorized or performed.

## Re-Acceptance Gate

- The source application owns the helper that performs the update. Because published beta.14 is immutable and still contains the defective helper, beta.14 -> beta.15 cannot prove this fix.
- Publish one official release containing the fix, then validate that release as N against a second official N+1 release using a fresh isolated app/profile.
- Required terminal evidence remains `ready -> install-scheduled -> handoff-started -> awaiting-health -> healthy`, a matching health acknowledgement, retained signature, correct target version, no elevation prompt, no mounted DMG, and removable stage data.
