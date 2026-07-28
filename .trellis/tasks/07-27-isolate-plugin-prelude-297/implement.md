# Implementation Plan — Plugin Prelude Isolation #297

## RED 1 — Protocol, Codec And Authority

- [x] Add strict V2 capability call/result parser tests for version, expected owner, direction, fixed capability IDs, exact discriminants and malformed payloads.
- [x] Add host-session tests for handshake state, duplicate/late request IDs and the remaining lifecycle/callback/cancel message types before admitting them to V2.
- [x] Add codec tests for callbacks and rollback, errors, undefined, typed arrays, cancel/resource handles, depth/member/UTF-8 byte limits, cycles, accessors, BigInt/classes, marker forgery and prototype keys.
- [x] Add capability registry tests for fixed IDs, schema, current authoritative activation, per-call permission, in-flight revoke, stale/cross-plugin generation, cancellation, timeout and fail-closed resource recovery.

## GREEN 1

- [x] Add fixed typed V2 capability call/result protocol with stable redacted errors; unsupported message types remain rejected until their RED coverage lands.
- [x] Implement bounded wire codec primitives for owner-scoped callback/cancel/resource registries with pre-copy budgets and transactional callback rollback.
- [ ] Integrate V2 into the host and delete legacy `chain: string[]` dispatch after lifecycle/callback protocol coverage is complete.
- [x] Implement immutable, bounded capability registry core that reuses `#300` authoritative identity, requires synchronous main permission decisions, watches in-flight revoke, and fails the activation closed when an invoked handler ignores abort grace.
- [ ] Implement business capability adapters that reuse current SDK/transport guards and permission event teardown.

## RED 2 — Dedicated Process Lifecycle

- [x] RED 2A: add deterministic pure `PluginRuntimeHost` / manager tests with fake process, child and control-port adapters for activation ownership, transactional start, cancellation, timeout, crash, stop barriers and manager rotation.
- [x] RED 2B: add Electron process-factory option/resource tests, strict child load/VM/lifecycle/cancel tests, and a real two-activation utilityProcess smoke against the built host artifact.
- [ ] Add bridge tests proving one process/port per activation, transactional load/init, no cross-process routing and fail-closed missing host artifact.
- [ ] Add timeout/cancel/late-response, graceful/forced stop, crash, restart rotation, crash-loop and pending rejection tests.
- [ ] Add plugin enable/disable/reload/uninstall/revoke tests for generation/key/process/resource barrier ordering.

## GREEN 2

- [x] GREEN 2A: implement the pure activation-scoped `PluginRuntimeHost` / manager lifecycle with immutable owner/limits, acquisition-safe rollback, V2 deadlines/cancel, stable crash diagnostics and an exit-event termination barrier.
- [x] GREEN 2B: implement the Electron 41 utilityProcess/MessageChannelMain adapter and strict one-activation V2 child runtime with exact load DTO, child-only VM execution, bounded codec, cancellation and shutdown/exit cleanup.
- [ ] Replace singleton shared bridge with activation-scoped `PluginRuntimeHost` and manager.
- [ ] Bind every message to main-issued activation handle + host generation + current activation registry.
- [ ] Implement deadlines, cancellation, heartbeat, child heap/message/concurrency limits and redacted crash diagnostics.
- [ ] Integrate transactional host creation into `TouchPlugin.enable()` and awaited teardown into all lifecycle paths.

## RED/GREEN 3 — Async SDK And Event Semantics

- [x] RED/GREEN 3A: implement invoke-only fixed capability transport across `PluginRuntimeHost`, the V2 child endpoint, and the child VM with manifest-local denial, bounded correlation, stable errors, cancellation/cleanup, and real Electron proof.
- [ ] Add real utilityProcess integration tests for invoke, callback, subscription/disposer, stream controller and AbortSignal propagation.
- [ ] Convert sync host SDK surfaces to explicit async capability contracts or immutable child snapshots.
- [ ] Migrate channel/voice/intelligence callbacks and cancellation to resource IDs; prove teardown releases every main disposer.

## RED/GREEN 4 — Privileged Capability Migration

