# Fix Nexus API key release typecheck

## Goal

Restore the release quality gate by returning an explicit null when D1 exact-one lookup still has an undefined indexed result at the TypeScript boundary.

## Requirements

- `lookupApiKeyRow` must preserve its exact-one-row collision guard and return only a concrete row or `null`.
- The change must not alter API key hashing, legacy fallback, expiration, scope parsing, or last-used updates.
- Nexus type-check and the repository release quality gate must pass before tagging the next beta.

## Acceptance Criteria

- [x] `lookupApiKeyRow` has no `undefined` return path.
- [x] `pnpm -C apps/nexus run typecheck` passes.
- [x] `pnpm quality:release` passes.

## Notes

- Release gate reproduced the TypeScript failure at `apps/nexus/server/utils/apiKeyStore.ts:220`.
- This is a type-boundary correction; the runtime exact-one-row behavior remains unchanged.
