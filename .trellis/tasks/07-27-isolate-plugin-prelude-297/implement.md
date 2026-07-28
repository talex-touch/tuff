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

## Candidate 4B Final Independent Review

This section supersedes the earlier concurrent-writer handoff for the final reviewed worktree. No official Prelude was migrated in this review.

### Findings

- **P0:** none found.
- **P1 closed:** production installation of the 23-capability runtime was enabled before the official Prelude set was compatible. `plugin-runtime-rollout.ts` now keeps only default installation disabled, with no environment escape and no fallback to the main-process VM.
- **P1 closed:** HTTP DNS validation was separated from connection and remained vulnerable to DNS rebinding/redirect behavior. The host now performs a no-redirect/no-retry request through a connect-time pinned DNS lookup, revalidates the canonical response URL, rejects credentials/private/reserved/mapped-private addresses, strips hop-by-hop response headers and bounds streamed bytes.
- **P1 closed:** business file storage delegated to generic plugin methods without a canonical filesystem boundary or aggregate quota. It now uses strict flat JSON filenames, canonical-root checks, symlink rejection, `O_NOFOLLOW`, atomic temp-write/rename, 1 MiB per-file and 10 MiB/1,000-file aggregate limits, bounded listing, and cleanup-error containment.
- **P1 closed:** feature-item ownership takeover could delete the previous generation before the replacement push committed. Ownership now transfers only after a successful host push; cancellation that wins after a committed push still records the new owner for teardown, and exact activation cleanup cannot delete a newer generation's items.
- **P1 closed:** activation/module teardown could stop after an early failure or discard failed item ownership before a later retry. Business cleanup retains failed owner records for retry; SQLite close, runtime disposal, transport reset, health-monitor disposal and scheduler cleanup continue independently and report one stable aggregate failure.
- **P1 closed:** child item DTOs could declare `source.permission: "system"` and spoof a host-owned trust marker. Business item requests now reject that field; plugin/source identity and trust remain host-derived.
- **P2 closed:** proxy/accessor/sparse-array/prototype-key DTOs, oversized serialized item/SQLite results, SQL parameter cycles/depth/member overflow, unbounded callback-shape traversal, dynamic renderer paths, file icons, host-action payloads, HTTP header control characters and hostile host return containers now fail before unsafe reads or privileged work.
- **P2 closed:** open URL rejects embedded credentials and requires the host policy decision to match the canonical requested URL/protocol. Business Secret keys use a collision-resistant encoded plugin namespace, including dotted plugin names/keys, while uninstall cleanup covers both the legacy and isolated prefixes; plaintext values and native failures stay redacted.
- **P2 closed:** every accepted flat business filename, including extensionless names, is visible to list/remove, and atomic writes remain successful if post-commit notification transport is unavailable.
- **P2 closed:** rollout and smoke tests now fail diagnostically instead of hiding the underlying Electron exception; the smoke fixture uses the pinned network seam.
- **Remaining rollout blocker:** setting the production runtime default to `true` is not safe. The gate is safely fail-closed, but the isolated path is not production-ready for the complete official set and, while disabled, isolated Prelude activation returns the stable runtime-closed failure rather than using a legacy fallback.

### Official Prelude Compatibility

The current 21 manifest-backed official Preludes split as follows:

- Compatible with the current child facades: `touch-code-snippets`, `touch-emoji-symbols`, `touch-text-snippets`.
- Blocked by top-level `require` (some also need storage/intelligence/process facades): `touch-batch-rename`, `touch-browser-data`, `touch-browser-open`, `touch-dev-utils`, `touch-intelligence`, `touch-quick-actions`, `touch-snipaste`, `touch-snippets`, `touch-system-actions`, `touch-text-tools`, `touch-translation`, `touch-window-manager`, `touch-window-presets`, `touch-workspace-scripts`.
- Blocked by missing child facades: `touch-browser-bookmarks` (storage/permission/open URL), `touch-dev-toolbox` (storage/permission/open URL), `touch-dictation` (voice), `touch-quickops` (quick-ops/flow).

The static rollout test inventories all 18 blocked plugins and requires the default to remain disabled until the inventory reaches zero. Production does construct and retain the 23 immutable business definitions and runtime service, but injects `null` into `TouchPlugin` by default.

### Final Validation