- [ ] Add require-policy tests denying Electron, fs/SQLite, child process, raw network, worker/runtime internals and native addons.
- [ ] Add typed filesystem/SQLite/process/network capability validators, permission guards, quotas and cancellation.
- [ ] Migrate every official Prelude off direct privileged Node APIs and raw fetch.
- [ ] Add per-plugin enable/trigger/disable isolation regressions, including browser data, batch rename, workspace scripts, system/window actions, translation, dictation and intelligence.

## GREEN 5 — Production Hard Cut

- [ ] Remove `TUFF_PLUGIN_ISOLATION`, synthetic self-check and singleton bridge startup.
- [ ] Remove production imports/calls to main-process `loadPluginFeatureContext*()` and `vm.runInContext()`.
- [ ] Keep any VM helper only in a testing-only module outside production bundle, or delete it.
- [ ] Fail plugin activation with stable code when protocol/capability/sdk contract is unsupported; never fallback.

## REFACTOR / REVIEW

- [ ] Remove duplicate experimental identity and reuse activation authority from #300.
- [ ] Scan production imports, requires, `vm`, utilityProcess, raw MessagePort, direct filesystem/process/network and lifecycle paths for bypasses.
- [ ] Update plugin runtime security spec and bilingual migration docs with async/capability/cancel contract.
- [ ] Independent security review finds no P0/P1/P2 identity, permission, lifecycle, resource or fallback finding.

## Validation

```bash
pnpm -C apps/core-app exec vitest run \
  src/main/modules/plugin/host/plugin-host-protocol.test.ts \
  src/main/modules/plugin/host/plugin-host-codec.test.ts \
  src/main/modules/plugin/host/plugin-host-capabilities.test.ts \
  src/main/modules/plugin/host/plugin-host-identity.test.ts \
  src/main/modules/plugin/host/plugin-host-bridge.test.ts \
  src/main/modules/plugin/host/plugin-host-process.integration.test.ts \
  src/main/modules/plugin/runtime/plugin-require.test.ts \
  src/main/modules/plugin/plugin.test.ts \
  src/main/modules/plugin/plugin-module.test.ts

pnpm -C apps/core-app typecheck:node
pnpm -C apps/core-app typecheck:web
pnpm plugins:validate
pnpm -C apps/core-app build:vite
pnpm -C apps/core-app exec electron scripts/plugin-host-isolation-smoke.cjs
pnpm -C apps/core-app exec eslint \
  src/main/modules/plugin/host/*.ts \
  src/main/modules/plugin/runtime/plugin-require.ts \
  src/main/modules/plugin/plugin-feature.ts
git diff --check
```

## Progress Evidence

