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

## Batch E Batch Rename Filesystem Migration

This section supersedes the earlier rollout count for the reviewed Batch Rename worktree.
It does not claim the #297 production hard cut.

### Implemented Contracts

- `touch-batch-rename` is the 12th isolated-runtime compatible activation. Its production
  Prelude has no `__test`, `require`, raw `fetch`, `process`, Electron, filesystem/path
  import, privileged dialog, or reflective host surface. Apply and undo both await the
  fixed `filesystem.renameBatch()` facade and publish only standard typed plugin actions.
- The activation-local `filesystem.write` definition accepts only the exact
  `{ operation: 'rename-batch', entries }` transaction. It binds absolute canonical
  regular-file sources to lifecycle file inputs, requires declared/current `fs.read` and
  `fs.write`, rejects hostile/accessor/proxy/sparse/oversized DTOs, symlinks, device and
  ADS names, escapes, existing targets, duplicate sources, and case/Unicode collisions.
- Rename execution uses a same-device two-phase temporary transaction. Cancellation,
  permission revoke, and activation rotation are checked before and after every
  privileged filesystem mutation, including the final commit point; every tested losing
  race rolls back to the original files. Teardown closes admission, awaits active operations, and
  clears activation-owned path authority before the runtime barrier settles.
- The child exposes only a frozen null-prototype `filesystem` object with one frozen
  `renameBatch` method when `filesystem.write` is declared. No generic read/write/stat,
  constructor escape, raw capability surface, or undeclared fallback is exposed.
- `TouchPlugin` creates this definition only for `touch-batch-rename`, approves lifecycle
  inputs before isolated feature dispatch, and closes it through enable rollback,
  disable, crash, and runtime resource barriers. The manifest adds only `storage.plugin`
  for the bounded undo journal and retains `fs.read`, `fs.write`, and
  `search.root-results`.
- Rollout is exactly **12 of 22** manifested official activations.
  `PLUGIN_RUNTIME_DEFAULT_ENABLED` remains `false` with no environment bypass.

### Review Findings

- **P0:** none found.
- **P1 closed:** custom `actionId` metadata was rejected by the real business DTO. Batch
  Rename now uses `TuffItemBuilder.createAndAddAction()` and the Electron smoke exercises
  the actual accepted action shape.
- **P1 closed:** lifecycle approval previously stored only a canonical path string, so a
  same-path inode replacement or parent swap could inherit authority. Approval now snapshots the
  exact file and parent `dev/ino`, rejects hard links and non-regular inputs, revalidates both
  identities before each mutation, and drops stale lifecycle-derived grants on the next input.
- **P1 closed:** target absence was checked only during preparation and the later `rename()` could
  overwrite a file created by a racing writer. The transaction now uses same-device hard-link plus
  unlink moves, which fail atomically on an existing target and preserve swap/cycle semantics.
- **P1 closed:** a successful link followed by verification failure was not represented in the
  rollback state. State now advances immediately after the atomic link; failed rollback state is
  retained and retried by the awaited close barrier, with stable redacted failure behavior.
- **P1 closed:** cancel/revoke/rotation during the final target rename could return a
  terminal failure after files had committed. Authority checks now cover all eight mutation
  boundaries and keep the operation inside rollback through its final commit point.
- **P2 closed:** relative source paths, Windows ADS/reserved characters and device names (including
  `CONIN$`/`CONOUT$` and superscript COM/LPT forms), control characters, stale lifecycle grants,
  duplicate inode sources, hard links, and macOS Unicode-equivalent target collisions now fail
  before unsafe filesystem mutation.
- No known P0/P1/P2 remains in the delegated Batch Rename filesystem, facade, lifecycle,
  Prelude, rollout, or Electron-fixture scope.

### Final Validation

- Complete plugin-host suite: **21 files, 420/420 tests passed**.
- Plugin/module/rollout/resolver/Prelude resolver/require/production-contract/integrity
  suite: **8 files, 94/94 tests passed**.
- Batch Rename production Prelude regression: **6/6 passed**; focused real-filesystem
  capability suite: **12/12 passed**, including hostile/exact/oversized DTOs, inode and
  parent provenance, hard links, symlinks, target races, swaps/cycles, old-generation undo
  denial, all eight mutation-boundary cancel/revoke/rotation rollbacks, post-link verification,
  rollback-close recovery, and close barrier behavior.
- CoreApp Node and Web typechecks passed. Task-scoped CoreApp and plugin ESLint passed
  with `--max-warnings 0`.
- `pnpm plugins:validate` passed **22 manifest policies**, **24/24 directory
  classification**, and **20/20 search-provider coverage**.
- Final-source `build:vite`, Batch Prelude and built-child forbidden-surface scans, syntax
  checks, real Electron smoke (`PLUGIN_HOST_ISOLATION_SMOKE_OK`), and `git diff --check`
  passed. Existing Vite chunking and third-party warnings remain non-blocking.

### Remaining Scope

The exact ten unmigrated official activations are:

- `touch-browser-data`
- `touch-browser-open`
- `touch-intelligence`
- `touch-quick-actions`
- `touch-snipaste`
- `touch-system-actions`
- `touch-translation`
- `touch-window-manager`
- `touch-window-presets`
- `touch-workspace-scripts`

Production default enablement, heartbeat/restart budget, legacy bridge removal, 22/22
regression, final independent security review, and the complete hard cut remain release
blockers.

## Batch F Quick Actions System Capability Migration

This section supersedes the Batch E rollout count for the reviewed Quick Actions worktree.
It does not enable the production runtime default or claim the complete #297 hard cut.

### Implemented Contracts

- `touch-quick-actions` is the 13th isolated-runtime compatible activation. Its Prelude
  contains no `__test`, `require`, raw `fetch`, `process`, Electron, dialog authority,
  shell command, executable, argument vector, or generic process surface. It submits only
  one of eight fixed action IDs through `system.runAction()` and publishes host-valid
  dynamic feature and item DTOs.
- The activation-local `system.invoke` definition accepts only exact
  `{ operation: 'run-action', actionId }` requests. Main owns fixed macOS/Windows executable
  mappings, per-call `system.shell` authorization, current activation and host-generation
  checks, timeout/cancellation, restart/shutdown double confirmation, and stable redacted
  results. No child field can select a command, executable, arguments, environment, URL,
  script, or working directory.
- Started processes are activation-owned resources. Cancel, timeout, permission revoke,
  disable, crash, and activation rotation close admission, issue at most one kill, and await
  the real process exit barrier. Destructive confirmation receives the same AbortSignal and
  is always parented to a live Electron BrowserWindow; absence of a valid parent fails closed.
- The child exposes a frozen null-prototype `system` / `plugin.system` facade only when
  `system.invoke` is declared. It locally rejects every unknown action ID and exposes no
  generic invoke or `process` escape. `TouchPlugin` creates this definition only for
  `touch-quick-actions` and rotates it per activation.
- Rollout is exactly **13 of 22** manifested official activations.
  `PLUGIN_RUNTIME_DEFAULT_ENABLED` remains `false` with no environment bypass.

### Review Findings

- **P0:** none found.
- **P1 closed:** the activation-local system definition was not pinned to the activation
  that created it, so a retained factory could validate against whichever activation was
  current at call time. The factory now snapshots the exact plugin instance, activation
  generation, key, and host generation, and rechecks that authority after confirmation,
  immediately after spawn, and after the real process exit.
- **P1 closed:** destructive confirmation was not strictly bound to the configured CoreApp
  window and current activation. Production now resolves only `BrowserWindow.fromId()` for
  the module's main window ID, fails closed for a missing/destroyed parent, projects the
  fixed dialog DTO, propagates the same AbortSignal, and revalidates activation before any
  process starts.
- **P1 closed:** malformed process adapters could treat an `error`, a rejected/false kill,
  or a rejected/forged `wait()` result as termination and settle while a spawned process
  remained live. Only the real child `exit` event now proves exit; kill is idempotent,
  registration rollback terminates the process, adapter failures trigger one termination
  attempt, and cancellation/revoke/disable/timeout await the shared exit barrier.
- **P2 closed:** action membership, process/result adapters, confirmation results, and
  constructor/accessor/proxy surfaces are snapshotted and exact-validated. The fixed
  macOS/Windows table is covered for all 16 platform/action mappings, and unknown or
  child-supplied executable/script/args/env/cwd/URL/dialog fields fail before execution.
- **P2 closed:** the first real Electron smoke rejected the Prelude's legacy boolean
  platform DTO during dynamic feature registration. The Prelude now emits the canonical
  `IPlatform` `{ enable, arch, os }` shape and both plugin-local suites assert it.
- **P2 closed:** independent review found that cancellation during native destructive
  confirmation needed to dismiss the visible dialog as well as terminate the capability.
  The confirmation DTO now requires Electron's `MessageBoxOptions.signal`, production uses
  the parent-window overload required by macOS, and no-parent operation fails closed.
  Cancel/revoke/disable/timeout confirmation tests prove the executor is never reached.
- Final independent review, including the installed Electron 41 API declaration, reports
  no remaining P0/P1/P2 identity, permission, confirmation, cancellation, process-resource,
  facade, redaction, or destructive-test finding in this migration scope.

### Final Validation

- Focused host/service/TouchPlugin/rollout/official-Prelude suite: **16 files, 358/358 tests
  passed**. Quick Actions plugin-local suites passed **5/5** under both `node:test` and the
  package Vitest harness.
- CoreApp Node and Web typechecks passed. Task-scoped CoreApp ESLint passed with
  `--max-warnings 0`.
- `pnpm plugins:validate` passed **22 manifest policies**, **24/24 directory
  classification**, and **20/20 search-provider coverage**.
- Final-source production `build:vite`, Quick Actions source and built-child forbidden-surface
  scans, syntax checks, real Electron smoke (`PLUGIN_HOST_ISOLATION_SMOKE_OK`), and
  `git diff --check` passed. The smoke uses a fake fixed-ID executor and runs no OS system
  action. Existing Vite chunking and third-party warnings remain non-blocking.
