# Design

## Boundaries

### CoreBox

`CoreBoxModule.onInit()` remains the startup owner of `coreBoxManager.init()`. This task must not defer or destroy the CoreBox window because launcher readiness is a product invariant.

### Pi runtime

`AiCliOrchestrator.initialize()` remains the control-plane initializer:

```text
store/import hydration -> interrupted-run recovery -> tool registration
-> automation executor -> automation scheduler
```

It no longer calls `PiAgentRuntimeHost.start()`. `PiAgentRuntimeHost.execute()` remains the single data-plane activation boundary and already awaits `start()` before posting `run.start`. Concurrent first executions share the host's existing `readyPromise`.

This preserves scheduled automation: scheduler triggers still install at startup, while an actual trigger enters `AiCliOrchestrator.execute()` and starts the Pi process through `runtimeHost.execute()`.

### Renderer telemetry

The telemetry module owns at most one RAF handle. Its visibility contract is:

```text
visible + enabled -> one RAF loop
hidden -> cancel RAF, clear timing baseline, flush buffer
visible again -> fresh baseline, one RAF loop
```

A hidden interval is not a frame delta. The renderer registers the existing native visibility push first, then queries `CoreBoxEvents.ui.getVisibility` for an authoritative initial snapshot. A native push increments a local version so a stale in-flight query cannot overwrite newer state. Long-task observation and periodic flush registration remain unchanged.

## Compatibility

- Adds one typed, read-only transport query: `CoreBoxEvents.ui.getVisibility: void -> { visible: boolean }`; no database or persistence shape changes.
- `runtimeReady` continues to mean the Pi child reported ready, not merely that the orchestrator control plane initialized.
- Automation definitions and trigger semantics are unchanged.
- Sentry-disabled renderers still install no observers, polling, or visibility listeners.

## Failure and rollback

- Pi startup failure remains fail-closed on the first execution and follows the existing runtime-host error path.
- If a renderer hides during a frame callback, cancellation/state guards prevent a second loop.
- Rollback is local: restore eager `runtimeHost.start()` or the unconditional RAF loop independently.
