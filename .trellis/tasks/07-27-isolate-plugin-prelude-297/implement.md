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
- [x] Implement business capability adapters that reuse current SDK/transport guards and permission event teardown.

## RED 2 — Dedicated Process Lifecycle

- [x] RED 2A: add deterministic pure `PluginRuntimeHost` / manager tests with fake process, child and control-port adapters for activation ownership, transactional start, cancellation, timeout, crash, stop barriers and manager rotation.
- [x] RED 2B: add Electron process-factory option/resource tests, strict child load/VM/lifecycle/cancel tests, and a real two-activation utilityProcess smoke against the built host artifact.
- [x] RED 2C: add service and TouchPlugin integration tests for dedicated activation ownership, transactional start/stop, cleanup-before-observer ordering, protocol/timeout termination, controlled teardown suppression, stable redaction and stale callback rejection.
- [ ] Add bridge tests proving one process/port per activation, transactional load/init, no cross-process routing and fail-closed missing host artifact.
- [ ] Add timeout/cancel/late-response, graceful/forced stop, crash, restart rotation, crash-loop and pending rejection tests.
- [ ] Add plugin enable/disable/reload/uninstall/revoke tests for generation/key/process/resource barrier ordering.

## GREEN 2

- [x] GREEN 2A: implement the pure activation-scoped `PluginRuntimeHost` / manager lifecycle with immutable owner/limits, acquisition-safe rollback, V2 deadlines/cancel, stable crash diagnostics and an exit-event termination barrier.
- [x] GREEN 2B: implement the Electron 41 utilityProcess/MessageChannelMain adapter and strict one-activation V2 child runtime with exact load DTO, child-only VM execution, bounded codec, cancellation and shutdown/exit cleanup.
- [x] GREEN 2C: implement an explicitly injected `PluginRuntimeService` and incremental `TouchPlugin` isolated lifecycle path, plus exactly-once terminal notification after authority/resource/dispatcher cleanup and the true child exit barrier. Production default wiring and the hard cut remain pending.
- [ ] Replace singleton shared bridge with activation-scoped `PluginRuntimeHost` and manager.
- [ ] Bind every message to main-issued activation handle + host generation + current activation registry.
- [ ] Implement deadlines, cancellation, heartbeat, child heap/message/concurrency limits and redacted crash diagnostics.
- [ ] Integrate transactional host creation into `TouchPlugin.enable()` and awaited teardown into all lifecycle paths.

## RED/GREEN 3 — Async SDK And Event Semantics

- [x] RED/GREEN 3A: implement invoke-only fixed capability transport across `PluginRuntimeHost`, the V2 child endpoint, and the child VM with manifest-local denial, bounded correlation, stable errors, cancellation/cleanup, and real Electron proof.
- [x] RED/GREEN 3B: implement owner-bound callback RPC plus transactional resource/disposer transport with explicit immutable callback lifetime, bounded child-realm conversion, deterministic cancellation, retention and teardown cleanup.
- [x] RED/GREEN 3B2: implement bidirectional request-scoped cancellation with direction-isolated correlation, exact canonical cancellation results, bounded awaiting-ack tombstones, lifecycle/callback AsyncLocalStorage scopes, cancel grace fail-close, and late resource disposal.
- [ ] Add real utilityProcess integration tests for invoke, callback, subscription/disposer, stream controller and AbortSignal propagation.
- [ ] Convert sync host SDK surfaces to explicit async capability contracts or immutable child snapshots.
- [ ] Migrate channel/voice/intelligence callbacks and cancellation to resource IDs; prove teardown releases every main disposer.

## RED/GREEN 4 — Privileged Capability Migration

