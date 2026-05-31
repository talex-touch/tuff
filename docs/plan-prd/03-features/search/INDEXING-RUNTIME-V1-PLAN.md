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
- `SearchProviderDescriptor`
- `SearchProviderUserConfig`
- `SearchProviderRuntimeConfig`
- `SearchProviderRegistrationPolicy`
- `normalizeSearchProviderUserConfigs()`
- `resolveSearchProviderRegistrationDecision()`
- `isIndexedSourceEnabledByProviderConfig()`
- `getSearchProviderIdsForIndexedSource()`

首版只提供类型与纯校验函数，不改变现有运行行为。后续 CoreApp runtime 与官方插件 SDK 都应复用这些类型，避免各 source 自定义状态字段。

`IndexedSourceAdmission` 用于固定新增 source 的准入口径：

- `owner`: `core` / `official-plugin` / `third-party-plugin`
- `permissionScopes`: `none` / `file-system` / `browser-data` / `system-index` / `external-tool` / `network` / `account`
- `defaultState`: `enabled` / `disabled` / `ask`
- `requiresUserConsent`
- `clearable` / `rebuildable`

准入校验会覆盖高隐私 source 不得静默默认启用、Browser Data 必须标记 high privacy 与 browser-data scope、external-fast source 必须声明 external-tool 且不能由 third-party plugin 直接提供、sqlite-index source 必须 clearable、watch source 必须支持 reconcile。`resolveIndexedSourceTaskEligibility()` 进一步把 admission、capability、health 与 permissionState 组合成统一 scan/watch/reconcile 调度资格判断，返回 `{ eligible, reason }`，供 CoreApp runtime 与后续官方插件 source 复用。App/File/Everything core descriptors 已补 admission metadata，作为 Browser Data / Quicklinks / Obsidian / VSCode source 后续接入模板。

Source contract 已补一层 SDK summary：`getIndexedSourceContractIssues()` / `isIndexedSourceContractReady()` 会把 admission 与 lifecycle issue 合并成 `{ admission, lifecycle, ready }`，供 runtime 注册 warning、Settings diagnostics 与后续插件校验工具复用，避免多个入口重复拼规则。

Watch root routing 也开始有 SDK 边界：`normalizeIndexedSourcePathForMatch()`、`isIndexedSourcePathInsideRoot()`、`resolveIndexedSourceRootSkipReason()` 与 `resolveIndexedSourceWatchRootRoute()` 统一处理 root path 命中、Windows/macOS case-insensitive 匹配、Linux 默认 case-sensitive 匹配，以及 denied/promptable root 到 `root-permission:*` skip reason 的映射。CoreApp `WatchEventRouter` 已改为复用这些 helper，后续官方插件 source 不需要复制路径归一化和 root permission guard。路径型 source 的 watch path policy 也开始下沉：`normalizeIndexedWatchPath()` 与 `getIndexedWatchDepthForPath()` 统一 watch path normalize、case sensitivity 与 macOS/Windows/Linux 默认 watch depth；`resolveIndexedWatchRootSet()`、`isIndexedWatchPathOwned()` 与 `filterIndexedWatchPendingPermissionPaths()` 统一 watch roots 合并去重、root/child ownership 判断与 pending permission root 过滤；FileProvider 只保留平台适配、真实 watcher 注册和权限状态读取。

Search Provider 也开始有公开 SDK 边界：`SearchProviderDescriptor` 描述能进入 CoreBox 根结果的 provider，`SearchProviderUserConfig` 保存用户侧 `enabled/order`，`normalizeSearchProviderUserConfigs()` 将 descriptor 与用户配置归一成 Settings 可展示的 runtime config，`getSearchProviderUserConfigSignature()` 用于让搜索缓存随 provider 配置变化失效，`resolveSearchProviderPermissionIds()` 将 provider scope 映射到插件 manifest 权限，`getSearchProviderManifestCoverage()` / `deriveSearchProvidersFromPushFeatures()` / `resolveSearchProviderManifestDescriptors()` 则把 push feature 覆盖率审计、legacy provider 派生、manifest provider 归一、policy decision 与权限缺失检测沉淀到 SDK。插件注册 provider 必须经过 `SearchProviderRegistrationPolicy`：第三方 push provider 要声明 `root-results` scope，并在 manifest 中声明 `search.root-results`；第三方 indexed provider 必须显式用户授权，高隐私和 Browser Data provider 不能默认静默启用；官方插件 provider 可用 `indexedSourceId` 关联一个 runtime indexed source，用于 Settings/diagnostics 解释 provider 与 source 的关系，但第三方 provider 不能抢占 `browser-bookmarks` / `browser-history` 这类高隐私 Browser Data runtime source id。`getSearchProviderIdsForIndexedSource()` 用于把 provider descriptors 反查成 source-to-provider links；`isIndexedSourceEnabledByProviderConfig()` 用于把 source id 与 linked provider ids 映射到显式用户 enablement，只认 `enabled === true`，避免 ask/default 状态被误当作用户同意。Browser Bookmarks / History 的长期索引归属应是官方插件 provider，而不是 CoreApp 内置长期实现。CoreApp 只保留 scanner / runtime skeleton 用于迁移验证和诊断，不作为最终产品归属。CoreApp 运行时已在插件根结果写入路径校验 `search.root-results`，未声明或未授权的插件不能通过 `plugin.feature.pushItems()` / `boxItems.push()` 向 CoreBox 根结果推送内容。

Source descriptor 也开始有 SDK 模板边界：`createQuicklinksIndexedSourceDescriptor()`、`createBrowserBookmarksIndexedSourceDescriptor()`、`createBrowserHistoryIndexedSourceDescriptor()`、`createSystemSettingsIndexedSourceDescriptor()` 与 `createIndexedSourceDescriptorTemplate()` 提供 Quicklinks / Browser Data / System Settings 的默认 admission、capabilities、storage、privacy 与平台样板。Quicklinks 固定为 official-plugin、low privacy、sqlite-index、fast、clearable/rebuildable；Browser Bookmarks 与 Browser History 固定为 official-plugin、high privacy、sqlite-index、deferred、disabled-by-default、requiresUserConsent、browser-data + file-system scope、clearable/rebuildable；System Settings 固定为 core、low privacy、ephemeral、fast、system-index scope、不可 clear 但可 rebuild。这些 helper 只用于统一后续 source 接入的 descriptor/admission 口径，不注册 runtime source、不读取数据、不代表 Quicklinks/Browser Data/System Settings 已完成。

插件侧 indexed source intent 也进入 manifest 契约：`manifest.indexedSources` 会在插件加载阶段通过 SDK `resolveIndexedSourceManifestDescriptors()` 归一为 `IndexedSourceDescriptor`，并同步执行 admission 与 manifest permission 校验。`browser-data` scope 映射到 `fs.read`，`file-system` scope 映射到 `fs.index`；Browser Data source 只能由 official-plugin 声明，且必须 high privacy、默认 disabled/ask、requiresUserConsent。该契约目前只暴露插件状态和 `INDEXED_SOURCE_*` diagnostics，不自动注册 runtime source，也不读取真实浏览器文件；它用于把 `touch-browser-data` 从即时 push provider 迁向官方 indexed source 前，先把权限和 lifecycle 归属说清楚。

