# Enforce ContextPackage Optional Budget

## Goal

Allow only mandatory current input to exceed its host budget; prune oversized summaries, turns, memories, and retrieval even when no item was admitted first.

## Background

`ContextHygieneService.buildPackage()` currently permits whichever source arrives first to exceed `tokenBudget` by checking `items.length > 0`. Normally this approximates the required current-input exception. When the current turn is secret/private and therefore excluded, however, an oversized summary becomes the first admitted item and bypasses the host budget. The exception must follow source semantics, not array occupancy.

## Requirements

- Keep a normal current user input in the ContextPackage even when that single mandatory item exceeds `tokenBudget`; package `tokenEstimate` may exceed the budget only for this case.
- Apply the strict aggregate budget to every optional source: continuation summary, CompressionSnapshot/legacy summary, recent turn, Memory, and retrieval.
- A secret/private current turn remains excluded by privacy policy and does not grant the next optional source an overflow exception.
- Record every rejected optional item as metadata-only `token-budget-pruned` evidence without storing its content.
- Preserve source order, privacy behavior, compression/retrieval metadata, citation identity, SDK/API types, storage schema, and Provider execution semantics.

## Acceptance Criteria

- [x] A focused regression proves an oversized legacy summary is pruned when a secret current turn leaves the package empty.
- [x] The regression proves the package retains no optional content, has `tokenEstimate = 0`, and records both privacy and budget exclusion reasons without summary plaintext.
- [x] A focused contract proves a normal oversized current input remains included while an optional oversized summary is pruned.
- [x] Existing ContextHygiene/context-execution focused tests, targeted lint, and CoreApp node type-check pass.
- [x] 2.5.4/TODO/CHANGES and the Intelligence quality contract describe the mandatory-current-input-only exception without claiming a global hard cap.

## Out of Scope

- Truncating the current input, changing tokenizer estimates, adding a new Provider/model tokenizer, or changing quotas.
- Schema/data migrations, persisted package-log rewrites, SDK surface changes, or production evidence capture.
