# Implementation Plan

1. Add all persisted workflow control-plane methods to the plugin Intelligence host-only facade set.
2. Register workflow handlers through the reusable host-only request registrar and remove dead plugin caller/permission branches from direct workflow run.
3. Update facade and handler regressions for plugin denial, zero side effects, host preservation, and high-level `workflow.execute` availability.
4. Correct plugin SDK/API docs, TODO/CHANGES, and frontend security guidance.
5. Run focused facade/workflow/high-level capability tests, targeted lint, CoreApp node type-check, AI docs verifier, and diff check.

Rollback: revert facade and handler registration changes together; the canonical host SDK and persisted data schema are untouched.
