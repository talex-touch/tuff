# 260109 Log Analysis / Perf Tracker（Core App Dev）

> 目标：把“启动卡顿/日志噪音/可复现问题”压缩成一个可持续维护的清单；已经解决的只保留结论与落点，不再堆大量证据。

## 最新一次（2026-01-10 日志）

### 现象（按体感影响排序）
- main event-loop 仍有明显卡顿：`[Perf:EventLoop] ... lagMs=2324`（启动期出现一次极值，后续还有 200~700ms 级别抖动）
- StartupAnalytics 网络不可达时刷屏（大量 `Retrying queued startup analytics later error=fetch failed`）
- `file-index:status/stats` 在启动早期被请求，但主进程此时还没注册 handler → `No handler registered`
- renderer 侧仍有 `sendSync.slow`：`storage:get`（例如 `account.ini` 689ms）
- AppProvider：全量扫描 + DB diff/update 仍偏重（3s 级），且成功路径被打成 `ERROR`（降低日志信噪比）

### 这次已落地的改动（用于“下一次跑日志验证”）
- `package.json`：`pnpm lint` / `pnpm lint:fix` 只 lint 代码文件（不再扫全仓库 Markdown/YAML/workflow 等）。
- `apps/core-app/src/main/core/touch-app.ts`：`app-ready` 只对主窗口记录 StartupAnalytics（避免多窗口覆盖/重复上报）。
- `apps/core-app/src/main/modules/clipboard.ts`：延后启动 `ocrService`（`setImmediate`），避免启动期同步初始化造成 event-loop 长阻塞。
- `apps/core-app/src/main/modules/analytics/startup-analytics.ts`：
  - renderer/main 任一侧先到都可完成 `totalStartupTime` 计算；
  - 指标完整后自动 `saveToHistory + reportMetrics`（只触发一次）；
  - report queue 失败增加 backoff + 汇总日志，避免刷屏。
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`：提前注册 `file-index:*` channels（并确保只注册一次），避免启动期 no-handler 噪音。

### 预期日志变化（未验证，等你本地再跑一次）
- 不再出现同一 `sessionId` 的多次 `Renderer process metrics recorded`（secondary windows 被忽略）
- `fetch failed` 不再触发“每条队列一条 warn”的刷屏；只会看到 flush 汇总
- `file-index:status/stats` 不再出现 no-handler

## 状态看板（持续更新）

| 主题 | 状态 | 备注 / 下一步 |
|---|---|---|
| 主进程 event-loop 卡顿（2s+ 极值） | 缓解中（待验证） | 已先把 Clipboard 里的 `ocrService.start()` 延后到 `setImmediate`；若仍有极值，重点继续看启动期重 IO/大循环：AppProvider DB 更新、FileProvider reconciliation，并用 Perf 事件打点定位具体段落 |
| StartupAnalytics 重试刷屏 | 已修复（待验证） | 已做：主窗口单次采集 + auto finalize + queue backoff |
| `file-index:*` no-handler | 已修复（待验证） | 已把 channel 注册前移到 `ensureFileSystemWatchers()` 之前 |
| renderer `sendSync.slow storage:get` | 待优化 | UI 侧尽量避免启动期 `sendSync`；可引入 renderer 本地缓存 + async channel（或 preload 注入一次性热配置） |
| AppProvider 扫描/DB 更新偏重 | 待优化 | 做“服务化 + 缓存 + single-flight + 增量更新”，并把成功耗时日志从 `ERROR` 调整为 `INFO/WARN(阈值)` |
| DevTools Autofill 协议噪音 | 可忽略/降噪 | 一般不影响功能；可考虑只在 debug 模式输出 |

## 模块优化建议（给下一轮做拆解）

### 1) 模块加载（启动期）
- 把“必须同步完成”与“可以后台完成”明确分层：`onInit()` 只做最小可用，重任务放 `start()/background task`。
- 对大循环/批量 DB 写：统一 batch + `setImmediate()`/`await` 让出 event-loop（避免 `Perf:EventLoop` 极值）。
- 对模块启动耗时做结构化打点：关键阶段（prepare/db/read/compute/write/watchers）都输出耗时，避免只看到“模块 loaded 2.5s”而不知道耗时段。

### 2) Analytics 模块（StartupAnalytics + AnalyticsModule）
- 上报层统一成“单一 reporter + 队列 + backoff”：不要在多个入口各自重试，减少重复 flush/重复 fetch。
- `app-ready` 只采集主窗口（已做），并显式区分 window role（main/metaOverlay/pluginSurface）避免未来再踩覆盖问题。
- dev 默认不主动上报：Nexus 未起时只入队/或直接跳过（可用 env 开关强制测试上报）。

### 3) “已安装应用/浏览器列表”服务化（建议落到 main 进程一个单例服务）

目标：把 AppProvider/AppScanner/URLProvider 里零散的“取已安装 app / 取浏览器”收口，给其它模块统一调用，并且有缓存、强制刷新、事件广播。

建议形态：
- 服务名：`InstalledAppsService`（或 `AppRegistryService`）
- 主进程 API（示例）：
  - `getAllApps({ forceRefresh?: boolean, includeSystem?: boolean })`
  - `getBrowsers({ forceRefresh?: boolean })`
  - `getAppByBundleId(bundleId)` / `getAppByPath(path)`
  - `refresh({ reason })`（manual / fs-event / schedule）
- 缓存策略：
  - 内存：TTL（例如 5min）+ single-flight（同一时间只允许一个全量扫描）
  - 失效：FileSystemWatcher 监听 `/Applications`、`~/Applications` → debounce 后触发增量 refresh
  - 强制刷新：给 URLProvider/Settings 提供“一键刷新”入口
- 输出一致性：
  - 统一应用类型判定（Browser/Editor/Terminal/…），其它模块只消费“分类结果”，不再各自写判断逻辑
  - 统一日志级别与耗时阈值（例如 >1s 才 WARN）