- Expanded plugin V2/runtime/business/storage/clipboard/network set: 27 files, 522 tests passed; focused business/registry/module/TouchPlugin/network set: 121 tests passed.
- Official Emoji regression: 8/8 passed.
- CoreApp Node and Web typechecks passed.
- Scoped host/plugin/network/smoke ESLint passed with `--max-warnings 0`.
- Plugin validation passed 24/24 (existing `touch-dictation` permission/search-provider warnings remain).
- Final-source production `build:vite` passed with existing chunking/third-party warnings.
- Real Electron isolation smoke passed: `PLUGIN_HOST_ISOLATION_SMOKE_OK`.
- `git diff --check` passed.

## Batch A Official Prelude Migration

This section supersedes the Candidate 4B compatibility count and records the first four compatible manifested activations. The production default remains disabled and the legacy bridge is unchanged.

### Implemented Contracts

- The official inventory now uses **22 manifest activations** plus two explicitly non-activation Surface directories. `touch-image` and `touch-music` have no `manifest.json`; the latter's renderer `preload.js` is not a Prelude.
- `PLUGIN_RUNTIME_COMPATIBLE_OFFICIAL_PRELUDES` is exactly `clipboard-history`, `touch-code-snippets`, `touch-emoji-symbols`, and `touch-text-snippets`. The source-derived rollout test computes 18 remaining incompatible manifests and keeps `shouldInstallPluginRuntimeServiceByDefault()` false.
- `TouchPlugin` receives a sanitized internal Prelude contract from the manifest loader. A declared root `main` is required; a canonical `build.index.entry` selects `dist/build/index.js` when the source entry exists and package-root `index.js` in the built projection. Missing required builds fail with stable `PLUGIN_RUNTIME_PRELUDE_*` codes and never fall back to a stale root script or an empty module. Only a manifest with neither contract gets `module.exports = {}`.
- `clipboard-history/index/main.ts` now produces strict CJS `module.exports = {}` without `__esModule` or unknown exports. The package is registered in the official build/seed projection pipeline, and the validator recognizes `build.index.entry` without treating the plugin as UI-only.
- Batch A source and child-load tests reject `__test`, direct privileged imports, raw fetch, process, arbitrary require, and unknown exports. Code/text snippets retain only child-local logger initialization; emoji retains the reviewed feature/clipboard capability path.
- The Electron smoke loads the production clipboard seed plus the three exact root scripts. Two complete four-plugin rounds prove four unique PIDs/handles/host generations, awaited load/init, no-op or emoji trigger, awaited exit barriers, PID/handle/generation rotation, and rejection of an old-port forged lifecycle result.
- `disable()` now invalidates activation authority before awaiting runtime teardown and child exit.

### Validation

- Full V2/business/service/module/TouchPlugin set: 20 files, **446/446 tests passed**.
- Additional production-contract, require-policy, runtime-integrity and official-seed set: 4 files, **20/20 tests passed**; release projection/after-pack/loader set: **38/38 passed**; root source-package audit: **6/6 passed**.
- Official emoji Node suite: **8/8 passed**. Clipboard package typecheck, **20/20 tests**, and canonical production build passed.
- CoreApp Node and Web typechecks passed. Scoped CoreApp ESLint passed with zero warnings.
- `pnpm plugins:validate` passed **22 manifest policies** and **24/24 directory classification**. The existing dictation permission/search-provider warnings remain; image/music are explicitly skipped Surface-only directories.
- `clipboard-history` canonical build, release seed, and runtime projection share SHA-256 `7dd11b8459fcfbff4ffbf6028eb392435839087d8590a6f9726dd78832692dc3`; all contain strict `globalThis.module.exports={}` output.
- Final-source `build:vite`, source/built-child forbidden scans, real Electron smoke (`PLUGIN_HOST_ISOLATION_SMOKE_OK`) and `git diff --check` passed.
- `touch-music` Surface build and renderer-preload syntax check passed. `touch-image` transformed/rendered its Surface but the existing exporter failed while writing `build/@talex-touch/touch-image-plugin-0.0.0.tpex`; it remains outside activation success and was not modified.

### Remaining Findings And Blockers

- **P0:** none found in Batch A scope.
- **P1:** none found in the four manifested activation migrations.
- **P2:** the non-activation `touch-image` build-only smoke remains blocked by the existing exporter output-path failure described above. It creates no plugin activation or Prelude path.
- **18 manifested compatibility blockers remain:** 14 top-level-require plugins (`touch-batch-rename`, `touch-browser-data`, `touch-browser-open`, `touch-dev-utils`, `touch-intelligence`, `touch-quick-actions`, `touch-snipaste`, `touch-snippets`, `touch-system-actions`, `touch-text-tools`, `touch-translation`, `touch-window-manager`, `touch-window-presets`, `touch-workspace-scripts`) and four missing-facade plugins (`touch-browser-bookmarks`, `touch-dev-toolbox`, `touch-dictation`, `touch-quickops`).