- Strict migration-13 recheck on the final reviewed source passed **27 files, 548/548 tests**
  across the complete plugin-host directory plus TouchPlugin, PluginModule, and rollout;
  the focused migration slice passed **113/113**. Both Quick Actions local suites passed
  **5/5**, CoreApp Node/Web typechecks passed, task-scoped CoreApp/plugin/package ESLint
  passed with zero warnings, and `pnpm plugins:validate` passed **22 manifest policies**,
  **24/24 directory classification**, and **20/20 search-provider coverage**.
- Final-source `pnpm -C apps/core-app build`, valid forbidden-child/shell-interpolation scans,
  exact `13/22` plus default-disabled checks, Electron smoke
  (`PLUGIN_HOST_ISOLATION_SMOKE_OK`), and `git diff --check` passed. The reviewed smoke path
  injects an in-memory fixed-ID executor; no OS action or native command was executed.
- Final strict-review severity is **P0: 0 open, P1: 0 open, P2: 0 open**. No commit, push,
  branch switch, reset, rebase, or history change was performed.

### Remaining Scope

The exact nine unmigrated official activations are:

- `touch-browser-data`
- `touch-browser-open`
- `touch-intelligence`
- `touch-snipaste`
- `touch-system-actions`
- `touch-translation`
- `touch-window-manager`
- `touch-window-presets`
- `touch-workspace-scripts`

Production default enablement, heartbeat/restart budget, legacy bridge removal, 22/22
regression, complete final security review, and the complete #297 hard cut remain release
blockers. No other plugin migration, rollout gate flip, legacy deletion, commit, push, or
history change was performed in this batch.

## Batch G System Actions Migration

This section supersedes the Batch F rollout count for the reviewed System Actions worktree.
It does not enable the production runtime default or claim the complete #297 hard cut.

### Implemented Contracts

- `touch-system-actions` is the 14th isolated-runtime compatible activation. Its Prelude
  contains no `__test`, `require`, raw `fetch`, `process`, Electron, safe-shell,
  `pinyin-pro`, dialog authority, arbitrary URL flow, executable, argument vector,
  environment, working directory, script, or child-owned confirmation surface.
- The reviewed `system.invoke` capability now accepts the existing Quick Actions IDs plus
  `volume-up`, `volume-down`, `brightness-up`, `brightness-down`, and
  `open-main-window`. Static plugin metadata canonicalizes legacy `mute` to the existing
  fixed `mute-toggle` ID; no second mute alias or arbitrary action fallback exists.
- Action authorization is activation-name scoped. `touch-quick-actions` retains only its
  original eight IDs; `touch-system-actions` receives only power/audio/brightness/window
  IDs. Unknown, extra-field, cross-plugin, and unsupported-platform requests fail before
  host work. Windows brightness returns stable `platform-unsupported` without spawning.
- Every shell-backed action requires the manifest-declared current `system.shell` grant.
  Permission watch installation precedes authorization; revoke aborts confirmation or
  process work, kills at most once, and awaits the real child `exit` barrier. Restart and
  shutdown retain the two-step main-owned, parent-window confirmation with the same
  cancellation signal.
- `open-main-window` bypasses shell permission only through an injected host method. The
  method receives the captured activation, rechecks current identity around restore/show/
  focus, uses only the configured CoreApp window ID, and exposes no BrowserWindow object
  to the child. `system.shell` is optional in the System Actions manifest so this safe
  action remains usable without granting shell execution.
- The Prelude publishes only bounded standard plugin items and fixed `run-action`
  payloads, awaits clear/push/system calls, uses static bilingual keywords, and preserves
  stable blocked/cancelled/failed/success results. All production and Electron tests use
  fake executor/show-window services; no real OS action was run.
- Rollout is exactly **14 of 22** manifested official activations.
  `PLUGIN_RUNTIME_DEFAULT_ENABLED` remains `false` with no environment bypass.

### Review Findings

- **P0:** none found.
- **P1 closed:** definition-wide `permission: system.shell` would also deny the safe
  `open-main-window` action. Permission enforcement now occurs per fixed action, with
  manual revoke propagation and the existing cancellation/exit barrier.
- **P1 closed:** extending one shared fixed-ID facade could have let Quick Actions invoke
  the new window/brightness IDs or System Actions invoke unrelated settings IDs. Main now
  validates an immutable plugin-name-specific action allowlist after exact DTO parsing.
- **P1 closed:** main-window execution previously lived in the child and could reach host
  globals directly. It now uses one activation-bound injected host projection with current
  identity checks before every synchronous window mutation.
- **P2 closed:** the legacy System Actions `mute` ID conflicted with reviewed
  `mute-toggle`; the migrated script and tests use only `mute-toggle`. Platform-specific
  brightness has an explicit stable unsupported result and never falls through to spawn.
- Final scoped review found no remaining P0/P1/P2 identity, permission, confirmation,
  process-resource, window-authority, facade, redaction, or destructive-test finding.

### Final Validation

- Complete plugin-host plus TouchPlugin/PluginModule/rollout suite: **27 files,
  561/561 tests passed**. System Actions plugin-local production-script suite: **7/7
  passed**.
- CoreApp Node and Web typechecks passed. CoreApp/plugin/package scoped ESLint passed
  with `--max-warnings 0`.
- `pnpm plugins:validate` passed **22 manifest policies**, **24/24 directory
  classification**, and **20/20 search-provider coverage**.
- Final-source production `build:vite`, source/built-child forbidden-surface scans,
  exact `14/22` plus default-disabled assertion, syntax checks, and `git diff --check`
  passed. Existing Vite chunking and third-party annotation warnings remain non-blocking.
- Real Electron two-generation utility-process smoke passed:
  `PLUGIN_HOST_ISOLATION_SMOKE_OK`. It loads the actual System Actions Prelude, proves
  shell deny/grant, safe main-window dispatch without shell permission, unique process/
  handle/generation rotation, stale old-port rejection, teardown/listener cleanup, and
  uses only in-memory fake executor/show-window services.
- No commit, push, merge, branch switch, reset, rebase, or history change was performed.

### Remaining Scope

The exact eight unmigrated official activations are:

- `touch-browser-data`
- `touch-browser-open`
- `touch-intelligence`
- `touch-snipaste`
- `touch-translation`
- `touch-window-manager`
- `touch-window-presets`
- `touch-workspace-scripts`

Production default enablement, heartbeat/restart budget, legacy bridge removal, 22/22
regression, complete final security review, and the complete hard cut remain release
blockers. No other plugin migration or rollout gate flip was performed in this batch.

## Batch H Snipaste Fixed Process Migration

This section supersedes the Batch G rollout count for the reviewed Snipaste worktree.
It does not enable the production runtime default or claim the complete #297 hard cut.

### Implemented Contracts

- `touch-snipaste` is the 15th isolated-runtime compatible activation. Its Prelude
  contains no `__test`, `require`, `child_process`, path/process/env access, raw fetch,
  Electron, custom executable, custom argument, or settings-based process authority.
  The seven built-in launch/snip/full-snip/paste/color/toggle/docs workflows remain.
- The activation-local `process.spawn` definition accepts only exact
  `{ operation: 'snipaste-action', actionId }` with seven fixed IDs. Child input cannot
  provide executable, path, command, args, env, cwd, detached, shell, or platform.
- Main discovers canonical absolute regular executables only at fixed platform roots
  and a bounded user `Applications` root derived in Electron main. It rejects
  symlinks, non-files, root escapes and PATH command lookup, maps fixed args, and
  spawns with no shell/interpolation, fixed cwd, ignored stdio and minimal env.
- Each call checks authoritative activation, host generation, manifest declaration and
  current `system.shell` before/after discovery and spawn. Started processes remain
  activation-owned after the RPC returns; cancel, timeout, revoke, disable, crash and
  rotation kill at most once and await the real exit barrier.
- Child exposes only frozen null-prototype `plugin.snipaste.runAction()` when
  `process.spawn` is declared. Unknown IDs are rejected locally; no global process,
  spawn, executable, path, native error or resource handle is exposed.
- `SNIPASTE_PATH`, `settings.json.snipastePath`, custom actions/args, config-init and
  config-open were removed because they cannot satisfy the fixed boundary. The plugin
  README documents this explicit migration incompatibility; there is no silent argument
  forwarding or insecure compatibility path.
- Rollout is exactly **15 of 22** manifested official activations.
  `PLUGIN_RUNTIME_DEFAULT_ENABLED` remains `false` with no environment bypass.

### Review Findings

- **P0:** none found.
- **P1 closed:** `process.spawn` accepted any structurally compatible main discovery
  adapter, so a later caller could bypass the fixed candidate inventory without changing
  the child DTO. Discovery is now compile-time branded by the fixed factory and runtime
  signed through a module-private identity registry. Arbitrary adapters, structural
  copies, and proxies fail during capability construction before permission watchers,
  discovery, or process work.
- **P1:** none open in the delegated fixed-process, discovery, permission, lifecycle,
  child-facade, Prelude, rollout, or fake-smoke scope.
- **P2:** none open. The initial Electron smoke exposed a real business item DTO mismatch
  caused by diagnostic capability metadata; the Prelude now emits only canonical item
  fields and the real business registry accepts it.
- Scope tradeoff: arbitrary executable paths and custom argument actions are intentionally
  no longer supported. Supporting them would reintroduce child-selected process authority;
  the fixed seven workflows were preserved instead.

### Final Validation

- Complete plugin-host plus TouchPlugin/PluginModule/rollout suite: **29 files,
  607/607 tests passed**. The focused signed-discovery/process suite passed **41/41**
  and the child Snipaste facade suite passed **2/2**; Snipaste plugin-local suite:
  **7/7**; packages/test: **3/3**.
- CoreApp Node and Web typechecks passed. CoreApp/plugin/package scoped ESLint passed
  with `--max-warnings 0`.
- `pnpm plugins:validate` passed **22 manifest policies**, **24/24 directory
  classification**, and **20/20 search-provider coverage**.
