# Hide Plugin Workflow Control Plane

## Goal

Keep high-level workflow.execute available while making persisted workflow registry, run history, review, and direct run APIs host-only until ownership exists.

## Background

The plugin facade exposes persisted workflow list/get/save/delete/run/history/review APIs. Workflow definitions and run records have no verified plugin owner field, while handlers accept global IDs and storage is shared with the CoreApp workflow editor. `intelligence.agents` authorizes autonomous execution; it does not authorize reading, overwriting, deleting, or replaying another actor's persisted workflow data.

## Requirements

- Keep the high-level typed `intelligence.workflow.execute()` capability wrapper available to plugins under existing autonomous permission governance.
- Remove low-level `workflowList/Get/Save/Delete/Run/History/ReviewUpdate` from the plugin facade type and runtime proxy.
- Reject raw plugin transport calls to all persisted workflow handlers with `INTELLIGENCE_HOST_ONLY_CAPABILITY` before service lookup, mutation, runtime wait, or provider/tool work.
- Preserve the full low-level workflow SDK for CoreApp renderer host callers.
- Correct docs that currently describe direct `workflowRun()` as a plugin autonomy path.

## Acceptance Criteria

- [x] Plugin facade hides every low-level workflow control-plane method while retaining `workflow.execute` and generic invoke/stream.
- [x] Raw plugin list/get/save/delete/run/history/review calls fail host-only and leave WorkflowService/runtime untouched.
- [x] Host list/save/run behavior and metadata object identity remain supported.
- [x] Focused facade/handler/high-level capability tests, targeted lint, CoreApp node type-check, AI docs verification, and diff check pass.
- [x] README/API/TODO/CHANGES and frontend security guidance distinguish high-level workflow capability from host-owned persisted workflow control plane.

## Out of Scope

- Adding workflow owner fields or migrations, a plugin-owned workflow registry, changing high-level `workflow.execute`, provider/tool governance, or host workflow editor behavior.
