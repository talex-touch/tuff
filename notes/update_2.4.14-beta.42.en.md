# Tuff v2.4.14-beta.42 Release Notes

## Summary Notes

- Cloud dictation is available again: the signed Nexus voice route now participates in `audio.asr` instead of being filtered out as an unavailable provider.
- The on-device model catalog is now separate from cloud dictation: sign-in, timeout, upstream and validation failures have distinct guidance, and a catalog outage explicitly does not disable cloud input.
- Main-window workflows improve with a command palette, chord shortcuts and key hints; the empty Home composer gains a focus beam, while the duplicate project badge and redundant command-window entry are removed.
- TuffEx and Nexus docs move forward: DataTable gains expandable rows, the bottom dialog becomes an action-oriented bottom sheet, and component pages share a consistent Usage / API Reference structure.
- Reliability work continues: cold-start IPC waits for handlers instead of committing undefined state, search scans are cancelled before session drain on quit, and Nexus dev gains OOM supervision plus correct Miniflare disposal.

## What's Changed

- Voice routing: `tuff-nexus-default` gains `audio.asr` only in its runtime projection, preserving the persisted provider shape and shared Resolver contract. Regressions cover the shipped provider, signed pack and buffered adapter path.
- On-device catalog: descriptors load with bounded concurrency while retaining catalog order; simultaneous reads of one source share a build, only complete successes are cached, and both request and whole-build deadlines are enforced.
- Voice error contract: authentication, timeout, upstream-unavailable, invalid-catalog and generic-unavailable codes now survive the safe main-process boundary without exposing internal URLs, digests or raw exceptions. The Renderer no longer parses error prose.
- Voice settings: the section is now explicitly “On-device speech models”; cloud, local and hybrid sources receive accurate impact copy, and installed models remain visible and removable when the remote catalog is down.
- Main window: one command catalogue owns command IDs, groups, icons and chords, and only commands with live handlers are offered. The shell drops its duplicate command entry and the empty Home state points at its only primary input.
- TuffEx: expandable table rows support controlled and uncontrolled state, per-row eligibility and correct sticky offsets; the bottom sheet adds a title, close control and full-row actions, with destructive colour reserved for destructive actions.
- Search and startup: requests arriving before module registration are deferred and replayed after runtime initialization; index shutdown ordering, source-scoped watch diagnostics and scan resource boundaries are tightened.
- Nexus development: the dev server is supervised against long-lived reload heap growth, and Miniflare/workerd resources are disposed correctly across reloads.
- Engineering scripts: root scripts shrink from 79 to 34 entries; parameterized dispatchers now own static checks, app builds, versioning and release notes, with CI and documentation moved to the same entry points.
- Dependency maintenance: upgrades include Pi Agent Core, the MCP SDK, pinyin-pro, JSZip, Nuxt DevTools and napi-rs packages.
