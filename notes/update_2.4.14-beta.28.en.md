# Tuff v2.4.14-beta.28 Release Notes

## Summary Notes

- OTA downloads can recover from an expired signed URL after a confirmed HTTP 403, switching to the fallback URL while preserving completed ranges.
- Fixed macOS 26 release signing setup so temporary keychain partition authorization uses the keychain password.
- CoreBox empty states now separate habitual items from explained recommendations and fill cold-start slots instead of leaving them blank.
- Tightened download concurrency, stream completion, and cancellation cleanup so failed transfers do not leave unfinished chunks behind.
- Release gates remain tied to the same SHA, keeping signed manifests, rollback targets, and three-platform artifacts traceable.
- Improved recovery for expired Nexus signed URLs: only recoverable 403 responses use the fallback URL, while other authorization failures remain fail-closed.
- Added a patched `app-builder-lib` release path so `security set-key-partition-list` receives the temporary keychain password rather than the `.p12` import password.
- Refactored CoreBox recommendation registration and cold-start backfill to distinguish habitual items from candidates that need an explanation, with a fixed upper bound.
- Covered download-worker concurrency limits, terminal stream EOF, cancellation propagation, and sensitive log redaction.
- Continue running the same-SHA `release-quality` gate before generating signed manifests, release notes, and the Nexus projection.