插件侧 provider 声明已进入 manifest 契约：`manifest.searchProviders` 会在插件加载阶段转换成 `SearchProviderDescriptor`，并同步执行 policy 与 manifest permission 校验。一个插件可以通过 `featureId` 声明多个 push provider；插件 item 带 `meta.featureId` 时，runtime 会自动补 `meta.searchProviderId`，让 Settings 启停精确到 provider。未声明 `searchProviders` 但存在 `push: true` feature 的旧插件，会通过 SDK `deriveSearchProvidersFromPushFeatures()` 为每个 push feature 派生兼容 provider 并记录 `SEARCH_PROVIDER_DERIVED_FROM_PUSH_FEATURE` warning；缺少 `search.root-results` 或违反 registration policy 的 provider 只记录 issue，不进入可注册 provider 列表。Provider registry 已开始把 core indexed source 与 `plugin.searchProviders` 汇总到 Settings，使用户可以在同一列表里选择 provider 启停和排序；当前仓库内 18 个 push 插件已全部补齐显式 `manifest.searchProviders`，包括 Browser Data、Quicklinks、浏览器打开/网页搜索、片段、翻译、系统动作、窗口动作、开发工具、文本工具、剪贴板历史、智能问答与工作区脚本等入口，不再依赖 legacy push-feature 派生。禁用 push 型插件 provider 只阻止该 provider 后续 `boxItems.push()` / `pushItems()` / `update()` 写入 CoreBox 根结果，不误伤同插件其它 enabled provider；`boxItems.update()` 会优先读取已有 item 的 `meta.searchProviderId` 做 provider guard，避免 update payload 没重复携带 provider id 时被误拦；`remove` / `clear` 仍允许清理 stale items。插件 push item 会标记 `meta.searchProviderId`，root-result store 在 sync / batch upsert 时会按 provider config 过滤 disabled provider 并按 `order` 重排已有 push 结果；Settings 保存配置后会触发 root item sync 刷新。pull/indexed provider 执行顺序仍由 SearchEngineCore 使用同一份 config 控制。

`IndexedSourceReconcileReasons` 用于统一补漏触发原因码，当前覆盖 scheduled、manual-repair、watch-gap、watch-recovery、file-watch-root-recovered、health-repair、schema-migration、external-refresh 与 reconcile-not-supported；`IndexedSourceReconcileRequest.reason` 优先使用这些 SDK 标准值，同时仍允许 source-specific 字符串作为迁移期细粒度诊断。

`IndexedSourceScanReasons` 用于统一扫描触发原因码，当前覆盖 startup、manual-rebuild、scheduled、watch-recovery、schema-migration 与 health-repair；`IndexedSourceScanRequest.reason` 优先使用这些 SDK 标准值，避免 App/File/Everything/Browser Data source 在 runtime 迁移期间继续散落硬编码 reason。

`IndexedSourceResetReasons` 用于统一运行时 reset 原因码，当前覆盖 manual-rebuild、schema-migration、integrity-repair、health-repair 与 user-clear；`IndexedSourceResetRequest.reason` 优先使用这些 SDK 标准值，让 runtime `lastReset` diagnostics 与 FileProvider reset helper 共享同一组稳定原因。

## 4.1 CoreApp runtime skeleton

CoreApp 已新增最小 `IndexingRuntime` 骨架：

- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-runtime.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-runtime.test.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-progress-estimator-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-progress-stream-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-watch-delta-queue-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-worker-persist-entry-mapper-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-worker-scheduler-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-write-side-effect-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-write-flush-runtime-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-write-flush-retry-service.ts`

当前能力：

- register/unregister/list indexed sources。
- 聚合 `IndexedSourceHealth` 与 roots 为统一 diagnostics。
- 聚合 source evidence，用于解释平台子来源、root 数、itemCount 与失败原因。
- 将 source health 读取失败转换为 source-level `error`，避免整条 diagnostics 链路失败。
- 按 `sourceId` 或 source roots 路由 watch event。
- Runtime task model 已拆出 `SourceDiagnosticsService`、`WatchEventRouter`、`ScanScheduler`、`ReconcileScheduler`、`ReconcileEngine`、`IndexStoreAdapter`、`IndexingRootPolicy` 与最小 `IndexedSourceRuntimeTaskJobFactory`，`IndexingRuntime` 只保留 registry 与编排入口。
- `ScanScheduler` 支持 source-level scan task 与 batch 写入 store adapter，并已新增 batch scan result 统计与 failure isolation，避免单个 source scan 失败拖垮整批扫描；`IndexingRuntime` 已为 single/batch scan 成功、失败与 skipped source 写入 `lastScan.jobId/queuedAt` diagnostics；`WatchEventRouter` 将 watch delta 写入 store adapter，并已新增 route result 统计与 failure isolation，避免单个 source watch handler 或 store delta 写入失败拖垮整次 watcher route，同时 `lastWatch` 也会为 applied delta、handler/store failure 与 skipped source 写入 `jobId/queuedAt`；scan/watch/reconcile/reset 四类维护任务因此复用同一个 `IndexedSourceRuntimeTaskJobFactory` runtime task identity，为后续 durable job history / retry / debounce 做边界；`ReconcileScheduler` 已作为 `IndexingRuntime` 与 `ReconcileEngine` 之间的最小任务入口，负责 same-source running guard、job id、queuedAt、reason/rootCount 记录；`ReconcileEngine` 支持 source-level reconcile 入口与 unsupported 结果，并已新增 batch reconcile result 统计与 failure isolation。
- `IndexingRootPolicy` 已由 runtime diagnostics 刷新 source roots，供跨 source 授权过滤与 watcher routing 复用。
- `SearchIndexStoreAdapter` 已接入现有 `SearchIndexService.indexItems/removeItems/removeByProvider`，把 `IndexedSourceRecordBatch` 与 watch delta 映射为现有 FTS 写入模型。
- SearchEngineCore 持有 runtime 生命周期并在 destroy 时 clear；File source 的全局 `FILE_ADDED/FILE_CHANGED/FILE_UNLINKED` 事件，以及 App source 的 `FILE_ADDED/FILE_CHANGED/FILE_UNLINKED` 与 macOS `DIRECTORY_ADDED/DIRECTORY_UNLINKED` 事件，已改由 SearchEngineCore 统一桥接到 `IndexingRuntime.routeWatchEventWithResult()`。FileProvider 与 AppProvider 只负责注册 watch roots 与维护各自内部表/后处理，不再直接订阅这些全局文件事件。
- App 已拆出 `AppIndexedSource` 并将 scan/reconcile/watch lifecycle 接到现有 AppProvider 维护任务，同时输出 Windows Start Menu/UWP/Registry/App Paths/Steam、macOS mdfind/mdls、Linux desktop entries 等 source evidence；Windows scanner 已新增 `getAppsBySource()`，把 Start Menu、UWP/Get-StartApps、Uninstall Registry、App Paths Registry 与 Steam manifest 作为一等 scan result 分组，同时保持旧 `getApps()` flatten + dedupe 行为兼容；AppProvider 在 Windows 上已优先消费该 grouped scan result 生成 source evidence，失败或不支持时再回退 DB metadata 推断；`AppIndexedSource.scan()` 已开始 yield `IndexedSourceRecordBatch`，把扫描出的 app records 交给 runtime store adapter 写入边界；App watch add/change 已开始返回带 `record` 的 `IndexedSourceDelta`，delete 返回 `stableKey/path`，可由 runtime store boundary 直接消费；App reconcile 已从 full sync / macOS mdls 维护流程返回真实 added/changed/deleted/skipped/errors 统计。
- File 已拆出 `FileIndexedSource` 并将 scan/reconcile/watch/clear lifecycle 接到现有 FileProvider rebuild、worker scan/reconcile 与 incremental queue；File scan 已开始把 full scan / reconciliation 插入结果映射为 `IndexedSourceRecordBatch`，交给 runtime store boundary 消费；File watch add/change 已开始返回带 `record` 的 `IndexedSourceDelta`，delete 返回 `stableKey/path`，且全局文件 watcher 事件已先进入 SearchEngineCore runtime bridge，再由 `WatchEventRouter` 调用 File source；File reconcile 已开始透传 full scan / reconciliation / stale cleanup 的真实 added/changed/deleted/skipped/errors 统计，不再固定返回 0/0/0。
- Everything 已拆出 `EverythingIndexedSource`，并将 Windows Everything fast search 的 path filtering 改为读取 runtime root policy，不再直接读取 FileProvider 私有 watch roots。
- Browser Bookmarks 已新增 `BrowserBookmarksIndexedSource` skeleton，注册进 CoreApp runtime diagnostics，带 high privacy + official-plugin + browser-data/file-system admission，并以 disabled/pending-migration health/evidence 表达 `touch-browser-data` 仍是即时只读插件扫描器；同时已抽出 CoreApp 纯 Chromium Bookmarks scanner。显式 enabled path 下已能产出 `IndexedSourceRecordBatch`、browser root/evidence、基于扫描结果的 ready/degraded health、reconcile 小全量 refresh deltas 与 Bookmarks watch refresh deltas，并提供 `resetIndex()` 供 runtime 记录 user-clear / health-repair 等 reset diagnostics；默认仍不扫描真实浏览器文件，但 runtime source 已通过轻量 `browser-bookmarks-source-config` 动态读取统一 provider config，只有用户显式启用 `browser-bookmarks` 或官方 `touch-browser-data.browser-bookmarks` provider 后才进入 enabled path。持久化 rebuild、watch root 注册与用户级 clear 仍未完成。产品归属已调整为官方插件 provider：CoreApp skeleton 只作为 runtime 迁移与诊断样板，后续应迁出到 browser-data 官方插件并通过插件权限声明进入根结果。
- `CoreBoxEvents.search.indexingDiagnostics` 已通过 typed transport 暴露统一 diagnostics snapshot，供 Settings/CoreBox 后续消费；`settings.indexedSource` SDK 已新增通用 runtime maintenance 入口，映射 `AppEvents.indexedSource.diagnostics/reset/reconcile/scan`，让 Settings 和后续 source 管理 UI 通过 `sourceId` 触发 diagnostics、reset、reconcile 与 scan，而不是为 File/App/Browser 各写私有 IPC。
- `settings.indexedSource` SDK 已新增 provider config 读写入口，映射 `AppEvents.indexedSource.providerConfigGet/providerConfigUpdate`，用于 Settings 展示和保存 indexed provider 的 `enabled/order`；provider-config response 同时返回 `sourceLinks: { sourceId, providerIds[] }[]`，把 runtime source 与 linked provider 的关系作为结构化 transport 数据暴露给 Settings，而不是只依赖前端从 descriptor policy 反推；SearchEngineCore 默认 provider 池已读取该配置来过滤关闭的 provider 并按 order 调整执行顺序，激活态 provider 仍保持原语义不受全局设置打断，搜索 cache key 也包含 provider config signature，避免配置修改后短暂返回旧 provider 结果。
- Provider registry snapshot 也开始返回 `issues`，把插件 loader 的 `SEARCH_PROVIDER_*` registration issue 与 registry 层 provider id collision 暴露给 Settings / SDK 消费方；被权限或策略拦截的插件 provider 仍不进入 `availableProviders`，但 Settings 会展示其未能进入根结果的原因，避免“插件注册了 provider 但列表里消失”的黑盒状态。
- 第三方 push provider 准入已收紧：除 `root-results` scope 外，manifest provider 必须声明 `defaultState: "ask"` 与 `requiresUserConsent: true`，否则 `resolveSearchProviderRegistrationDecision()` 会返回 `third-party-push-requires-explicit-consent`，CoreApp loader 不会把该 provider 暴露给 registry。
- 插件 push provider 写入根结果时已复用 SDK `isSearchProviderEnabledByConfig()` / `normalizeSearchProviderUserConfigs()` 解析后的 enabled 状态：`defaultState: "ask"` 或 `requiresUserConsent` 的 provider 在用户显式启用前不能通过 `boxItems.push()` / `pushItems()` / `update()` 写入 CoreBox 根结果；`search.root-results` permission 只是最低运行时权限，不再被误当作用户同意。
- CoreBox root-result store 对已存在的 provider-tagged items 也改为严格过滤：只有 provider config 解析为 `enabled === true` 的 item 会在 sync/batch upsert/update 中继续可见，ask-state 或 disabled provider 的旧结果会被隐藏；未带 `meta.searchProviderId` 的 legacy item 暂时保留可见，作为迁移兼容路径。
- Diagnostics snapshot 已开始合并 runtime memory task state：每个 source 可带最近一次 `lastScan`、`lastWatch`、`lastReconcile`、`lastReset` 结果，包含成功统计、失败摘要、四类维护任务的 jobId/queuedAt，以及 reconcile reason/rootCount；同时新增 bounded in-memory `recentTasks`，按最近优先保留 scan/watch/reconcile/reset 的 kind/status/jobId/queuedAt/error/summary，作为 Settings/trace 的 source-level task history 过渡层。SDK 已提供 `appendIndexedSourceTaskHistory()` 与 `DEFAULT_INDEXED_SOURCE_TASK_HISTORY_LIMIT`，CoreApp runtime 和后续官方插件 indexed source 应复用同一 newest-first / bounded 裁剪规则。Diagnostics snapshot 也新增 source-level `progress` 字段，统一表达 stage、current/total、百分比、estimatedRemainingMs、estimatedCompletionAt、averageItemsPerSecond、speedSampleCount 与 estimateBasis；这些字段只用于观测，不作为持久 SoT，也不写入 JSON sync payload。
- Batch scan/reconcile 与 watch route 已在 runtime 层通过 SDK helper `resolveIndexedSourceTaskEligibility()` 执行 source admission 与 health guard：`getIndexedSourceAdmissionIssues()` 非空、缺 scan/watch/reconcile capability、health 为 disabled/unsupported/permission-required/error、或 permissionState 为 denied/promptable 的 source 会被跳过并进入 skipped 统计，同时写入 `lastScan` / `lastWatch` / `lastReconcile` 的 `skipped:*` evidence。Root-based watch routing 已改用 SDK helper `resolveIndexedSourceWatchRootRoute()` 校验命中的 `IndexedSourceRoot.permissionState`，denied/promptable root 只会产生 `root-permission:*` skipped evidence，不会进入 source handler；路径归一化与平台大小写规则也不再是 CoreApp 私有逻辑。Browser Bookmarks 等 high privacy source 因此不会仅靠 adapter 自觉返回空，而是在统一调度层被拦住。
- Diagnostics snapshot 已暴露 source admission contract：`IndexedSourceDiagnostics.admissionIssues` 来自 SDK `getIndexedSourceAdmissionIssues()`，`IndexingRuntime.registerSource()` 会对 admission issue 记录 warning，Settings 会展示 Admission chips，并将其计入 attention summary；这让 high privacy、Browser Data、external-fast、persistent-source、watch/reconcile policy 的准入问题在 source 级别可见，不必只依赖 task skipped reason。
- Source lifecycle contract 也开始进入 SDK：`getIndexedSourceLifecycleIssues()` / `isIndexedSourceLifecycleReady()` 会校验 descriptor capabilities 与实际 handler 是否一致，覆盖 scan、watch、reconcile、search、reset、clear、open。CoreApp `IndexingRuntime.registerSource()` 当前只记录 lifecycle issue warning，不阻断旧 source；`IndexedSourceDiagnostics.lifecycleIssues` 与 Settings Contract chips 会展示同一组 issue。后续官方插件 source 接入前应清空这些 issue，避免 capability 声明与运行时入口继续发散。
- Advanced Settings 的 File Index 页面已增加 Search Source Diagnostics 总览，读取 typed diagnostics 并展示 source status、itemCount、watch/reconcile state、最近 scan/watch/reconcile task chip 与 roots/error/reason 摘要。
- Advanced Settings 的 File Index 页面已开始消费 diagnostics `recentTasks`，以最近优先展示 scan/watch/reconcile/reset history chips，并复用 succeeded/failed/skipped tone 映射；recent task chip 会解释 `summary` 中的 scan records/batches、watch delta/action、reconcile add/change/delete/skipped 与 reset clear flags。这让 bounded runtime task history 进入用户可见诊断，而不是停留在 transport 字段。
- Advanced Settings 的 File Index 页面也开始展示 source evidence chips，会优先显示 degraded / permission-required / error evidence，再显示 ready evidence。File source 的 `file-provider:scan-progress`、`file-provider:integrity`、`file-provider:index-flush` 因此能把 scan_progress、FTS integrity、flush backlog、retry reason、worker-not-ready、duration 等信息带进统一 source diagnostics，而不是新增 FileProvider 专属面板。Renderer helper 会按 evidence id 消费现有 metadata，将 scan completed/failed/pending-permission、flush pending/inflight/entries/duration、integrity FTS/files/rebuild/orphan keywords 格式化成稳定 chip 摘要，避免设置页直接暴露裸 metadata。
- Advanced Settings 的 File Index 页面已开始消费 `settings.indexedSource` SDK：支持 source-level scan / reconcile / reset 维护动作，并增加 indexed provider 启用与排序配置列表。高隐私 Browser Data source 仍受 runtime guard 与插件权限约束，Settings 开关不绕过 consent。
- Advanced Settings 的 provider 配置列表已开始展示 `indexedSourceId` 关联的 runtime source id 与当前 diagnostics status，让 `touch-browser-data.browser-bookmarks` 这类官方插件 provider 能和 disabled/pending-migration source 对上号；保存格式仍只持久化 `providerId/enabled/order/updatedAt`，不把 source diagnostics 写入用户配置。
- CoreBox no-result 空态已消费同一个 typed diagnostics snapshot，展示 degraded / permission-required / error / warming source 摘要，并保留 retry 与 File Index settings recovery action。
- Indexing progress ETA 估算已下沉到 `@talex-touch/utils/search` 的 `IndexingProgressEstimatorService` 公共 SDK，优先按 stage-local smoothed throughput 计算 remaining time；在同一 stage 内速度样本不足但 elapsed progress 已稳定时，会用带安全系数的 elapsed-progress fallback 给出保守 ETA，避免索引早期长时间没有剩余时间。terminal stage、stage 切换、进度回退、冷启动和低进度阶段仍隐藏不可靠 ETA。估算器现在还输出 `estimateStatus`（unknown / stabilizing / estimated / stalled / complete）、`speedSampleCount` 与 `estimateBasis`（none / stage-speed / elapsed-progress / stalled / complete），并在长时间无进展时隐藏旧 ETA，避免 Settings 给出误导性剩余时间。Progress stream 节流也通过 `@talex-touch/utils/search` 的 Indexing Progress Stream helpers 暴露，统一处理 first payload、stage change、terminal stage、max silence、min interval、progress/current/total 变化。CoreApp 仅保留兼容 re-export，FileProvider 现在直接消费 SDK primitive，并只通过 `FileProviderProgressEstimatorService` / `file-provider-progress-stream-service` 薄适配 `FileIndexStage` 与 `FileIndexProgress` payload；后续 Browser Bookmarks、Quicklinks、Obsidian 或 VSCode source 的 scan UI 可复用同一估算与节流规则，避免每个 source 各自实现剩余时间和推流频率。
- File indexed source 已把 FileProvider 私有 indexing status 适配为 `IndexedSourceDiagnostics.progress`，让统一 diagnostics snapshot 能直接携带 File source 的 stage、current/total、百分比、ETA、预计完成时间、吞吐、样本数与估算来源；Advanced Settings 的 Search Source Diagnostics 已开始渲染 source-level progress chip，按 unknown / idle / running / stabilizing / estimated / stalled / complete / failed 显示统一 tone、阶段、百分比、剩余时间、预计完成时间、吞吐、样本数与 estimateBasis。后续 Browser Bookmarks、Quicklinks、Obsidian、VSCode source 接入 `getProgress()` 后不需要再新增 FileProvider 私有进度 UI。
- Index worker / write worker flush retry、buffer 与 latest snapshot 已下沉到 `@talex-touch/utils/search` SDK primitive：`IndexedWriteFlushRetryService` 统一处理 pending backlog delay、backlog threshold、exponential retry、jitter 与 retry count；`IndexedWriteBufferService` 统一处理 pending/inflight enqueue、take、commit、rollback 与 size 统计；`IndexedWriteFlushSnapshotService` 只记录最近一次 flush snapshot 与 `checkedAt`，不承载 worker readiness、SQLite persist 或 SearchIndex/FTS 语义。CoreApp 仅保留兼容 re-export，FileProvider 只在 `FileProviderIndexFlushRetryService` 中注入 SQLite busy 判断，并把结果映射为现有 `sqlite-busy-retry` / `flush-failed` reason；`FileProviderIndexFlushBufferService` 只保留 fileId 适配，File runtime 直接消费 SDK snapshot primitive 并把 `worker-not-ready` 等 File 专属状态映射到 source evidence，避免后续 source 的 worker flush 各写一套 backoff/buffer/snapshot。
- Source integrity policy 已下沉到 `@talex-touch/utils/search` 的 `IndexedSourceIntegrityService` SDK primitive：统一处理 source rows 与 indexed rows 的比例判断、缺索引/部分索引时的 reset request、aligned 状态下的 orphan cleanup 调用、duration 与 SDK-standard snapshot 映射。FileProvider 现在只注入 FTS/files row count、runtime reset 与 `keyword_mappings` orphan cleanup；真实 DB 查询、SearchIndex/FTS 表语义和 File 专属 keyword cleanup 仍留在 FileProvider 边界。
- Source progress store 已下沉到 `@talex-touch/utils/search` 的 `IndexedSourceProgressStoreService` SDK primitive：统一处理 completed root 读取后的 pending-root summary、空 delete/upsert 跳过、upsert readiness gate 与 upsert result。FileProvider 的 `scan_progress` 适配现在只保留 Drizzle select/delete、worker readiness 与 `upsertScanProgress` 注入；真实表结构和 SearchIndex worker 仍留在 CoreApp 边界。
- Watcher delta queue 已下沉到 `@talex-touch/utils/search` 的公共 `IndexingWatchDeltaQueueService` SDK primitive：统一处理 watch/recovery delta 的 accept gate、normalized key 合并、delete 覆盖、prepare-flush gating 与串行 flush。CoreApp 仅保留兼容 re-export，FileProvider 现在直接消费 SDK queue，`FileProviderIncrementalQueueService` 只保留 File 语义适配和 `manual` metadata 合并；后续 Browser Bookmarks、Quicklinks、Obsidian、VSCode 等 source 可以复用同一 queue primitive，而不是各自实现 watcher 补漏队列。
- Watch path policy 已下沉到 `@talex-touch/utils/search` 的公共 `normalizeIndexedWatchPath()` / `getIndexedWatchDepthForPath()` SDK primitive：统一处理路径 normalize、case-insensitive filesystem 适配、macOS Applications/Downloads 浅层监听与 Windows/Linux 默认 watch depth。FileProvider 的 path service 现在只是兼容薄封装；真实 `FileSystemWatcher.addPath()`、pending permission 与 watcher 生命周期仍在 CoreApp 边界。
- Watch root set/ownership policy 已下沉到 `@talex-touch/utils/search` 的公共 `resolveIndexedWatchRootSet()` / `isIndexedWatchPathOwned()` / `filterIndexedWatchPendingPermissionPaths()` SDK primitive：统一处理 base + extra roots 的 normalized 去重、root 本身或子路径 ownership 判断、共享前缀误判防护，以及 pending permission 只按 watch root 精确匹配过滤。FileProvider watch service 现在只注入真实 `FileSystemWatcher.getPendingPaths()`、`FileSystemWatcher.addPath()`、配置读取与 CoreApp 平台 path separator；后续路径型 source 不应复制 roots 合并和 ownership 判断。
- Scan eligibility policy 已下沉到 `@talex-touch/utils/search` 的公共 `resolveIndexedScanEligibility()` / `toIndexedScanTimestamp()` SDK primitive：统一根据 watch roots、completed scan rows、auto scan interval 与当前时间计算 `newPaths`、`stalePaths` 和 `lastScannedAt`。FileProvider watch service 仍负责读取真实 `scan_progress` 表和 auto-scan 设置，只把 source-agnostic eligibility 计算交给 SDK；后续 Obsidian/VSCode/Browser Bookmarks 等 source 可以复用同一“新 root / 过期 root / 最近扫描时间”策略。
- Write flush executor/runtime scheduler 已下沉到 `@talex-touch/utils/search` 通用 primitive：`IndexedWriteFlushExecutorService` 统一处理 buffer take/rollback/commit、readiness gate、capacity wait、persist delegation、duration recording 与 source-agnostic result metadata；`IndexedWriteFlushRuntimeService` 统一处理 flush timer、unavailable/no-pending/flush-in-progress idle 记录、in-progress defer、失败 retry 调度与成功后的 drain remaining。CoreApp 仅保留兼容 re-export；FileProvider 的 `FileProviderIndexRuntimeService` / `FileProviderIndexFlushExecutorService` 现在只保留 File flush result 映射、SQLite busy metadata、worker-not-ready 日志、`persistAndIndex` 注入与 evidence 映射，DB persist / SearchIndex worker / FTS 语义仍留在既有边界。
- Path-record write planning 已下沉到 `@talex-touch/utils/search` 的公共 `IndexedWritePlanService` SDK primitive：统一处理 incoming path records 的 insert/update/unchanged 拆分、timestamp tolerance、normalized manual summary，并允许 source 注入 update-record shaping。CoreApp 仅保留兼容 re-export；FileProvider 的 `FileProviderIncrementalWritePlannerService` 现在只保留 File row update 字段适配。该 primitive 只面向 File、Obsidian、VSCode 这类路径型 source，Browser Bookmarks/History 等非路径 source 不应强套这套 diff 模型。
- Insert executor 已下沉到 `@talex-touch/utils/search` 的公共 `IndexedWriteInsertExecutorService` SDK primitive：统一处理空批次跳过、persist delegation、inserted row dispatch 与 inserted count 日志，不依赖 SQLite、SearchIndex 或 File row 类型。CoreApp 仅保留兼容 re-export；FileProvider 现在直接消费 SDK executor，并只注入 File persistence 与 side-effect dispatch。
- Delete executor 已下沉到 `@talex-touch/utils/search` 的公共 `IndexedWriteDeleteExecutorService` SDK primitive：统一处理 raw path normalize/dedupe、existing record lookup、record deletion delegation、`removeIndexedArtifacts` cleanup hook 与 deleted ids/paths result，不暴露 SearchIndex 命名。CoreApp 保留兼容 wrapper 适配旧 `removeSearchIndexItems` deps，FileProvider / cleanup / reconciliation delete flows 继续注入各自 File 专属 cleanup wiring。
- Update executor 已下沉到 `@talex-touch/utils/search` 的公共 `IndexedWriteUpdateExecutorService` SDK primitive：统一处理 update records 分块、chunk 前等待、逐条 update delegation、updated row refresh、side-effect dispatch 与 chunk duration logging；SDK 仅定义 `runQueue(chunks, handler, options)` 注入协议，不绑定 CoreApp adaptive queue。CoreApp 仅保留兼容 re-export；FileProvider 现在直接消费 SDK executor，并继续注入 File 专属 backpressure 与 adaptive queue 策略。
- Worker result 到 persist payload 的映射已下沉到 `@talex-touch/utils/search` 的公共 `IndexedWorkerPersistEntryMapperService` SDK primitive：统一处理 progress null-normalization、fileUpdate contentHash 默认值、embedding model/vector 投影与泛型 `indexItem` 透传，不依赖 CoreApp SearchIndex worker 类型。CoreApp 仅保留兼容 re-export；FileProvider 的 `FileProviderIndexPersistEntryMapperService` 现在只是 File worker result 的薄适配，后续 source worker 可以复用同一 persist-entry 映射规则。
- Post-write side-effect dispatch 已下沉到 `@talex-touch/utils/search` 的公共 `IndexedWriteSideEffectService` SDK primitive：统一处理写入后的 extension processing 与 indexing scheduling，extension 处理异步失败不会阻塞 index worker 调度，且 source-specific failure 文案可注入。CoreApp 仅保留兼容 re-export；FileProvider 的 `FileProviderWriteSideEffectService` 现在只保留 File extension processing、index scheduling 与 File 专属日志文案。
- Worker dispatch scheduling 已下沉到 `@talex-touch/utils/search` 的公共 `IndexedWorkerSchedulerService` SDK primitive：统一处理 worker context gate、chunk dispatch、deferred dispatch 与 worker failure isolation，不依赖 CoreApp worker 类型。CoreApp 仅保留兼容 re-export；FileProvider 的 `FileProviderIndexSchedulerService` 现在只保留 File row 到 worker payload 的映射和 large-file background-content 策略。
- Worker status diagnostics snapshot 已下沉到 `@talex-touch/utils/search` 的公共 `IndexedWorkerStatusSnapshotService` SDK primitive：统一处理 worker state summary、短 TTL cache、并发 snapshot load 去重与失败不缓存。FileProvider 的 `FileProviderWorkerStatusService` 现在只是 File worker status 类型的兼容薄封装，真实 worker status loader、worker readiness 与 SearchIndex/FTS 语义仍留在 CoreApp/FileProvider 边界。

当前限制：

- `SearchIndexStoreAdapter` 已提供 SQLite/SearchIndexService 最小接入；现有 App/File provider 内部仍保留各自 DB/worker 写入路径，待逐步迁移到 runtime store 边界。
- App source 的 scan/reconcile/watch 已通过 runtime lifecycle 调度现有 AppProvider 维护任务，且已输出平台子来源 evidence；Windows scanner 已能按子来源返回 records，AppProvider evidence 已优先使用 scanner grouped scan result，DB metadata 仅作为 fallback；App scan 已能产出 `IndexedSourceRecordBatch` 并由 runtime store adapter 消费，watch delta 已开始返回 runtime store 可直接消费的 `record` / `stableKey`，全局 App watcher 事件入口已从 AppProvider 私有订阅迁到 SearchEngineCore runtime bridge，App reconcile 已返回真实增改删/跳过/错误统计；AppProvider 内部 DB 写入、pending deletion、mdls 与关键词同步后处理逻辑仍保留在 provider 内部。
- File source 的 scan/reconcile/watch/clear 已通过 runtime lifecycle 调度现有 FileProvider 任务，scan 已开始 yield `IndexedSourceRecordBatch`，watch delta 已开始返回 runtime store 可直接消费的 `record` / `stableKey`，全局 File watcher 事件入口已从 FileProvider 私有订阅迁到 SearchEngineCore runtime bridge，reconcile 结果已开始使用 FileProvider 索引运行的真实统计；但 worker scan、index worker、incremental queue、scan_progress 表结构与 FTS/SearchIndex 真实写入语义仍在 FileProvider 内部。
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
- 已开始：ScanScheduler 已补 batch scan result 统计与 source-level failure isolation，`scanSourcesWithResult()` 可返回成功 source、失败 source、batches、records 与 error 摘要；单 source `scanSource()` 仍保留显式失败语义。IndexingRuntime 已为 scan diagnostics 写入 `jobId/queuedAt`，覆盖单源 scan、批量失败与 skipped source，使 Settings/trace 可以区分多次 scan 执行。
- 已开始：WatchEventRouter 已补 source handler / store delta failure isolation 与 route result 统计，并将 applied delta、handler/store failure 与 skipped source 写入 `lastWatch.jobId/queuedAt` diagnostics。
- 已开始：ReconcileEngine 已补 batch reconcile result 统计与 source-level failure isolation，`reconcileSourcesWithResult()` 可返回成功 source、失败 source、增改删跳过/error 统计与 failure 摘要；单 source `reconcileSource()` 仍保留显式失败语义。
- 已开始：ReconcileEngine 已支持 source 在 `IndexedSourceReconcileResult.deltas` 中返回可应用补漏变更，并通过同一个 runtime store adapter 写入/删除索引；delta 写入失败会记录 `appliedDeltas` / `failedDeltas` / `deltaErrors`，不再让补漏只停留在统计层。
- 已开始：IndexingRuntime 已将最近 scan/watch/reconcile/reset result 合并进 diagnostics snapshot，作为 Settings/trace 后续展示的 source-level task evidence；四类任务都带 runtime `jobId/queuedAt`，并进入 bounded in-memory `recentTasks` 历史，但目前仍是内存态记录，尚未升级为 durable job history。
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
- 已开始：插件 `manifest.searchProviders` 加载契约已接入。CoreApp 会把显式声明转换为 runtime descriptor，校验 `search.root-results` 等 manifest 权限；旧 `push: true` feature 会派生兼容 provider 并输出迁移 warning，缺权限或 policy blocked 的 provider 不暴露给后续 registry。
- 已开始：Search Provider Registry 已抽出 core indexed source + 插件 `searchProviders` 聚合 helper，Settings provider-config response 会同时返回 core 与插件 provider。禁用 push 型插件 provider 会拦截该 provider 后续 root-result push/update；多 push feature 插件可通过 provider `featureId` 与 item `meta.featureId` 自动映射到 `meta.searchProviderId`，`boxItems.update()` 会基于已有 item 的 provider id 判断启停，避免同插件一个 provider 被禁用时误伤其它 enabled provider。BoxItemManager 在 sync / batch upsert 时按 provider config 过滤 disabled provider 并按 order 排序已有 push 结果，Settings 保存配置后会主动刷新 root item sync。
- 已完成：当前仓库 18 个 push 插件均已补显式 `manifest.searchProviders`。Browser Data、手动收藏/Quicklinks、浏览器打开/网页搜索、片段搜索/保存/管理、翻译/多源翻译、系统动作、窗口管理/预设、Snipaste、批量重命名、开发工具箱、程序员工具、Emoji 与符号、文本工具、剪贴板历史、智能问答、工作区脚本都进入 Settings provider 开关与排序，不再依赖 legacy `push: true` 自动派生 provider。
- 已完成：`pnpm plugins:validate` 已识别 `search.root-results` / `fs.index` 权限，并会对仍有 `push: true` 但未声明 `manifest.searchProviders` 的插件输出 search provider migration warning 与覆盖率摘要。该检查当前只做迁移可见性，不作为 hard gate；截至 2026-05-30，18 个 push 插件中已有 18 个显式 provider，迁移 warning 清零。
- 已开始：SDK 补了 Quicklinks、Browser Bookmarks、Browser History 与 System Settings 的 descriptor template factory，固定 owner、permission scope、storage、privacy、capabilities 与 clear/rebuild 语义，作为新增 source 的 admission 样板；这一步不注册 runtime source，也不宣称 Quicklinks/Browser Data/System Settings 已具备完整索引、watch、clear/rebuild 或 UI 管理能力。
- 已开始：SDK 与 CoreApp loader 已支持 `manifest.indexedSources` metadata-only 解析，能把官方插件 indexed source intent 暴露为插件状态并输出 `INDEXED_SOURCE_*` diagnostics；`touch-browser-data` 已声明 `browser-bookmarks` lifecycle intent，带 `fs.read` / `fs.index` / `search.root-results` 权限边界，但仍不会因此自动读取浏览器文件或注册真实 indexed source。
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
- 已开始：File watch delta 已从 path-only 事件推进到 add/change 返回 `record`、delete 返回 `stableKey/path`；watch path normalize 与平台默认 watch depth 已抽到通用 `normalizeIndexedWatchPath()` / `getIndexedWatchDepthForPath()`，watch roots 合并、ownership 与 pending permission root 过滤已抽到通用 `resolveIndexedWatchRootSet()` / `isIndexedWatchPathOwned()` / `filterIndexedWatchPendingPermissionPaths()`，auto scan eligibility 的 new/stale root 与 lastScannedAt 计算已抽到通用 `resolveIndexedScanEligibility()`，`FileProviderPathService` 与 `FileProviderWatchService` 现在只保留 CoreApp 平台类型、真实 watcher、配置持久化、scan_progress 读取与 pending path 读取适配；watch delta 的 path 合并、delete 覆盖、prepare-flush gate 与串行 flush 调度已抽到通用 `IndexingWatchDeltaQueueService`，`FileProviderIncrementalQueueService` 现在只保留 File 语义适配和 `manual` 标记合并；增量 delete 的 path normalize、existing-row lookup、DB delete、SearchIndex remove 与成功日志编排已抽到通用 `IndexedWriteDeleteExecutorService`，reconciliation 删除也开始复用同一 executor 的 resolved-record 删除入口；reconciliation worker reconcile 与 main-thread fallback diff 已拆到 `FileProviderReconciliationDiffService`，统一产出 added/updated/deleted 计算结果；existing-root reconciliation 的 DB row read、directory scan、diff orchestration、delete/update/insert delegation、progress、stats 与 completed-path reporting 已拆到 `FileProviderReconciliationRunService`；reconciliation delete/update 的 source-level delta emission 与 changed/deleted result reporting 已拆到 `FileProviderReconciliationDeleteService` / `FileProviderReconciliationUpdateService`，FileProvider 只注入现有 delete/update executor 与 record mapper；stale watch-root cleanup 已拆到 `FileProviderCleanupDeleteService`，复用同一 delete executor 形状并注入 files-table delete、embedding cleanup、`scan_progress` cleanup、SearchIndex removal 与 cleanup progress；full scan root scanning、scan progress、event-loop yield、file-row payload mapping、insert delegation 与 completed-path reporting 已拆到 `FileProviderFullScanRunService`；full scan insert/upsert 的 AIMD batch、idle pacing、side-effect、record batch、progress 与 added 统计已拆到 `FileProviderFullScanInsertService`；reconciliation add 的 chunk/upsert、side-effect、record batch、delta 与 progress 编排已拆到 `FileProviderReconciliationInsertService`，`upsertSearchIndexFiles` 与 source delta 语义保持注入；增量 add/change 的 record build、existing lookup、insert/update 执行与 manual summary 编排已拆到 `FileProviderIncrementalWriteService`；insert/update/unchanged/manual summary 规划已抽到通用 `IndexedWritePlanService`，`FileProviderIncrementalWritePlannerService` 只保留 File row update record 适配；增量 insert/upsert 的 persist callback、side-effect dispatch 与成功日志已抽到通用 `IndexedWriteInsertExecutorService`；分块 update 的 idle/capacity wait、逐条更新、刷新 updated rows、side-effect dispatch 与进度日志已抽到通用 `IndexedWriteUpdateExecutorService`；insert/update 后的 keyword/icon extension 处理与 content indexing 调度已抽到通用 `IndexedWriteSideEffectService`，`FileProviderWriteSideEffectService` 现在只保留 File 命名适配；index worker context gate、chunk dispatch、deferred dispatch 与 failure isolation 已抽到通用 `IndexedWorkerSchedulerService`，`FileProviderIndexSchedulerService` 现在只保留 file row 到 worker payload 的映射和 large-file background-content 策略；index worker result 到 `PersistEntry` 的 progress/fileUpdate/indexItem 映射已抽到通用 `IndexedWorkerPersistEntryMapperService`，`FileProviderIndexPersistEntryMapperService` 现在只保留 File worker result 适配；worker status summary、短 TTL cache、并发 status load 去重与失败不缓存已抽到通用 `IndexedWorkerStatusSnapshotService`，`FileProviderWorkerStatusService` 只保留 File worker status loader 适配；index worker flush 的 backlog delay、sqlite-busy retry、exponential backoff、jitter 与失败 retry reason 决策已抽到通用 `IndexedWriteFlushRetryService`，`FileProviderIndexFlushRetryService` 只保留 SQLite busy 分类与 FileProvider reason 映射；index worker flush 执行、worker readiness gate、DB backpressure、persistAndIndex、commit/rollback 与耗时记录已抽到通用 `IndexedWriteFlushExecutorService`，并开始返回 source-agnostic `reason` / `error` / `metadata`；flush timer、in-progress guard、idle snapshot、失败 retry scheduling 与成功后的 drain remaining 已抽到通用 `IndexedWriteFlushRuntimeService`，`FileProviderIndexRuntimeService` 只保留 FileProvider 返回语义、状态映射与日志适配；最近 flush snapshot 已抽到通用 `IndexedWriteFlushSnapshotService`；pending/inflight buffer 的 enqueue、take、commit、rollback 与 size 统计已抽到通用 `IndexedWriteBufferService`，`FileProviderIndexFlushBufferService` 只保留 fileId 适配；`file-provider:index-flush` evidence 暴露 flushed / worker-not-ready / failed、pending/inflight、retry reason、error 与 duration；真实 watcher 注册、DB insert/update/delete SQL、内部文件表 persist、flush trace wiring 与 FTS 写入/删除语义暂时保留在 FileProvider/SearchIndex worker 边界。
- 已开始：File Index progress ETA 核心算法已从 `FileProviderProgressEstimatorService` 提升到通用 `IndexingProgressEstimatorService`，progress stream 节流已从 `file-provider-progress-stream-service` 提升到通用 `IndexingProgressStreamService` helper；FileProvider 只保留 `FileIndexStage` / `FileIndexProgress` 适配。ETA 继续优先按 stage-local smoothed throughput 估算，并在冷启动、低进度、阶段切换、进度回退与 terminal stage 时隐藏或归零；当同一 stage 内 elapsed progress 足够稳定但速度样本不足时，使用 conservative fallback，避免首次大索引长时间显示“正在估算”。同时新增 `estimateStatus` / `speedSampleCount` / `estimateBasis` 可选字段，Settings 可在 `stabilizing` 时显示“正在估算剩余时间”，在 `stalled` 时显示等待新进度，而不是继续展示过期 ETA。推流节流继续保留 first payload、terminal stage、max silence、min interval 与 current/progress/total step guard。
- 已开始：File indexed source 已提供 `getProgress()`，runtime diagnostics 会透传为 `IndexedSourceDiagnostics.progress`；Settings source diagnostics 已渲染统一 progress chip，覆盖 estimated / stabilizing / stalled / complete / failed 等状态，并复用同一 tone 与 i18n helper，避免继续把 FileProvider 私有进度 UI 当作唯一用户可见入口。
- 已开始：File reconcile 已从 FileProvider 索引运行中透传真实 added/changed/deleted/skipped/errors 统计，覆盖新 root full scan、existing root reconciliation 与 stale cleanup 删除；existing root reconciliation 的 add/change/delete 也会进入 `IndexedSourceReconcileResult.deltas`，由 ReconcileEngine 统一应用到 runtime store。
- 已开始：File source evidence 已补 `file-provider:scan-progress`、`file-provider:integrity` 与 `file-provider:index-flush`，把 scan_progress pending/failed/completed 汇总、watch root pending permission、FTS/files row count、integrity-triggered reset、orphan keyword cleanup、index worker flush backlog、worker-not-ready 与 persist failure 暴露进统一 diagnostics，而不是只留在 FileProvider 日志；File source roots 已把 FileSystemWatcher pending paths 映射为 `permissionState: "promptable"` 与 `file-index-watch-root-pending-permission` reason，供 runtime root guard 跳过未授权 root；SDK 新增 `IndexedSource.shouldHandleWatchEvent()` ownership hook，`WatchEventRouter` 会把拒绝的 path 记录为 `source-watch-filtered`；FileSystemWatcher pending path 恢复时会发出 `FILE_WATCH_ROOT_RECOVERED`，SearchEngineCore 先用 File source ownership 过滤，再对 FileProvider watch root 触发 `IndexingRuntime.reconcileSource("file-provider", { reason: "file-watch-root-recovered", roots: [recoveredRoot] })`，runtime `lastReconcile` 会记录补漏 reason 与 rootCount 并展示到 Settings/CoreBox diagnostics task chip；progress evidence 的 ready/warming/degraded/permission-required 状态与 reason 判定已下沉到 `IndexedSourceProgressEvidenceService`，completed-root summary、delete skip、upsert readiness gate 与 upsert result 已下沉到 `IndexedSourceProgressStoreService`，scan_progress 表 select/delete/upsert worker wiring 与 File metadata 映射留在 `FileProviderScanProgressService`；completed-root 读取、new full-scan path selection、reconciliation path selection 与 strategy logging 已拆到 `FileProviderScanStrategyService`；FTS/files row-count 对比、reset/cleanup decision、duration 与 snapshot 映射已下沉到 `IndexedSourceIntegrityService`，FileProvider 只保留 FTS/files row count 查询、runtime reset 注入与 orphan `keyword_mappings` cleanup。
- 已开始：FileProvider manual rebuild、schema migration 与 integrity mismatch 的 `scan_progress` / provider-index reset 已收束到 `FileProviderRuntimeResetService`，并复用 `IndexedSourceResetExecutorService` 编排 reset steps、search-index/source-progress cleanup decision、timestamp 与 SDK 标准 `IndexedSourceResetResult`；FileProvider 只注入 provider search-index cleanup 与 File 专属 `scan_progress` row count/delete wiring，为后续 Browser Bookmarks / Quicklinks 的 source-local reset 复用同一 executor 做准备。
- 已开始：SDK 新增 `IndexedSourceResetRequest` / `IndexedSourceResetResult` 与 `IndexedSource.resetIndex()`；CoreApp 新增 `IndexingRuntime.resetSourceRuntimeState()` 并记录带 `jobId` / `queuedAt` 的 `lastReset` diagnostics。`clearSearchIndex` 已收束到 runtime store boundary：runtime 会先通过 `IndexStoreAdapter.clearSource(sourceId)` 清共享 SearchIndex，再把 `clearSearchIndex: false` 传给 source-local `resetIndex()`，避免 File / Browser Bookmarks / 后续 Quicklinks source 各自重复持有 SearchIndex 清理逻辑。设置侧已通过 `settings.indexedSource.reset/reconcile/scan/getDiagnostics` 暴露通用 typed SDK，维护动作只接收 `sourceId` 与标准 reason，避免继续扩散 provider-specific settings IPC。该语义区别于 `clearIndex()`：reset 是清运行时索引状态并让后续 scan/reconcile 修复，不等价于用户级清空或完整重建。
- 已开始：SearchEngineCore 初始化 runtime 后向 FileProvider 注入 indexed-source reset delegate；FileProvider manual rebuild、schema migration 与 integrity mismatch reset 会优先走 `IndexingRuntime.resetSourceRuntimeState("file-provider", { reason })`，无 delegate 时才 fallback 到内部 helper，避免 FileProvider 直接 import runtime 造成依赖环。
- 待继续：scan worker、incremental DB persist、index worker flush trace、FTS 写入语义、scan_progress 表实现和 integrity-triggered runtime reset 的 durable job history 继续从 FileProvider 内部拆到 runtime task/store 边界；File scan、watch route、watch-root recovery 与 reset 已具备 `jobId/queuedAt` 用户可见 task evidence，后续再提升为完整 durable job history。
- 已完成：Everything 改为读取 runtime root policy 做 path filtering；无 File source roots 时 fail-closed，并记录 `indexing-root-policy-file-roots-empty` 等原因。

验收：文件新增/修改/删除可及时反映；reconcile 修复丢事件；Everything fallback/path filtering reason 进入普通 search trace。

### Phase 4 - Browser bookmarks indexed source

- 已开始：新增 `BrowserBookmarksIndexedSource` runtime skeleton，先只提供 descriptor/admission/health/evidence/reconcile skipped 结果，不改变 `touch-browser-data` 插件即时搜索行为。
- 已开始：从 `touch-browser-data` 插件逻辑抽出 CoreApp 纯 scanner，覆盖 Chrome / Edge / Brave / Arc profile discovery、Chromium `Bookmarks` 解析、非 http(s) URL 过滤、URL 去重、read-failed/not-found/unsupported diagnostics，以及 bookmark 到 `IndexedSourceRecord` 的稳定映射。
- 已开始：`BrowserBookmarksIndexedSource` 在显式 enabled/test path 下可 yield `IndexedSourceRecordBatch` 并输出 browser root/evidence，health 会基于扫描结果进入 ready/degraded；reconcile 会把小全量扫描结果映射为 `IndexedSourceDelta` 交给 runtime store adapter；Bookmarks 文件 watch 事件会触发同一套小全量 refresh deltas；`resetIndex()` 会返回 source-level reset diagnostics，search-index 清理由 runtime store boundary 统一执行。默认 runtime 注册仍保持 disabled/pending migration，且 enabled 判断已拆到 `browser-bookmarks-source-config` 从统一 provider config 动态读取；只有 `browser-bookmarks` 或官方 `touch-browser-data.browser-bookmarks` 被显式启用时才会扫描真实浏览器文件，避免 high privacy source 未经用户同意读取。
- 已开始：`touch-browser-data` 已声明官方 `touch-browser-data.browser-bookmarks` push provider，带 `root-results` / `browser-data` scope 和用户同意要求；同时已声明 metadata-only `browser-bookmarks` indexed source lifecycle intent，用于先固定 official-plugin / high privacy / disabled-by-default / fs.read+fs.index 边界。它仍是即时只读插件入口，尚未升级为 runtime-registered indexed source。
- `touch-browser-data` 从即时全量读 Bookmarks 升级为 indexed source。
- Chromium Bookmarks 写入 SQLite/search index。
- 接入用户设置、授权提示、持久化 rebuild / clear，并把 enabled source 的 Bookmarks 文件 watch 注册到真实 watcher roots。
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

当前 SDK 已提供 Quicklinks / Browser Bookmarks / Browser History / System Settings descriptor template，后续接入必须先复用模板，再补实际 source lifecycle、health/evidence、Settings enablement 与验收 evidence；不能只靠模板宣称 source 已完成。

## 9. 当前约束

- 不降级 `2.4.11` Windows/macOS release-blocking evidence 主线。
- 不引入 raw channel / legacy SDK bypass。
- 不绕过平台权限模型。
- 不把敏感数据写入 localStorage、明文 JSON、同步 payload 或日志。
- 不用 mock/内存 fallback 宣称生产完成。

## 10. 下一步建议

下一刀继续收口三件事：一是把 Browser Bookmarks 的 indexed enable/disable、授权提示、clear/rebuild 与 Bookmarks 文件 watch 小全量刷新迁到官方 browser-data 插件 provider，并让 metadata-only `manifest.indexedSources` 升级为真实 runtime registration；二是继续把 FileProvider 内部 worker 写入、incremental queue、scan_progress 与 FTS reset 迁向统一 task/store 边界；三是基于现有 descriptor template 补 Quicklinks/System Settings 的真实 source lifecycle，不要只靠模板宣称完成。