- Final-source production `build:vite`, source/built-child forbidden-surface scans,
  syntax checks, exact `15/22` plus default-disabled assertion, and `git diff --check`
  passed. Existing Vite chunking and third-party annotation warnings remain non-blocking.
- Real Electron utility-process smoke passed: `PLUGIN_HOST_ISOLATION_SMOKE_OK`. It loads
  the actual Snipaste Prelude in two generations, proves shell deny/grant, fixed action
  dispatch, process close barriers, PID/handle/generation rotation and stale old-port
  rejection. The Snipaste executor/discovery are in-memory fakes; no real Snipaste or OS
  process/action was started.
- Final strict-review severity is **P0: 0 open, P1: 0 open, P2: 0 open**.
- No commit, push, merge, branch switch, reset, rebase, or history change was performed.

### Remaining Scope

The exact seven unmigrated official activations are:

- `touch-browser-data`
- `touch-browser-open`
- `touch-intelligence`
- `touch-translation`
- `touch-window-manager`
- `touch-window-presets`
- `touch-workspace-scripts`

Production default enablement, heartbeat/restart budget, legacy bridge removal, 22/22
regression, complete final security review, and the complete hard cut remain release
blockers. No other plugin migration or rollout gate flip was performed in this batch.

## Batch I Window Presets Migration

This section supersedes the Batch H rollout count for the reviewed Window Presets
worktree. It does not enable the production runtime or claim the #297 hard cut.

### Implemented Contracts

- `touch-window-presets` now uses a purpose-built `system.window-presets` capability
  for `status`, `preset-two-column`, `preset-dev-split`, and
  `preset-clear-topmost`. The child facade is projected only for the exact manifest
  name plus declaration, is frozen/null-prototype, and exposes only `status()` and
  fixed-ID `runAction()`; generic `system.invoke` is not exposed to this plugin.
- All PowerShell, executable/arguments/cwd/environment, Win32 interop, window
  enumeration, PID/handle/title processing, deterministic pair selection, coordinates,
  layout, and topmost cleanup remain in Electron main. The child DTO cannot select or
  observe any of them.
- Main accepts only canonical Windows drive roots, signs the fixed executor factory and
  process adapters, uses `shell: false`, bounds stdout to 256 KiB and enumeration to 128
  windows, validates exact hostile DTOs/results, and emits only stable redacted counts,
  affected-window totals, and failure reasons.
- Every call requires authoritative plugin/activation/host-generation state plus current
  `system.shell`. Caller cancellation, permission revoke, timeout, disable, crash,
  startup rollback, and generation rotation kill each owned process at most once and
  await its real exit event before cleanup settles.
- The production Prelude uses only the frozen platform snapshot, feature facade,
  `TuffItemBuilder`, logger, and the fixed window-presets facade. It awaits clear/push,
  status, and action work, publishes bounded canonical items, and contains no `require`,
  `child_process`, global `process`, PowerShell, raw handle/coordinate/path detail,
  permission SDK call, generic system facade, or production `__test` export.
- Rollout is exactly **16 of 22** manifested official activations.
  `PLUGIN_RUNTIME_DEFAULT_ENABLED` remains `false` with no environment bypass.

### Review Findings

- **P0:** none found.
- **P1:** none open in fixed executor authority, per-call permission, host/activation
  ownership, child containment, process exit barriers, Prelude, rollout, or smoke scope.
- **P2:** none open. Hostile requests/results, split multibyte stdout, stdout/window
  bounds, malformed handles, duplicate windows, cancellation/revoke races, copied/proxied
  executor/process objects, stale generations, and unsupported platforms are covered.
- Scope tradeoff: arbitrary scripts, handles, coordinates, executable paths, arguments,
  custom layouts, and child-selected window matching are intentionally unsupported.

### Final Validation

- Complete plugin-host plus TouchPlugin/PluginModule/rollout suite: **31 files,
  629/629 tests passed**. The focused Window Presets migration suite passed **88/88**;
  plugin-local Node suite passed **4/4** and packages/test passed **3/3**.
- CoreApp Node and Web typechecks passed. Scoped CoreApp/package ESLint passed with
  `--max-warnings 0`.
- `pnpm plugins:validate` passed **22 manifest policies**, **24/24 directory
  classification**, and **20/20 search-provider coverage**.
- Final-source production `build:vite`, source and built-child forbidden-surface scans,
  exact `16/22` plus default-disabled assertions, and `git diff --check` passed. Existing
  Vite chunking and third-party annotation warnings remain non-blocking.
- Real Electron utility-process smoke passed: `PLUGIN_HOST_ISOLATION_SMOKE_OK`. It loads
  the actual Window Presets Prelude in two generations, proves shell deny/grant,
  status/layout/topmost workflows, process/handle/host-generation rotation, stale old-port
  rejection, and awaited cleanup. Enumeration and execution are in-memory fixed fakes;
  no real PowerShell, Win32, window mutation, or OS process/action was run.
- Final strict-review severity is **P0: 0 open, P1: 0 open, P2: 0 open**.
- No commit, push, merge, branch switch, reset, rebase, or history change was performed.

### Remaining Scope

The exact six unmigrated official activations are:

- `touch-browser-data`
- `touch-browser-open`
- `touch-intelligence`
- `touch-translation`
- `touch-window-manager`
- `touch-workspace-scripts`

Production default enablement, heartbeat/restart budget, legacy bridge removal, 22/22
regression, complete final security review, and the complete hard cut remain release
blockers. No other plugin migration, legacy-code deletion, or rollout gate flip was
performed in this batch.

## Independent Migration 16 Strict Check Addendum

This addendum records the final independent review after the Batch I implementation.
It does not enable the production runtime or claim the complete #297 hard cut.

### Findings Closed

- **P1 closed:** `close()` could settle before a process acquired through a synchronously
  re-entrant fixed spawn seam reached its real exit barrier. Window Presets now registers
  an operation before process acquisition, rejects a process acquired after close/revoke,
  and makes close await both owned-process termination and the operation-idle barrier.
- **P2 closed:** output overflow and overlapping explicit teardown could issue two native
  kill requests. The process adapter now shares one kill latch and still waits for the
  real `exit` event before settling.
- **P2 closed:** `PluginModule.onInit()` reset the Snipaste and System Action factories but
  could retain a stale Window Presets factory from an earlier module runtime until new
  initialization completed. It now clears all three activation-local factories before
  constructing manager/runtime services.
- Added executable regressions proving enumerated process names/titles never enter a
  mutation script, cross-plugin authoritative contexts fail before status host work,
  re-entrant close remains pending through true process exit, and overflow/teardown sends
  one kill request.
- Final strict-review severity is **P0: 0 open, P1: 0 open, P2: 0 open**.

### Final Verification

- Complete plugin-host plus TouchPlugin/PluginModule/rollout suite: **31 files,
  633/633 tests passed**. Window Presets capability tests pass **22/22** and child facade
  tests pass **2/2**.
- Official Window Presets Prelude suites pass **4/4** under `node:test` and **3/3** in
  `packages/test`.
- CoreApp Node and Web typechecks passed. Scoped CoreApp host/plugin/smoke ESLint passed
  with `--max-warnings 0`.
- `pnpm plugins:validate` passed **22 manifest policies**, **24/24 directory
  classification**, and **20/20 search-provider coverage**.
- Production `build:vite`, source and built-child forbidden-surface scans, exact
  `16/22` plus default-disabled assertions, workspace `git diff --check`, and real
  Electron smoke passed. Smoke result: `PLUGIN_HOST_ISOLATION_SMOKE_OK`.
- Window enumeration/execution in every test and smoke remained in-memory fixed fakes;
  no PowerShell, Win32 mutation, native window action, or other real OS action ran.
- No commit, push, branch switch, reset, rebase, or history change was performed.

## Batch J Window Manager Token Migration

This section supersedes the migration-16 rollout count for the reviewed Window Manager
worktree. It does not enable the production runtime or claim the #297 hard cut.

### Implemented Contracts

- `touch-window-manager` is the 17th isolated-runtime compatible activation. Its Prelude
  contains no `__test`, `require`, `child_process`, `process`, PowerShell, AppleScript,
  executable, script, argument, environment, raw handle/PID, application path, permission
  SDK, arbitrary app name, or generic system/window-presets surface.
- The purpose-built `system.window-manager` capability accepts exactly `list` and `act`.
  `act` accepts only one of `activate`, `snap-left`, `snap-right`, `topmost-toggle`,
  `close`, `hide`, `quit`, or `launch` plus one opaque owner token. The child facade is
  frozen, null-prototype, manifest-name/declaration gated, and exposes only `list()` and
  `act(action, token)`.
- Main owns bounded Windows PowerShell/Win32 and macOS JXA inventory. Native output is
  exact-validated and projected to bounded display names/titles/state plus random 192-bit
  tokens; HWND, PID, start identity, bundle ID, application path, scripts and native
  failures never cross to the child.
- Tokens bind to one activation, host generation, list epoch, native identity and 10-second
  TTL. Every list retires the prior epoch; every act consumes once. Unknown, foreign,
  expired, replayed, stale-generation and reused-handle/replaced-process tokens fail before
  mutation.
- Act reenumerates and matches the current PID/native ID/start/app identity before running
  one fixed operation. Names and titles never enter mutation scripts. Every list/action
  process is permission/current-authority checked before and after start/exit; cancellation,
  revoke, disable, crash and rotation retire tokens, kill at most once and await the real
  process exit barrier.
- Launch is intentionally limited to a still-running app in the current main-owned
  inventory. Windows rechecks PID/start identity inside the fixed mutation script before
  activating the current main window; macOS rechecks PID/launch time/Bundle ID in fixed
  JXA before activating the exact `NSRunningApplication`. Arbitrary text/path launch and
  the old persisted recent-window list were removed because short-lived activation tokens
  cannot safely survive list epochs or restarts.
- `TouchPlugin` creates and closes the capability per exact Window Manager generation.
  `PluginModule` installs one branded fixed service factory and clears it on init/destroy.
  Rollout is exactly **17 of 22**; `PLUGIN_RUNTIME_DEFAULT_ENABLED` remains false with no
  environment bypass.

