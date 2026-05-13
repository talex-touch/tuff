# CoreApp 启动异步化与首屏卡顿分析（2026-05-13）

> 结论：当前启动并非完全同步，但主启动编排仍是“模块串行 await + renderer 首屏前 await gate”。因此会出现启动完成慢、首屏/交互晚、启动后短时资源争用三类体感卡顿。

## 背景

本报告记录 2026-05-13 对 CoreApp 启动链路的静态排查结果，用于后续拆分启动关键路径、降低首屏等待与后台任务争用。报告不代表已完成代码修复；当前只作为 `2.4.11+` 的性能/架构治理输入。

## 启动主链路

主入口位于：

- `apps/core-app/src/main/index.ts`
- `apps/core-app/src/main/core/startup-module-loader.ts`
- `apps/core-app/src/main/core/module-manager.ts`
- `apps/core-app/src/main/core/touch-app.ts`

当前核心流程：

```ts
app.whenReady().then(async () => {
  await enforceDevReleaseStartupConstraint()

  const touchApp = genTouchApp()

  await loadStartupModules({
    modules: modulesToLoad,
    loadModule: async (moduleCtor) => {
      return await touchApp.moduleManager.loadModule(moduleCtor)
    }
  })

  const rendererInitPromise = touchApp.waitUntilInitialized()
  await rendererInitPromise

  touchEventBus.emit(TalexEvents.ALL_MODULES_LOADED, new AllModulesLoadedEvent())
  pollingService.start()
})
```

`loadStartupModules()` 对 `modulesToLoad` 逐个串行 `await`，`ModuleManager.loadModule()` 又会串行等待 `created/init/start` 生命周期。因此任何一个模块的重 I/O、数据库迁移、worker 初始化或同步 FS 操作，都会拖住后续模块与最终 startup health。

## 主要问题

### 1. 主进程模块串行 await 过重

`modulesToLoad` 中存在大量非首屏必要模块，但都处在同一启动关键路径中，例如：

- `extensionLoaderModule`
- `analyticsModule`
- `sentryModule`
- `updateServiceModule`
- `systemUpdateModule`
- `intelligenceModule`
- `pluginModule`
- `authModule`
- `syncModule`
- `clipboardModule`
- `tuffDashboardModule`
- `downloadCenterModule`

其中很多模块只需要先注册 handler，重任务可延迟到首屏之后。

### 2. DatabaseModule 是最大启动卡点候选

文件：`apps/core-app/src/main/modules/database/index.ts`

`DatabaseModule.onInit()` 当前包含：

- 创建 SQLite client 与 Drizzle db
- 配置 PRAGMA
- 解析 migrations 目录
- 执行 Drizzle migrate
- 手动补表/补索引
- 初始化 aux DB
- 热表迁移到 aux DB
- WAL/health report 注册与启动期 health snapshot

特别是：

```ts
await this.initAuxDatabase(dirPath!)
this.registerWalMaintenanceTasks()
await this.reportDatabaseHealth('threshold')
```

`initAuxDatabase()` 可能触发 `migrateHotTablesToAux()`，复制 `clipboard_history`、`ocr_jobs`、`ocr_results`、`analytics_*`、`recommendation_cache` 等表。若用户本地数据较多，冷启动会被明显拖慢。

建议将数据库拆成：

- **critical path**：primary DB 打开、必须 PRAGMA、必须 migration、核心 schema ready。
- **background path**：aux DB 数据迁移、health report、WAL checkpoint、分析/剪贴板/OCR 热表迁移。

### 3. ExtensionLoader 明确阻塞

文件：`apps/core-app/src/main/modules/extension-loader.ts`

当前逻辑：

```ts
const extensions = fse.readdirSync(extensionPath)

for (const extension of extensions) {
  const loaded = await session.defaultSession.loadExtension(fullPath)
}
```

问题：

- `readdirSync` 是同步 I/O。
- extension 按顺序 `await loadExtension`。
- extension 非首屏刚需。

建议改为 onInit 只记录路径/注册必要状态，实际 extension load 走后台 fire-and-forget。

### 4. IntelligenceModule 非首屏刚需但完整 awaited

文件：`apps/core-app/src/main/modules/ai/intelligence-module.ts`

`onInit()` 中会注册 provider/capability/channel，并执行：

```ts
await this.setupAgentRuntime()
```

`setupAgentRuntime()` 会初始化 agent manager、workflow service、workflow tables 与模板 seed。AI agent/workflow 对主窗口首屏不是必要依赖，建议改为：先注册 transport handlers；agent/workflow runtime 后台 ready；handler 在未 ready 时返回 `initializing/degraded`。

### 5. Sentry/Update 等 telemetry 或更新任务不应阻塞首屏

- `apps/core-app/src/main/modules/sentry/sentry-service.ts`
  - `await this.hydrateTelemetryStats()` 属于非首屏 telemetry hydrate。
- `apps/core-app/src/main/modules/update/UpdateService.ts`
  - `loadSettings()` 包含同步读文件。
  - `await this.loadReleaseCache()` 属于启动期缓存 hydrate。