- [x] RED/GREEN 4A: add activation-local trusted feature-item/clipboard business adapters, fixed child facades and a child-local DTO `TuffItemBuilder`; migrate `touch-emoji-symbols` end to end without production default/hard-cut changes.
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
- Reviewed 3A files pass scoped host ESLint, and CoreApp Node typecheck passed immediately after the fixes. The former orphan `plugin-runtime-service.test.ts` blocker is resolved by RED/GREEN 2C; the full V2 host/service/TouchPlugin suite and workspace Node typecheck now pass. No P0/P1/P2 finding remains in the delegated invoke-only scope.
- RED/GREEN 2C passes 293 tests across all 11 V2 host/service files plus `plugin.test.ts`: host terminal observers accept only own data-property functions, receive frozen stable protocol/timeout diagnostics, and fire exactly once only after authority invalidation, owned dispatcher/resource cleanup and the real child exit barrier. Normal stop/close, startup rollback, manager replacement, controlled caller-abort teardown and ordinary crash reporting do not duplicate the terminal observer.
- `PluginRuntimeService` now reports a crash only for the current accepting record, removes that record before cleanup, waits for manager/host termination before invoking the TouchPlugin observer, suppresses startup/normal-stop reports, and contains observer throws. Protocol violation, active timeout and unexpected exit all reach one stable redacted `PLUGIN_RUNTIME_HOST_CRASHED` observer result after cleanup.
- The current TouchPlugin integration remains deliberately incremental and explicitly injected. Its focused tests preserve authority-before-start, revoke-before-failed-stop, awaited disable, generation/key rotation, stable issue redaction and stale crash callback rejection; this slice does not install a production default service or claim the hard cut.
- RED/GREEN 2C validation passes CoreApp Node typecheck, full scoped plugin-host/plugin ESLint, production `build:vite`, the real Electron two-activation utilityProcess smoke (`PLUGIN_HOST_ISOLATION_SMOKE_OK`) and workspace `git diff --check`. No P0/P1/P2 remains in the delegated 2C terminal-notification/service/TouchPlugin scope.
- Independent 2C check fixed two P1 lifecycle defects: cancel/timeout late replies now preserve the first terminal classification instead of upgrading caller abort to a crash or timeout to protocol violation, and feature exit now awaits the isolated `onClose` Promise through the transport handler. It also closed P2 hostile-option/resource-idempotence gaps by descriptor-snapshotting host activation/callback options and bounded capability-definition containers, and by avoiding duplicate stop/error reporting after an already-cleaned runtime crash.
- Final 2C check passes 299 tests across all 11 V2 host/service files plus `plugin.test.ts` and `plugin-module.test.ts`; CoreApp Node typecheck, full scoped host/plugin ESLint, production `build:vite`, the real Electron smoke (`PLUGIN_HOST_ISOLATION_SMOKE_OK`), and workspace `git diff --check` pass. No P0/P1/P2 remains in the delegated 2C scope.
- RED/GREEN 3B strict RED evidence was captured before implementation: callback registry 12 tests / 4 failures, resource registry 14 tests / 14 failures, capability declaration 35 tests / 1 failure, and child VM 50 tests / 4 failures. These failures covered accessor rejection, owner/current-generation binding, invocation transaction and per-kind limits, child disposal idempotence, and undeclared/nested callback rejection.
- RED/GREEN 3B adds activation-owner/current-generation callback registries on both endpoints, callback-only capability payload encoding gated by immutable per-capability top-level `callbackFields`, exact sync/async callback correlation, stable throw/timeout/cancel behavior, transient release, and explicit `callbackLifetime: 'resource'` retention. VM callback arguments/results cross only the bounded context-node codec; undeclared or nested callbacks, Proxy/class callbacks, constructor escape, accessors, cycles, malformed/duplicate/late IDs and callbacks outside capability payloads fail closed.
- Main resources now use invocation transactions and registry-local opaque handle identity: handlers register through injected `resources`, commit only the exact returned handle, roll back every other handle on handler/result/post failure, enforce total and per-kind limits, bind permission revoke, release retained callbacks before native disposal, and close every resource exactly once. Child resource tokens are frozen null-prototype `{ id, kind, dispose }` projections with idempotent async disposal and transactional decode rollback.
- The final 3B V2 host/service/TouchPlugin suite passes 343 tests across 15 files. CoreApp Node typecheck, scoped host/smoke ESLint, production `build:vite`, built-child forbidden-surface scan, real two-utility-process Electron smoke (`PLUGIN_HOST_ISOLATION_SMOKE_OK`), and workspace `git diff --check` pass. The smoke proves transient callback, callback throw redaction, retained callback after capability completion, idempotent disposer, post-dispose rejection, timeout containment and two-process isolation.
- 3B review fixed P1 owner/current-generation omission on callback registries and P1 orphan resource retention after malformed decode/handler-result failure, plus P2 forged global-handle acceptance, accessor-safe option snapshots, per-kind quotas and duplicate/idempotence gaps. No remaining known P0/P1/P2 exists within the callback/resource/disposer transport slice.
- RED/GREEN 3B2 final check fixed three additional P1 findings: lifecycle and retained-callback work now run in separate `AsyncLocalStorage` scopes and use child-to-main capability cancellation plus canonical bounded acknowledgements, so cooperative cancel/timeout preserves unrelated concurrent work while ignored aborts still fail the activation closed; a resource returned after its creating scope was cancelled is disposed before the cancellation result; and resource `commit`/`dispose`/`close` now share the real async teardown barrier and cannot install permission watchers after close wins. Released callback/resource IDs have bounded no-reuse histories, including reentrant close coverage. The complete 15-file V2 host/service/TouchPlugin suite passes 356 tests; CoreApp Node/Web typechecks, scoped host/smoke ESLint with zero warnings, production `build:vite`, source/built-child forbidden scans, expanded two-process Electron smoke (`PLUGIN_HOST_ISOLATION_SMOKE_OK`) and `git diff --check` pass. No P0/P1/P2 remains in the delegated 3B2 scope.
- Independent complete-3B foundation security review first replayed the existing 15-file baseline at 356/356 tests, then captured 14 RED regressions before fixes. It closed five P1 findings: detached async work could reuse a completed lifecycle/callback scope; reentrant permission-watcher registration could commit after registry close; retained callback failure could orphan its owning resource; capability registries could accept a resource dispatcher from another owner/activation; and unknown responses could resolve callback/resource handles before correlation admissibility failed. It also closed four P2 findings: child exit could overwrite the caller's original cancel/timeout classification; closed registries could turn a late permission revoke into a spurious fatal event; `callbackFields: ['then']` could create a thenable payload; and callback-kind `resource-dispose` was not explicitly rejected at the main resource boundary.
- The independent complete-3B final state passes 370/370 tests across the same 15 files, CoreApp Node and Web typechecks, scoped host/smoke ESLint with `--max-warnings 0`, final-source production `build:vite`, built-child forbidden-surface scan, real Electron utility-process smoke (`PLUGIN_HOST_ISOLATION_SMOKE_OK`) and workspace `git diff --check`. No known P0/P1/P2 remains in the full V2 wire/codec/session, callback, resource, request-scoped bidirectional cancellation, child/runtime/service or Electron-smoke foundation scope. Business adapters, `plugin-module` business definitions, `TouchPlugin`, official plugins and the legacy bridge were not modified by this review.
- RED/GREEN 4A adds hostile-snapshotted activation-local capability definitions to `PluginRuntimeService`; trusted base and activation definitions merge without duplicate IDs, produce a per-activation manifest, and close through the existing dispatcher/resource/start-rollback/stop barriers.
- The first business adapter family covers exact `feature.items.push/update/remove/clear/list` and `clipboard.read/write/copy-and-paste` IDs. Requests/results are bounded exact DTOs, permissions are fixed canonical IDs, authority/current-generation is rechecked, permission revoke aborts in-flight work, and captured host methods cannot be replaced after activation.
- The child VM now exposes manifest-gated frozen null-prototype `plugin.feature`, `clipboard`, and text-only local `logger` facades plus a frozen child-local DTO `TuffItemBuilder`. Undeclared methods are absent locally; constructor/code-generation escape tests remain closed.
- `touch-emoji-symbols` no longer exports production `__test`, performs no child-side permission check/request, awaits feature clear/push and clipboard write, and reports only deterministic redacted failures. Its manifest permissions are unchanged.
- 4A validation passes 16 host/service/TouchPlugin files with 376 tests, the 6-test official emoji regression, CoreApp Node/Web typechecks, scoped lint with zero warnings, 24/24 plugin validation, production `build:vite`, source/built-child forbidden scans, `git diff --check`, and the expanded real Electron smoke (`PLUGIN_HOST_ISOLATION_SMOKE_OK`). The smoke loads the actual emoji script in two distinct utility processes, proves isolated item/clipboard state, and proves the surviving activation remains usable after the other stop barrier settles.
- No known P0/P1/P2 remains within the 4A activation-local adapter/facade/emoji scope. Storage/network/process adapters, other official plugins, production runtime-service default wiring, singleton bridge removal and the hard cut remain pending.
- Production runtime-service wiring/default hard cut, singleton experimental bridge removal, heartbeat/restart budget, remaining child facades and remaining official plugin migration remain pending.
- Production business batch 1 adds 23 immutable host-owned definitions: plugin info; dynamic features and activation-owned feature items; bounded JSON file storage; worker-owned SQLite under the existing SQL policy; redacted Secret storage; clipboard; external URL opening; and no-redirect HTTP. Every request/result uses exact bounded DTO validation, authority and host-generation checks, canonical `PermissionStore.hasPermission(pluginName, permissionId, currentPlugin.sdkapi) === true`, and exact-generation teardown.
- HTTP capability validation permits only HTTP(S), rejects URL credentials plus loopback/private/link-local/mapped addresses before and after DNS resolution, denies redirects, propagates cancellation, and bounds request/result sizes. File, SQLite, Secret, clipboard, URL, and network operations reuse existing host services instead of exposing privileged child APIs.
- Business batch 1 RED was captured as 8/8 expected failures before the production factory existed. Final focused business/module/TouchPlugin suites pass 47 tests; the expanded 27-file foundation plus business/service suite passes 521 tests. CoreApp Node/Web typechecks, scoped ESLint with zero warnings, 24/24 plugin validation, production `build:vite`, real Electron smoke (`PLUGIN_HOST_ISOLATION_SMOKE_OK`), and `git diff --check` pass.
- This batch does not claim child-facade or official Prelude migration, legacy bridge removal, renderer changes, or the #297 hard cut. Official plugin Prelude sources were not changed by this batch.
- This is foundation only: production still uses the legacy experimental protocol and main-process Prelude loader, so no #297 acceptance criterion is claimed complete yet.

