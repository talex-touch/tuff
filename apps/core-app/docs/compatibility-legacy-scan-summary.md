# 兼容性/老旧代码分类清单（当前汇总）

更新时间：2026-05-08

本文件是 `compatibility-legacy-scan.md` 的短汇总，用于避免历史扫描清单继续把已删除或已硬切的路径标为未处理风险。详细证据和分轮记录以 `compatibility-legacy-scan.md` 为准。

风险等级说明：low（影响有限/可控）、medium（可能影响兼容或数据）、high（可能引发破坏性行为）。

## 当前结论

- high：当前 CoreApp 生产路径未发现新的 silent success、假命令、伪持久化、旧 storage 业务消费或全局 i18n 入口回潮。
- medium：跨平台能力仍有真实不对称，Windows/macOS 是 2.5.0 release-blocking 人工回归范围，Linux 继续按 `xdotool` / desktop environment 记录为 documented best-effort。
- medium：Electron 宽松运行时边界已收口为命名 `WindowSecurityProfile`；主窗口/CoreBox/OmniPanel/Assistant/MetaOverlay 进入 app-grade baseline，插件 `WebContentsView` / DivisionBox 仍保留显式 `compat-plugin-view` 兼容 profile。
- medium：插件 SDK hard-cut 已在 loader / installer / permission guard 阻断不兼容 `sdkapi`；旧 raw channel 仅保留为明确抛错边界，不再作为可用兼容通道。`@main-process-message` / `@plugin-process-message` 已集中到内部 raw IPC adapter，业务侧新增裸 IPC 由 ESLint runtime boundary rules 拦截。
- medium：`compat-plugin-view`、raw IPC adapter 与 `window.touchChannel` 仍是显式白名单边界；本轮不做行为删除，只通过 ESLint runtime boundary rules / ESLint legacy-boundary rules 防止新增业务消费方。
- low：普通 fallback 多为输入默认值、展示兜底、schema/runtime migration 或诊断面，不等价于未完成能力。
- low：启动、平台和语言兼容层已进一步收口；renderer 不再依赖 Node 全局 `process`，Linux `best_effort`、分享/权限等真实能力不对称仍保留为 documented boundary 且带 `issueCode/reason/limitations`。

## 已收口高信号项

- Flow Transfer：未注册 delivery handler 时返回 `TARGET_OFFLINE`，不再把未投递目标包装成成功。
- DivisionBox：`division-box:show-active-sessions` 伪命令已删除，仅保留真实 shortcut mapping 搜索/执行路径。
- ServiceCenter：无读取方的注册快照伪持久化路径已删除。
- PluginStatus：插件状态按钮已改为 computed label/class/action，不再用命令式 DOM/`innerHTML` 回写状态。
- Storage renderer：CoreApp renderer 入口已改为 `initializeRendererStorage(transport)` / `useStorageSdk()`，业务侧不再直接消费旧 `storage:get` / `storage:save` / `storage:update`。
- Plugin system SDK：`getActiveAppSnapshot()` 不再在 typed transport 失败后回退到 raw `system:get-active-app`；主进程已停止注册该 raw handler，SDK 层失败会直接暴露。
- Startup bridge：preload 以 typed `StartupContext` 暴露 `startupInfo/windowMode/metaOverlay`，renderer 不再读 `window.$startupInfo` / `window.$isMetaOverlay` 或额外请求 startup transport。
- Language init：legacy `localStorage` 语言快照只在 hydration 后迁移一次，稳态语言解析只读 `appSetting.lang`。
- Plugin runtime drift：移除 `touch-translation` 运行期目录修补；插件加载前统一执行 runtime drift 检查，命中后稳定返回 `PLUGIN_RUNTIME_DRIFT`。
- DB write QoS：`DbWriteScheduler` 已删除 `droppable` 兼容选项，clipboard/OCR/usage-stats/query-completions 统一改为显式 `dropPolicy/maxQueueWaitMs`。
- Update install：renderer 不再把 `update:install` 超时当作 started，而是提示等待系统接管确认。
- Widget empty state：widget 容器已区分加载中、renderer 缺失和渲染失败，不再统一显示“暂未就绪”。
- Runtime console ESLint rules：新增 ESLint `no-console` rules 冻结 CoreApp runtime 的裸 `console.*` 边界；后续新增 raw console 或扩大命中数会直接失败。
- Runtime boundary ESLint rules：新增 ESLint runtime boundary rules，冻结宽松 WebPreferences、裸 `ipcRenderer/ipcMain`、raw IPC event string、`window.touchChannel`、`window.$t/window.$i18n` 与旧 `/api/sync/*`。
- Window security profile：`apps/core-app/src/main/core/window-security-profile.ts` 成为窗口安全配置唯一 profile 构造入口；插件 UI 与 DivisionBox 的宽松配置只能通过 `compat-plugin-view` 显式声明。
- Raw IPC substrate：`@main-process-message` / `@plugin-process-message` 已集中到 `apps/core-app/src/shared/ipc/raw-channel.ts`，renderer `window.touchChannel` 仅作为 deprecated bootstrap bridge 暴露。
- Intelligence Workflow i18n：`IntelligenceWorkflowPage.vue` 与 `useWorkflowEditor.ts` 的用户可见中文 toast、按钮、校验错误和默认 trigger/context label 已迁移到 `zh-CN/en-US` 资源，业务调用仍走 `useIntelligenceSdk` / `useAgentsSdk`。
- FileProvider diagnostics：两处临时 `[DEBUG]` 日志前缀和 DEBUG 注释已清理，保留 `logDebug` 诊断语义且不改变索引调度。
- Platform capability：macOS Automation、Windows PowerShell、Linux `xdotool`、native share mail-only 与 permission deep-link 均有 focused regression，确保 degraded/unsupported path 必带可读原因和限制说明。
- Sync b64 migration payload：`b64:` pull fallback 仍只读迁移；命中后通过 dirty queue 触发下一次 encrypted repush，测试固定该行为。
- Theme startup：仅剩测试引用的 `parseLegacyThemeStyle()` 已删除。
- Application detail：旧应用详情页不再展示 open explorer / uninstall / save/spec 等无真实执行路径的假动作，对应无调用 i18n 文案键也已清理，保留 launch 与 help 两个真实动作。
- Download center：未引用且含“功能待实现”按钮的旧 `DownloadSettings.vue` 已删除；下载组件目录内全局 `$t(...)` 与硬编码中文模块/优先级/时间文案已收口到 `useI18n()` 资源。
- Plugin WebView：陈旧 debug 注释和硬编码加载/失败操作文案已清理，WebView 故障日志不再直接打印完整 plugin 对象。
- Tray：旧 `src/main/modules/tray-holder.ts` 已不存在，当前实现是 `src/main/modules/tray/tray-manager.ts`。

