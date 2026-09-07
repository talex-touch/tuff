# Tuff v2.4.14-beta.32 Release Notes

## Summary Notes

- After a macOS OTA replaces the app, startup health now confirms the version from the newly installed bundle.
- A successfully installed update is no longer misreported as recovered or requiring recovery.
- Subsequent update checks and diagnostics now follow the installed version instead of stale metadata inherited from the previous process.

## What's Changed

- Fixed Restart to Update replacing the app with Beta31 while the lifecycle still evaluated it as Beta30 because the relaunch inherited the previous process version.
- Packaged runtime version checks now treat Electron bundle metadata as authoritative; development and unpackaged version injection remains unchanged.
