# Indexing Runtime V1 Plan

> 更新时间：2026-05-30
> 状态：架构基线 / Phase 1 skeleton 已开始
> 范围：CoreBox App/File/Everything/Browser Data/Quicklinks 等本地搜索源的 indexing、watch、reconcile、diagnostics 统一抽象。
> 非目标：一次性重写 SearchEngineCore、绕过平台权限读取敏感 App 数据、把业务明文 dump 成 JSON 同步。

## 1. 背景判断

当前问题不是单个平台漏扫几个路径，而是 App、File、Everything、Browser Data 各自维护扫描、监听、补漏与诊断逻辑：

- `SearchEngineCore` 负责 provider 聚合、分层返回、排序与 trace。
- `FileSystemWatcherModule` 只把 chokidar 事件转成 `touchEventBus` 的文件事件。
- `AppProvider` 自己维护 startup backfill、full sync、pending deletion、macOS `mdls` 更新与 app diagnostics。
- `FileProvider` 自己维护 watch paths、scan worker、index worker、incremental queue、reconciliation、`scan_progress` 与 FTS integrity reset。
- `EverythingProvider` 是 Windows fast external provider，借 FileProvider watch roots 做 path filtering，但不参与统一 index lifecycle。
- `touch-browser-data` 目前即时读取 Chromium `Bookmarks` JSON，不进入统一持久索引，也没有统一 watch/reconcile/clear/rebuild 语义。

这会导致新增 Obsidian、VSCode、系统设置、Quicklinks、Browser History 时继续复制机制，且用户无法稳定判断某个 source 是无结果、未授权、降级还是仍在 warming。

## 2. North Star

建立 `Indexing Runtime V1`：把“数据源生命周期”从“搜索 Provider”中拆出来，统一 `discover / scan / watch / reconcile / search / open / diagnose / clear` 合同。

目标：

1. SearchEngineCore 不重写，只通过 adapter 消费 indexed sources。
2. App/File 先迁移 diagnostics 与 lifecycle，再逐步迁移扫描与补漏。
3. Browser Data/Quicklinks 以后按 source 接入，不再在插件内散落即时全量扫描。
4. 所有 source 都能回答：是否启用、权限状态、最后索引时间、item 数、watch 状态、reconcile 状态、最近错误。
5. SQLite 作为本地 SoT；JSON 只保存轻量配置，禁止完整业务明文 dump。

## 3. 分层架构

```text
SearchEngineCore
  SearchProvider adapters
    IndexedSearchProviderAdapter
      IndexingRuntime
        SourceRegistry
        ScanScheduler
        WatchEventRouter
        ReconcileScheduler
          ReconcileEngine
        IndexStoreAdapter
        IndexingRootPolicy
        SourceDiagnosticsService
```

### 关键边界

- **SearchProvider**：负责 CoreBox 搜索协议、分层优先级、结果映射与执行入口。
- **IndexedSource**：负责单个本地数据源的扫描、监听、补漏、健康与打开动作。
- **IndexingRuntime**：负责任务调度、事件去抖、backpressure、reconcile 与统一诊断。
- **SearchIndexService**：继续作为倒排/FTS 加速层；通过 `SearchIndexStoreAdapter` 承接 source scan/watch delta 的最小写入边界，但不承接 source lifecycle。

## 4. Shared SDK 类型出口

`@talex-touch/utils/search` 已新增 `indexing-source` 类型出口，用于沉淀 runtime 合同：

- `IndexedSourceDescriptor`
- `IndexedSourceHealth`
- `IndexedSourceRoot`
- `IndexedSourceEvidence`
- `IndexedSourceRecord`
- `IndexedSource`
- `IndexedSourceScanRequest`
- `IndexedSourceScanReason`
- `IndexedSourceScanReasons`
- `IndexedSourceWatchEvent`
- `IndexedSourceReconcileRequest`
- `IndexedSourceReconcileResult`
- `IndexedSourceReconcileReason`
- `IndexedSourceReconcileReasons`
- `IndexedSourceResetReason`
- `IndexedSourceResetReasons`
- `IndexedSourceAdmission`
- `getIndexedSourceAdmissionIssues()`
- `isIndexedSourceAdmissionReady()`
- `resolveIndexedSourceTaskEligibility()`

首版只提供类型与纯校验函数，不改变现有运行行为。后续 CoreApp runtime 与官方插件 SDK 都应复用这些类型，避免各 source 自定义状态字段。