## Concurrent Writer Final-Worktree Blocker

This section supersedes the Batch A final-source validation claim for the current shared worktree.

A concurrent writer continued modifying the same runtime and test files after Batch A passed its complete validation. `plugin-host-child-runtime.ts` changed repeatedly through the final check, while `plugin-runtime-rollout.test.ts` was expanded from the delegated four-plugin list to eight plugins. These writes violate this delegation's “no other plugin migration” boundary and make it unsafe to repair or revert them from this agent.

The last replay against the concurrently modified tree is not green:

- rollout now expects eight compatible plugins while production source still declares the delegated four;
- child load snapshots now require `locale` and a new capability surface, but several runtime/test payloads are not coherently updated;
- a concurrent stale-projection test expects `PLUGIN_RUNTIME_PRELUDE_ARTIFACT_STALE` without the matching resolver contract;
- business definitions increased to 24 while a module test still asserts 23;
- CoreApp Node typecheck fails on the concurrent stale-code expectation.

The earlier 446/446 suite, Node/Web typechecks, build, forbidden scans and Electron smoke were valid before these later writes, but must not be reported as final-worktree evidence. Stop the concurrent writer, restore one coherent scope, and rerun every Batch A gate before handoff.

## Batch A/B/C-Simple Final Worktree Report

This section supersedes the earlier Batch A compatibility count and the concurrent-writer blocker for the current reviewed worktree. It does not claim the #297 production hard cut.

### Rollout Inventory

- `PLUGIN_RUNTIME_COMPATIBLE_OFFICIAL_PRELUDES` now contains exactly eight manifested activations: `clipboard-history`, `touch-browser-bookmarks`, `touch-code-snippets`, `touch-dev-toolbox`, `touch-dev-utils`, `touch-emoji-symbols`, `touch-text-snippets`, and `touch-text-tools`.
- The source-derived rollout gate still counts 22 manifested official activations and two explicitly manifestless Surface directories. `shouldInstallPluginRuntimeServiceByDefault()` remains `false`; there is no environment override.
- Fourteen manifested blockers remain: `touch-batch-rename`, `touch-browser-data`, `touch-browser-open`, `touch-intelligence`, `touch-quick-actions`, `touch-snipaste`, `touch-snippets`, `touch-system-actions`, `touch-translation`, `touch-window-manager`, `touch-window-presets`, and `touch-workspace-scripts` retain top-level `require`; `touch-dictation` still needs the voice facade; `touch-quickops` still needs quick-ops and flow facades.
- The eight compatible Prelude sources contain no `__test`, top-level `require`, raw `fetch`, `process`, Electron, filesystem, SQLite, child-process, or worker-thread surface. Emitted simple-plugin items use bounded class icons rather than child-supplied file paths, and bookmarks/toolbox route commands through typed item actions instead of broad metadata fields.

### Real Electron Evidence

- The production-built `out/main/plugin-host.js` smoke now reads the actual `plugins/touch-dev-utils/index.js`; it does not substitute a synthetic dev-utils script.
- Two complete five-plugin rounds start `clipboard-history`, `touch-code-snippets`, `touch-text-snippets`, `touch-emoji-symbols`, and `touch-dev-utils` in distinct utility processes. Every round proves unique PID, activation handle, host generation, and activation generation.
- The actual dev-utils Prelude runs `onFeatureTriggered`, publishes validated feature items through the production business capability registry, executes a real clipboard action, crosses the stop/exit barrier, restarts with rotated ownership, and rejects a first-round closed-port response forged against the second-round request.
- The smoke continues to prove callback/resource disposal, request-scoped cancellation, timeout containment, stale owner isolation, and survival of the unrelated activation. Final result: `PLUGIN_HOST_ISOLATION_SMOKE_OK`.

### Final Validation

