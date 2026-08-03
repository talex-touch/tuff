# Implementation Plan

1. Remove eager `PiAgentRuntimeHost.start()` from `AiCliOrchestrator.initialize()` while retaining automation scheduler initialization and shutdown.
2. Make renderer performance telemetry own a single cancellable RAF handle; use a typed native visibility push plus an initial visibility query, suspend on hidden, and restart with a fresh baseline on visible.
3. Record CoreBox eager-start, optional-runtime lazy-start, hidden-renderer suspension, and transient-overlay rules in `apps/core-app/AGENTS.md` and the frontend lifecycle spec.
4. Run focused AI runtime tests and existing renderer checks that cover the changed paths.
5. Run `typecheck:node`, `typecheck:web`, the CoreApp production build, and an Electron startup/search smoke using an isolated profile.

## Risk points

- Do not move automation scheduler initialization out of orchestrator startup.
- Do not change CoreBox initialization order or shortcut ownership.
- Rebase RAF timing after visibility restoration; otherwise hidden duration is reported as jank.
- Never leave more than one RAF callback scheduled.
- Register the native push before the initial query and ignore a query response when a newer push already arrived.
