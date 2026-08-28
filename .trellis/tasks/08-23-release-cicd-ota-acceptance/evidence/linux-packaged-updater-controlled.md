# Linux Packaged Updater Controlled Verification

## Classification

- Date: 2026-08-24 (America/Los_Angeles)
- Source fix: **pass**. The packaged AppImage updater now contains its apply
  helper and preserves the official no-FUSE launch contract across relaunch.
- Runtime acceptance: **blocked**. No official Linux N -> N+1 update containing
  this fix has completed discovery, download, replacement, and startup health
  acknowledgement on a Linux host.

## Fixed Defects

1. `linux-apply-update.sh` was invoked by the platform adapter but absent from
   Electron Builder `extraResources`. It is now copied to the adapter's first
   packaged lookup path.
2. The hosted Linux launch passed only `--appimage-extract-and-run`. The
   AppImage type 2 runtime removes that argument before starting `AppRun` and
   does not synthesize `APPIMAGE_EXTRACT_AND_RUN`, so the updater could not
   preserve no-FUSE mode. The workflow now exports the official environment
   switch, and the apply helper relaunches with both the switch and compatibility
   argument when `APPIMAGE` matches the replacement destination.
3. The helper no longer infers mode from temporary `APPDIR` spelling. It also
   keeps AppImage/deb paths and child output out of stdout, stderr, and its
   stable helper log.

The runtime contract was checked against AppImage type 2 runtime source and
the official extract-and-run guidance. `APPIMAGE` remains the replacement
identity; `APPDIR` is not treated as a durable or authoritative mode signal.

## Verification

| Check | Result |
| --- | --- |
| Linux apply script controlled tests | pass, 8/8 |
| Linux platform adapter tests | pass, 11/11 |
| Update handoff helper tests | pass, 5/5 |
| Release workflow contracts | pass, 7/7 |
| CoreApp main-process typecheck | pass |
| Scoped ESLint, Bash syntax, ShellCheck, actionlint | pass |
| Targeted `git diff --check` | pass |

The controlled script tests use disposable files and real Bash child
processes. They cover in-place replacement, backup, replacement failure
recovery, normal FUSE relaunch, official no-FUSE environment presence,
different-AppImage rejection, misleading `APPDIR`, missing deb input, and
path/secret canaries.

Two negative mutations were exercised and restored. Removing the workflow's
`APPIMAGE_EXTRACT_AND_RUN=1` export failed its owning contract test; removing
the Linux helper from `extraResources` failed the packaged-path test.

## Evidence Boundary

- This proves source configuration and controlled updater mechanics only.
- It does not prove a patched remote workflow run, native Linux AppImage
  execution, official signed N/N+1 discovery/download, a new application PID,
  version transition, token acknowledgement, or health-timeout recovery.
- Windows installer replacement remains separately blocked by the interactive
  installer contract.
- No production secret, signed URL query, user profile, downloaded package, or
  full helper log is retained.