- Complete plugin-host suite: **16 files, 377/377 tests passed**.
- Plugin/module/loader/rollout/production-contract/require/resolver/network set: **98/98 tests passed** after correcting the canonical projection fixture to include its `_files['index.js']` SHA-256 contract.
- Release projection tests: **15/15 passed**; source package audit: **6/6 passed**.
- Official simple Prelude local suites: **26/26 passed**. Clipboard History passed typecheck, **20/20 tests**, and canonical build. Dev Utils, Text Tools, and Emoji passed their package tests and real Tuff builders.
- Clipboard History canonical build, bundled resource, and runtime projection retain identical SHA-256 `7dd11b8459fcfbff4ffbf6028eb392435839087d8590a6f9726dd78832692dc3`. Dev Utils, Text Tools, and Emoji root/build Prelude hashes also match exactly.
- CoreApp Node and Web typechecks passed. Scoped CoreApp ESLint passed with `--max-warnings 0`.
- `pnpm plugins:validate` passed **22 manifest policies** and **24/24 directory classification**. The existing dictation permission/search-provider warnings remain.
- Final-source production `build:vite`, compatible-source and built-child forbidden-surface scans, real Electron smoke, syntax checks, and `git diff --check` passed. Existing Vite chunking/third-party warnings remain non-blocking.

### Scope Result

- No known P0/P1/P2 remains in this Batch A/B/C-simple migration and actual dev-utils smoke scope.
- Production runtime installation remains deliberately disabled while the fourteen blockers remain. The legacy bridge and the complete #297 hard cut are unchanged and remain release blockers.

## Batch C QuickOps And Snippets Migration

This section supersedes the earlier rollout count for the final reviewed Batch C worktree. It does not claim the #297 production hard cut.

### Implemented Contracts

- `touch-quickops` and `touch-snippets` now execute through isolated-runtime facades only. Their production exports contain lifecycle hooks only: no `__test`, top-level `require`, raw `fetch`, `process`, Electron, filesystem, SQLite, child-process, worker-thread, or reflective loader surface.
- QuickOps publishes bounded host-valid item DTOs, awaits clear/push ordering, dispatches only fixed QuickOps and Flow operations through the dedicated `quickOps` and `flow` facades, uses manifest-declared optional `storage.shared`, and returns deterministic redacted failures when capability access is denied or unavailable.
- Snippets initializes and bounds its plugin-owned JSON store, publishes host-valid search/save/manage items, resolves clipboard placeholders through the clipboard facade, and routes CloudShare list/publish/install through fixed request/reply operations. Public packs exclude sensitive snippets and contain no child-provided credentials; `storage.plugin` is required and `network.internet` is optional.
- Both packages are registered in the canonical release target registry. Their canonical source, package build output, bundled resource, and runtime seed are synchronized and byte-identical; projection and after-pack tests cover both names and versions.
- The rollout allowlist is now **10 of 22** manifested official activations. Exactly 12 plugins remain explicitly unmigrated, and `shouldInstallPluginRuntimeServiceByDefault()` remains false with no environment bypass.
- The real Electron smoke activates both actual bundled Preludes, exercises permission denial/grant, QuickOps Flow dispatch, Snippets CloudShare and clipboard-placeholder paths, restart/generation rotation, stale-message rejection, teardown, and listener cleanup.

### Final Validation

- Complete focused host/plugin suite: **393 tests passed**; additional runtime/network suite: **56 tests passed**; rollout/request-reply/simple-Prelude suite: **24 tests passed**.
- Plugin-local suites: QuickOps **5/5 passed** and Snippets **7/7 passed**. Release synchronization, after-pack, and source-package-audit suites passed.
- CoreApp Node and Web typechecks passed. Scoped ESLint passed with zero warnings.
- `pnpm plugins:validate` passed **22 manifest policies** and **24/24 directory classification**; only the existing unrelated dictation/search-provider warnings remain.
- Production `build:vite`, compatible-source and built-child forbidden-surface scans, syntax checks, projection parity, `git diff --check`, and the final real Electron smoke passed. Smoke result: `PLUGIN_HOST_ISOLATION_SMOKE_OK`.
- QuickOps projections share SHA-256 `e371d27d7babf7015234e69fb6a28a9ea4e081014b03b1aa6c22ad0e61a640eb`; Snippets projections share SHA-256 `a29cacc79055c5108e658e66fad21411c7bf1762c43feae5365329db4734b765`.

### Remaining Scope

- The 12 explicitly unmigrated official Preludes, production runtime default enablement, legacy bridge removal, and the complete #297 hard cut remain pending.
- No commit, push, merge, renderer migration, unsupported plugin migration, or unrelated cleanup was performed for Batch C.