- V2 wire/codec/capability/session focused suite: 5 files, 114 tests passed.
- Strict V2 runtime validation now covers handshake, load, lifecycle, callback, cancel, resource disposal, shutdown and violation messages with exact direction, owner and discriminant checks.
- Pure owner-bound host sessions cover one-shot init/load, state legality, response correlation, duplicate/cancelled/late IDs, bounded pending/history state, and exactly-once close/violation rejection.
- CoreApp Node typecheck and scoped ESLint passed; task-scoped `git diff --check` passed.
- Wire/codec hostile-input reviews closed findings on owner binding, discriminants, pre-copy limits, top-level exhaustive-key allocation, marker canonicalization, callback rollback, UTF-8 accounting and handle prechecks, accessors, Error handling, and stable error-code grammar.
- Capability registry reviews closed authority/close/cancel races, in-flight activation rotation and permission revoke, authorization accounting, ignored-signal fail-close, immutable definitions, hidden accessors, injected errors and runtime redaction; final reviewer reported no remaining P0/P1/P2.
- RED 2A was replayed in two strict test-first rounds before the final fixes: the first exposed raw factory-accessor errors, incorrect control-port start classification, and re-entrant duplicate cleanup; the second exposed truthy non-boolean artifact probes, missing child ports, pre-invalidation malformed-adapter cleanup, and invalid exit disposers.
- RED/GREEN 2A pure runtime-host suite: 45 deterministic tests cover missing/malformed artifact and spawn adapters, immutable limit validation and bounded request history, dedicated owner/process/port and pending isolation, synchronous response correlation, transactional load/init, rollback ordering, timeout/abort cancel and late responses, handshake/active crashes, isolated protocol violations, stable diagnostics, graceful/forced exit barriers (including a non-settling kill request), pending rejection before termination, re-entrant and repeated stop, start/stop races, manager rotation, crashed replacement rejection, stale/cross-plugin resolution, concurrent replacement during `stopAll`, and terminal manager shutdown.
- Runtime-host plus the V2 foundation and RED/GREEN 2B suites pass 184 tests; CoreApp Node typecheck and scoped host ESLint pass.
- Electron factory coverage proves regular-file artifact denial, fixed service/heap/env/stdio mapping, spawn-gated single-port transfer, removable listeners, kill/exit separation, fork rollback and failed-transfer port cleanup.
- The built `out/main/plugin-host.js` runs a strict V2 child only: exact owner/session binding, exact bounded load DTO, frozen snapshot/capability manifest, fixed plain lifecycle exports, context-native argument/result cloning, cancellation, stable failures and shutdown/parent-disconnect exit.
- Production `build:vite` and the real Electron smoke pass with two distinct utility-process PIDs, successful load/init/lifecycle, one hung activation timing out and terminating without affecting the other, stale/wrong-owner injection unable to cross-complete, and both stop barriers settling. The built child artifact scan finds no legacy chain dispatch, permissive require, Electron import, filesystem/SQLite/child-process/worker-thread import or raw network surface.
- Independent RED/GREEN 2A review fixed malformed-spawn child/port acquisition leaks, force-kill/exit barrier coupling, pre-correlation handle resolution, callback rollback error leakage, strict capability owner/activation snapshots, terminal-host resolution, and manager `replace`/`stopAll` races; no remaining P0/P1/P2 was found in the pure host/manager and V2 foundation scope.
- RED/GREEN 3A invoke-only transport passes the 10-file host V2/runtime/factory/child suite (242 tests): the activation-bound host dispatches only fixed parsed IDs through an injected registry/dispatcher, validates bounded results, redacts stable errors, aborts pending work on cleanup, and closes only explicitly owned dispatchers.
- Independent 3A review fixed two P1 findings: `PluginRuntimeHost` now rejects a capability dispatcher unless its frozen owner handle/host generation and full activation snapshot match the host, and child-realm capability/lifecycle serialization now enforces depth/member/UTF-8 byte budgets before JSON/array copies while using captured intrinsics after plugin mutation. Child capability timing no longer preempts main-owned 5s/30s definition deadlines; its 120s transport backstop fails the activation closed.
- The child endpoint now owns a bounded correlated capability pending map with local fixed-manifest denial, timeout/cancel/shutdown rejection, and fail-closed unknown/duplicate/late/wrong-owner/stale/malformed results. The VM exposes only frozen null-prototype `hostCapabilities.invoke`; payloads/results cross realm-safe conversion plus the shared codec, while function/AbortSignal/class/accessor/cycle smuggling, intrinsic mutation, pre-copy budget overflow and constructor/Proxy realm escapes are rejected.
- Production `build:vite` and the real Electron smoke pass for the independently reviewed 3A state: two distinct utility-process PIDs remain isolated, alpha invokes the main capability adapter exactly once, beta rejects the same unlisted capability locally without reaching main, one hung activation times out without affecting the other, and stale-owner injection cannot cross-complete. The built child artifact scan finds no legacy chain dispatch, Electron/fs/SQLite/child-process/worker import, or raw network surface.
- Reviewed 3A files pass scoped host ESLint, and CoreApp Node typecheck passed immediately after the fixes. The final workspace-wide typecheck rerun is externally blocked by a concurrently added orphan `plugin-runtime-service.test.ts` importing the still-missing `./plugin-runtime-service`; the delegated 10-file suite, production build, Electron smoke and task diff checks remain green. No P0/P1/P2 finding remains in the delegated invoke-only scope.
- Singleton bridge replacement, heartbeat/restart budget, activation-registry integration, `TouchPlugin` lifecycle integration and business adapters remain pending.
- This is foundation only: production still uses the legacy experimental protocol and main-process Prelude loader, so no #297 acceptance criterion is claimed complete yet.

## Release Gate

Do not mark review, commit, publish or close #297 until every real plugin Prelude uses a dedicated utilityProcess, all privileged access is typed and per-call authorized, official plugins pass isolated regression, and real Electron smoke proves crash/hang/resource violations cannot block main or cross activation boundaries.
