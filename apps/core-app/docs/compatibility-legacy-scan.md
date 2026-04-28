# 兼容性/老旧代码扫描报告

本报告用于跟踪 core-app 中的兼容性、老旧与 deprecated/legacy 相关实现，按统一口径输出分类清单与复核记录。

## 扫描口径

- A. Deprecated/不推荐但仍在使用：显式标注 deprecated、legacy、obsolete 或类似说明，但仍在执行路径中。
- B. 兼容性/过渡性代码：用于版本门控、平台差异、旧协议/旧结构兼容或退路逻辑（fallback/shim/polyfill）。
- C. 其他老旧或风险项：不直接标注 deprecated/legacy，但呈现明显历史包袱或迁移残留的实现。

## 关键词清单（初版）

- deprecated
- legacy
- compat / compatibility
- shim
- fallback
- polyfill
- migration
- obsolete

## 搜索范围与原则

- 范围：`src/`、`resources/`、`scripts/`、`public/`、`docs/` 及相关配置文件。
- 形式：注释、JSDoc/TS 注解（含 `@deprecated`）、配置与脚本说明。
- 规则：关键词大小写不敏感；命中后需结合上下文判断归类。

## 2026-04-26 复核结论

### 已收口

- Flow Transfer 不再存在“未适配 target 假投递成功”：`flow-bus.ts` 会在目标插件未注册 delivery handler 时返回 `TARGET_OFFLINE`，真实投递异常也会保留为失败结果。
- 平台 capability 清单不再把条件型能力写成完全 supported：Flow Transfer、DivisionBox Flow trigger、macOS/Windows active-app 均显式标注为 `best_effort` 并带 `issueCode/reason/limitations`；过度乐观且已无生产调用的 `isActiveAppCapabilityAvailable()` 已删除。
- DivisionBox Session 已移除未调用且没有真实计时逻辑的 keepAlive timer 空 API；keepAlive 生命周期继续由 Manager 状态监听和 LRU cache 管理。
- macOS notification 检查不再把 `Notification.isSupported()` 解释为系统权限已授予；当前只能确认原生通知运行时可用，因此返回 `notDetermined + canRequest`。
- OmniPanel 键盘快捷键默认值已统一为关闭；主进程 settings snapshot、首次设置页、工具设置页与 `app-settings` 默认值保持一致，右键长按时长也有明确持久化配置。
- 已删除无引用的 Bluetooth/USB 旧实验注释文件、renderer layout 的 `useLayout` legacy alias，以及 File Provider 中旧主线程内容解析/索引 helper 的空调用保活路径；文件内容解析与索引统一走 worker 管线。
- Preview Provider / Preview Registry / Terminal / Protocol Handler / ServiceCenter 的 raw console、死协议注释、stale no-op 文案和敏感预览值日志已收口；ServiceCenter 无读取方的注册快照伪持久化路径已删除，后续日志只记录结构化元数据，不再输出搜索表达式、预览结果值或原始 service payload。
- DivisionBox CoreBox provider 已移除 `division-box:show-active-sessions` 伪命令；该结果此前只写日志、不打开任何用户可见界面，当前仅保留真实 shortcut mapping 搜索/执行路径。
- 已删除无引用且全文件仅剩注释的 screen-capture 主进程占位文件，并移除 renderer 中无人发送的 `@screen-capture` 注册函数；OfficialPluginService、FileWatchService、TuffIconImpl 的 raw console 调试输出也已切到结构化 logger。
- Renderer 插件状态按钮已从 `innerHTML`/手动 `classList`/mount-time watcher 改为 computed label/class/action；reload 失败不再直写 `console.error`。
- CoreBox Manager、SystemActions file-index、BuildVerification、FeatureSearchTokens 的小范围 raw console 已收口到 logger；SystemActions 不再对同一次 file-index 同时写 console 和结构化日志。
- 旧插件注入脚本不再输出 `Touch # Auto inject JS`，同文件未启用的 `#app` 样式注释块已删除。
- Download 外围模块的 raw console 已切到 `download/logger.ts` 统一 logger；数据库、切片、worker、通知、网络、性能、并发和错误日志器不再直接向主进程 console 输出任务/路径细节。
- DownloadCenter 主模块 raw console 已切到 `DownloadCenter` logger；初始化、销毁、任务批量操作、临时文件清理、transport handler 和通知点击均使用结构化日志，未引用的 `formatBytes()` 已删除。
- macOS/Windows 应用扫描和搜索后处理慢日志已切到 `AppScanner` logger；扫描失败不再直接输出完整 app/file 路径。
- BoxItemManager、插件 provider 工具、UsageStatsCache 与 TimeStatsAggregator 的 raw console 已收口到项目 logger。
- UsageStatsQueue、Recommendation ContextProvider 与 ItemRebuilder 的 raw console 已收口到项目 logger；搜索统计 flush 和推荐项 rebuild 的失败仍保持原有降级/回填语义，只改变日志出口。
- RecommendationEngine 主文件 raw console 已收口到既有 `RecommendationEngine` logger；provider 注册/卸载、缓存命中、候选统计、生成耗时和插件 provider 失败日志不再直接写 console。
- Storage polling/LRU/frequency monitor 的 raw console 已收口到 `Storage:Polling`、`Storage:LRU`、`Storage:Frequency` logger；周期保存、强制保存、驱逐和高频访问告警语义保持不变。
- Intelligence SDK、main i18n helper、PerfContext 与 SignatureVerifier 的 raw warn/error 已收口到项目 logger；AI 调用流程、i18n fallback、性能慢上下文告警和签名获取失败返回语义保持不变。
- SearchIndexService 与 search-index worker 的 raw console 已收口到 `SearchIndex` logger；索引摘要、慢批次、零结果诊断、初始化和 pinyin 预热不再直接输出 DB path 或 FTS 查询表达式。

