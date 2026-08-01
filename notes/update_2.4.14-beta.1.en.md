# Tuff v2.4.14-beta.1 Release Notes

## Summary Notes

- Move official plugin preludes into an isolated host, with caller ownership and permission boundaries for files, voice, browser data, and Intelligence capabilities.
- Harden private-data lifecycle, plugin storage, and file-index error handling to reduce sensitive path and runtime-data exposure across boundaries.
- Introduce a versioned native screenshot path and bilingual update notes while simplifying advanced settings and version information.

## What's Changed

- Route fixed actions, batch rename, dictation, browser data, and Intelligence calls from official plugins through the isolated capability host with cancellation and cleanup support.
- Apply stricter fail-closed behavior to plugin view windows, SQLite storage, permission revocation, transport caller identity, and legacy trust paths.
- Complete retention, export, and cleanup boundaries for sensitive data, with stronger privacy lifecycle audits and security verification.
- Return safe summaries for file-index update failures instead of exposing absolute paths or raw parser errors across the transport boundary.
- Improve protocol compatibility and diagnostics for native screenshot capture, reducing failures caused by runtime version mismatches.
- Consolidate advanced settings, remove the legacy version-history browser, and add structured bilingual What's Changed notes.
- Fix plugin-directory opening and onboarding state errors while improving subscription status and TuffEx component stability.
