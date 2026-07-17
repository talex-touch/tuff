# Block Unsafe Context Fallback

## Goal

Prevent ContextExecution database-degraded fallback from sending secret-bearing raw input directly to providers when ContextHygiene cannot classify/persist it.

## Background

`IntelligenceContextExecutionService.prepare()` intentionally degrades to a current-input-only Provider payload when ContextHygiene storage/preparation fails. Privacy classification happens inside `saveTurn()`, after session/database work. A database failure can therefore enter the degraded branch before classification, and the branch currently forwards the raw request directly. This bypasses the same secret policy that blocks the normal ContextPackage path.

## Requirements

- Reuse the existing ContextHygiene secret classifier; do not create a second regex/policy implementation in ContextExecution.
- Before constructing any degraded current-input payload, classify the raw request locally without database or network dependencies.
- If the input matches the host secret policy, fail closed with stable `CONTEXT_CURRENT_INPUT_POLICY_BLOCKED`; neither invoke nor stream may call a Provider.
- Logs, errors, summaries, audit metadata, and thrown messages must not contain the raw secret value.
- Safe input retains the existing availability behavior: preparation failure degrades to current-input-only payload with `context_prepare_failed` metadata.
- Preserve normal ContextPackage privacy blocking, governance metadata, caller attribution, invoke/stream behavior, SDK/API types, and storage schema.

## Acceptance Criteria

- [x] An invoke regression makes ContextHygiene preparation fail before classification, supplies a secret-bearing input, and proves Provider `invoke` is never called.
- [x] A stream regression proves the same fail-closed behavior and that Provider `stream` is never called.
- [x] Both paths reject with `CONTEXT_CURRENT_INPUT_POLICY_BLOCKED` without exposing the secret; the existing safe degraded fallback contract remains green.
- [x] Existing ContextHygiene/context-execution focused tests, targeted lint, and CoreApp node type-check pass.
- [x] 2.5.4/TODO/CHANGES and the Intelligence quality/security contract record the fallback privacy boundary without claiming database availability.

## Out of Scope

- Adding new secret patterns, DLP/redaction products, remote classifiers, Provider retries, or user-visible recovery UI.
- SDK type/schema changes, database migrations, historical log rewrites, or production evidence capture.
