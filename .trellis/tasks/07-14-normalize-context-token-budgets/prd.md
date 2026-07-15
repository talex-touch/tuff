# Normalize Context Token Budgets

## Goal

Fail closed for NaN and infinite token budgets in ContextHygiene and local knowledge instead of letting non-finite arithmetic bypass pruning.

## Background

ContextHygiene currently normalizes with `Math.max(1, Math.floor(value))`, while LocalKnowledgeEngine first coerces through `Number(...)`. `NaN` survives both `Math.floor` and `Math.max`; positive infinity remains unbounded. Comparisons against those values cannot enforce the intended hard budgets, and the local coercion also accepts runtime strings outside the typed SDK contract.

## Requirements

- Add one shared host helper that accepts an untrusted runtime value and a finite internal fallback, returning a finite integer budget of at least 1.
- Preserve finite-number behavior: floor fractions and clamp zero/negative values to 1.
- ContextHygiene uses its existing default budget of 1,600 for omitted, non-number, `NaN`, and positive/negative infinity inputs.
- LocalKnowledgeEngine uses a fail-closed fallback of 1 for non-number, `NaN`, and positive/negative infinity inputs; do not coerce numeric strings.
- Preserve all valid SDK/API input types, package/chunk packing order, mandatory-current-input exception, degraded/exclusion metadata, schema, and storage behavior.

## Acceptance Criteria

- [x] Pure tests cover finite fractions, zero/negative values, omitted/non-number values, `NaN`, and both infinities.
- [x] ContextHygiene regressions prove non-finite budgets resolve to 1,600 and never persist/return `NaN` or infinity.
- [x] LocalKnowledgeEngine regressions prove a non-finite/string budget resolves to 1 and cannot admit a chunk estimated above 1.
- [x] Existing estimator, ContextHygiene, context-execution, and local-knowledge focused tests, targeted lint, and CoreApp node type-check pass.
- [x] README/2.5.3/2.5.4/TODO/CHANGES and the Intelligence quality contract record runtime normalization without changing the typed SDK surface.

## Out of Scope

- Imposing a new maximum on valid finite caller budgets, changing token estimates, adding model tokenizers, or changing quota policy.
- SDK type/schema changes, database migrations, historical row rewrites, or production evidence capture.