### Review Findings

- **P0:** none found.
- **P1 closed:** the first owner-token launch design passed a host-inventory executable path
  to fixed `Start-Process`. A path replacement after identity validation could select a
  different binary. Launch now performs no path execution: it reopens/activates only the
  currently revalidated running process through PID or bundle ID.
- **P1:** none open in activation/host ownership, token epoch/TTL/replay, native identity,
  permission, fixed execution, process barrier, child facade, Prelude, rollout or smoke scope.
- **P2:** none open. Hostile authority fields, malformed/proxied/oversized inventory,
  intrinsic mutation, title interpolation, structural service copies, unsupported actions,
  revoke/cancel races and output overflow are covered.
- Compatibility tradeoff: arbitrary application-name/path launch and persisted recent
  windows are intentionally unsupported. Supporting either would bypass current inventory
  ownership or pretend an expired token remains authoritative.

### Final Validation

- Complete plugin-host plus TouchPlugin/PluginModule/rollout suite: **33 files,
  654/654 tests passed**. Focused Window Manager capability/child/Prelude/lifecycle/rollout
  suite passed **89/89**; plugin-local suites passed **4/4** and **3/3**.
- CoreApp Node and Web typechecks passed. Scoped CoreApp/plugin/package ESLint passed with
  `--max-warnings 0`.
- `pnpm plugins:validate` passed **22 manifest policies**, **24/24 directory
  classification**, and **20/20 search-provider coverage**.
- Final-source `build:vite`, source/built-child forbidden-surface scans, exact `17/22`
  plus default-disabled assertions, syntax checks, and `git diff --check` passed. Existing
  Vite chunking and third-party annotation warnings remain non-blocking.
- Real Electron utility-process smoke passed: `PLUGIN_HOST_ISOLATION_SMOKE_OK`. It loads
  the actual Window Manager Prelude in two generations, proves shell deny/grant, redacted
  list plus snap/launch actions, distinct process/handle/generation rotation, stale old-port
  rejection and awaited cleanup. Inventory and execution are in-memory fixed fakes; no
  PowerShell, AppleScript, Win32, native window mutation, application launch, or other real
  OS action ran.
- Final scoped severity is **P0: 0 open, P1: 0 open, P2: 0 open**. No commit, push,
  merge, branch switch, reset, rebase, or history change was performed.

### Remaining Scope

The exact five unmigrated official activations are:

- `touch-browser-data`
- `touch-browser-open`
- `touch-intelligence`
- `touch-translation`
- `touch-workspace-scripts`

Production default enablement, heartbeat/restart budget, legacy bridge removal, 22/22
regression, complete final security review, and the complete hard cut remain release
blockers. No other plugin migration or rollout gate flip was performed in this batch.

## Independent migration 17 strict-check addendum (2026-07-28)

### Severity report

- **P0:** none found.
- **P1 (fixed):** inventory revalidation and native mutation previously ran in separate
  processes, so PID/HWND/bundle replacement could win after the inventory result but before
  the mutation. Windows action scripts now recheck process start identity and the current
  main-window handle inside the mutation process. macOS inventory now records
  `NSRunningApplication.launchDate`, and every macOS mutation, including launch and quit,
  rechecks PID, launch time, and Bundle ID inside fixed JXA before acting. The former
  `/usr/bin/open -b` and `/bin/kill` mutation paths were removed.
- **P2 (fixed):** exact TTL expiry now rejects at `now >= expiresAt`; regression coverage
  exercises the boundary millisecond. Result array snapshots now reject sparse arrays,
  accessors/proxies, and extra properties without invoking hostile getters.
- **P2 (external gate blocker, not caused by migration 17):** a final concurrent rerun of
  `typecheck:web` failed in the unrelated dirty
  `packages/tuffex/packages/components/src/chat/src/TxChatComposer.vue` because its newly
  added template binding references undeclared `ariaLabel`. That file changed at 19:57:24
  while the final gate was running and was left untouched. The same web typecheck passed
  earlier in this strict-check cycle before that concurrent edit.

### Security decisions and evidence

- Tokens use 192-bit `randomBytes`, an active plus bounded retired no-reuse set, a 10-second
  TTL, per-list epoch replacement, activation-local capability state, and consume-before-act
  single use. Unknown, expired, prior-epoch, cross-plugin, cross-generation, cross-host, and
  replayed tokens are rejected.
- Request validation failures do **not** consume a valid token because no action was
  admitted. Once an action request is valid and admitted, the token is consumed before any
  native revalidation or mutation; unsupported/native-replaced/transient native failures
  therefore cannot replay it. Concurrent list/action admission is serialized so a list
  epoch rotation cannot interleave with action admission.
- Launch accepts only an opaque token for a current main-owned application inventory entry.
  No child-selected title, app name, path, command, script, or executable reaches a native
  action. Windows and macOS scripts are fixed source and receive only validated host-owned
  identity/action arguments.
- Branded service/executor instances, permission and activation checks, bounded output,
  strict descriptor-safe result snapshots, cancellation, revoke/disable barriers, child
  facade containment, and awaited official Prelude operations were reviewed and covered by
  focused regressions. Reentrant close waits for the real exit barrier of a process acquired
  synchronously during spawn.
- No real OS enumeration or mutation ran during this check. Capability tests and Electron
  isolation smoke used fake branded native services/executors only.

### Final verification

- `pnpm -C apps/core-app exec vitest run src/main/modules/plugin/host src/main/modules/plugin/plugin.test.ts src/main/modules/plugin/plugin-module.test.ts src/main/modules/plugin/plugin-runtime-rollout.test.ts`
  -> **33 files, 658/658 tests passed**.
- Focused Window Manager capability plus child facade coverage -> **23/23 passed** within
  the host suite.
- `node --test plugins/touch-window-manager/index.test.cjs` -> **4/4 passed**.
- `pnpm -C packages/test exec vitest run src/plugins/window-manager.test.ts` -> **3/3 passed**.
- `pnpm -C apps/core-app typecheck:node` -> passed.
- Scoped CoreApp/plugin/package ESLint with `--max-warnings 0` -> passed.
- `pnpm plugins:validate` -> **22 manifest policies, 24/24 plugin classifications, and 20/20
  search-provider coverage passed**.
- `pnpm -C apps/core-app build:vite` -> passed with existing non-blocking Vite chunking and
  third-party annotation warnings.
- Built child forbidden-surface scan and official Prelude source scan -> passed.
- `pnpm -C apps/core-app exec electron scripts/plugin-host-isolation-smoke.cjs` ->
  `PLUGIN_HOST_ISOLATION_SMOKE_OK`.
- Rollout assertion -> **17/22**, includes `touch-window-manager`, default remains disabled.
- `git diff --check` -> passed.

## Batch K Workspace Scripts Migration

This section supersedes the migration-17 rollout count for the reviewed Workspace Scripts
worktree. It does not enable the production runtime or claim the #297 hard cut.

### Implemented Contracts

- `touch-workspace-scripts` is the 18th isolated-runtime compatible activation. Its Prelude
  contains no privileged Node import, process global, direct filesystem/path/safe-shell,
  dialog/permission SDK, command parser, persisted workspace path/config, arbitrary
  cwd/command/executable/args/env authority, or production `__test` export.
- The purpose-built `process.workspace-scripts` capability accepts exactly main-owned
  selection, workspace-token listing, and script-token execution. The child facade is
  frozen, null-prototype, exact manifest-name/declaration gated, and exposes only
  `select()`, `list(workspaceToken)`, and `run(scriptToken)`.
- Main owns directory selection and confirmation. It accepts only canonical non-symlink
  roots and regular `package.json` files, retains `dev`/`ino` identities, reads at most
  256 KiB through a no-follow handle, parses at most 128 bounded script names, and keeps
  every absolute path and script body in main.
- Workspace and script DTOs contain only display names and random 192-bit tokens. Workspace
  tokens have a five-minute TTL and 32-use limit; script tokens have a two-minute TTL,
  rotate on list, bind a SHA-256 script digest, consume once, and use a bounded no-reuse
  history. Selection/list epoch rotation retires stale tokens.
- Every call requires current activation/host authority plus `fs.read`; run also requires
  current `system.shell`. Main revalidates root/package identities and the script digest
  before and after confirmation. Denial, drift, replacement, stale authority, permission
  failure, token failure, or process-limit failure performs no spawn.
- Execution is fixed to `pnpm run <host-owned scriptName>`, `shell: false`, ignored stdio,
  canonical cwd, and a bounded environment snapshot. Windows uses the fixed
  `%SystemRoot%\\System32\\cmd.exe /d /s /c pnpm.cmd run <host-owned scriptName>` shape
  because Node 24 cannot directly execute `.cmd` files with `shell: false`; the child
  controls no command-line field.
- Processes are activation-owned and capped at two. Caller cancellation, permission revoke,
  disable, crash, restart, and module destroy retire tokens, request each kill at most once,
  and await the real process `exit` barrier. Enable rollback closes generation-local
  capability state.
- Rollout is exactly **18 of 22**. `PLUGIN_RUNTIME_DEFAULT_ENABLED` remains false with no
  environment bypass; no global/default Workspace Scripts capability was installed.

### Security Review

- **P0:** none found.
- **P1 fixed:** the initial fixed host selected `pnpm.cmd` directly on Windows. Node 24 does
  not reliably execute `.cmd` files with `shell: false`, so real Windows runs could fail
  despite fake-adapter tests. Main now selects a validated fixed System32 `cmd.exe` and a
  fixed `/d /s /c pnpm.cmd run` argument prefix; only the already validated host-owned
  script name is appended. A dedicated Windows invocation regression covers the contract.
- **P1:** none open in activation/host ownership, permission, canonical filesystem identity,
  token epoch/TTL/replay, confirmation, fixed execution, process barriers, facade gating,
  Prelude surface, rollout, or smoke scope.
