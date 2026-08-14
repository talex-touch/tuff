# Tuff v2.4.14-beta.3 Release Notes

## Summary Notes

- CoreBox once again prewarms a hidden persistent window during startup, removing first-open window creation and avoiding reloads after the former idle timeout.
- The app shell, conversations, AI runtime, plugin permissions, and cross-platform search paths have been consolidated for more reliable daily use and recovery.
- Real install-and-launch gates now cover Windows, macOS, and Linux, while macOS beta builds again produce installable, notarized, update-compatible artifacts.
- Dependency, security, and release governance have been tightened to reduce credential exposure, missing native modules, and updater manifest drift.

## What's Changed

- CoreBox foreground initialization now waits for its hidden window and renderer to be ready; the normal 60-second hidden-window destruction path is removed while unexpected destruction still self-recovers.
- Home generates a short title after the first conversation turn, and the app shell, sidebar history, settings, and intelligence entry points have been converged.
- AI execution strengthens isolated invocation, cancellation propagation, stream protocol compatibility, and MCP server-shutdown handling; plugin capability gates and permission denial reasons are now consistent.
- Search and indexing add Linux XDG app/icon discovery, Everything listener cleanup, query-cache metrics, and scan backpressure coverage, alongside stronger OCR, screenshot, and native-plugin lifecycle handling.
- Fixed the Sentry renderer bridge, sensitive channel arguments, SQLite quota handling, system-directory exclusions, and multiple cross-layer type defects.
- Release automation now performs real packaged launches on all three desktop platforms and enforces Developer ID signing, notarization, identifiable DMG/ZIP artifacts, and updater manifest consistency on macOS.
