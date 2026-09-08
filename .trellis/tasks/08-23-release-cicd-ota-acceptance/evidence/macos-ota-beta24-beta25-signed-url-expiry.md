# macOS OTA beta.24 -> beta.25 (signed URL expiry attempt)

## Classification

- Result: **fail before install**. Official source discovery and signed package download started; the signed Nexus URL expired during the ranged download and the task terminated at 53%. No install handoff, replacement, startup, or health acknowledgement occurred.
- Scope: disposable app bundle copied from the official Beta24 arm64 DMG and isolated profile under `/tmp`; no real `/Applications` bundle or user profile was used.
- Attempt: `b0b73f87-1c35-47c6-aa66-9b2e05f2e4a7`; download task `27273f16-d9c4-4ae0-b7e8-f4caf72d8b75`.

## Sanitized Timeline

| Local time | Evidence |
| --- | --- |
| 2026-09-05 17:08 | Isolated Beta24 app passed packaged startup and official build attestation; update check selected published `v2.4.14-beta.25` from Nexus. |
| 2026-09-05 17:08 | Download task entered `downloading`; target asset size was `512612996` bytes and manifest SHA-256 was `7cce7efd00f8d4968bc271a8d5ad857aa8f15d9f09deea1f52db668877abc352`. |
| 2026-09-05 17:17 | Ranged download reached approximately 53%; the signed URL's bounded expiry elapsed before the remaining chunks completed. |
| 2026-09-05 17:18 | Requests returned HTTP 403. DownloadCenter persisted the task as failed with a permission-style user error; no `ready` lifecycle transition was emitted. |

## Root Cause And Fix

1. Nexus exposes a short-lived signed `downloadUrl` plus a non-expiring GitHub `fallbackDownloadUrl` for the same release asset.
2. The updater preserved only the signed URL. After expiry, HTTP 403 was classified as a terminal permission error even though the package had a verified fallback source.
3. PR #1873 carries the fallback URL through release mapping and update-task metadata. On HTTP 403 only, the worker switches once to the fallback URL and resumes the current ranged chunk; HTTP 401 and unrelated permission failures remain terminal.
4. Focused source-branch tests pass: signed URL mapping, 403 fallback with partial Range resume, non-403 fail-closed behavior, and worker cancellation propagation. CoreApp node typecheck and scoped ESLint pass.

## Integrity Boundary

- Source app: official `2.4.14-beta.24` macOS arm64 bundle; packaged attestation passed before the attempt.
- Target manifest: official `v2.4.14-beta.25`; target package was not completed, so no target SHA/signature verification or replacement claim is made.
- No token, signed URL query, cookie, full log, downloaded package, or real user profile is retained in this evidence.

## Re-Acceptance Gate

- Merge and publish a release containing PR #1873.
- Re-run fresh official N -> N+1 macOS acceptance with the fallback path available.
- Required terminal evidence remains `ready -> install-scheduled -> handoff-started -> awaiting-health -> healthy`, matching target version, package checksum/signature verification, no elevation prompt, no mounted DMG, and removable stage data.