- **P2:** none open. Hostile authority fields, symlink/replacement/drift, exact TTL expiry,
  replay/no-reuse, confirmation denial, permission deny/revoke, caller cancellation,
  structural host/process copies, spawn acknowledgement, process limits, idempotent kill,
  and true exit barriers have focused regression coverage.
- Trust tradeoff: main does not expose or trust script bodies in the child, but an explicitly
  confirmed `package.json` script is project-owned code and may perform arbitrary actions
  with the application process privileges. Digest revalidation narrows drift before spawn;
  defending against a concurrently malicious local filesystem owner requires an immutable
  workspace snapshot or OS sandbox and is outside this utility-process boundary.

### Final Validation

- Complete plugin-host plus TouchPlugin/PluginModule/rollout suite: **35 files, 681/681
  tests passed**. Focused Workspace Scripts capability/child coverage: **21/21 passed**;
  focused capability/child/lifecycle/rollout rerun: **80/80 passed**.
- Official Workspace Scripts Prelude suites passed **5/5** under `node:test` and **3/3** in
  `packages/test`.
- CoreApp Node and Web typechecks passed. Scoped CoreApp/plugin/package ESLint passed with
  `--max-warnings 0`.
- `pnpm plugins:validate` passed **22 manifest policies**, **24/24 directory
  classification**, and **20/20 search-provider coverage**.
- Production `build:vite`, source and built-child forbidden-surface scans, exact **18/22**
  plus default-disabled assertion, syntax checks, and workspace `git diff --check` passed.
  Existing Vite chunking and third-party annotation warnings remain non-blocking.
- Real Electron utility-process smoke passed: `PLUGIN_HOST_ISOLATION_SMOKE_OK`. It loads the
  actual Workspace Scripts Prelude in two generations and proves read/shell deny/grant,
  fake select/list/run, opaque payloads, process/generation rotation, stale old-port denial,
  and awaited cleanup. Selection, confirmation, and process execution are in-memory fixed
  fakes; no real package script or package manager ran.
- Final scoped severity before the strict addendum was **P0: 0 open, P1: 0 open, P2: 0 open**.
  No commit, push, merge, branch switch, reset, rebase, or history change was performed.

### Strict Migration 18/22 Review Addendum

This addendum supersedes the invocation and validation details above after the final strict
Workspace Scripts audit. The rollout remains exactly **18 of 22** and the production default
remains disabled.

- **P0: 0 open.** Child DTOs remain token-only; activation/host authority, token TTL/epochs,
  single-use and bounded no-reuse behavior, permission checks, main-owned confirmation,
  cancellation, revoke, close and real-exit barriers remain intact.
- **P1 fixed: package-manager search authority.** The previous host invoked `pnpm` through the
  inherited PATH and Windows `cmd.exe` could resolve a workspace-local `pnpm.cmd` before PATH.
  Main now removes relative/empty PATH entries and `PNPM_HOME`/`PATHEXT` overrides, resolves a
  regular executable from the main-owned absolute PATH to a canonical absolute path, and uses
  that absolute path for every invocation. Missing or unsafe resolution fails closed.
- **P1 fixed: Windows command-line semantics.** Windows now uses fixed System32 `cmd.exe` with
  `shell: false`, `windowsVerbatimArguments: true`, and one fixed `/d /s /c` command string of
  the form `""<absolute-pnpm.cmd>" run <validated-host-script-name>"`. Unsafe executable-path
  expansion/metacharacter characters are rejected and the child controls no command-line or
  environment field.
- **P1 fixed: filesystem replacement through spawn.** Async package reads now compare size,
  mtime and ctime and finish with root/package canonical `dev`/`ino` checks. Confirmation-time
  replacement returns a stable blocked result. The branded spawn adapter receives the retained
  workspace identity rather than a bare cwd and rechecks root/package identity synchronously
  immediately before spawn and again after the real spawn acknowledgement; drift kills once,
  awaits the real exit barrier and returns a redacted blocked result.
- **P2: 0 open.** Added regressions cover absolute package-manager discovery, relative PATH and
  environment spoof removal, the exact Windows command string, confirmation-time package
  replacement and workspace replacement inside the fake spawn window. No test or smoke path
  started a real package manager or project script.

Validation after the strict fixes:

- Complete plugin-host plus TouchPlugin/PluginModule/rollout suite: **35 files, 684/684 tests
  passed**. Focused Workspace Scripts capability/child coverage: **24/24 passed**.
- Official Workspace Scripts Prelude: **5/5** `node:test` and **3/3** package tests passed;
  forbidden production surfaces were absent and feature clear/push operations remain awaited.
- CoreApp Node typecheck, scoped package-correct ESLint with `--max-warnings 0`, Prettier,
  `plugins:validate` (22 policies, 24/24 plugins, 20/20 search providers), production
  `build:vite`, syntax checks, source scan, exact 18/22 rollout assertion, Electron fake-only
  smoke (`PLUGIN_HOST_ISOLATION_SMOKE_OK`) and `git diff --check` passed.
- CoreApp Web typecheck is currently blocked by unrelated concurrent TuffEx errors in
  `TxSearchInput.vue`, `sortable-list/index.ts` and `virtual-list/index.ts`. These files are
  outside migration 18 and were not modified as part of this review.

Residual trust is explicit: the main process startup environment and the canonical pnpm
installation it names are host authority, and a user-confirmed package script is project-owned
code that may perform arbitrary actions. The pre/post-spawn identity checks close ordinary
symlink/replacement races, but defending against a same-user adversary that can continuously
replace workspace objects in the final OS scheduling window requires an immutable workspace
snapshot or OS sandbox and remains outside this utility-process migration boundary.

### Remaining Scope

The exact four unmigrated official activations are:

- `touch-browser-data`
- `touch-browser-open`
- `touch-intelligence`
- `touch-translation`

Production default enablement, heartbeat/restart budget, legacy bridge removal, 22/22
regression, complete final security review, and the complete hard cut remain release
blockers. No unrelated plugin migration, TuffEx fix, or rollout gate flip was performed in
this batch.

## Stage 1 Intelligence Invoke Cancellation

- CoreApp now injects cancellation through a private host-only intersection type; the shared
  `IntelligenceInvokeOptions` and child capability DTO remain signal-free. Only normalized
  `text.chat` and `vision.ocr` accept this path.
- Quota, strategy, primary provider, and each fallback use an abort-listener race. Abort
  immediately settles the SDK await as `INTELLIGENCE_OPERATION_CANCELLED`, while attached
  handlers observe and discard late success/failure without cache, audit, fallback, or
  unhandled-rejection effects. This is containment, not physical provider cancellation.
- The final pre-cache/audit abort check is the success commit point. Abort during a committed
  success audit does not rewrite the result. Signal is excluded from cache identity.
- Provider-forged cancellation codes remain ordinary failures. Signal-enabled quota/provider/
  fallback logs and failure audit use stable redacted codes; native messages, causes, paths,
  credentials, and secrets are not persisted.
- Focused SDK/governance/plugin-adapter validation passed **117/117 tests**; the final SDK
  file passed **55/55**, including strict late-settlement and outer-governed cancellation.
  CoreApp Node/Web typechecks, scoped ESLint with zero warnings, and `git diff --check` passed.
- Independent final review returned **INTEGRATE** with **P0: 0, P1: 0, P2: 0** in this Stage 1
  scope. Provider interfaces still do not accept `AbortSignal`, so underlying compute/billing
  may continue after host cancellation and must not be described as physically stopped.

## Release Gate

Do not mark review, commit, publish or close #297 until every real plugin Prelude uses a dedicated utilityProcess, all privileged access is typed and per-call authorized, official plugins pass isolated regression, and real Electron smoke proves crash/hang/resource violations cannot block main or cross activation boundaries.

## Migration 19/22: Browser Open

### Delivered Boundary

- Added fixed `system.browser-open` with exact `list` and `open` DTOs. Main owns trusted browser discovery, native identity, opaque token issuance/rotation, HTTP(S) URL policy, fixed shell-free launchers, permission checks, process ownership, cancellation, revoke, and real exit barriers.
- Added the manifest/name-gated, frozen null-prototype `plugin.browser` child facade exposing only `list()` and `open(url, browserToken?)`. Tokens are activation-, generation-, inventory-epoch-, TTL-, and single-use-bound and are never persisted.
- Rewrote the official `touch-browser-open` Prelude without `require`, `child_process`, `process`, raw `fetch`, Electron, privileged Node imports, privileged targets, or `__test`. URL/search, suggestions, default/specific browser, clipboard, storage, and recent-browser workflows remain; suggestions continue through bounded `http.request`, and recent storage contains display data only before relisting for fresh authority.
- Integrated activation-local construction and teardown into `TouchPlugin` and `PluginModule`, including enable rollback, disable/crash cleanup, host-generation rotation, and module teardown. Rollout is exactly **19/22** and the production isolated-runtime default remains disabled.

### Security Review

- **P0: 0 open.** No child-selected executable, browser path, arguments, command, shell, platform, environment, cwd, or native identity reaches the host. Browser/network/OS work is fake-only in tests and smoke.
- **P1: 0 open.** URL validation rejects non-HTTP(S), credentials, control characters, malformed and oversized input. Specific-browser launch revalidates trusted native `dev`/`ino` identity; permission revoke and activation/generation changes retire authority before new launches.
- **P1 fixed during final review:** concurrent inventory refreshes previously shared the mutable current epoch when issuing tokens, so a late older `list` could issue authority valid in the newer epoch. Each request now captures its own epoch and a late stale response fails closed before token issuance; a regression test covers the interleaving.
- **P1 fixed during resumed final review:** the fixed service previously retained caller-owned `windowsDirectory`/environment state and `startOpen()` could rebuild a launcher from mutated constructor options. Construction now normalizes and snapshots both roots and a bounded environment allowlist, captures `inspect`/`spawn`, uses only frozen fixed options for discovery and launch, and rejects proxy/accessor environment input without evaluating getters. Hostile post-construction mutation and accessor regressions cover the Windows launcher contract.
- **P2: 0 open.** DTO, facade, token, launcher, permission, cancellation, process barrier, Prelude, integration, rollout, manifest, package, and Electron-generation regressions are covered.
- Tradeoff: opening an allowed public HTTP(S) URL delegates content handling to the selected browser and its profile/extensions. Linux currently exposes default-browser opening only; adding a specific-browser inventory needs a separate platform threat review. Process cancellation can terminate the fixed launcher, but cannot guarantee that an already handed-off browser tab closes.

