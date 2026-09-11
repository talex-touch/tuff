# Repair CoreBox search startup and main-thread latency

## Goal

修复搜索启动前 MessagePort 等待，隔离本地同步索引读取，保持排序、取消和数据库单写者边界；在隔离实例中验证首批结果与事件循环响应。

## Requirements

- Interactive searches must begin without waiting for an optional MessagePort confirmation. Long-lived subscriptions retain their existing transport policy.
- Run FTS, exact/prefix/ngram/subsequence keyword lookup, index counts and visibility reads off the Electron main thread while preserving existing SQL semantics and result shapes.
- Keep the worker-owned search database as the sole write home; the new reader cannot mutate it or recreate a missing database.
- Propagate query cancellation to queued reads; do not publish stale results or leave pending reads on shutdown/failure.
- Preserve current provider selection, ranking, candidate limits and search debounce. Do not change clipboard/Sentry behavior without causal evidence.

## Acceptance Criteria

- [x] A search session delivers its first snapshot even if MessagePort confirmation never arrives; existing stream ownership/cancel and long-lived Port behavior remain valid.
- [x] Real SQLite executor parity covers international text and wildcard escaping; the actual worker returns the existing 150-row file FTS query and the same heavy-query numeric result as direct execution.
- [x] A deliberately expensive read does not block the main JavaScript event loop.
- [x] Cancelled queued work is removed; active cancellation rejects promptly without exposing stale rows; shutdown/failure settles all requests.
- [x] Reader writes and missing database creation are rejected; the same database path and commit visibility barrier are retained.
- [x] Isolated CoreBox runtime searches return visible results; scoped checks pass. Runtime control only targeted owned acceptance processes and the original index was accessed through read-only snapshot connections.
- [x] Follow-up: a ready search list replaces the recommendation grid in the same Vue update, even when animation frames and transition-end callbacks are delayed.
- [x] Follow-up: result entrance/stagger motion never makes ready rows transparent; rapid query replacement, low-power and reduced-motion modes retain immediately visible current results.
- [x] Follow-up: verify list pixels and the current footer agree in an isolated visible CoreBox, not merely item text in the DOM.

## Evidence and Scope

- Incident: app FTS 28ms / 17 rows, file FTS 248ms / 150 rows, concurrent 287ms event-loop lag and an uncorrelated Port confirmation timeout.
- Current local driver performs synchronous native SQL despite its Promise API. Disposable snapshot measurements for `e` showed about 5ms file FTS and 12ms combined lookups; this is not a reconstruction of the historical blocker.
- Before this repair, search streams awaited a fresh Port confirmation before sending stream:start (default 3s timeout); result-item opener requests and historical Sentry timings were not search prerequisites.
- User explicitly requested the optimization and repair after reviewing the analysis. No release, push, live-profile restart, index rebuild or unrelated cleanup is included.

## Verification evidence

- CoreApp: 16 focused files / 203 tests passed. Utils: 2 files / 14 transport tests passed. Main-process TypeScript and scoped ESLint passed.
- Built main/preload/renderer with electron-vite into a canonical isolated temporary output. The initial lexical `/var` output exposed a probe-only migration-locator path alias failure; canonical `/private/var` rebuild started successfully without production-code changes.
- Real isolated CoreBox showed 17 application FTS matches for `e`. Foreground-focus-emulated native input events produced the expected Safari/Terminal/Calculator/TextEdit DOM result in 174.4/172.2/169.2/169.5ms (including the unchanged 80ms debounce). Screenshot confirmed result rendering; these are DOM timings, not physical-keyboard or historical before/after timings.
- Actual project libSQL versus production read-worker client, same disposable snapshot and recursive SQL: direct 153.2ms with 0 heartbeat ticks during execution and 153.4ms maximum 10ms heartbeat interval; worker 138.5ms with 12 ticks and 13.8ms maximum interval. Both returned 1125000750000.
- Code remains local and uncommitted; no push, release or installed-app replacement. Task archival/commit is intentionally not performed against the shared dirty worktree.

## Visible-result follow-up

- User supplied a `wx` screenshot with 微信 already shown in completion/footer while the entire result region was blank. Treat this as a rendering defect independent from provider timing.
- The pre-fix CoreBox used `<Transition mode="out-in">` around grid/list branches and opacity-zero entrance keyframes. Footer was outside that transition, so it could show the new selection while list mounting/visibility waited on frame/end callbacks.
- Preserve existing settings and layout semantics; fix this in CoreBox result presentation, not by adding artificial result delays, changing ranking or disabling background throttling globally.

### Follow-up verification

- Original-source injection (without reverting the shared worktree): all three animation-enabled stalled-frame scenarios failed with an empty current-result list; the existing low-power case passed. Repaired source: 5 files / 38 tests passed, including all four result-switch cases.
- Full isolated electron-vite build and scoped CoreBox/test ESLint passed. The full renderer typecheck remains blocked by the unrelated `SettingAssistant.globe-key.test.ts:71` voiceInput fixture missing language/polish fields; no type error was reported in this change's files.
- Isolated native CoreBox with resultTransition/listItemStagger enabled, real canonical native focus, held requestAnimationFrame callbacks and CSS result animations paused at time 0: wx→Safari→Terminal→wx returned opaque, visible result/ancestor chains in 174/170/174/170ms from generated input events. Screenshot showed WeChat and Wechat Devtools rows plus the matching WeChat footer while `result-layout-in` was paused at 0.
- With an attached CDP session holding `prefers-reduced-motion: reduce`, Terminal remained opaque and both row/list computed animationName were `none`.
- Runtime data and Chromium appData were both isolated; the probe launcher set appData inside its owned temporary root before importing CoreApp to contain the dev polyfills userData rewrite. Probe-only clipboard auto-fill was disabled; the system clipboard and user's running instance were not altered.