## 仍保留但不判为假实现

- `fake-background` / `--fake-*` 是视觉 token，不代表 mock 功能。
- `placeholder` 主要是输入框、骨架屏或空图标语义；未发现把未完成能力伪装成完成入口的命中。
- Plugin widget preview 的 `mockPayload` 是开发面板显式测试载荷，不是生产 runtime mock。
- 插件 `compat-plugin-view` 与 DivisionBox `compat-plugin-view` 是当前兼容 profile，不代表恢复 legacy SDK channel；`channel.raw` / `channel.sendSync` 仍保持 hard-cut 抛错。
- `preload` 的 debug console 仅由 `DEBUG` / `debug-preload` 显式打开；`SearchLogger`、logger 输出端、内部插件 logger、WebContents injected script 的 `console.*` 属于诊断/注入边界。
- 数据库、下载、权限等 schema/runtime migration 是本地数据演进路径，不能按关键词直接删除。
- 当前仍登记 3 个 core-app migration exception：`permission-store.ts` 的 JSON->SQLite read-once migration、`app-root-path.ts` 的 marker-gated dev root migration、`theme-style.ts` 的 localStorage read-once cleanup。退场前必须有 targeted regression 与 retained-user upgrade evidence，且不得扩散为新的 writable SoT。
- 13 个 core-app size-growth exception 不在本轮做大重构；优先后续小任务为 `clipboard.ts`、`search-core.ts`、`plugin-module.ts` 的职责边界拆分。
- 搜索、AI provider、i18n、icon 等 fallback 是真实兜底或错误恢复；后续只在出现 false-success 或隐藏降级时收口。

## 陈旧清单复核

- 旧汇总曾列 `src/main/modules/tray-holder.ts` 为 legacy tray holder；当前文件已不存在。
- 旧汇总曾把 `clearItems/pushItems/getItems` 作为 deprecated Plugin API 风险；当前源码中的 `boxItems.pushItems/getItems` 是运行时 SDK 对 BoxItemManager 的正常封装，旧 raw channel `channel.raw` / `channel.sendSync` 已改为 hard-cut 抛错。
- 旧文档曾把 active-app 映射写成 raw `system:get-active-app`；当前真实事件为 typed `app:system:get-active-app`，SDK 不再做 raw fallback。
- 权限中心的 historical/deprecated grant 文案只表达历史授权记录被禁用，不代表旧 SDK bypass 仍可运行。