### Validation Evidence

- Complete plugin-host plus `TouchPlugin`/`PluginModule`/rollout suite: **37 files, 713/713 tests passed**. Browser Open capability suite: **25/25 passed**; focused Browser Open plus `PluginModule`: **32/32 passed**.
- Official Browser Open Prelude: **7/7** `node:test`; package Browser Open suite: **4/4**; resolver, production-contract, integrity, require and network suite: **39/39**.
- CoreApp Node and Web typechecks passed. Scoped package-correct ESLint passed with `--max-warnings 0`; syntax checks, forbidden-source scan, and scoped `git diff --check` passed.
- `plugins:validate` passed 22 manifest policies, 24/24 directory classification, and 20/20 search-provider coverage. Production `build:vite` passed; built-child forbidden-surface scan passed and the artifact contains the declaration-gated `system.browser-open` facade.
- Real Electron fake-only smoke passed with `PLUGIN_HOST_ISOLATION_SMOKE_OK`, including two generations, deny/grant, default/specific/search, opaque token rotation, stale-port rejection, and cleanup. It executed no real browser, network, discovery, or OS launcher action.

### Remaining Scope

The exact three unmigrated official activations are:

- `touch-browser-data`
- `touch-intelligence`
- `touch-translation`

Production default enablement, heartbeat/restart budget, legacy bridge removal, 22/22 regression, complete final security review, and the complete hard cut remain release blockers. No unrelated plugin migration, rollout gate flip, legacy removal, commit, branch/history change, or real external action was performed in this batch.

## Migration 20/22: Browser Data

### Delivered Boundary

- Added activation-local `browser-data.scan` with exact source/browser DTOs. The child facade is frozen, null-prototype, declaration/name gated, and exposes only `plugin.browserData.scan(sources, browser?)` for fixed Chromium sources and browser IDs.
- Main owns platform roots: macOS Application Support, Windows `LOCALAPPDATA`, and Linux Electron config data. Canonical profile directories reject symlinks and identity drift; the child cannot provide a path, profile, platform, SQL statement, time window, limit, or temp destination.
- Bookmarks use an `O_NOFOLLOW`, 4 MiB bounded JSON reader. History copies the regular database plus bounded WAL/SHM sidecars into a private main-owned temp directory and executes only the fixed `chromium-history` query through a query-only SQLite worker owner. The live browser database is never opened by the worker.
- The worker protocol's `readOnly` mode rejects execute/transaction operations while keeping ordinary plugin SQLite unchanged. It intentionally opens the owned copy through the supported plain libSQL file URL; unsupported `?mode=ro` URI behavior had caused all reads to fail.
- `fs.read` is required on every scan. `fs.index` is required only after an enabled history source is admitted, so disabling history does not block bookmarks. Permission revoke, activation rotation, caller abort, disable, crash, and module teardown abort work and await temp cleanup.
- The official Prelude contains no `require`, process, filesystem, SQLite, raw fetch, Electron, privileged path/SQL field, or `__test`. It publishes bounded canonical feature items, keeps open/copy optional and permission-gated, and maintains only the requested indexed source on rebuild/clear.
- Rollout is exactly **20 of 22** manifested activations. `PLUGIN_RUNTIME_DEFAULT_ENABLED` remains false with no environment bypass.

### Security Review

- **P0: none found.** No child-selected path, SQL, profile, temp root, browser installation, native identity, or database handle reaches main work.
- **P1 fixed:** copy-acquisition rollback swallowed a failed temp-directory removal and could leave sensitive browser data behind. Cleanup failure now returns `BROWSER_DATA_TEMP_CLEANUP_FAILED` and cannot be silently discarded.
- **P1 fixed:** Windows initially used Electron roaming `appData`; fixed browser roots require main-owned `LOCALAPPDATA` (with a canonical home fallback). Linux uses the main-supplied config root and reports unsupported fixed browsers without fallback.
- **P1 fixed:** the first worker implementation used libSQL `?mode=ro`, which made valid reads unavailable. Read-only authority now comes from the query-only worker protocol plus the owned temporary copy, not an unsupported URI option.
- **P2 fixed:** history permission is checked only after current enabled-source filtering; a disabled history source cannot deny a valid bookmark scan. Single-test quota timing was raised to 15 seconds because its unchanged 700-write/64 MiB proof exceeded Vitest's default five-second wall under full-suite load.
- **P2 fixed:** profile enumeration now stops after 128 entries without materializing the full directory, the fixed History SQL applies host-owned lower/upper visit-time bounds, aggregate truncation reports `partial`, display text normalizes C0/C1 controls, and control-character URLs are dropped before child projection.
- No known P0/P1/P2 remains in the Browser Data DTO, fixed roots, file-copy/query, permission, lifecycle, child facade, Prelude, rollout, or fake-only smoke scope. The independent complete #297 security review remains pending.
- Schema limit: this migration intentionally supports only Chromium Bookmarks JSON roots and the Chromium `urls(url, title, last_visit_time)` History schema for Chrome, Edge, Brave, and Arc. Firefox/Safari, encrypted/vendor-specific variants, renamed columns, and future Chromium schema drift are not interpreted; unavailable or incompatible sources fail closed with stable diagnostics.

### Validation Evidence

- Browser Data capability **11/11**, child facade **2/2**, official Prelude **7/7**, SQLite worker integration **6/6**, and client **6/6** passed.
- The 20/22 tracked plugin-host/TouchPlugin/PluginModule/rollout baseline, explicitly excluding the concurrent unfinished Intelligence Context RED files, passed **43 files, 752/752 tests**. An earlier all-host run passed the same business assertions and exposed only the quota test's former five-second timing budget.
- CoreApp Node typecheck passed. Scoped host/plugin/runtime/smoke ESLint passed with `--max-warnings 0`.
- `pnpm plugins:validate` passed **22 manifest policies**, **24/24 plugin classification**, and **20/20 search-provider coverage**.
- Production `build:vite` passed and emitted the updated `plugin-host.js` and `plugin-sqlite-worker.js`. Existing Vite chunking and third-party annotation warnings remain non-blocking.
- Real Electron utility-process smoke passed: `PLUGIN_HOST_ISOLATION_SMOKE_OK`. It loads the actual Browser Data Prelude, proves bookmark/history scan, open/copy actions, permission revoke cancellation, temp cleanup, two-generation rotation and stale-port denial using only temporary fixtures and a fake fixed query. No real browser profile, network request, browser launch, or OS action ran.
- Code commits: `c3ca65e61 feat(plugin): isolate browser data Prelude [task 297]`, `9da765676 fix(plugin): bound isolated browser data scans [task 297]`, and `80674407b fix(plugin): sanitize isolated browser data results [task 297]`.

### Remaining Scope

The exact two unmigrated official activations are:

- `touch-intelligence`
- `touch-translation`

Production default enablement, heartbeat/restart budget, legacy bridge removal, 22/22 regression, complete independent security review, and the hard cut remain release blockers. The concurrent Intelligence Context Stage 2B RED work was explicitly excluded from this migration commit and validation claim.

## Stage 2B Intelligence Context Invoke Foundation

### Delivered Boundary

- Added fixed `intelligence.context.invoke` under `intelligence.basic`. The capability
  rechecks branded plugin-host authority, the complete current activation and host
  generation, then derives `plugin:<manifest id>` as the Context actor. Child owner,
  session, metadata and options never become identity.
- The host accepts only bounded exact `text.chat` Context DTOs. `continue` requires a
  session id while `new` and `stateless` forbid one; caller, signal, endpoint, credential,
  quota authority, unsafe owner, extra fields, accessors, proxies, classes, sparse arrays
  and cycles fail before Context or provider work.
- `IntelligenceContextExecutionService.invoke()` accepts a private host-only signal and
  observes it before validation, after non-cancellable hygiene awaits, after provider
  settlement and before assistant finalization. The shared secret classifier still owns
  degraded current-input admission, so a database failure cannot route Bearer/JWT input to
  the Provider.
- Host results are exact-projected to answer/provider/model/trace/latency plus bounded
  metadata-only Context ids, counts and source types. Usage, reasoning, checkpoint and
  continuation detail, package items, credentials, native errors and stacks do not cross.
- The child projects an independently declaration-gated, frozen null-prototype
  `intelligence.contextInvoke()` facade. It does not expose context stream, memory
  evaluation, Agent session, raw host capability or generic Intelligence methods unless
  their own capability ids are separately declared.
- `PluginModule` snapshots the production Context host service and installs one immutable
  definition in the global runtime manifest. The isolated runtime default remains off.

### Security Review

- **P0: none found.** Caller and session ownership remain main-derived and ContextHygiene
  actor-bound; child fields cannot select another plugin actor or host generation.
- **P1 fixed:** an abort arriving while `appendAssistantTurn()` was in flight previously
  reported cancellation even when the host persistence had succeeded. Finalization now
  remains cancellable before admission, but a successfully completed assistant append is a
  commit point and is not rewritten inside the Context service. The outer capability
  registry still discards any late response for a revoked or closed activation.
- **P1: none open in the scoped invoke foundation.** Cancellation is containment: provider
  compute/billing and a hygiene write already admitted before an abort may physically
  finish. Boundary checks prevent later provider/finalization work; this is not described
  as physical cancellation.
- **P2: none open in the scoped DTO, projection, dependency snapshot or child facade
  boundary.** Stream/resource semantics and official Prelude behavior are not part of this
  foundation claim.
- The project `trellis-check` runner could not start because the configured OpenRouter
  provider was unavailable, and the fallback reviewer returned no output. Therefore this
  section records direct review and executable gates only; it is not an independent final
  #297 security review.

