# Tuff v2.4.14-beta.7 Release Notes

## Summary Notes

- CoreBox once again prewarms a hidden persistent window during startup, removing first-open window creation and avoiding reloads after the former idle timeout.
- The app shell, conversations, AI runtime, plugin permissions, and cross-platform search paths have been consolidated for more reliable daily use and recovery.
- Real install-and-launch gates now cover Windows, macOS, and Linux, while macOS beta builds again produce installable, notarized, update-compatible artifacts.
- Dependency, security, and release governance have been tightened to reduce credential exposure, missing native modules, and updater manifest drift.
- The official Everything SDK was reverified, and macOS dual-architecture dependencies, signing evidence, official asset names, and the privacy database startup race were fixed to restore cross-platform production release gates.

## What's Changed

- CoreBox foreground initialization now waits for its hidden window and renderer to be ready; the normal 60-second hidden-window destruction path is removed while unexpected destruction still self-recovers.
- Home generates a short title after the first conversation turn, and the app shell, sidebar history, settings, and intelligence entry points have been converged.
- AI execution strengthens isolated invocation, cancellation propagation, stream protocol compatibility, and MCP server-shutdown handling; plugin capability gates and permission denial reasons are now consistent.
- Search and indexing add Linux XDG app/icon discovery, Everything listener cleanup, query-cache metrics, and scan backpressure coverage, alongside stronger OCR, screenshot, and native-plugin lifecycle handling.
- Fixed the Sentry renderer bridge, sensitive channel arguments, SQLite quota handling, system-directory exclusions, and multiple cross-layer type defects.
- Release automation now performs real packaged launches on all three desktop platforms and enforces Developer ID signing, notarization, identifiable DMG/ZIP artifacts, and updater manifest consistency on macOS.
- The upstream content behind the official unversioned Everything SDK URL changed; this release updates the pinned checksum only after validating the official source, archive structure, and matching SHA-256 from both CI and a separate download, while still failing closed on any mismatch.
- PNPM now installs both arm64 and x64 optional binaries on the arm64 macOS release runner so dual-architecture LibSQL and esbuild runtimes are available to signed artifacts.
- Privacy lifecycle owners now resolve the auxiliary database client at invocation time, safely using the primary database during background auxiliary initialization and switching automatically once ready instead of failing Windows bootstrap on a startup race.
- The macOS signing gate now verifies arm64 and x64 app bundles independently and aggregates both sets of codesign, Gatekeeper, notarization, and TeamIdentifier results into one release evidence file instead of rejecting valid dual-architecture output.
- Release manifest validation now accepts electron-builder's official `-macos-<arch>` DMG/ZIP names while continuing to reject assets whose platform or architecture metadata disagrees with the filename.
