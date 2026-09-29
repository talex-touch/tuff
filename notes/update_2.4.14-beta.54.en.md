# Tuff v2.4.14-beta.54 Release Notes

## Summary Notes

- File indexing now uses bounded scanning and writes, reducing sustained CPU, memory, and disk pressure during full indexing.
- File-content indexing is off by default and reads local content only after an explicit resource and privacy confirmation.
- Application shortcuts support conflict confirmation and explicit takeover, while CoreBox number keys can run or only select a result.
- TuffEx menus now confirm activation before closing, with matching updates across Nexus navigation and theme menus.
- Nexus analytics adds a unified panel selector plus version-scoped geography, visit, and search metrics.
- Electron is upgraded to 41.10.7 and undici to 7.29.1, alongside fixes for CoreBox focus, update progress, and settings interactions.

## What's Changed

- Full file enumeration prefers the bundled fd backend while preserving legacy fallback, cancellation, depth, and filtering semantics.
- SearchIndex writes now have global backpressure, and full scans pace themselves using actual Worker CPU time instead of unbounded background pressure.
- Filename and path fuzzy recall use a bounded fzf-style scorer while exact, prefix, and existing business ranking signals remain authoritative.
- A new “Index File Contents” setting controls content parsing; disabling it removes content, file embeddings, and content progress while retaining metadata.
- Shortcut conflicts identify the current holder or an OS refusal and require confirmation before takeover; persistence failures restore the previous binding.
- Command/Ctrl + 1–0 runs the numbered CoreBox result by default or can select it only; Escape and Backspace can clear removable shortcut bindings.
- Dropdown and context menus use two-phase activation feedback; theme changes and external-agent launches with immediate visible feedback remain instant.
- Nexus analytics navigation is consolidated into one entry, with version, geography, and nine analytics panels sharing a deep-linkable selector.
- Geography aggregates can be filtered by client version, while version lists and charts expose visits, searches, users, and mean search duration.
- Nexus development health checks no longer render the application root repeatedly, and identical locale-resolution logs are deduplicated.
- Electron 41.10.7 and undici 7.29.1 address newly disclosed high-severity advisories, while CoreBox refocus, download-progress visibility, settings motion, and native package size are improved.
