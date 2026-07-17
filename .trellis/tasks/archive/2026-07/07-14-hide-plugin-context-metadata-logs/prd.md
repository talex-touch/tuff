# Hide Plugin Context Metadata Logs

## Goal

Make ContextHygiene checkpoints and package logs host-only because session IDs and metadata are not plugin-owned or namespaced.

## Background

The plugin facade exposes `contextListCheckpoints()` and `contextListPackageLogs()`. Checkpoints may include summaries/reasons/arbitrary metadata; package logs may be queried without a session ID and expose cross-session source IDs, trace IDs, item reasons, and arbitrary metadata. Context sessions and these records do not carry a verified plugin owner, so describing them as metadata-only does not make cross-plugin/host reads safe.

## Requirements

- Keep `contextInvoke()` / `contextStream()` and pure `contextEvaluateMemory()` available to plugins.
- Remove checkpoint and package-log query methods from the plugin facade type/runtime proxy.
- Reject raw plugin query events with `INTELLIGENCE_HOST_ONLY_CAPABILITY` before ContextHygiene/SQLite access.
- Preserve the full methods and behavior for CoreApp renderer host callers.
- Correct docs that currently call these unscoped queries plugin-safe.

## Acceptance Criteria

- [x] Plugin facade hides `contextListCheckpoints` and `contextListPackageLogs` while retaining safe context execution/evaluation.
- [x] Raw plugin checkpoint/package-log calls fail host-only and do not call ContextHygieneService.
- [x] Host checkpoint/package-log queries remain available with payload identity and results preserved.
- [x] Focused facade/context boundary tests, targeted lint, CoreApp node type-check, AI docs verification, and diff check pass.
- [x] README/API/TODO/CHANGES and frontend security guidance state the host-only metadata boundary.

## Out of Scope

- Adding context-session ownership columns or migrations, plugin-scoped observability APIs, changing `contextInvoke` summaries, Memory evaluation, or provider behavior.