建议这些任务延迟到首屏之后，或以后台任务形式执行。

### 6. Search providers 启动后集中抢资源

`SearchEngineCore` 在 `ALL_MODULES_LOADED` 后加载 providers。虽然 `TouchEventBus.emit()` 不 await async handler，但 async handler 会同步执行到第一个 `await`，并在启动完成前后抢占资源。

重点候选：

- `EverythingProvider.onLoad()`：Windows 下会检测 SDK/CLI backend，CLI 可能对多路径 `es.exe -v` 执行带 timeout 的探测。
- `FileProvider.onLoad()`：当前会 `await this.searchIndexWorkerReady`，再 `await this.ensureFileSystemWatchers()`。

建议 provider 先注册 channel，backend/worker/watcher 后台初始化；搜索时未 ready 返回 degraded/partial result。

### 7. Renderer 首屏前存在额外 await gate

文件：`apps/core-app/src/renderer/src/main.ts`

当前 renderer mount 前会等待：

```ts
initializeRendererStorage(transport)
await appSettings.whenHydrated()

const router = await ensureRouter()
const i18n = await setupI18n(...)
const app = createApp(App)

await maybeInitializePluginStore()

app.mount('#app')
```

`maybeInitializePluginStore()` 会调用：

```ts
const pluginList = await pluginSDK.list()
```

主进程 `PluginEvents.api.list` 又会对每个插件读取 install source：

```ts
return await Promise.all(
  plugins.map((plugin) => serializePluginWithInstallSource(plugin))
)
```

因此 plugin list RPC + DB 查询会直接阻塞首屏 mount。建议把 plugin store 初始化移到 `app.mount()` 之后后台执行。

### 8. Renderer 与 main handler 存在启动竞态

`TouchApp` 构造时就开始 renderer load，但 `CommonChannelModule` / `StorageModule` handler 仍在后续模块加载中注册。renderer preload 会请求 `AppEvents.system.startup`，renderer storage 也会请求 `StorageEvents.app.getVersioned`。若 renderer 请求早于 handler 注册，可能出现 startup info 获取失败、storage 使用默认值假 hydration 的风险。

这需要后续在架构上明确：

- critical IPC/storage handler 先 ready，再启动 renderer hydrate；或
- renderer storage 对 `no handler` / early invoke failure 做 retry，不应直接视作 hydrated。

该点也关系到 Onboarding Rule：首次引导是否展示必须等待真实 storage hydration 完成后判定。

## 不建议的方案

不建议直接把全部模块改成：

```ts
await Promise.all(modulesToLoad.map(loadModule))
```

原因：当前模块存在隐式依赖、全局单例、`$app`、event bus 与 DB/storage/channel 初始化顺序要求。正确方向是 dependency-aware 的分阶段启动，而不是无依赖图的全量并发。

## 建议改造顺序

### P0：低风险首屏优化

1. `apps/core-app/src/renderer/src/main.ts`
   - 将 `maybeInitializePluginStore()` 从 mount 前移到 mount 后后台执行。
2. `AppEntrance/useAppLifecycle`
   - 避免将更新检查、dropper、plugin list 等非首屏任务塞进 `entry()` 前置链。

### P1：main 非首屏模块后台化

优先后台化：

- `ExtensionLoaderModule`
- `SentryServiceModule` telemetry hydrate
- `IntelligenceModule` agent/workflow runtime
- `UpdateServiceModule` cache load / updater setup
- `SystemUpdateModule`
- `SyncModule` auto sync
- `ClipboardModule` native watcher / OCR
- `DownloadCenterModule` worker / monitor
- `TuffDashboardModule`

建议模式：

```ts
onInit() {
  registerHandlers()
  setImmediate(() => {
    void this.startBackgroundRuntime()
  })
}
```

### P2：Database critical/background 拆分

保留 primary DB 与必须 migration 在 critical path，将 aux DB migration、health report、WAL checkpoint 转入后台。`getAuxDb()` 已具备 fallback primary DB 的基础，可作为后台化前提。

### P3：Search provider 后台 ready

- Everything backend detection 后台化。
- FileProvider search-index worker 与 filesystem watcher 后台化。
- provider load 不要被单个慢 provider 串行拖住。

## 最小 patch 候选

如果先做最小改动，建议顺序：

1. renderer plugin store 后台初始化。
2. ExtensionLoader 后台加载 extension。
3. EverythingProvider 后台检测 backend。

这三项风险低，且能较快改善“打开后卡住/白屏久/启动后短时卡顿”的体感。

## 后续验收建议

- 增加 startup benchmark 日志维度：模块 init/start 耗时、renderer mount 前耗时、storage hydration 耗时、plugin list RPC 耗时。
- 对比改造前后：
  - Electron ready → first window show
  - renderer script start → app mount
  - app mount → plugin list ready
  - all modules loaded → providers ready
- Windows/macOS 真机各取冷启动与热启动样本，避免只在 dev 环境验证。