`IndexedSourceAdmission` 用于固定新增 source 的准入口径：

- `owner`: `core` / `official-plugin` / `third-party-plugin`
- `permissionScopes`: `none` / `file-system` / `browser-data` / `system-index` / `external-tool` / `network` / `account`
- `defaultState`: `enabled` / `disabled` / `ask`
- `requiresUserConsent`
- `clearable` / `rebuildable`

准入校验会覆盖高隐私 source 不得静默默认启用、Browser Data 必须标记 high privacy 与 browser-data scope、external-fast source 必须声明 external-tool 且不能由 third-party plugin 直接提供、sqlite-index source 必须 clearable、watch source 必须支持 reconcile。`resolveIndexedSourceTaskEligibility()` 进一步把 admission、capability、health 与 permissionState 组合成统一 scan/watch/reconcile 调度资格判断，返回 `{ eligible, reason }`，供 CoreApp runtime 与后续官方插件 source 复用。App/File/Everything core descriptors 已补 admission metadata，作为 Browser Data / Quicklinks / Obsidian / VSCode source 后续接入模板。

`IndexedSourceReconcileReasons` 用于统一补漏触发原因码，当前覆盖 scheduled、manual-repair、watch-gap、watch-recovery、file-watch-root-recovered、health-repair、schema-migration、external-refresh 与 reconcile-not-supported；`IndexedSourceReconcileRequest.reason` 优先使用这些 SDK 标准值，同时仍允许 source-specific 字符串作为迁移期细粒度诊断。

`IndexedSourceScanReasons` 用于统一扫描触发原因码，当前覆盖 startup、manual-rebuild、scheduled、watch-recovery、schema-migration 与 health-repair；`IndexedSourceScanRequest.reason` 优先使用这些 SDK 标准值，避免 App/File/Everything/Browser Data source 在 runtime 迁移期间继续散落硬编码 reason。

`IndexedSourceResetReasons` 用于统一运行时 reset 原因码，当前覆盖 manual-rebuild、schema-migration、integrity-repair、health-repair 与 user-clear；`IndexedSourceResetRequest.reason` 优先使用这些 SDK 标准值，让 runtime `lastReset` diagnostics 与 FileProvider reset helper 共享同一组稳定原因。

## 4.1 CoreApp runtime skeleton

CoreApp 已新增最小 `IndexingRuntime` 骨架：

- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-runtime.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-runtime.test.ts`

当前能力：

- register/unregister/list indexed sources。
- 聚合 `IndexedSourceHealth` 与 roots 为统一 diagnostics。
- 聚合 source evidence，用于解释平台子来源、root 数、itemCount 与失败原因。
- 将 source health 读取失败转换为 source-level `error`，避免整条 diagnostics 链路失败。
- 按 `sourceId` 或 source roots 路由 watch event。
- Runtime task model 已拆出 `SourceDiagnosticsService`、`WatchEventRouter`、`ScanScheduler`、`ReconcileScheduler`、`ReconcileEngine`、`IndexStoreAdapter` 与 `IndexingRootPolicy`，`IndexingRuntime` 只保留 registry 与编排入口。
- `ScanScheduler` 支持 source-level scan task 与 batch 写入 store adapter，并已新增 batch scan result 统计与 failure isolation，避免单个 source scan 失败拖垮整批扫描；`ReconcileScheduler` 已作为 `IndexingRuntime` 与 `ReconcileEngine` 之间的最小任务入口，负责 same-source running guard、job id、queuedAt、reason/rootCount 记录，为后续 durable job history / retry / debounce 做边界；`ReconcileEngine` 支持 source-level reconcile 入口与 unsupported 结果，并已新增 batch reconcile result 统计与 failure isolation；`WatchEventRouter` 将 watch delta 写入 store adapter，并已新增 route result 统计与 failure isolation，避免单个 source watch handler 或 store delta 写入失败拖垮整次 watcher route。
- `IndexingRootPolicy` 已由 runtime diagnostics 刷新 source roots，供跨 source 授权过滤与 watcher routing 复用。
- `SearchIndexStoreAdapter` 已接入现有 `SearchIndexService.indexItems/removeItems/removeByProvider`，把 `IndexedSourceRecordBatch` 与 watch delta 映射为现有 FTS 写入模型。
- SearchEngineCore 持有 runtime 生命周期并在 destroy 时 clear；File source 的全局 `FILE_ADDED/FILE_CHANGED/FILE_UNLINKED` 事件，以及 App source 的 `FILE_ADDED/FILE_CHANGED/FILE_UNLINKED` 与 macOS `DIRECTORY_ADDED/DIRECTORY_UNLINKED` 事件，已改由 SearchEngineCore 统一桥接到 `IndexingRuntime.routeWatchEventWithResult()`。FileProvider 与 AppProvider 只负责注册 watch roots 与维护各自内部表/后处理，不再直接订阅这些全局文件事件。
- App 已拆出 `AppIndexedSource` 并将 scan/reconcile/watch lifecycle 接到现有 AppProvider 维护任务，同时输出 Windows Start Menu/UWP/Registry/App Paths/Steam、macOS mdfind/mdls、Linux desktop entries 等 source evidence；Windows scanner 已新增 `getAppsBySource()`，把 Start Menu、UWP/Get-StartApps、Uninstall Registry、App Paths Registry 与 Steam manifest 作为一等 scan result 分组，同时保持旧 `getApps()` flatten + dedupe 行为兼容；AppProvider 在 Windows 上已优先消费该 grouped scan result 生成 source evidence，失败或不支持时再回退 DB metadata 推断；`AppIndexedSource.scan()` 已开始 yield `IndexedSourceRecordBatch`，把扫描出的 app records 交给 runtime store adapter 写入边界；App watch add/change 已开始返回带 `record` 的 `IndexedSourceDelta`，delete 返回 `stableKey/path`，可由 runtime store boundary 直接消费；App reconcile 已从 full sync / macOS mdls 维护流程返回真实 added/changed/deleted/skipped/errors 统计。
- File 已拆出 `FileIndexedSource` 并将 scan/reconcile/watch/clear lifecycle 接到现有 FileProvider rebuild、worker scan/reconcile 与 incremental queue；File scan 已开始把 full scan / reconciliation 插入结果映射为 `IndexedSourceRecordBatch`，交给 runtime store boundary 消费；File watch add/change 已开始返回带 `record` 的 `IndexedSourceDelta`，delete 返回 `stableKey/path`，且全局文件 watcher 事件已先进入 SearchEngineCore runtime bridge，再由 `WatchEventRouter` 调用 File source；File reconcile 已开始透传 full scan / reconciliation / stale cleanup 的真实 added/changed/deleted/skipped/errors 统计，不再固定返回 0/0/0。
- Everything 已拆出 `EverythingIndexedSource`，并将 Windows Everything fast search 的 path filtering 改为读取 runtime root policy，不再直接读取 FileProvider 私有 watch roots。
- Browser Bookmarks 已新增 `BrowserBookmarksIndexedSource` skeleton，注册进 CoreApp runtime diagnostics，带 high privacy + official-plugin + browser-data/file-system admission，并以 disabled/pending-migration health/evidence 表达 `touch-browser-data` 仍是即时只读插件扫描器；同时已抽出 CoreApp 纯 Chromium Bookmarks scanner，可在显式启用路径下产出 `IndexedSourceRecordBatch` 和 source evidence，但默认仍禁用，尚未接入用户设置、持久化 rebuild 或 watch 小全量刷新。
- `CoreBoxEvents.search.indexingDiagnostics` 已通过 typed transport 暴露统一 diagnostics snapshot，供 Settings/CoreBox 后续消费。
- Diagnostics snapshot 已开始合并 runtime memory task state：每个 source 可带最近一次 `lastScan`、`lastWatch`、`lastReconcile` 结果，包含成功统计、失败摘要、reconcile jobId/queuedAt 与 reason/rootCount；这些字段只用于观测，不作为持久 SoT。
- Batch scan/reconcile 与 watch route 已在 runtime 层通过 SDK helper `resolveIndexedSourceTaskEligibility()` 执行 source admission 与 health guard：`getIndexedSourceAdmissionIssues()` 非空、缺 scan/watch/reconcile capability、health 为 disabled/unsupported/permission-required/error、或 permissionState 为 denied/promptable 的 source 会被跳过并进入 skipped 统计，同时写入 `lastScan` / `lastWatch` / `lastReconcile` 的 `skipped:*` evidence。Root-based watch routing 还会校验命中的 `IndexedSourceRoot.permissionState`，denied/promptable root 只会产生 `root-permission:*` skipped evidence，不会进入 source handler。Browser Bookmarks 等 high privacy source 因此不会仅靠 adapter 自觉返回空，而是在统一调度层被拦住。
- Advanced Settings 的 File Index 页面已增加 Search Source Diagnostics 总览，读取 typed diagnostics 并展示 source status、itemCount、watch/reconcile state、最近 scan/watch/reconcile task chip 与 roots/error/reason 摘要。
- CoreBox no-result 空态已消费同一个 typed diagnostics snapshot，展示 degraded / permission-required / error / warming source 摘要，并保留 retry 与 File Index settings recovery action。

当前限制：

- `SearchIndexStoreAdapter` 已提供 SQLite/SearchIndexService 最小接入；现有 App/File provider 内部仍保留各自 DB/worker 写入路径，待逐步迁移到 runtime store 边界。
- App source 的 scan/reconcile/watch 已通过 runtime lifecycle 调度现有 AppProvider 维护任务，且已输出平台子来源 evidence；Windows scanner 已能按子来源返回 records，AppProvider evidence 已优先使用 scanner grouped scan result，DB metadata 仅作为 fallback；App scan 已能产出 `IndexedSourceRecordBatch` 并由 runtime store adapter 消费，watch delta 已开始返回 runtime store 可直接消费的 `record` / `stableKey`，全局 App watcher 事件入口已从 AppProvider 私有订阅迁到 SearchEngineCore runtime bridge，App reconcile 已返回真实增改删/跳过/错误统计；AppProvider 内部 DB 写入、pending deletion、mdls 与关键词同步后处理逻辑仍保留在 provider 内部。
- File source 的 scan/reconcile/watch/clear 已通过 runtime lifecycle 调度现有 FileProvider 任务，scan 已开始 yield `IndexedSourceRecordBatch`，watch delta 已开始返回 runtime store 可直接消费的 `record` / `stableKey`，全局 File watcher 事件入口已从 FileProvider 私有订阅迁到 SearchEngineCore runtime bridge，reconcile 结果已开始使用 FileProvider 索引运行的真实统计；但 worker scan、index worker、incremental queue、scan_progress、FTS integrity reset 仍在 FileProvider 内部。
- Everything 仍由现有 provider 执行 fast search 与 SDK/CLI fallback，但 path filtering 的授权 roots 已改由 runtime root policy 提供。

## 5. Source Taxonomy

| Source                                  | 首版归属                  | Storage                       | Priority | 说明                                                                                   |
| --------------------------------------- | ------------------------- | ----------------------------- | -------- | -------------------------------------------------------------------------------------- |
| `app`                                   | CoreApp source            | `sqlite-index`                | fast     | Windows Start Menu/UWP/Registry/App Paths/Steam；macOS mdfind/mdls；Linux `.desktop`。 |
| `file`                                  | CoreApp source            | `sqlite-index`                | deferred | FileProvider watch roots、worker scan、reconcile、FTS/content index。                  |
| `everything`                            | CoreApp external source   | `external-fast`               | fast     | Windows Everything SDK/CLI fallback；通过 runtime root policy 做 path filtering。      |
| `browser-bookmark`                      | 官方插件或 CoreApp source | `sqlite-index`                | deferred | Chromium Bookmarks 首批，watch Bookmarks 文件，支持 clear/rebuild。                    |
| `browser-history`                       | 官方插件 source           | `sqlite-index`                | deferred | 复制 SQLite 只读副本，默认限制最近 N 天/N 条。                                         |
| `quicklink`                             | 官方插件 source           | `sqlite-index`                | fast     | 手动收藏、Pinned links、dev links 统一模型。                                           |
| `system-setting`                        | CoreApp source            | `ephemeral` 或 `sqlite-index` | fast     | Windows Settings URI、macOS preference panes、Linux settings desktop entries。         |
| `obsidian-note`                         | 官方插件 source           | `sqlite-index`                | deferred | vault markdown、frontmatter、tag、heading、backlink。                                  |
| `vscode-workspace` / `vscode-extension` | 官方插件 source           | `sqlite-index`                | deferred | recent workspaces 与本地 extensions。                                                  |

### 5.1 Source Admission 准入规则

新增 source 必须先补 descriptor admission，再接 runtime：

| 场景                          | 默认 owner                  | Privacy      | Default      | Permission scopes             | Storage                | Clear/Rebuild               |
| ----------------------------- | --------------------------- | ------------ | ------------ | ----------------------------- | ---------------------- | --------------------------- |
| Core App/File/System Settings | `core`                      | low/medium   | enabled      | none/file-system/system-index | sqlite-index/ephemeral | sqlite-index 必须 clearable |
| Everything/外部系统索引       | `core`                      | medium       | enabled      | external-tool + file-system   | external-fast          | 不要求 clear/rebuild        |
| Browser Bookmarks/History     | `official-plugin` 或 `core` | high         | ask/disabled | browser-data + file-system    | sqlite-index           | 必须 clearable/rebuildable  |
| Quicklinks                    | `official-plugin`           | low          | enabled      | none/account(可选)            | sqlite-index           | 必须 clearable/rebuildable  |
| Obsidian/VSCode               | `official-plugin`           | medium/high  | ask          | file-system                   | sqlite-index           | 必须 clearable/rebuildable  |
| Third-party plugin source     | `third-party-plugin`        | 按数据敏感度 | ask          | 按需声明                      | sqlite-index/ephemeral | sqlite-index 必须 clearable |

## 6. 统一 Health 字段

所有 source 必须输出统一 health：

```ts
status: 'ready' | 'warming' | 'degraded' | 'disabled' | 'unsupported' | 'permission-required' | 'error'
permissionState: 'granted' | 'denied' | 'promptable' | 'not-required'
itemCount: number
watchState: 'active' | 'pending-permission' | 'unavailable' | 'not-supported'
reconcileState: 'idle' | 'scheduled' | 'running' | 'failed'
lastIndexedAt?: number
lastScanStartedAt?: number
lastScanCompletedAt?: number
lastError?: string
reason?: string
```

这些字段必须同时服务：

- CoreBox no-result / degraded source summary。
- Settings diagnostics。
- search trace evidence。
- Windows/macOS release-blocking evidence。

## 7. 补漏策略

### Incremental

来自 watcher 或 source 自身变更事件，要求低延迟、小批量、可合并。

适用：文件新增/修改/删除、Start Menu shortcut 变化、Bookmarks 文件变化。

### Reconcile

周期性对“已知 root / 已知 records”轻量对账，修复 watcher 丢事件、进程未运行、权限恢复、外部工具状态变化。

适用：App full sync、File reconciliation、Browser Bookmarks 小全量刷新、Everything backend status refresh。

### Full Scan

首次启用、手动 rebuild、schema migration、health repair 时触发。必须后台化、可取消、可限速，不阻塞 CoreBox 首帧。

## 8. 分阶段实施

### Phase 0 - Evidence and boundary freeze

- 固定 30-50 条搜索样本：app/file/browser-bookmark/empty/unknown。
- 输出 provider/source ready-degraded summary。
- 归档 Windows/macOS/Linux 实际 scan roots、watch roots、item count、漏扫样本。
- 明确哪些 source 属于 CoreApp，哪些属于官方插件。

验收：只补诊断和文档，不改变用户行为。

### Phase 1 - Runtime skeleton

- 已开始：新建 `IndexingRuntime`，覆盖 source registry、source diagnostics 聚合与 watch event root routing。
- 已开始：App/File/Everything provider 已通过 adapter 上报统一 `IndexedSourceHealth` 与 roots。
- 已开始：通过 typed CoreBox transport 暴露 indexing diagnostics。
- 已开始：Settings / File Index 高级页展示统一 source health。
- 已开始：CoreBox no-result / degraded source summary 展示统一 source health。
- 已开始：拆 Runtime task model（ScanScheduler、WatchEventRouter、ReconcileScheduler、ReconcileEngine、IndexStoreAdapter、SourceDiagnosticsService）。
- 已开始：新增最小 `ReconcileScheduler`，把单源 reconcile 从裸 `ReconcileEngine` 调用推进到任务入口，先提供 same-source 并发 guard、jobId、queuedAt、reason/rootCount diagnostics，后续再扩展 retry、debounce、持久 job history。
- 已开始：ScanScheduler 已补 batch scan result 统计与 source-level failure isolation，`scanSourcesWithResult()` 可返回成功 source、失败 source、batches、records 与 error 摘要；单 source `scanSource()` 仍保留显式失败语义。
- 已开始：WatchEventRouter 已补 source handler / store delta failure isolation 与 route result 统计，后续可接入 diagnostics / trace。
- 已开始：ReconcileEngine 已补 batch reconcile result 统计与 source-level failure isolation，`reconcileSourcesWithResult()` 可返回成功 source、失败 source、增改删跳过/error 统计与 failure 摘要；单 source `reconcileSource()` 仍保留显式失败语义。
- 已开始：ReconcileEngine 已支持 source 在 `IndexedSourceReconcileResult.deltas` 中返回可应用补漏变更，并通过同一个 runtime store adapter 写入/删除索引；delta 写入失败会记录 `appliedDeltas` / `failedDeltas` / `deltaErrors`，不再让补漏只停留在统计层。
- 已开始：IndexingRuntime 已将最近 scan/watch/reconcile result 合并进 diagnostics snapshot，作为 Settings/trace 后续展示的 source-level task evidence。
- 已开始：IndexingRuntime 已在 batch scan/reconcile 与 watch route 前统一过滤 admission invalid、capability 不支持、disabled、unsupported、permission-required、error、permission denied/promptable 的 source；root-based watch route 也会跳过 denied/promptable root；batch/route result 会返回 skipped source 数和原因，diagnostics task state 也会记录 `skipped:*`，避免高隐私 source 或未授权 source/root 被维护任务和 watch 事件误读。
- 已开始：把 AppProvider startup backfill、full sync、pending deletion 与 mdls scan 接入 `AppIndexedSource` scan/reconcile/watch lifecycle。
- 已开始：FileIndexedSource 接入 FileProvider rebuild、worker scan/reconcile 与 incremental queue。
- 已完成：Everything path filtering 改读 runtime root policy，并拆出 `EverythingIndexedSource` 表达 external-fast source lifecycle。
- 已完成：`SearchIndexStoreAdapter` 接入真实 `SearchIndexService` 写入/删除/清源接口，runtime store 不再只有 no-op 实现。
- 已开始：Windows app scanner 新增 `getAppsBySource()`，将 Start Menu、UWP/Get-StartApps、Uninstall Registry、App Paths Registry 与 Steam manifest 拆成稳定 sub-source scan result，旧 `getApps()` 继续基于分组结果 flatten + dedupe。
- 已开始：AppProvider Windows source evidence 优先消费 scanner grouped result，source error/empty 状态直接进入 diagnostics evidence，DB metadata 推断仅作为 fallback。
- 已开始：`AppIndexedSource.scan()` 从 AppProvider 维护任务返回 `IndexedSourceRecordBatch`，runtime `ScanScheduler` 可通过 `SearchIndexStoreAdapter` 写入现有 SearchIndexService。
- 已开始：App watch add/change 事件会构造 `IndexedSourceDelta.record`，delete 事件返回 `stableKey/path`，且全局 App watcher 事件已从 AppProvider 私有订阅迁到 SearchEngineCore runtime bridge。
- 已开始：App reconcile 使用 full sync / macOS mdls 返回的真实统计填充 `IndexedSourceReconcileResult`，不再固定返回 0/0/0。
- 已开始：`FileIndexedSource.scan()` 从 FileProvider full scan / reconciliation 插入结果返回 `IndexedSourceRecordBatch`，runtime `ScanScheduler` 可通过 `SearchIndexStoreAdapter` 消费 file records。
- 已开始：File watch add/change 事件会尝试构造 `IndexedSourceDelta.record`，delete 事件返回 `stableKey/path`，runtime `WatchEventRouter` 可直接交给 `SearchIndexStoreAdapter` 做增量写入/删除。
- 已开始：File reconcile 使用 FileProvider full scan / reconciliation / stale cleanup 的真实 added/changed/deleted/skipped/errors 统计填充 `IndexedSourceReconcileResult`，并把 reconciliation 新增/更新/删除映射为 `IndexedSourceDelta` 交给 runtime store adapter 应用，不再只返回 0/0/0 或统计数字。
- 下一步：继续把 File provider 内部写入逐步迁到 runtime store 边界。

验收：`app-index:diagnostic:verify`、`everything:diagnostic:verify`、file index rebuild 最近路径不退化。

### Phase 2 - App source migration

- 已开始：拆出 `AppIndexedSource`。
- 已开始：把 startup backfill、manual rebuild、full sync、pending deletion、mdls scan 与 watcher path 事件映射到 runtime scan/reconcile/watch lifecycle。
- 已开始：Windows Start Menu/UWP/Registry/App Paths/Steam 已在 scanner 层作为 sub-source 输出 records；AppProvider evidence 已切到该 grouped scan result 优先，避免只靠 DB metadata 推断来源。
- 已开始：App scan 已映射 `ScannedAppInfo` 到 `IndexedSourceRecord`，并通过 `AppIndexedSource.scan()` yield batch 给 runtime store boundary。
- 已开始：App watcher 入口已迁到 SearchEngineCore runtime bridge；AppProvider 不再直接订阅全局文件事件，只注册 watch roots 并处理 source watch delta。
- 已开始：App reconcile 已返回真实 added/changed/deleted/skipped/errors 统计，来源于 `_initialize()` diff 与 macOS mdls repair。

验收：Windows/macOS/Linux app 搜索不降级；删除/更新 app 可由 watcher + reconcile 修复；source-level reason 可见。

### Phase 3 - File source migration

- 已开始：拆出 `FileIndexedSource`。
- 已开始：File source scan/reconcile/watch/clear lifecycle 接入 runtime，并复用 FileProvider rebuild、worker scan/reconcile 与 incremental queue。
- 已开始：File scan 已把已插入的文件 rows 映射为 `IndexedSourceRecordBatch` 并由 `FileIndexedSource.scan()` yield 给 runtime store boundary。
- 已开始：File watch delta 已从 path-only 事件推进到 add/change 返回 `record`、delete 返回 `stableKey/path`；FileProvider incremental queue 的 path 合并、delete 覆盖、manual 标记保留与串行 flush 调度已拆到 `FileProviderIncrementalQueueService`；增量 add/change 的 insert/update/unchanged/manual summary 规划已拆到 `FileProviderIncrementalWritePlannerService`；insert/update 后的 keyword/icon extension 处理与 content indexing 调度已集中到 `FileProviderWriteSideEffectService`；file row 到 index worker payload 的映射、chunk dispatch 与 large-file deferred scheduling 已拆到 `FileProviderIndexSchedulerService`；index worker result 到 `PersistEntry` 的映射已拆到 `FileProviderIndexPersistEntryMapperService`；index worker flush 的 backlog delay、sqlite-busy retry 与失败 retry reason 决策已拆到 `FileProviderIndexFlushRetryService`；index worker flush 执行、worker readiness gate、DB backpressure、persistAndIndex、commit/rollback 与耗时记录已抽到通用 `IndexedWriteFlushExecutorService`，并开始返回 source-agnostic `reason` / `error` / `metadata`；`FileProviderIndexFlushExecutorService` 只保留 FileProvider 返回语义与日志适配；pending/inflight buffer 的 enqueue、take、commit、rollback 与 size 统计已抽到通用 `IndexedWriteBufferService`，`FileProviderIndexFlushBufferService` 只保留 fileId 适配；`FileProviderIndexRuntimeService` 已记录最近 flush snapshot，并通过 `file-provider:index-flush` evidence 暴露 flushed / worker-not-ready / failed、pending/inflight、retry reason、error 与 duration；内部文件表 persist 与 FTS 语义暂时保留在 FileProvider/SearchIndex worker 边界。
- 已开始：File reconcile 已从 FileProvider 索引运行中透传真实 added/changed/deleted/skipped/errors 统计，覆盖新 root full scan、existing root reconciliation 与 stale cleanup 删除；existing root reconciliation 的 add/change/delete 也会进入 `IndexedSourceReconcileResult.deltas`，由 ReconcileEngine 统一应用到 runtime store。
- 已开始：File source evidence 已补 `file-provider:scan-progress`、`file-provider:integrity` 与 `file-provider:index-flush`，把 scan_progress pending/failed/completed 汇总、watch root pending permission、FTS/files row count、integrity-triggered reset、orphan keyword cleanup、index worker flush backlog、worker-not-ready 与 persist failure 暴露进统一 diagnostics，而不是只留在 FileProvider 日志；File source roots 已把 FileSystemWatcher pending paths 映射为 `permissionState: "promptable"` 与 `file-index-watch-root-pending-permission` reason，供 runtime root guard 跳过未授权 root；SDK 新增 `IndexedSource.shouldHandleWatchEvent()` ownership hook，`WatchEventRouter` 会把拒绝的 path 记录为 `source-watch-filtered`；FileSystemWatcher pending path 恢复时会发出 `FILE_WATCH_ROOT_RECOVERED`，SearchEngineCore 先用 File source ownership 过滤，再对 FileProvider watch root 触发 `IndexingRuntime.reconcileSource("file-provider", { reason: "file-watch-root-recovered", roots: [recoveredRoot] })`，runtime `lastReconcile` 会记录补漏 reason 与 rootCount 并展示到 Settings/CoreBox diagnostics task chip；scan_progress evidence 读模型、completed-root strategy 读取、stale path 删除与 completed-path upsert 已拆到 `FileProviderScanProgressService`；FTS/files row-count 检查、integrity-triggered runtime reset、orphan `keyword_mappings` cleanup 与 integrity snapshot 已拆到 `FileProviderIntegrityService`。
- 已开始：FileProvider manual rebuild、schema migration 与 integrity mismatch 的 `scan_progress` / provider-index reset 已收束到 `FileProviderRuntimeResetService`，统一记录 reset reason、scan_progress rows、是否清理 search index 与 scan_progress，为后续把 reset 动作提升为 runtime task 做准备。
- 已开始：SDK 新增 `IndexedSourceResetRequest` / `IndexedSourceResetResult` 与 `IndexedSource.resetIndex()`；CoreApp 新增 `IndexingRuntime.resetSourceRuntimeState()` 并记录 `lastReset` diagnostics，FileIndexedSource 已把该入口接到 FileProvider runtime reset helper。该语义区别于 `clearIndex()`：reset 是清运行时索引状态并让后续 scan/reconcile 修复，不等价于用户级清空或完整重建。
- 已开始：SearchEngineCore 初始化 runtime 后向 FileProvider 注入 indexed-source reset delegate；FileProvider manual rebuild、schema migration 与 integrity mismatch reset 会优先走 `IndexingRuntime.resetSourceRuntimeState("file-provider", { reason })`，无 delegate 时才 fallback 到内部 helper，避免 FileProvider 直接 import runtime 造成依赖环。
- 待继续：scan worker、incremental DB persist、index worker flush trace、FTS 写入语义，以及 scan_progress/integrity reset 调度继续从 FileProvider 内部拆到 runtime task/store 边界；File watch-root recovery 已具备 `lastReconcile.reason/rootCount/jobId/queuedAt` 用户可见 task evidence，后续再提升为完整 durable reconcile job history。
- 已完成：Everything 改为读取 runtime root policy 做 path filtering；无 File source roots 时 fail-closed，并记录 `indexing-root-policy-file-roots-empty` 等原因。

验收：文件新增/修改/删除可及时反映；reconcile 修复丢事件；Everything fallback/path filtering reason 进入普通 search trace。

### Phase 4 - Browser bookmarks indexed source

- 已开始：新增 `BrowserBookmarksIndexedSource` runtime skeleton，先只提供 descriptor/admission/health/evidence/reconcile skipped 结果，不改变 `touch-browser-data` 插件即时搜索行为。
- 已开始：从 `touch-browser-data` 插件逻辑抽出 CoreApp 纯 scanner，覆盖 Chrome / Edge / Brave / Arc profile discovery、Chromium `Bookmarks` 解析、非 http(s) URL 过滤、URL 去重、read-failed/not-found/unsupported diagnostics，以及 bookmark 到 `IndexedSourceRecord` 的稳定映射。
- 已开始：`BrowserBookmarksIndexedSource` 在显式 enabled/test path 下可 yield `IndexedSourceRecordBatch` 并输出 browser root/evidence；默认 runtime 注册仍保持 disabled/pending migration，避免 high privacy source 未经用户同意读取真实浏览器文件。
- `touch-browser-data` 从即时全量读 Bookmarks 升级为 indexed source。
- Chromium Bookmarks 写入 SQLite/search index。
- watch Bookmarks 文件，变更后增量或小全量刷新。
- 支持 enable/disable/clear/rebuild。

验收：未授权/文件不存在不伪成功；health 可见；不持久化敏感历史全文 JSON。

### Phase 5 - Additional sources

按价值和风险推进：

1. Quicklinks source。
2. Browser History source。
3. System Settings source。
4. Obsidian source。
5. VSCode source。

每个 source 的准入条件：显式启用或低风险默认、health 完整、disable/clear/rebuild 可用、不阻塞启动、search trace 能解释是否参与和为何无结果。

## 9. 当前约束

- 不降级 `2.4.11` Windows/macOS release-blocking evidence 主线。
- 不引入 raw channel / legacy SDK bypass。
- 不绕过平台权限模型。
- 不把敏感数据写入 localStorage、明文 JSON、同步 payload 或日志。
- 不用 mock/内存 fallback 宣称生产完成。

## 10. 下一步建议

下一刀继续收口两件事：一是把 Browser Bookmarks 的 enable/disable 设置、授权提示、clear/rebuild 与 Bookmarks 文件 watch 小全量刷新接到 runtime；二是继续把 FileProvider 内部 worker 写入、incremental queue、scan_progress 与 FTS reset 迁向统一 task/store 边界。新增 Quicklinks/System Settings/Browser History 应排在这两条主线之后，避免复制半迁移状态。