### Validation Evidence

- Focused Context execution/host service/capability/child/PluginModule suite passed **5
  files, 49/49 tests**.
- Complete plugin-host plus TouchPlugin/PluginModule/rollout suite passed **43 files,
  761/761 tests**.
- CoreApp Node typecheck and scoped Context/host/plugin ESLint passed with
  `--max-warnings 0`; workspace `git diff --check` passed.
- Production `build:vite` passed and emitted the updated declaration-gated child artifact.
  Existing Vite chunking and third-party annotation warnings remain non-blocking.
- Real Electron utility-process regression remained green with
  `PLUGIN_HOST_ISOLATION_SMOKE_OK`. This smoke validates the shared child artifact and
  existing two-generation isolation paths; it does not claim a real Context provider or
  official `touch-intelligence` flow.

### Remaining Scope

- This batch does not migrate `touch-intelligence`, add `intelligence.context.stream`,
  expose memory/Agent/session control planes, change the 20/22 rollout inventory, or enable
  the production isolated runtime.
- `touch-intelligence` and `touch-translation`, real controlled Context Electron coverage,
  production default enablement, heartbeat/restart budget, legacy bridge removal, 22/22
  regression and the independent final security review remain release blockers.

## Independent Check: Migration 20/22 Browser Data

This section completes the strict independent review of the Browser Data migration and
supersedes the earlier note that this migration's independent review was pending. It does
not review or expand the concurrently committed Intelligence Context scope.

### Findings And Direct Fixes

- **P0: none found.** The child still cannot select a path, SQL statement, profile, platform,
  time window, result limit, temp destination, database handle, or native browser identity.
- **P1 fixed: History copy-set consistency.** The previous implementation validated each
  DB/WAL/SHM file independently but did not prove that the complete set remained unchanged
  across acquisition. Main now snapshots set membership plus
  `dev`/`ino`/`size`/`mtimeNs`/`ctimeNs`, copies every member through a canonical
  `O_NOFOLLOW` handle, and repeats the complete snapshot before query. Any new, removed,
  replaced, resized, or modified member rejects and removes the copy before SQLite runs.
- **P1 fixed: temporary-root symlink containment.** The previous implementation called
  `realpath()` and accepted a pre-positioned symlink as the temp owner root. It now requires
  the configured root and the generated child directory to remain canonical non-symlink
  directories before any browser bytes are copied.
- **P2 evidence gaps closed.** Focused regressions now prove `fs.read` denial and host
  generation mismatch perform no query; schema/native errors and temp paths are redacted;
  a WAL appearing during DB copy fails closed with cleanup; and the real built query-only
  worker rejects execute, transaction, multiple statements, PRAGMA, and ATTACH.
- **P0/P1/P2 open in the reviewed Browser Data scope: none.** Rollout remains exactly
  **20 of 22**, and `PLUGIN_RUNTIME_DEFAULT_ENABLED` remains `false` with no environment
  override.

### Independent Validation Evidence

- Browser Data capability **14/14**, child facade **2/2**, and official Prelude **7/7**
  passed. The Prelude source/built-host scan found no privileged child surface and confirmed
  the built `browser-data.scan` projection.
- Built SQLite worker integration plus client suite passed **12/12**, including the complete
  query-only rejection matrix and ordinary writable-owner/quota regressions.
- Current-HEAD plugin-host plus `TouchPlugin`/`PluginModule`/rollout baseline passed **43
  files, 764/764 tests**, including the final schema-redaction regression.
- CoreApp Node and Web typechecks, scoped ESLint with `--max-warnings 0`,
  `git diff --check`, and `pnpm plugins:validate` passed. Plugin validation remained **22
  manifest policies**, **24/24 plugins**, and **20/20 push-provider coverage**.
- Production `build:vite` passed and emitted `plugin-host.js` plus
  `plugin-sqlite-worker.js`; existing Vite chunking/third-party warnings remain
  non-blocking.
- Real Electron utility-process smoke passed with `PLUGIN_HOST_ISOLATION_SMOKE_OK`, using
  only generated temporary Bookmarks/History/WAL/SHM fixtures and a fake fixed query. No
  real browser profile, network request, browser launch, or OS action was used.

### Residual Risk

- The host cannot take Chromium's live SQLite lock. Set-level fingerprint revalidation plus
  SQLite WAL validation fails closed for observed drift, but real browsers may still update
  files aggressively enough to produce transient `BROWSER_DATA_QUERY_FAILED`; retry policy
  remains intentionally out of this migration.
- Only the current Chromium Bookmarks roots and `urls(url, title, last_visit_time)` History
  schema are supported. Vendor/platform schema drift fails closed and is covered for
  redaction, not for forward compatibility.
- The fake-only Electron smoke does not prove real Windows/Linux browser installations,
  filesystem timestamp behavior, or every vendor profile layout. Production isolated-runtime
  enablement, the two remaining official Prelude migrations, legacy removal, and the complete
  22/22 hard cut remain outside this review.

## Migration 21/22: Touch Intelligence Prelude

This section records the completed `touch-intelligence` isolated Prelude migration. It
builds on the Stage 2B Context invoke foundation and does not modify the concurrently
reviewed Browser Data contract above.

### Implementation And Review

- `intelligence.context.invoke` moved out of the global capability manifest and is now
  activation-local to the exact `touch-intelligence` identity together with the new
  `intelligence.stream` capability. `plugin-module` installs one frozen factory and clears
  it during teardown; `TouchPlugin` injects both definitions only into that activation.
- The stream capability snapshots its Context execution dependency, derives the plugin
  actor in main, validates exact requests/events, uses a retained resource callback, and
  owns iterator cancellation/disposal. The child exposes only a declaration-gated frozen
  `intelligence.contextStream()` controller and redacts host/iterator failures.
- The official Prelude no longer uses top-level `require`, `process`, raw `fetch`, Node or
  Electron imports, `touchChannel`, runtime permission requests, or test-only exports. It
  uses projected crypto, feature, storage, clipboard and Intelligence globals only.
- **P1 fixed:** the Prelude's top-level `crypto` lexical binding collided with the child
  bootstrap binding and prevented real child evaluation. The projected global is now
  locally aliased as `hostCrypto`.
- **P1 fixed:** feature and action entrypoints detached `dispatchPrompt()` with `void`, so
  request-scoped lifecycle authority ended before later Context/model/widget operations.
  Both entrypoints now await the complete dispatch.
- **P2 fixed:** pending/error widget DTOs emitted optional `latency`/`draftId` properties as
  `undefined`, which the business capability correctly rejects. Optional values are now
  normalized and omitted; the Electron smoke requires all three accepted writes in each
  generation: pending, streamed pending, and ready.
- **P2 fixture correction:** source manifest platform booleans/`win32` are projected to the
  host runtime feature shape in the fake-only smoke. Stream terminal latency is emitted as
  protocol-valid `metadata.latency`.
- Direct final review found no open P0/P1/P2 identity, permission, lifecycle, callback,
  resource, DTO, fallback, or privileged-surface finding in migration 21. An independent
  channel reviewer could not be started because the current environment does not provide
  the `trellis` CLI; this is not claimed as the complete independent #297 security review.

### Validation Evidence

- Focused CoreApp migration tests passed **4 files, 60/60 tests**; plugin-local Intelligence
  tests passed **66/66**. The complete plugin-host, TouchPlugin, PluginModule, rollout and
  Context execution suite passed **48 files, 818/818 tests**.
- The real Electron utility-process smoke passed with `PLUGIN_HOST_ISOLATION_SMOKE_OK` for
  two distinct activation generations and fake Context/provider streams. It performed no
  real provider, browser, network, native-process, or OS action.
- CoreApp Node and Web typechecks passed. Scoped CoreApp, package-test and Prelude ESLint
  passed with `--max-warnings 0`; syntax checks and `git diff --check` passed.
- Plugin validation passed **22 manifest policies**, **24/24 plugins**, and **20/20** push
  search-provider coverage. Official runtime sync, after-pack and seed tests passed **23/23**.
- The canonical plugin build and CoreApp bundled seed have identical SHA-256 hashes. Source
  and bundled Prelude scans found no forbidden require/process/raw-fetch/privileged-import,
  legacy bridge, permission-request, or test-export surface.
- Production `build:vite` passed. Existing Vite chunking, browser-externalization and
  third-party annotation warnings remain non-blocking and unrelated to this migration.

### Remaining Scope

The tracked isolated rollout is now **21/22**. `touch-translation` remains intentionally
unmigrated. Production default enablement, heartbeat/restart budget, legacy bridge removal,
complete 22/22 regression, the independent final #297 security review, commit/push and
issue closure remain outside this migration. GitHub issue #476 and its indexing defect were
not touched.

## Independent Check Addendum: Migration 21/22

This addendum supersedes the earlier direct-review claim for the current uncommitted
`touch-intelligence` slice. The review covered the custom widget facade/capability, Context
invoke and stream authority, commit/cancellation/resource semantics, activation-local
wiring, official Prelude/manifest/rollout/package behavior, and real Electron smoke.

### Findings And Direct Fixes

- **P0: none found.** Actor/caller, activation identity, host generation, permissions,
  provider authority, renderer identity, callbacks, and resources remain main-derived and
  exact-activation-bound.
- **P1 fixed: committed invoke teardown could wait forever.** `commit()` cleared the only
  timeout and made every later abort a no-op, so a stuck assistant-turn append could block
  dispatch, registry close, and plugin disable indefinitely. The absolute timeout now remains
  active; caller abort still preserves committed success, timeout contains finalization and
  may return only the frozen degraded snapshot, while revoke/close discard late responses.
  Ignored abort reaches the existing grace barrier, releases the call, and fails closed.
- **P1 fixed: stream finalization was not containment-cancellable.** An `end` event awaited
  assistant-turn persistence outside the signal race, allowing cancel/revoke/disable to hang
  behind a stuck append. Stream finalization now races the host signal while attached handlers
  contain late settlement; invoke finalization without a signal still preserves the real
  post-commit append barrier.
