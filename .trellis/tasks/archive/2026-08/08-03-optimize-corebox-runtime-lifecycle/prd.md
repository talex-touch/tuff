# Optimize CoreBox runtime lifecycle

## Goal

Reduce idle CoreApp process and renderer work without weakening CoreBox startup readiness, scheduled AI automation, or search interaction latency.

## Background

- `CoreBoxModule.onInit()` eagerly calls `coreBoxManager.init()`; CoreBox is the startup-critical launcher and must remain prewarmed.
- `AiCliOrchestrator.initialize()` currently starts `PiAgentRuntimeHost` even though `PiAgentRuntimeHost.execute()` already starts the utility process on demand.
- Renderer performance telemetry keeps a recursive `requestAnimationFrame` monitor active while its window is hidden.

## Requirements

- Keep CoreBox window creation and shortcut registration in startup initialization.
- Initialize AI stores, imported configuration, run recovery, tools, and automation scheduling at startup, but do not spawn the Pi utility process until the first execution reaches `PiAgentRuntimeHost.execute()`.
- Preserve startup, interval, cron, and manual AI automation behavior; their first execution may start the Pi runtime.
- Stop the renderer RAF jank monitor when the native CoreBox visibility signal reports hidden or `document.hidden` is true, restart it when visible, and rebase frame timing so a hidden interval is not recorded as UI jank.
- Flush collected telemetry when the renderer becomes hidden and keep existing Sentry enablement and payload behavior.
- Record the executable lifecycle conventions in CoreApp-owned project guidance and the relevant Trellis code-spec.

## Acceptance Criteria

- [x] CoreBox remains eagerly initialized by `CoreBoxModule.onInit()`.
- [x] AI orchestrator initialization does not call `PiAgentRuntimeHost.start()`; the existing host execution path still starts the process before posting a run.
- [x] AI automation scheduler initialization remains part of orchestrator initialization.
- [x] A native CoreBox hide signal leaves no pending telemetry RAF callback; a native show signal schedules exactly one monitor loop with a fresh baseline, with document visibility retained only as fallback.
- [x] Focused AI and renderer telemetry checks, CoreApp node/web typechecks, production build, and an Electron startup/search smoke pass.
- [x] CoreApp guidance documents the CoreBox exception, optional-runtime lazy-start rule, hidden-renderer suspension, and transient-overlay lifecycle.

## Out of Scope

- Merging the existing MetaOverlay renderer into CoreBox.
- Adding the proposed full-screen effects implementation.
- Migrating search/indexing data paths to Rust.
- Migrating the desktop shell to Tauri.

## Verification

- Focused Vitest: 6 files, 54 tests passed across CoreBox IPC/window, renderer visibility/telemetry, AI orchestrator, and Pi runtime host.
- Focused CoreApp ESLint, `typecheck:node`, `typecheck:web`, `build:vite`, and `git diff --check` passed.
- Isolated packaged Electron profile reached `Startup health check passed`; the CoreBox probe entered `Safari` with no probe failures, the hidden renderer scheduled no telemetry RAF after the native visibility handshake, and startup logs contained no Pi runtime spawn.
- Full `electron-builder --dir` remains blocked by the pre-existing missing `clipboard-history` bundled seed. The generated app also reports the pre-existing missing `search-index-worker.js` packaged chunk; these packaging defects are outside this lifecycle slice and are not presented as fixed.
