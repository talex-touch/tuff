# Tuff v2.4.15-beta.10 Release Notes

## Summary Notes

- Local AI CLI version probe lifecycle: reap running version probes on app quit, enforce graceful and forced probe timeouts, and disable mise auto-installs during version checks to prevent orphaned processes and high system load.
- Production dependency security updates: upgrade core runtime dependencies including Vue 3.5.45 and sharp to patch published security advisories while preserving build and server toolchain compatibility.
- Component library and Nexus site fixes: update Tuffex to 0.9.4, fix radio group indicator alignment when container width changes, eliminate first-paint layout shifts on the docs sidebar switch, and wait for target locale messages during client hydration.
- Release and notes sync hardening: raise the macOS universal build and notarization timeout to 90 minutes, add a standalone release-notes sync workflow for Nexus, and fail sync runs immediately when Markdown rendering errors.

## What's Changed

- Track local AI CLI version probes as managed child processes: send SIGTERM after 5 seconds and SIGKILL after a 1-second grace period, reap all active probes during BEFORE_QUIT_STOP_WATCHERS and module teardown, and block new probes once shutdown begins.
- Share in-flight version probes per executable path across concurrent reads and manual refreshes instead of spawning duplicates, and set MISE_AUTO_INSTALL=false and MISE_NOT_FOUND_AUTO_INSTALL=false so missing tool shims never fetch or install packages.
- Patch production dependency advisories across workspace manifests (converging Vue packages on 3.5.45 alongside security patch updates) while retaining simple-git 3.x compatibility bounds.
- Ship and adopt @talex-touch/tuffex 0.9.4: observe TxRadioGroup container resizes via ResizeObserver to retarget the active indicator dynamically, and preload TxRadioGroup.css on Nexus docs pages to prevent first-paint sidebar switch height shifts.
- Fix Nexus locale preloading during client hydration: skip awaiting only the SSR-active locale and await target locale message loading before switching, preventing raw keys such as nav.store from appearing on /updates.
- Set a dedicated 90-minute timeout for the macOS release build matrix job, add the sync-nexus-release-notes workflow for notes-only updates with read-back verification, and fail Nexus sync immediately on HTTP errors from Markdown rendering.
