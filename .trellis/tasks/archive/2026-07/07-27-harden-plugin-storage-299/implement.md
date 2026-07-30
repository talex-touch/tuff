# Implementation Plan — 插件 SQLite 与 Secret 加固 #299

## Dependency Gates

1. Keep #296 focused tests green and consume `PERMISSION_REVOKED`.
2. Verify #300 authoritative identity for raw IPC, invoke and plugin port lanes; do not close #300's unfinished plugin-host scope from this task.

## RED 1 — Policy, Identity And Contracts

- [x] Add pure SQL policy tests for quotes/comments/semicolon, allowed lane statements, every denied capability, malformed input and 64 KiB limit.
- [x] Add handler tests for payload-only/forged/copied/stale/cross-plugin identity, permission unavailable/denied, sdk mismatch, health guard and stable errors.
- [x] Add SDK tests proving typed error codes survive execute/query/transaction/Secret failures.

## GREEN 1

- [x] Add shared storage error types and typed SDK error.
- [x] Implement authoritative current-activation resolver and protected registrations for SQLite/Secret.
- [x] Implement host/worker shared SQL policy and input/param/statement admission bounds.

## RED 2 — Worker, Timeout And Resource Bounds

- [x] Add worker/runtime tests using temp DBs: CRUD/transaction success, quoted/unquoted PRAGMA denial, row/result bounds, queue/global/open-worker limits and disk quota.
- [x] Add real long-running read and write tests proving timeout terminates worker, no late write, poisoned generation removal and replacement recovery. Recursive CTE is denied by policy, so the runtime test uses a bounded Cartesian workload.
- [x] Add canonical path/symlink/validation-to-open swap tests and stale-generation conditional cleanup.

## GREEN 2

- [x] Add worker protocol/entry and electron-vite output `plugin-sqlite-worker.js`.
- [x] Implement activation-owned SQLite resource registry with per-plugin FIFO, global semaphore, worker resource limits, hard deadlines and idle LRU cleanup.
- [x] Implement canonical path resolver plus worker pre/post-open revalidation and worker-owned trusted quota initialization/checkpoint.
- [x] Replace main-process Client execution in storage handlers with worker resource operations.

## RED 3 — Revocation, Lifecycle And Secret Integrity

- [x] Add lifecycle tests for revoke/revokeAll, disable/reload/unload/uninstall/destroy ordering and target isolation.
- [x] Add secure-store tests for concurrent writes/deletes, injected temp-write/rename failure, atomic old-file preservation, corruption semantics and prefix purge isolation.
- [x] Add translation Secret regressions for unavailable/denied visibility and no plaintext fallback.

## GREEN 3

- [x] Subscribe/unsubscribe `PERMISSION_REVOKED`; inject awaited teardown into plugin manager lifecycle and make unload ordering deterministic.
- [x] Add per-root secure-store mutation serialization, atomic replace, and host-only prefix purge.
- [x] Purge only target plugin Secret values on uninstall; retain on revoke/disable/reload.

## REFACTOR / REVIEW

- [x] Remove obsolete main-process `Map<string, Client>` and raw SQL helpers.
- [x] Scan production code for payload plugin fallback, `verified` authorization, raw SQL/path/secret logging and unbounded response paths.
- [x] Update #296/#299/#300 task notes and security audit evidence without claiming #297 complete.

## Validation Commands

```bash
pnpm -C apps/core-app exec vitest run \
  src/main/modules/plugin/runtime/plugin-sql-policy.test.ts \
  src/main/modules/plugin/runtime/plugin-sqlite-worker-client.test.ts \
  src/main/modules/plugin/runtime/plugin-sqlite-resource-owner.test.ts \
  src/main/modules/plugin/runtime/plugin-sqlite-worker.integration.test.ts \
  src/main/modules/plugin/services/plugin-storage-transport-service.test.ts \
  src/main/modules/plugin/plugin-module.test.ts \
  src/main/utils/secure-store.test.ts \
  src/main/modules/permission/permission-store.test.ts \
  src/main/modules/permission/index.test.ts

pnpm --filter @talex-touch/utils exec vitest run \
  __tests__/plugin-sqlite-sdk.test.ts \
  __tests__/plugin-storage-sdk.test.ts \
  __tests__/main-transport-identity.test.ts \
  __tests__/main-transport-port-identity.test.ts

pnpm -C apps/core-app run typecheck:node
pnpm -C apps/core-app run typecheck:web
pnpm -C apps/core-app exec eslint <changed core-app files>
pnpm --filter @talex-touch/utils exec eslint <changed utils files>
pnpm plugins:validate
pnpm -C apps/core-app run build

test -f apps/core-app/out/main/plugin-sqlite-worker.js
git diff --check
```

## Final Evidence

- Core focused: 10 files / 140 tests passed.
- Utils focused: 5 files / 18 tests passed.
- touch-translation Secret regressions: 2 files / 3 tests passed.
- `typecheck:node`, prior `typecheck:web`, scoped new-module ESLint, `plugins:validate` (24/24), `build:vite`, worker artifact check, real worker smoke and `git diff --check` passed.
- Real built-worker tests cover worker-side policy, CRUD/transaction, row/result/disk bounds, timeout termination and recovery, no late write, and validation-to-open symlink replacement.
- Final independent review findings (quoted identifier bypass, path TOCTOU, strict non-string Secret corruption) were fixed with regressions; no P0 remains.

## Release Gate

Do not commit/tag/push `v2.4.14-beta.1` until focused security tests, node/web typecheck, production main build/worker artifact, release quality checks and Trellis review pass. A timeout test that only rejects a Promise without proving worker termination is a hard failure.