- **P2 fixed: unterminated provider completion.** Provider iterator completion without an
  `end` event previously left the Prelude promise and retained callback/resource waiting.
  The pump now emits stable `INTELLIGENCE_STREAM_FAILED`, allowing the child to run its same
  idempotent disposer.
- **P2 fixed: widget host authority was too broad.** Widget navigation accepted any internal
  slash path and renderer validation accepted alias chains. Main now admits only the two exact
  `touch-intelligence` action-id/path pairs and requires the selected renderer feature to
  directly own a widget path.
- **Open P0/P1/P2 in the reviewed Migration 21 scope: none.** The rollout remains exactly
  **21/22** and production isolated-runtime default enablement remains unchanged.

### Independent Validation Evidence

- Focused CoreApp review matrix passed **14 files, 291/291 tests**, including registry,
  invoke/stream, widget, actual official Prelude, runtime host, `TouchPlugin`, `PluginModule`,
  and rollout coverage. The package Intelligence suite passed **66/66**.
- CoreApp Node typecheck and scoped CoreApp/package ESLint passed with zero warnings.
  `git diff --check` and focused Prettier verification passed.
- `pnpm plugins:validate` passed **22 manifest policies**, **24/24 plugins**, and **20/20**
  push search-provider coverage. The source Prelude forbidden-surface scan found no
  `require`, `child_process`, `process`, Electron, raw fetch, or `__test` surface.
- Production `build:vite` passed and emitted the updated `plugin-host.js`. Existing Vite
  chunking, browser-externalization, eval, and third-party annotation warnings remain
  non-blocking and unrelated to this review.
- Real Electron utility-process smoke passed with `PLUGIN_HOST_ISOLATION_SMOKE_OK`. It used
  fake Context/provider work across two activation generations and performed no real provider,
  browser, network, native-process, or OS action.
- No Browser Data, TuffEx, Nexus, search, release, or user-authored `tuffex.md` change was
  made by this addendum. No commit, push, branch switch, reset, rebase, or history operation
  was performed.

## Ephemeral One-Shot Context Correction Addendum

This addendum supersedes every earlier Migration 21 statement that described
`intelligence.context.invoke` as a persistent ContextHygiene operation. The official plugin's
owner-bound `intelligence.stream` path remains the persistent session/resource path; the
non-streaming fallback is deliberately ephemeral.

### Corrected Boundary

- `intelligence.context.invoke` remains activation-local to exact `touch-intelligence`, but
  main always injects the CoreApp-private `persistence: 'ephemeral'` policy. The child cannot
  request another mode.
- The one-shot path supports `new` and `stateless` only. `continue` is denied locally and in
  main before provider work.
- It uses bounded system messages plus current input, checks input/system/template/variables
  with the shared secret policy, and performs no `prepareTurn`, memory revalidation,
  assistant append, session, checkpoint, ContextPackage or package-log write.
- Its result contains no session/turn/package/checkpoint/continuation identity and requires
  exactly one `current_input` source plus
  `isolated_context_persistence_unavailable`. The host and child validate this independently.
- The attempted capability-specific committed-success mode was removed. Canonical
  cancel/timeout/revoke/close behavior is unchanged, matching the child lifecycle's local
  cancellation contract.
- This is a foundation/fallback limitation, not evidence of persistent one-shot Context or
  exactly-once database finalization. Full persistent Context remains on the owner-bound
  stream/resource path.

### Corrected Verification

- One-shot Context/host/capability/child tests passed **56/56**, including zero persistence,
  continue denial, caller cancellation, secret-bearing system/template denial, persistent-id
  denial and fixed result projection.
- The broader focused SDK/context/registry/plugin set passed before final documentation
  synchronization; CoreApp Node typecheck and scoped ESLint passed with zero warnings.
- Final-source production `build:vite` passed. Real Electron smoke passed with
  `PLUGIN_HOST_ISOLATION_SMOKE_OK`: the first actual `touch-intelligence` generation omitted
  stream to force the one-shot fallback, while the second generation exercised owner-bound
  stream. Both used controlled fake provider work and no real external action.
- The rollout remains **21/22** because the official Prelude's full persistent behavior is
  supplied by the separately reviewed owner-bound stream capability; this one-shot fallback
  alone must not be used to justify compatibility or production default enablement.

## Migration 22/22: Touch Translation Prelude

This section records the final official Prelude compatibility migration. It completes the
tracked manifest inventory at exactly **22/22** without enabling production runtime
installation, removing the legacy bridge, or claiming the #297 production hard cut.

### Delivered Boundary

- `intelligence.invoke` is absent from the global runtime manifest. `TouchPlugin` injects one
  activation-bound definition only into exact `touch-translation`, limited to
  `text.translate`, `vision.ocr`, and public `text.translate` provider/model enumeration.
- The child projects only a frozen null-prototype `plugin.translation` facade with
  `translate`, `ocr`, and `listProviders`. Generic `intelligence`, `plugin.intelligence`, raw
  capabilities, provider credentials, endpoints, account tokens, and network access remain
  absent from the Translation Prelude.
- Exact bounded DTOs recheck main-issued activation authority and host generation, derive the
  caller in main, honor cancellation/revoke containment, and return only redacted public
  provider/model/result fields.
- The official Prelude contains no direct require, Node crypto, Electron, process, raw fetch,
  legacy channel, runtime permission request, provider secret, window/DivisionBox helper, or
  production test export. It awaits text, multi-provider, OCR-to-text, item, and clipboard
  work; `onDestroy` invalidates all local requests.
- Screenshot translation intentionally publishes bounded OCR plus translated text. The legacy
  translated-image DivisionBox renderer was removed because it would require broader window
  and custom-widget authority.
- The canonical manifest build entry is `index.js`. `clipboard.read` and `window.create` were
  removed; `network.internet` remains declared only because the existing renderer settings
  Surface still requires it. The isolated Prelude receives no network facade.
- `PLUGIN_RUNTIME_COMPATIBLE_OFFICIAL_PRELUDES` now covers all 22 manifested activations while
  `PLUGIN_RUNTIME_DEFAULT_ENABLED` and `shouldInstallPluginRuntimeServiceByDefault()` remain
  false. The legacy bridge and main-VM path were not removed or modified by this migration.

### Findings And Fixes

- **P0: none found.** Child-selected credentials, endpoints, caller identity, host generation,
  provider authority, raw network, window authority, and native image output do not cross the
  boundary.
- **P1 fixed: real result items violated the exact business DTO.** The Prelude placed its
  internal request id in public item metadata, so the real host rejected every translated
  result even though unit fakes accepted it. Public metadata now contains only admitted keys;
  the request id remains in the bounded action payload.
- **P1 fixed: action ids collided across activation generations.** Each child restarted its
  local counters at one, allowing a previous generation's copy item to match a new generation.
  Request ids now include the frozen main-issued activation generation, and both VM and real
  Electron coverage require the second activation to reject the first activation's item.
- **P2 fixed: stale Integration fixtures hid the current contract.** The actual Intelligence
  Prelude fixture now returns capability-aware provider-list results and the current ephemeral
  Context summary. The Translation package's old Node `Module._compile`/`__test` helper test
  was replaced with an isolation regression proving screenshots use typed OCR and no runtime
  image helper/test surface.
- No known P0/P1/P2 remains in the Translation capability, child facade, Prelude, manifest,
  rollout, projection, or fake-only Electron scope. The complete independent #297 security
  review remains a release blocker outside this migration.

### Final Validation Evidence

- Complete CoreApp plugin directory: **83 files, 1066/1066 tests passed**. Focused modified
  AI/Context/SDK/provider matrix: **4 files, 92/92 passed**. Translation host/facade/capability
  focused replay: **3 files, 36/36 passed**.
- Translation package tests passed **19/19**; isolated Prelude package tests passed **6/6**.
  Package typecheck, explicit non-ignored Prelude lint, package lint, and canonical builder
  passed.
- CoreApp Node and Web typechecks passed. Scoped CoreApp/package/Prelude ESLint passed with
  zero warnings. Production `build:vite` and `git diff --check` passed.
- Release sync/after-pack/seed/loader tests passed **46/46**. `plugins:validate` passed **22
  manifest policies**, **24/24 directory classifications**, and **20/20** push-provider
  coverage.
- Two-run local source audit passed every test/typecheck/lint/build gate, both security scans,
  both bundled-projection comparisons, and normalized inventory reproducibility with SHA-256
  `030deb2327e2ce8bfe50a10ab0ba29cdb17a60709741e0aa518fa9c67ec6845a`.
- Canonical build and bundled seed `index.js` share SHA-256
  `e52eb6ac108569a83418f1971437fba0dde2f7e15a954059b5c71d297fc7b06e`.
  Source/build/seed forbidden-surface scans and the built child privileged-import scan passed.
- Final rebuilt-artifact Electron smoke passed with `PLUGIN_HOST_ISOLATION_SMOKE_OK`. It used
  fake-only providers and temporary fixtures for text, multi-source, screenshot OCR, copy,
  two-generation rotation, stale action rejection, cancellation/resource regressions, and
  cross-process isolation. It performed no real provider, network, browser, native process,
  or OS action.

### Non-Scoped Baseline Results

- The whole CoreApp AI directory was also run: **39/46 files and 384/403 tests passed**. The
  seven unchanged failing files use incomplete full mocks of
  `@talex-touch/utils/transport/events/types` or still expect unnormalized host-only error
  text. Translation-related AI tests are green; those unrelated test debts were not modified.
- The whole legacy `packages/test/src/plugins` directory was also run: Translation **6/6** and
  Intelligence **66/66** passed, while seven old suites still require removed production
  `__test`, child permission-request behavior, or stale manifest inventories from earlier
  migrations. Reintroducing those surfaces would violate the isolation contract, so they were
  left unchanged and are not counted as Translation gates.
- No commit, push, merge, branch switch, reset, rebase, provider request, real browser action,
  or history operation was performed.