- Independent 4A check added strict hostile DTO coverage for host actions, file icons, custom render/meta path bypasses and proxied nested host services; fixed canonical item ownership, exact-generation cleanup, activation startup rollback, snapshot path redaction, facade declaration gating, builder clone stability, and deterministic emoji fallback containment. The activation-local implementation passed 384/384 tests across the 16-file host/service/TouchPlugin suite, 8/8 emoji tests, Node/Web typechecks, zero-warning scoped lint, 24/24 plugin validation, production `build:vite`, source/built-child forbidden scans, `git diff --check`, and real Electron smoke (`PLUGIN_HOST_ISOLATION_SMOKE_OK`).
- Final handoff is BLOCKED by a concurrent Pi writer: after the above final-source validation it repeatedly restored all 23 business definitions as `PluginModule` production defaults and removed the 8-ID activation-local `TouchPlugin.startActivation` binding. That current state directly violates the delegated 4A prohibition on storage/network/process and production default wiring, so the validation evidence must not be treated as applying to the final worktree until the concurrent writer is stopped and the activation-local version is restored.

## Release Gate

Do not mark review, commit, publish or close #297 until every real plugin Prelude uses a dedicated utilityProcess, all privileged access is typed and per-call authorized, official plugins pass isolated regression, and real Electron smoke proves crash/hang/resource violations cannot block main or cross activation boundaries.
