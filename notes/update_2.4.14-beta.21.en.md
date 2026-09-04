# Tuff v2.4.14-beta.21 Release Notes

## Summary Notes

- Linux x64 musl packages now explicitly include the LibSQL native runtime dependency, preventing the database-client binary from being omitted during packaging.
- This version re-establishes a candidate asset chain for the official three-platform release and OTA acceptance.
- Release gates remain fail-closed: a missing platform binary stops packaging before an incomplete official asset can be produced.

## What's Changed

- Pinned `@libsql/linux-x64-musl` as an optional CoreApp runtime dependency so the Linux packaged-build runtime closure resolves the platform binary.
- The updater health state machine, signature verification, and fail-closed release gates are unchanged; official Windows, macOS, and Linux N→N+1 acceptance remains required.
