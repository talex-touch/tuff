# Fix intelligence config idempotency

## Goal

Stop unchanged Intelligence config reads from rewriting prompt timestamps, persisting storage, and rebuilding every provider.

## Requirements

- Preserve prompt record `updatedAt` unless semantic prompt fields change.
- Keep prompt-schema migration deterministic and idempotent.
- Do not call runtime `updateConfig` when the effective config signature is unchanged.
- Preserve intentional force-reload behavior only for explicit reload operations.

## Acceptance Criteria

- [x] Two normal loads of unchanged config produce one initial runtime update and no second storage save.
- [x] A semantic prompt change updates the record timestamp and runtime once.
- [x] Existing provider/capability defaults remain intact.
