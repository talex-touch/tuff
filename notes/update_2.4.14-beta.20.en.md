# Tuff v2.4.14-beta.20 Release Notes

## Summary Notes

- Search file previews and index freshness handling are more reliable, reducing stale results and preview failures.
- CoreBox empty states are now grouped by the reason behind the result state, making no-result situations easier to understand.
- Clipboard History now identifies and classifies copied credential content, reducing accidental handling of sensitive data as ordinary text.
- Application indexing recognizes more modern terminal and workspace applications, improving discovery for common development tools.
- Plugin and release pipelines tighten manifest, build, and security checks so official artifacts stay aligned with host projections.
- The workspace completes its pnpm 11 toolchain migration, reducing release-environment drift.

## What's Changed

- Fixed file-index result previews and freshness handling so visible results better match the current file state.
- Grouped CoreBox empty results by their concrete reason, distinguishing no matches, indexing warm-up, and unavailable sources.
- Added explicit classification for credential-like clipboard content so sensitive records are not treated as ordinary text.
- Improved application-index recognition and search recall for terminals, workspaces, and modern applications.
- Refreshed official plugin integrity metadata and validate canonical builds against their bundled projections before release.
- Unified workspace installation and build contracts on pnpm 11 while retaining lockfile verification.