### 仍保留的兼容边界

- Linux selection capture / active-app / auto-paste 仍依赖 `xdotool` 与桌面环境，属于 documented best-effort，不是待删除假实现。
- 旧启动/数据迁移主路径已在后续 hard-cut 中收口；当前保留的是 schema/runtime migration 与回归 fixture，不再作为 legacy startup migration exception。
- 插件 SDK hard-cut 已阻断旧插件运行；`enforcePermissions` 等字段仅作为 blocked 状态表达保留，不再代表旧 SDK bypass。
- 剩余主进程 `console.*` 命中均为有意边界：`utils/logger.ts` 是项目 logger 输出端，`internal-plugin-logger.ts` 是内部插件日志适配器，`SearchLogger`/`search-logger-test.ts` 是显式控制台诊断器，CoreBox/DivisionBox 里的命中是注入到 WebContents 的脚本错误输出。

## 2026-04-28 复核结论

### 当前结论

- CoreApp 生产路径没有发现新的 `FlowBus` silent success、DivisionBox 假命令、PluginStatus 命令式 DOM 回写、ServiceCenter 伪持久化或 macOS notification 权限误报回潮。
- Renderer storage 当前工作区已收口到 typed storage SDK：`main.ts`、`useAppLifecycle.ts`、`modules/channel/storage/base.ts` 统一调用 `initializeRendererStorage(transport)`；`StorageManager` 与 `AccountStorage` 改用 `useStorageSdk()`，不再直接 `transport.send(StorageEvents.app.*)` 或解析 legacy `useChannel()`。
- 当前 `rg` 复核显示 `window.$t/window.$i18n` 在 renderer 中无命中；旧 `storage:get/storage:save/storage:update` 在 CoreApp 业务侧无新增消费，剩余命中为插件 storage IPC 名称或共享库显式 fallback 边界。
- `show-active-sessions` 仅保留在 DivisionBox 回归测试的禁止断言中；`TARGET_OFFLINE` 仍覆盖未注册 Flow delivery handler 的失败语义。
- 应用详情页不再暴露无真实执行路径的 open explorer / uninstall / save/spec 入口；当前保留的 launch 与 help 均有真实执行路径。
- 跨平台能力仍是显式不对称：Windows/macOS 属于 2.5.0 release-blocking 人工回归范围；Linux 继续按 `xdotool` / desktop environment 依赖记录为 documented best-effort，不应包装为同等支持。

### 已清理

- 清理 storage renderer 入口中的重复 JSDoc 和旧 `console.log` 示例/注释，避免把已迁移到 typed storage SDK 的路径继续表现成半迁移状态。
- 删除仅剩测试引用的 `parseLegacyThemeStyle()` 旧 localStorage 解析 helper；renderer theme startup migration 已从生产路径移除，不再保留无调用方的 legacy 解析入口。
- 刷新 `compatibility-legacy-scan-summary.md` 的完成态汇总，移除已过期的 `tray-holder.ts` 与 deprecated Plugin API 风险描述，避免旧扫描清单误导当前结论。
- 清理 `AppConfigure.vue` 中仅剩注释/空 handler 的 open explorer、uninstall、save footer 与永远不会渲染的 spec 区块，避免旧应用详情页把未实现能力呈现为可用操作。

### 仍保留但不判为假实现

- `fake-background` / `--fake-*` 是既有视觉 token，不代表 mock 功能。
- `placeholder` 大多是输入框、骨架屏或空图标语义；当前未发现会把未完成能力伪装成已完成的正式入口。
- Plugin widget preview 的 `mockPayload` 属于开发面板显式测试载荷，不是生产 runtime mock。
- `SearchLogger`、logger 输出端、内部插件 logger、WebContents injected script 中的 `console.*` 是有意诊断/注入边界；普通主进程 runtime console 仍维持已收口状态。