## Batch D Dictation Voice Migration

This section supersedes the earlier rollout count for the reviewed Dictation worktree.
It does not claim the #297 production hard cut.

### Implemented Contracts

- `touch-dictation` now uses only the declaration-gated `plugin.voice`, feature, and
  clipboard facades. Its production Prelude has no `__test`, top-level `require`, raw
  network, `process`, Electron, filesystem, SQLite, child-process, worker-thread, or
  reflective host surface.
- `voice.invoke` and `voice.stream` are fixed, permission-checked capability IDs.
  Streaming uses one owner/generation-bound retained callback and resource, awaits
  every event for backpressure, auto-disposes on terminal events, and treats explicit
  cancel/dispose as idempotent.
- Capability cancellation now reaches production `VoiceService`: native capture is
  cancelled immediately; pending STT, polish, and TTS awaits release with the stable
  `VOICE_OPERATION_CANCELLED` result; late provider values are discarded; and abort
  before playback guarantees no native audio playback.
- Main derives `plugin:<manifest id>` only after authoritative owner/generation
  validation and threads it through STT, polish, and TTS. Child DTOs cannot select a
  caller, so quota, audit, and TTS cache identity remain plugin-scoped.
- WebSocket ASR open, event queue, and frame pump are signal-aware. Each retained
  stream owns a controller; explicit dispose aborts it before awaiting iterator return,
  closes the socket, latches terminal state, removes handlers, and awaits pump exit.
- TTS audio never crosses to the child. Dictation publishes standard bounded plugin
  actions rather than broad metadata, and awaits feature and clipboard side effects.
- The compatible rollout inventory is now **11 of 22** manifested activations, adding
  `touch-dictation`. `PLUGIN_RUNTIME_DEFAULT_ENABLED` remains `false` with no
  environment bypass; 11 official Prelude migrations remain.

### Real Electron Evidence

- The production-built host runs the actual Dictation Prelude in two complete plugin
  rounds with a dedicated utility process for every activation.
- The smoke proves permission deny/grant, partial/final stream delivery, clipboard
  paste, owner resource count returning to zero, awaited stop, distinct PIDs/handles,
  activation and host generation rotation, stale-port rejection, and continued
  isolation of unrelated activations.
- Integrated result after the Voice hardening commits: `PLUGIN_HOST_ISOLATION_SMOKE_OK`.
  The shared worktree also contained the separately landed Batch Rename migration.

### Final Validation

- Focused Voice capability/VoiceService/WebSocket/PluginModule suite: **43/43 tests
  passed**. The integrated tracked host/rollout/module/Voice suite, including the
  separately landed Batch Rename batch, passed **25 files, 454/454 tests**.
- Independent review first found two P1 issues: host-global Intelligence attribution
  and non-cancellable WebSocket waits. Both were closed and the follow-up review found
  no remaining P0/P1/P2 in caller, cancellation, authority, resource, or redaction scope.
- CoreApp Node and Web typechecks passed. Scoped ESLint passed with zero warnings.
- `pnpm plugins:validate` passed **22 manifest policies**, **24/24 directory
  classification**, and **20/20 search-provider coverage**.
- Final-source production `build:vite`, real Electron smoke, and `git diff --check`
  passed. Existing Vite chunking and third-party warnings remain non-blocking.
- Code commits: `30551c39a feat(plugins): isolate dictation voice runtime [task 297]`,
  `8ceb8f4dd fix(plugin): cancel isolated voice host work [task 297]`,
  `0603c4473 fix(voice): cancel in-flight ASR streams on abort`, and
  `733719ae9 feat(voice): attribute voice work to the calling plugin`.

### Remaining Scope

- At the Batch D boundary, eleven official Preludes remained. Batch Rename landed in
  a separate subsequent batch; Intelligence/Translation and the remaining
  filesystem/process/system/window plugins still require migration.
- Production default enablement, heartbeat/restart budget, legacy bridge removal,
  22/22 regression, final independent security review, and the complete hard cut
  remain release blockers.
- The concurrent Batch Rename batch was intentionally excluded from the Dictation
  commits and later landed in separate commits; integrated validation includes it but
  the Voice security review does not claim its scope.

## Release Gate

Do not mark review, commit, publish or close #297 until every real plugin Prelude uses a dedicated utilityProcess, all privileged access is typed and per-call authorized, official plugins pass isolated regression, and real Electron smoke proves crash/hang/resource violations cannot block main or cross activation boundaries.
