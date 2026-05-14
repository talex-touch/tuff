# 变更日志

> 更新时间: 2026-05-14
> 说明: 主文件仅保留近 30 天（2026-04-14 ~ 2026-05-14）详细记录；更早历史已按月归档。

## 2026-05-14

### docs(plan): index 04-implementation draft status

- `docs/plan-prd/04-implementation/README.md`
- `docs/plan-prd/TODO.md`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
  - 新增 `04-implementation` 目录级状态索引，逐项清点 17 个实施文档，并标注 `当前参考 / 历史参考 / 待重写 / Runbook / 参考资料` 有效边界。
  - 将 `04-implementation` Draft 清点子项关闭；抽样复核 `docs/INDEX.md` 与 `docs/plan-prd/README.md` 的本地 Markdown 链接目标均存在；第二批历史文档头标仍保留未完成，文档治理总项不整体关闭。
  - 验证：文档改动，无运行时代码变更；`git diff --check` 通过。

### feat(store): polish plugin marketplace cards and install feedback

- `apps/core-app/src/renderer/src/components/store/StoreItemCard.vue`
- `apps/core-app/src/renderer/src/components/store/StoreHeader.vue`
- `apps/core-app/src/renderer/src/components/store/StoreInstallButton.vue`
- `apps/core-app/src/renderer/src/modules/install/install-manager.ts`
- `apps/core-app/src/renderer/src/modules/store/providers/nexus-store-provider.ts`
  - 插件市场卡片增加边框、灰底层次、放大图标、两行简介与 hover Popover 全量介绍；底部统一展示下载量、收藏、作者、版本与安装按钮。
  - 市场顶部补充搜索 icon、类别下拉筛选与安装状态筛选；安装进度按钮补齐圆环进度表现。
  - 插件安装完成/失败在窗口不可见或未聚焦时通过 Notification SDK 发送系统通知；Nexus provider 继续走 `/api/store/plugins/:slug/download.tpex` 统计入口。
  - 已验证：插件市场相关 ESLint 与 `pnpm -C "apps/core-app" exec vue-tsc --noEmit -p tsconfig.web.json --composite false --pretty false` 通过。

### docs(plan): add TLDR layered entrances for governance docs

- `docs/plan-prd/03-features/SEARCH-REFACTOR-PRD.md`
- `docs/plan-prd/04-implementation/TuffTransportMigration260111.md`
- `docs/plan-prd/03-features/division-box-prd.md`
- `docs/plan-prd/TODO.md`
  - 为 Search、Transport、DivisionBox 三份历史主文档补齐状态头标、TL;DR、当前边界与追溯入口，避免旧方案被误读为当前执行 gate。
  - 复核 Telemetry 主文档已是压缩版 TL;DR 入口；四个专题的分层模板子项已关闭，第二批历史文档头标、`04-implementation` Draft 清点与链接抽样仍保留未完成。
  - 验证：文档改动，无运行时代码变更；`git diff --check` 通过。

### perf(core-app): tighten CoreBox search and layout motion

- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useResize.ts`
- `apps/core-app/src/renderer/src/views/box/CoreBox.vue`
- `apps/core-app/src/renderer/src/components/render/BoxGrid.vue`
- `apps/core-app/src/renderer/src/components/render/CoreBoxFooter.vue`
  - CoreBox 搜索输入 debounce 从 80ms 降到 30ms，插件/DivisionBox input change 广播独立降到 25ms，减少输入到结果更新的等待感。
  - 结果高度 settled 二次布局从 220ms 缩短到 100ms，降低窗口高度补动的滞后感。
  - 移除 Grid item 默认 600ms stagger/blur/scale 入场动画，缩短结果切换、新列表项、Footer 与预览压缩宽度过渡，保持搜索交互更干脆。

### fix(core-app): keep app update prompts out of CoreBox

- `apps/core-app/src/renderer/src/AppEntrance.vue`
- `apps/core-app/src/renderer/src/modules/hooks/useUpdateRuntime.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useUpdateRuntime.test.ts`
- `apps/core-app/src/renderer/src/components/base/AppUpgradationView.vue`
- `apps/core-app/src/renderer/src/components/download/UpdatePromptDialog.vue`
  - App update availability remains a main-window concern: CoreBox / DivisionBox no longer inherit the root `has-update` class, so the small search entry will not show the titlebar update indicator.
  - `useUpdateRuntime` now guards update listener registration, manual checks, and update dialog presentation behind the main-window role, preventing broadcast update events from opening prompts in lightweight renderer entries.
  - Update dialogs continue to use i18n keys, and their published date formatting now follows the active i18n locale instead of the host default locale; the older download update dialog title no longer mixes decorative emoji into localized text.
  - 已验证：`pnpm -C "apps/core-app" exec vitest run "src/renderer/src/modules/hooks/useUpdateRuntime.test.ts"`、`pnpm -C "apps/core-app" run typecheck:web`。

### fix(cli): precompile all packaged plugin widgets

- `packages/tuff-cli-core/src/exporter.ts`
- `packages/tuff-cli-core/src/__tests__/builder-widgets.test.ts`
  - `tuff builder` 打包阶段不再只预编译 manifest 中声明且非 experimental 的 widget feature，而是以 `widgets/` 目录下全部支持的 widget 源文件（`.vue/.ts/.js/.cjs/.tsx/.jsx`）为输入源生成 `widgets/.compiled/*.cjs` 与 meta。
  - Manifest 已声明的 widget 继续保留原 featureId/widgetId，未声明的 widget 使用 `widget.<relative-path>` 派生 featureId，避免影响运行时按 feature 加载的稳定路径。
  - 补充回归测试覆盖 experimental widget 仍会随目录全量预编译，以及未声明 Vue/TS widget 文件也会写入 `manifest.build.widgets`。

### refactor(tuffex): split FlipOverlay body scroll lock

- `packages/tuffex/packages/components/src/flip-overlay/src/TxFlipOverlay.vue`
- `packages/tuffex/packages/components/src/flip-overlay/src/flip-overlay-body-scroll-lock.ts`
- `docs/plan-prd/TODO.md`
  - 将 `TxFlipOverlay.vue` 内的 body scroll lock 计数、overflow/padding 备份与恢复逻辑迁出到独立 helper，组件主体只保留可见状态 watcher 与生命周期调用。
  - Public props、emits、slot props、DOM class 与 stack 行为不变；现有 body lock、多实例计数和 stack 回归继续由 `flip-overlay.test.ts` 覆盖。
  - 已验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/flip-overlay/__tests__/flip-overlay.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/flip-overlay/src/TxFlipOverlay.vue" "packages/components/src/flip-overlay/src/flip-overlay-stack.ts" "packages/components/src/flip-overlay/src/flip-overlay-body-scroll-lock.ts" "packages/components/src/flip-overlay/__tests__/flip-overlay.test.ts"` 通过。

### docs(nexus): close intelligence provider dot-route hard-cut drift

- `docs/plan-prd/TODO.md`
  - 复核 `apps/nexus/server/api/dashboard/intelligence/providers/**` 后，确认旧 `:id.probe` / `:id.test` dot-route shell 与 `intelligence-route-compat` middleware 已删除，只保留当前 slash-route provider probe/test 与 migration 主路径。
  - 将顶部“可优先提交”清单里的 Nexus Intelligence provider dot-route hard-cut 项同步标记为完成，避免与后段已完成记录互相矛盾。
  - 已验证：`pnpm -C "apps/nexus" exec vitest run "server/api/dashboard/intelligence/providers/migrate.api.test.ts"` 通过；`pnpm -C "apps/nexus" exec eslint --cache --no-warn-ignored "server/api/dashboard/intelligence/providers/migrate.post.ts" "server/api/dashboard/intelligence/providers/migrate.api.test.ts" "server/api/dashboard/intelligence/providers/[id]/probe.post.ts" "server/api/dashboard/intelligence/providers/[id]/test.post.ts"` 通过。

### docs(core-app): close plugin sdk hard-cut checklist

- `docs/plan-prd/TODO.md`
  - 复核 `apps/core-app/src/main/modules/plugin/sdkapi-hard-cut-gate.ts`、plugin loader / installer / preflight 与 `packages/utils` plugin channel 表面，确认缺失、非法、低于 floor 或未支持的 `sdkapi` 统一以 `SDKAPI_BLOCKED` 阻断。
  - 复核 `packages/utils/__tests__/plugin-channel-send-sync-hard-cut.test.ts` 与 `plugins/clipboard-history/scripts/assert-no-raw-channels.mjs`，确认 plugin channel `sendSync` 仍是 removed error，renderer SDK 类型面不再暴露 `sendSync`，clipboard-history 构建产物与 CoreApp 内置副本不含已禁止 raw clipboard/system channel 字符串。
  - 已验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/plugin/plugin-loaders.test.ts" "src/main/modules/plugin/plugin-preflight-helper.test.ts" "src/main/modules/plugin/plugin-installer.test.ts" "src/main/modules/plugin/install-queue.test.ts"` 通过；`pnpm -C "packages/utils" exec vitest run "__tests__/plugin-channel-send-sync-hard-cut.test.ts"` 通过；`node "plugins/clipboard-history/scripts/assert-no-raw-channels.mjs"` 通过；CoreApp plugin 相关 ESLint 与 packages/utils plugin channel ESLint 均通过。

### perf(core-app): cache plugin store page state across tabs

- `apps/core-app/src/renderer/src/composables/store/useStoreData.ts`
- `apps/core-app/src/renderer/src/base/router.ts`
  - 插件市场数据提升为 composable 模块级缓存，普通进入/切换复用已有 catalog，手动刷新与来源配置变更继续强制重新拉取。
  - `/store`、`/store/installed`、`/store/docs`、`/store/cli` 与 `/store/:id` 共用 `store-shell` KeepAlive key，避免市场页、已安装页、文档页和 CLI 页之间切换时重复销毁并重新加载。

### perf(core-app): move plugin store hydration behind renderer mount

- `apps/core-app/src/renderer/src/main.ts`
- `apps/core-app/src/main/modules/ai/intelligence-module.ts`
- `apps/core-app/src/main/modules/ai/agents/agent-channels.ts`
- `apps/core-app/src/main/modules/ai/agents/agent-channels.test.ts`
- `apps/core-app/src/main/modules/clipboard.ts`
- `apps/core-app/src/main/modules/clipboard.transport.test.ts`
- `apps/core-app/src/main/modules/database/index.ts`
- `apps/core-app/src/main/modules/database/index.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider-startup.test.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.regression-baseline.test.ts`
- `apps/nexus/app/utils/request.ts`
- `packages/utils/transport/events/types/file-index.ts`
- `apps/core-app/src/main/modules/extension-loader.ts`
- `apps/core-app/src/main/modules/sentry/sentry-service.ts`
- `apps/core-app/src/main/modules/sentry/sentry-service.test.ts`
- `apps/core-app/src/main/modules/update/UpdateService.ts`
- `docs/plan-prd/TODO.md`
  - Renderer bootstrap 不再在首屏 mount 前 `await pluginStore.initialize()`，避免 `pluginSDK.list()` 与插件 install source 查询阻塞 root container mount。
  - `app.mount('#app')` 完成后通过后台任务初始化 plugin store，保留 CoreBox / Assistant window 跳过逻辑，并记录 renderer shell mount 前耗时与 plugin store 后台初始化耗时。
  - Clipboard monitoring 启动仍立即注册 polling fallback，但 native clipboard watcher 的可选动态 import/start 改为等待 `appTaskGate.waitForIdle()` 后执行，避免可选 native watcher 初始化挤入启动忙时窗口。
  - `DatabaseModule.onInit()` 保留 primary DB 与主迁移同步完成，aux DB 初始化/热表迁移、WAL maintenance 注册与启动 health snapshot 移到后台任务；`getAuxDb()` 在 aux 未 ready 时继续 fallback primary DB。
  - `docs/plan-prd/TODO.md` 已关闭 CoreApp 启动异步化 P2 命名范围；更细的真机启动耗时与 WAL/health 长尾证据留到后续平台补证。
  - `EverythingProvider.onLoad()` 改为 handler-first：只加载设置并注册 status/toggle/test handlers，SDK/CLI backend detection 延后到后台 idle refresh，搜索侧继续沿用 existing ready/fallback notice。
  - `FileProvider.onLoad()` 改为 handler-first：search-index worker init、后台索引任务服务与 filesystem watcher 注册延后到后台 startup task；File index status 新增可选 `startupReady/startupPending/startupError`，worker init 失败时保持 degraded 而不是标记假 ready。
  - SearchCore 在 Windows 文件搜索命中 FileProvider 且 startup 未 ready/degraded 时追加低分 notification，明确当前文件结果为 partial，同时保留已有索引与 Windows shell 候选，避免启动期静默空白或误导为完整结果。
  - `docs/plan-prd/TODO.md` 已关闭 CoreApp 启动异步化 P3 命名范围；真实设备启动耗时、trace 与 UI 观感补证并入 Windows 真机 release evidence / 搜索性能验收。
  - 复核工作区本地噪声清单：`mise.toml` tracked 且无 diff，`apps/core-app/.playwright-mcp/` 与 `paseo.json` 均由 `.gitignore` 忽略，当前不会混入证据或提交批次。
  - 发版前最小复核首轮运行 `pnpm quality:release`，先修复 Nexus `app/utils/request.ts` 的 `ts/consistent-type-definitions` lint error，保留 `RequestErrorLike | null` 类型语义不变；复跑后仍在 CoreApp lint gate 阻塞，主要为既有 `$app` global restricted syntax、renderer `console` 与 raw IPC guard errors，尚未进入 typecheck/test/build 阶段。`git diff --check` 返回 0。
  - `ExtensionLoaderModule` 不再在 `onInit()` 中同步读目录并串行 `await session.defaultSession.loadExtension()`；初始化阶段只枚举扩展，`start()` 后台加载，destroy 会等待后台任务后卸载已加载扩展。
  - `IntelligenceModule` 不再在 `onInit()` 中等待 agent/workflow runtime；provider、capability 与 IPC handler 先完成注册，agent/workflow runtime 后台初始化，执行 `agent.run` / `workflow.execute`、workflow run 与 agent IPC 执行类 handler 时再等待 runtime ready。
  - `SentryServiceModule` 的 telemetry upload stats hydrate 不再阻塞 `onInit()`；启动后后台读取历史统计，shutdown flush 前等待已启动 hydrate，并在合并时保留启动期新增计数与更新的 failure/upload 时间，避免后台旧记录覆盖内存新统计。
  - `UpdateServiceModule` 的 release cache hydrate 不再阻塞 `onInit()`；启动后后台读取缓存，检查更新前与 destroy 写缓存前等待已启动 hydrate，避免空缓存误触发网络请求或旧缓存覆盖新缓存。
  - `docs/plan-prd/TODO.md` 已关闭 CoreApp 启动异步化 P1 命名范围；Database critical/background 拆分与 Search provider 后台 ready 继续由 P2/P3 承接。
  - 已验证：`pnpm -C "apps/core-app" run typecheck:web` 返回 0；命令输出中仍包含 tuffex build 阶段既有 `TouchScroll` dts 诊断与 deprecation 噪声，但未阻断 typecheck。`pnpm -C "apps/core-app" exec vitest run "src/main/modules/sentry/sentry-service.test.ts"`、`pnpm -C "apps/core-app" exec vitest run "src/main/modules/ai/agents/agent-channels.test.ts" "src/main/modules/ai/intelligence-sdk.test.ts" "src/main/modules/ai/intelligence-workflow-service.test.ts"`、`pnpm -C "apps/core-app" exec vitest run "src/main/modules/clipboard.transport.test.ts" "src/main/modules/clipboard/clipboard-native-watcher.test.ts"`、`pnpm -C "apps/core-app" exec vitest run "src/main/modules/database/index.test.ts"`、`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/everything-provider.test.ts" "src/main/modules/box-tool/addon/files/file-provider-startup.test.ts" "src/main/modules/box-tool/search-engine/search-core.regression-baseline.test.ts"`、`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-watch-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-index-runtime-service.test.ts"` 与 `pnpm -C "apps/core-app" run typecheck:node` 返回 0。

### fix(plugin): expose shell capability diagnostics for command plugins

- `plugins/touch-quick-actions/index.js`
- `plugins/touch-system-actions/index.js`
- `plugins/touch-window-manager/index.js`
- `plugins/touch-workspace-scripts/index.js`
- `packages/test/src/plugins/quick-actions.test.ts`
- `packages/test/src/plugins/system-actions.test.ts`
- `packages/test/src/plugins/window-manager.test.ts`
- `packages/test/src/plugins/workspace-scripts.test.ts`
- `docs/plan-prd/TODO.md`
  - 四个 shell 能力插件统一在 CoreBox item / dynamic feature meta 暴露 `capability.id/type/platform/permission/status/reason/audit`，审计字段包含 `pluginName`、`featureId`、`actionId`、`commandKind`、`requiresConfirmation` 与 `requiresAdmin`。
  - 平台不支持时返回 `unsupported` 诊断，权限拒绝时返回 `permission-missing` 诊断；`safe-shell` 不可用的固定/用户 shell 路径标记为 `degraded`，避免 fallback 到原生 shell 后缺少可观测证据。
  - 固定系统命令继续优先走 `safe-shell`；窗口管理保持参数化 `execFile`/`spawn` 路径；工作区脚本保持用户确认后的 `user-shell`，不把任意用户命令误改为固定参数化调用。
  - 已验证：`pnpm -C "packages/test" exec vitest run "src/plugins/quick-actions.test.ts" "src/plugins/system-actions.test.ts" "src/plugins/window-manager.test.ts" "src/plugins/workspace-scripts.test.ts"`。
  - CoreApp 内置 `touch-quick-actions` 打包副本仍需用户确认后执行批量重建/同步；`docs/plan-prd/TODO.md` 暂不关闭该项。

## 2026-05-13

### fix(plugin): route translation provider secrets through plugin secure storage

- `packages/utils/plugin/sdk/secret.ts`
- `packages/utils/transport/events/index.ts`
- `packages/utils/transport/events/types/plugin.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `plugins/touch-translation/src/composables/useTranslationProvider.ts`
- `plugins/touch-translation/index.js`
- `plugins/touch-translation/manifest.json`
- `docs/plan-prd/TODO.md`
  - 新增插件级 secret storage typed events 与 `usePluginSecret()` / `plugin.secret` SDK，底层复用 CoreApp secure-store，以 `plugin.<pluginName>.<key>` 命名空间隔离并继续走 `storage.plugin` 权限门禁。
  - `touch-translation` 的 DeepL/Bing/Custom `apiKey`、Baidu `secretKey`、Tencent `secretId/secretKey`、Caiyun `token` 不再写入普通 `providers_config`；普通 plugin storage 仅保留 provider metadata。
  - 旧明文 `providers_config` 加载时会先迁入 plugin secret storage；只有迁移成功才清理普通 JSON 明文字段，失败时保留旧配置作为兼容兜底，避免密钥丢失。
  - 已验证：`pnpm -C "packages/utils" exec vitest run "__tests__/plugin-storage-sdk.test.ts"`、`pnpm -C "apps/core-app" exec vitest run "src/main/modules/plugin/plugin.test.ts"`、`pnpm -C "apps/core-app" run typecheck:node`、`pnpm -C "plugins/touch-translation" run typecheck`、`pnpm -C "packages/test" exec vitest run "src/plugins/translation.test.ts" -t "keeps provider secrets out of metadata"`。
  - 运行时产物与 CoreApp 内置副本同步仍需用户确认后执行批量生成/同步。

### fix(core-app): repair empty app search index on startup

- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
  - AppProvider 启动后新增 app 搜索索引健康检查：当本地 app 表为空索引或关键词索引为空时，自动触发 startup backfill，避免后台延迟/最近 backfill 节流导致 CoreBox 长时间搜索不到本机应用。
  - Dev 环境的 `recent-backfill` 节流仅在 app 搜索索引健康时生效；索引不健康时允许补索引自愈。
  - 已验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/apps/app-provider.test.ts"`。

### fix(core-app): auto-repair derived search FTS metadata failures

- `apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.schema-repair.test.ts`
  - `search_index` FTS5 元数据读取失败时先探测 `sqlite_master`，仅在主库元数据仍可读时自动重建派生 FTS 表，并设置 `didMigrate` 触发文件索引全量重扫。
  - 主库元数据不可读时停止自动修复并保留原始错误，避免把 SQLite I/O/corruption 问题误判为可丢弃索引。
  - 补充回归测试固定“派生索引可自愈、主库异常不自愈”的边界。

### fix(plugin): gate stale CoreBox push items after disable

- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `apps/core-app/src/main/modules/plugin/plugin.test.ts`
- `apps/core-app/src/main/modules/box-tool/item-sdk/box-item-manager.ts`
- `apps/core-app/src/main/modules/box-tool/item-sdk/box-item-manager.test.ts`
- `docs/plan-prd/TODO.md`
  - `plugin.feature` / `boxItems` 的 push、batch push、update、remove 增加插件运行态门禁，插件非 `ENABLED/ACTIVE` 时忽略旧异步任务的写入，避免禁用后继续推送 CoreBox items。
  - 插件禁用流程增加 feature controller abort 与 CoreBox pushed items 清理，阻止已触发 feature 的延迟请求在 disable 后污染结果区。
  - `BoxItemManager.clear/getBySource` 支持按 `item.meta.pluginName` 匹配，修复 `source.id=plugin-features` 等共享 source 场景下按插件名清不掉旧 items 的问题。

### fix(cli): secure local auth token file permissions

- `packages/tuff-cli-core/src/auth.ts`
- `packages/tuff-cli-core/src/cli-credential-store.ts`
- `packages/tuff-cli-core/src/publish.ts`
- `packages/tuff-cli-core/src/__tests__/auth.test.ts`
- `packages/unplugin-export-plugin/src/core/auth.ts`
- `packages/unplugin-export-plugin/src/core/cli-credential-store.ts`
- `packages/unplugin-export-plugin/src/core/publish.ts`
- `packages/unplugin-export-plugin/src/__tests__/auth.test.ts`
- `docs/plan-prd/TODO.md`
  - 为两个 CLI 包各自新增本地 `CliCredentialStore`，统一 `auth.json` 的 read/write/clear/getPath，`logout()` 改为走 auth store 的 clear 路径。
  - `saveAuthToken()` 写入后在 POSIX/macOS/Linux 尽量将配置目录收紧为 `0700`、token 文件收紧为 `0600`；读取旧 JSON 时发现 group/other 权限过宽会 best-effort 修复。
  - Windows 不伪造 ACL 安全完成，仅对用户目录外的 token path 给出 best-effort ACL 提醒；`TUFF_AUTH_TOKEN` 继续作为 CI / 无头环境 fallback。
  - 本轮不引入 Keychain / Credential Locker / libsecret 依赖，第二阶段再接系统级 credential store。

### fix(aiapp): retire compat placeholder success responses

- `retired-ai-app/server/utils/quota-api.ts`
- `retired-ai-app/server/api/livechat/random.get.ts`
- `retired-ai-app/server/api/aigc/prompts/detail/[id]/index.get.ts`
- `retired-ai-app/server/api/[...path].ts`
- `retired-ai-app/server/api/__tests__/compat-placeholder-contract.test.ts`
- `docs/plan-prd/TODO.md`
  - 新增 `quotaUnavailable()`，保持 AI 既有 `{ code, message, data }` 响应体，同时设置真实 HTTP status，并统一返回 `status=unavailable`、`reason` 与可选 `migrationTarget`。
  - `livechat/random` 在无 `chatapp.livechat` 数据时不再返回可消费的 `exempted` 问答占位，改为 HTTP `503` 与 `chatapp_livechat_data_unavailable`。
  - 旧 `aigc/prompts/detail/:id` M1 占位接口改为 HTTP `410`，明确迁移到 `/api/aigc/prompts/:id`。
  - catch-all 未实现接口不再只在 body 内写 `code=501`，同步设置 HTTP `501`，避免调用方按 2xx 误判成功。

### fix(tuff-cli): align sdkapi marker hard-cut

- `packages/tuff-cli/tsup.config.ts`
- `packages/utils/plugin/sdk-version.ts`
- `packages/utils/__tests__/permission-status.test.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.test.ts`
- `apps/nexus/content/docs/dev/reference/manifest.{zh,en}.mdc`
- `.github/workflows/package-tuff-cli-ci.yml`
  - 从 SDK allowlist 移除临时保留的 `260421` 历史 marker，使共享 `checkSdkCompatibility()`、`tuff validate` 和 CoreApp runtime gate 重新保持同一 canonical marker 口径。
  - 补齐权限状态与插件 loader 回归：非 canonical `260421` 在权限评估前不再授予权限，并在运行时进入 `SDKAPI_BLOCKED`，不再作为可加载历史例外。
  - 同步 Manifest 参考文档的支持列表，避免开发者继续把 `260421` 当作可声明 marker。
  - CLI Package CI 的 path filter 补充 `packages/utils/**` 与 workflow 文件自身，确保共享 SDK 兼容性改动会重新触发 `tuff-cli-core` lint/test/build。
  - `tuff-cli` tsup external 补齐 `@vue/compiler-sfc` 可选模板引擎，避免打包 CLI core 时把 Vue SFC 编译器的可选 `require()` 当成硬依赖解析。

### docs(project): add compatibility deep review

- `docs/plan-prd/report/cross-platform-compat-placeholder-deep-review-2026-05-13.md`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - 归档跨平台兼容与占位实现深度复核：CoreApp 平台能力、sync 密文载荷、Linux unsupported reason 与 transport boundary 当前稳定；`transport-event-boundary.test.ts` 通过，typed migration candidate 保持 `0`，retained raw definition 当前测试上限为 `265`。
  - 明确剩余 `2.4.11` 风险：AI 兼容占位成功响应、CLI token 明文 JSON、插件 provider secret 普通 storage、插件 shell capability 诊断与生产样式大文件 SRP。
  - 同步活跃入口文档，把当前下一步继续固定为 `2.4.10` Windows 真机 evidence；不把 AI/CLI/插件 secret/SRP 扩大为正式 `2.4.10` gate blocker。

### chore(release): prepare 2.4.10 beta.22 CI readiness

- `package.json`
- `apps/core-app/package.json`
- `notes/update_2.4.10-beta.22.{zh,en}.md`
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue`
- `packages/utils/__tests__/transport-event-boundary.test.ts`
- `plugins/clipboard-history/eslint.config.mjs`
- `plugins/touch-dev-utils/eslint.config.mjs`
  - 版本基线推进到 `2.4.10-beta.22`，用于避开已存在的 `v2.4.10-beta.21` tag，并补齐对应中英文 beta release notes。
  - 收口远端 `master` 最新失败的 OmniPanel Gate：主进程模块不再读取 `globalThis.$app`，渲染端错误输出统一走 renderer logger。
  - 收口 Utils Package CI 的 transport boundary 扫描基线：当前 retained raw definition 为 `265`，raw send violation 仍只允许既有 allowlist，typed migration candidate 保持 `0`。
  - 补齐 `clipboard-history` / `touch-dev-utils` 插件本地 ESLint 配置，并修正 clipboard history 事件命名、组件格式与相关工具脚本 lint 阻断，确保 beta 发布相关质量门禁可复跑。
  - 本地已验证 OmniPanel scoped lint、Utils boundary test、`test:targeted`、CoreApp typecheck、clipboard-history lint/test 与 macOS beta build；完整 `quality:pr` 仍被 `retired-ai-app` 既有 lint 债务阻断，不能宣称全仓 PR 质量门禁已绿。

### fix(plugin): clear stale quick launch search suggestions

- `plugins/touch-browser-open/{manifest.json,index.js}`
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
- `packages/test/src/plugins/browser-open.test.ts`
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.test.ts`
  - Quick Launch 搜索引擎模式移除插件内部 `onInputChange` 双路订阅，统一由 CoreBox active push feature 触发输入刷新；未进入 `网页搜索` / `搜索引擎` feature 前不再主动拉远程 suggestion。
  - 搜索模式每次 query 变化都会 abort 旧 suggestion 请求并立即清理结果区，只保留当前 query 的直接搜索项或当前引擎空态；旧请求晚返回、失败 warning 或降级提示均需匹配 `featureId + engineId + query + requestSeq` 后才允许落回 UI。
  - CoreBox active push feature 空输入时仍转发给插件，确保清空关键词后插件可以清掉旧 suggestion，而非回填浏览器打开/域名候选。
  - 版本升级至 `touch-browser-open@1.0.4`，用于修复已发布 `1.0.3` 的旧 suggestion 残留问题。

### fix(core-app): harden Windows shortcut app launch handoff

- `apps/core-app/src/main/modules/box-tool/addon/apps/app-launcher.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-launcher.test.ts`
  - Windows App 启动路径继续收紧 ShellExecute 语义：当 `launchTarget` 本身为 `.lnk`（常见于手动添加/复制路径入口）时，直接交由 `shell.openPath(.lnk)` 启动，避免 Node `spawn` 快捷方式导致部分应用无响应或失败。
  - 保留原始 Start Menu `.lnk` 的 shell handoff 与失败后 target fallback 行为；同时用定向测试覆盖 `.lnk`、`.cmd`、`.ps1`、普通 exe 与协议启动。

### test(core-app): cover app provider launch metadata sync

- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider-metadata-sync.test.ts`
  - 补充 AppProvider metadata sync 测试，固定 `launchArgs`、`workingDirectory`、`displayPath`、`description` 作为扫描可清理/可检测的启动元数据，降低旧索引残留错误启动参数的风险。

### feat(plugin): add search engine icons for quick launch

- `plugins/touch-browser-open/{manifest.json,index.js,assets/search-engines/*.svg}`
- `packages/test/src/plugins/browser-open.test.ts`
  - `Google / Bing / DuckDuckGo` 搜索引擎配置新增对应 SVG icon，动态 `搜索引擎` feature、直接搜索项、suggestion 与降级提示统一展示当前引擎图标。
  - 单测固定动态搜索引擎 feature 与搜索结果 item 的 icon 来源，避免回退到通用插件 logo。
  - 版本升级至 `1.0.3`，用于发布搜索引擎图标更新。

### feat(core-app): add Windows app index manager and Steam protocol launch

- `apps/core-app/src/renderer/src/views/base/settings/{SettingFileIndex.vue,SettingFileIndexAppIndexManager.vue}`
- `apps/core-app/src/main/modules/box-tool/addon/apps/{app-launcher.ts,app-provider.ts,app-provider-path-utils.ts,app-scanner.ts,steam-provider.ts,win.ts}`
- `apps/core-app/src/main/modules/box-tool/addon/apps/{app-launcher.test.ts,app-provider.test.ts,steam-provider.test.ts,win.test.ts}`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN.json,en-US.json}`
- `packages/utils/transport/events/types/app-index.ts`
- `packages/utils/core-box/tuff/tuff-dsl.ts`
- `docs/INDEX.md`
- `docs/plan-prd/{README.md,TODO.md}`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - 文件索引高级设置新增“本地启动区 / 应用索引管理”，复用 `settingsSdk.appIndex.listEntries/addPath/setEntryEnabled/removeEntry/diagnose/reindex`，支持选择 `.exe/.lnk/.appref-ms`、粘贴 Windows `%ENV%` 路径、UWP shell path 与裸 AppID；添加成功后立即触发关键词重建与诊断，避免重启后才可搜索。
  - `AppIndexEntryLaunchKind` / `ScannedAppInfo.launchKind` / CoreBox app DSL 扩展 `protocol`，AppLauncher 新增协议启动白名单，仅允许 `steam://rungameid/<numeric>` 并通过 `shell.openExternal()` 启动，拒绝其他协议。
  - Windows AppProvider 扫描链路新增 Steam provider，解析注册表/常见 Steam 根、`libraryfolders.vdf` 与 `appmanifest_*.acf`，以 `bundleId=steam:<appid>`、`launchKind=protocol`、`launchTarget=steam://rungameid/<appid>` 索引游戏；不扫描游戏 exe、不引入通用游戏平台抽象。
  - 补充 Steam parser、AppLauncher protocol 分支、Windows/AppProvider 最近路径回归；Windows 真机 UWP/Store、Steam 与手动条目搜索启动闭环仍需按 acceptance evidence 采集。

### docs(core-app): record startup async blocking analysis

- `docs/plan-prd/report/coreapp-startup-async-blocking-analysis-2026-05-13.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/README.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - 归档 CoreApp 启动异步化与首屏卡顿静态分析，确认当前启动仍受 main modules 串行 `await`、Database/Extension/Intelligence 等非首屏任务进入 critical path、Search provider 启动后集中抢资源，以及 renderer mount 前等待 storage/plugin store 影响。
  - 明确后续治理顺序：P0 先将 renderer plugin store 初始化移到 mount 后后台执行；P1 将 Extension/Sentry/Intelligence/Update/Clipboard/DownloadCenter 等改为 handler-first + background runtime；P2 拆分 Database critical/background；P3 将 Everything/FileProvider 等搜索 provider 后台 ready。
  - 该项仅记录分析与后续计划，不改变当前 `2.4.10` Windows evidence gate 优先级。

### fix(plugin): isolate quick launch search engine completion mode

- `plugins/touch-browser-open/{manifest.json,index.js}`
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
- `packages/utils/plugin/sdk/feature-sdk.ts`
- `packages/test/src/plugins/browser-open.test.ts`
- `packages/utils/__tests__/plugin-sdk-lifecycle.test.ts`
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.test.ts`
  - `touch-browser-open` 搜索引擎 feature 激活后持续订阅 CoreBox 输入变化，输入 `example.com` 这类域名形态内容时仍只展示对应引擎的直接搜索项与 suggestion，不再退回 URL 打开候选。
  - 搜索 action 显式写入 `render.completion`，Tab 补全只补关键词或 suggestion 本身，避免补成 `Google 搜索：<query>` 标题。
  - CoreBox active push feature 空 query 时不再由 `plugin-features` 自动回填插件功能列表，避免搜索模式清空输入后突出 `browser-open` / 域名打开入口。
  - 修复 Feature SDK 对空字符串 `core-box:input-change` payload 的解析，清空输入时不再把 payload 对象传给插件。
  - 版本升级至 `1.0.2`，用于修复已发布 `1.0.1` 的搜索引擎模式补全隔离问题。

### chore(quality): retire guard infrastructure and consolidate ESLint gates

- `package.json`
- `.github/workflows/ci.yml`
- `apps/core-app/{package.json,eslint.config.mjs}`
- `scripts/check-{legacy-boundaries,compatibility-debt-registry,large-file-boundaries,doc-governance,network-boundaries,coreapp-runtime-boundaries,runtime-console-boundaries,main-global-app-usage,intelligence-no-todo}.mjs`
- `scripts/{legacy-boundary-allowlist,large-file-boundary-allowlist,runtime-console-allowlist,main-global-app-allowlist}.json`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
  - Retired infrastructure guard scripts and their baselines/registries from the project quality chain.
  - Root quality scripts now keep only `lint`, `lint:fix`, `lint:changed`, `typecheck`, `typecheck:all`, `test:targeted`, `quality:pr`, and `quality:release`; `lint` / `lint:fix` run ESLint only, and lint-staged no longer runs changed-file size guard.
  - Migrated network, runtime, console, i18n global, raw IPC, old sync API, legacy import/literal, loose WebPreferences, and `$app` boundaries into ESLint rules / overrides.
  - PR CI now runs `pnpm quality:pr` and no longer includes report-only docs guard; package reusable CI remains on lint/typecheck/test/build parameters.
  - Updated active quality/roadmap docs to use the ESLint + typecheck + targeted tests + build baseline; historical archive/old CHANGES entries are intentionally not bulk rewritten.

### fix(core-app): avoid plugin install confirmation race

- `apps/core-app/src/main/modules/plugin/{install-queue.ts,install-queue.test.ts}`
  - 插件安装队列在发送确认请求前先登记 task resolver，避免前端在 `sendToWindow` 尚未返回时立即回传确认响应导致响应被丢弃。
  - 补充权限确认竞态回归测试，覆盖确认响应早于确认发送 Promise resolve 的路径，防止商店安装按钮长期停留在“等待确认”。

### fix(plugin): remove browser open prelude process dependency

- `plugins/touch-browser-open/{manifest.json,index.js}`
- `packages/test/src/plugins/{browser-open.test.ts,plugin-loader.ts}`
  - `touch-browser-open` Prelude 不再在顶层读取 `process.platform`，改用 `node:os` 获取当前平台，避免生产插件沙箱未注入 `process` 时启用失败。
  - 版本升级至 `1.0.1`，用于修复已发布 `1.0.0` 在 CoreBox 插件生命周期 enable 阶段的 `ReferenceError: process is not defined`。
  - 单测补充无 `process` 全局的插件沙箱加载回归，固定动态搜索引擎 feature 构建不依赖 Node `process` 全局。

### feat(plugin): add quick launch search engine mode

- `plugins/touch-browser-open/{manifest.json,index.js}`
- `packages/test/src/plugins/browser-open.test.ts`
  - `touch-browser-open` 新增 `web-search` 基础入口，并在插件初始化时动态注册 `Google / Bing / DuckDuckGo 搜索引擎` feature。
  - 选择某个搜索引擎 feature 后保持 CoreBox 输入态，不进入独立页面；输入变化会刷新直接搜索项与远程 suggestion，执行后复用默认浏览器打开逻辑并隐藏 CoreBox。
  - 搜索建议新增 `network.internet` 可选权限；权限缺失、网络失败或请求取消时保留直接搜索项，不阻塞用户搜索。
  - URL/域名打开仍由原 `browser-open` 路径处理，普通网页搜索走默认搜索引擎兜底。

### fix(core-app): prefer packaged macOS tray template icon

- `apps/core-app/electron-builder.yml`
- `apps/core-app/scripts/build-target/after-pack.js`
- `apps/core-app/src/main/modules/tray/{tray-icon-provider,tray-manager}.ts`
  - macOS 包 `Info.plist` 固化 `LSUIElement=true`，并在 `afterPack` 对主 App `Info.plist` 做兜底写入与 fail-fast 校验；避免 builder 配置或 CLI 覆盖未生效时，系统设置「菜单栏」列表完全不登记 `tuff`。
  - macOS Dock 显隐时同步切换 activation policy：需要显示 Dock 时使用 `regular`，仅托盘驻留时使用 `accessory`，避免 `LSUIElement` 包身份下只调用 `app.dock.show()` 的不完整状态。
  - 将 `TrayManager` 启动顺序提前到 Intelligence/Auth/Sync 等可能触发 Keychain 或网络等待的模块之前，避免 macOS agent 包在后续模块初始化卡住时尚未创建菜单栏项。
  - dev 与 packaged macOS 在 tray-first / accessory agent 行为上保持一致：不再通过 dev 环境强制 `regular`，便于默认 `pnpm core:dev` 直接验证菜单栏托盘链路。
  - macOS 托盘图标改为优先使用已打包的 `TrayIconTemplate.png` / `tray_icon_22x22.png` / `tray_icon.png` 资源，内置 Base64 template icon 仅作为资源缺失时的 fallback，避免状态栏项在部分 macOS 菜单栏/状态栏管理环境中创建后不可见或 bounds 异常。
  - 替换 macOS tray template 资源为更明确的圆角方框 + `T` mask，避免旧资源仅显示为极小浅色圆点，Tray 已创建但视觉上几乎不可见。
  - macOS Tray 初始化顺序调整为先创建 status item、再同步 activation policy，并在创建后延迟复查 bounds；若仍出现 `height=0` 的无效布局，则自动重建一次 Tray 并记录恢复日志。
  - `pnpm core:dev` 默认改用本地生成的 Tuff Dev Electron bundle（`com.tagzxia.app.tuff.dev` + `LSUIElement=true` + ad-hoc sign），避免 stock `Electron.app` / `com.github.Electron` 身份导致 macOS「菜单栏」设置和 tray agent 行为与 packaged app 不一致；dev bundle 保留 `CFBundleExecutable=Electron`，确保 Electron 仍按 dev-server / `tuff-dev` 数据目录运行。
  - `TrayManager` 在托盘创建成功后记录 `platform`、`bounds` 与 resolved `iconPath`，后续可直接从日志判断 `trayReady` 与状态栏定位问题，减少 macOS 真机排查歧义。
  - Tray tooltip 与菜单展示文案统一走 `tray.*` i18n key，并将托盘菜单中的旧品牌名对齐为 `Tuff`。

### docs(project): lock immediate Windows evidence execution order

- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - 将“当前最需要做的事”落地为明确执行顺序：先确认工作区本地噪声不混入提交，再在 Windows 真机生成 acceptance collection plan，随后采集 case/manual/performance evidence，运行 `windows:acceptance:verify` final gate，最后写入 Nexus Release Evidence。
  - 明确 `2.4.10` 正式 gate 前不得扩大功能范围；`2.5.0` AI/workflow、Provider Registry 高级策略、retained raw definition 后续迁移与 SRP 大拆分继续保留在 `2.4.11` / `2.5.0` 后续，不得抢占当前发版 blocker。
  - 同步六主文档日期与口径，强调缺少真实 Windows evidence、性能样本或 Release Evidence 写入时，正式 `2.4.10` 结论只能保持 blocked。

## 2026-05-12

### ci(workflows): migrate GitHub Actions runtime to Node 24 baseline

- `.github/workflows/*.yml`
- `.github/workflows/README.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - 将 CI、package publish、release、AI image、PR label 与 release drafter workflow 的 JavaScript Actions 统一升级到 Node 24-compatible major baseline，消除 Node.js 20 action runtime deprecation warning。
  - 保持项目业务 Node runtime 为 `22.16.0`，明确 Action runtime 迁移不得通过升级业务 Node、`ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION` 或长期 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` 绕过。
  - 发布链路 `build-and-release` 同步升级 upload/download artifact 与 release action，后续仍需通过 beta/draft release run 验证三端 artifact、GitHub Release 与 Nexus sync annotations。

### docs(project): refresh cross-platform compatibility review

- `docs/plan-prd/report/cross-platform-compat-placeholder-review-2026-05-12.md`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.test.ts`
  - 新增 2026-05-12 跨平台兼容与占位实现复核报告，确认 2026-05-10 P0/P1 假成功路径已基本收口：AI runtime metrics、mock payment 显式环境门控、`touch-image` 图片历史迁入 plugin storage SDK。
  - 同步六主文档入口，把当前 release blocker 收敛为 Windows/macOS 真机 evidence；后续 `2.4.11` 聚焦 `compat-file=5`、retained raw definition、CLI token storage、插件命令能力统一诊断与超长模块 SRP 小切片。
  - 清理 `app-provider.test.ts` 测试标题中的非行为性 legacy 关键词噪声，保持断言不变并恢复 `compat:registry:guard` 绿线。

### feat(plugin): precompile production widgets in plugin packages

- `packages/tuff-cli-core/src/exporter.ts`
- `apps/core-app/src/main/modules/plugin/widget/{widget-manager,widget-transform}.ts`
- `packages/utils/plugin/widget.ts`
  - `tuff builder` now precompiles manifest widget features into `widgets/.compiled/*.cjs` and records `build.widgets` metadata in the packaged manifest.
  - Core App packaged runtime prefers precompiled widget output and disables runtime widget compilation unless dev/source mode or `TUFF_WIDGET_RUNTIME_COMPILE` explicitly enables fallback.
  - Widget compiler service `EPIPE` failures are classified as `WIDGET_COMPILER_SERVICE_UNAVAILABLE`; dev/source mode retries once.

### fix(core-app): launch Windows executable apps from install directory

- `apps/core-app/src/main/modules/box-tool/addon/apps/app-launcher.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-launcher.test.ts`
  - Windows `.exe`/`.com` app launches now use the app process launcher instead of `shell.openPath`, and default `cwd` to the executable directory when no explicit working directory is provided.
  - This keeps apps such as ChatApp aligned with their installed runtime assumptions, while non-executable paths still use the shell opener.

### fix(core-app): skip unresolved optional packaged runtime modules

- `apps/core-app/scripts/build-target/runtime-modules.js`
- `apps/core-app/src/main/core/runtime-modules.contract.test.ts`
  - Packaged runtime closure 对缺失的 `optionalDependencies` 恢复 skip-optional 策略，避免 `esbuild` 等包声明的非目标平台 optional package（如 `@esbuild/aix-ppc64`）在 CI 打包时被误判为必须依赖。
  - 目标平台 `@esbuild/*` 二进制仍由 `verifyPackagedEsbuildBinaries()` fail-fast 校验，确保实际运行平台需要的 compiler binary 必须进入 `resources/node_modules` 且可执行。
  - 补充 runtime modules contract，固定 packaged closure 不会因缺失 optional platform package 失败。

### fix(core-app): scope macOS Spotlight file search

- `apps/core-app/src/main/modules/box-tool/addon/files/native-file-search-provider.ts`
  - macOS Spotlight fast file search 改为只在默认用户文件目录与 `FILE_INDEX_SETTINGS.extraPaths` 内执行，并对返回结果做二次 scope 过滤。
  - 系统框架内部资源（如 `/System/Library/PrivateFrameworks` 下的 Safari/MapsUI 图标）不再作为普通文件结果展示，避免 CoreBox 渲染时触发 `tfile://` 403 噪音。

### fix(core-app): generate indexed media thumbnails

- `apps/core-app/src/main/modules/box-tool/addon/files/{thumbnail-config,thumbnail-service,utils,file-provider}.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/workers/{thumbnail-worker,thumbnail-worker-client}.ts`
- `apps/core-app/src/main/modules/native-capabilities/{index,native-file-service}.ts`
- `apps/core-app/package.json`
- `apps/core-app/electron-builder.yml`
- `apps/core-app/scripts/build-target/runtime-modules.js`
  - FileProvider 缩略图生成从 Electron `nativeImage` worker 直连切到统一 thumbnail service；图片/HEIC/TIFF/WebP 等使用 `sharp`，视频使用 `ffmpeg-static`/`ffprobe-static` 抽帧后统一输出本地 JPEG cache。
  - 索引封面不再把新生成结果写入长期 data URL；`file_extensions.thumbnail` 保存本地 cache 路径，搜索展示继续通过 `tfile://` 渲染，历史合法 data URL 仍兼容。
  - 图片与视频分别使用 50MB / 2GB 上限；失败或不支持结果写入 `thumbnailStatus`，文件 `mtime/size` 未变化时跳过重复生成，降低损坏媒体和 Photos Library 类路径的重复 warning。
  - `native:media:get-thumbnail` 与 CoreBox 搜索复用同一 thumbnail worker；`media.thumbnail` capability 已标注图片+视频支持，ffmpeg 不可用时显式 degraded 但图片缩略图不受影响。
  - 打包清单补充 `sharp`、`@img`、`ffmpeg-static`、`ffprobe-static` 的 asar unpack/runtime modules，避免 native binary 或可执行文件被打包到不可执行位置。

### fix(core-app): normalize app identity and display-name indexing

- `apps/core-app/src/main/modules/box-tool/addon/apps/{app-provider,app-scanner,darwin,win,display-name-sync-utils}.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/*.{test,ts}`
- `packages/utils/transport/events/types/app-index.ts`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
  - AppProvider 将搜索索引 itemId 收敛到 canonical `appIdentity`，重建关键词前会清理 path/bundleId/launchTarget 等历史 itemId，避免同一 app 在 `search_index` 中分裂成多条记录。
  - 应用扫描新增 `identityKind`、`displayNameSource`、`displayNameQuality` 元数据并持久化到 `file_extensions`，诊断接口同步暴露这些字段；Windows desktop app 允许没有 `bundleId`。
  - macOS 新鲜扫描优先读取 `InfoPlist.strings` 本地化名称，mdls 增量扫描会覆盖旧的 filename/manifest fallback；已有 localized/system 名称不会被低质量来源降级。
  - Windows UWP 使用 AUMID canonical identity、PFN 作为可选 bundle alias；desktop/shortcut 将 Start Menu 名称、shortcut 名、target exe/path 合并到 aliases。
  - 设置页文案区分“文件索引重建”和“应用关键词/元数据重扫”，避免误以为文件索引重建会刷新 app 展示名。

### ci(release): harden beta release workflow

- `.github/workflows/build-and-release.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/package-ci.yml`
- `.github/workflows/package-*-publish.yml`
- `.github/workflows/{omnipanel-gate,package-utils-ci,package-unplugin-ci,aiapp-ci,release-drafter}.yml`
- `package.json`
- `apps/core-app/package.json`
- `apps/core-app/scripts/build-target.js`
- `notes/update_2.4.10-beta.19.{zh,en}.md`
  - `build-and-release` 新增显式 `beta` release type，手动触发默认 beta；tag 触发会从 `v*-beta*` / `*snapshot*` 自动推导 beta/snapshot/release 构建类型，避免 beta tag 进入 release 分支。
  - CoreApp 新增 `build:beta` / `build:beta:{win,mac,linux}`，根 workspace 同步新增平台脚本；beta 版本保留 `BETA` 运行时 metadata，但继续复用 snapshot packaging policy 与 Windows builder metadata 兼容转换。
  - 发布构建统一 Node `22.16.0`、pnpm `10.32.1`、frozen lockfile install 与 `pnpm approve-builds --all`；上传 artifact 收窄到安装包、压缩包和 updater metadata，减少 release 汇总下载体积。
  - `build-and-release` 增加 workflow concurrency 与 job 最小权限；`sync-nexus-release` 保留 `contents: read`，Release 创建 job 只在需要上传 release 时授予 `contents: write`。
  - 主 PR CI 从 `pull_request_target` 改为只读 `pull_request`，不再 checkout PR head 时携带写权限；主线分支过滤覆盖 `main/master`。
  - reusable package CI 与 package publish workflow 统一 `pnpm/action-setup@v4`；`omnipanel-gate`、utils/unplugin package CI、AI CI 与 Release Drafter 补齐 `master/main` 触发口径。
  - 补齐 `2.4.10-beta.19` 中英文 release notes，明确该版本仍为 beta 测试包，不宣称 Windows 真机 acceptance、性能采样和 Nexus Release Evidence 已完成。

### refactor(core-app): unify Nexus runtime API server resolver

- `packages/utils/env`
- `apps/core-app/src/main/modules/nexus/runtime-base.ts`
- `apps/core-app/src/renderer/src/modules/nexus/runtime-base.ts`
  - Core App runtime API 服务器选择统一收敛到 `resolveTuffNexusBaseUrl()`，唯一外部覆盖变量为 `TUFF_NEXUS_BASE_URL`。
  - 登录、同步、Telemetry/Analytics、插件商店、Agent Store、远程 preset 与 Nexus Intelligence 默认通道统一使用同一 runtime API base。
  - 不再因 dev/unpackaged 自动切到 `localhost:3200`；local 只由设置页“运行时 API 服务器”或显式 env 覆盖触发。
  - `dev.authServer` 持久化值启动/读取时只读迁移到 `dev.runtimeServer`，后续代码不再写入 auth 专用字段。
  - 更新源、About 协议/许可等官网外链保持官方 `https://tuff.tagzxia.com`，不跟随 runtime API server mode。
  - 旧 runtime API env 读取已移除：`VITE_NEXUS_URL`、`NEXUS_API_BASE`、`NEXUS_API_BASE_LOCAL`、`TPEX_API_BASE`、`AUTH_ORIGIN`、`TUFF_LOCAL_BASE_URL`。

### fix(core-app): serialize file icon cache writes

- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-icon-cache-service.ts`
  - 文件搜索懒加载图标持久化不再直接开启 libSQL transaction，改为复用 `withDbWrite` + `addFileExtensions` 的统一串行写入和 SQLite busy 重试路径。
  - 覆盖 `SQLITE_BUSY_SNAPSHOT` 场景下 icon/iconMeta cache 写入与搜索读请求并发时的数据库锁冲突。
  - 补充 `file-provider-icon-cache-service` 定向单测验证 icon cache 写入必须经过串行 DB write path。

### release(core-app): prepare 2.4.10-beta.19 test package

- `package.json`
- `apps/core-app/package.json`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - 将当前工作区基线同步到 `2.4.10-beta.19`，用于 Windows App 索引、App 图标缓存稳定性与 macOS `.app` 文件预览过滤的 beta 测试包准备。
  - 发版口径仍保持 beta/snapshot：Windows 真机 release evidence、性能采样与 Nexus Release Evidence 写入仍是正式 `2.4.10` blocker。

### refactor(core-app): keep app provider size guard clean

- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider-metadata-sync.ts`
  - 将 AppProvider 的 alternateNames/icon drift 与 stale extension key 纯判断迁出到 metadata sync helper，主类继续保留应用索引编排和 DB 写入职责。
  - `app-provider.ts` 回到 `3305` 行，低于当前 `3306` growth exception cap，避免 beta19 前触发 changed size guard。

### fix(core-app): move app search diagnostic into settings modal

- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndexAppDiagnostic.vue`
  - 高级设置中的“应用搜索诊断”改为列表入口，点击后打开独立弹窗承载单输入框、诊断、重建与证据导出操作。
  - 单输入框同时支持路径、bundleId、显示名与搜索词；前端会用同一个输入值执行目标定位与 query stage 诊断。
  - query stage 卡片可点击查看候选详情；N-gram 阶段会显示候选 `itemId` 与 `overlap`，便于定位短词/模糊召回来源。
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider-diagnostics.ts`
  - 诊断目标直接匹配失败时，会用输入值走 app 搜索索引召回并反查应用记录，支持 `chatapp` 等搜索词直接定位目标应用。
  - 诊断目标定位新增已入库关键词反查路径，支持 `wx` 这类短别名直接映射到应用 itemId，避免搜索词已入库但诊断返回 `target-not-found`。
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
  - 更新应用搜索诊断说明与占位文案，明确统一输入框支持多种查询格式。
- 诊断面板样式收回组件内，避免父级文件索引设置页继续承担弹窗内容布局。

## 2026-05-11

### fix(core-app): keep macOS app bundles out of file preview results

- `apps/core-app/src/main/modules/box-tool/addon/files/native-file-search-provider.ts`
  - macOS Spotlight 文件搜索不再把 `.app` bundle 输出为普通 `file` item，避免 CoreBox 中 QQ/ChatApp 等应用命中后进入文件预览面板。
  - 应用结果仍由 AppProvider 负责输出，保持 CoreBox item payload 结构不变。
  - 补充 `native-file-search-provider` 定向单测覆盖 `.app` bundle 路径识别与 Spotlight 搜索结果过滤。

### fix(core-app): stabilize CoreBox app icon cache

- `apps/core-app/src/main/modules/box-tool/addon/apps/darwin.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/search-processing-service.ts`
  - macOS app 图标缓存迁移到稳定 userData cache，并使用 bundle/app path hash 命名，避免系统临时目录清理后 CoreBox 持续加载失效 `tfile` 路径。
  - AppProvider 增加 icon drift 检测与旧 icon extension 清理；搜索结果构建时对缺失本地图标降级为 class fallback，不再向 renderer 输出失效图标 URL。
  - 补充 darwin/app-provider/search-processing-service 定向单测覆盖缓存生成复用、失效 icon 同步与搜索 fallback。

### refactor(tuff-intelligence): split DeepAgent input builders

- `packages/tuff-intelligence/src/adapters/deepagent-engine.ts`
- `packages/tuff-intelligence/src/adapters/deepagent-input.ts`
- `packages/tuff-intelligence/src/adapters/deepagent-input.test.ts`
- `scripts/large-file-boundary-allowlist.json`
  - 将 DeepAgent 的 TurnState 附件归一、chat message content 构造、Responses input 构造与模型上下文消息过滤迁出到 `deepagent-input.ts`，engine 保留 transport fallback、SSE 解析、LangChain/DeepAgent 调用与错误封装职责。
  - 保持 `deepagent-engine.ts` 的 `buildChatMessageContent`、`buildResponsesInput`、`resolveAttachmentImageUrl` 导出路径不变，避免影响现有 `aiapp-server` 入口与服务端调用。
  - `deepagent-engine.ts` 从 `2137` 行降到 `1791` 行，DeepAgent growth exception cap 从 `2138` 收紧到 `1792`，继续阻断回涨。
  - 验证：`pnpm -C "packages/tuff-intelligence" exec vitest run "src/adapters/deepagent-input.test.ts"` 通过（`3 tests`）；定向 ESLint、`size:guard --changed` 与 `pnpm -C "packages/tuff-intelligence" run build` 通过。

### refactor(core-app): split app provider source scanner

- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider-source-scanner.ts`
- `scripts/large-file-boundary-allowlist.json`
  - 将 AppProvider 的 scanned app 加载、scanned app key map、DB app scanned/manual partition 与 missing icon 记录编排迁出到 `AppProviderSourceScanner`。
  - 保持 AppProvider search result shape、launch 行为、缓存 key、索引 schema 与外部 provider id 不变；本轮不触碰 launch resolver 与 metadata enrichment。
  - `app-provider.ts` 从 `3324` 行降到 `3305` 行，growth exception cap 从 `3330` 收紧到 `3306`，继续阻断回涨。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/apps/app-provider.test.ts"` 通过（`28 tests`）；CoreApp node typecheck、定向 ESLint 与 `size:guard --changed` 通过。

### refactor(core-app): extract clipboard capture pipeline

- `apps/core-app/src/main/modules/clipboard.ts`
- `apps/core-app/src/main/modules/clipboard/clipboard-capture-pipeline.ts`
- `apps/core-app/src/main/modules/clipboard/clipboard-capture-pipeline.test.ts`
- `apps/core-app/src/main/modules/clipboard/clipboard-polling-policy.ts`
- `apps/core-app/src/main/modules/clipboard/clipboard-native-watcher.ts`
- `apps/core-app/src/main/modules/clipboard/clipboard-meta-persistence.ts`
- `apps/core-app/src/main/modules/clipboard/clipboard-stage-b-enrichment.ts`
- `apps/nexus/i18n/locales/{en,zh}.ts`
- `apps/nexus/i18n/locales/legal/{en,zh}.ts`
- `scripts/large-file-boundary-allowlist.json`
  - 将 clipboard capture/persist 主流程迁出到 `ClipboardCapturePipeline`，`ClipboardModule` 保留模块生命周期、调度、transport 与服务编排。
  - 同轮完成 polling policy、native watcher、meta persistence 与 stage-B enrichment helper 接入，保持 `ClipboardEvents.*` 外部事件名、payload、action result 与 history DB schema 不变。
  - 补充 capture pipeline 文本剪贴板持久化、meta、Stage-B 队列与 plugin forward 回归测试。
  - Nexus legal i18n 从主 locale 文件拆到 `locales/legal/*`，降低 locale 主文件体积并保持 `license/privacy/protocol` key 不变。
  - `clipboard.ts` 已降到 `1143` 行，低于 `1200` 阈值，并从 size allowlist 与 growth exception 中清退。
  - 验证：11 个 Clipboard 定向测试（`37 tests`）、CoreApp node typecheck、定向 ESLint、`size:guard --changed` 与 `size:guard --report` 通过。

### refactor(nexus): split sign-in redirect helpers and docs assistant audit meta

- `apps/nexus/app/composables/useSignIn.ts`
- `apps/nexus/app/composables/sign-in-redirect-utils.ts`
- `apps/nexus/server/api/docs/assistant.post.ts`
- `apps/nexus/server/utils/requestAuditMeta.ts`
- `apps/nexus/server/utils/tuffIntelligenceLabService.ts`
- `apps/nexus/server/utils/tuffIntelligenceLabTools.ts`
- `apps/nexus/server/utils/telemetryStore.ts`
- `apps/nexus/server/utils/telemetrySanitizer.ts`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/i18n/locales/legal/en.ts`
- `apps/nexus/i18n/locales/legal/zh.ts`
- `scripts/lib/scan-config.mjs`
  - 将登录 composable 中 OAuth redirect 查询值读取、URL-like 解析与 auth-noise redirect fallback 归一迁出到 `sign-in-redirect-utils.ts`，`useSignIn.ts` 保留登录/注册/OAuth/Turnstile/passkey 编排职责。
  - 将 docs assistant API 中 request IP/country audit metadata 解析迁出到 `requestAuditMeta.ts`，handler 保留认证、session、provider 调用、credit 与 audit 编排职责。
  - 将 Intelligence Lab 的工具常量、支持工具列表、account/credits/subscription/language/theme 工具执行与输入归一迁出到 `tuffIntelligenceLabTools.ts`，Lab service 保留 orchestration、checkpoint、stream 与审批编排。
  - 将 telemetry input/type/sanitizer、provider status/value 归一、feature/search metadata 清洗和 quarantine stringify 迁出到 `telemetrySanitizer.ts`，`telemetryStore.ts` 保留 D1 schema、写入、daily stat 与 analytics 查询职责。
  - 将 Nexus `license/privacy/protocol` 静态法律文案迁出到 `locales/legal/*` shard，原 `license.*` / `privacy.*` / `protocol.*` key 通过 `...legal` 保持不变；scope guard 对这两个 i18n shard 按现有 locale 文件同类豁免。
  - `useSignIn.ts` 从 `1584` 行降到 `1538` 行，`assistant.post.ts` 从 `1792` 行降到 `1762` 行，`tuffIntelligenceLabService.ts` 从 `3658` 行降到 `3408` 行，`telemetryStore.ts` 从 `1985` 行降到 `1502` 行；四者均退出 `grownOversizedFiles`，当前 `node scripts/check-large-file-boundaries.mjs --report` 显示 `newOversizedFiles=0`、`grownOversizedFiles=2`。
  - 验证：Nexus 定向 ESLint、`telemetryStore.test.ts`、`vue-tsc --noEmit --pretty false` 通过；`node scripts/check-large-file-boundaries.mjs --report` 通过。

### refactor(core-app): split OmniPanel builtin definitions

- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `apps/core-app/src/main/modules/omni-panel/omni-panel-builtin-features.ts`
- `apps/core-app/src/main/modules/omni-panel/index.test.ts`
  - 将 OmniPanel 内置 feature 定义、内置 feature map 与执行错误消息迁出到 `omni-panel-builtin-features.ts`，主模块保留 registry 初始化、执行分发与 input hook 生命周期。
  - `index.test.ts` 对 `uiohook-napi` 改为纯 JS stub，避免单测在无 Accessibility 权限环境真实加载 native hook 导致 worker IPC 崩溃。
  - `omni-panel/index.ts` 从 `1885` 行降到 `1845` 行，低于当前 exception cap `1868`；CoreApp 当前不再出现在 `grownOversizedFiles` 列表。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/omni-panel/index.test.ts"` 通过（`20 tests`）；定向 ESLint 通过。

### refactor(core-app): split update asset utilities

- `apps/core-app/src/main/modules/update/update-system.ts`
- `apps/core-app/src/main/modules/update/update-asset-utils.ts`
  - 将更新资产打分、安装包后缀优先级、manifest/metadata/signature/checksum/auxiliary asset 分类与签名后缀归一迁出到 `update-asset-utils.ts`。
  - `update-system.ts` 从 `1697` 行降到 `1610` 行，低于当前 baseline `1674`，该文件退出 `grownOversizedFiles`。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/update/update-system.test.ts"` 通过（`4 tests`）；定向 ESLint 通过。

### refactor(core-app): split app provider path helpers

- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider-path-utils.ts`
  - 将 AppProvider 中 UWP shell path/app id 判断、可选字符串归一化与 managed entry launch kind 推断迁出到 `app-provider-path-utils.ts`。
  - `app-provider.ts` 从 `3341` 行降到 `3324` 行，低于当前 exception cap `3330`，该文件退出 `grownOversizedFiles`。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/apps/app-provider.test.ts"` 通过（`28 tests`）；定向 ESLint 通过（仅保留测试文件既有 `no-explicit-any` warnings）。

### refactor(core-app): split app provider test harness

- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider-test-harness.ts`
  - 将 AppProvider 测试的 hoisted mocks、平台切换、subject loader、deferred/flush helper、extension row helper 与私有测试类型迁出到 `app-provider-test-harness.ts`。
  - 保持 28 个 AppProvider 回归用例主体、断言与 mock 目标不变；`app-provider.test.ts` 从 `1806` 行降到 `1400` 行，低于当前 exception cap `1517`，该文件退出 `grownOversizedFiles`。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/apps/app-provider.test.ts"` 通过（`28 tests`）；定向 ESLint 通过（保留测试文件既有 `no-explicit-any` warnings）。

### refactor(core-app): split SearchCore utilities

- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core-utils.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.trace.test.ts`
  - 将 SearchCore 中 provider alias/filter/category、filter parser/matcher、activation key、stable cache key/hash、duration rounding、query hash、provider summary/telemetry 与 scene resolver 等纯 helper 迁出到 `search-core-utils.ts`。
  - `search-core.ts` 从超过 exception cap 的 grown 状态降到 `2475` 行，低于当前 cap `2581`，该文件退出 `grownOversizedFiles`。
  - 验证：定向 ESLint 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/search-core.regression-baseline.test.ts" "src/main/modules/box-tool/search-engine/search-core.trace.test.ts"` 通过（`8 tests`）。

### refactor(intelligence-uikit): split playground state

- `packages/intelligence-uikit/src/playground/App.vue`
- `packages/intelligence-uikit/src/playground/usePlaygroundState.ts`
  - 将 playground 的 mock timeline、live DeepAgent 状态、设置持久化、播放控制与本地 invoke client 迁出到 `usePlaygroundState.ts`，`App.vue` 保留组件导入、模板与样式。
  - `App.vue` 从 `1643` 行降到 `919` 行，低于 `1200` 阈值；`node scripts/check-large-file-boundaries.mjs --report` 当前显示 `newOversizedFiles=0`、`grownOversizedFiles=13`。
  - 验证：`pnpm -C "packages/intelligence-uikit" exec eslint "src/playground/App.vue" "src/playground/usePlaygroundState.ts"` 通过；`pnpm -C "packages/intelligence-uikit" run typecheck` 通过。

### refactor(core-app): split clipboard image persistence

- `apps/core-app/src/main/modules/clipboard.ts`
- `apps/core-app/src/main/modules/clipboard/clipboard-image-persistence.ts`
- `apps/core-app/src/main/modules/clipboard/clipboard-image-persistence.test.ts`
- `apps/core-app/src/main/modules/clipboard/clipboard-autopaste-automation.ts`
- `scripts/large-file-boundary-allowlist.json`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - Clipboard 第五个 SRP 切片完成：live image read、临时图片 namespace 注册、orphan cleanup 与 native image source reconstruction 迁出到 `clipboard-image-persistence.ts`。
  - 主模块继续保留 clipboard monitor / Stage-B 编排；`ClipboardEvents.readImage/write/apply/copyAndPaste` 外部事件名、payload、返回 shape 与图片历史存储 schema 保持兼容。
  - `clipboard-autopaste-automation.ts` 复用 image persistence 的 source reconstruction，避免图片恢复逻辑重复。
  - `clipboard.ts` 从 `1960` cap 继续降到 `1825` cap，`large-file-boundary-allowlist` 中对应 entry 与 growth exception cap 同步收紧。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/clipboard/clipboard-image-persistence.test.ts" "src/main/modules/clipboard/clipboard-autopaste-automation.test.ts" "src/main/modules/clipboard/clipboard-transport-handlers.test.ts" "src/main/modules/clipboard/clipboard-history-persistence.test.ts" "src/main/modules/clipboard/clipboard-capture-freshness.test.ts" "src/main/modules/clipboard/clipboard-freshness.test.ts"` 通过（`23 tests`）；定向 ESLint、`node --check` 与 `size:guard --changed` 通过。

### refactor(core-app): split recommendation engine utilities

- `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/recommendation-utils.ts`
  - 将 recommendation engine 中无副作用的错误日志 meta 归一、day bucket 与 time-context boost / relevance score 迁出到 `recommendation-utils.ts`。
  - 保持 `recommendation-engine.ts` 对 `calculateTimeContextBoost` / `calculateTimeRelevanceScore` 的 re-export，现有测试与外部引用无需迁移。
  - `recommendation-engine.ts` 从 `1930` 行降到 `1869` 行，`node scripts/check-large-file-boundaries.mjs --report` 中 `grownOversizedFiles` 从 `15` 降到 `14`，该文件不再超过 exception cap。
  - 验证：定向 ESLint 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.test.ts"` 通过（`7 tests`）。

### refactor(core-app): split clipboard autopaste automation

- `apps/core-app/src/main/modules/clipboard.ts`
- `apps/core-app/src/main/modules/clipboard/clipboard-autopaste-automation.ts`
- `apps/core-app/src/main/modules/clipboard/clipboard-autopaste-automation.test.ts`
- `apps/core-app/src/main/modules/clipboard/clipboard-request-normalizer.ts`
- `scripts/large-file-boundary-allowlist.json`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - Clipboard 第四个 SRP 切片完成：copy/apply/paste 自动化、history apply action result、auto paste capability check、CoreBox hide、平台 paste shortcut、失败通知与 clipboard item 写入迁出到 `clipboard-autopaste-automation.ts`。
  - 主模块保留 transport wiring、history persistence、monitoring 与 Stage-B 编排；外部 `ClipboardEvents.apply/copyAndPaste/write` payload、action result code/message、storage schema 与事件名保持兼容。
  - `clipboard.ts` 从 `2282` 行降到 `1960` 行，`large-file-boundary-allowlist` 中对应 entry 与 growth exception cap 同步收紧到 `1960`。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/clipboard/clipboard-autopaste-automation.test.ts" "src/main/modules/clipboard/clipboard-transport-handlers.test.ts" "src/main/modules/clipboard/clipboard-history-persistence.test.ts" "src/main/modules/clipboard/clipboard-capture-freshness.test.ts" "src/main/modules/clipboard/clipboard-freshness.test.ts"`、定向 ESLint、`size:guard --changed` 与 helper `node --check` 通过；CoreApp node typecheck 仍被当前并行 shared/scripts TS6307 与 `update-diagnostic-verifier.ts` nullability 阻断，本轮 clipboard 相关类型错误已清零。

### docs(release): promote Windows evidence and performance checks to 2.4.10 gate

- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - 将当前版本 Windows 发版 gate 明确写入入口文档、TODO 与质量基线：功能实现与本地 verifier 进入收口态，但当前版本仍必须等待 Windows 真机 evidence、性能 evidence 与 Nexus Release Evidence 写入。
  - 发版阻塞项固定为 Windows acceptance manifest 最终强门禁、常见 App 启动、复制 app path 加入本地启动区、Everything target probe、自动安装更新、DivisionBox detached widget、分时推荐、search trace `200` 样本、clipboard stress `120000ms` 压测与 Release Evidence 写入闭环。

### refactor(core-app): split Windows acceptance verifier size debt

- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-command-requirements.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-evidence-verifier.test.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-test-utils.ts`
  - Windows acceptance release command requirements、search trace / clipboard stress 固定预算迁出到独立 command requirements 模块，manifest verifier 保留 schema 判定、case/performance gate 复算与 manifest 汇总评估职责。
  - acceptance 测试拆分为 manifest gate 规则与 case/performance evidence 复算两个 spec，通用 manifest fixture 下沉到测试 helper，避免单个测试文件继续承载全部验收场景。
  - `windows-acceptance-manifest-verifier.ts` 降到 `1136` 行，`windows-acceptance-manifest-verifier.test.ts` 降到 `1156` 行，新增 evidence spec 为 `753` 行；`node scripts/check-large-file-boundaries.mjs --report` 显示 `newOversizedFiles=0`。
  - 验证：定向 ESLint 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts" "src/main/modules/platform/windows-acceptance-evidence-verifier.test.ts"` 通过（`45 tests`）。

### fix(core-app): restore app icon image rendering

- `apps/core-app/src/main/modules/box-tool/addon/apps/search-processing-service.ts`
- `apps/core-app/src/renderer/src/views/base/application/AppConfigure.vue`
  - App provider 搜索结果保留 `data:image/...` 图标，继续将本地路径归一化为 `tfile://`，空图标沿用原 fallback 路径。
  - Application 详情页 logo 改为复用统一 `PluginIcon/TuffIcon` 渲染链，避免直接 `<img>` 绕过 `tfile/file/data/url` 处理导致 app 图片加载失败。

### refactor(nexus): split provider registry admin helpers and harden typed fetches

- `apps/nexus/app/pages/dashboard/admin/provider-registry.vue`
- `apps/nexus/app/composables/useProviderRegistryAdmin.ts`
- `apps/nexus/app/utils/provider-registry-admin.ts`
- `apps/nexus/server/api/dashboard/provider-registry/provider-registry.api.test.ts`
- `apps/nexus/server/api/dashboard/provider-registry/provider-registry-test-utils.ts`
- `apps/nexus/app/pages/dashboard/admin/intelligence.vue`
- `apps/nexus/app/pages/dashboard/admin/reviews.vue`
- `apps/nexus/app/pages/dashboard/admin/risk.vue`
- `apps/nexus/app/pages/dashboard/admin/subscriptions.vue`
- `apps/nexus/app/pages/dashboard/admin/users.vue`
- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/app/pages/notes/[slug].vue`
- `apps/nexus/app/pages/team/join.vue`
  - Provider Registry Admin 页面的类型、选项常量、表单工厂与纯 helper 迁出到 `provider-registry-admin.ts`，页面状态、API action、edit/run panel 管理与 admin redirect 迁出到 `useProviderRegistryAdmin.ts`。
  - `provider-registry.vue` 从约 `2026` 行降到 `999` 行，低于 `1200` 行 size guard 阈值；`node scripts/check-large-file-boundaries.mjs --report` 中 `oversizedFiles` 从 `58` 降到 `57`，该页面不再出现在 new oversized 列表。
  - Provider Registry API 测试的 Mock D1、row 类型、event factory 与腾讯云 provider fixture 迁出到 `provider-registry-test-utils.ts`，`provider-registry.api.test.ts` 从 `1313` 行降到 `951` 行，同样低于 `1200` 行阈值。
  - Nexus 页面内易触发 Nuxt typed route 递归推导的 `$fetch` 调用统一改为 `ofetch` `rawFetch`，不改变 URL、method、query、body 或响应处理语义。
  - 验证：`pnpm -C "apps/nexus" run typecheck` 通过；定向 ESLint 与 Provider Registry API Vitest 通过；`node scripts/check-large-file-boundaries.mjs --report` 显示 `oversizedFiles=56`、`newOversizedFiles=3`。

### test(core-app): hard-cut Everything diagnostic legacy fixture wording

- `apps/core-app/src/main/modules/platform/everything-diagnostic-verifier.test.ts`
  - Everything diagnostic malformed backend attempt 测试中的造数名称从 `legacy-sdk` 改为中性 `retired-sdk`，避免测试 fixture 重新触发 legacy keyword 清册。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/platform/everything-diagnostic-verifier.test.ts"` 通过；`pnpm compat:registry:guard` 恢复 `legacy-keyword=0`。

### fix(core-app): preserve time-based recommendation source on dedupe

- `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - Recommendation candidates 去重时，如果同一 App 先由 frequent 进入候选、后续又由 time-based 命中，会继续保留后续 `timeStats`，并把最终 candidate `source` 提升为 `time-based`。
  - 这样排序层和 UI/验收 evidence 看到的 `meta.recommendation.source` 一致，早/午分时命中的推荐不会只显示成普通 frequent 推荐。
  - 更新推荐引擎回归，固定 `morning-app` 在同一候选集内压过高频 `plain-app` 后，最终 metadata 标记为 `time-based`。

### fix(core-app): boost app alias prefix intent in search sorting

- `apps/core-app/src/main/modules/box-tool/search-engine/sort/tuff-sorter.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/sort/tuff-sorter.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - App `searchTokens` 的前缀命中现在也作为明确 App intent 加权，覆盖 `vscod -> vscode` 这类用户输入别名前缀时想启动 App 的场景。
  - 前缀别名 bonus 低于精确别名 token，继续保留极高频可见标题 plugin feature 通过行为学习前置的边界。
  - 新增 `tuff-sorter` 回归：`Visual Studio Code` 的 `vscod` 前缀别名命中会排在中等频次 `Vscod Tools` plugin feature 可见标题前。

### feat(core-app): expand native transport v1 domains

- `packages/utils/transport/events/types/native.ts`
- `packages/utils/transport/events/index.ts`
- `packages/utils/transport/sdk/domains/native.ts`
- `packages/utils/permission/*`
- `apps/core-app/src/main/modules/native-capabilities/*`
- `apps/core-app/src/main/modules/permission/permission-guard.ts`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - `NativeEvents` 从 screenshot 首切扩展为 `capabilities`、`screenshot`、`file-index`、`file`、`media` 五域，新增 `NativeCapabilityStatus`、`NativeResourceRef` 与 `NativeOperationResult` 类型；`createNativeSdk()` 同步暴露 `capabilities/fileIndex/file/media` 子 SDK。
  - CoreApp `NativeCapabilitiesModule` 复用现有 `fileProvider` / `everythingProvider` / `tempFileService` / thumbnail worker，桥接 file-index status/stats/query/rebuild/add-path/progress、文件 stat/open/reveal/icon/thumbnail/tfile 与媒体 metadata/thumbnail；V1 不重写索引、不迁移 OCR/Clipboard、不做媒体转码。
  - 权限映射补齐 `native:screenshot:* -> window.capture`、`native:file-index:* -> fs.index`、`native:file:* -> fs.read`、`native:media:* -> media.read`，并新增 `fs.index` / `media.read` permission 定义与 i18n 文案。
  - 大资源默认返回短期 `tfile://` 引用和 metadata，`data-url` 只保留为显式请求输出。

### refactor(tuffex): split FlipOverlay stack registry

- `packages/tuffex/packages/components/src/flip-overlay/src/TxFlipOverlay.vue`
- `packages/tuffex/packages/components/src/flip-overlay/src/flip-overlay-stack.ts`
- `scripts/large-file-boundary-allowlist.json`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
  - `TxFlipOverlay.vue` 的 stack registry、共享全局 mask、stack opacity/size matching 与 overlay instance/open sequence 逻辑迁出到 `flip-overlay-stack.ts`，组件 SFC 保留渲染状态、动画编排、body lock 与模板样式职责。
  - `TxFlipOverlay.vue` 从 `1344` 行降到 `1194` 行，低于 `1200` 行 size guard 阈值；清退 `SIZE-GROWTH-2026-05-08-TUFFEX-FLIP-OVERLAY` 的 allowlist baseline/growth exception 与 registry 条目。
  - 现有多层 stack、透明度、mask owner、body lock 与 prevent accidental close 行为不变，继续由 `flip-overlay.test.ts` 覆盖。

### test(core-app): reject placeholder Windows acceptance fields

- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - Windows acceptance manifest 的结构化手工字段新增统一填充值校验，`manualChecks.commonAppLaunch / copiedAppPath / updateInstall / divisionBoxDetachedWidget / timeAwareRecommendation` 的必填字符串字段不再接受 `<...>` 模板占位、`N/A` / `NA` / `none` / `TODO` / `TBD` / `-` / `待补` / `无`。
  - 这些 manual check 的 `evidencePath` 同步纳入占位拒绝，避免只启用结构化 manual gate、暂未启用文件存在校验时，用 `<manual-evidence-path>` / `TODO` / `N/A` 等路径占位绕过。
  - `windows:acceptance:verify --requireCompletedManualEvidence` 的 Markdown `## Evidence` 必填 label 同步拒绝 `<...>` 模板占位，和 manifest 结构化字段保持同一实际证据口径。
  - `dayOfWeek` 继续走 `0..6` 数字门禁；占位拒绝只收口字符串证据字段，保持现有 manifest schema 简单。
  - 新增回归覆盖生成模板占位值被最终手工 gate 当作缺失处理，避免只把模板原样归档后通过 Windows 真机 acceptance。

### refactor(governance): hard-cut sdkapi and aiapp compat filenames

- `apps/core-app/src/main/modules/plugin/sdkapi-hard-cut-gate.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.ts`
- `apps/core-app/src/main/modules/plugin/plugin-installer.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/main/modules/permission/permission-store.ts`
- `retired-ai-app/server/utils/aiapp-aigc-service.ts`
- `retired-ai-app/server/utils/aiapp-payment-service.ts`
- `retired-ai-app/server/utils/aiapp-system-seeds.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/docs/DEBT-GOVERNANCE-BOARD-2026-03-17.md`
- `docs/plan-prd/docs/DEBT-GOVERNANCE-EXECUTION-CHECKLIST-2026-03-17.md`
  - 插件 sdkapi gate 文件从 `sdk-compat.ts` 物理硬切为 `sdkapi-hard-cut-gate.ts`，内部导出同步从 `getPluginSdkCompatibilityGate()` / `PluginSdkCompatibilityGate` 改为 `getPluginSdkHardCutGate()` / `PluginSdkHardCutGate`，行为仍保持缺失、非法、过低或未支持 `sdkapi` 直接阻断。
  - AI 三个 `aiapp-compat-*` utility 文件改为领域服务命名：`aiapp-aigc-service.ts`、`aiapp-payment-service.ts`、`aiapp-system-seeds.ts`，只更新 import，不新增兼容 re-export 壳。
  - `compatibility-debt-registry.csv` 清退对应 4 条 `compat-file`，当时 registry 降为 `37` 条、`compat-file=5`；治理看板与执行清单同步从 2026-03 旧快照对齐到当前 SoT。

### test(core-app): require structured Windows update install evidence

- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - `manualChecks.updateInstall` 新增结构化 `updateDiagnosticEvidencePath / installerPath / installerMode / uacPromptEvidence / appExitEvidence / installerExitEvidence / installedVersionEvidence / appRelaunchEvidence / failureRollbackEvidence` 字段。
  - `windows:acceptance:verify --requireUpdateInstallManualChecks` 现在会在布尔项之外复核这些字段非空，避免 Windows 更新安装验收只勾选 UAC/退出/版本/重启/回滚而没有可复核证据。
  - `windows:acceptance:template` 生成的 update install 手工证据头部同步增加对应填写位。

### test(core-app): require structured copied app path evidence

- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - `manualChecks.copiedAppPath` 新增结构化 `copiedSource / normalizedAppPath / addToLocalLaunchAreaAction / localLaunchEntryEvidence / appIndexDiagnosticEvidencePath / searchQueryAfterReindex / indexedSearchResultEvidence / indexedResultLaunchEvidence` 字段。
  - `windows:acceptance:verify --requireCopiedAppPathManualChecks` 现在会在布尔项之外复核这些字段非空，避免复制 app path 验收只勾选 action/reindex/search/launch 却没有可复核复制源、本地启动区条目、App Index 诊断、搜索结果与启动证据。
  - `windows:acceptance:template` 生成的 copied app path 手工证据头部同步增加对应填写位。

### refactor(core-app): split clipboard transport handlers

- `apps/core-app/src/main/modules/clipboard.ts`
- `apps/core-app/src/main/modules/clipboard/clipboard-transport-handlers.ts`
- `apps/core-app/src/main/modules/clipboard/clipboard-transport-handlers.test.ts`
- `scripts/large-file-boundary-allowlist.json`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - Clipboard 第三个 SRP 切片完成：typed query/mutation/read/stream handler 注册与 change stream fanout 迁出到 `clipboard-transport-handlers.ts`，主模块通过回调注入 history/read/write/apply 能力，继续保留实际 clipboard 写入与 autopaste 业务逻辑。
  - 外部 `ClipboardEvents.*` 事件名、request/response payload、stream payload 与 storage schema 保持不变；新测试固定 history response shape、permission enforcement 入口、change stream fanout 与 disposer 清理。
  - `clipboard.ts` 从 `2457` 行降到 `2282` 行，`large-file-boundary-allowlist` 中对应 entry 与 growth exception cap 同步收紧到 `2282`。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/clipboard/clipboard-transport-handlers.test.ts" "src/main/modules/clipboard/clipboard-history-persistence.test.ts" "src/main/modules/clipboard/clipboard-capture-freshness.test.ts" "src/main/modules/clipboard/clipboard-freshness.test.ts"`、定向 ESLint、`size:guard --changed` 与 helper `node --check` 通过。

### test(core-app): require structured common app launch evidence

- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - `manualChecks.commonAppLaunch.checks[]` 新增结构化 `searchQuery / observedDisplayName / iconEvidence / observedLaunchTarget / coreBoxHiddenEvidence` 字段。
  - `windows:acceptance:verify --requireCommonAppLaunchDetails` 现在会在布尔项之外复核这些字段非空，避免常见 App 启动验收只勾选可搜/可启动/隐藏而缺少可复核查询、显示名、图标、启动目标与隐藏证据。
  - `windows:acceptance:template` 生成的 common app 手工证据头部同步增加对应填写位。

### refactor(core-app): type download migration push events

- `packages/utils/transport/events/types/download.ts`
- `packages/utils/transport/events/index.ts`
- `packages/utils/__tests__/transport-event-boundary.test.ts`
- `apps/core-app/src/renderer/src/components/download/MigrationProgress.vue`
- `apps/core-app/src/main/modules/download/API.md`
- `docs/plan-prd/03-features/download-update/DOWNLOAD_CENTER_REFERENCE.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - `DownloadEvents.migration` 新增 typed `progress` / `result` push events 与共享 payload 类型，事件名统一为 `download:migration:progress` / `download:migration:result`。
  - `MigrationProgress.vue` 移除局部 `defineRawEvent('download:migration-*')`，改用 shared `DownloadEvents.migration.progress/result`，避免符合 typed builder 结构的下载迁移事件继续停留在 renderer 私有 raw 定义里。
  - CoreApp 下载 API 与下载中心参考文档同步改为 domain SDK / typed event 示例，不再公开旧 `download:migration-progress` raw listener 写法。
  - `transport-event-boundary.test.ts` 新增断言，固定下载迁移 push events 已纳入 typed event registry；retained raw definition 上限按当前扫描口径从 `266` 收紧到 `264`。

### chore(core-app): clarify sdkapi hard-cut wording

- `apps/core-app/src/main/modules/plugin/plugin-loaders.ts`
- `apps/core-app/src/main/modules/plugin/plugin-installer.ts`
- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `packages/utils/plugin/index.ts`
- `apps/core-app/src/renderer/src/composables/store/store-install-error-utils.ts`
- `apps/core-app/src/renderer/src/composables/store/store-install-error-utils.test.ts`
  - 插件 `sdkapi` 注释与 fallback error message 从 compatibility checking/gate 改为 hard-cut runtime gating，避免把当前“缺失/过低/未知 sdkapi 直接阻断”的策略描述成软兼容层。
  - Store install error reason 解析删除旧 `sdkapi compatibility gate` 文案分支，改为当前 `sdkapi hard-cut gate` 文案并补回归。
  - 后续已在同日治理切片中完成物理文件名与导出名 hard-cut；当前入口为 `sdkapi-hard-cut-gate.ts` 的 `getPluginSdkHardCutGate()`。

### test(core-app): require structured time-aware recommendation evidence

- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `apps/core-app/scripts/windows-acceptance-manual-evidence.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-verify-script.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - `manualChecks.timeAwareRecommendation` 新增结构化 `morningTimeSlot / afternoonTimeSlot / dayOfWeek / morningTopItemId/sourceId / afternoonTopItemId/sourceId / frequentComparisonItemId/sourceId` 字段。
  - `windows:acceptance:verify --requireTimeAwareRecommendationManualChecks` 现在会复核早/午 timeSlot 不同、dayOfWeek 合法、早/午 top recommendation 不同且频率对照项存在，避免只勾选布尔项或只填截图就通过分时推荐验收。
  - 结构化字段新增早/午 `recommendationSource` 与 frequent comparison `recommendationSource`，最终 gate 要求早/午来源为 `time-based`、频率对照来源为 `frequent`，避免只证明 provider source 相同或截图不同，却没有证明分时推荐信号实际命中。
  - 手工 evidence 模板同步补充早/午 top item/source 与 frequent comparison item/source 字段，和 manifest 结构化字段保持一致。

### chore(governance): tighten compat filename shim marker

- `scripts/check-compatibility-debt-registry.mjs`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - `compat-file` 扫描中 `compat`、`shim/shims` 只按独立命名段匹配，其中 `shim/shims` 还会排除 declaration-only `.d.ts`。
  - 移除 `ShimmerText.vue`、declaration-only `shims*.d.ts` 与 `langchain-openai-compatible-provider.ts` 的误伤 registry 行；组件名中的 `shimmer`、Vue ambient typing 和 OpenAI-compatible provider 领域术语不再被当作兼容债务，避免为治理噪声做无意义物理改名。

### test(core-app): require detached widget URL identity in acceptance

- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `apps/core-app/scripts/windows-acceptance-manual-evidence.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - `manualChecks.divisionBoxDetachedWidget` 新增结构化 `expectedFeaturePluginId / observedSessionPluginId / detachedUrlSource / detachedUrlProviderSource` 字段。
  - `windows:acceptance:verify --requireDivisionBoxDetachedWidgetManualChecks` 现在会直接复核 observed session pluginId 与 detached URL `source` 都等于真实 feature pluginId，并要求 `providerSource=plugin-features`，避免只勾选布尔项或只在 Markdown 中泛化描述就通过 detached widget 验收。
  - 手工 evidence 模板同步新增 `Detached URL source pluginId` 与 `Detached URL providerSource` 字段，和 manifest 结构化字段保持一致。

### test(core-app): require managed entry for copied app path diagnostics

- `apps/core-app/src/main/modules/platform/app-index-diagnostic-verifier.ts`
- `apps/core-app/src/main/modules/platform/app-index-diagnostic-verifier.test.ts`
- `apps/core-app/scripts/app-index-diagnostic-verify.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - `app-index:diagnostic:verify` 新增 `--requireManagedEntry`，要求诊断 app 同时具备 `entrySource=manual` 与 `entryEnabled=true`。
  - `windows-copied-app-path-index` acceptance 模板的 app-index verifier command 默认携带该门禁，避免复制 app path 链路只证明普通 scanned/path app 可搜可启动，却未证明它已经写入本地启动区 managed entry。
  - Windows acceptance 复算层与 verifier-command gate 同步要求 copied-path app-index 子证据启用 `--requireManagedEntry`，防止手写 manifest 漏掉 managed entry 门禁仍通过 release flag 检查。

### test(core-app): cover Chinese app title sort intent

- `apps/core-app/src/main/modules/box-tool/search-engine/sort/tuff-sorter.test.ts`
- `docs/plan-prd/TODO.md`
  - 补充中文 App 查询排序回归：查询 `聊天应用` 时，App 标题精确/前缀命中会排在中等频次、同样可见标题命中的 `聊天应用工具箱` plugin feature 前。
  - 该用例固定 Windows 常见中文 App 名搜索意图，避免后续排序优化只覆盖英文 word/prefix 场景而让中文 App 被中等频 feature 抢首位。

### test(core-app): cover shortcut property target app-index action

- `apps/core-app/src/main/modules/box-tool/addon/system/system-actions-provider.test.ts`
- `docs/plan-prd/TODO.md`
  - 补充复制 app path 入口的 Windows 快捷方式属性页文本回归：`Target: "C:\\...\\Demo Tool.exe" --profile work` 这类多行复制内容会提取真实 `.exe` 路径，并继续生成 app-index action。
  - 该回归固定用户从快捷方式属性、终端或说明文档复制带 label/参数的应用启动目标后，仍能触发 add-to-local-launch-area 并进入本地启动区索引链路。

### test(core-app): generate Windows acceptance collection plan

- `apps/core-app/scripts/windows-acceptance-template.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-verify-script.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - `windows:acceptance:template` 新增 `--writeCollectionPlan`，在 manifest 旁按 evidenceDir 非覆盖式生成 `WINDOWS_ACCEPTANCE_COLLECTION_PLAN.md`，把 case evidence path、单项 verifier command、search trace / clipboard stress 采集与复核命令、manual evidence path 和最终 recommended gate 汇总到一个真机采集清单。
  - collection plan 直接从 manifest 结构渲染，不维护第二套 gate 字符串；case verifier 与性能 verifier 命令会替换为 manifest 中的实际 evidence path，并为 capability evidence 输出 `windows:capability:evidence --output ...` 采集命令；只保留 `<core-app-log-file>` / `<downloaded-installer-path>` 这类必须由真机采证人提供的输入占位符，避免 Windows 真机采证时从 TODO 长段落手工拼命令导致漏掉强门禁或路径漂移。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/platform/windows-acceptance-verify-script.test.ts"` 通过（`15 tests`）；`pnpm -C "apps/core-app" run typecheck:node`、`pnpm docs:guard` 与 scoped `git diff --check` 通过；临时执行 `windows-acceptance-template --writeCollectionPlan` 已生成包含实际 case gate 路径、性能采样、manual evidence 与 final gate 的 collection plan。

### refactor(core-app): split clipboard history persistence

- `apps/core-app/src/main/modules/clipboard.ts`
- `apps/core-app/src/main/modules/clipboard/clipboard-history-persistence.ts`
- `apps/core-app/src/main/modules/clipboard/clipboard-history-persistence.test.ts`
- `scripts/check-large-file-boundaries.mjs`
- `scripts/large-file-boundary-allowlist.json`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - Clipboard 第二个 SRP 切片完成：history persistence / cache / query / favorite-delete / image URL 归一化迁出到 `clipboard-history-persistence.ts`，主模块保留 transport 与 autopaste 编排入口，不改外部事件名、payload 或 storage schema。
  - 新 helper 通过注入 `deleteImageFile / isWithinTempBaseDir / normalizeRenderableSource` 保持生产路径图片清理和 renderable URL 过滤行为，同时避免纯逻辑测试依赖 Electron app runtime。
  - `clipboard.ts` 从 `3020` 行降到 `2457` 行，`large-file-boundary-allowlist` 中对应 entry 与 growth exception cap 同步收紧到 `2457`。
  - `size:guard` 的 growth exception registry sync 改为解析 compatibility registry CSV 的路径列，不再依赖带双引号的脆弱字符串包含判断，避免清册格式变化误报 invalidConfig。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/clipboard/clipboard-history-persistence.test.ts" "src/main/modules/clipboard/clipboard-capture-freshness.test.ts" "src/main/modules/clipboard/clipboard-freshness.test.ts"`、定向 ESLint、`size:guard --changed` 与 `git diff --check` 通过；2026-05-11 补跑 `pnpm -C "apps/core-app" run typecheck:node` 通过，`pnpm -C "apps/core-app" run typecheck:web` 通过（tuffex build 阶段仍输出既有 deprecation / dts 诊断噪声但命令返回 0），CoreApp 定向回归 67 tests 通过。

### test(core-app): require identity fields for manual Windows evidence

- `apps/core-app/scripts/windows-acceptance-manual-evidence.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-verify-script.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - DivisionBox detached widget manual evidence 不再只要求泛化 `Logs`，改为逐项要求 observed/expected pluginId、`detachedPayload` itemId/query 与 no-fallback 日志摘录，确保真机证据能直接复核 session 身份、payload 水合与原始 query 保留。
  - 分时推荐 manual evidence 增加 `timeSlot/dayOfWeek` cache key 与 recommendation trace 摘录字段，避免只填早/午推荐截图但无法复核缓存隔离。
  - 模板头部同步增加 Feature pluginId / Observed session pluginId 与早/午 time slot / dayOfWeek 填写位；回归固定字段清单，防止后续模板与 verifier label 漂移。

### test(core-app): require visible common app evidence fields

- `apps/core-app/scripts/windows-acceptance-manual-evidence.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-verify-script.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
  - Common app launch manual evidence 从“截图 + 查询 + 启动目标”收紧为与五项体验检查对齐：search query、observed display name、icon evidence、observed launch target、CoreBox hidden evidence 与截图/录屏都必须填写非占位值。
  - 模板到 verifier 的集成回归同步更新，确保 `windows:acceptance:template --writeManualEvidenceTemplates` 生成的 common app 空模板会报告缺失 display name、icon 与 CoreBox hidden evidence。

### test(core-app): require copied path and update manual evidence action fields

- `apps/core-app/scripts/windows-acceptance-manual-evidence.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-verify-script.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
  - Copied app path manual evidence 增加 add-to-local-launch-area action、indexed search result 与 indexed result launch evidence 字段，和复制源、本地启动区条目、reindex、搜索命中、启动闭环逐项对齐。
  - Windows update install manual evidence 增加 UAC prompt、app exit、installer exit、installed version、app relaunch 与 failure rollback evidence 字段，避免只填写 installer path/mode 与截图就误收。
  - `windows-acceptance-verify-script.test.ts` 固定新增字段，并继续证明空模板会逐项报告缺失 Evidence label。

### fix(core-app): mark copied app path additions as managed launch entries

- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - `appProvider.addAppByPath()` 现在把用户从复制 app path 触发的添加写成本地启动区 managed entry，落库时补 `entrySource=manual` 与 `entryEnabled=1`，确保后续 `listManagedEntries()`、rebuild 保留逻辑和索引重建都能识别该条目。
  - 文件系统实时扫描仍保持普通 scanned app 路径，不会被误标记为 manual entry，避免 Start Menu / watcher 扫描污染用户本地启动区清单。
  - 补充回归：Windows UWP `shell:AppsFolder\\...` 与裸 `PackageFamily!App` 经 `addAppByPath()` 添加后都会带 manual entry 标记；ClickOnce `.appref-ms` watcher 变更不会带 manual 标记。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/apps/app-provider.test.ts" "src/main/modules/box-tool/addon/system/system-actions-provider.test.ts" "src/main/modules/platform/app-index-diagnostic-verifier.test.ts" "src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts"` 通过（`84 tests`）。

### fix(core-app): guard Windows auto installer handoff at UpdateSystem layer

- `apps/core-app/src/main/modules/update/update-system.ts`
- `apps/core-app/src/main/modules/update/update-system.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - `UpdateSystem` 自动安装接管现在同时要求 `autoInstallOnComplete=true`、`autoInstallDownloadedUpdates=true` 与 Windows 平台，避免未来调用方误传自动下载标记时绕过高级设置开关。
  - 补充回归：高级设置开启但用户手动下载仍只提示下载完成；自动下载标记存在但高级设置关闭也不会启动 NSIS/MSI handoff；只有两项同时满足时才 detached 启动安装器并退出应用。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/update/update-system.test.ts" "src/main/modules/update/services/windows-installer-strategy.test.ts" "src/main/modules/platform/update-diagnostic-verifier.test.ts" "src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts" "src/renderer/src/views/base/settings/update-diagnostic-evidence.test.ts"` 通过（`60 tests`）。

### refactor(governance): layer guards and decouple lint

- `scripts/check-large-file-boundaries.mjs`
- `scripts/run-eslint-changed.mjs`
- `package.json`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
  - `size:guard` 调整为重构期默认分层模式，继续输出 `mode / oversizedFiles / newOversizedFiles / grownOversizedFiles / expiredDebt / cleanupCandidates`；默认阻断新增超长文件与已登记文件继续增长，但不因历史未增长 size debt 阻断日常开发。
  - 新增 `size:guard:changed`、`size:guard:report` 与 `size:guard:strict`：changed 模式用于 lint-staged / 本地变更防回潮，report 模式只输出全量报告且不失败，strict 模式保留 release/milestone 全量阻断。
  - `legacy:guard` 不再串 `size:guard`，避免历史超长文件漂移让 legacy/raw-channel/runtime 边界检查失真；新增 `architecture:guard` 与 `release:guard` 分别承载重构期与发布期门禁。
  - `lint` / `lint:fix` 只跑 ESLint 与 `intelligence:check`，新增 `lint:changed` 只检查 git changed JS/TS/Vue 文件；lint-staged 保持 eslint fix，并追加 changed size guard。
  - 验证：`node scripts/check-large-file-boundaries.mjs --report` 返回 0；默认 `size:guard` 与 `--strict` 会阻断当前 dirty worktree 中确实新增/增长的超长文件；显式限定本轮脚本文件的 `--changed` 返回 0；`node scripts/run-eslint-changed.mjs` 返回 0（存在既有 warning）；docs guard 与 diff check 已复核文档同步。

### ref(aiapp): hard-cut physical legacy stream filenames

- `retired-ai-app/app/composables/api/base/v1/aigc/completion/aiapp-stream-contract.ts`
- `retired-ai-app/app/composables/api/base/v1/aigc/completion/aiapp-stream-input.ts`
- `retired-ai-app/app/composables/api/base/v1/aigc/completion/aiapp-stream-sse.ts`
- `retired-ai-app/server/utils/__tests__/aiapp-completion-stream-contract.test.ts`
- `retired-ai-app/server/utils/__tests__/aiapp-stream-input.test.ts`
- `retired-ai-app/server/utils/__tests__/aiapp-run-event-card.test.ts`
- `packages/tuff-intelligence/src/business/aiapp/run-event-card.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `scripts/legacy-boundary-allowlist.json`
- `docs/plan-prd/TODO.md`
  - 完成此前待确认的 AI 物理文件名 hard-cut：`legacy-stream-*` 改为 `aiapp-stream-*`，run-event-card 实现改为当前 `run-event-card.ts` 路径。
  - `aiapp-legacy-run-event-card.test.ts` 同步重命名为 `aiapp-run-event-card.test.ts`，删除最后一条 AI run-event-card 测试文件名 compat-file 清册项。
  - 更新 AI app、server 测试与 `@talex-touch/tuff-intelligence` barrel 的 import/export，删除对应 stale compatibility registry 与 legacy allowlist 记录。
  - 清理 compatibility registry 中已不再被扫描命中的 stale compat-file rows，同时保留 registry-only migration / size-growth exception rows。
  - `node "scripts/check-legacy-boundaries.mjs"` 已降为 `legacy-keyword: files=0, hits=0`。

### ref(nexus): hard-cut intelligence provider dot-route compatibility shells

- `apps/nexus/server/api/dashboard/intelligence/providers/[id]/probe.post.ts`
- `apps/nexus/server/api/dashboard/intelligence/providers/[id]/test.post.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - 删除旧 `/api/dashboard/intelligence/providers/:id.probe` 与 `:id.test` 的 410 compatibility route shells，以及对应 `intelligence-route-compat` middleware/test。
  - Nexus Intelligence provider health check 仅保留当前 slash-route `/providers/:id/probe` 与 `/providers/:id/test` 主路径。
  - 移除对应 `compat-file` registry 行，继续减少 Nexus 官网/API compatibility shell 面。

### test(unplugin-export-plugin): hard-cut retired CLI test filename

- `packages/unplugin-export-plugin/src/__tests__/retired-cli-entry.test.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
  - 将 `cli-shim.test.ts` 物理重命名为 `retired-cli-entry.test.ts`，测试描述同步为 retired CLI entry。
  - 删除对应 `compat-file` registry 行；测试仍覆盖 deprecated `tuff` wrapper 转发到 `@talex-touch/tuff-cli` 的断言。

### chore(clipboard-history): hard-cut raw channel guard script filename

- `plugins/clipboard-history/scripts/assert-no-raw-channels.mjs`
- `plugins/clipboard-history/package.json`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
  - 将构建后 raw channel 扫描脚本从 `assert-no-legacy-channels.mjs` 物理重命名为 `assert-no-raw-channels.mjs`。
  - 插件 `build` 命令同步使用当前脚本名，删除对应 `compat-file` registry 行。

### test(intelligence-uikit): hard-cut aiapp mapping test filename

- `packages/intelligence-uikit/src/__tests__/aiapp-mapping.test.ts`
- `packages/intelligence-uikit/README.md`
  - 将新增 AI UI Kit 映射测试从 `aiapp-adapter.test.ts` 物理重命名为 `aiapp-mapping.test.ts`，避免把纯模型映射测试登记为 compat-file 债务。
  - README 当前章节同步改为 `AI mapping 边界`，保持包入口语义聚焦在数据映射而非兼容 adapter。

### feat(intelligence-uikit): add AI UI Kit workspace package

- `packages/intelligence-uikit` 新增 `@talex-touch/intelligence-uikit` 私有 workspace 包。
- 首批落地 `TxAi*` 组件骨架，覆盖 Foundation / Conversation / Content / Tool-Agent 四层。
- 增加 `@talex-touch/intelligence-uikit/aiapp` 子入口，提供 AI block/message 到 AI UI Kit 模型的映射。
- README 固化组件矩阵、迁移阶段、动效扩展规范与 AI 替换边界。

### test(core-app): harden Everything backend diagnostic fields

- `apps/core-app/src/main/modules/platform/everything-diagnostic-verifier.ts`
- `apps/core-app/src/main/modules/platform/everything-diagnostic-verifier.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - Everything diagnostic evidence 复算新增 backend-specific 一致性：available 状态不得残留 `errorCode` / `lastBackendError`，active backend 不得仍记录 attempt error。
  - CLI backend 可用时必须带 `esPath` 与 version，避免只把 backend 标成 `cli` 但没有可复核 CLI 路径/版本的弱证据通过 acceptance。
  - 同步跑 Everything provider fallback 回归，确认 SDK runtime 失败、CLI fallback、CLI runtime 失败降级 file-provider 的既有行为未被 verifier 加固误伤。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/platform/everything-diagnostic-verifier.test.ts" "src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts" "src/main/modules/box-tool/addon/files/everything-provider.test.ts"` 通过（`57 tests`）。

### fix(core-app): prefer exact app alias tokens over medium feature title matches

- `apps/core-app/src/main/modules/box-tool/search-engine/sort/tuff-sorter.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/sort/tuff-sorter.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - App 的精确 `searchTokens` 命中现在作为明确 App intent 加权，覆盖 `vsc` / `vscode` 这类用户想启动 App 的别名查询。
  - 该加权仅适用于 `kind='app'` 且 token 精确等于 query，避免普通 token 前缀/包含召回扩大影响面，同时保留高频 feature 可见标题的自学习前置能力。
  - 补充回归：`Visual Studio Code` 的 `vsc` 精确别名 token 命中会排在中等频次 `VSC Snippets` plugin feature 可见标题前；极高频 `VSC Snippets` 可见标题仍可通过行为学习排在 App 别名前。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/sort/tuff-sorter.test.ts" "src/main/modules/box-tool/search-engine/search-trace-stats.test.ts" "src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.test.ts"` 通过（`25 tests`）；`pnpm -C "apps/core-app" run typecheck:node` 通过。

### test(core-app): cover worker status sampling idle windows

- `apps/core-app/src/main/modules/box-tool/search-engine/workers/search-index-worker-client.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/workers/asset-worker-client.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/workers/file-index-worker-client.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/workers/file-reconcile-worker-client.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/workers/file-scan-worker-client.test.ts`
  - 补充单写者 SearchIndex worker 的 idle shutdown 边界：`getStatus()` 发起 metrics 采样时必须取消旧 idle timer，metrics pending/timeout 期间不得终止 worker，采样结束后再重新计算完整 idle 窗口。
  - 同步覆盖 scan/index/reconcile 文件任务 worker 与 icon/thumbnail asset worker 的状态采样路径，避免设置页/诊断页轮询 worker metrics 时与 60s 空闲退出互相干扰导致任务 worker 被过早终止。
  - 该回归保护文件索引性能降载逻辑，确保状态采样 pending/timeout 期间 worker 保持存活，采样结束后再重新进入完整 idle window。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/workers/search-index-worker-client.test.ts" "src/main/modules/box-tool/addon/files/workers/idle-worker-shutdown.test.ts" "src/main/modules/box-tool/addon/files/workers/file-index-worker-client.test.ts" "src/main/modules/box-tool/addon/files/workers/file-reconcile-worker-client.test.ts" "src/main/modules/box-tool/addon/files/workers/file-scan-worker-client.test.ts" "src/main/modules/box-tool/addon/files/workers/asset-worker-client.test.ts"` 通过（`15 tests`）；`pnpm -C "apps/core-app" run typecheck:node` 通过。

### test(core-app): require manual evidence key fields

- `apps/core-app/scripts/windows-acceptance-verify.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `apps/core-app/scripts/windows-acceptance-manual-evidence.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-verify-script.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
  - `windows:acceptance:verify --requireCompletedManualEvidence` 从“存在 checklist 且无未勾选项”收紧为“checklist 全部勾选且 Evidence 区至少有一个非 Notes 的实际证据值”。
  - 空 Evidence 字段、全勾选空模板以及 `N/A` / `TODO` / `-` 等占位值不再视为完成，避免手工证据 Markdown 只靠勾选通过最终 Windows acceptance。
  - 脚本入口增加 import guard，便于直接测试 `isManualEvidenceComplete()` 而不触发 CLI main。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/platform/windows-acceptance-verify-script.test.ts" "src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts"` 通过（`39 tests`）。

### test(core-app): require manual evidence template fields

- `apps/core-app/scripts/windows-acceptance-verify.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-verify-script.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
  - `windows:acceptance:verify --requireCompletedManualEvidence` 继续从“至少一个非 Notes 证据值”收紧为“当前 manual evidence 模板要求的关键 Evidence 标签必须全部填入非占位值”。
  - common app launch、copied app path、update install、DivisionBox detached widget 与 time-aware recommendation 都按各自模板字段校验，避免只填 Notes 或只填单个证据字段的 Markdown 被最终 acceptance 误收。
  - manual evidence 字段定义抽成脚本共享常量，template 生成与 verify 校验共用同一组 label，避免模板字段名与验收门禁漂移。
  - 补充 CLI 子进程回归：复制 app path 手工证据只填 `Copied source` 会失败，填齐 `Copied source` / `Normalized app path` / `Local launch entry` / `App Index diagnostic evidence path` / `Search query used after reindex` / `Screenshot or recording` 才通过。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/platform/windows-acceptance-verify-script.test.ts" "src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts"` 通过（`45 tests`）；`pnpm -C "apps/core-app" run typecheck:node`、`pnpm docs:guard` 与 scoped `git diff --check` 通过。

### test(core-app): report manual evidence missing labels

- `apps/core-app/scripts/windows-acceptance-verify.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-verify-script.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - `windows:acceptance:verify --requireCompletedManualEvidence` 的失败项现在带出未勾选 checklist 数量与缺失 Evidence label，例如 `missing evidence fields: Normalized app path, Local launch entry`。
  - 新增 `evaluateManualEvidenceCompletion()` 供测试与后续 CLI 诊断复用；`isManualEvidenceComplete()` 保持布尔兼容。
  - 补充单测覆盖结构化失败原因与 CLI 输出，避免真机补证时只能看到泛化的 incomplete 报错；新增 template-to-verify 集成回归，证明 `windows:acceptance:template --writeManualEvidenceTemplates` 生成的 7 个 manual evidence 文件都会被 `windows:acceptance:verify --requireCompletedManualEvidence` 拒绝，并逐项断言 common app、copied app path、update install、DivisionBox detached widget 与 time-aware recommendation 的缺失字段。

### test(core-app): harden app-index diagnostic evidence consistency

- `apps/core-app/src/main/modules/platform/app-index-diagnostic-verifier.ts`
- `apps/core-app/src/main/modules/platform/app-index-diagnostic-verifier.test.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
  - `app-index:diagnostic:verify` 不再只信任 `diagnosis.matchedStages` 或 reusable caseId 字段；会从 `stages.*.targetHit` 重新推导命中阶段，并要求命中 stage 包含目标 `itemId`、`matchCount` 与 matches 数量一致；未运行 stage 不得携带命中或 matches，未命中 target 的 stage 不得携带 matches。
  - 同步复核 input target、diagnosis target、manual suggested fields、app launch/icon/displayName 字段与 reindex path 是否指向同一个目标 App；成功 reindex 在存在 app 实体字段时必须对齐 app path/launchTarget/appIdentity/bundleId，避免复制 app path 或普通 App 索引验收被手工拼接的弱 JSON 误收。
  - Windows acceptance 对 app-index diagnostic evidence 的 case 复算会继承该门禁，能直接暴露缺少 query stage 明细、stage 漂移或 reindex target 漂移。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/platform/app-index-diagnostic-verifier.test.ts" "src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts"` 通过（`45 tests`）。

### test(core-app): harden update diagnostic target evidence

- `apps/core-app/src/main/modules/platform/update-diagnostic-verifier.ts`
- `apps/core-app/src/main/modules/platform/update-diagnostic-verifier.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
  - `update:diagnostic:verify` 进一步收紧 Windows update evidence 复算：`installedVersion.expected` 必须与 `downloadReadyVersion` / cached release tag 指向同一目标版本，避免安装后版本字段自洽但与下载目标脱节。
  - installedVersion current/expected 统一 trim 后判定，空白字符串会按缺失证据处理，避免 `matchesExpected=true` 搭配空白版本绕过安装后版本 gate。
  - `windows-auto-installer-handoff` evidence 必须保留非空 `downloadTaskId`，避免自动接管验收用缺少自动下载任务来源的 JSON 通过。
  - cached release 会同时复核 tag 与 `downloadReadyVersion`、channel 与 settings、matching asset platform/arch 与 runtime target、asset size 为正，防止跨版本、跨渠道或跨平台资产 JSON 被 Windows acceptance 误收。
  - 补充回归覆盖目标版本漂移、release/channel/asset 漂移，以及非 Windows runtime 伪造 Windows installer handoff mode。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/platform/update-diagnostic-verifier.test.ts"` 通过（`13 tests`）。

### test(core-app): harden Windows performance evidence counters

- `apps/core-app/src/main/modules/box-tool/search-engine/search-trace-stats.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-trace-stats.test.ts`
- `apps/core-app/src/main/modules/platform/clipboard-stress-verifier.ts`
- `apps/core-app/src/main/modules/platform/clipboard-stress-verifier.test.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
  - `search:trace:verify` / Windows acceptance performance 复算新增内部计数一致性门禁：`pairedSessionCount` 不得超过 session 或 event sample count，`sessionCount` 必须等于 paired + missing counters，slowCount 不得超过 sampleCount，`enoughSamples` 必须与 min sample 结果一致。
  - `search-trace-stats/v1` 进一步复核 `slowRatio` 必须等于 `slowCount / sampleCount`，且 P50/P95/P99/max 不得倒挂，避免手工拼接摘要只满足阈值字段却绕过真实分布。
  - `clipboard:stress:verify` 新增 clipboard counter 自一致性门禁：count / schedulerDelaySampleCount / drop / timeout / error 等计数必须为非负整数，count 与 scheduler sample 不能为 0，scheduler sample 不能超过 clipboard count。
  - `clipboard-stress-summary/v1` 进一步复核 scheduler delay 与 duration 指标单调性：avg/p95/last scheduler delay 不得超过 max scheduler delay，last duration 不得超过 max duration，避免手工拼接弱性能摘要。
  - 补充 acceptance 回归覆盖 `gate.passed=true` 但性能计数自相矛盾的弱 JSON，避免只填阈值字段就通过最终 Windows evidence gate。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/search-trace-stats.test.ts" "src/main/modules/platform/clipboard-stress-verifier.test.ts" "src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts" "src/main/modules/platform/update-diagnostic-verifier.test.ts"` 通过（`59 tests`）。

### test(core-app): cover persisted time-aware recommendation cache

- `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - 分时推荐回归补齐持久化 `recommendation_cache` 隔离：早上 DB cache 命中后，下午会按 `afternoon|dayOfWeek` 重新查询 cache 并重新计算候选，不复用 `morning|dayOfWeek` 的结果。
  - 现有覆盖已包含 production `ContextProvider.generateCacheKey()`、内存 cache timeSlot/dayOfWeek 隔离、weekday 空样本、time-based 去重保留和 morning/afternoon 首位变化；真实 Windows 设备手工证据仍通过 `--requireTimeAwareRecommendationManualChecks` 归档。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.test.ts" "src/main/modules/box-tool/search-engine/sort/tuff-sorter.test.ts"` 通过（`17 tests`）。

### test(core-app): harden Everything diagnostic readiness evidence

- `apps/core-app/src/main/modules/platform/everything-diagnostic-verifier.ts`
- `apps/core-app/src/main/modules/platform/everything-diagnostic-verifier.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - `everything:diagnostic:verify` 新增基础状态一致性复算：`verdict.ready` 必须等于 `status.enabled && status.available`，available 状态不得搭配 `backend=unavailable`，active backend 必须出现在 fallback chain，`health=healthy` 不得与 unavailable backend 并存。
  - backendAttemptErrors 进一步要求 key 来自 fallback chain 且错误文本非空，避免拼接未知 backend 或空错误字段的弱 JSON 通过 Everything diagnostic gate。
  - 补充回归覆盖 ready/available/backend/fallback chain 被手工篡改的弱证据；acceptance 对 `windows-everything-file-search` 的 Everything diagnostic evidence 会沿用该复算结果。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/platform/everything-diagnostic-verifier.test.ts" "src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts"` 通过（`42 tests`）。

### test(core-app): gate copied app path manual acceptance

- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `apps/core-app/scripts/windows-acceptance-verify.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - Windows acceptance manifest 新增 `manualChecks.copiedAppPath` 与 `--requireCopiedAppPathManualChecks`，要求真实 Windows 设备记录复制源、add-to-local-launch-area 动作、本地启动区条目、reindex、搜索命中与从索引结果启动闭环。
  - `windows:acceptance:template` 的 recommended command 已携带该 gate，并会生成 `manual/copied-app-path-index.md` 非覆盖式手工证据模板；`windows:acceptance:verify --requireExistingEvidenceFiles/--requireNonEmptyEvidenceFiles/--requireCompletedManualEvidence` 会同时校验该 manual evidence 文件存在、非空且 checklist 已完成。

### feat(nexus): seed screenshot translation provider scene defaults

- `apps/nexus/server/utils/providerSceneSeed.ts`
- `apps/nexus/server/utils/providerSceneSeed.test.ts`
- `apps/nexus/server/api/dashboard/provider-registry/seed.post.ts`
- `apps/nexus/server/api/dashboard/provider-registry/seed.api.test.ts`
- `apps/nexus/app/pages/dashboard/admin/provider-registry.vue`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - Dashboard Admin Provider Registry 页面加载前新增 `/api/dashboard/provider-registry/seed` 管理员入口，幂等创建系统级本地 `custom-local-overlay` provider，并确保 `corebox.screenshot.translate` Scene 可发现。
  - seed 只追加缺失的 system binding，不覆盖管理员已有 Scene policy、已有同 capability binding 或用户手工配置；同名 provider 缺少 `overlay.render` capability 时不会被误当成 seed provider。
  - 默认 required capabilities 会按现有 provider 动态选择：composed 路径三件套齐全时使用 `vision.ocr -> text.translate -> overlay.render`，只有 direct 图片翻译 provider 时保持 `image.translate.e2e`，避免置顶图片默认链路被未配置 OCR 阻断。
  - seed 不会把 user-scope AI mirror OCR provider 自动绑定进 system Scene，避免个人 API key 被系统级 Scene 跨用户误用；user-scope OCR binding 策略仍留待后续权限边界设计。
  - 验证：`pnpm -C "apps/nexus" exec vitest run "server/utils/providerSceneSeed.test.ts" "server/api/dashboard/provider-registry/seed.api.test.ts"` 通过（`2 files / 7 tests`）。

### test(core-app): verify Everything target probe samples

- `apps/core-app/src/main/modules/platform/windows-capability-evidence.ts`
- `apps/core-app/src/main/modules/platform/windows-capability-evidence.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - `windows:capability:verify --requireEverythingTargets` 不再只信任 `found=true`、正数 `matchCount` 与非空 samples；每个目标 probe 现在必须至少有一条样本文本包含目标关键词。
  - 补充回归覆盖手工篡改 evidence 的弱证据：`target=ChatApp` 但 samples 只包含 `C:\Tools\Other.exe` 时会失败为 `Everything targets not found: ChatApp`。

### feat(core-app): generate Windows manual evidence templates

- `apps/core-app/scripts/windows-acceptance-template.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - `windows:acceptance:template` 新增显式 opt-in 参数 `--writeManualEvidenceTemplates`，默认不写额外文件。
  - 传参后会按 manifest 内 `manualChecks.*.evidencePath` 生成非覆盖式 Markdown 模板，覆盖 common app launch、copied app path、Windows update install、DivisionBox detached widget 与 time-aware recommendation。
  - 生成模板只填验收 checklist 与证据占位，不自动把手工 gate 标为通过，仍需真实 Windows 设备回归后填写并由 `windows:acceptance:verify --requireExistingEvidenceFiles --requireNonEmptyEvidenceFiles --requireCompletedManualEvidence` 复核。
  - 验证：`pnpm -C "apps/core-app" run windows:acceptance:template -- --output <tmp>/windows-acceptance.json --evidenceDir evidence/windows --writeManualEvidenceTemplates --compact` 已生成 7 个 manual evidence Markdown。

### test(core-app): gate time-aware recommendation acceptance checks

- `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.test.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `apps/core-app/scripts/windows-acceptance-verify.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - 推荐引擎回归补锁生产 `ContextProvider.generateCacheKey()`，确认 cache key 包含 `timeSlot/dayOfWeek`，避免只在 mock 里验证分时缓存隔离。
  - Windows acceptance manifest 新增 `manualChecks.timeAwareRecommendation` 与 `--requireTimeAwareRecommendationManualChecks`，要求真实 Windows 设备归档空 query 推荐、早/午两个时段样本、首位推荐随时段变化、频率信号保留与 timeSlot/dayOfWeek 缓存隔离证据。
  - `windows:acceptance:template` 的 recommended command 与 blocked 模板已携带该 gate，`windows:acceptance:verify --requireExistingEvidenceFiles/--requireNonEmptyEvidenceFiles/--requireCompletedManualEvidence` 会同时校验对应 manual evidence 文件存在、非空且 checklist 已完成。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.test.ts"` 与 `pnpm -C "apps/core-app" exec vitest run "src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts"` 通过。

### feat(nexus): add OpenAI-compatible vision OCR scene adapter

- `apps/nexus/server/utils/intelligenceVisionOcrProvider.ts`
- `apps/nexus/server/utils/intelligenceVisionOcrProvider.test.ts`
- `apps/nexus/server/utils/sceneOrchestrator.ts`
- `apps/nexus/server/utils/sceneOrchestrator.test.ts`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/INDEX.md`
  - Scene Orchestrator 默认注册 `openai/deepseek/custom:vision.ocr` adapter，生产链路可用 Provider Registry 中的 OpenAI-compatible Intelligence mirror 执行云端 OCR。
  - OCR adapter 从 `provider_secure_store` 通过 `authRef` 读取 API key，按 OpenAI-compatible `/chat/completions` 多模态请求发送 data URL 图片，标准化返回 `text/language/confidence/keywords/blocks/engine=cloud` 与 image usage。
  - adapter 不把 API key、图片内容或完整 provider 响应写入 Provider metadata、health 或 ledger；Scene ledger 仍只保存安全 trace/usage/selection 元数据。
  - composed 截图翻译测试已改为使用默认 OCR adapter 注册，不再依赖测试手动注册 `custom:vision.ocr`。
  - 验证：`pnpm -C "apps/nexus" exec vitest run "server/utils/intelligenceVisionOcrProvider.test.ts" "server/utils/sceneOrchestrator.test.ts"` 通过（`2 files / 20 tests`）。

### feat(nexus): route intelligence mirror provider checks through registry health

- `apps/nexus/server/utils/intelligenceProviderHealthCheck.ts`
- `apps/nexus/server/utils/intelligenceProviderHealthCheck.test.ts`
- `apps/nexus/server/api/dashboard/provider-registry/providers/[id]/check.post.ts`
- `apps/nexus/server/api/dashboard/provider-registry/provider-registry.api.test.ts`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/INDEX.md`
  - Provider Registry `providers/:id/check` 现在会识别 Intelligence provider mirror，并复用 Lab provider probe 对 `chat.completion` 执行探活。
  - `vision.ocr` check 不再用 chat probe 代替，改为调用 OpenAI-compatible OCR adapter；Dashboard/API 可传 `imageDataUrl` / `imageBase64` / `language` / `prompt` 做 OCR 专项探活，未传图片时使用内置极小 data URL 验证 provider 连通性。
  - 探活结果继续走 `recordProviderHealthCheck()` 写入 `provider_health_checks`，Dashboard Health 视图可统一查询 AI mirror 与腾讯云 provider 的 latency、requestId、errorCode/errorMessage 与 degradedReason。
  - AI mirror check 只使用 secure-store `authRef` 与 bridge fallback 获取凭证，不在 Provider metadata、health 记录或返回体中暴露 API key。
  - 验证：`pnpm -C "apps/nexus" exec vitest run "server/utils/intelligenceProviderHealthCheck.test.ts" "server/api/dashboard/provider-registry/provider-registry.api.test.ts"` 通过（`2 files / 28 tests`）。

### refactor(governance): migrate retained typed events and split clipboard freshness

- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `packages/utils/__tests__/transport-event-boundary.test.ts`
- `apps/core-app/src/main/modules/system/permission-checker.ts`
- `apps/core-app/src/renderer/src/views/base/begin/internal/SetupPermissions.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingSetup.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingTools.vue`
- `apps/core-app/src/shared/events/omni-panel.ts`
- `apps/core-app/src/main/modules/clipboard.ts`
- `apps/core-app/src/main/modules/clipboard/clipboard-capture-freshness.ts`
- `apps/core-app/src/main/modules/clipboard/clipboard-capture-freshness.test.ts`
- `scripts/large-file-boundary-allowlist.json`
  - `plugin-features-adapter.test.ts` 已补入 compatibility registry，只登记清册，不改测试文件名或测试行为。
  - `system:permission:*` 与 `omni-panel:feature:*` 三段 retained raw event 已在保持外部事件名不变的前提下切到 `defineEvent(namespace).module(module).event(action)`。
  - Transport boundary test 继续分开输出 `rawSendViolations / retainedRawEventDefinitions / typedMigrationCandidates`，并将 retained raw definition 上限收紧到当时扫描口径 `266`，typed migration candidate 清零；同日后续下载迁移 push event typed registry 切片已进一步收紧到 `264`。
  - Clipboard capture freshness 切片迁出到 `clipboard-capture-freshness.ts`，主模块只保留编排调用；`clipboard.ts` 从 `3343` 行降到 `3021` 行，并将对应 size growth exception 从 `3299` 收紧到 `3021`。
  - 验证：transport boundary vitest、clipboard freshness/capture focused vitest 与 touched CoreApp eslint 通过；`size:guard` 仍被其他既有超长文件增长阻塞，clipboard 本轮不再超出自身 exception cap。

## 2026-05-10

### feat(core-app): add native screenshot transport slice

- `packages/tuff-native/native-screenshot/*`
- `packages/tuff-native/screenshot.js`
- `packages/tuff-native/screenshot.d.ts`
- `packages/utils/transport/events/index.ts`
- `packages/utils/transport/events/types/native.ts`
- `packages/utils/transport/sdk/domains/native.ts`
- `apps/core-app/src/main/modules/native-capabilities/*`
- `apps/core-app/src/main/modules/box-tool/addon/system/system-actions-provider.ts`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - 新增 Rust/NAPI-RS `xcap` screenshot addon，输出 PNG buffer，并通过 `@talex-touch/tuff-native/screenshot` 暴露 support、display list、display/region/cursor capture contract。
  - 新增 `NativeEvents.screenshot` typed transport，固定 `native:screenshot:get-support`、`native:screenshot:list-displays`、`native:screenshot:capture`，并补 `createNativeSdk()`。
  - CoreApp 新增 `NativeCapabilitiesModule` 与 `NativeScreenshotService`，统一插件 `window.capture` 权限、Electron 全局 DIP 坐标、native physical crop、`native/screenshots` 短期临时文件、`tfile://` 输出与可选剪贴板写入。
  - CoreBox 新增“截图并复制”内置动作，默认捕获当前光标所在显示器并写入剪贴板；v1 不引入 Electron `desktopCapturer` fallback。
  - 回归覆盖 native addon contract、transport SDK/event metadata、CoreApp service 坐标转换、权限校验、临时文件与剪贴板写入。

### feat(nexus): add provider capability standalone admin API

- `apps/nexus/server/utils/providerRegistryStore.ts`
- `apps/nexus/server/api/dashboard/provider-registry/providers/[id]/capabilities.post.ts`
- `apps/nexus/server/api/dashboard/provider-registry/providers/[id]/capabilities/[capabilityId].patch.ts`
- `apps/nexus/server/api/dashboard/provider-registry/providers/[id]/capabilities/[capabilityId].delete.ts`
- `apps/nexus/server/api/dashboard/provider-registry/provider-registry.api.test.ts`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md`
  - Provider Registry 新增 capability 独立 create/update/delete API，不再只能通过 Provider 整体 PATCH 替换 capabilities。
  - 单条 capability 更新支持保留未传字段，并可维护 `schemaRef`、`metering`、`constraints` 与 `metadata`；重复 capability 统一返回 409。
  - 回归测试补齐单独新增、局部更新、单独删除、不存在资源 404 与重复 capability 409。

### feat(nexus): wire provider capability editor to standalone API

- `apps/nexus/app/pages/dashboard/admin/provider-registry.vue`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md`
  - Dashboard Provider 编辑面板保留 Provider 基础字段 PATCH，但 capability 新增、更新和删除改为调用 `providers/:id/capabilities/*` 独立 API。
  - Capability 编辑状态保留既有 `capabilityId`，删除已有能力时按 ID 调用 DELETE，新增能力调用 POST，已有能力调用 PATCH，避免通过 Provider 整体 PATCH 替换整组 capabilities。
  - 保存前增加同一 Provider 内 capability 去重校验，减少 UI 侧无效请求。

### feat(nexus): mirror intelligence providers into Provider Registry

- `apps/nexus/server/utils/intelligenceProviderRegistryBridge.ts`
- `apps/nexus/server/utils/intelligenceProviderRegistryBridge.test.ts`
- `apps/nexus/server/utils/providerCredentialStore.ts`
- `apps/nexus/server/api/dashboard/intelligence/providers.get.ts`
- `apps/nexus/server/api/dashboard/intelligence/models.get.ts`
- `apps/nexus/server/api/dashboard/intelligence/providers/sync.get.ts`
- `apps/nexus/server/api/dashboard/intelligence/providers.post.ts`
- `apps/nexus/server/api/dashboard/intelligence/providers/[id].patch.ts`
- `apps/nexus/server/api/dashboard/intelligence/providers/[id].delete.ts`
- `apps/nexus/server/api/dashboard/intelligence/providers/[id]/test.post.ts`
- `apps/nexus/server/utils/tuffIntelligenceLabService.ts`
- `apps/nexus/server/api/admin/intelligence/chat.ts`
- `apps/nexus/server/api/docs/assistant.post.ts`
- `apps/nexus/server/api/credits/models.get.ts`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md`
  - Nexus dashboard Intelligence provider 创建、更新、删除时同步维护一条通用 Provider Registry 镜像，迁移期保持原 `/api/dashboard/intelligence/providers*` 外形不变。
  - AI capability 统一归一到 Provider Registry 能力域：`text.chat -> chat.completion`，保留 `text.summarize`，本地 provider 补 `vision.ocr`。
  - API key 写入 `provider_secure_store` 并通过 `secure://providers/intelligence-<id>` `authRef` 引用；Provider Registry metadata 只保存模型、默认模型、优先级、rate limit 与配置状态，不写入明文 API key。
  - Intelligence provider 管理列表、普通用户 sync、模型列表、credits 模型列表、连接测试、provider probe、Admin Chat、Docs Assistant 与 Lab runtime 已统一走 bridge 合并读取旧表与 registry-only 镜像；API key 获取优先旧表，缺失时从 secure store 解析镜像 `authRef`。
  - 当前阶段仍未完成旧 `intelligence_providers` 表退场、生产可用 `vision.ocr` provider 注册、success rate/配额/动态 `pricingRef` 高级策略；2026-05-11 后续切片已补 OpenAI-compatible AI mirror 的默认 `vision.ocr` Scene adapter。

### refactor(governance): land first architecture convergence slice

- `packages/utils/__tests__/transport-event-boundary.test.ts`
- `retired-ai-app/server/api/system/serve/stat.get.ts`
- `retired-ai-app/server/utils/aiapp-serve-stat.ts`
- `retired-ai-app/server/utils/__tests__/aiapp-serve-stat.test.ts`
- `retired-ai-app/server/utils/aiapp-compat-payment.ts`
- `retired-ai-app/server/utils/__tests__/aiapp-payment-gate.test.ts`
- `retired-ai-app/server/api/order/subscribe.post.ts`
- `retired-ai-app/server/api/order/balance.post.ts`
- `retired-ai-app/server/api/order/target.get.ts`
- `retired-ai-app/server/api/order/price/dummy.get.ts`
- `plugins/touch-image/src/App.vue`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/INDEX.md`
  - Transport boundary test now reports `rawSendViolations`, `retainedRawEventDefinitions` and `typedMigrationCandidates` separately, keeping raw send regressions distinct from retained raw definitions.
  - AI `/api/system/serve/stat` now uses Node runtime metrics and returns degraded/unavailable reason when collection is incomplete, removing fixed Mock CPU / disk / memory data.
  - AI mock payment order paths are gated by `AIAPP_PAYMENT_MODE=mock`; disabled environments return `PAYMENT_PROVIDER_UNAVAILABLE` instead of mock payment success URLs.
  - `plugins/touch-image` image history moved from long-lived renderer `localStorage` writes to plugin storage SDK, capped at 50 entries, with one-time retired-key migration, failed thumbnail pruning and a clear-history entry.

### docs(repo): consolidate engineering process files under docs

- `docs/engineering/README.md`
- `docs/engineering/plans/*`
- `docs/engineering/issues/*`
- `docs/engineering/code-review/*`
- `docs/engineering/reports/*`
- `docs/INDEX.md`
- `docs/engineering/todo.md`
- `docs/engineering/ARCHIVE.md`
  - 将根目录 `plan/`、`issues/`、`codereview/` 与 `reports/` 迁移到 `docs/engineering/` 下的对应子目录，减少根目录噪音并保持工程过程资料集中。
  - Release notes 相关 `notes/` 与 README 素材 `shots/` 暂不迁移，避免影响 GitHub release workflow 与 README 图片展示。
  - 同步更新工程文档入口、TODO/归档说明与旧路径引用，后续新增工程过程资料优先放入 `docs/engineering/`。

### feat(plugin): land CoreBox AI Ask stable slice

- `plugins/touch-intelligence/index.js`
- `plugins/touch-intelligence/manifest.json`
- `packages/test/src/plugins/intelligence.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - CoreBox AI Ask 作为 2.5.0 AI Stable 首个最小可见切片落地；取舍上优先复用 `touch-intelligence` 现有 CoreBox 入口，OmniPanel 划词 AI 结果面板暂不进入本切片。
  - `touch-intelligence` 新增 `text.chat` / `vision.ocr` 稳定链路：文本直接 Chat，剪贴板图片在图片空文本或显式 `ai` 提问时先 OCR，再把 OCR 文本作为 Chat 上下文。
  - 插件结果项补齐 `empty / ready-to-send / ocr-pending / chat-pending / ready / error` 状态；provider 不可用、quota 不足、权限拒绝、模型不支持与 OCR 空结果均有用户可见错误码和重试 payload。
  - `text.chat` 与 `vision.ocr` 调用统一带 `caller / entry / featureId / requestId / inputKinds / capabilityId` metadata，复用现有 Intelligence audit，不保存完整 prompt 或完整 response；复制回答仍要求 `clipboard.write`。

### feat(nexus): compose screenshot translation scene pipeline

- `apps/nexus/server/utils/sceneOrchestrator.ts`
- `apps/nexus/server/utils/sceneOrchestrator.test.ts`
- `apps/nexus/app/pages/dashboard/admin/provider-registry.vue`
- `apps/core-app/src/main/modules/nexus/scene-client.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/image-translate.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/image-translate-pin-window.ts`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md`
  - Scene Orchestrator 对多 capability Scene 新增链式输入传递：`vision.ocr` 接原始图片，`text.translate` 优先消费 OCR `text/language`，`overlay.render` 消费原图、OCR blocks 与翻译输出。
  - 新增默认 `custom:overlay.render` 本地 adapter，返回可审计的客户端 overlay payload 与非计费 `image` usage；不把云供应商 adapter 和 UI 渲染逻辑耦合。
  - CoreApp Scene client 可从 composed `overlay.render` 子输出提取 `translatedImageBase64/sourceText/targetText/overlay`；图片置顶窗口可展示客户端 overlay 层。
  - CoreBox “翻译图片”写回剪贴板继续强制 direct `image.translate.e2e`，避免 composed path 未生成真实 raster 图片时误写回原图；“翻译并置顶”交给 Scene 默认链，支持 direct 或 composed path。
  - Dashboard Scene run 面板对多 capability Scene 默认使用 Scene default，不再自动只跑第一步 capability。
  - 当前阶段仍需补生产可用 `vision.ocr` provider 注册与 AI provider 迁移；2026-05-11 后续切片已补 OpenAI-compatible AI mirror 的默认 `vision.ocr` Scene adapter 与 Dashboard Admin seed 入口，剩余为 user-scope AI mirror OCR 绑定策略与旧表退场。

### docs(ai): expand 2.5.0 workflow and OmniPanel scenarios

- `docs/plan-prd/03-features/ai-2.5.0-plan-prd.md`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - 将 2.5.0 AI 下个版本内容从“入口收口”细化为可执行场景包：OmniPanel Writing Tools、Workflow `Use Model` 节点、Review Queue、Desktop Context Capsule 与剪贴板整理/会议纪要/文本批处理 3 个 P0 模板。
  - 固化 Tuff Intents / Action Manifest、Skills Pack、Background Automations 与 AI 高级 Chat / DeepAgent 联动为 Beta；Assistant、多 Agent 长任务面板、多模态生成编辑与 Nexus Scene runtime orchestration 保持 Experimental / 2.5.x 后续。
  - 补充安全与验收口径：写剪贴板、写文件、调用插件、网络请求、命令执行等副作用必须进入 Review Queue 或审批票据；Workflow 模板不得内嵌 provider secret、明文 API Key 或不可审计脚本。

### fix(core-app): include thumbnail worker in main build output

- `apps/core-app/electron.vite.config.ts`
  - Electron main build 新增 `thumbnail-worker` entry，并固定输出为 `out/main/thumbnail-worker.js`。
  - 修复 FileProvider 生成图片缩略图时无法加载 `thumbnail-worker.js` 导致反复 `MODULE_NOT_FOUND` warning 的问题。
  - 不改变 `ThumbnailWorkerClient` 运行时路径与缩略图任务行为，仅补齐缺失构建产物。

### perf(core-app): idle shutdown search-index worker

- `apps/core-app/src/main/modules/box-tool/search-engine/workers/search-index-worker-client.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/workers/search-index-worker-client.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - `SearchIndexWorkerClient` 复用 file worker idle shutdown controller，FTS/keyword/file progress 单写者 worker 在无 pending task/metrics 时 60 秒后自动退出。
  - idle 退出只保留 `dbPath`，清空 worker/init promise；下一次写任务会重新创建 worker、重新执行 init，再派发 `removeItems` / `persistAndIndex` / `upsertFiles` 等真实写入，避免无索引写入时常驻线程。
  - worker 异常后也保留 `dbPath` 以支持 on-demand restart，修正此前 “will restart on demand” 但 init 状态被清空导致后续写入无法自动恢复的边界。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/workers/search-index-worker-client.test.ts" "src/main/modules/box-tool/addon/files/workers/idle-worker-shutdown.test.ts"`。

### docs(governance): land project quality review optimization plan

- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - 在质量基线中新增“项目质量审查优化计划”，把跨平台兼容、占位/假实现、transport 收口与 SRP 拆分审查结论固化为 Phase 0~3 治理顺序。
  - 明确文档/治理、兼容/运行时边界、storage/sync/secret/payment/AI provider 相关变更的最小审查门禁。
  - 固化 release-blocking 与 documented best-effort 判定规则，避免 Linux 平台限制、macOS/Windows 权限依赖、开发 mock 与生产假成功混为同一类风险。

### docs(project): clarify search telemetry completion boundary

- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - 将 CoreBox/Nexus 搜索 telemetry 状态明确为“上报、聚合、展示、类型与定向测试已完成”。
  - 明确该状态不等同于真实性能验收完成；关闭验收仍需目标设备产出 200 条 `search-trace-stats/v1` 样本，并通过 `search:trace:verify -- --minSamples 200 --strict` 的样本数、P95 与 slowRatio 门禁。

### test(core-app): add search trace stats output command to acceptance template

- `apps/core-app/scripts/search-trace-stats.ts`
- `apps/core-app/scripts/clipboard-polling-stress.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - `search:trace:stats` 新增 `--output <path>`，可在保留 stdout 的同时直接写出 `search-trace-stats/v1` JSON，减少 Windows 真机采样时对 shell 重定向的依赖。
  - Windows acceptance manifest 的 `performance` 新增可选 `searchTraceStatsCommand`，`windows:acceptance:template` 会生成从 CoreApp 日志到 stats JSON 的推荐命令，并带上 200 样本、P95 与 slowRatio release 阈值。
  - `clipboard:stress` 新增 `--output <summary.json>` 精确输出入口，模板同步生成 `performance.clipboardStressCommand`，可直接写到 acceptance manifest 期望的 `clipboard-stress-summary.json`。
  - `--requireVerifierCommandGateFlags` 会同时校验 search trace / clipboard stress 的采样命令和复核命令，避免只约束 verifier command 而采样命令仍使用弱阈值或短 duration。
  - 这些命令只降低采样操作成本，不替代 `search:trace:verify`、`clipboard:stress:verify` 与 acceptance 层对归档 JSON 的硬门禁复算。

### test(core-app): require manual acceptance evidence paths

- `apps/core-app/scripts/windows-acceptance-verify.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - `manualChecks.commonAppLaunch.checks[]`、`manualChecks.updateInstall` 与 `manualChecks.divisionBoxDetachedWidget` 新增 `evidencePath` 字段，模板会生成 `evidence/windows/manual/*.md` 占位路径。
  - 手工 gate 在布尔项全为 true 时仍要求 `evidencePath`，避免只勾选手工项而没有截图、日志、录屏或操作记录。
  - `windows:acceptance:verify --requireExistingEvidenceFiles` 会同时校验 manual evidence path 指向的文件真实存在。
  - `windows:acceptance:verify --requireNonEmptyEvidenceFiles` 会在存在性检查之后拒绝目录或 0 字节 case/performance/manual evidence 文件；`--requireCompletedManualEvidence` 会拒绝仍有未勾选项或没有 Markdown checklist 的手工证据；模板推荐命令与 recommended command gate 默认带上这两个参数，避免空占位文件或未完成模板被最终验收误收。

### feat(core-app): gate DivisionBox detached widget acceptance checks

- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `apps/core-app/scripts/windows-acceptance-verify.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - Windows acceptance manifest 新增 `manualChecks.divisionBoxDetachedWidget`，结构化记录插件 widget 分离窗口的真机手工验收项。
  - `windows:acceptance:verify` 新增 `--requireDivisionBoxDetachedWidgetManualChecks`，逐项要求插件 feature 可搜、分离窗口打开、session 使用真实 feature pluginId、`initialState.detachedPayload` 首帧水合、payload 恢复、widget surface 渲染、原始 query 保留且没有回退到错误搜索结果。
  - `windows:acceptance:template` 的 recommended command 与 blocked 模板已携带该 gate，避免 DivisionBox detached widget 仅有单测而缺 release acceptance 证据槽位。

### feat(core-app): add copied app path to Windows acceptance required cases

- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - Windows acceptance required cases 新增 `windows-copied-app-path-index`，把“复制 app path 加入本地启动区并进入 app-index”从普通第三方 App 启动验收中拆出。
  - 该 case 要求 Windows capability evidence 与 App Index diagnostic evidence 同时存在并通过，App Index 侧固定 `path/shortcut` launchKind、launchTarget、clean/fallback displayName、icon、reindex 与专用 caseId。
  - `windows:acceptance:template` 会生成对应 capability/app-index evidence path 与 verifier command，避免真机验收只覆盖 Start Menu/普通启动而漏掉复制路径入口。

### feat(core-app): require Windows update install manual acceptance checks

- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `apps/core-app/scripts/windows-acceptance-verify.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - Windows acceptance manifest 新增 `manualChecks.updateInstall`，结构化记录 UAC、安装器启动/退出、应用退出释放占用、安装后版本、重启可用与失败回滚手工验收项。
  - `windows:acceptance:verify` 新增 `--requireUpdateInstallManualChecks`，最终 gate 会逐项检查上述布尔项，缺失或未确认时输出明确失败原因。
  - `windows:acceptance:template` 生成的 recommended command 已携带该 gate，并在模板中预填 blocked 状态的更新安装手工检查项，避免 Windows 自动安装证据漏掉 UAC/退出/回滚确认。

### feat(core-app): gate Windows auto update post-install version evidence

- `apps/core-app/src/main/modules/platform/update-diagnostic-verifier.ts`
- `apps/core-app/src/main/modules/platform/update-diagnostic-verifier.test.ts`
- `apps/core-app/src/renderer/src/views/base/settings/update-diagnostic-evidence.ts`
- `apps/core-app/src/renderer/src/views/base/settings/update-diagnostic-evidence.test.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUpdate.vue`
- `apps/core-app/scripts/update-diagnostic-verify.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - Update diagnostic evidence 新增可选 `installedVersion`，记录当前运行版本、目标更新版本与版本一致性判定。
  - `update:diagnostic:verify` 新增 `--requireInstalledVersion` 与 `--requireInstalledVersionMatchesTarget`，可在 Windows 真机安装后把“运行版本已切到目标版本”纳入硬门禁。
  - `windows:acceptance:template -- --updateInstallMode auto` 生成的自动安装 verifier command 已携带 `--requireInstalledVersionMatchesTarget`，acceptance verifier 的命令强度检查同步要求该 gate。
  - `windows:acceptance:verify --requireEvidenceGatePassed` 的 update evidence 复算也会按 `verdict.installMode` 动态收紧：`windows-auto-installer-handoff` 必须通过安装后版本匹配，`windows-installer-handoff` 必须保留用户确认与 unattended disabled，避免只靠命令字段或 embedded gate 代理通过。
  - 该 gate 只补安装后版本证据，不替代 UAC/权限提升、安装器退出与失败回滚的真机验收。

### test(core-app): enforce Everything diagnostic backend attempt consistency

- `apps/core-app/src/main/modules/platform/everything-diagnostic-verifier.ts`
- `apps/core-app/src/main/modules/platform/everything-diagnostic-verifier.test.ts`
- `apps/core-app/src/main/modules/platform/windows-capability-evidence.ts`
- `apps/core-app/src/main/modules/platform/windows-capability-evidence.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - `everything-diagnostic-evidence` 复核新增 `verdict.hasBackendAttemptErrors` 与 `status.backendAttemptErrors` 的一致性检查，避免导出证据隐藏 sdk-napi/cli 后端尝试错误后仍被 acceptance 层误收。
  - 保持正常 fallback chain 记录不降级：只要求 verdict 标记与实际错误记录一致，不要求健康 backend 必须没有历史尝试错误；Everything 目标查询命中继续由 Windows capability evidence target probe 和 acceptance case 复算归档。
  - `windows:capability:verify --requireEverythingTargets` 进一步要求 Everything 基础查询命令成功且返回结果，并要求每个目标 probe 同时具备 `found=true`、正数 `matchCount` 与至少一条包含目标关键词的样本，避免手工构造 `found=true` 但没有查询输出或样本不匹配的弱证据通过。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/platform/everything-diagnostic-verifier.test.ts" "src/main/modules/platform/windows-capability-evidence.test.ts" "src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts"` 通过。

### fix(core-app): expand Windows env app paths for clipboard app indexing

- `apps/core-app/src/main/modules/box-tool/addon/system/system-actions-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/system/system-actions-provider.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - SystemActionsProvider 新增 Windows `%ENV%` 路径展开，支持 `%LOCALAPPDATA%` / `%USERPROFILE%` 等环境变量开头的 `.exe/.lnk/.appref-ms` app path。
  - 文本候选提取可识别未加引号或带引号的 `%ENV%\\...` 命令行，并复用现有 app 可执行前缀探测，含空格和尾随参数时只把真实应用路径加入 `appProvider.addAppByPath()`。
  - 未知环境变量保持原样，避免把不可解析输入误展开为错误路径。

### perf(core-app): reclaim idle FileProvider task workers

- `apps/core-app/src/main/modules/box-tool/addon/files/workers/idle-worker-shutdown.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/workers/idle-worker-shutdown.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/workers/file-scan-worker-client.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/workers/file-index-worker-client.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/workers/file-reconcile-worker-client.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/workers/icon-worker-client.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/workers/thumbnail-worker-client.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - 新增 `IdleWorkerShutdownController`，统一处理 worker 空闲延迟回收，重复 schedule 不延长已有回收窗口，避免状态 metrics 采样让 worker 长期保活。
  - `file-scan`、`file-index`、`file-reconcile`、`icon`、`thumbnail` 任务型 worker 在任务与 metrics 请求全部清空后延迟 60 秒自动终止，下一次任务继续按需重启。
  - 预期终止后的非 0 exit 不再被误记为 worker failure；异常路径仍会 reject pending task、清空 metrics 请求并记录 warning。
  - `SearchIndexWorkerClient` 后续已纳入安全空闲回收：退出时仅保留 `dbPath`，下一次写入前自动重新 init worker，避免破坏 `init(dbPath)` 门禁与 single-writer 写入语义。

### feat(core-app): add guarded Windows automatic installer handoff

- `packages/utils/types/update.ts`
- `packages/utils/transport/events/types/update.ts`
- `apps/core-app/src/main/modules/update/UpdateService.ts`
- `apps/core-app/src/main/modules/update/update-system.ts`
- `apps/core-app/src/main/modules/update/update-system.test.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useUpdateRuntime.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUpdate.vue`
- `apps/core-app/src/renderer/src/views/base/settings/update-diagnostic-evidence.ts`
- `apps/core-app/src/main/modules/platform/update-diagnostic-verifier.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `apps/core-app/scripts/update-diagnostic-verify.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - 新增 `autoInstallDownloadedUpdates` 更新设置，默认 `false`；仅 Windows 高级设置可显式开启。
  - 自动下载任务可携带 `autoInstallOnComplete` 标记，下载完成后才会自动调用现有 NSIS/MSI installer handoff 并退出应用；手动下载仍只显示下载完成通知，不会被自动接管。
  - Update diagnostic evidence 新增 `windows-auto-installer-handoff` installMode、`autoInstallDownloadedUpdates` 与 `unattendedAutoInstallEnabled` 字段；`update:diagnostic:verify` 新增 `--requireAutoInstallEnabled` / `--requireUnattendedEnabled`，同时保持旧 evidence 缺字段时按自动安装关闭处理。
  - Update diagnostic verifier 新增 Windows handoff 模式一致性校验：手动接管必须保持用户确认且不能标记 unattended，自动接管必须与 `autoInstallDownloadedUpdates` / `unattendedAutoInstallEnabled` 同时成立。
  - `windows:acceptance:template -- --updateInstallMode auto` 可生成自动接管 update verifier command，acceptance verifier 的 command gate 同时接受手动接管与自动接管两套 release flags；默认模板仍保持手动 `windows-installer-handoff` gate。
  - 当前仍需 Windows 真机验证 UAC/安装器退出/失败回滚与 acceptance manifest 证据归档，未把 Windows 更新自动安装闭环标记为完成。

### feat(nexus): persist provider health checks

- `apps/nexus/server/utils/providerHealthStore.ts`
- `apps/nexus/server/utils/providerHealthStore.test.ts`
- `apps/nexus/server/api/dashboard/provider-registry/health.get.ts`
- `apps/nexus/server/api/dashboard/provider-registry/health.api.test.ts`
- `apps/nexus/server/api/dashboard/provider-registry/providers/[id]/check.post.ts`
- `apps/nexus/server/api/dashboard/provider-registry/provider-registry.api.test.ts`
- `apps/nexus/app/pages/dashboard/admin/provider-registry.vue`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md`
  - 新增 `provider_health_checks` D1 表与 store，记录 provider check 的 provider/capability、healthy/degraded/unhealthy、latency、endpoint、requestId、errorCode/errorMessage 和 degradedReason。
  - 现有 `/api/dashboard/provider-registry/providers/:id/check` 在执行腾讯云机器翻译 live check 后自动写入健康历史；写入失败只记录服务端 warning，不改变 check 响应。
  - 新增 Dashboard Admin `/api/dashboard/provider-registry/health` 查询接口与 Provider Registry Health 视图，展示最近检查的 latency、错误和 degraded reason。
  - Scene Orchestrator 的 strategy 字段已进入最小路由逻辑：`priority/manual` 保持优先级/权重/providerId 排序，`least_cost` 读取 binding constraints 或 capability metering/metadata 成本字段，`lowest_latency` 读取最新 provider health latency，`balanced` 综合成本、延迟与权重后再回退到 priority 排序。
  - Provider Registry Dashboard 新增 Provider/Scene 深编辑面板，复用现有 PATCH API，可更新 Provider 基础字段、capability metering/constraints/metadata，以及 Scene strategy、meteringPolicy、auditPolicy、metadata、binding weight/status/constraints/metadata；后端 API 回归已固定这些 JSON 字段会完整保存和返回。
  - Scene Orchestrator 新增 `exchange-rate:fx.rate.latest` 与 `exchange-rate:fx.convert` 默认 adapter，复用现有 `exchangeRateService`，通过 Scene run 返回汇率快照/换算结果并写入 `fx_quote` usage、trace 与 ledger。
  - CoreBox 汇率预览已优先调用 Nexus `corebox.fx.convert`；非 USD 交叉汇率先尝试 `corebox.fx.latest` 注入本地缓存后换算；未登录、Scene 不可用或调用失败时保留本地 `FxRateProvider` fallback。
  - `/api/exchange/latest` 与 `/api/exchange/convert` 已新增 Scene bridge，优先执行 `corebox.fx.latest` / `corebox.fx.convert`，Scene 缺失、不可用或输出无效时回退原 `exchangeRateService` 并在响应里返回非破坏性的 `degradedReason`。
  - CoreBox 图片动作新增“翻译并置顶”：主进程复用 direct `corebox.screenshot.translate` Scene 输出，在独立 always-on-top 图片窗口展示翻译结果；原“翻译图片”继续写回系统剪贴板。
  - 当前仍未实现 composed `vision.ocr -> text.translate -> overlay.render` pipeline 与 AI provider 迁移。

### feat(nexus): persist provider scene usage ledger

- `apps/nexus/server/utils/providerUsageLedgerStore.ts`
- `apps/nexus/server/utils/providerUsageLedgerStore.test.ts`
- `apps/nexus/server/utils/sceneOrchestrator.ts`
- `apps/nexus/server/utils/sceneOrchestrator.test.ts`
- `apps/nexus/server/api/dashboard/provider-registry/usage.get.ts`
- `apps/nexus/server/api/dashboard/provider-registry/usage.api.test.ts`
- `apps/nexus/app/pages/dashboard/admin/provider-registry.vue`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md`
  - 新增 `provider_usage_ledger` D1 表与 store，将 Scene run 的 runId、sceneId、mode/status、providerId/capability、usage、error、trace、fallbackTrail、selected 安全元数据持久化。
  - Scene Orchestrator 在 dry-run、成功执行和标准失败路径统一写 ledger；落库失败只记录服务端 warning，不改变用户侧 Scene run 结果。
  - 新增 Dashboard Admin `/api/dashboard/provider-registry/usage` 查询接口与 Provider Registry Usage 视图，可查看最近 run 的 metering、provider ref、error、trace 与 fallback trail。
  - Ledger 明确不保存用户输入、截图/图片、翻译输出或完整 provider 响应，凭证引用也不会进入 selected 审计 payload。
  - 当前仍未实现 composed `vision.ocr -> text.translate -> overlay.render` pipeline、图片 pin window、Health check 与汇率/AI provider 迁移。

### feat(core-app): route clipboard image translation through Nexus Scene

- `apps/core-app/src/shared/events/corebox-scenes.ts`
- `apps/core-app/src/main/modules/nexus/scene-client.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/image-translate.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/ipc.ts`
- `apps/core-app/src/renderer/src/components/render/ActionPanel.vue`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useActionPanel.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useKeyboard.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md`
  - CoreBox 图片项动作面板新增“翻译图片”，仅对 `kind: image` 的剪贴板图片结果展示。
  - 主进程新增 `core-box:image-translate` typed event 与图片翻译执行器：读取剪贴板图片原始本地内容，调用 Nexus `corebox.screenshot.translate` Scene 的 direct `image.translate.e2e` capability，并将翻译后的图片写回系统剪贴板。
  - Nexus Scene client 增加 `translatedImageBase64/sourceText/targetText` 提取，保持 token 与 Provider 选择逻辑只在 main/runtime API 链路内。
  - 当前仍未实现 composed `vision.ocr -> text.translate -> overlay.render` pipeline、图片 pin window、Health check 与汇率/AI provider 迁移。

### perf(core-app): layer native file search and slim search payloads

- `packages/utils/common/utils/polling.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/native-file-search-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/darwin.ts`
- `apps/core-app/src/main/core/channel-core.ts`
  - 文件搜索改为平台原生 fast layer + 自建索引 enrichment layer：Windows 保持 Everything，macOS 新增 Spotlight/mdfind provider，Linux 按 locate/Tracker/Baloo 可用性探测接入，FileProvider 保留 FTS/内容索引慢层。
  - CoreBox 首帧搜索只做基础排序，usage/pinned/completion/semantic 后处理改为异步 enrichment 推送，避免首帧被行为统计和补全权重拖慢。
  - macOS AppScanner fresh scan 不再调用 `mdls` 或生成 base64 图标；`mdls` 保留后台 maintenance lane 修正 displayName，缺失 `Info.plist` 的无效 `.app` 直接跳过。
  - 搜索结果图标/缩略图不再内联 base64，大字段统一瘦身为 `tfile://`/本地路径引用并由 renderer 懒加载；IPC 序列化新增大 payload 监控。

### test(core-app): require app index icon evidence

- `packages/utils/transport/events/types/app-index.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider-diagnostics.ts`
- `apps/core-app/src/renderer/src/views/base/settings/app-index-diagnostic-evidence.ts`
- `apps/core-app/src/renderer/src/views/base/settings/app-index-diagnostic-evidence.test.ts`
- `apps/core-app/src/main/modules/platform/app-index-diagnostic-verifier.ts`
- `apps/core-app/src/main/modules/platform/app-index-diagnostic-verifier.test.ts`
- `apps/core-app/scripts/app-index-diagnostic-verify.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `docs/INDEX.md`
- `docs/plan-prd/TODO.md`
  - App Index diagnostic app 新增轻量 `iconPresent` 字段，只记录索引图标是否存在，不把图标本体写入验收 JSON。
  - `app-index:diagnostic:verify` 新增 `--requireIcon`；Windows acceptance 的 app-index 子证据复算和模板 verifier command 都会要求该门禁，避免常见 App 真机验收只证明可搜/可启动但未覆盖索引图标缺失。

### perf(core-app): apply CoreBox active polling pressure

- `packages/utils/common/utils/polling.ts`
- `packages/utils/__tests__/polling-service.test.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/manager.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/manager.test.ts`
- `apps/core-app/src/main/utils/perf-context.ts`
- `apps/core-app/src/main/utils/perf-monitor.ts`
- `apps/core-app/src/main/utils/perf-context.test.ts`
- `docs/plan-prd/README.md`
  - `PollingService` 新增带 reason/TTL 的全局 pressure，可按 lane 放大轮询间隔并压低并发上限，诊断快照会暴露当前 pressure 便于排查后台争用。
  - CoreBox 展示期间短时设置 `corebox-active` pressure，隐藏时清理；搜索交互窗口内会降低 realtime/io/maintenance/serial 后台 polling lane 的频率与并发，减少启动搜索和剪贴板/索引轮询竞争。
  - `PerfContext` 慢上下文告警改为只在 `blocking` 模式或近期 event-loop lag 存在时输出，普通异步耗时不再单独刷慢上下文 warn，并把最近 lag 信息写入告警 meta。

### test(core-app): require detailed common app launch acceptance

- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `apps/core-app/scripts/windows-acceptance-verify.ts`
- `docs/INDEX.md`
- `docs/plan-prd/TODO.md`
  - Windows acceptance manifest 的 `manualChecks.commonAppLaunch` 新增 `checks[]` 详情字段，可对 ChatApp / Codex / Apple Music 等样本分别记录 `searchHit`、`displayNameCorrect`、`iconCorrect`、`launchSucceeded` 与 `coreBoxHiddenAfterLaunch`。
  - `windows:acceptance:verify` 新增 `--requireCommonAppLaunchDetails`，最终强门禁会要求每个 common app target 都完成五项确认；`windows:acceptance:template` 会生成对应占位并把该参数写入 `verification.recommendedCommand`，避免只填 `passedTargets` 就绕过真实启动体验验收。

### test(core-app): require strict clipboard stress evidence in Windows acceptance

- `apps/core-app/src/main/modules/platform/clipboard-stress-verifier.ts`
- `apps/core-app/src/main/modules/platform/clipboard-stress-verifier.test.ts`
- `apps/core-app/scripts/clipboard-stress-verify.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `docs/INDEX.md`
- `docs/plan-prd/TODO.md`
  - `clipboard:stress:verify` 新增 `--strict`，用于强制 `clipboard-stress-summary/v1` schema；Windows acceptance 复算 clipboard stress 性能证据时也启用 strict schema 校验。
  - `windows:acceptance:template` 生成的 clipboard stress verifier command 会自动携带 `--strict`；`--requireVerifierCommandGateFlags` 也会要求 manifest 内 clipboard stress verifier command 带上该参数，避免非标准 summary 或弱 schema 子证据被最终验收误收。

### docs(ai): add Tuff 2.5.0 AI desktop entry plan PRD

- `docs/plan-prd/03-features/ai-2.5.0-plan-prd.md`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - 新增 2.5.0 AI 板块主 PRD，版本定位为“桌面 AI 入口收口版本”，优先收口 CoreBox / OmniPanel 的用户可感知 AI 场景，不把 2.5.0 定义为大规模 AI runtime 重写或单纯 Nexus Provider/Scene 底座建设。
  - 锁定 Stable / Beta / Experimental 分级：Stable 只承诺 `text.chat`、翻译、摘要、改写、代码解释/审查与 `vision.ocr`；Workflow 模板与 AI 高级 Chat / DeepAgent 联动进入 Beta；Assistant、多模态生成编辑与 Nexus Scene runtime orchestration 进入 Experimental / 2.5.x 后续。
  - 固化 Provider 安全合同：provider metadata 可进入普通配置，API Key / secret 必须进入 secure-store 或以 `authRef` 表示；审计默认只记录 traceId、provider、model、latency、usage 与 errorCode，不保存完整 prompt / response。
  - 明确 2.5.0 不打断当前 `2.4.10 -> 2.4.11` legacy/compat 与跨平台回归门禁节奏。

### docs(governance): add cross-platform compatibility and placeholder audit

- `docs/plan-prd/report/cross-platform-compat-placeholder-audit-2026-05-10.md`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - 新增跨平台兼容与占位/假实现审计报告，确认 CoreApp 平台能力已具备显式 degraded/unsupported 合同，Linux 保持 documented best-effort，Windows/macOS 仍需 release-blocking 人工证据。
  - 锁定 P0 假值风险：AI `system/serve/stat` 仍返回 Mock CPU/固定资源数据，AI 兼容支付仍返回 `chatapp://wxpay/aiapp/mock/*` 与 `DUMMY` 订单形态；后续必须以真实 metrics 或显式 unavailable / mock-mode 门控替代。
  - 锁定 P1 治理项：`plugins/touch-image` 图片历史路径仍直接落 renderer `localStorage`；本次复核生产 raw send 直连未见新增命中，但 retained `defineRawEvent` definition 仍有 342 处，需要与 raw send violation 分开统计；`clipboard/search-core/plugin/app-provider/update-system` 等超长模块继续作为 SRP 拆分优先候选。
  - 同步 README、INDEX、TODO、路线图与质量基线入口；当前工作区基线校准为 `2.4.10-beta.18`。

### fix(core-app): enable update auto-download by default

- `apps/core-app/src/renderer/src/views/base/settings/AppSettings.vue`
- `apps/core-app/src/main/modules/update/UpdateService.ts`
- `apps/core-app/src/main/modules/update/update-system.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useUpdateRuntime.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useUpdateRuntime.test.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUpdate.vue`
- `packages/utils/types/update.ts`
- `packages/utils/__tests__/types/update.test.ts`
  - Update 默认设置统一改为 `autoDownload: true`，首次安装或设置读取失败时会自动下载可用更新包；现有用户显式关闭仍通过持久化设置保留。
  - 更新设置页保留“自动下载更新”开关，channel/frequency/renderer override 与诊断证据入口收进高级设置，降低普通用户默认配置噪音。
  - 文件索引入口整体收进高级设置，普通设置页不再默认展示索引状态、重建入口与索引统计。
  - 工具设置页的 OmniPanel 右键长按时长、剪贴板轮询间隔与推荐数量收进高级设置，普通模式仅保留常用行为开关。
  - 当前 Windows 路径仍是下载完成后通过安装器安装；静默自动安装需要单独确认安装器参数、权限提升与回滚策略，尚未标记完成。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/renderer/src/modules/hooks/useUpdateRuntime.test.ts" "src/main/modules/update/services/update-action-controller.test.ts"` 通过；`pnpm -C "packages/utils" exec vitest run "__tests__/types/update.test.ts"` 通过。

### test(core-app): add Windows capability evidence CLI

- `apps/core-app/scripts/windows-capability-evidence.ts`
- `apps/core-app/scripts/windows-capability-verify.ts`
- `apps/core-app/src/main/modules/platform/windows-capability-evidence.ts`
- `apps/core-app/src/main/modules/platform/windows-capability-evidence.test.ts`
- `apps/core-app/package.json`
- `docs/INDEX.md`
- `docs/plan-prd/TODO.md`
  - 新增 `windows-capability-evidence/v1` 证据汇总与 `pnpm -C "apps/core-app" run windows:capability:evidence` 本地脚本，Windows 上采集 PowerShell 可用性、Everything CLI 路径/版本/轻量查询、Everything 目标关键词查询、`Get-StartApps` UWP/桌面路径计数、registry uninstall fallback 可执行候选、Start Menu `.lnk/.appref-ms/.exe` 入口、`.lnk` target/arguments/workingDirectory 与目标应用命中情况。
  - 默认目标为 ChatApp、Codex、Apple Music，也可用重复 `--target` 指定；`--requireEverything` / `--requireTargets` 可把缺失项升级为 gate failure，`--output` 可直接落盘 JSON 供真机验收归档。
  - `--installer <path>` 会复用现有 `resolveWindowsInstallerCommand()` 生成 NSIS `/S` 或 MSI `msiexec.exe /i ... /passive /norestart` dry-run 证据；脚本不会启动安装器，且显式保留 `unattendedAutoInstallEnabled: false`，避免把用户触发安装 handoff 误标为下载完成后无人值守自动安装。
  - 新增 `windows:capability:verify`，可从 evidence JSON 重新计算 gate，并用 `--requireEverything --requireEverythingTargets --requireTargets --requireUwp --requireRegistryFallback --requireShortcutMetadata --requireApprefMs --requireShortcutArguments --requireShortcutWorkingDirectory --requireInstallerHandoff` 把 Windows 真机验收项升级为硬门禁。
  - 非 Windows 环境不会伪造通过，会输出 `status: "skipped"` 与 `platform <name> is not win32` warning，避免把本机 macOS smoke 当成 Windows 真机证据。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/platform/windows-capability-evidence.test.ts"` 通过；`pnpm -C "apps/core-app" run windows:capability:evidence -- --compact --installer "C:/Downloads/tuff-2.4.10-setup.exe" --output "/private/tmp/windows-capability-evidence-smoke.json"` 与 `pnpm -C "apps/core-app" run windows:capability:verify -- --input "/private/tmp/windows-capability-evidence-smoke.json" --compact` 在当前 macOS 输出 skipped evidence 与 NSIS handoff dry-run。

### test(core-app): add app index diagnostic evidence verifier

- `apps/core-app/scripts/app-index-diagnostic-verify.ts`
- `apps/core-app/src/main/modules/platform/app-index-diagnostic-verifier.ts`
- `apps/core-app/src/main/modules/platform/app-index-diagnostic-verifier.test.ts`
- `apps/core-app/package.json`
- `docs/INDEX.md`
- `docs/plan-prd/TODO.md`
  - 新增 `app-index:diagnostic:verify`，可对 Settings App Index diagnostic 导出的 `app-index-diagnostic-evidence` JSON 离线复核 target 命中、query matched stage、launchKind、launchTarget、bundle/appIdentity、reindex 与 reusable caseId。
  - 该 verifier 只消费本地诊断 JSON，不写 Release Evidence、不触发扫描或启动应用；用于 Windows 真机完成 UWP/shortcut/path 搜索索引证据后做硬门禁复核。

### test(core-app): add Everything diagnostic evidence verifier

- `apps/core-app/scripts/everything-diagnostic-verify.ts`
- `apps/core-app/src/main/modules/platform/everything-diagnostic-verifier.ts`
- `apps/core-app/src/main/modules/platform/everything-diagnostic-verifier.test.ts`
- `apps/core-app/package.json`
- `docs/INDEX.md`
- `docs/plan-prd/TODO.md`
  - 新增 `everything:diagnostic:verify`，可对 Settings Everything 导出的 `everything-diagnostic-evidence` JSON 离线复核 ready/enabled/available/backend/health/version/esPath/fallbackChain 与 reusable caseId。
  - Everything diagnostic verifier 会拒绝 `verdict.backend/health/errorCode` 或 manual suggested fields 与 `status` 不一致的证据，避免手工拼接或过期 JSON 被 Windows acceptance manifest 误收。
  - 该 verifier 只消费本地诊断 JSON，不触发 Everything 查询、不修改设置；用于 Windows 真机 Everything/文件搜索回归后把截图式证据升级为可重复 gate。

### test(core-app): add update diagnostic evidence verifier

- `apps/core-app/scripts/update-diagnostic-verify.ts`
- `apps/core-app/src/main/modules/platform/update-diagnostic-verifier.ts`
- `apps/core-app/src/main/modules/platform/update-diagnostic-verifier.test.ts`
- `apps/core-app/package.json`
- `docs/INDEX.md`
- `docs/plan-prd/TODO.md`
  - 新增 `update:diagnostic:verify`，可对 Settings Update 导出的 `update-diagnostic-evidence` JSON 离线复核 autoDownload、downloadReady、readyToInstall、Windows installer handoff、用户确认、无人值守未开启、cached release、matching asset、checksum 与 reusable caseId。
  - Update diagnostic verifier 会拒绝 `verdict.downloadReady/readyToInstall`、cached release matching asset 计数或 manual suggested fields 与源状态不一致的证据，避免过期或手工拼接 JSON 被 Windows acceptance manifest 误收。
  - 该 verifier 只消费本地诊断 JSON，不启动安装器、不修改更新设置；用于 Windows 更新下载/安装 handoff 真机回归后把 JSON 证据升级为可重复 gate。

### fix(core-app): align Everything diagnostic evidence case id

- `apps/core-app/src/renderer/src/views/base/settings/everything-diagnostic-evidence.ts`
- `apps/core-app/src/renderer/src/views/base/settings/everything-diagnostic-evidence.test.ts`
- `apps/core-app/src/main/modules/platform/everything-diagnostic-verifier.test.ts`
  - Everything diagnostic evidence 的 reusable caseId 从 `windows-everything-search` 对齐为 release matrix 固化的 `windows-everything-file-search`。
  - 继续保留 `windows-file-search-fallback` 作为本地 fallback 诊断复用字段，避免 Windows 真机 Everything 证据后续归档时与矩阵 caseId 不一致。

### test(core-app): extend app index diagnostic shortcut evidence

- `apps/core-app/src/renderer/src/views/base/settings/app-index-diagnostic-evidence.ts`
- `apps/core-app/src/renderer/src/views/base/settings/app-index-diagnostic-evidence.test.ts`
- `apps/core-app/src/main/modules/platform/app-index-diagnostic-verifier.ts`
- `apps/core-app/src/main/modules/platform/app-index-diagnostic-verifier.test.ts`
- `apps/core-app/scripts/app-index-diagnostic-verify.ts`
- `docs/INDEX.md`
- `docs/plan-prd/TODO.md`
  - App Index diagnostic evidence 的 reusable caseId 增加 release matrix 固化的 `windows-shortcut-launch-args`，并在 suggested evidence fields 中保留 shortcut `launchArgs` 与 `workingDirectory`。
  - `app-index:diagnostic:verify` 新增 `--requireLaunchArgs` 与 `--requireWorkingDirectory`，用于 Windows 真机验证 Start Menu `.lnk` 启动参数和工作目录不会在复制路径加入索引或搜索启动链路中丢失。

### fix(core-app): align update diagnostic evidence case id

- `apps/core-app/src/renderer/src/views/base/settings/update-diagnostic-evidence.ts`
- `apps/core-app/src/main/modules/platform/update-diagnostic-verifier.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/TODO.md`
  - Update diagnostic evidence 的 reusable caseId 增加 release matrix 固化的 `windows-tray-update-plugin-install-exit`，保留 `windows-update-download-ready` / `windows-installer-handoff` 作为本地细分诊断字段。
  - Windows 更新真机证据可用 `update:diagnostic:verify --requireCaseIds windows-tray-update-plugin-install-exit` 挂到现有平台阻塞矩阵。

### test(core-app): add Windows acceptance manifest verifier

- `apps/core-app/scripts/windows-acceptance-verify.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `apps/core-app/package.json`
- `docs/INDEX.md`
- `docs/plan-prd/TODO.md`
  - 新增 `windows-acceptance-manifest/v1`、`windows:acceptance:template` 与 `windows:acceptance:verify`，可先生成 blocked 初始清单，再汇总复核 Windows required caseId、单项 evidence path/verifier command、search trace、clipboard stress 与常见 App 启动样本；模板会写入 `verification.recommendedCommand`，便于真机证据补齐后直接运行最终强门禁。
  - 该 verifier 不替代单项 verifier，只负责防止真机验收漏掉 `windows-everything-file-search`、`windows-app-scan-uwp`、`windows-third-party-app-launch`、`windows-shortcut-launch-args`、`windows-tray-update-plugin-install-exit` 中任一 required case。
  - CLI 新增 `--requireExistingEvidenceFiles`，会按 manifest 文件所在目录解析相对 case evidence path、search trace stats path 与 clipboard stress summary path 并校验文件存在，避免只填路径但未归档 JSON 的假通过。
  - CLI 新增 `--requireEvidenceGatePassed`，会读取每个 case evidence JSON、search trace stats JSON 与 clipboard stress summary JSON 并要求 `gate.passed=true`，同时按 caseId 校验 case evidence 属于允许的 `windows-capability-evidence/v1` / app-index / Everything / update diagnostic schema，性能证据分别是 `search-trace-stats/v1` 与 `clipboard-stress-summary/v1`，避免失败或错误类型的 verifier 产物被 manifest 标成 passed。
  - CLI 新增 `--requireCaseEvidenceSchemas`，会要求每个 required case 同时具备 Windows capability evidence 与对应专项 diagnostic evidence；仅挂宽泛 capability JSON 会被标记为弱证据，避免 Everything/App Index/Update 等专项验收被单一汇总证据替代。
  - `windows:acceptance:verify` 在 evidence 文件缺失时只报告 missing，不再继续对同一路径追加 gate/schema mismatch 噪音，便于模板清单作为待办项使用。

### test(core-app): tighten Windows acceptance evidence gates

- `apps/core-app/scripts/windows-acceptance-verify.ts`
- `apps/core-app/scripts/windows-acceptance-template.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.ts`
- `apps/core-app/src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/TODO.md`
  - `windows:acceptance:verify --requireEvidenceGatePassed` 不再只信任子证据 JSON 内已有的 `gate.passed=true`；acceptance 层会按 required case 重新执行关键硬门禁：Everything case 复核 Everything CLI/targets 与 Everything diagnostic，UWP case 复核 `launchKind=uwp`、bundle/appIdentity 与 UWP capability，第三方启动 case 复核 target/registry/shortcut metadata，shortcut args case 复核 `.lnk` arguments/workingDirectory，更新 case 复核 installer handoff、用户确认、unattended disabled、matching asset 与 checksum。
  - search trace 与 clipboard stress 性能证据也由 acceptance 层复算固定预算：search trace 要求 200 paired sessions、first.result P95 ≤ 800ms、session.end P95 ≤ 1200ms、slowRatio ≤ 0.1；clipboard stress 要求 2 分钟 500/250ms、P95 scheduler delay ≤ 100ms、max scheduler delay ≤ 300ms、realtime queued peak ≤ 2、drop=0，避免用弱阈值生成的 `gate.passed=true` 误入最终 manifest。
  - `windows:acceptance:template` 生成的 app-index/update/performance verifier command 已按 caseId 和 release budget 收紧：UWP case 要求 `--requireLaunchKind uwp --requireBundleOrIdentity --requireCaseIds windows-app-scan-uwp`，第三方启动 case 要求 `--requireCaseIds windows-third-party-app-launch`，shortcut case 要求 shortcut args/cwd，更新 case 额外要求 `--requireChecksums`，性能命令带上 P95、slowRatio 与 queue peak/drop 阈值。
  - `windows:acceptance:verify` 新增 `--requireVerifierCommandGateFlags` 与 `--requireRecommendedCommandGateFlags`，会复核 manifest 内 case/performance verifier command 以及 `verification.recommendedCommand` 是否携带 `--input` 与 release 固定门禁参数；`windows:acceptance:template` 的 recommended command 默认开启这些检查，避免命令字段漂移成弱验收入口。
  - `windows:acceptance:verify --requireEvidenceGatePassed` 的失败输出会带出子证据复算原因，例如 launchKind、bundle/appIdentity、reindex、checksum 或性能阈值，减少 Windows 真机证据回填时的二次定位成本。
  - `windows:acceptance:verify` 新增 `--requireRecommendedCommandInputMatch`，会校验 `verification.recommendedCommand --input` 指回当前 manifest 文件；`windows:acceptance:template` 的 recommended command 默认开启该检查，避免清单移动或复制后继续指向旧验收文件。

### test(core-app): add App Index displayName fallback evidence gate

- `packages/utils/transport/events/types/app-index.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider-diagnostics.ts`
- `apps/core-app/src/main/modules/platform/app-index-diagnostic-verifier.ts`
- `apps/core-app/scripts/app-index-diagnostic-verify.ts`
- `apps/core-app/src/renderer/src/views/base/settings/app-index-diagnostic-evidence.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.test.ts`
- `apps/core-app/src/main/modules/platform/app-index-diagnostic-verifier.test.ts`
- `apps/core-app/src/renderer/src/views/base/settings/app-index-diagnostic-evidence.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/TODO.md`
  - App Index diagnostic app payload 新增可选 `rawDisplayName` 与 `displayNameStatus: clean | fallback | missing`，诊断层复用现有 corrupted displayName 判断和 fallback 逻辑，能把 Windows 坏 `display_name` 回退从运行时行为升级为可归档证据。
  - `app-index:diagnostic:verify` 新增 `--requireCleanDisplayName`，允许 `clean` 或 `fallback`，拒绝缺失/未知状态；Windows acceptance app-index case 也会复算该门禁，避免真机验收只证明可启动但未覆盖坏显示名回退。
  - `windows:acceptance:template` 生成的 app-index verifier command 均带 `--requireCleanDisplayName`，与 `TODO` 中 Windows App 索引真实设备验收命令保持一致。

### fix(core-app): prefer visible app title matches over plugin feature token matches

- `apps/core-app/src/main/modules/box-tool/search-engine/sort/tuff-sorter.ts`
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/sort/tuff-sorter.test.ts`
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.test.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.test.ts`
  - CoreBox 跨 provider 排序改为优先可见标题命中，plugin feature 的隐藏 `searchTokens/source.id` 命中降为低置信召回信号，避免搜索应用时被高频 plugin feature 抢占首位。
  - 隐藏 token/source fallback 分数已低于真实标题子串命中；`Visual Studio Code` 这类 App 标题子串匹配不会再被高频 feature token 抢到首位。
  - 隐藏 token/fuzzy-token/source fallback 召回会限制 frequency/recency 行为信号上限，避免极高历史次数或异常 recency 继续压过 App 可见标题命中；真实 feature 标题命中仍保留频率自学习前置能力。
  - App 标题前缀/词首/子串命中新增有限 intent bonus，避免中等频次、同样可见标题命中的 plugin feature 在明确 App 搜索意图下抢占首位；`Visual Studio Code` 这类标题后续单词命中也按强可见标题匹配处理，极高频 feature 仍可通过行为学习前置。
  - Plugin feature item 现在在 `meta.extension.source` 中保留 `token / fuzzy-token / name / command / input` 等匹配来源，排序器可区分“可见标题命中”和“隐藏 token 命中”。
  - 保留高匹配 feature 与高频 feature 的自学习能力；当 feature 可见标题同样命中时，使用频率仍可推动其前置。
  - 推荐引擎内存缓存新增 context cache key 校验，避免 morning/afternoon 等不同 `timeSlot/dayOfWeek` 上下文在 30 分钟 TTL 内复用旧推荐结果；同一 App 在当前 `timeSlot/dayOfWeek` 有历史使用记录时会获得时间上下文加权，候选去重也会保留后续 time-based 统计；当前 weekday 暂无样本时不再把时段相关性归零，并固定同一候选集在不同 `timeSlot` 下首位不同与 slot-only relevance 的回归，保证“不同时间推荐不同 App”的算法信号实际生效。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/sort/tuff-sorter.test.ts" "src/main/modules/plugin/adapters/plugin-features-adapter.test.ts" "src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.test.ts"` 通过。

### fix(core-app): preserve plugin identity for detached widget sessions

- `packages/utils/types/division-box.ts`
- `apps/core-app/src/main/modules/division-box/session.ts`
- `apps/core-app/src/main/modules/division-box/session.test.ts`
- `apps/core-app/src/main/modules/division-box/ipc.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useDetach.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/detached-division.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useDetach.test.ts`
  - DivisionBox 分离插件 feature 时优先使用 `meta.pluginName` 作为 session `pluginId`，不再把 `plugin-features` provider id 误写成真实插件身份。
  - Detached widget URL 的 `source` 改为真实插件 id，并用 `providerSource` 保留 `plugin-features` provider id；fallback 搜索过滤优先匹配 provider source，同时兼容旧 `source=plugin-features` 与新 `source=<pluginId>` URL，避免 session state 缺失时把真实插件身份和 provider 路由混淆。
  - `DivisionBoxConfig` 新增 `initialState`，主进程 `DivisionBoxSession` 构造期会先水合 session KV；detached widget 会把 `detachedPayload` 放入初始状态，避免新窗口启动时先读到空 state 再回退搜索。
  - DivisionBox IPC 对 `initialState` 增加对象校验，避免非对象 payload 进入 session 构造期。
  - Widget feature 仍走 `tuff://detached` + `detachedPayload` 恢复链路，webcontent feature 仍走 `plugin://<pluginId>/<path>`；普通 app/file 搜索结果不会构造 detached session。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/renderer/src/modules/box/adapter/hooks/useDetach.test.ts" "src/main/modules/division-box/session.test.ts" "src/main/modules/division-box/ipc.actor.test.ts" "src/main/modules/division-box/command-provider.test.ts"` 通过。

### perf(core-app): lazy DivisionBox memory pressure polling

- `apps/core-app/src/main/modules/division-box/manager.ts`
- `apps/core-app/src/main/modules/division-box/manager.test.ts`
  - DivisionBoxManager 不再在单例创建时立即注册 `division-box.memory-pressure`，避免没有 DivisionBox 窗口时仍常驻 30 秒内存轮询。
  - 当创建 active/cached session 时按需注册内存压力轮询；最后一个 session 销毁、窗口关闭触发 destroy 或缓存驱逐清空后注销任务。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/division-box/manager.test.ts" "src/main/modules/division-box/session.test.ts" "src/main/modules/division-box/ipc.actor.test.ts" "src/main/modules/division-box/command-provider.test.ts" "src/main/modules/division-box/shortcut-trigger.test.ts" "src/renderer/src/modules/box/adapter/hooks/useDetach.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过。

### test(core-app): cover copied app path app-index action

- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/system/system-actions-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/system/system-actions-provider.test.ts`
  - 补齐 SystemActionsProvider 回归，固定剪贴板/Files 输入中的 `.exe/.lnk/.appref-ms/.app` 路径会生成“加入应用索引”动作。
  - 固定 `file://` app URL 会先规范化成本地路径，再进入 app-index action；执行该动作时调用 `appProvider.addAppByPath()`，不会落到文件索引入口。
  - Windows 文本复制入口补齐未加引号、含空格且带参数的 app 命令行探测，会按 `.exe/.lnk/.appref-ms` 前缀逐段验证已存在文件，再归一化为 app-index action。
  - 复制 Windows UWP `shell:AppsFolder\\...` 虚拟路径或裸 `PackageFamily!App` AppID 时同样生成 app-index action；AppProvider 会把裸 AppID 归一化为 shell path，允许该虚拟路径进入 `addAppByPath()` 并跳过文件稳定性检查，交给 Windows scanner 解析 UWP app info。
  - Windows ClickOnce `.appref-ms` 现在在 app-provider 与 Windows scanner 侧一并进入 app 索引链路，避免动作层允许但 `addAppByPath()` 拒绝；Start Menu 扫描、实时变更、单项解析和执行 action 均已有回归。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/apps/win.test.ts" "src/main/modules/box-tool/addon/apps/app-provider.test.ts" "src/main/modules/box-tool/addon/system/system-actions-provider.test.ts"` 通过。

### feat(core-app): add Windows installer handoff strategy

- `apps/core-app/src/main/modules/update/update-system.ts`
- `apps/core-app/src/main/modules/update/services/windows-installer-strategy.ts`
- `apps/core-app/src/main/modules/update/services/windows-installer-strategy.test.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUpdate.vue`
- `apps/core-app/src/renderer/src/views/base/settings/update-diagnostic-evidence.ts`
- `apps/core-app/src/renderer/src/views/base/settings/update-diagnostic-evidence.test.ts`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
  - Windows 更新安装从单纯 `shell.openPath()` 补强为可测安装器 handoff：NSIS `*-setup.exe` 使用 `/S`，MSI 使用 `msiexec.exe /i <path> /passive /norestart`。
  - 安装器启动后复用现有 `requestAppQuit()` 退出当前应用，为安装程序释放文件占用；非 setup `.exe` 仍回落到 `shell.openPath()`，避免把裸可执行文件误当安装器。
  - Settings Update 页新增 `update-diagnostic-evidence` 复制/保存入口，导出 update settings/status、downloadReady/downloadTaskId、cached release/assets、platform/arch 与安装接管模式，Windows 路径会显式记录 `windows-installer-handoff` 与 `unattendedAutoInstallEnabled: false`。
  - 该改动只覆盖用户触发 install 后的安装启动策略；下载完成后无人值守自动安装仍需明确用户确认、UAC/权限提升与失败回滚策略后再打开。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/update/services/windows-installer-strategy.test.ts" "src/main/modules/update/services/update-action-controller.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/renderer/src/views/base/settings/update-diagnostic-evidence.test.ts"` 通过；`pnpm -C "apps/core-app" exec tsc --noEmit -p tsconfig.node.json --composite false --pretty false` 通过。

### perf(core-app): add backpressure for Everything icon warmup

- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-worker-status-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider-worker-status.test.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingEverything.vue`
- `apps/core-app/src/renderer/src/views/base/settings/everything-diagnostic-evidence.ts`
- `apps/core-app/src/renderer/src/views/base/settings/everything-diagnostic-evidence.test.ts`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
  - Windows Everything 搜索结果的图标预热新增轻量背压：app task 活跃时跳过可选图标提取，后台图标提取最多保留 4 个并发任务，等待空闲最长 250ms，避免快速输入或应用忙碌时堆积 icon worker。
  - FileProvider worker 状态快照从单纯 1 秒 TTL 缓存补强为 in-flight 去重；设置页/仪表盘并发刷新时复用同一个 metrics promise，失败不会污染缓存，减少 scan/index/reconcile/icon/thumbnail/search-index worker 的重复状态采样。
  - 搜索命中、排序与打开文件行为不变；无缓存图标时继续先返回 class fallback，后续命中缓存后再使用真实图标。
  - Everything 设置页新增 `everything-diagnostic-evidence` 复制/保存入口，导出当前 backend、health、fallbackChain、backendAttemptErrors、errorCode、lastBackendError 与手工回归 case id，便于 Windows 真机 Everything/文件搜索回归记录失败原因。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/everything-provider.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/file-provider-worker-status.test.ts"` 通过。

### perf(core-app): avoid battery probes before idle rejection

- `apps/core-app/src/main/service/device-idle-service.ts`
- `apps/core-app/src/main/service/device-idle-service.test.ts`
  - `DeviceIdleService.canRun()` 改为先判断系统 idle，再按需读取电量；未达到 idle threshold 时直接返回 `not-idle`，不再触发 Windows PowerShell 电量查询。
  - 电量状态新增 30 秒短 TTL 缓存与 in-flight 去重；同一 idle 窗口内的多个后台任务复用最近电量结果，冷启动并发读取也只触发一次外部电量探测，供电状态变化时立即失效并重读。
  - `forceAfter` 仍可绕过 idle threshold，并继续执行电量策略检查，保持低电量保护不变。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/service/device-idle-service.test.ts"` 通过。

### perf(core-app): cache file worker dashboard snapshots briefly

- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-worker-status-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider-worker-status.test.ts`
  - FileProvider worker 状态快照新增 1 秒短 TTL 缓存，TuffDashboard 短时间重复刷新时复用同一批 worker 状态，避免向 scan/index/reconcile/icon/thumbnail/search-index worker 重复发送 metrics 请求。
  - worker 状态摘要提取为轻量 service，保持 summary 口径可测；缓存窗口很短，不影响手动刷新查看 worker 运行态。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/file-provider-worker-status.test.ts"` 通过。

### test(core-app): add reusable search trace performance summary

- `apps/core-app/src/main/modules/box-tool/search-engine/search-trace-stats.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-trace-stats.test.ts`
- `apps/core-app/scripts/search-trace-stats.ts`
- `apps/core-app/scripts/search-trace-verify.ts`
- `apps/core-app/package.json`
  - 新增 `search-trace-stats/v1` 统计口径，可直接解析现有 `search-trace/v1` 日志行里的 `first.result` 与 `session.end` 事件，输出样本量、P50/P95/P99、最大耗时、慢查询数量与慢查询占比。
  - 统计结果新增 provider 慢源归因，会聚合慢 trace 详情中的 `providers.summary.topSlow`，输出 provider 级 sampleCount、P95、max、timeout/error 次数与结果数，便于 Windows 200 次采样后定位 Everything/file/app/plugin 哪类 provider 拖慢。
  - 统计结果显式返回 `enoughSamples`、配对 session 数和缺失 first/end 的 session 数，避免把不足 200 次或不完整采样误判为性能验收通过。
  - 新增 `pnpm -C "apps/core-app" run search:trace:stats -- --input <log-file> --strict` 本地统计入口，并支持 P95 / slowRatio 阈值参数，便于 Windows 真机采样后直接产出可复核 JSON 证据。
  - 新增 `pnpm -C "apps/core-app" run search:trace:verify -- --input <stats.json> --minSamples 200 --strict` 复核入口，可对已归档 `search-trace-stats/v1` JSON 重新执行样本数、P95 与 slowRatio 硬门禁，避免采样结果只能人工判读。
  - 该改动只提供可复用计算入口与门禁判断；真实 Windows 查询采样与 P95 证据仍需在设备上执行。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/search-trace-stats.test.ts"` 通过；`search:trace:stats` 与 `search:trace:verify` 使用 `/private/tmp/search-trace-smoke.log` / `/private/tmp/search-trace-stats-smoke.json` smoke 通过。

### test(core-app): add clipboard stress summary verifier

- `apps/core-app/src/main/modules/platform/clipboard-stress-verifier.ts`
- `apps/core-app/src/main/modules/platform/clipboard-stress-verifier.test.ts`
- `apps/core-app/scripts/clipboard-stress-verify.ts`
- `apps/core-app/package.json`
- `docs/INDEX.md`
- `docs/plan-prd/TODO.md`
  - 新增 `clipboard:stress:verify`，读取 `clipboard:stress` 的 summary JSON，复核 2 分钟窗口、必需 interval、clipboard scheduler delay P95/max、realtime queue peak、drop/timeout/error。
  - 该 verifier 只负责压测结果复核，不替代真实“全量索引 + 高频推荐 + 剪贴板图像轮询”设备压测；后续仍需在 Windows 目标设备上运行 `clipboard:stress` 并归档 summary。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/platform/clipboard-stress-verifier.test.ts"` 通过；`pnpm -C "apps/core-app" run clipboard:stress:verify -- --input "/private/tmp/clipboard-stress-summary-smoke.json" --minDurationMs 120000 --requireIntervals 500,250 --maxP95SchedulerDelayMs 100 --maxSchedulerDelayMs 200 --maxRealtimeQueuedPeak 2 --maxDroppedCount 0 --compact` 通过。

### test(core-app): cover app-index diagnostic evidence failure payload

- `apps/core-app/src/renderer/src/views/base/settings/app-index-diagnostic-evidence.ts`
- `apps/core-app/src/renderer/src/views/base/settings/app-index-diagnostic-evidence.test.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndexAppDiagnostic.vue`
  - App Index diagnostic 已可复制/保存 `app-index-diagnostic-evidence` JSON，记录目标路径、launchKind/target、bundle/appIdentity、generated/stored keywords、precise/phrase/prefix/FTS/N-gram/subsequence 阶段命中、reindex 状态与手工回归 case id。
  - 补充 not-found 失败证据回归，固定 `status/reason/matchedStages` 在未命中时仍会进入导出 payload，便于 Windows 真机验证时记录失败原因。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/renderer/src/views/base/settings/app-index-diagnostic-evidence.test.ts"` 通过。

### fix(core-app): gate file index idle policy behind advanced settings

- `apps/core-app/src/renderer/src/views/base/settings/AppSettings.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUpdate.vue`
- `apps/core-app/src/renderer/src/modules/hooks/useUpdateRuntime.ts`
- `apps/core-app/src/main/modules/update/{UpdateService,update-system}.ts`
- `packages/utils/types/update.ts`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
  - 文件索引设置页的后台索引策略分组改为仅在“高级设置”开启时显示，与应用索引调度和下载设置的高级显隐规则保持一致。
  - Nexus 数据分析与存储入口同步收敛到高级设置开关下，并更新高级设置说明文案，减少默认设置页噪音。
  - 应用更新页的更新渠道、检查频率与 Renderer Override 入口默认隐藏，仅在高级设置开启时显示；自动下载更新的默认配置改为启用。

## 2026-05-09

### fix(core-app): restore file index auto scan eligibility query

- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-watch-service.ts`
  - File Index Auto Scan 的扫描资格检查改用 Drizzle `scanProgress` schema table object，避免字符串表名生成非法 `select  from ?` SQL。
  - `lastScanned` 解析兼容 `Date`、`number` 与 `string`，避免已扫描路径因时间戳返回类型差异被误判为未扫描。

### feat(nexus): add provider registry backend foundation

- `apps/nexus/server/utils/providerRegistryStore.ts`
- `apps/nexus/server/utils/sceneRegistryStore.ts`
- `apps/nexus/server/utils/providerCredentialStore.ts`
- `apps/nexus/server/utils/tencentMachineTranslationProvider.ts`
- `apps/nexus/server/utils/sceneOrchestrator.ts`
- `apps/nexus/server/api/v1/scenes/[id]/run.post.ts`
- `apps/nexus/server/api/v1/scenes/scene-runtime.api.test.ts`
- `apps/core-app/src/main/modules/nexus/scene-client.ts`
- `apps/core-app/src/main/modules/nexus/scene-client.test.ts`
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `apps/core-app/src/main/modules/omni-panel/index.test.ts`
- `apps/nexus/server/api/dashboard/provider-registry/*`
- `apps/nexus/app/pages/dashboard/admin/provider-registry.vue`
- `apps/nexus/app/components/dashboard/DashboardNav.vue`
  - 新增 Nexus 通用 Provider / Scene registry 后端基础，落地 `provider_registry`、`provider_capabilities`、`scene_registry` 与 `scene_strategy_bindings` D1 表、provider CRUD、capability 查询、scene CRUD、strategy binding 管理和 dashboard admin API。
  - Provider 凭证仅接受 `authRef` 安全存储引用，`apiKey`、`secretId`、`secretKey`、token 等明文字段会在 API 输入边界被拒绝。
  - 新增 Dashboard Admin 的 Provider Registry 配置页入口，提供 Providers / Capabilities / Scenes 三视图、Provider 创建/状态切换/删除、Capability 只读查看、Scene 创建/状态切换/删除、Scene dry-run/execute 测试面板和 strategy binding 基础管理。
  - 补充 provider registry 与 scene registry API 回归，覆盖腾讯云机器翻译样例 provider 的 `text.translate`、`image.translate`、`image.translate.e2e` capability 登记，以及截图翻译 scene 的 provider capability binding、列表、更新和删除。
  - Provider Registry `authRef` 已接入 Nexus D1 密文 secure store：新增 `/api/dashboard/provider-registry/credentials` 绑定接口，`provider_secure_store` 只保存 AES-GCM envelope，生产环境必须配置 `PROVIDER_REGISTRY_SECURE_STORE_KEY` 或同名 Cloudflare binding。
  - 腾讯云机器翻译样例 provider 新增 `/api/dashboard/provider-registry/providers/:id/check`，解析 `secure://providers/*` 后注入 `secretId/secretKey` 执行 TC3-HMAC-SHA256 `TextTranslate` 轻量检查；返回 latency/requestId/error，不回写 provider status，不泄露凭证。
  - 新增 Scene Orchestrator 最小执行合同与 `/api/dashboard/provider-registry/scenes/:id/run`：支持 dry-run、priority 候选选择、fallback enabled/disabled 执行、trace、fallbackTrail、usage 与标准错误返回。
  - 新增普通登录态 `/api/v1/scenes/:id/run` runtime API，复用 Scene Orchestrator 但不要求 Dashboard Admin 权限，供 CoreApp 使用 app token 调用 Scene。
  - 腾讯云机器翻译 adapter 已覆盖 `text.translate` 与基于官方 `ImageTranslateLLM` 的 `image.translate` / `image.translate.e2e`，将标准 payload 转为 TC3 签名请求并标准化 output、usage、providerRequestId 与 latency。
  - CoreApp 新增 Nexus Scene client，OmniPanel 内置划词翻译优先调用 `corebox.selection.translate` 的 `text.translate` Scene；成功时将译文写入剪贴板，未登录、Scene 不可用或执行失败时继续降级到原有浏览器翻译入口。
  - Dashboard Provider Registry 创建表单支持一次性写入腾讯云 `SecretId/SecretKey` 并立即清空输入；provider 卡片新增 Check 操作和最近一次检查结果；scene 卡片可输入 JSON、指定 capability/provider 并查看 trace/output/selection/fallbackTrail。当前仍不包含 CoreBox 截图翻译消费链路、composed pipeline、Metering ledger、Health check 或汇率/AI provider 迁移。

### fix(core-app): clarify clipboard auto-paste and permission prompts

- `apps/core-app/src/main/modules/clipboard.ts`
- `apps/core-app/src/main/modules/system/permission-checker.ts`
- `apps/core-app/src/renderer/src/views/base/{settings/SettingSetup.vue,begin/internal/SetupPermissions.vue}`
  - Clipboard 自动粘贴失败改由主进程统一发送 system notification，并使用稳定 `clipboard-auto-paste-failed:*` ID/dedupeKey 避免重复通知。
  - macOS `System Events` 自动化权限失败文案从辅助功能中拆出，明确提示前往“系统设置 -> 隐私与安全性 -> 自动化”允许 Tuff 控制 System Events。
  - macOS 通知权限检查不再把不可读取状态显示为“未检查”，改为 `unverifiable` 并在设置页提示需到系统设置确认。
  - CoreBox clipboard apply 渲染侧开始识别 `{ success:false }` 返回值，避免 transport 正常返回失败结果时仍被当成成功。

### fix(nexus): alias next-auth core for nitro builds

- `apps/nexus/nuxt.config.ts`
  - 为 Nitro 与 Vite resolve 增加 `next-auth/core` 到本地包入口的 alias，避免 Cloudflare / node-server 构建解析到不兼容入口。

### fix(core-app): constrain DivisionBox detach to active features

- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useDetach.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useKeyboard.ts`
- `apps/core-app/src/renderer/src/views/box/{ActivatedProviders.vue,DivisionBoxHeader.vue}`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN.json,en-US.json}`
  - CoreBox `Command/Ctrl+D` 不再对普通搜索结果创建 detached item，只有进入插件 feature 或已附加插件 UI view 后才允许分离窗口。
  - DivisionBox header 的 active provider pill 关闭入口改为不可见，避免在分离窗口内误退出当前插件上下文。
  - DivisionBox 分离成功后若 provider 状态清理失败，仅记录 warning，不再把已创建窗口误报为“分离失败”。
  - DivisionBox 顶栏控制按钮改为固定点击区并通过 `TuffIcon size` 显式控制图标尺寸。
  - Widget feature 分离恢复 `detachedPayload` 状态传递，独立窗口继续走 CoreBox widget renderer；DivisionBox icon contract 放宽为 `string | ITuffIcon`，避免 file/url 插件图标在分离后丢失。

### docs(nexus): define provider aggregation and scene orchestration plan

- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - 新增 Nexus Provider 聚合与 Scene 编排重构权威 PRD，统一 `Provider / Capability / Scene / Strategy / Metering` 模型。
  - 明确 `exchangeRateService` 后续迁移为 `fx.rate.latest/fx.convert` capability，Nexus dashboard AI providers 迁移为通用 Provider registry 的 `ai.*` / `chat.*` 能力域。
  - 将文本翻译、图片翻译、截图翻译纳入同一 Provider registry，不再为每个场景新增孤立供应商配置。
  - 明确 Nexus 当前没有截图翻译/图片翻译/腾讯云机器翻译的现成配置页；腾讯云机器翻译是新增 Provider 配置面的首个候选样例，同一 Provider 暴露 `text.translate`、`image.translate`、`image.translate.e2e` 等 capability，计量规则进入 Metering 而非 Scene 私有逻辑。
  - 补齐范围/非目标、业务目标/工程目标、迁移映射、兼容边界、建议数据表、错误码基线、风险待决项与验收清单。
  - 同步 README、INDEX、TODO、路线图与质量基线入口；Phase 1 文档化任务已标记完成，后续实现仍需补最近路径 typecheck/test/docs guard 证据。

### feat(core-app/nexus): collect provider-level search performance telemetry

- `apps/core-app/src/main/modules/box-tool/search-engine/*`
- `apps/nexus/server/utils/telemetryStore.ts`
- `apps/nexus/app/pages/dashboard/admin/analytics.vue`
  - CoreBox 搜索 telemetry 改为在最终 `session.end` 聚合上报一次，补齐 `firstResultMs/firstResultCount`、provider timing/result/status、error/timeout 计数与匿名 query length 场景字段；继续禁止上传搜索明文。
  - `search-gather` 纯 fast provider 完成路径也会记录 provider timing，避免本地 analytics 对 fast-only 搜索漏采。
  - Nexus telemetry 聚合新增 first-result、慢查询、provider error/timeout/slow 与 provider P95 近似查询；Admin Analytics 的 Search 页新增 Provider Performance 表，展示 calls/avg/P95/max/results/errors/timeouts/slow rate。
  - 新增 CoreApp search telemetry 与 Nexus provider 聚合定向测试；当前环境缺少已安装依赖，`vitest` 命令因 `Command "vitest" not found` 未能执行。

## 2026-05-08

### fix(core-app): stabilize packaged widget compile pipeline

- `apps/core-app/src/main/modules/plugin/widget/widget-transform.ts`
- `apps/core-app/src/main/modules/plugin/widget/{widget-manager.ts,processors/*}`
- `apps/core-app/scripts/build-target/{runtime-modules.js,build-target.js}`
- `apps/core-app/src/renderer/src/{modules/plugin/widget-registry.ts,components/render/{CoreBoxRender,WidgetFrame}.vue}`
- `packages/utils/{plugin/widget.ts,transport/events/index.ts}`
  - Widget processor 统一改走懒加载 transform helper，生产包优先解析 `resources/node_modules/@esbuild/*` 与 `app.asar.unpacked` 中的真实二进制，`spawn ENOTDIR/ENOENT/EACCES` 归类为 `WIDGET_COMPILER_BINARY_UNAVAILABLE`。
  - Runtime module manifest 将 `esbuild` 提升为 resources 运行时依赖，并显式声明 macOS/Linux/Windows x64/arm64 的 `@esbuild/*` 平台包；打包后校验缺失或不可执行二进制时 fail-fast。
  - `WidgetManager` 保持已编译缓存优先，新增 `widgetId + hash` 短期失败缓存、结构化 issue meta 与 `plugin:widget:failed` payload，避免同一源码重复 transform 和刷屏日志。
  - CoreBox custom renderer 未注册时仍进入 `WidgetFrame`，renderer 可见展示加载中、未注册、编译失败与渲染失败状态，不再只落到 debug `<pre>` 或空白。

### fix(core-app): restore plugin issue dialog scrolling

- `apps/core-app/src/renderer/src/components/plugin/PluginInfo.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginIssues.vue`
  - 插件问题弹层改为使用 `FlipDialog` body 的内建滚动边界，避免内容超过弹层高度时被外层 `overflow: hidden` 截断。
  - `PluginIssues` 移除内嵌 `TouchScroll` 百分比高度依赖，问题列表随弹层内容自然撑开并由父级滚动。

### fix(core-app): hard-cut renderer storage bootstrap warnings

- `apps/core-app/src/renderer/src/main.ts`
- `packages/utils/renderer/hooks/use-channel.ts`
- `apps/core-app/src/main/modules/storage/index.ts`
- `apps/core-app/src/renderer/src/modules/storage/*`
  - Renderer startup now initializes storage through typed `initializeRendererStorage(transport)` only, so startup no longer passes the retired TouchChannel storage path or triggers legacy storage subscription warnings.
  - `useChannel()` now checks Vue injection context before calling `inject()`, keeping non-setup bootstrap/global-channel resolution free of Vue inject warnings.
  - `account.ini` is represented by `StorageList.ACCOUNT`; main storage warms it during startup and renderer account hydration no longer writes the same snapshot back immediately.
  - Added targeted regressions for renderer storage bootstrap boundaries, account hydration persistence control, channel resolution outside Vue setup, and main-side account cache warmup.

### fix(core-app): normalize local assets before rendering search results

- `apps/core-app/src/main/utils/local-renderable-assets.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/*`
- `apps/core-app/src/main/modules/clipboard.ts`
  - CoreBox 搜索结果新增 main-side 本地资源规范化管线，`file://` / `tfile://` / 绝对路径统一校验后转为规范 `tfile://`。
  - 文件搜索主路径失效时不再返回该结果，并异步清理 stale index；失效 thumbnail/icon 降级为 class fallback 并触发缓存清理与重生成。
  - Recommendation rebuild 与剪贴板图片输出不再暴露失效本地 image URL，避免历史路径继续触发 `tfile://... 404`。

### feat(core-app): expose Windows shell folders in CoreBox file search

- `apps/core-app/src/main/modules/box-tool/addon/system/windows-shell-file-provider.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
  - Windows CoreBox 文件搜索新增 Shell namespace 入口命中，覆盖此电脑、回收站、网络、控制面板、用户文件夹及常用库目录。
  - 入口按关键词/别名命中并参与 `@file` 搜索，不进入空查询默认结果，也不依赖 Everything 或写入文件索引。
  - 执行路径统一通过 `explorer.exe shell:*` 打开，避免把 Shell 虚拟入口当普通文件路径处理。

### fix(core-app): restore store and plugin navigation icons

- `apps/core-app/src/renderer/src/components/base/TuffIcon.vue`
- `apps/core-app/src/renderer/src/components/base/tuff-icon-rendering.ts`
- `apps/core-app/src/renderer/src/components/store/StoreIcon.vue`
- `apps/core-app/src/renderer/src/modules/store/providers/store-icon-normalizer.ts`
- `apps/core-app/src/renderer/src/modules/store/providers/*`
  - `TuffIcon` now reads SVG content for addressable SVG icons and renders monochrome/default-black SVGs through the theme-color mask path while preserving explicitly colorful SVGs as direct images.
  - Store providers now normalize icon values consistently, including URL paths, Iconify aliases, and manifest-style `{ type, value }` objects, without coercing arbitrary strings such as `json` into invalid `i-*` classes.
  - Added targeted regression coverage for SVG theme-mask detection and store icon normalization.

### fix(core-app): reserve macOS titlebar space for layout logo

- `apps/core-app/src/renderer/src/views/layout/shared/LayoutShell.vue`
- `apps/core-app/src/renderer/src/views/layout/*Layout.vue`
  - Layout containers now receive explicit renderer macOS state and add an `is-mac` class instead of relying on the async `body.darwin` preload class.
  - All `LayoutShell`-based main layout headers now reserve a macOS titlebar safe width before the app logo area.
  - Header background and side divider keep their original layout width while the logo/title content is inset inside that region.
  - This keeps the app logo and title away from native traffic-light controls without changing Windows/Linux layout spacing.

### fix(core-app): avoid readonly proxy writes in widget render patch

- `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts`
  - Widget render setup-state patching now copies enumerable render context fields through property definitions instead of `Object.assign`.
  - This avoids writing through Vue readonly public-instance proxies for props such as `item`, fixing `set on proxy: trap returned falsish for property 'item'` in widget renders.

### fix(core-app): restore CoreBox renderer visibility

- `apps/core-app/src/renderer/src/main.ts`
- `apps/core-app/src/renderer/src/AppEntrance.vue`
  - Renderer now initializes the legacy `TouchChannel` bridge before transport-dependent side-effect modules bind listeners.
  - CoreBox and DivisionBox entries now synchronously maintain `body.core-box` / `body.division-box`, so CSS no longer hides the CoreBox shell when the early `ui.trigger` event is missed.

### fix(core-app): localize workflow editor and tighten compat debt tracking

- `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceWorkflowPage.vue`
- `apps/core-app/src/renderer/src/modules/hooks/useWorkflowEditor.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `apps/core-app/docs/compatibility-legacy-scan-summary.md`
- `docs/plan-prd/TODO.md`
  - Intelligence Workflow 页面、toast、按钮、校验错误、默认 trigger/context label 统一迁移到 renderer i18n 资源；Workflow list/save/delete/run/resume/approve 仍走 `useIntelligenceSdk` / `useAgentsSdk`。
  - FileProvider 移除两处 `[DEBUG]` 日志前缀和 DEBUG 注释，保留 `logDebug` 诊断语义且不改变索引调度。
  - CoreApp 3 个 migration exception 保留为 read-once / marker-gated 迁移路径，registry 补齐退场条件与回归证据要求。
  - CoreApp 13 个 size-growth exception 改为后续小任务口径，优先拆分候选锁定 `clipboard.ts`、`search-core.ts`、`plugin-module.ts`。

### fix(core-app): harden Sentry storage and search index regressions

- `packages/utils/renderer/storage/base-storage.ts`
- `packages/utils/__tests__/renderer-storage-transport.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-runtime-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/workers/search-index-worker.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/workers/search-index-worker-client.ts`
  - `TUFF-1P`: renderer storage save now normalizes malformed transport responses and treats `undefined/null/non-StorageSaveResult` as failed saves without reading `result.success`.
  - `TUFF-16`: file-provider search index writes now share one worker readiness gate; init failures are logged and write batches are rolled back/retried instead of throwing unhandled `SearchIndexWorkerClient not initialized`.
  - `TUFF-1D`: `SearchIndexService` now receives runtime logging via explicit injection; the worker path uses a noop logger and no longer implicitly loads `search-logger`/storage-related main-process dependencies.
  - Added targeted regression coverage for storage malformed save results, worker readiness gating, init retry behavior, and search-index runtime logger injection.

### fix(core-app): gate clipboard autopaste by captured freshness

- `apps/core-app/src/main/modules/clipboard.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useClipboard.ts`
- `packages/utils/transport/events/types/clipboard.ts`
  - Clipboard transport now carries optional `captureSource / observedAt / freshnessBaseAt / autoPasteEligible` freshness fields.
  - CoreBox show-triggered clipboard scans are treated as `corebox-show-baseline`, so old clipboard content can update history/tags without being auto-filled.
  - Renderer AutoPaste no longer uses history `createdAt/timestamp` as copy freshness; it requires main-process eligibility and uses `freshnessBaseAt ?? observedAt` for TTL.

### fix(core-app): add local encrypted fallback for secure store

- `apps/core-app/src/main/utils/secure-store.ts`
- `apps/core-app/src/main/modules/auth/index.ts`
- `apps/core-app/src/main/modules/sync/sync-payload-crypto.ts`
- `apps/core-app/src/main/channel/common.ts`
- `apps/core-app/src/main/modules/ai/intelligence-mcp-registry.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUser.vue`
- `packages/utils/common/storage/entity/app-settings.ts`
- `packages/utils/transport/events/app.ts`
- `packages/utils/transport/events/types/app.ts`
- `packages/utils/transport/sdk/domains/app.ts`
  - Secure store no longer calls Electron `safeStorage` / system Keychain. It now always uses a per-runtime `config/local-secret.v1.key` local root secret with AES-256-GCM envelopes, avoiding startup-time system credential prompts.
  - Auth token, sync payload key, and machine seed storage continue to pass explicit purposes (`auth-token`, `sync-payload-key`, `machine-seed`) and stay encrypted at rest by the local root secret.
  - Credential persistence now defaults to enabled; old default-disabled settings migrate to persistent protection unless the user has explicitly overridden the setting.
  - Sync payload encryption continues to emit only `payload_enc` / `payload_ref`; legacy `b64:` payloads remain read-only migration input and encrypted key registration now records the local-secret wrapping backend.
  - Settings/transport diagnostics expose secure-store health (`local-secret` or `unavailable`) and no longer report or initialize a system credential-store backend.

### fix(core-app): restore opt-in secure storage and plugin icons

- `packages/utils/common/storage/entity/app-settings.ts`
- `apps/core-app/src/main/modules/auth/index.ts`
- `apps/core-app/src/renderer/src/modules/auth/useAuth.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUser.vue`
- `apps/core-app/src/main/core/tuff-icon.ts`
- `apps/core-app/src/renderer/src/components/base/TuffIcon.vue`
- `packages/utils/env/index.ts`
- `packages/utils/plugin/channel.ts`
- `packages/utils/transport/prelude.ts`
- `apps/core-app/src/renderer/src/modules/channel/channel-core.ts`
- `packages/utils/__tests__/renderer-storage-transport.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-runtime-service.ts`
  - Superseded by the 2026-05-09 secure-store backend split: credential persistence now defaults to enabled and `safeStorage` unavailability falls back to local encrypted storage instead of session-only mode.
  - Plugin `file` icons now resolve from plugin root first, then `src/...` and `public/<filename>` for source-layout plugins; dev-server URLs are only used after local candidates miss.
  - CoreApp icon rendering now preserves SVG color with direct `<img>` when `colorful=true`, and SVG text fetch failure no longer forces an error state when a direct local `tfile` render is available.
  - Electron sandbox renderer detection now recognizes preload-exposed `window.electron.ipcRenderer`, allowing local SVG reads through the network SDK in sandboxed renderer contexts.
  - Legacy plugin/renderer channel replies now use `ipcRenderer.send(...)` instead of `e.sender.send(...)`, fixing sandbox `e.sender.send is not a function` regressions.
  - Cleared current `typecheck:node` blockers from renderer storage transport test typing and the Windows file-provider index runtime service dependency surface.
  - Verified targeted regression: `auth/index.test.ts`, `tuff-icon.test.ts`, `plugin-channel-send-sync-hard-cut.test.ts`, `env-electron-renderer.test.ts`, and `renderer-storage-transport.test.ts`.

### fix(core-app): remove installed plugin detail edge blur

- `apps/core-app/src/renderer/src/components/tuff/template/TuffAsideTemplate.vue`
- `apps/core-app/src/renderer/src/views/base/Plugin.vue`
  - `TuffAsideTemplate` now exposes `mainEdgeBlur` to control the main content top/bottom `TxGradualBlur` overlays.
  - Installed plugin page disables the overlays so plugin detail content is no longer blurred at the top and bottom edges.
  - Installed plugin detail now avoids nested `TouchScroll`, leaving tab content scrolling to the inner tabs container.

### fix(core-app): prevent packaged renderer blank screen

- `apps/core-app/electron.vite.config.ts`
- `apps/core-app/src/renderer/src/views/layout/flat/FlatLayout.vue`
- `apps/core-app/src/shared/update/platform-target.ts`
- `packages/utils/common/file-scan-constants.ts`
  - Packaged preload now bundles `@electron-toolkit/preload`, avoiding sandbox preload resolution failures after macOS snapshot packaging.
  - Renderer/shared runtime platform detection no longer reads bare `process.platform` / `process.arch` at module evaluation time.
  - Verified `2.4.10-beta.15` macOS snapshot packaging and packaged app startup; `#app` mounts successfully and the previous preload/module-not-found/process-is-not-defined errors are gone.

### docs(governance): sync 2.4.10 current line and 2.4.11 blockers

- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `scripts/check-doc-governance.mjs`
  - 当前主线统一为 `2.4.10 Windows App 索引 + 基础 legacy/compat 收口`。
  - 剩余未闭环项集中进入 `2.4.11` 必须解决的问题：Windows/macOS 阻塞级回归、Linux documented best-effort、Release Evidence 写入闭环、legacy/compat/size 清册退场、CoreApp 验证、搜索性能与启动搜索压测。
  - 六主文档日期同步到 `2026-05-08`，`docs:guard` 的 next-action 关键字同步为当前主线。
  - 删除候选本轮不物理删除，仅在入口文档继续标注 `next-edit` 草稿池与 `05-archive` 历史归档的降权状态。

### chore(governance): move cleanup target to 2.4.11

- `scripts/legacy-boundary-allowlist.json`
- `scripts/large-file-boundary-allowlist.json`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `scripts/check-legacy-boundaries.mjs`
- `scripts/check-large-file-boundaries.mjs`
- `scripts/check-compatibility-debt-registry.mjs`
  - `currentVersion` 同步到 `2.4.10-beta.14`。
  - legacy boundary、large-file boundary 与 compatibility registry 的默认退场目标统一改为 `2.4.11`。
  - `2.4.11` 前仍需关闭或显式降权所有未退场的 legacy/compat/size 清册项。

## 2026-05-07

### fix(core-app): improve Windows app discovery sources

- `apps/core-app/src/main/modules/box-tool/addon/apps/app-scanner.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/win.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/win.test.ts`
  - Windows app scanning now focuses watch paths on Start Menu directories and `LOCALAPPDATA\\Programs` instead of broad Program Files roots.
  - Re-enabled Windows file system watch registration while filtering real-time changes to `.lnk` and `.exe` entries.
  - Added registry uninstall-entry discovery as a fallback source, resolving candidate executable paths from `DisplayIcon` or install locations and deduping registry entries behind Start Menu results.
  - Added regression coverage for Windows real-time Start Menu event handling, registry `DisplayIcon` parsing, `InstallLocation` executable fallback, noisy registry filtering, and Start Menu-over-registry dedupe priority.
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/apps/win.test.ts" "src/main/modules/box-tool/addon/apps/app-provider.test.ts"` 通过。

### chore(governance): sync large-file guard for beta.14 release

- `scripts/large-file-boundary-allowlist.json`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
  - Synced large-file boundary metadata to current `2.4.10-beta.14` release gate.
  - Raised existing governance exception caps to current measured line counts for:
    - `SIZE-GROWTH-2026-04-26-CORE-APP-APP-PROVIDER-TEST`: `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.test.ts` cap `1517`
    - `SIZE-GROWTH-2026-04-26-CORE-APP-APP-PROVIDER`: `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts` cap `3330`
    - `SIZE-GROWTH-2026-04-26-CORE-APP-OCR-SERVICE`: `apps/core-app/src/main/modules/ocr/ocr-service.ts` cap `1629`
    - `SIZE-GROWTH-2026-04-26-CORE-APP-SENTRY-SERVICE`: `apps/core-app/src/main/modules/sentry/sentry-service.ts` cap `1318`
    - `SIZE-GROWTH-2026-04-26-PACKAGES-TUFF-CLI-TUFF-CLI`: `packages/tuff-cli/src/bin/tuff.ts` cap `1318`
  - Added traceable temporary growth exceptions for:
    - `SIZE-GROWTH-2026-05-08-NEXUS-I18N-EN`: `apps/nexus/i18n/locales/en.ts` cap `2698`
    - `SIZE-GROWTH-2026-05-08-NEXUS-I18N-ZH`: `apps/nexus/i18n/locales/zh.ts` cap `2683`
    - `SIZE-GROWTH-2026-05-08-NEXUS-AUTH-STORE`: `apps/nexus/server/utils/authStore.ts` cap `2538`
    - `SIZE-GROWTH-2026-05-08-TUFFEX-FLIP-OVERLAY`: `packages/tuffex/packages/components/src/flip-overlay/src/TxFlipOverlay.vue` cap `1345`
    - `SIZE-GROWTH-2026-05-08-PLUGIN-TOUCH-TRANSLATION-INDEX`: `plugins/touch-translation/index.js` cap `1261`
    - `SIZE-GROWTH-2026-05-08-PLUGIN-TOUCH-TRANSLATION-PANEL`: `plugins/touch-translation/widgets/translate-panel.vue` cap `1535`
  - Follow-up remains unchanged: reduce or split these files below the 1200-line threshold before `2.4.11`.

### docs(nexus): hard-cut browser support wording from compatibility

- `packages/tuffex/docs/components/gradual-blur.md`
- `apps/nexus/content/docs/dev/components/gradual-blur.en.mdc`
- `apps/nexus/content/docs/dev/components/gradual-blur.zh.mdc`
- `apps/nexus/content/docs/dev/components/foundations.zh.mdc`
- `docs/plan-prd/TODO.md`
  - GradualBlur docs now describe `backdrop-filter` as a browser-support constraint instead of compatibility wording.
  - Foundations dark-mode selector docs now describe `[data-theme='dark']` and `.dark` as supported selectors, avoiding false compatibility-debt signals.

### test(tuffex): hard-cut Scroll TouchScroll alias

- `packages/tuffex/packages/components/src/index.ts`
- `packages/tuffex/packages/components/src/scroll/__tests__/scroll-export.test.ts`
- `packages/tuffex/docs/components/scroll.md`
- `apps/nexus/content/docs/dev/components/scroll.en.mdc`
- `apps/nexus/content/docs/dev/components/scroll.zh.mdc`
- `apps/nexus/app/components/content/demos/ScrollBasicDemo.vue`
- `apps/nexus/app/components/content/demos/ScrollScrollDemo.vue`
- `docs/plan-prd/TODO.md`
  - Tuffex top-level exports no longer expose the retired `TouchScroll` alias; `TxScroll` remains the single public component name.
  - Added an export boundary regression test and updated Nexus/Tuffex docs plus demos to use `TxScroll`.

### docs(tuffex): hard-cut Tabs autoHeight compatibility wording

- `packages/tuffex/docs/components/tabs.md`
- `apps/nexus/content/docs/dev/components/tabs.zh.mdc`
- `docs/plan-prd/TODO.md`
  - Tabs docs no longer describe `autoHeight*` as compatibility fields; they are documented as the current convenience props and default duration/easing source for `animation.size`.
  - Runtime API is unchanged because `autoHeight`, `autoWidth`, `autoHeightDurationMs`, and `autoHeightEasing` are still used by current Nexus demos and component tests.

### docs(nexus): hard-cut Modal TModal compatibility wording

- `apps/nexus/content/docs/dev/components/modal.en.mdc`
- `apps/nexus/content/docs/dev/components/modal.zh.mdc`
- `docs/plan-prd/TODO.md`
  - Nexus Modal docs now describe `TModal` as the current lightweight entry backed by `TxModal` instead of a compatibility entry.
  - The documented contract still matches the existing wrapper behavior: no `header/footer` slot means `TModal` does not override the default title or footer behavior.

### test(core-app): hard-cut inline workflow contract marker

- `apps/core-app/src/main/modules/ai/intelligence-deepagent-orchestration.ts`
- `apps/core-app/src/main/modules/ai/intelligence-deepagent-orchestration.test.ts`
- `docs/plan-prd/TODO.md`
  - `normalizeInlineWorkflowPayload()` now marks the current `workflow.execute` inline chain with `contract: 'workflow.execute.inline'` instead of a compatibility metadata field.
  - Added regression coverage for the normalized inline workflow description and metadata so the current contract does not drift back into compatibility-shell wording.

### test(tuffex): cover ChatComposer contract and clear Nexus placeholders

- `packages/tuffex/packages/components/src/chat/__tests__/chat-composer.test.ts`
- `apps/nexus/content/docs/dev/components/chat-composer.zh.mdc`
- `apps/nexus/content/docs/dev/components/chat-composer.en.mdc`
- `apps/nexus/content/docs/dev/components/card.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added ChatComposer regression coverage for v-model, trimmed send payloads, keyboard send modes, disabled/submitting guards, attachment-only send, attachment action guards, scoped slots, textarea native events, and install registration.
  - ChatComposer Nexus docs now include props/events/slots plus send, attachment, and keyboard interaction contracts.
  - Card English docs now replace migration placeholder wording with the real surface-container contract.

### docs(nexus): hard-cut AutoSizer and Slider English placeholders

- `apps/nexus/content/docs/dev/components/auto-sizer.en.mdc`
- `apps/nexus/content/docs/dev/components/slider.en.mdc`
- `docs/plan-prd/TODO.md`
  - AutoSizer English docs now replace migration placeholder wording with the real resize/FLIP contract, including outer/inner wrappers, inline sizing, `flip()`, `action()`, and utility option forwarding.
  - Slider English docs now replace migration placeholder wording with the real range input and elastic tooltip contract, including clamping, events, disabled behavior, formatter fallback, tooltip triggers, motion clamping, and listener cleanup.

### test(tuffex): cover components utils re-export contract

- `packages/tuffex/packages/components/src/utils/__tests__/utils.test.ts`
- `docs/plan-prd/TODO.md`
  - Added a re-export contract test for `packages/components/src/utils`, covering env helpers, z-index utilities, `withInstall`, and vibrate helpers.
  - The Tuffex component-source missing-test inventory now treats `utils` as covered even though the actual utility implementations live under `packages/tuffex/packages/utils`.

### test(tuffex): hard-cut Floating disabled runtime

- `packages/tuffex/packages/components/src/floating/src/TxFloating.vue`
- `packages/tuffex/packages/components/src/floating/__tests__/floating.test.ts`
- `apps/nexus/content/docs/dev/components/floating.zh.mdc`
- `apps/nexus/content/docs/dev/components/floating.en.mdc`
- `packages/tuffex/docs/components/floating.md`
- `packages/tuffex/docs/components/index.md`
- `docs/plan-prd/TODO.md`
  - `TxFloating disabled=true` now stops window pointer listeners and RAF, cancels the current animation frame, and resets registered elements; re-enabling restarts listeners and RAF.
  - Added Floating regression coverage for element registration, eased transforms, disabled stop/restart, initially disabled behavior, depth re-registration, unmount cleanup, className/slot rendering, and install registration.
  - Tuffex docs now include a Floating page/index entry; Nexus bilingual docs document the disabled/RAF/register contract.

### test(tuffex): hard-cut Grid docs to current API

- `packages/tuffex/packages/components/src/grid/__tests__/grid.test.ts`
- `apps/nexus/content/docs/dev/components/grid.zh.mdc`
- `apps/nexus/content/docs/dev/components/grid.en.mdc`
- `packages/tuffex/docs/components/grid.md`
- `docs/plan-prd/TODO.md`
  - Added Grid regression coverage for fixed columns/rows/gaps/alignment, `minItemWidth` precedence, responsive breakpoint resolution, resize listener cleanup, GridItem span clamping, and install registration.
  - Nexus/Tuffex Grid docs now match the current implementation and no longer list unimplemented `autoRows`, `dense`, `colStart`, `colEnd`, `rowStart`, `rowEnd`, or `xxl` APIs.

### test(tuffex): cover stroke animation component contracts

- `packages/tuffex/packages/components/src/keyframe-stroke-text/src/TxKeyframeStrokeText.vue`
- `packages/tuffex/packages/components/src/keyframe-stroke-text/__tests__/keyframe-stroke-text.test.ts`
- `packages/tuffex/packages/components/src/tuff-logo-stroke/__tests__/tuff-logo-stroke.test.ts`
- `apps/nexus/content/docs/dev/components/keyframe-stroke-text.zh.mdc`
- `apps/nexus/content/docs/dev/components/keyframe-stroke-text.en.mdc`
- `apps/nexus/content/docs/dev/components/tuff-logo-stroke.zh.mdc`
- `apps/nexus/content/docs/dev/components/tuff-logo-stroke.en.mdc`
- `packages/tuffex/docs/components/keyframe-stroke-text.md`
- `packages/tuffex/docs/components/tuff-logo-stroke.md`
- `docs/plan-prd/TODO.md`
  - KeyframeStrokeText now syncs SVG metrics once after mount even when the Font Loading API is unavailable, avoiding a stale default viewBox in those environments.
  - Added KeyframeStrokeText coverage for SVG accessibility, CSS variables, empty-text fallback, metric refresh, and install registration.
  - Added TuffLogoStroke coverage for mode classes, `loop -> breathe`, size/duration variables, palette forwarding, instance-scoped gradient/filter ids, and install registration; Nexus/Tuffex docs now document both animation contracts.

### test(tuffex): hard-cut deterministic skeleton contracts

- `packages/tuffex/packages/components/src/layout-skeleton/src/TxLayoutSkeleton.vue`
- `packages/tuffex/packages/components/src/layout-skeleton/__tests__/layout-skeleton.test.ts`
- `packages/tuffex/packages/components/src/skeleton/__tests__/skeleton.test.ts`
- `apps/nexus/content/docs/dev/components/skeleton.zh.mdc`
- `apps/nexus/content/docs/dev/components/skeleton.en.mdc`
- `apps/nexus/content/docs/dev/components/layout-skeleton.zh.mdc`
- `apps/nexus/content/docs/dev/components/layout-skeleton.en.mdc`
- `packages/tuffex/docs/components/skeleton.md`
- `packages/tuffex/docs/components/layout-skeleton.md`
- `docs/plan-prd/TODO.md`
  - LayoutSkeleton content widths now use a fixed sequence instead of runtime `Math.random()`, making SSR/hydration and tests deterministic.
  - Added Skeleton regression coverage for loading slot fallback, line count clamp, CSS variables, circle radius, preset structures, and install registration.
  - Added LayoutSkeleton coverage for fixed scaffold structure, deterministic content widths, and install registration; Nexus/Tuffex docs now document the actual skeleton contracts.

### test(tuffex): cover OfflineState and PermissionState wrapper contracts

- `packages/tuffex/packages/components/src/offline-state/__tests__/offline-state.test.ts`
- `packages/tuffex/packages/components/src/permission-state/__tests__/permission-state.test.ts`
- `apps/nexus/content/docs/dev/components/offline-state.zh.mdc`
- `apps/nexus/content/docs/dev/components/offline-state.en.mdc`
- `apps/nexus/content/docs/dev/components/permission-state.zh.mdc`
- `apps/nexus/content/docs/dev/components/permission-state.en.mdc`
- `packages/tuffex/docs/components/offline-state.md`
- `packages/tuffex/docs/components/permission-state.md`
- `docs/plan-prd/TODO.md`
  - Added OfflineState and PermissionState regression coverage for forwarding fixed variants, props/actions, named slots, and install registration.
  - Nexus English docs now replace placeholder wording with the real offline/network and permission/access state contracts.
  - Nexus bilingual docs and Tuffex docs now document both wrapper behaviors.

### test(tuffex): cover SearchEmpty wrapper contract

- `packages/tuffex/packages/components/src/search-empty/__tests__/search-empty.test.ts`
- `apps/nexus/content/docs/dev/components/search-empty.zh.mdc`
- `apps/nexus/content/docs/dev/components/search-empty.en.mdc`
- `packages/tuffex/docs/components/search-empty.md`
- `docs/plan-prd/TODO.md`
  - Added SearchEmpty regression coverage for forwarding `variant="search-empty"`, props/actions, named slots, and install registration.
  - Nexus English docs now replace placeholder wording with the real empty search result contract; Nexus bilingual docs and Tuffex docs now document the wrapper behavior.

### test(tuffex): cover NoSelection wrapper contract

- `packages/tuffex/packages/components/src/no-selection/__tests__/no-selection.test.ts`
- `apps/nexus/content/docs/dev/components/no-selection.zh.mdc`
- `apps/nexus/content/docs/dev/components/no-selection.en.mdc`
- `packages/tuffex/docs/components/no-selection.md`
- `docs/plan-prd/TODO.md`
  - Added NoSelection regression coverage for forwarding `variant="no-selection"`, props/actions, named slots, and install registration.
  - Nexus English docs now replace placeholder wording with the real unselected detail-panel contract; Nexus bilingual docs and Tuffex docs now document the wrapper behavior.

### test(tuffex): cover NoData wrapper contract

- `packages/tuffex/packages/components/src/no-data/__tests__/no-data.test.ts`
- `apps/nexus/content/docs/dev/components/no-data.zh.mdc`
- `apps/nexus/content/docs/dev/components/no-data.en.mdc`
- `packages/tuffex/docs/components/no-data.md`
- `docs/plan-prd/TODO.md`
  - Added NoData regression coverage for forwarding `variant="no-data"`, props/actions, named slots, and install registration.
  - Nexus English docs now replace placeholder wording with the real empty dataset contract; Nexus bilingual docs and Tuffex docs now document the wrapper behavior.

### test(tuffex): cover LoadingState wrapper contract

- `packages/tuffex/packages/components/src/loading-state/__tests__/loading-state.test.ts`
- `apps/nexus/content/docs/dev/components/loading-state.zh.mdc`
- `apps/nexus/content/docs/dev/components/loading-state.en.mdc`
- `packages/tuffex/docs/components/loading-state.md`
- `docs/plan-prd/TODO.md`
  - Added LoadingState regression coverage for forwarding `variant="loading"`, explicit loading/description/action props, named slots, and install registration.
  - Nexus English docs now replace placeholder wording with the real loading placeholder contract; Nexus bilingual docs and Tuffex docs now document the wrapper behavior.

### test(tuffex): cover GuideState wrapper contract

- `packages/tuffex/packages/components/src/guide-state/__tests__/guide-state.test.ts`
- `apps/nexus/content/docs/dev/components/guide-state.zh.mdc`
- `apps/nexus/content/docs/dev/components/guide-state.en.mdc`
- `packages/tuffex/docs/components/guide-state.md`
- `packages/tuffex/docs/components/index.md`
- `packages/tuffex/docs/components/empty-state.md`
- `docs/plan-prd/TODO.md`
  - Added GuideState regression coverage for forwarding `variant="guide"`, props/actions, named slots, and install registration.
  - Tuffex docs now include a GuideState page/index entry and the EmptyState preset list includes `TxGuideState`.
  - Nexus bilingual docs now document the wrapper contract.

### test(tuffex): cover ErrorState wrapper contract

- `packages/tuffex/packages/components/src/error-state/__tests__/error-state.test.ts`
- `apps/nexus/content/docs/dev/components/error-state.zh.mdc`
- `apps/nexus/content/docs/dev/components/error-state.en.mdc`
- `packages/tuffex/docs/components/error-state.md`
- `packages/tuffex/docs/components/index.md`
- `packages/tuffex/docs/components/empty-state.md`
- `docs/plan-prd/TODO.md`
  - Added ErrorState regression coverage for forwarding `variant="error"`, props/actions, named slots, and install registration.
  - Tuffex docs now include an ErrorState page/index entry and the EmptyState preset list includes `TxErrorState`.
  - Nexus bilingual docs now document the wrapper contract.

### test(tuffex): cover BlankSlate wrapper contract

- `packages/tuffex/packages/components/src/blank-slate/__tests__/blank-slate.test.ts`
- `apps/nexus/content/docs/dev/components/blank-slate.zh.mdc`
- `apps/nexus/content/docs/dev/components/blank-slate.en.mdc`
- `packages/tuffex/docs/components/blank-slate.md`
- `docs/plan-prd/TODO.md`
  - Added BlankSlate regression coverage for forwarding `variant="blank-slate"`, onboarding defaults, explicit layout overrides, named slot forwarding, and install registration.
  - Nexus English docs now replace placeholder wording with the real first-use empty-state contract; Nexus bilingual docs and Tuffex docs now document the wrapper behavior.

### test(tuffex): harden FlatInput prefix and focus contract

- `packages/tuffex/packages/components/src/flat-input/src/FlatInput.vue`
- `packages/tuffex/packages/components/src/flat-input/__tests__/flat-input.test.ts`
- `apps/nexus/content/docs/dev/components/flat-input.zh.mdc`
- `apps/nexus/content/docs/dev/components/flat-input.en.mdc`
- `packages/tuffex/docs/components/flat-input.md`
- `packages/tuffex/docs/components/index.md`
- `docs/plan-prd/TODO.md`
  - FlatInput `modelValue` now has a real empty-string default, `icon` renders without requiring a prefix slot, and the wrapper no longer adds an extra tab stop.
  - Added FlatInput regression coverage for default value and placeholder, v-model updates, icon/slot precedence, textarea mode, nonWin class behavior, password Caps Lock hinting, and install registration.
  - Nexus bilingual docs and Tuffex docs now document the modelValue/icon/slot/focus/password/area/nonWin interaction contract.

### test(tuffex): hard-cut FlatButton to native button semantics

- `packages/tuffex/packages/components/src/flat-button/src/TxFlatButton.vue`
- `packages/tuffex/packages/components/src/flat-button/__tests__/flat-button.test.ts`
- `apps/nexus/content/docs/dev/components/flat-button.zh.mdc`
- `apps/nexus/content/docs/dev/components/flat-button.en.mdc`
- `packages/tuffex/docs/components/flat-button.md`
- `packages/tuffex/docs/components/index.md`
- `docs/plan-prd/TODO.md`
  - TuffFlatButton now renders a native `<button type="button">` instead of a `div role="button"`, removing the custom keyboard activation path and relying on native button semantics.
  - Added FlatButton regression coverage for default/primary/mini/loading/disabled states, click blocking, default non-submit behavior, and install registration.
  - Nexus bilingual docs and Tuffex docs now document the native button, loading/disabled, primary, and mini interaction contract.

### test(tuffex): cover EdgeFadeMask scroll fade contract

- `packages/tuffex/packages/components/src/edge-fade-mask/__tests__/edge-fade-mask.test.ts`
- `apps/nexus/content/docs/dev/components/edge-fade-mask.zh.mdc`
- `apps/nexus/content/docs/dev/components/edge-fade-mask.en.mdc`
- `packages/tuffex/docs/components/edge-fade-mask.md`
- `docs/plan-prd/TODO.md`
  - Added EdgeFadeMask regression coverage for root tag and axis classes, non-scrollable mask suppression, vertical/horizontal fade stops, disabled blocking, size unit handling, and ResizeObserver lifecycle.
  - Nexus bilingual docs and Tuffex docs now document the interaction contract for threshold, disabled state, scroll axis, size units, and `observeResize`.

### test(tuffex): hard-cut BaseSurface fallback opacity contract

- `packages/tuffex/packages/components/src/base-surface/src/TxBaseSurface.vue`
- `packages/tuffex/packages/components/src/base-surface/__tests__/base-surface.test.ts`
- `apps/nexus/content/docs/dev/components/base-surface.zh.mdc`
- `apps/nexus/content/docs/dev/components/base-surface.en.mdc`
- `packages/tuffex/docs/components/base-surface.md`
- `packages/tuffex/docs/components/index.md`
- `docs/plan-prd/TODO.md`
  - BaseSurface `fallbackMaskOpacity` now implements the documented behavior and overrides mask opacity when blur/glass surfaces degrade to `fallbackMode='mask'` during motion.
  - Added BaseSurface regression coverage for root tag/slot/CSS variables, mask opacity clamp, blur/glass motion fallback, pure fallback, GlassSurface prop forwarding, refraction classes/variables, and autoDetect cleanup.
  - Nexus bilingual docs now include the BaseSurface interaction contract; Tuffex docs now include a BaseSurface component page and index entry.

### test(tuffex): hard-cut BaseAnchor surface motion contract

- `packages/tuffex/packages/components/src/base-anchor/src/TxBaseAnchor.vue`
- `packages/tuffex/packages/components/src/base-anchor/__tests__/base-anchor.test.ts`
- `apps/nexus/content/docs/dev/components/base-anchor.zh.mdc`
- `apps/nexus/content/docs/dev/components/base-anchor.en.mdc`
- `packages/tuffex/docs/components/base-anchor.md`
- `packages/tuffex/docs/components/index.md`
- `docs/plan-prd/TODO.md`
  - BaseAnchor `surfaceMotionAdaptation` now implements the documented hard-cut strategy: `auto` follows internal anchor motion, `manual` reads `panelCard.surfaceMoving`, and `off` forces `surfaceMoving=false`.
  - Added BaseAnchor regression coverage for uncontrolled reference-click toggling, disabled open/close behavior, controlled outside/Escape closing, close switches, floating attrs/reference classes, and surface motion modes.
  - Nexus bilingual docs now include the BaseAnchor interaction contract; Tuffex docs now include a BaseAnchor component page and index entry.

### test(tuffex): cover ImageGallery modal preview contract

- `packages/tuffex/packages/components/src/image-gallery/src/TxImageGallery.vue`
- `packages/tuffex/packages/components/src/image-gallery/__tests__/image-gallery.test.ts`
- `apps/nexus/content/docs/dev/components/image-gallery.zh.mdc`
- `apps/nexus/content/docs/dev/components/image-gallery.en.mdc`
- `packages/tuffex/docs/components/image-gallery.md`
- `docs/plan-prd/TODO.md`
  - ImageGallery thumbnail and Prev/Next controls now expose readable ARIA labels.
  - Empty image lists no longer open the modal or emit `open`; `startIndex` and list-length changes are clamped to a valid preview index, and clearing the list closes the preview.
  - Added regression coverage for thumbnail alt/labels, open payload, modal title/viewer/count, boundary navigation, empty lists, and shrinking item lists; docs now describe the actual modal contract and remove unimplemented keyboard/swipe claims.

### feat(tuffex): tighten DataTable sortable header accessibility

- `packages/tuffex/packages/components/src/data-table/src/TxDataTable.vue`
- `packages/tuffex/packages/components/src/data-table/__tests__/data-table.test.ts`
- `apps/nexus/content/docs/dev/components/data-table.zh.mdc`
- `apps/nexus/content/docs/dev/components/data-table.en.mdc`
- `packages/tuffex/docs/components/data-table.md`
- `docs/plan-prd/TODO.md`
  - Sortable DataTable headers now expose `scope="col"`, `tabindex`, and `aria-sort`, and support Enter/Space keyboard sorting through the same sort state as pointer clicks.
  - Added a regression for keyboard sorting and `aria-sort` state transitions.
  - Nexus bilingual docs and Tuffex component docs now document the sorting interaction contract.

### feat(tuffex): add FlatSelect interaction contract coverage

- `packages/tuffex/packages/components/src/flat-select/src/TxFlatSelect.vue`
- `packages/tuffex/packages/components/src/flat-select/src/TxFlatSelectItem.vue`
- `packages/tuffex/packages/components/src/flat-select/__tests__/flat-select.test.ts`
- `apps/nexus/content/docs/dev/components/flat-select.zh.mdc`
- `apps/nexus/content/docs/dev/components/flat-select.en.mdc`
- `docs/plan-prd/TODO.md`
  - FlatSelect now exposes combobox/listbox/option ARIA semantics, with trigger and dropdown state reflected through `aria-expanded` and `aria-hidden`.
  - Added FlatSelect regression coverage for placeholder display, selected labels, enabled/disabled item selection, keyboard navigation that skips disabled items, and ARIA state.
  - Nexus bilingual docs now document the FlatSelect interaction contract.

### feat(tuffex): hard-cut Rating readonly interaction

- `packages/tuffex/packages/components/src/rating/src/TxRating.vue`
- `packages/tuffex/packages/components/src/rating/__tests__/rating.test.ts`
- `apps/nexus/content/docs/dev/components/rating.zh.mdc`
- `apps/nexus/content/docs/dev/components/rating.en.mdc`
- `packages/tuffex/docs/components/rating.md`
- `docs/plan-prd/TODO.md`
  - `readonly` Rating is now display-only: stars are disabled and no longer expose an interactive button path.
  - Rating now exposes radiogroup/radio ARIA state.
  - Added regression coverage for click updates, half-star precision, disabled/readonly blocking, and text slot props; Nexus bilingual docs and Tuffex docs document the interaction contract.

### test(tuffex): cover Progress and ProgressBar contracts

- `packages/tuffex/packages/components/src/progress-bar/__tests__/progress-bar.test.ts`
- `packages/tuffex/packages/components/src/progress/__tests__/progress.test.ts`
- `apps/nexus/content/docs/dev/components/progress.zh.mdc`
- `apps/nexus/content/docs/dev/components/progress.en.mdc`
- `packages/tuffex/docs/components/progress.md`
- `docs/plan-prd/TODO.md`
  - Added ProgressBar regression coverage for percentage clamp, ARIA progressbar state, indeterminate mode, complete event cycles, and segment width normalization.
  - Added TuffProgress wrapper coverage for percentage/status/strokeWidth/format/showText/indeterminate forwarding.
  - Progress docs now describe `TuffProgress` as the current lightweight entry over `TxProgressBar`, removing compatibility-wrapper wording.

### fix(tuffex): render Alert semantic icons through TxIcon

- `packages/tuffex/packages/components/src/alert/src/TxAlert.vue`
- `packages/tuffex/packages/components/src/alert/__tests__/alert.test.ts`
- `apps/nexus/content/docs/dev/components/alert.zh.mdc`
- `apps/nexus/content/docs/dev/components/alert.en.mdc`
- `packages/tuffex/docs/components/alert.md`
- `docs/plan-prd/TODO.md`
  - Alert leading icons now render through shared `TxIcon`; the close affordance uses the built-in `close` icon instead of an unresolved `x` name.
  - Added Alert regression coverage for semantic type/title/message/icon rendering, title/default slots, `showIcon`/`closable` switches, and `close` emission.
  - Nexus bilingual docs and Tuffex docs now document the `role="alert"` / `TxIcon` / close contract.

### docs(tuffex): hard-cut Badge positioning wording

- `packages/tuffex/packages/components/src/badge/__tests__/badge.test.ts`
- `apps/nexus/content/docs/dev/components/badge.zh.mdc`
- `apps/nexus/content/docs/dev/components/badge.en.mdc`
- `packages/tuffex/docs/components/badge.md`
- `docs/plan-prd/TODO.md`
  - Added Badge regression coverage for value/variant rendering, custom slot content, dot mode, and custom color CSS variables.
  - Badge docs now describe the current inline pill/dot contract and no longer imply target-element positioning that the component does not implement.
  - Nexus bilingual docs now document default slot content replacement and dot mode text hiding.

### test(tuffex): cover StatusBadge tone and platform contracts

- `packages/tuffex/packages/components/src/status-badge/__tests__/status-badge.test.ts`
- `apps/nexus/content/docs/dev/components/status-badge.zh.mdc`
- `apps/nexus/content/docs/dev/components/status-badge.en.mdc`
- `packages/tuffex/docs/components/status-badge.md`
- `docs/plan-prd/TODO.md`
  - Added StatusBadge regression coverage for text/size/explicit status, statusKey mapping, explicit status precedence, OS icon/osOnly rendering, custom icons, and click emission.
  - Nexus Lite docs now include `statusKey`, `icon`, `os`, and `osOnly`, plus the precedence/mapping contract.
  - Tuffex docs now record the same statusKey and platform icon behavior.

### test(tuffex): cover Avatar and AvatarGroup contracts

- `packages/tuffex/packages/components/src/avatar/__tests__/avatar.test.ts`
- `apps/nexus/content/docs/dev/components/avatar.zh.mdc`
- `apps/nexus/content/docs/dev/components/avatar.en.mdc`
- `packages/tuffex/docs/components/avatar.md`
- `docs/plan-prd/TODO.md`
  - Added Avatar regression coverage for name initials, custom colors, image error fallback, slot/icon/name fallback priority, custom size normalization, and clickable events.
  - Added AvatarGroup coverage for `max`, injected child size, overlap CSS variable, and `+N` overflow rendering.
  - Nexus bilingual docs and Tuffex docs now document fallback priority, image error fallback, expanded size types, and AvatarGroup max/size behavior.

### test(tuffex): cover Tag interaction contracts

- `packages/tuffex/packages/components/src/tag/__tests__/tag.test.ts`
- `apps/nexus/content/docs/dev/components/tag.zh.mdc`
- `apps/nexus/content/docs/dev/components/tag.en.mdc`
- `packages/tuffex/docs/components/tag.md`
- `docs/plan-prd/TODO.md`
  - Added Tag regression coverage for label/icon/default size/style variables, default slot replacement, click and close events, close propagation blocking, and disabled state.
  - Nexus Lite docs now match the current `size='sm'` default and include `icon/background/border/closable/disabled`.
  - Tuffex docs now record `role="status"`, slot replacement, and click/close interaction boundaries.

### test(tuffex): hard-cut Input clear interaction contract

- `packages/tuffex/packages/components/src/input/src/TxInput.vue`
- `packages/tuffex/packages/components/src/input/__tests__/input.test.ts`
- `apps/nexus/content/docs/dev/components/input.zh.mdc`
- `apps/nexus/content/docs/dev/components/input.en.mdc`
- `packages/tuffex/docs/components/input.md`
- `docs/plan-prd/TODO.md`
  - Input clear affordance now renders as a keyboard-focusable button and the exposed `clear()` path is blocked for disabled or readonly inputs.
  - Added Input regression coverage for text updates, number normalization, textarea attrs, clear emission, disabled/readonly clear blocking, and prefix/suffix slot precedence.
  - Nexus bilingual docs and Tuffex docs now document the current input type union, icon props, exposes, number emit behavior, attrs forwarding, and clear interaction contract.

### test(tuffex): implement Pagination first/last contract

- `packages/tuffex/packages/components/src/pagination/src/TxPagination.vue`
- `packages/tuffex/packages/components/src/pagination/__tests__/pagination.test.ts`
- `apps/nexus/content/docs/dev/components/pagination.zh.mdc`
- `apps/nexus/content/docs/dev/components/pagination.en.mdc`
- `packages/tuffex/docs/components/pagination.md`
- `docs/plan-prd/TODO.md`
  - Pagination `showFirstLast` now renders real first/last page jump buttons instead of remaining a docs/type-only prop.
  - Added Pagination regression coverage for page-count calculation, page-change emissions, out-of-range blocking, first/last controls, boundary disabled states, and custom info slot props.
  - Nexus bilingual docs and Tuffex docs now document `totalPages`, icon props, v-model/pageChange events, info slot props, and ARIA/boundary interaction behavior.

### test(tuffex): hard-cut Breadcrumb current and disabled items

- `packages/tuffex/packages/components/src/breadcrumb/src/TxBreadcrumb.vue`
- `packages/tuffex/packages/components/src/breadcrumb/__tests__/breadcrumb.test.ts`
- `apps/nexus/content/docs/dev/components/breadcrumb.zh.mdc`
- `apps/nexus/content/docs/dev/components/breadcrumb.en.mdc`
- `packages/tuffex/docs/components/breadcrumb.md`
- `docs/plan-prd/TODO.md`
  - Breadcrumb current page handling is now deterministic: the last item renders as a non-link element with `aria-current="page"` even when an `href` is provided.
  - Disabled breadcrumb items now render as non-link elements with `aria-disabled="true"` and do not emit click events.
  - Added Breadcrumb regression coverage for nav semantics, icons/separators, current item rendering, SPA click emission, and disabled blocking; Nexus/Tuffex docs now describe the item/event contract.

### test(tuffex): add Collapse keyboard accessibility contract

- `packages/tuffex/packages/components/src/collapse/src/TxCollapseItem.vue`
- `packages/tuffex/packages/components/src/collapse/__tests__/collapse.test.ts`
- `apps/nexus/content/docs/dev/components/collapse.zh.mdc`
- `apps/nexus/content/docs/dev/components/collapse.en.mdc`
- `packages/tuffex/docs/components/collapse.md`
- `docs/plan-prd/TODO.md`
  - Collapse item headers now expose button semantics with `tabindex`, `aria-expanded`, and `aria-controls`, and Enter/Space use the same toggle path as pointer clicks.
  - Disabled collapse items now expose `aria-disabled="true"` and block both pointer and keyboard toggles.
  - Added Collapse regression coverage for multi-panel updates, accordion mode, keyboard toggling, disabled blocking, and content/header ARIA linkage; Nexus/Tuffex docs now describe the contract.

### test(tuffex): hard-cut Steps child-order and keyboard contract

- `packages/tuffex/packages/components/src/steps/src/TxSteps.vue`
- `packages/tuffex/packages/components/src/steps/src/TxStep.vue`
- `packages/tuffex/packages/components/src/steps/src/types.ts`
- `packages/tuffex/packages/components/src/steps/__tests__/steps.test.ts`
- `apps/nexus/content/docs/dev/components/steps.zh.mdc`
- `apps/nexus/content/docs/dev/components/steps.en.mdc`
- `packages/tuffex/docs/components/steps.md`
- `docs/plan-prd/TODO.md`
  - Steps now registers child order so `TxStep` without an explicit `step` uses the same zero-based index as the numeric `active` prop, matching the public docs examples.
  - The final step no longer renders a connector line, and clickable step heads now expose button semantics, `aria-current="step"`, and Enter/Space activation.
  - Added Steps regression coverage for implicit order, explicit string steps, connector line boundaries, pointer/keyboard activation, and disabled/non-clickable blocking; Nexus/Tuffex docs now describe the contract.

### test(tuffex): fix Timeline active dot and list semantics

- `packages/tuffex/packages/components/src/timeline/src/TxTimeline.vue`
- `packages/tuffex/packages/components/src/timeline/src/TxTimelineItem.vue`
- `packages/tuffex/packages/components/src/timeline/__tests__/timeline.test.ts`
- `apps/nexus/content/docs/dev/components/timeline.zh.mdc`
- `apps/nexus/content/docs/dev/components/timeline.en.mdc`
- `packages/tuffex/docs/components/timeline.md`
- `docs/plan-prd/TODO.md`
  - Timeline now exposes list/listitem semantics for event streams.
  - `active` now applies to the timeline dot as well as the item wrapper, so the documented current-event highlight is visible.
  - Added Timeline regression coverage for default and horizontal layout, title/time/content/icon/color rendering, and active item/dot state; Nexus/Tuffex docs now describe the contract.

### test(tuffex): harden Toast host and timer contract

- `packages/tuffex/packages/utils/toast.ts`
- `packages/tuffex/packages/components/src/toast/src/TxToastHost.vue`
- `packages/tuffex/packages/components/src/toast/__tests__/toast.test.ts`
- `apps/nexus/content/docs/dev/components/toast.zh.mdc`
- `apps/nexus/content/docs/dev/components/toast.en.mdc`
- `packages/tuffex/docs/components/toast.md`
- `docs/plan-prd/TODO.md`
  - Toast auto-dismiss now uses `globalThis.setTimeout` instead of browser-only `window.setTimeout`.
  - Toast close buttons now expose the accessible name `Dismiss notification`, while host region semantics remain fixed.
  - Added Toast regression coverage for id replacement, auto-dismiss, persistent toasts, dismiss/clear helpers, host rendering, and close-button dismissal; Nexus/Tuffex docs now document the contract.

### test(tuffex): harden Icon source rendering contract

- `packages/tuffex/packages/components/src/icon/src/TxIcon.vue`
- `packages/tuffex/packages/components/src/icon/__tests__/icon.test.ts`
- `apps/nexus/content/docs/dev/components/icon.zh.mdc`
- `apps/nexus/content/docs/dev/components/icon.en.mdc`
- `packages/tuffex/docs/components/icon.md`
- `docs/plan-prd/TODO.md`
  - Fixed malformed builtin SVG paths for `close`, `search`, and `star`.
  - `TxIcon` now honors `icon.colorful=true` as well as the component-level `colorful` prop for SVG URL/file sources.
  - Added Icon regression coverage for class/builtin shorthand, emoji/empty/loading/error states, file protocol resolution, SVG mask/colorful behavior, and `TxStatusIcon` indicator sizing; Nexus/Tuffex docs now describe the contract.

### test(tuffex): hard-cut Dialog ARIA link contract

- `packages/tuffex/packages/components/src/dialog/src/TxBottomDialog.vue`
- `packages/tuffex/packages/components/src/dialog/src/TxTouchTip.vue`
- `packages/tuffex/packages/components/src/dialog/__tests__/dialog.test.ts`
- `apps/nexus/content/docs/dev/components/dialog.zh.mdc`
- `apps/nexus/content/docs/dev/components/dialog.en.mdc`
- `packages/tuffex/docs/components/dialog.md`
- `docs/plan-prd/TODO.md`
  - BottomDialog now uses instance-scoped title and description ids for ARIA links instead of fixed ids.
  - TouchTip dialog semantics now live on the focused container that owns the title/description relationship, while the outer shell remains layout/backdrop only.
  - Added Dialog regression coverage for BottomDialog/TouchTip ARIA links, Escape close, focus restore, and true/false button close behavior; docs now describe the actual focus behavior instead of claiming a full focus trap.

### test(tuffex): harden Drawer ARIA and focus contract

- `packages/tuffex/packages/components/src/drawer/src/TxDrawer.vue`
- `packages/tuffex/packages/components/src/drawer/__tests__/drawer.test.ts`
- `apps/nexus/content/docs/dev/components/drawer.zh.mdc`
- `apps/nexus/content/docs/dev/components/drawer.en.mdc`
- `packages/tuffex/docs/components/drawer.md`
- `docs/plan-prd/TODO.md`
  - Drawer now links the dialog title through an instance-scoped `aria-labelledby` id.
  - Opening the drawer focuses the drawer root after render; hiding or unmounting restores the previously focused element.
  - Added Drawer regression coverage for dialog semantics, direction/width/slots, open focus, close button/mask/Escape paths, close option guards, focus restore, custom z-index, and hidden close button; Nexus/Tuffex docs now describe the contract.

### test(tuffex): harden Modal Escape and wrapper slot contract

- `packages/tuffex/packages/components/src/modal/src/TxModal.vue`
- `packages/tuffex/packages/components/src/modal/src/TModal.vue`
- `packages/tuffex/packages/components/src/modal/__tests__/modal.test.ts`
- `apps/nexus/content/docs/dev/components/modal.zh.mdc`
- `apps/nexus/content/docs/dev/components/modal.en.mdc`
- `packages/tuffex/docs/components/modal.md`
- `docs/plan-prd/TODO.md`
  - Modal now links the dialog title through an instance-scoped `aria-labelledby` id, focuses the overlay on open, restores previous focus on hide/unmount, and supports Escape dismissal.
  - `TModal` no longer forwards empty `header` or `footer` slots, preserving the `TxModal` title fallback when wrappers do not provide custom slots.
  - Added Modal regression coverage for dialog semantics, title link, width/slots, focus restore, backdrop/Escape/close button dismissal, custom header, and `TModal` title fallback; Nexus/Tuffex docs now describe the contract.

### test(tuffex): harden ImageUploader disabled and object URL contract

- `packages/tuffex/packages/components/src/image-uploader/src/TxImageUploader.vue`
- `packages/tuffex/packages/components/src/image-uploader/__tests__/image-uploader.test.ts`
- `apps/nexus/content/docs/dev/components/image-uploader.zh.mdc`
- `apps/nexus/content/docs/dev/components/image-uploader.en.mdc`
- `packages/tuffex/docs/components/image-uploader.md`
- `docs/plan-prd/TODO.md`
  - ImageUploader disabled state now blocks remove actions and disables remove buttons, matching disabled add/input behavior.
  - Added ImageUploader regression coverage for input attributes, existing previews, max truncation, disabled add/remove blocking, object URL creation/revocation, remove/change events, and unmount cleanup.
  - Nexus/Tuffex docs now describe the current click-to-pick contract and no longer imply drag-and-drop support that the component does not implement.

### ref(aiapp): hard-cut retired stream status compatibility

- `retired-ai-app/server/utils/aiapp-executor-utils.ts`
- `retired-ai-app/server/utils/__tests__/aiapp-executor-utils.test.ts`
- `retired-ai-app/app/composables/useAIChatPage.ts`
- `retired-ai-app/app/composables/api/base/v1/aigc/completion/index.ts`
- `scripts/legacy-boundary-allowlist.json`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - Title SSE responses no longer emit `status_updated`; they only send completion chunks and `[DONE]`.
  - AI chat page removed the retained `status_updated` handler and the `error + TOOL_APPROVAL_REQUIRED` compatibility conversion; approval wait state now relies on the current `turn.approval_required` stream event.
  - Added a title SSE regression that rejects `status_updated` output and removed the stale `useAIChatPage.ts` legacy registry row.
  - 验证：`pnpm -C "retired-ai-app" exec vitest run "server/utils/__tests__/aiapp-executor-utils.test.ts" "server/utils/__tests__/legacy-completion-stream-contract.test.ts"` 通过；`pnpm -C "retired-ai-app" exec eslint "server/utils/aiapp-executor-utils.ts" "server/utils/__tests__/aiapp-executor-utils.test.ts" "app/composables/useAIChatPage.ts" "app/composables/api/base/v1/aigc/completion/index.ts"` 通过；`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard` 通过。

### ref(aiapp): hard-cut websearch legacy gateway provider id

- `retired-ai-app/server/utils/aiapp-admin-datasource-config.ts`
- `retired-ai-app/server/utils/aiapp-tool-gateway.ts`
- `retired-ai-app/server/utils/__tests__/aiapp-admin-datasource-config.test.ts`
- `retired-ai-app/server/utils/__tests__/aiapp-tool-gateway.test.ts`
- `scripts/legacy-boundary-allowlist.json`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - Historical `gatewayBaseUrl/apiKeyRef` datasource fields now hydrate into the current `searxng-main` provider id instead of emitting `legacy-gateway`.
  - Websearch tool execution no longer branches on provider id to choose the gateway connector; providers execute through the current provider connector by `type`.
  - Removed the 4 stale datasource/tool-gateway `legacy-keyword` allowlist / registry rows.

### chore(governance): classify non-compat legacy keyword exceptions

- `scripts/lib/legacy-keyword-exceptions.mjs`
- `scripts/check-legacy-boundaries.mjs`
- `scripts/check-compatibility-debt-registry.mjs`
- `scripts/legacy-boundary-allowlist.json`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
  - Legacy keyword scanning now excludes only documented non-compat branch cases: Vue I18n `legacy: false` framework API options, DeepAgent upstream `legacy protocol` error signatures, and negative lint restrictions for removed `/legacy` imports.
  - Removed the corresponding 5 stale `legacy-keyword` allowlist / registry rows while keeping real production branch keys, migration reads, and filename debt registered.
  - Official `legacy-keyword` count drops to `12 files / 18 hits`.

### ref(tuff-intelligence): hard-cut DeepAgent direct Responses fallback naming

- `packages/tuff-intelligence/src/adapters/deepagent-engine.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - DeepAgent fallback function and audit event naming now use direct Responses fallback wording instead of compatibility/legacy wording.
  - Runtime behavior is unchanged: upstream errors containing `legacy protocol` are still treated as provider protocol signatures and routed to direct `/v1/responses`.
  - Registry row now documents the remaining keyword as upstream error text matching, not a project compatibility branch.
  - 验证：`pnpm -C "packages/tuff-intelligence" exec eslint "src/adapters/deepagent-engine.ts"` 通过；`pnpm -C "packages/tuff-intelligence" exec vitest run "src/client.test.ts"` 通过；`pnpm -C "retired-ai-app" exec vitest run "server/utils/__tests__/deepagent-engine-message-shape.test.ts" "server/utils/__tests__/deepagent-engine-tools.test.ts"` 通过；`pnpm docs:guard:strict`、`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard`、`git diff --check` 通过。

### ref(aiapp): hard-cut removed channel adapter normalization

- `retired-ai-app/server/utils/aiapp-admin-channel-config.ts`
- `retired-ai-app/server/utils/__tests__/aiapp-admin-channel-config.test.ts`
- `scripts/legacy-boundary-allowlist.json`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - Channel catalog normalization no longer silently maps removed/unknown adapter values to `openai`.
  - Removed adapter rows are rejected as invalid channels with `missing: ["adapter"]`, so stale stored values are dropped instead of kept as usable runtime config.
  - Removed the stale `legacy-keyword` allowlist and registry row for the file.
  - 验证：`pnpm -C "retired-ai-app" exec vitest run "server/utils/__tests__/aiapp-admin-channel-config.test.ts" "server/utils/__tests__/aiapp-channel-model-sync.test.ts"` 通过；`pnpm -C "retired-ai-app" exec eslint "server/utils/aiapp-admin-channel-config.ts" "server/utils/__tests__/aiapp-admin-channel-config.test.ts" "server/utils/__tests__/aiapp-channel-model-sync.test.ts"` 通过；`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard` 通过。

### chore(packages-test): hard-cut tsconfig decorator comment legacy wording

- `packages/test/tsconfig.json`
- `docs/plan-prd/TODO.md`
  - The TypeScript template comment for `experimentalDecorators` now uses current TypeScript wording instead of legacy wording.
  - Compiler options are unchanged.

### ref(core-app): hard-cut plugin runtime repair diagnostic legacy naming

- `apps/core-app/src/main/modules/plugin/runtime/plugin-runtime-repair.ts`
- `apps/core-app/src/main/modules/plugin/runtime/plugin-runtime-repair.test.ts`
- `scripts/legacy-boundary-allowlist.json`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - Runtime repair drift detection now reports `retired-runtime-import` instead of `legacy-runtime-import`.
  - The scanner still detects the retired `../shared/translation-shared.cjs` widget import path; no compatibility runtime is added.
  - Removed the stale `legacy-keyword` registry and allowlist rows for the implementation and test.
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/plugin/runtime/plugin-runtime-repair.test.ts"` 通过；`pnpm -C "apps/core-app" exec eslint "src/main/modules/plugin/runtime/plugin-runtime-repair.ts" "src/main/modules/plugin/runtime/plugin-runtime-repair.test.ts"` 通过；`pnpm docs:guard:strict`、`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard`、`git diff --check` 通过。

### docs(core-app): hard-cut download migration guide legacy wording

- `apps/core-app/src/main/modules/download/MIGRATION_GUIDE.md`
- `docs/plan-prd/TODO.md`
  - Download migration guide now describes the removed old database/config import path as historical instead of Legacy wording.
  - Runtime behavior is unchanged: `DownloadCenter` still treats the current database as the only local source of truth.

### ref(aiapp): hard-cut quota history payload local legacy naming

- `retired-ai-app/server/utils/quota-history-store.ts`
- `scripts/legacy-boundary-allowlist.json`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - The base64 historical payload migration local variable now uses `historicalPayload` instead of legacy wording.
  - Runtime behavior is unchanged: non-JSON historical payloads are still decoded through `decodeLegacyQuotaConversation()` and persisted back as normalized JSON.
  - Removed the stale `legacy-keyword` registry and allowlist rows for the file.
  - 验证：`pnpm -C "retired-ai-app" exec eslint "server/utils/quota-history-store.ts"` 通过；`pnpm docs:guard:strict`、`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard`、`git diff --check` 通过。

### ref(aiapp): hard-cut capability historical field internal naming

- `retired-ai-app/shared/aiapp-capability-meta.ts`
- `retired-ai-app/server/utils/aiapp-admin-routing-config.ts`
- `retired-ai-app/app/composables/useAIRoutingAdmin.ts`
- `scripts/legacy-boundary-allowlist.json`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - Capability resolver internal parameter/type names now use `historicalFields` wording instead of legacy wording.
  - External behavior is unchanged: current `capabilities` still take precedence, and historical `allowWebsearch` / `allowImageGeneration` / `allowFileAnalysis` / `allowImageAnalysis` fields remain fallback inputs during the migration window.
  - Removed the stale `legacy-keyword` registry rows for the three files after keyword hits were eliminated.
  - 验证：`pnpm -C "retired-ai-app" exec vitest run "server/utils/__tests__/aiapp-capability-meta.shared.test.ts" "server/utils/__tests__/aiapp-admin-routing-config.capabilities.test.ts" "server/utils/__tests__/aiapp-admin-routing-config.test.ts"` 通过；`pnpm -C "retired-ai-app" exec eslint "shared/aiapp-capability-meta.ts" "server/utils/aiapp-admin-routing-config.ts" "app/composables/useAIRoutingAdmin.ts"` 通过；`pnpm docs:guard:strict`、`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard`、`git diff --check` 通过。

### ref(aiapp): hard-cut datasource gateway non-branch legacy wording

- `retired-ai-app/server/utils/aiapp-admin-datasource-config.ts`
- `retired-ai-app/server/utils/__tests__/aiapp-admin-datasource-config.test.ts`
- `scripts/legacy-boundary-allowlist.json`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - Datasource gateway comments and regression fixture text now use historical/retired wording for old gateway fields, sample base URLs, and test env keys.
  - The `legacy-gateway` provider id remains unchanged because production code still uses it as an explicit branch key for mapped gateway providers.
  - Allowlist counts are tightened from production `5 -> 2` and test `8 -> 2`; registry rows now describe the retained branch-key debt precisely.
  - 验证：`pnpm -C "retired-ai-app" exec vitest run "server/utils/__tests__/aiapp-admin-datasource-config.test.ts"` 通过；`pnpm -C "retired-ai-app" exec eslint "server/utils/aiapp-admin-datasource-config.ts" "server/utils/__tests__/aiapp-admin-datasource-config.test.ts"` 通过；`pnpm docs:guard:strict`、`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard`、`git diff --check` 通过。

### docs(core-app): hard-cut analytics search wording

- `apps/core-app/src/main/modules/analytics/README.md`
- `docs/analytics-data-prd.md`
- `docs/plan-prd/TODO.md`
  - Analytics search performance docs now describe current Layered / fast-deferred provider timing collection instead of legacy search collection.
  - Runtime behavior is unchanged: SearchCore still records `providerTimings` and `totalDuration` through `AnalyticsModule.recordSearchMetrics`.

### docs(compat): clarify CoreApp and Nexus Vue I18n legacy=false registry entries

- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - CoreApp renderer i18n and Nexus app i18n registry rows now document that `legacy: false` is the Vue I18n composition-mode API option, not a project compatibility branch.
  - The rows remain registered because the current keyword guard cannot distinguish framework option names from project legacy debt.

### docs(utils): hard-cut CoreBox DSL icon legacy wording

- `packages/utils/core-box/tuff/tuff-dsl.ts`
  - `docs/plan-prd/TODO.md`
  - `TuffMeta.icon` TSDoc now describes the field as the current icon identifier used by renderer fallbacks instead of a legacy icon identifier.
  - Runtime and type behavior are unchanged: providers can still pass lightweight icon class names without constructing a full `TuffIcon`.
  - 验证：`pnpm -C "packages/utils" exec eslint "core-box/tuff/tuff-dsl.ts"` 通过；`pnpm docs:guard:strict`、`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard`、`git diff --check` 通过。

### ref(aiapp): hard-cut system message production variable wording

- `retired-ai-app/server/utils/aiapp-system-message-response.ts`
- `scripts/legacy-boundary-allowlist.json`
- `docs/plan-prd/TODO.md`
  - The persisted visible system message collection now uses current `persistedVisibleSystemMessages` naming instead of legacy wording.
  - Runtime behavior is unchanged: visible persisted system messages are still merged with projected trace system messages by id and sorted by timeline.
  - Removed the stale `history/index.ts` legacy allowlist entry left after the previous meta wording cleanup.
  - 验证：`pnpm -C "retired-ai-app" exec eslint "server/utils/aiapp-system-message-response.ts"` 通过；`pnpm -C "retired-ai-app" exec vitest run "server/utils/__tests__/aiapp-system-message-response.test.ts"` 通过；`pnpm docs:guard:strict`、`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard`、`git diff --check` 通过。

### ref(aiapp): hard-cut history invalid meta comment wording

- `retired-ai-app/app/composables/api/base/v1/aigc/history/index.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - History mapper comment now says invalid historical meta instead of invalid legacy meta.
  - Runtime behavior is unchanged: invalid `row.meta` JSON still falls back to an empty meta object.
  - Removed the stale `legacy-keyword` registry row for the file.
  - 验证：`pnpm -C "retired-ai-app" exec eslint "app/composables/api/base/v1/aigc/history/index.ts"` 通过；`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard`、`git diff --check` 通过。

### chore(utils): hard-cut eslint removed-entry diagnostics wording

- `packages/utils/eslint.config.js`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - ESLint diagnostics now describe blocked old channel/transport/permission imports as removed entries instead of legacy APIs.
  - The literal `/legacy` import strings remain in the guard as negative-match restrictions, so the registry row is retained with a precise no-compat-branch explanation.
  - 验证：`pnpm -C "packages/utils" exec eslint "eslint.config.js"` 通过；`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard`、`git diff --check` 通过。

### docs(compat): clarify touch-image Vue I18n legacy=false registry entry

- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - `plugins/touch-image/src/main.ts` registry row now documents that `legacy: false` is the Vue I18n composition-mode API option, not a project compatibility branch.
  - The row remains registered because the current keyword guard cannot distinguish framework option names from project legacy debt.
  - 验证：`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard`、`git diff --check` 通过。

### ref(utils): hard-cut transport index legacy section label

- `packages/utils/transport/index.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - Transport package barrel export section now labels the SDK exports as `Current SDK Surface` instead of `Legacy Compatibility (Deprecated)`.
  - The exported SDK functions/types are unchanged; this only removes stale section wording from the current public entry.
  - Removed the stale `legacy-keyword` registry row for `packages/utils/transport/index.ts`.
  - 验证：`pnpm -C "packages/utils" exec eslint "transport/index.ts"` 通过；`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard`、`git diff --check` 通过。

### ref(aiapp): clarify workspace chat current completion wording

- `retired-ai-app/app/composables/useAIChatPage.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - Workspace chat comment now says the production homepage uses current `$completion` instead of legacy `$completion`.
  - The remaining `legacy` hits in `useAIChatPage.ts` are real old event compatibility branches (`status_updated` / error compatibility), so the registry row remains with a precise retained-compatibility description.
  - 验证：`pnpm -C "retired-ai-app" exec eslint "app/composables/useAIChatPage.ts"` 通过；`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard`、`git diff --check` 通过。

### ui(aiapp): hard-cut admin side nav legacy wording

- `retired-ai-app/app/components/admin/AdminSideNav.vue`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - AI admin sidebar status copy now says `历史 CMS 已下线` instead of `Legacy CMS 已下线`.
  - Removed the stale `legacy-keyword` registry row for the component after the file no longer contains legacy wording.
  - 验证：`pnpm -C "retired-ai-app" exec eslint "app/components/admin/AdminSideNav.vue"` 通过；`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard`、`git diff --check` 通过。

### test(aiapp): hard-cut routing resolver intent historical wording

- `retired-ai-app/server/utils/__tests__/aiapp-routing-resolver.intent.test.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - Routing resolver intent tests now describe fallback intent/image routes as historical routes instead of legacy routes.
  - The tests still prove `scenePolicies` take precedence and that historical image route fields remain a fallback when `scenePolicies` are missing; runtime behavior is unchanged.
  - Removed the stale `legacy-keyword` registry row for the test file.
  - 验证：`pnpm -C "retired-ai-app" exec vitest run "server/utils/__tests__/aiapp-routing-resolver.intent.test.ts"` 通过；`pnpm -C "retired-ai-app" exec eslint "server/utils/__tests__/aiapp-routing-resolver.intent.test.ts"` 通过；`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard`、`git diff --check` 通过。

### test(aiapp): hard-cut routing config historical fixture wording

- `retired-ai-app/server/utils/__tests__/aiapp-admin-routing-config.capabilities.test.ts`
- `retired-ai-app/server/utils/__tests__/aiapp-admin-routing-config.test.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - Routing config tests now describe old intent/image and capability fallback fields as historical fields instead of legacy fields.
  - The `intentNanoModelId` / `intentRouteComboId` compatibility field names remain covered, but sample values have moved from legacy-named values to historical-named values.
  - Removed the two stale `legacy-keyword` registry rows after both test files no longer contain legacy wording.
  - 验证：`pnpm -C "retired-ai-app" exec vitest run "server/utils/__tests__/aiapp-admin-routing-config.capabilities.test.ts" "server/utils/__tests__/aiapp-admin-routing-config.test.ts"` 通过；`pnpm -C "retired-ai-app" exec eslint "server/utils/__tests__/aiapp-admin-routing-config.capabilities.test.ts" "server/utils/__tests__/aiapp-admin-routing-config.test.ts"` 通过；`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard`、`git diff --check` 通过。

### test(aiapp): hard-cut capability meta test fixture wording

- `retired-ai-app/server/utils/__tests__/aiapp-capability-meta.shared.test.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - Capability meta shared tests no longer use legacy-named test text or invalid route combo sample values.
  - The test still proves explicit `capabilities` values take precedence over historical fallback fields, while `aiapp-capability-meta.ts` keeps its registered production fallback debt until implementation hard-cut.
  - Removed the stale `legacy-keyword` registry row for the test file.
  - 验证：`pnpm -C "retired-ai-app" exec vitest run "server/utils/__tests__/aiapp-capability-meta.shared.test.ts"` 通过；`pnpm -C "retired-ai-app" exec eslint "server/utils/__tests__/aiapp-capability-meta.shared.test.ts"` 通过；`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard`、`git diff --check` 通过。

### test(aiapp): hard-cut tool gateway retired fixture naming

- `retired-ai-app/server/utils/__tests__/aiapp-tool-gateway.test.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - Tool gateway regression fixtures now use `retired` adapter/document sample values instead of legacy-named samples where the name is not part of a production branch key.
  - The `legacy-gateway` provider id remains in the test because `aiapp-tool-gateway.ts` still uses that id to select `createGatewayWebsearchConnector`; the registry row is retained with a precise branch-key note.
  - The tests still prove unsupported media adapters fail and provider-backed websearch uses the gateway connector; runtime behavior is unchanged.
  - 验证：`pnpm -C "retired-ai-app" exec vitest run "server/utils/__tests__/aiapp-tool-gateway.test.ts"` 通过；`pnpm -C "retired-ai-app" exec eslint "server/utils/__tests__/aiapp-tool-gateway.test.ts"` 通过；`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard`、`git diff --check` 通过。

### test(aiapp): hard-cut system message historical fixture wording

- `retired-ai-app/server/utils/__tests__/aiapp-system-message-response.test.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - System message projection regression fixtures now use `historical system row` / `session_historical_only` / `msg_system_historical` instead of legacy-named sample values.
  - The test still proves trace projection overrides historical system rows and preserves historical rows when no trace exists; runtime behavior is unchanged.
  - Removed the stale `legacy-keyword` registry row for the test file.
  - 验证：`pnpm -C "retired-ai-app" exec vitest run "server/utils/__tests__/aiapp-system-message-response.test.ts"` 通过；`pnpm -C "retired-ai-app" exec eslint "server/utils/__tests__/aiapp-system-message-response.test.ts"` 通过；`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard`、`git diff --check` 通过。

### test(aiapp): hard-cut channel model sync retired fixture naming

- `retired-ai-app/server/utils/__tests__/aiapp-channel-model-sync.test.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - Channel model sync regression fixture now uses `retired-model` instead of `legacy-model` for the pre-existing catalog model.
  - The assertion still proves existing configured channel models are preserved while discovered models are appended; no runtime behavior changed.
  - Removed the stale `legacy-keyword` registry row for the test file after the keyword scan stopped finding it.
  - 验证：`pnpm -C "retired-ai-app" exec vitest run "server/utils/__tests__/aiapp-channel-model-sync.test.ts"` 通过；`pnpm -C "retired-ai-app" exec eslint "server/utils/__tests__/aiapp-channel-model-sync.test.ts"` 通过；`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard`、`git diff --check` 通过。

### test(aiapp): hard-cut workspace and replay fixture legacy wording

- `retired-ai-app/app/components/aiapp/AIChatWorkspace.vue`
- `retired-ai-app/app/components/aiapp/AISessionsPanel.vue`
- `retired-ai-app/app/components/aiapp/AISidebarHeader.vue`
- `retired-ai-app/server/utils/__tests__/aiapp-stream-replay.test.ts`
- `retired-ai-app/server/utils/__tests__/quota-conversation-snapshot.test.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - AI workspace-only component comments now describe the current chat surface instead of a legacy chat surface.
  - Replay and quota snapshot regression fixtures now use `retired` sample payloads instead of `legacy` sample values; assertions and runtime behavior are unchanged.
  - Removed the five stale `legacy-keyword` registry rows after these files no longer contain legacy wording.
  - 验证：`pnpm -C "retired-ai-app" exec vitest run "server/utils/__tests__/aiapp-stream-replay.test.ts" "server/utils/__tests__/quota-conversation-snapshot.test.ts"` 通过；`pnpm -C "retired-ai-app" exec eslint "app/components/aiapp/AIChatWorkspace.vue" "app/components/aiapp/AISessionsPanel.vue" "app/components/aiapp/AISidebarHeader.vue" "server/utils/__tests__/aiapp-stream-replay.test.ts" "server/utils/__tests__/quota-conversation-snapshot.test.ts"` 通过；`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard`、`git diff --check` 通过。

### test(aiapp): hard-cut auth retired header fixture wording

- `retired-ai-app/server/utils/__tests__/auth.test.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - AI auth regression fixture now uses `retired_*` header/cookie/bearer values instead of `legacy_*` names while preserving the same assertion: retired direct identity inputs fall back to the device guest identity.
  - Removed the stale `legacy-keyword` registry row for `auth.test.ts` after the file no longer contains legacy wording.
  - 验证：`pnpm -C "retired-ai-app" exec vitest run "server/utils/__tests__/auth.test.ts"` 通过；`pnpm -C "retired-ai-app" exec eslint "server/utils/__tests__/auth.test.ts"` 通过；`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard`、`git diff --check` 通过。

### ref(transport): hard-cut legacy wording in transport bridge adapters

- `packages/utils/transport/sdk/main-transport.ts`
- `packages/utils/transport/sdk/renderer-transport.ts`
- `packages/utils/transport/event/builder.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - Internal transport adapter names have been renamed from `LEGACY_CHANNEL` / `LEGACY_SUCCESS_CODE` / `LegacyMainChannel` to the current bridge terminology.
  - Transport adapter TSDoc now describes the retained TouchChannel bridge instead of a legacy adapter surface; `defineRawEvent` docs now mark the helper as reserved for retained non-conforming event names, not an incremental legacy migration path.
  - Removed the three stale `legacy-keyword` registry rows after the package transport files no longer contain legacy wording.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/main-transport-stream.test.ts" "__tests__/renderer-transport-stream.test.ts" "__tests__/transport-event-boundary.test.ts"` 通过；`pnpm -C "packages/utils" exec eslint "transport/sdk/main-transport.ts" "transport/sdk/renderer-transport.ts" "transport/event/builder.ts" "__tests__/main-transport-stream.test.ts" "__tests__/renderer-transport-stream.test.ts" "__tests__/transport-event-boundary.test.ts"` 通过；`node "scripts/check-legacy-boundaries.mjs"`、`pnpm compat:registry:guard`、`git diff --check` 通过。

### ref(aiapp): hard-cut public completion stream legacy symbol names

- `retired-ai-app/app/composables/api/base/v1/aigc/completion/legacy-stream-contract.ts`
- `retired-ai-app/app/composables/api/base/v1/aigc/completion/legacy-stream-input.ts`
- `retired-ai-app/app/composables/api/base/v1/aigc/completion/legacy-stream-sse.ts`
- `retired-ai-app/app/composables/api/base/v1/aigc/completion/index.ts`
- `retired-ai-app/app/pages/index.vue`
- `retired-ai-app/server/utils/__tests__/legacy-completion-stream-contract.test.ts`
- `retired-ai-app/server/utils/__tests__/legacy-stream-input.test.ts`
- `docs/plan-prd/TODO.md`
  - Public AI completion stream symbols have been renamed from `buildLegacyCompletion*`, `resolveLegacyUiStreamInput`, `handleLegacyCompletionExecutorResult`, and `resolveLegacyConversationSeqCursor` to the current `buildAICompletion*`, `resolveAIUiStreamInput`, `handleAICompletionExecutorResult`, and `resolveAIConversationSeqCursor` names.
  - Runtime stream request metadata now emits `aiapp-ui-completion*` source markers instead of `legacy-ui-completion*`.
  - Tests and UI call sites now use the current names; physical `legacy-stream-*` file names remain unchanged pending explicit confirmation for file moves.
  - 验证：`pnpm -C "retired-ai-app" exec vitest run "server/utils/__tests__/legacy-completion-stream-contract.test.ts" "server/utils/__tests__/legacy-stream-input.test.ts"` 通过；`pnpm -C "retired-ai-app" exec eslint "app/composables/api/base/v1/aigc/completion/legacy-stream-contract.ts" "app/composables/api/base/v1/aigc/completion/legacy-stream-input.ts" "app/composables/api/base/v1/aigc/completion/legacy-stream-sse.ts" "app/composables/api/base/v1/aigc/completion/index.ts" "app/pages/index.vue" "server/utils/__tests__/legacy-completion-stream-contract.test.ts" "server/utils/__tests__/legacy-stream-input.test.ts"` 通过。

### ref(aiapp): hard-cut public run-event card legacy symbol names

- `packages/tuff-intelligence/src/business/aiapp/legacy-run-event-card.ts`
- `retired-ai-app/server/utils/quota-conversation-snapshot.ts`
- `retired-ai-app/app/composables/api/base/v1/aigc/completion/index.ts`
- `retired-ai-app/server/utils/__tests__/aiapp-legacy-run-event-card.test.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
  - Public AI run-event card exports have been renamed from `projectAILegacyRunEventCard` / `resolveAILegacyRunEventCardKeys` / `AILegacyRunEventCard*` to `projectAIRunEventCard` / `resolveAIRunEventCardKeys` / `AIRunEventCard*`.
  - AI server snapshot reconstruction and AI app stream card upsert now consume the current names, and the regression test wording no longer describes a legacy pending key or legacy timeline.
  - The implementation file name remains unchanged for now because a physical move/delete requires explicit confirmation under the repository risk rules; the public API no longer exposes the Legacy-named symbols.
  - Removed the stale `legacy-keyword` compatibility registry row for the AI run-event card test after the keyword scan stopped finding it; the `compat-file` row remains while the physical filename is unchanged.
  - 验证：`pnpm -C "retired-ai-app" exec vitest run "server/utils/__tests__/aiapp-legacy-run-event-card.test.ts"` 通过；`pnpm -C "retired-ai-app" exec eslint "server/utils/quota-conversation-snapshot.ts" "app/composables/api/base/v1/aigc/completion/index.ts" "server/utils/__tests__/aiapp-legacy-run-event-card.test.ts"` 通过。

### ref(utils): remove retired intelligence chat aliases

- `packages/tuff-intelligence/src/client.ts`
- `packages/tuff-intelligence/src/client.test.ts`
- `packages/utils/intelligence/client.ts`
- `packages/utils/plugin/sdk/intelligence.ts`
- `packages/utils/__tests__/intelligence-client-hard-cut.test.ts`
- `docs/plan-prd/TODO.md`
  - `createIntelligenceClient()` now returns the canonical `IntelligenceSdk` surface directly; the deprecated `client.chat(...)` alias has been removed from both `@talex-touch/tuff-intelligence` and `@talex-touch/utils`.
  - Plugin `intelligence` SDK now exposes only `invoke(...)`; plugin chat calls must use `invoke('text.chat', ...)` or the client `chatLangChain(...)` path instead of the retired `intelligence.chat(...)` wrapper.
  - Added hard-cut tests that assert the runtime objects no longer expose a `chat` property.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/intelligence-client-hard-cut.test.ts"` 通过；`pnpm -C "packages/utils" exec eslint "intelligence/client.ts" "plugin/sdk/intelligence.ts" "__tests__/intelligence-client-hard-cut.test.ts"` 通过；`pnpm -C "packages/tuff-intelligence" exec vitest run "src/client.test.ts"` 通过；`pnpm -C "packages/tuff-intelligence" exec eslint "src/client.ts" "src/client.test.ts"` 通过。

### ref(tuff-intelligence): remove raw event builder from local transport facade

- `packages/tuff-intelligence/src/transport/event/builder.ts`
- `packages/tuff-intelligence/src/transport/event/builder.test.ts`
- `apps/nexus/content/docs/dev/architecture/ipc-events-sdk-map.en.mdc`
- `apps/nexus/content/docs/dev/architecture/ipc-events-sdk-map.zh.mdc`
- `apps/nexus/content/docs/dev/architecture/intelligence-system.en.mdc`
- `apps/nexus/content/docs/dev/architecture/intelligence-system.zh.mdc`
- `docs/plan-prd/TODO.md`
  - `@talex-touch/tuff-intelligence` local transport builder now only exposes the typed `defineEvent(namespace).module(...).event(...)` path; `defineRawEvent('intelligence:invoke')` is no longer exported or covered as a supported fallback.
  - Nexus Intelligence IPC maps now document `intelligence:api:*` as the SDK typed transport facade instead of advertising the retired two-part `intelligence:*` raw API events.
  - 验证：`pnpm -C "packages/tuff-intelligence" exec vitest run "src/transport/event/builder.test.ts"` 通过；`pnpm -C "packages/tuff-intelligence" exec eslint "src/transport/event/builder.ts" "src/transport/event/builder.test.ts"` 通过。

### ref(utils): route plugin service and shortcut listeners through typed transport

- `packages/utils/plugin/sdk/common.ts`
- `packages/utils/plugin/sdk/channel.ts`
- `packages/utils/plugin/sdk/channel-client.ts`
- `packages/utils/plugin/sdk/service/index.ts`
- `packages/utils/plugin/sdk/storage.ts`
- `packages/utils/plugin/sdk/hooks/life-cycle.ts`
- `packages/utils/plugin/sdk/hooks/bridge.ts`
- `packages/utils/plugin/sdk/feature-sdk.ts`
- `packages/utils/plugin/sdk/enum/bridge-event.ts`
- `packages/utils/__tests__/plugin-common-sdk.test.ts`
- `packages/utils/__tests__/plugin-service-sdk.test.ts`
- `packages/utils/__tests__/plugin-channel-send-sync-hard-cut.test.ts`
- `packages/utils/__tests__/plugin-storage-sdk.test.ts`
- `packages/utils/__tests__/plugin-lifecycle-hook-sdk.test.ts`
- `packages/utils/__tests__/plugin-bridge-hook-sdk.test.ts`
- `packages/utils/__tests__/plugin-sdk-lifecycle.test.ts`
- `plugins/touch-translation/widgets/translate-panel.vue`
- `apps/nexus/content/docs/dev/api/bridge-hooks.en.mdc`
- `apps/nexus/content/docs/dev/api/bridge-hooks.zh.mdc`
- `apps/nexus/content/docs/dev/api/box.en.mdc`
- `apps/nexus/content/docs/dev/api/box.zh.mdc`
- `apps/nexus/content/docs/dev/api/channel.en.mdc`
- `apps/nexus/content/docs/dev/api/channel.zh.mdc`
- `apps/nexus/content/docs/dev/api/feature.en.mdc`
- `apps/nexus/content/docs/dev/api/feature.zh.mdc`
- `apps/nexus/content/docs/dev/api/keyboard.en.mdc`
- `apps/nexus/content/docs/dev/api/keyboard.zh.mdc`
- `docs/plan-prd/TODO.md`
  - Plugin shortcut trigger callbacks now subscribe with `transport.on(PluginEvents.shortcut.trigger)` instead of `channel.regChannel('shortcon:trigger')`.
  - Plugin renderer channel SDK types no longer expose `sendSync`; runtime prelude still throws `plugin_channel_send_sync_removed` for old callers, while `PluginChannelClient` / `IPluginRendererChannel` and Channel API docs stop advertising the synchronous surface.
  - Nexus Channel docs are now retired migration maps instead of Channel quick starts; they no longer include copyable `useChannel()` / `usePluginRendererChannel()` tutorial snippets.
  - Nexus Box SDK input monitoring examples now use `onCoreBoxInputChange()` instead of `useChannel().regChannel('core-box:input-change')`.
  - Plugin service handlers now subscribe with `transport.on(PluginEvents.service.handle)` instead of `channel.regChannel('service:handle')`.
  - Plugin storage `onDidChange()` now subscribes with `transport.on(PluginEvents.storage.update)` instead of `channel.regChannel('plugin:storage:update')`.
  - Plugin lifecycle hooks now subscribe with `transport.on(PluginEvents.lifecycleSignal.*)` instead of private `@lifecycle:*` raw channel strings, preserving the boolean reply result through the typed listener return value.
  - Plugin CoreBox bridge hooks now subscribe to input / clipboard updates through `CoreBoxEvents.input.change` and `CoreBoxEvents.clipboard.change`; `createFeatureSDK()` also uses `CoreBoxEvents.input.change` instead of a local raw `core-box:input-change` event.
  - `core-box:key-event` is now hard-cut because no production sender exists: `onCoreBoxKeyEvent()` throws `plugin_bridge_key_event_removed`, `feature.onKeyEvent()` throws `plugin_feature_key_event_removed`, and the bridge auto-cache only registers input / clipboard typed events.
  - Official `touch-translation` no longer registers `channel.regChannel('core-box:key-event')`; widget keyboard handling stays on host-provided `hostKeyEvent` props / local UI handlers.
  - Nexus API docs now mark `core-box:key-event`, `feature.onKeyEvent()` and `onCoreBoxKeyEvent()` as retired instead of listing them as supported plugin keyboard surfaces.
  - Event names remain `shortcon:trigger` / `service:handle`, but the SDK call sites now consume shared event objects and stop adding new arbitrary raw channel listener usage.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/plugin-common-sdk.test.ts" "__tests__/plugin-service-sdk.test.ts"` 通过；`pnpm -C "packages/utils" exec eslint "plugin/sdk/common.ts" "plugin/sdk/service/index.ts" "__tests__/plugin-common-sdk.test.ts" "__tests__/plugin-service-sdk.test.ts"` 通过。
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/plugin-storage-sdk.test.ts"` 通过；`pnpm -C "packages/utils" exec eslint "plugin/sdk/storage.ts" "__tests__/plugin-storage-sdk.test.ts"` 通过。
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/plugin-lifecycle-hook-sdk.test.ts"` 通过；`pnpm -C "packages/utils" exec eslint "plugin/sdk/hooks/life-cycle.ts" "__tests__/plugin-lifecycle-hook-sdk.test.ts"` 通过。
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/plugin-bridge-hook-sdk.test.ts" "__tests__/plugin-sdk-lifecycle.test.ts"` 通过；`pnpm -C "packages/utils" exec eslint "plugin/sdk/hooks/bridge.ts" "plugin/sdk/feature-sdk.ts" "__tests__/plugin-bridge-hook-sdk.test.ts" "__tests__/plugin-sdk-lifecycle.test.ts"` 通过。
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/plugin-channel-send-sync-hard-cut.test.ts"` 通过；`pnpm -C "packages/utils" exec eslint "plugin/sdk/channel.ts" "plugin/sdk/channel-client.ts" "plugin/sdk/types.ts" "__tests__/plugin-channel-send-sync-hard-cut.test.ts"` 通过。

### docs(tuffex): clarify Button semantic tone contract

- `packages/tuffex/packages/components/src/button/src/types.ts`
- `packages/tuffex/packages/components/src/button/__tests__/button.test.ts`
- `packages/tuffex/docs/components/button.md`
- `apps/nexus/content/docs/dev/components/button.en.mdc`
- `apps/nexus/content/docs/dev/components/button.zh.mdc`
- `docs/plan-prd/TODO.md`
  - Button `type` is documented as the current semantic tone alias instead of a legacy compatibility surface.
  - Nexus and Tuffex docs now state that `variant` has priority and `type="text"` maps to the `ghost` visual variant.
  - Added regression coverage for `type -> variant`, `text -> ghost`, and `variant` overriding `type`.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/button/__tests__/button.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/button/src/button.vue" "packages/components/src/button/src/types.ts" "packages/components/src/button/__tests__/button.test.ts"` 通过。

### chore(tuffex): remove FlipOverlay compatibility wording noise

- `packages/tuffex/packages/components/src/flip-overlay/src/TxFlipOverlay.vue`
- `docs/plan-prd/TODO.md`
  - Single-overlay mask behavior is now described as the current baseline instead of backward-compatible visuals/transitions.
  - Runtime behavior is unchanged; existing stack layering and opacity behavior remains covered by `flip-overlay.test.ts`.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/flip-overlay/__tests__/flip-overlay.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/flip-overlay/src/TxFlipOverlay.vue" "packages/components/src/flip-overlay/__tests__/flip-overlay.test.ts"` 通过。

### fix(core-app): require explicit inline workflow step kind

- `apps/core-app/src/main/modules/ai/intelligence-deepagent-orchestration.ts`
- `apps/core-app/src/main/modules/ai/intelligence-deepagent-orchestration.test.ts`
- `docs/plan-prd/TODO.md`
  - `workflow.execute` inline payloads no longer infer step kind from `agentId` / `toolId`; each step must explicitly declare `kind='prompt'|'tool'|'agent'`.
  - Inline workflow normalization now rejects missing kind, missing `toolId` for tool steps, and missing `agentId` for agent steps at the capability boundary.
  - Inline workflow payloads now reject `capabilityId` routing, and historical workflow definition steps with non-`workflow.execute` `metadata.capabilityId` fail instead of delegating through the retired capability step path.
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/ai/intelligence-deepagent-orchestration.test.ts"` 通过。

### fix(core-app): reject empty workflow editor agent steps

- `apps/core-app/src/renderer/src/modules/hooks/useWorkflowEditor.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useWorkflowEditor.test.ts`
- `docs/plan-prd/TODO.md`
  - Workflow editor save now raises `agent_required` when an agent step has an empty `agentId`, instead of silently re-filling `builtin.workflow-agent`.
  - New agent steps still default to `builtin.workflow-agent`, but user-cleared invalid drafts are blocked before reaching the main workflow service.
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/renderer/src/modules/hooks/useWorkflowEditor.test.ts"` 通过。

### fix(core-app): hard-cut invalid workflow step identifiers

- `apps/core-app/src/main/modules/ai/intelligence-workflow-service.ts`
- `apps/core-app/src/main/modules/ai/intelligence-workflow-service.test.ts`
- `docs/plan-prd/TODO.md`
  - `IntelligenceWorkflowService` now rejects `kind='tool'` steps without `toolId` and `kind='agent'` steps without `agentId` during workflow normalization.
  - Workflow run normalization now rejects unsupported step kinds and tool run steps without `toolId`, preventing resume/history paths from silently downgrading invalid run steps to prompt.
  - Workflow definition/run DB hydration now reuses the same strict normalizers, so stale invalid rows cannot bypass save-time hard-cut and re-enter editor or resume flows.
  - Invalid workflow definitions fail at save/inline-run normalization time instead of being persisted and failing later in execution.
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/ai/intelligence-workflow-service.test.ts"` 通过。

### fix(tuffex): support controlled grouped Tabs

- `packages/tuffex/packages/components/src/tabs/src/TxTabs.vue`
- `packages/tuffex/packages/components/src/tabs/__tests__/tabs.test.ts`
- `apps/nexus/content/docs/dev/components/tabs.en.mdc`
- `docs/plan-prd/TODO.md`
  - Fixed `TxTabs` controlled/default lookup so `modelValue` and `defaultValue` can select `TxTabItem` nodes inside `TxTabItemGroup`.
  - Removed the watcher path that directly invoked the default slot outside render; tab lookup now uses render-time cached tab nodes.
  - Added focused Tabs coverage for activation, grouped nav items, header and `nav-right` slots, enabled/disabled switching, controlled grouped tabs, visual prop normalization, AutoSizer expose methods, and animation prop forwarding.
  - Replaced generated English Tabs API placeholders and duplicate `autoHeight` row with current `borderless`, animation, slot, expose, item, and event contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/tabs/__tests__/tabs.test.ts"` 通过。

### test(tuffex): add GroupBlock contract coverage

- `packages/tuffex/packages/components/src/group-block/__tests__/group-block.test.ts`
- `apps/nexus/content/docs/dev/components/group-block.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused GroupBlock coverage for expansion, static group blocking, `memoryName` persistence, BlockLine link activation, BlockSlot slot/disabled behavior, and BlockSwitch switch/guidance/loading modes.
  - Replaced generated English GroupBlock demo/API placeholders with the current group, line, slot, switch, icon, persistence, and event contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/group-block/__tests__/group-block.test.ts"` 通过。

### test(tuffex): add Scroll native contract coverage

- `packages/tuffex/packages/components/src/scroll/__tests__/scroll.test.ts`
- `apps/nexus/content/docs/dev/components/scroll.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused Scroll native coverage for native mode rendering, `direction` overflow mapping, `noPadding`, `scrollChaining`, slots, `scrollTo()`, `getScrollInfo()`, scroll events, pull-up, pull-down, and finish reset gates.
  - Replaced generated English Scroll API placeholders with the current native/BetterScroll runtime strategy, auto fallback, scrollbar, pull refresh/load, and event contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/scroll/__tests__/scroll.test.ts"` 通过。

### test(tuffex): add Slider contract coverage

- `packages/tuffex/packages/components/src/slider/__tests__/slider.test.ts`
- `apps/nexus/content/docs/dev/components/slider.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused Slider coverage for value clamping, `formatValue` / `showValue`, input/change emits, disabled tooltip blocking, hover and always tooltip modes, `tooltipMotion='none'`, and global pointer listener cleanup.
  - Replaced generated English Slider API placeholders with the current native range, tooltip trigger/formatter/placement, tilt/spring/motion/jelly parameter, and event contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/slider/__tests__/slider.test.ts"` 通过。

### test(tuffex): add Card contract coverage

- `packages/tuffex/packages/components/src/card/__tests__/card.test.ts`
- `apps/nexus/content/docs/dev/components/card.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused Card coverage for the default `background='pure'` contract, structural slots, size/radius/padding mapping, clickable/disabled click behavior, loading spinner size, mask/glass/refraction surface prop forwarding, and pointer-light coupling.
  - Corrected the English Card API table's stale `background` default/type and replaced generated placeholders with the current variant, shadow, size, loading, inertial, event, and slot contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/card/__tests__/card.test.ts"` 通过。

### fix(tuffex): restore GradualBlur preset precedence

- `packages/tuffex/packages/components/src/gradual-blur/src/TxGradualBlur.vue`
- `packages/tuffex/packages/components/src/gradual-blur/__tests__/gradual-blur.test.ts`
- `apps/nexus/content/docs/dev/components/gradual-blur.en.mdc`
- `docs/plan-prd/TODO.md`
  - Fixed GradualBlur config precedence to resolve as defaults < preset < explicitly provided props, so presets like `intense` are no longer overwritten by `withDefaults` values.
  - Updated non-responsive sizing to read the current resolved config directly, while responsive mode still uses viewport breakpoint state.
  - Added focused GradualBlur coverage for layer generation, page target/gpu/style/class behavior, preset and `divCount` clamp, hover intensity, and responsive breakpoint dimensions.
  - Replaced generated English GradualBlur API placeholders with the current preset, positioning, responsive, scroll animation, GPU, class, and style contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/gradual-blur/__tests__/gradual-blur.test.ts"` 通过。

### test(tuffex): add Fusion contract coverage

- `packages/tuffex/packages/components/src/fusion/__tests__/fusion.test.ts`
- `apps/nexus/content/docs/dev/components/fusion.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused Fusion coverage for slot rendering, direction class, CSS variable normalization, SVG gooey filter parameters, hover/click/manual triggers, controlled state, and disabled blocking.
  - Replaced generated English Fusion API placeholders with the current controlled/uncontrolled active state, trigger, split-axis, gooey filter, and event contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/fusion/__tests__/fusion.test.ts"` 通过。

### test(tuffex): hard-cut Cascader phantom remote search surface

- `packages/tuffex/packages/components/src/cascader/src/types.ts`
- `packages/tuffex/packages/components/src/cascader/__tests__/cascader.test.ts`
- `apps/nexus/content/docs/dev/components/cascader.en.mdc`
- `docs/plan-prd/TODO.md`
  - Removed unimplemented Cascader type surface for `remote`, `searchLoading`, `searchResults`, `searchDebounce`, `resolvePath`, and the never-emitted `search` event.
  - Expanded Cascader contract coverage for single selection, multiple selection, clear behavior, disabled blocking, async `load`, exposed helpers, and local-search empty state.
  - Replaced generated English Cascader API placeholders with the current local search, lazy child loading, selection, event, and expose contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/cascader/__tests__/cascader.test.ts"` 通过。

### test(tuffex): add GlassSurface contract coverage

- `packages/tuffex/packages/components/src/glass-surface/__tests__/glass-surface.test.ts`
- `apps/nexus/content/docs/dev/components/glass-surface.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused GlassSurface coverage for numeric dimension normalization, slot rendering, solid fallback styling when `backdrop-filter` support is unavailable, and RGB displacement map/channel selector forwarding.
  - Replaced generated English GlassSurface API placeholders with the current SVG filter, backdrop-filter fallback, solid fallback, and displacement parameter contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/glass-surface/__tests__/glass-surface.test.ts"` 通过。

### fix(tuffex): hard-cut MarkdownView unsafe sanitize fallback

- `packages/tuffex/packages/components/src/markdown-view/src/TxMarkdownView.vue`
- `packages/tuffex/packages/components/src/markdown-view/__tests__/markdown-view.test.ts`
- `apps/nexus/content/docs/dev/components/markdown-view.en.mdc`
- `docs/plan-prd/TODO.md`
  - `TxMarkdownView` no longer renders raw Markdown HTML while `sanitize=true` waits for DOMPurify or when sanitizer loading fails; raw HTML is only rendered when `sanitize=false`.
  - Added focused MarkdownView coverage for pre-sanitizer empty output, sanitized rendering, explicit raw mode, light/dark themes, auto document theme resolution, and theme observer updates.
  - Replaced generated English MarkdownView API placeholders with the current real sanitization and theme contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/markdown-view/__tests__/markdown-view.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/markdown-view/src/TxMarkdownView.vue" "packages/components/src/markdown-view/__tests__/markdown-view.test.ts"` 通过。

### test(tuffex): add TextTransformer contract coverage

- `packages/tuffex/packages/components/src/text-transformer/__tests__/text-transformer.test.ts`
- `apps/nexus/content/docs/dev/components/text-transformer.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused TextTransformer coverage for default live-region rendering, root tag and CSS variable mapping, wrap mode, dual-layer text transitions, slot text props, and timer cleanup.
  - Replaced generated English TextTransformer API placeholders with the current real text transition contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/text-transformer/__tests__/text-transformer.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/text-transformer/src/TxTextTransformer.vue" "packages/components/src/text-transformer/__tests__/text-transformer.test.ts"` 通过。

### test(tuffex): add TypingIndicator contract coverage

- `packages/tuffex/packages/components/src/chat/__tests__/typing-indicator.test.ts`
- `apps/nexus/content/docs/dev/components/typing-indicator.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused TypingIndicator coverage for status semantics, dots/ai/pure/ring/circle-dash/bars variants, size CSS variables, text visibility, and SVG mask binding.
  - Replaced generated English TypingIndicator API placeholders with the current real loading indicator contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/chat/__tests__/typing-indicator.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/chat/src/TxTypingIndicator.vue" "packages/components/src/chat/__tests__/typing-indicator.test.ts"` 通过。

### test(tuffex): add CardItem contract coverage

- `packages/tuffex/packages/components/src/card-item/__tests__/card-item.test.ts`
- `apps/nexus/content/docs/dev/components/card-item.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused CardItem coverage for text rendering, avatar source priority, slot replacement, active/clickable/disabled states, Enter activation, and no-left layout.
  - Replaced generated English CardItem API, slot, and event placeholders with the current real row contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/card-item/__tests__/card-item.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/card-item/src/TxCardItem.vue" "packages/components/src/card-item/__tests__/card-item.test.ts"` 通过。

### test(tuffex): add AutoSizer contract coverage

- `packages/tuffex/packages/components/src/auto-sizer/__tests__/auto-sizer.test.ts`
- `apps/nexus/content/docs/dev/components/auto-sizer.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused AutoSizer coverage for outer/inner tags, attr/class/style merging, inline layout inference, utility option forwarding, exposed methods, and action snapshot detection.
  - Replaced generated English AutoSizer API and expose placeholders with the current real sizing contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/auto-sizer/__tests__/auto-sizer.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/auto-sizer/src/TxAutoSizer.vue" "packages/components/src/auto-sizer/__tests__/auto-sizer.test.ts"` 通过。

### test(tuffex): hard-cut Popover tests to BaseAnchor contract

- `packages/tuffex/packages/components/src/popover/__tests__/popover.test.ts`
- `apps/nexus/content/docs/dev/components/popover.en.mdc`
- `docs/plan-prd/TODO.md`
  - Replaced stale Tooltip-stub Popover tests with current BaseAnchor contract coverage for prop forwarding, offset derivation, hover delays, disabled close behavior, full-width reference classes, and side slot props.
  - Fixed `toggleOnReferenceClick` default handling so an omitted prop stays `undefined` and the click/hover trigger-based default is applied correctly.
  - Hard-cut the English Popover docs away from the retired `TxTooltip` wrapper description and updated event descriptions to the current state-change contract.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/popover/__tests__/popover.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/popover/src/TxPopover.vue" "packages/components/src/popover/__tests__/popover.test.ts"` 通过。

### test(tuffex): add EmptyState contract coverage

- `packages/tuffex/packages/components/src/empty-state/src/TxEmptyState.vue`
- `packages/tuffex/packages/components/src/empty-state/__tests__/empty-state.test.ts`
- `apps/nexus/content/docs/dev/components/empty-state.en.mdc`
- `docs/plan-prd/TODO.md`
  - Fixed `TxEmptyState` `icon=null` handling so it explicitly suppresses preset illustrations instead of falling back to the variant default.
  - Added focused EmptyState coverage for preset copy and illustrations, explicit title/description overrides, slot replacement, generated action emits and disabled blocking, loading spinner priority, and `icon=null` icon suppression.
  - Replaced generated English EmptyState API, EmptyStateAction, slot, and event placeholders with current real feedback-state contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/empty-state/__tests__/empty-state.test.ts" "packages/components/src/empty-state/__tests__/empty-state-wrappers.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/empty-state/src/TxEmptyState.vue" "packages/components/src/empty-state/__tests__/empty-state.test.ts" "packages/components/src/empty-state/__tests__/empty-state-wrappers.test.ts"` 通过。

### test(tuffex): add DatePicker contract coverage

- `packages/tuffex/packages/components/src/date-picker/__tests__/date-picker.test.ts`
- `apps/nexus/content/docs/dev/components/date-picker.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused DatePicker coverage for `YYYY-MM-DD` model normalization, min/max clamping, disabled month/day options, TxPicker prop forwarding, formatted confirm output, visibility updates, and cancel/open/close forwarding.
  - Replaced generated English DatePicker API and event placeholders with current real picker wrapper contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/date-picker/__tests__/date-picker.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/date-picker/src/TxDatePicker.vue" "packages/components/src/date-picker/__tests__/date-picker.test.ts"` 通过。

### test(tuffex): add TabBar contract coverage

- `packages/tuffex/packages/components/src/tab-bar/__tests__/tab-bar.test.ts`
- `apps/nexus/content/docs/dev/components/tab-bar.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused TabBar coverage for tablist/tab ARIA state, active item rendering, icon and badge output, fixed and safe-area layout classes, z-index CSS variable, enabled selection events, and bar/item disabled blocking.
  - Replaced generated English TabBar API, TabBarItem, and event placeholders with current real bottom-navigation contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/tab-bar/__tests__/tab-bar.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/tab-bar/src/TxTabBar.vue" "packages/components/src/tab-bar/__tests__/tab-bar.test.ts"` 通过。

### test(tuffex): add Transition contract coverage

- `packages/tuffex/packages/components/src/transition/__tests__/transition.test.ts`
- `apps/nexus/content/docs/dev/components/transition.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused Transition coverage for preset-to-name mapping, TransitionGroup tag forwarding, smooth-size delegation through AutoSizer, class/style/attrs forwarding boundaries, and semantic wrapper preset behavior.
  - Replaced generated English Transition API placeholders with current real motion wrapper contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/transition/__tests__/transition.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/transition/src/TxTransition.vue" "packages/components/src/transition/src/TxTransitionSmoothSize.vue" "packages/components/src/transition/__tests__/transition.test.ts"` 通过。

### test(tuffex): add SortableList contract coverage

- `packages/tuffex/packages/components/src/sortable-list/__tests__/sortable-list.test.ts`
- `apps/nexus/content/docs/dev/components/sortable-list.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused SortableList coverage for list/listitem semantics, item slot props, default id fallback, drag/drop reorder emits, same-item no-op, disabled blocking, handle-only drag start, and dragend cleanup.
  - Replaced generated English SortableList API placeholders with the current real drag-and-drop contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/sortable-list/__tests__/sortable-list.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/sortable-list/src/TxSortableList.vue" "packages/components/src/sortable-list/__tests__/sortable-list.test.ts"` 通过。

### test(tuffex): add StatCard contract coverage

- `packages/tuffex/packages/components/src/stat-card/__tests__/stat-card.test.ts`
- `apps/nexus/content/docs/dev/components/stat-card.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused StatCard coverage for default metric rendering, custom value/label slots, percent and delta insights, progress ring clamping, numeric progress fallback, and custom progress meta slot.
  - Replaced generated English StatCard API placeholders with the current real metric and label contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/stat-card/__tests__/stat-card.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/stat-card/src/TxStatCard.vue" "packages/components/src/stat-card/__tests__/stat-card.test.ts"` 通过。

### test(tuffex): add Splitter contract coverage

- `packages/tuffex/packages/components/src/splitter/__tests__/splitter.test.ts`
- `apps/nexus/content/docs/dev/components/splitter.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused Splitter coverage for horizontal/vertical pane rendering and separator ARIA, ratio and bar-size CSS variables, pointer drag clamp/snap behavior, keyboard resizing, disabled blocking, and ending active drag when disabled.
  - Replaced generated English Splitter API placeholders with the current real ratio, slot, and event contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/splitter/__tests__/splitter.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/splitter/src/TxSplitter.vue" "packages/components/src/splitter/__tests__/splitter.test.ts"` 通过。

### test(tuffex): add GlowText contract coverage

- `packages/tuffex/packages/components/src/glow-text/__tests__/glow-text.test.ts`
- `apps/nexus/content/docs/dev/components/glow-text.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused GlowText coverage for default adaptive shine rendering, custom root tag and CSS variable mapping, inactive and one-shot classes, text-clip mirrored text, and mode-switch cleanup.
  - Replaced generated English GlowText API placeholders with the current real prop and mode contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/glow-text/__tests__/glow-text.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/glow-text/src/TxGlowText.vue" "packages/components/src/glow-text/__tests__/glow-text.test.ts"` 通过。

### fix(tuffex): repair SegmentedSlider vertical layout and add contract coverage

- `packages/tuffex/packages/components/src/segmented-slider/src/TxSegmentedSlider.vue`
- `packages/tuffex/packages/components/src/segmented-slider/__tests__/segmented-slider.test.ts`
- `apps/nexus/content/docs/dev/components/segmented-slider.en.mdc`
- `docs/plan-prd/TODO.md`
  - Fixed vertical SegmentedSlider layout by writing concrete `height` progress and `bottom` segment position styles instead of relying on unset `--height` / `--bottom` variables.
  - Added focused SegmentedSlider coverage for horizontal/vertical progress and positions, click and keyboard selection, disabled blocking, label visibility, and null initial value auto-selection.
  - Replaced generated English SegmentedSlider API placeholders with the current real segment and event contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/segmented-slider/__tests__/segmented-slider.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/segmented-slider/src/TxSegmentedSlider.vue" "packages/components/src/segmented-slider/__tests__/segmented-slider.test.ts"` 通过。

### test(tuffex): add DropdownMenu contract coverage

- `packages/tuffex/packages/components/src/dropdown-menu/__tests__/dropdown-menu.test.ts`
- `apps/nexus/content/docs/dev/components/dropdown-menu.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused DropdownMenu coverage for trigger/menu rendering, Popover prop forwarding, open/close model events, enabled item select/close behavior, `closeOnSelect=false`, and disabled item blocking.
  - Replaced generated English DropdownMenu API placeholders with the current real menu and item contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/dropdown-menu/__tests__/dropdown-menu.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/dropdown-menu/src/TxDropdownMenu.vue" "packages/components/src/dropdown-menu/src/TxDropdownItem.vue" "packages/components/src/dropdown-menu/__tests__/dropdown-menu.test.ts"` 通过。

## 2026-05-06

### feat(core-app/nexus): 更新检查统一走 Nexus 与 updates 信息架构调整

- `apps/core-app/src/main/modules/update/UpdateService.ts`
- `apps/nexus/app/pages/updates.vue`
  - UpdateService 默认 source 从 GitHub Releases 切换为 Nexus Official（`getTuffBaseUrl()`），且官方源检查失败时不再回落到 GitHub，后续版本监测统一请求 Nexus。
  - Nexus `updates` 页面将版本 channel 选择上移至要闻区之前；要闻区新增“更新 / 公告”tabs，公告改为单独分栏展示，并统一使用 `TxButton` 交互样式保持按钮规范一致。

### test(tuffex): add ContextMenu contract coverage

- `packages/tuffex/packages/components/src/context-menu/__tests__/context-menu.test.ts`
- `apps/nexus/content/docs/dev/components/context-menu.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused ContextMenu coverage for controlled and uncontrolled opening, right-click coordinates, controlled `x/y` payloads, panel width, Escape closing behavior, disabled Escape behavior, enabled item select/close, and disabled item blocking.
  - Replaced generated English ContextMenu API placeholders with the current real menu and item contracts.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/context-menu/__tests__/context-menu.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/context-menu/src/TxContextMenu.vue" "packages/components/src/context-menu/src/TxContextMenuItem.vue" "packages/components/src/context-menu/__tests__/context-menu.test.ts"` 通过。

### test(tuffex): add OutlineBorder contract coverage

- `packages/tuffex/packages/components/src/outline-border/__tests__/outline-border.test.ts`
- `apps/nexus/content/docs/dev/components/outline-border.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused OutlineBorder coverage for root element/slot rendering, border/ring/ring-offset/ring-inset visual styles, numeric unit normalization, default overflow clipping, clip-path hexagon clipping, mask clipping, and disabled clipping.
  - Replaced generated English OutlineBorder API placeholders with the current real prop contract.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/outline-border/__tests__/outline-border.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/outline-border/src/TxOutlineBorder.vue" "packages/components/src/outline-border/__tests__/outline-border.test.ts"` 通过。

### test(tuffex): add Stagger contract coverage

- `packages/tuffex/packages/components/src/stagger/__tests__/stagger.test.ts`
- `apps/nexus/content/docs/dev/components/stagger.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused Stagger coverage for TransitionGroup root tag rendering, timing CSS variables, transition name/appear forwarding, child index variables, and comment-node filtering.
  - Replaced generated English Stagger API placeholders with the current real prop contract.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/stagger/__tests__/stagger.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/stagger/src/TxStagger.vue" "packages/components/src/stagger/__tests__/stagger.test.ts"` 通过。

### test(tuffex): add CornerOverlay contract coverage

- `packages/tuffex/packages/components/src/corner-overlay/__tests__/corner-overlay.test.ts`
- `apps/nexus/content/docs/dev/components/corner-overlay.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused CornerOverlay coverage for default content rendering, optional overlay slot rendering, aria-hidden overlay layer, all four placement styles, numeric offset normalization, string offset passthrough, and `overlayPointerEvents`.
  - Replaced generated English CornerOverlay wording with the current real prop and slot contract.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/corner-overlay/__tests__/corner-overlay.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/corner-overlay/src/TxCornerOverlay.vue" "packages/components/src/corner-overlay/__tests__/corner-overlay.test.ts"` 通过。

### test(tuffex): add GradientBorder contract coverage

- `packages/tuffex/packages/components/src/gradient-border/__tests__/gradient-border.test.ts`
- `apps/nexus/content/docs/dev/components/gradient-border.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused GradientBorder coverage for default/custom root elements, slot wrapping, numeric-to-px CSS variable normalization, duration seconds, and string CSS unit passthrough.
  - Replaced generated English GradientBorder API placeholders with the current real prop contract.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/gradient-border/__tests__/gradient-border.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/gradient-border/src/TxGradientBorder.vue" "packages/components/src/gradient-border/__tests__/gradient-border.test.ts"` 通过。

### test(tuffex): add NavBar contract coverage

- `packages/tuffex/packages/components/src/nav-bar/__tests__/nav-bar.test.ts`
- `apps/nexus/content/docs/dev/components/nav-bar.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused NavBar component coverage for title rendering, safe-area spacer, z-index CSS variable, fixed/disabled classes, built-in back button events, custom left/title/right slots, and disabled event suppression.
  - Replaced generated English NavBar API placeholders with the current real prop, slot, and event contract.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/nav-bar/__tests__/nav-bar.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/nav-bar/src/TxNavBar.vue" "packages/components/src/nav-bar/__tests__/nav-bar.test.ts"` 通过。

### test(core-app): restore clipboard and OmniPanel transport regressions

- `apps/core-app/src/main/modules/clipboard.transport.test.ts`
- `apps/core-app/src/main/modules/omni-panel/index.test.ts`
- `docs/plan-prd/TODO.md`
  - Clipboard image transport tests now match the current payload contract: list `value` remains the thumbnail, while the original tfile URL is exposed via `meta.image_original_url`; paths outside the clipboard image base no longer assert a synthetic original URL.
  - OmniPanel shortcut-hold regression now covers the current trigger contract: a long-active combo invokes the shortcut path and resets `shortcutTriggerArmed`; the TouchWindow mock includes the BrowserWindow methods used by `ensureWindow()`.
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/clipboard.transport.test.ts"` 通过（`1 file / 4 tests`）；`pnpm -C "apps/core-app" exec eslint "src/main/modules/clipboard.transport.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/omni-panel/index.test.ts"` 通过（`1 file / 18 tests`）；`pnpm -C "apps/core-app" exec eslint "src/main/modules/omni-panel/index.test.ts"` 通过。

### docs(nexus): hard-cut transport migration example

- `apps/nexus/content/docs/dev/api/transport.en.mdc`
- `apps/nexus/content/docs/dev/api/transport.zh.mdc`
- `docs/plan-prd/TODO.md`
  - Transport API migration docs no longer present Channel and TuffTransport as simultaneously usable paths for new plugin code.
  - The migration example now shows a direct hard-cut from string-based Channel sends to typed TuffTransport events, removing the `Legacy (still works)` / `传统方式（仍然有效）` sample.
  - 验证：`rg -n "still works|仍可|仍然可用|继续可用|Legacy \\(still works\\)|旧.*可用|compatibility path|backward compatibility" "apps/nexus/content/docs/dev/api"` 无命中。

### ref(nexus): hard-cut locale-prefixed route rewrite

- `apps/nexus/app/app.vue`
- `docs/plan-prd/TODO.md`
  - Removed the client-side watcher that silently rewrote `/en/*` and `/zh/*` paths to non-prefixed routes.
  - Nexus locale selection remains profile / cookie / browser / manual driven; route prefixes no longer act as a second locale source or compatibility redirect path.
  - 验证：`rg -n "旧的语言前缀|移除语言前缀|/en/\\*|/zh/\\*" "apps/nexus/app/app.vue"` 无命中；`pnpm -C "apps/nexus" run typecheck` 通过。

### ref(nexus): retire auth sign-in-token alias

- `apps/nexus/server/api/app-auth/sign-in-token.post.ts`
- `apps/nexus/server/api/auth/sign-in-token.post.ts`
- `apps/nexus/server/utils/appAuthToken.ts`
- `apps/nexus/server/api/app-auth/__tests__/sign-in-token.post.test.ts`
- `apps/nexus/server/api/auth/__tests__/sign-in-token-retired.test.ts`
- `docs/plan-prd/TODO.md`
  - Desktop app sign-in token issuance now has `/api/app-auth/sign-in-token` as the canonical route; the shared issuance logic lives in `server/utils/appAuthToken.ts`.
  - The old `/api/auth/sign-in-token` route no longer forwards to the app-auth handler. It returns `410 AUTH_SIGN_IN_TOKEN_RETIRED` with `/api/app-auth/sign-in-token` as the replacement path.
  - 验证：`pnpm -C "apps/nexus" exec vitest run "server/api/app-auth/__tests__/sign-in-token.post.test.ts" "server/api/auth/__tests__/sign-in-token-retired.test.ts"` 通过（`2 files / 3 tests`）；`pnpm -C "apps/nexus" run typecheck` 通过。

### chore(governance): clear Nexus team context fixture wording

- `apps/nexus/server/utils/__tests__/team-context.test.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `scripts/legacy-boundary-allowlist.json`
- `docs/plan-prd/TODO.md`
  - Organization team fixture naming now uses `Standalone Org` instead of legacy wording while preserving the assertion that an organization owner can disband the team even without a collaboration plan.
  - Removed the stale `legacy-keyword` allowlist and compatibility registry entries for `team-context.test.ts`.
  - 验证：`pnpm -C "apps/nexus" exec vitest run "server/utils/__tests__/team-context.test.ts"` 通过（`1 file / 5 tests`）；`node "scripts/check-legacy-boundaries.mjs"` 与 `pnpm compat:registry:guard` 通过。

### chore(governance): clear Utils system SDK fixture wording

- `packages/utils/__tests__/system-sdk.test.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `scripts/legacy-boundary-allowlist.json`
- `docs/plan-prd/TODO.md`
  - The system SDK failure regression still asserts that typed transport errors propagate and do not fall back to raw channel sends, but the test title now uses `retired raw channel` wording.
  - Removed the stale `legacy-keyword` allowlist and compatibility registry entries for `system-sdk.test.ts`.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/system-sdk.test.ts"` 通过（`1 file / 3 tests`）；`node "scripts/check-legacy-boundaries.mjs"` 与 `pnpm compat:registry:guard` 通过。

### chore(governance): clear plugin install queue sdkapi fixture wording

- `apps/core-app/src/main/modules/plugin/install-queue.test.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `scripts/legacy-boundary-allowlist.json`
- `docs/plan-prd/TODO.md`
  - The below-floor sdkapi fixture now uses `touch-below-floor` instead of legacy wording while preserving the assertion that installation fails before finalize when `sdkapi >= 251212` is not declared.
  - Removed the stale `legacy-keyword` allowlist and compatibility registry entries for `install-queue.test.ts`.
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/plugin/install-queue.test.ts"` 通过；`node "scripts/check-legacy-boundaries.mjs"` 与 `pnpm compat:registry:guard` 通过。

### chore(governance): clear app provider keyword sync fixture wording

- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.test.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `scripts/legacy-boundary-allowlist.json`
- `docs/plan-prd/TODO.md`
  - The app keyword sync steady-state regression now uses `retired app item ids` wording while preserving the assertion that `removeItems()` is not called during normal keyword sync.
  - Removed the stale `legacy-keyword` allowlist and compatibility registry entries for `app-provider.test.ts`.
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/apps/app-provider.test.ts" -t "does not keep removing retired app item ids during steady-state keyword sync"` 通过；`node "scripts/check-legacy-boundaries.mjs"` 与 `pnpm compat:registry:guard` 通过。

### chore(governance): clear storage subscription fixture wording

- `packages/test/src/common/storage-subscription.test.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `scripts/legacy-boundary-allowlist.json`
- `docs/plan-prd/TODO.md`
  - The storage subscription boundary regression now uses `retired channel` wording while preserving the assertion that typed storage transport is preferred and old channel snapshots are not used.
  - Removed the stale `legacy-keyword` allowlist and compatibility registry entries for `storage-subscription.test.ts`.
  - 验证：`pnpm -C "packages/test" exec vitest run "src/common/storage-subscription.test.ts"` 通过（`1 file / 1 test`）；`node "scripts/check-legacy-boundaries.mjs"` 与 `pnpm compat:registry:guard` 通过。

### ref(utils): hard-cut preset export version validation

- `packages/utils/common/storage/entity/preset-export-types.ts`
- `packages/utils/__tests__/preset-export-types.test.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `scripts/legacy-boundary-allowlist.json`
- `docs/plan-prd/TODO.md`
  - `validatePresetData()` now accepts only the current `PRESET_EXPORT_VERSION=2`; older v1 preset payloads and future unknown versions fail validation instead of being accepted or downgraded to warnings.
  - The preset export regression now asserts v1 payload rejection and no longer carries legacy wording; related allowlist and compatibility registry rows were removed.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/preset-export-types.test.ts"` 通过（`1 file / 3 tests`）；`node "scripts/check-legacy-boundaries.mjs"` 与 `pnpm compat:registry:guard` 通过。

### chore(governance): clear storage boundary and cli shim wording noise

- `apps/core-app/src/renderer/src/modules/storage/app-storage-boundary.test.ts`
- `packages/unplugin-export-plugin/src/__tests__/cli-shim.test.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `scripts/legacy-boundary-allowlist.json`
- `docs/plan-prd/TODO.md`
  - Renderer storage boundary regression now uses `retired` naming while preserving the assertion that old storage channel imports remain restricted to bootstrap shim files.
  - Unplugin CLI shim regression now uses `retired cli shim` wording while preserving the deprecated wrapper forwarding assertion; the compat-file registry row remains until the 2.5.0 shim removal window.
  - Removed the stale `legacy-keyword` allowlist and compatibility registry rows for both tests.

### chore(aiapp): clear route/model admin retired option wording

- `retired-ai-app/app/pages/admin/system/route-combos.vue`
- `retired-ai-app/app/pages/admin/system/model-groups.vue`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `scripts/legacy-boundary-allowlist.json`
- `docs/plan-prd/TODO.md`
  - Disabled placeholder options for persisted-but-disabled or missing provider models now use `retiredStatus` naming while preserving the existing labels and disabled selection behavior.
  - Removed the stale `legacy-keyword` allowlist and compatibility registry rows for both AI admin pages.

### chore(core-app): clear PermissionStore sqlite fixture wording noise

- `apps/core-app/src/main/modules/permission/permission-store.test.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `scripts/legacy-boundary-allowlist.json`
- `docs/plan-prd/TODO.md`
  - PermissionStore SQLite backend regression now uses `retired` JSON fixture naming while preserving assertions that SQLite initialization does not import old JSON snapshots and backend-unavailable mode does not revive JSON fallback writes.
  - Removed the stale `legacy-keyword` allowlist and compatibility registry row for the test file; the production read-once migration exception remains tracked separately for `permission-store.ts`.

### ref(utils): hard-cut plugin channel sendSync

- `packages/utils/plugin/channel.ts`
- `packages/utils/transport/prelude.ts`
- `packages/utils/__tests__/plugin-channel-send-sync-hard-cut.test.ts`
- `docs/plan-prd/TODO.md`
  - Plugin channel `sendSync` no longer calls `ipcRenderer.sendSync('@plugin-process-message', ...)`; the retained method surface now throws `plugin_channel_send_sync_removed` with a typed transport migration message.
  - Generated plugin preludes also block `sendSync` directly and no longer contain a physical synchronous IPC call.
  - Added a regression test that fixes the generated prelude contract.

### feat(tuffex): strengthen Radio keyboard contract

- `packages/tuffex/packages/components/src/radio/src/TxRadioGroup.vue`
- `packages/tuffex/packages/components/src/radio/__tests__/radio.test.ts`
- `apps/nexus/content/docs/dev/components/radio.en.mdc`
- `apps/nexus/content/docs/dev/components/radio.zh.mdc`
- `packages/tuffex/docs/components/radio.md`
- `docs/plan-prd/TODO.md`
  - `TxRadioGroup` now handles ArrowLeft/ArrowUp/ArrowRight/ArrowDown plus Home/End at the radiogroup level, skips disabled radio items, and respects disabled group state.
  - Added component tests for ARIA state, keyboard selection, disabled item skipping, Home/End, and disabled group behavior.
  - Nexus and Tuffex Radio component docs now state the keyboard contract.

### docs(nexus): clear Radio component API placeholders

- `apps/nexus/content/docs/dev/components/radio.en.mdc`
- `packages/tuffex/packages/components/src/radio/__tests__/radio.test.ts`
- `docs/plan-prd/TODO.md`
  - Replaced generated Radio API placeholders with the current group/item contract: selected value, disabled group blocking, type/direction resolution, indicator variant shortcuts, `updateOnSettled`, spring/blur motion props, keyboard navigation, and child radio selection events.
  - Reused existing focused Radio component coverage for radiogroup semantics, selected state, Arrow/Home/End keyboard selection, disabled item skip, and disabled group behavior.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/radio/__tests__/radio.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/radio/src/TxRadioGroup.vue" "packages/components/src/radio/src/TxRadio.vue" "packages/components/src/radio/__tests__/radio.test.ts"` 通过。

### docs(nexus): complete FlatRadio multi-select docs contract

- `apps/nexus/content/docs/dev/components/flat-radio.en.mdc`
- `packages/tuffex/packages/components/src/flat-radio/__tests__/flat-radio.test.ts`
- `docs/plan-prd/TODO.md`
  - Completed the FlatRadio API docs for the current implementation: `multiple`, single vs array model payloads, disabled group/item behavior, item slot/icon fallbacks, and Enter/Space toggling for the focused item in multiple mode.
  - Reused existing focused FlatRadio component coverage for single/multiple ARIA semantics, disabled item skip, Home/End, disabled group blocking, and multi-select keyboard toggles.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/flat-radio/__tests__/flat-radio.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/flat-radio/src/TxFlatRadio.vue" "packages/components/src/flat-radio/src/TxFlatRadioItem.vue" "packages/components/src/flat-radio/__tests__/flat-radio.test.ts"` 通过。

### docs(nexus): clear SearchSelect placeholders and retired overlay wording

- `apps/nexus/content/docs/dev/components/search-select.en.mdc`
- `packages/tuffex/packages/components/src/search-select/__tests__/search-select.test.ts`
- `docs/plan-prd/TODO.md`
  - Replaced generated SearchSelect API placeholders with the current searchable-select contract: selected value, local filtering, remote debounced search, disabled option blocking, loading suffix, dropdown sizing, Popover panel styling, and open/close lifecycle events.
  - Hard-cut the stale public wording that described the dropdown as a `TxPopover -> TxTooltip -> TxBaseAnchor` chain; the page now documents the supported `TxPopover` surface.
  - Reused existing focused SearchSelect component coverage for local filtering and selection, remote debounce search, and empty result rendering.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/search-select/__tests__/search-select.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/search-select/src/TxSearchSelect.vue" "packages/components/src/search-select/__tests__/search-select.test.ts"` 通过。

### docs(nexus): clear TreeSelect component API placeholders

- `apps/nexus/content/docs/dev/components/tree-select.en.mdc`
- `packages/tuffex/packages/components/src/tree-select/__tests__/tree-select.test.ts`
- `docs/plan-prd/TODO.md`
  - Replaced generated TreeSelect docs placeholders with the current combobox/tree contract: single and multiple model values, searchable tree filtering, clear semantics, Popover dropdown sizing/placement, node slot props, exposed methods, and `TreeSelectNode` fields.
  - Reused existing focused TreeSelect component coverage for tree selection, empty-state rendering, and clear button behavior.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/tree-select/__tests__/tree-select.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/tree-select/src/TxTreeSelect.vue" "packages/components/src/tree-select/__tests__/tree-select.test.ts"` 通过。

### test(tuffex): add Picker contract coverage

- `packages/tuffex/packages/components/src/picker/__tests__/picker.test.ts`
- `apps/nexus/content/docs/dev/components/picker.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added focused Picker coverage for value normalization to the first enabled option, toolbar confirm/cancel lifecycle, disabled toolbar/item state, and itemHeight/visibleItemCount CSS variable normalization.
  - Replaced generated English Picker API placeholders with the current column picker contract for popup/inline rendering, toolbar actions, disabled options, normalized values, and events.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/picker/__tests__/picker.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/picker/src/TxPicker.vue" "packages/components/src/picker/__tests__/picker.test.ts"` 通过。

### test(tuffex): add Select contract coverage and cut slot fallback warning

- `packages/tuffex/packages/components/src/select/src/TxSelect.vue`
- `packages/tuffex/packages/components/src/select/__tests__/select.test.ts`
- `apps/nexus/content/docs/dev/components/select.en.mdc`
- `docs/plan-prd/TODO.md`
  - Removed the setup-time default slot label fallback from `TxSelect`; selected labels now come from `TxSelectItem` registration, avoiding Vue slot dependency tracking warnings.
  - Added focused Select coverage for enabled option selection, disabled option blocking, local searchable filtering, and remote editable `search` events.
  - Replaced generated English Select API placeholders with the current Popover-backed select contract, including eager mounting, panel surface props, local/remote search modes, disabled options, and item props.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/select/__tests__/select.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/select/src/TxSelect.vue" "packages/components/src/select/src/TxSelectItem.vue" "packages/components/src/select/__tests__/select.test.ts"` 通过。

### docs(nexus): clear Agents component API placeholders

- `apps/nexus/content/docs/dev/components/agents.en.mdc`
- `packages/tuffex/packages/components/src/agents/__tests__/agents.test.ts`
- `docs/plan-prd/TODO.md`
  - Replaced generated Agents API placeholders with the current list contract: enabled/disabled grouping, loading skeletons, configurable empty text, selected state, disabled selection blocking, and badge slot behavior.
  - Reused existing focused Agents component coverage for group titles, empty text, enabled-only selection, and click/Enter/Space activation.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/agents/__tests__/agents.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/agents/src/TxAgentsList.vue" "packages/components/src/agents/src/TxAgentItem.vue" "packages/components/src/agents/__tests__/agents.test.ts"` 通过。

### test(tuffex): lock FlatRadio keyboard contract

- `packages/tuffex/packages/components/src/flat-radio/__tests__/flat-radio.test.ts`
- `packages/tuffex/packages/components/src/flat-radio/src/TxFlatRadio.vue`
- `docs/plan-prd/TODO.md`
  - Added regression coverage for the existing `TxFlatRadio` keyboard contract documented on Nexus: single-select radiogroup ARIA, arrow-key wrapping, disabled item skipping, Home/End selection, disabled group behavior, and Enter/Space toggling in multiple mode.
  - `TxFlatRadio` now guards `ResizeObserver` usage so non-browser/test runtimes without the API still mount cleanly and keep keyboard selection usable.

### test(tuffex): lock SearchInput behavior and docs contract

- `packages/tuffex/packages/components/src/search-input/__tests__/search-input.test.ts`
- `apps/nexus/content/docs/dev/components/search-input.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added SearchInput regression coverage for input updates, Enter-triggered search, remote debounce, disabled remote search blocking, clear forwarding, and exposed value helpers.
  - Nexus English SearchInput API docs now use concrete prop/event/expose descriptions instead of generated `Description for ...` placeholders.

### test(tuffex): lock Empty wrapper contract and docs wording

- `packages/tuffex/packages/components/src/empty/__tests__/empty.test.ts`
- `apps/nexus/content/docs/dev/components/empty.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added Empty wrapper regression coverage for the forwarded `EmptyState` variant/surface/layout contract, compact sizing, icon/title/description props, and icon/title/description/action slot mapping.
  - Nexus English Empty docs now describe real usage and props instead of generated `Description for ...` placeholders.

### test(tuffex): lock LoadingOverlay behavior and docs wording

- `packages/tuffex/packages/components/src/loading-overlay/__tests__/loading-overlay.test.ts`
- `apps/nexus/content/docs/dev/components/loading-overlay.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added LoadingOverlay regression coverage for in-container overlays, closed state, fullscreen teleport rendering, and spinner/text/background prop forwarding.
  - Nexus English LoadingOverlay docs now describe real usage and props instead of generated `Description for ...` placeholders.

### test(tuffex): lock Spinner behavior and docs wording

- `packages/tuffex/packages/components/src/spinner/__tests__/spinner.test.ts`
- `apps/nexus/content/docs/dev/components/spinner.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added Spinner regression coverage for accessibility attributes, CSS variable sizing, SVG fallback rendering, and `visible=false` non-rendering.
  - Nexus English Spinner docs now describe real usage and props instead of generated `Description for ...` placeholders.

### test(tuffex): lock Stack layout variables and docs wording

- `packages/tuffex/packages/components/src/stack/__tests__/stack.test.ts`
- `apps/nexus/content/docs/dev/components/stack.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added Stack regression coverage for default and horizontal CSS variable mapping, numeric gap normalization, and slot rendering.
  - Nexus English Stack docs now describe real usage and no longer keep generated placeholder text for `wrap` / `inline`.

### test(tuffex): lock Flex layout variables and docs wording

- `packages/tuffex/packages/components/src/flex/__tests__/flex.test.ts`
- `apps/nexus/content/docs/dev/components/flex.en.mdc`
- `docs/plan-prd/TODO.md`
  - Added Flex regression coverage for default and custom CSS variable mapping, numeric gap normalization, and slot rendering.
  - Nexus English Flex docs now describe real usage and no longer keep generated placeholder text for `inline`.

### fix(tuffex): make GridLayout variables reactive and document contract

- `packages/tuffex/packages/components/src/grid-layout/src/TxGridLayout.vue`
- `packages/tuffex/packages/components/src/grid-layout/__tests__/grid-layout.test.ts`
- `apps/nexus/content/docs/dev/components/grid-layout.en.mdc`
- `docs/plan-prd/TODO.md`
  - `TxGridLayout` root CSS variables now derive from a computed style object so `gap`, `minItemWidth`, and `maxColumns` prop updates are reflected after mount.
  - Added GridLayout regression coverage for default CSS variables, prop updates, hover spotlight variables, and `interactive=false` blocking.
  - Nexus English GridLayout docs now describe real usage and props instead of `hover` / generated placeholder text.

### docs(tuffex): hard-cut Container grid docs to real props

- `packages/tuffex/packages/components/src/container/__tests__/container.test.ts`
- `apps/nexus/content/docs/dev/components/container.en.mdc`
- `apps/nexus/content/docs/dev/components/container.zh.mdc`
- `docs/plan-prd/TODO.md`
  - Added Container/Row/Col regression coverage for container CSS variables and classes, row gutter/alignment/justification/wrap styles, responsive gutter resolution, and responsive column span/offset styles.
  - Nexus Container docs now match the real implementation: `push`, `pull`, `xxl`, object-valued column breakpoints, stale Bootstrap-style breakpoints, and non-existent CSS variables were removed from both English and Chinese docs.

### chore(governance): clear retired-entry test wording noise

- `apps/core-app/src/main/channel/common.test.ts`
- `apps/core-app/src/main/modules/clipboard.transport.test.ts`
- `apps/core-app/src/main/modules/omni-panel/index.test.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.test.ts`
- `apps/core-app/src/shared/update/channel.test.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `scripts/legacy-boundary-allowlist.json`
- `docs/plan-prd/TODO.md`
  - Test descriptions and local constants that assert retired raw handlers are not registered now use `retired` wording instead of `legacy`; sdkapi floor fixture wording now uses `below-floor sdk plugin`.
  - Removed 5 stale `legacy-keyword` allowlist / compatibility registry rows; `legacy-keyword` dropped to `53 files / 167 hits`.
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/channel/common.test.ts" "src/main/modules/plugin/plugin-loaders.test.ts" "src/shared/update/channel.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/clipboard.transport.test.ts" -t "只注册 typed clipboard transport handlers"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/omni-panel/index.test.ts" -t "does not register retired feature toggle handler"` 通过；`pnpm -C "apps/core-app" exec eslint "src/main/channel/common.test.ts" "src/main/modules/clipboard.transport.test.ts" "src/main/modules/omni-panel/index.test.ts" "src/main/modules/plugin/plugin-loaders.test.ts" "src/shared/update/channel.test.ts"` 通过；`node "scripts/check-legacy-boundaries.mjs"` 与 `pnpm compat:registry:guard` 通过。
  - 已知无关阻塞：`clipboard.transport.test.ts` 全文件仍有 3 个图片 URL 期望与当前 `toClientItem()` thumbnail 行为不一致；`omni-panel/index.test.ts` 全文件仍有窗口 mock 缺少 `setVisibleOnAllWorkspaces` 导致的 shortcut 用例失败。本次仅验证改名触达的 retired handler 断言。

### chore(governance): clear DivisionBox actor fixture legacy noise

- `apps/core-app/src/main/modules/division-box/ipc.actor.test.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `scripts/legacy-boundary-allowlist.json`
- `docs/plan-prd/TODO.md`
  - DivisionBox actor regression still verifies that `actorPluginId=corebox` does not infer permissions from the unrelated `pluginId` payload field, but the fixture value now uses neutral `ignored-plugin-field` wording.
  - Removed the stale `legacy-keyword` allowlist and compatibility registry entries for `ipc.actor.test.ts`; `legacy-keyword` dropped to `58 files / 172 hits`.
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/division-box/ipc.actor.test.ts"` 通过（`1 file / 4 tests`）；`pnpm -C "apps/core-app" exec eslint "src/main/modules/division-box/ipc.actor.test.ts"` 通过；`node "scripts/check-legacy-boundaries.mjs"` 与 `pnpm compat:registry:guard` 通过。

### fix(core-app): hard-cut workflow step normalization

- `apps/core-app/src/main/modules/ai/intelligence-workflow-service.ts`
- `apps/core-app/src/main/modules/ai/intelligence-workflow-service.test.ts`
- `docs/plan-prd/TODO.md`
  - `IntelligenceWorkflowService` now accepts only `prompt/tool/agent` workflow step kinds; unsupported values fail fast instead of being silently coerced to prompt.
  - Workflow-level and tool-step `toolSource` now accept only `builtin/mcp`; unsupported values fail fast. Prompt and agent steps strip tool-only fields during normalization so stale tool metadata cannot leak into persisted workflow definitions.
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/ai/intelligence-workflow-service.test.ts"` 通过（`1 file / 3 tests`）；`pnpm -C "apps/core-app" exec eslint "src/main/modules/ai/intelligence-workflow-service.ts" "src/main/modules/ai/intelligence-workflow-service.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过。

### fix(core-app): strengthen workflow editor mixed-step contract

- `apps/core-app/src/renderer/src/modules/hooks/useWorkflowEditor.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useWorkflowEditor.test.ts`
- `docs/plan-prd/TODO.md`
  - Existing workflow definitions with agent steps missing `agentId` now map back to the editor draft as `builtin.workflow-agent`, matching new-step creation and save-time normalization.
  - Prompt/tool mixed workflow save coverage now asserts prompt steps keep prompt/input without agent fallback, while tool steps keep `toolId/toolSource/input` and do not inherit the workflow agent default.
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/renderer/src/modules/hooks/useWorkflowEditor.test.ts"` 通过（`1 file / 4 tests`）；`pnpm -C "apps/core-app" exec eslint "src/renderer/src/modules/hooks/useWorkflowEditor.ts" "src/renderer/src/modules/hooks/useWorkflowEditor.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:web` 通过。

### docs(nexus): hard-cut public IPC API wording

- `apps/nexus/content/docs/dev/api/transport.{en,zh}.mdc`
- `apps/nexus/content/docs/dev/api/transport-internals.{en,zh}.mdc`
- `apps/nexus/content/docs/dev/api/channel.{en,zh}.mdc`
- `apps/nexus/content/docs/dev/api/clipboard.{en,zh}.mdc`
- `docs/plan-prd/TODO.md`
  - Nexus public API docs no longer state that the old Channel API remains functional, works alongside TuffTransport, or is a continued compatibility path for new plugin development.
  - Channel docs are now explicitly framed as historical migration reference; TuffTransport is the supported IPC entry point for current plugins.
  - Clipboard docs no longer tell plugin authors that main-process legacy handlers remain available; historical `clipboard:*` raw channel names are documented only as migration review material, not a supported extension surface.
  - 验证：`rg -n "old API remains functional|continues to work|still keeps legacy handlers|backward compatibility|Backwards Compat|Full compatibility|Works alongside legacy|旧 API 仍可使用|仍然可用|仍保留 legacy|兼容老调用方|完全兼容|并行工作|传统代码继续工作" "apps/nexus/content/docs/dev/api"` 无命中。

### ref(utils): Plugin Storage SDK 文件操作改用 typed transport

- `packages/utils/plugin/sdk/storage.ts`
- `packages/utils/__tests__/plugin-storage-sdk.test.ts`
- `packages/utils/plugin/sdk/performance.ts`
- `packages/utils/__tests__/plugin-performance-sdk.test.ts`
- `packages/utils/plugin/sdk/sqlite.ts`
- `packages/utils/__tests__/plugin-sqlite-sdk.test.ts`
- `packages/utils/plugin/sdk/box-sdk.ts`
- `packages/utils/__tests__/plugin-box-sdk.test.ts`
- `packages/utils/transport/events/types/core-box.ts`
- `packages/utils/plugin/sdk/core-box.ts`
- `packages/utils/__tests__/plugin-core-box-sdk.test.ts`
- `packages/utils/plugin/sdk/window/index.ts`
- `packages/utils/__tests__/plugin-window-sdk.test.ts`
- `packages/utils/plugin/sdk/service/index.ts`
- `packages/utils/__tests__/plugin-service-sdk.test.ts`
- `packages/utils/plugin/sdk/common.ts`
- `packages/utils/__tests__/plugin-common-sdk.test.ts`
- `packages/utils/plugin/sdk/temp-files.ts`
- `packages/utils/__tests__/plugin-temp-files-sdk.test.ts`
- `apps/core-app/src/main/channel/{common.ts,common.test.ts}`
- `apps/core-app/src/renderer/src/modules/hooks/useSvgContent.ts`
- `packages/utils/renderer/storage/base-storage.ts`
- `packages/utils/renderer/storage/{bootstrap.ts,storage-subscription.ts}`
- `packages/utils/__tests__/renderer-storage-transport.test.ts`
- `apps/core-app/src/main/service/service-center.ts`
- `apps/core-app/src/main/modules/global-shortcon.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `packages/utils/transport/events/{index.ts,types/plugin.ts}`
- `plugins/touch-translation/widgets/translate-panel.vue`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
  - `usePluginStorage()` 的 `getFile/setFile/deleteFile/listFiles/getStats/getTree/getFileDetails/clearAll/openFolder` 统一改为 `createPluginTuffTransport(...).send(PluginEvents.storage.*)`，对外事件名保持 `plugin:storage:*` 不变。
  - `createPerformanceSDK()` 的 `getStorageStats/getMetrics/getPaths` 统一改为 `PluginEvents.storage.getStats` / `PluginEvents.performance.*` typed event，保留既有 `{ data }` 包装响应解包语义。
  - `usePluginSqlite()` 的 `execute/query/transaction` 统一改为 `PluginEvents.sqlite.*` typed event，保留 SQL trim、params 归一化与失败响应抛错语义。
  - `createBoxSDK()` 中已有 shared `CoreBoxEvents` 覆盖的 show/hide/expand/getInput/setInput/clearInput/allowInput/allowClipboard 调用改走 typed event 对象；CoreBox 插件专属的 `hide-input/show-input/set-height/set-position-offset/get-bounds` 已补 shared event 对象并同步切换 SDK 与 main handler，`packages/utils/plugin/sdk/box-sdk.ts` 的 raw channel 命中清零。
  - `clearCoreBoxItems()` 改为 `CoreBoxEvents.item.clear` typed event，`packages/utils/plugin/sdk/core-box.ts` 不再直接发送 `core-box:clear-items`。
  - 新增 `PluginEvents.window.new/visible/property` shared event 对象，保持 `window:new` / `window:visible` / `window:property` 事件名不变；CoreApp main handler 与 plugin window SDK 共用该事件定义。
  - 新增 `PluginEvents.service.register/unregister/handle` shared event 对象，保持 `service:reg` / `service:unreg` / `service:handle` 事件名不变；ServiceCenter 与 plugin service SDK 共用该事件定义。
  - 新增 `PluginEvents.shortcut.register/trigger` 与 `PluginEvents.communicate.index` shared event 对象，保持 `shortcon:*` / `index:communicate` 事件名不变；GlobalShortcon、PluginModule 与 plugin common SDK 共用该事件定义，`sendMessage()` 兼容 wrapper 已改为转发 `PluginEvents.communicate.index`，不再动态发送 `plugin:${message}` raw channel。
  - 新增 `PluginEvents.tempFile.create/delete` shared event 对象，保持 `temp-file:create/delete` 事件名不变；`useTempPluginFiles()` 与 renderer `useSvgContent()` 改用 shared event，CommonChannel 补齐对应 main handler 并返回 `tfile://` URL。
  - Renderer `TouchStorage` 与 `StorageSubscription` 硬切为 `StorageEvents.app.*` transport-only，移除旧 channel 的 `storage:get-versioned/get/save` raw fallback 与 update listener fallback；历史 channel 参数仅保留无副作用入口，避免基础存储继续依赖旧 IPC。
  - 官方 `touch-translation` widget 的历史项回填 CoreBox 输入动作改为 `createPluginTuffTransport(...).send(CoreBoxEvents.input.setQuery)`，不再直接 `channel.send('core-box:set-query')`。
  - `onDidChange()` 暂保留现有 `plugin:storage:update` 订阅桥接，避免在回调语义未专项验证前扩大改动面。
  - `packages/utils/renderer/hooks/use-channel.ts` 的公开注释已收口为 host bootstrap 专用低层 TouchChannel 说明，不再登记 renderer storage warning-only 债务。
  - Nexus 官网 locale 初始化硬切为 profile/cookie/browser/manual 来源，不再读取或清理旧 `?lang=` query 参数；`app.vue` 移除对应路由监听，`useLocaleOrchestrator` 删除 query cleanup 分支。
  - Nexus API key release scope 硬切为精确匹配模型：新 key 不再允许 `release:sync`，授权检查不再让该旧 scope 覆盖 `release:write/assets/publish/news/evidence`。
  - Nexus intelligence provider dot-route 410 回归测试标题改为 deprecated wording，继续保留 hard-cut 断言但不再占用 legacy keyword 清册。
  - Nexus 官网 SDK 入口硬切为 TuffTransport-only：`tuffSdkItems` 删除 `Channel SDK / useChannel()` 首页卡片，全局功能搜索不再映射旧 Channel 文档；API 总索引 quick start 删除 `useChannel()` 初始化，只保留 `useTuffTransport()` 作为 IPC 主入口。
  - Manifest permissions 旧数组格式硬切：`parseManifestPermissions()`、CoreApp plugin manifest 类型与 shared plugin manifest 类型不再接受 `permissions: string[]` 作为 required 权限声明，只支持当前 `{ required, optional }` 结构；旧数组输入会被解析为空权限。
  - Tuffex GroupBlock 旧 `icon/expandFill/shrink` prop 与旧 `tx-group-block-storage-*` localStorage key fallback 已硬切，Slot/Switch/Input/Select 子组件同步只接受 `defaultIcon/activeIcon`，并移除 `group-block/src/types.ts` 清册行；`TxCodeEditor` 已移除 `@codemirror/legacy-modes` direct dependency，TOML/INI 改用本地 stream parser，并通过 `@lezer/common` 版本收敛修复 CodeMirror 高亮崩溃。
  - Intelligence API 调用、能力测试、模型拉取、审计统计、配额与 reloadConfig 从旧两段 `intelligence:*` raw event 硬切为 `intelligence:api:*` typed event；CoreApp main handler、旁路 service、`packages/utils` SDK 与 `packages/tuff-intelligence` SDK 已统一命名口径，运行代码中旧两段 API 字符串清零。
  - CoreApp `tuff-intelligence-runtime` trace replay 已硬切为 v3 seq-only：`queryTrace(fromSeq)` 不再为缺失 `seq` 的 pre-v3 trace 自动合成序号，只返回具备真实 `seq` 的 trace event；新增 trace 仍基于当前最大真实 `seq` 单调递增，并移除对应 legacy registry / allowlist 行。
  - Nexus `/api/sync/pull|push` 退役路由文案与错误码改为 `SYNC_RETIRED_*`，`push` 不再先进入 `requireVerifiedEmail()`，旧同步入口只做无鉴权 410 拒绝。
  - 新增 plugin storage/performance/sqlite/box/core-box/window/service/temp-files/common SDK 定向测试，固定文件操作、诊断操作、performance API、SQLite API、临时文件 API 与已覆盖 Box/CoreBox/Window/Service/Common API 均走 shared event 对象，并从 compatibility registry 移除已清零文件的 `raw-channel-send` 债务行。
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/plugin-common-sdk.test.ts" "__tests__/transport-domain-sdks.test.ts" "__tests__/transport-event-boundary.test.ts"` 通过（`3 files / 25 tests`）；`pnpm -C "packages/utils" exec vitest run "__tests__/plugin-temp-files-sdk.test.ts" "__tests__/transport-domain-sdks.test.ts" "__tests__/transport-event-boundary.test.ts"` 通过（`3 files / 22 tests`）；`pnpm -C "apps/core-app" exec vitest run "src/main/channel/common.test.ts"` 通过（`1 file / 10 tests`）；`pnpm -C "packages/utils" exec vitest run "__tests__/renderer-storage-transport.test.ts"` 通过（`1 file / 3 tests`）；`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/code-editor/__tests__/code-editor.test.ts"` 通过（`1 file / 4 tests`）；`pnpm -C "packages/tuff-intelligence" exec vitest run "src/transport/event/builder.test.ts"` 通过（`1 file / 3 tests`）；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/ai/tuff-intelligence-runtime.test.ts"` 通过（`1 file / 3 tests`）；`pnpm -C "packages/utils" exec vitest run "__tests__/permission-status.test.ts"` 通过（`1 file / 5 tests`）；`pnpm -C "apps/core-app" run typecheck:node` 通过；`pnpm -C "apps/nexus" run typecheck` 通过；`ClipboardEvents.queryMeta` 已从 `clipboard:query` raw event 硬切为 `clipboard:history:query-meta` typed builder；`PollingService` 默认 lane 已从旧 `legacy_serial` 硬切为 `serial`，诊断结构不再暴露旧 lane；插件日志类型已删除 `LogLevelLegacy` 旧 alias，统一只导出 base `LogLevel` / `LogLevelString`；`ModuleBaseContext.runtime` 说明已硬切为显式 runtime context，不再登记旧 global wording；`node scripts/check-legacy-boundaries.mjs` 显示 `raw-channel-send` 降为 `0 files / 0 hits`，`legacy-keyword` 降为 `61 files / 176 hits`。

### ref(core-app): 收敛 Sync payload 迁移标记与兼容门禁噪声

- `apps/core-app/src/main/modules/sync/{index.ts,sync-payload-crypto.ts,sync-payload-crypto.test.ts,sync-payload-wire.test.ts}`
- `apps/core-app/src/main/modules/plugin/plugin-preflight-helper.test.ts`
- `apps/core-app/src/renderer/src/modules/{lang/language-preferences.test.ts,storage/account-storage.test.ts}`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
  - Sync payload 解密结果内部字段从 `legacy` 改为 `requiresMigrationRewrite`，语义明确为“读到 b64 迁移载荷后需要重写为 `enc:v1`”，b64 只读迁移读取能力保持不变。
  - 清理测试标题/fixture 中不必要的 `legacy` 关键词，避免测试文案污染 `legacy-boundary` 与 compatibility registry 统计。
  - Language localStorage snapshot 迁移读取路径已硬切，初始化只读取 typed app settings / browser / Intl；旧 `app-language` 与 `app-follow-system-language` 仅保留 retired key cleanup，不再作为偏好来源。
  - CoreApp renderer storage facade、Tuffex 集成策略与权限页 SDK blocked warning 的兼容命名噪声已清理，不改变运行时行为。
  - Shared `StorageEvents` 已物理删除旧 raw storage update namespace 与对应 payload 类型；`renderer-storage-transport.test.ts` 固定不再暴露该旧 namespace。
  - 移除 compatibility registry 中已无当前命中的 stale cleanup candidate 行，保留仍由扫描命中的 migration exception、size exception 与测试 fixture 登记。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/sync/sync-payload-crypto.test.ts" "src/main/modules/sync/sync-payload-wire.test.ts"` 通过（`2 files / 8 tests`）；`pnpm -C "apps/core-app" exec vitest run "src/renderer/src/modules/lang/language-preferences.test.ts" "src/main/modules/plugin/plugin-preflight-helper.test.ts" "src/renderer/src/modules/storage/account-storage.test.ts"` 通过（`3 files / 11 tests`）；`node scripts/check-legacy-boundaries.mjs` 与 `pnpm compat:registry:guard` 通过，其中 `compat:registry:guard` 已无 cleanup warning。

### test(core-app): 补强 inline workflow 多 step hard-cut 回归

- `apps/core-app/src/main/modules/ai/intelligence-deepagent-orchestration.test.ts`
- `packages/tuff-intelligence/src/transport/event/builder.ts`
- `packages/tuff-intelligence/src/transport/event/builder.test.ts`
  - 新增 inline `workflow.execute` 测试，覆盖 prompt step 与 direct tool step 混排执行。
  - 固化 inline `capabilityId` step 会被入口拒绝，direct tool step 会保留 `toolSource`、`workingDirectory` 与 workflow approval context。
  - 断言 inline workflow 归一化结果使用 `inline.workflow`，避免回退到历史不存在的 legacy workflow agent ID。
  - 补齐 `@talex-touch/tuff-intelligence` 包内轻量 `defineEvent` builder，修复包内 SDK typed builder 迁移后 `defineEvent is not a function` 的运行时漏口，保持依赖方向不反向引用 `packages/utils`。
  - 新增包内 builder 直接测试，覆盖 typed event name、legacy two-part raw event 保留，以及 `agentToolApprove` / `workflowGet` SDK 方法使用 typed event names。
  - 验证：`pnpm -C "packages/tuff-intelligence" exec vitest run "src/transport/event/builder.test.ts"` 通过（`1 file / 3 tests`）；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/ai/intelligence-deepagent-orchestration.test.ts" "src/main/modules/ai/intelligence-sdk.test.ts" "src/renderer/src/modules/hooks/useWorkflowEditor.test.ts"` 通过（`3 files / 8 tests`）。

### test(nexus): 固化 Release Evidence 平台阻塞矩阵口径

- `apps/nexus/server/api/admin/release-evidence/releaseEvidence.api.test.ts`
  - 补充 Release Evidence matrix 契约测试，覆盖 Windows required case 失败时进入 blockers、macOS required case 通过时平台为 `passed`。
  - 固化 Linux `linux-best-effort-smoke` 必须以 `requiredForRelease=false + best_effort` 计入，确保 Linux smoke 不会被误算成 `2.5.0` release blocker。
  - 验证：`pnpm -C "apps/nexus" exec vitest run "server/api/admin/release-evidence/releaseEvidence.api.test.ts"` 通过（`1 file / 8 tests`）。

### test(tuffex): 补齐 Switch 基础交互契约

- `packages/tuffex/packages/components/src/switch/__tests__/switch.test.ts`
  - 新增 `TxSwitch` 组件契约测试，覆盖 `role=switch`、`aria-checked`、`aria-disabled`、`tabindex`、active 状态与 size class。
  - 固化 click / Enter / Space 的 `update:modelValue` 与 `change` 事件行为，并覆盖 disabled 状态下不触发交互。
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/switch/__tests__/switch.test.ts"` 通过（`1 file / 3 tests`）。

### docs(nexus): hard-cut Switch docs to current contract

- `apps/nexus/content/docs/dev/components/switch.en.mdc`
- `packages/tuffex/packages/components/src/switch/__tests__/switch.test.ts`
- `docs/plan-prd/TODO.md`
  - Removed stale Switch docs references to unsupported `loading` state and `medium` size.
  - Updated the API to the current implementation contract: `small/default/large` size values, default size behavior, disabled focus/toggle blocking, and `update:modelValue` / `change` events.
  - Reused existing focused Switch component coverage for ARIA state, size class, click/Enter/Space toggles, and disabled behavior.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/switch/__tests__/switch.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/switch/src/TxSwitch.vue" "packages/components/src/switch/__tests__/switch.test.ts"` 通过。

### test(tuffex): 补齐 Checkbox 基础交互契约

- `packages/tuffex/packages/components/src/checkbox/__tests__/checkbox.test.ts`
  - 新增 `TxCheckbox` 组件契约测试，覆盖 label 渲染、ARIA 状态、无可见 label 时的 `aria-label`、`labelPlacement=start` 顺序。
  - 固化 click / Enter / Space 的 `update:modelValue` 与 `change` 事件行为，并覆盖 disabled 状态下不触发交互、`aria-disabled` 与 `tabindex=-1`。
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/checkbox/__tests__/checkbox.test.ts"` 通过（`1 file / 5 tests`）。

### docs(nexus): clear Checkbox component API placeholders

- `apps/nexus/content/docs/dev/components/checkbox.en.mdc`
- `packages/tuffex/packages/components/src/checkbox/__tests__/checkbox.test.ts`
- `docs/plan-prd/TODO.md`
  - Replaced generated Checkbox API placeholders with the current boolean-control contract: checked state, disabled toggle blocking, label placement, conditional `aria-label`, change events, and default label slot behavior.
  - Reused existing focused Checkbox component coverage for label rendering, ARIA state, label order, click/Enter/Space toggles, and disabled behavior.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/checkbox/__tests__/checkbox.test.ts"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/checkbox/src/TxCheckbox.vue" "packages/components/src/checkbox/__tests__/checkbox.test.ts"` 通过。

### test(utils): 固化三段 raw event 防回退门禁

- `packages/utils/__tests__/transport-event-boundary.test.ts`
  - 新增 transport event boundary 测试，扫描 `transport/events/index.ts`、`transport/events/app.ts` 与 `transport/events/assistant.ts`。
  - 对事件名已经符合 `namespace:module:action` 或更深层形态的定义，禁止继续使用 `defineRawEvent`；确需保留 raw 的两段 legacy 协议仍不在本门禁范围内，避免隐式改名。
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/transport-event-boundary.test.ts" "__tests__/transport-domain-sdks.test.ts"` 通过（`2 files / 21 tests`）；`pnpm -C "packages/utils" exec eslint "__tests__/transport-event-boundary.test.ts" "__tests__/transport-domain-sdks.test.ts" "transport/events/index.ts" "transport/events/assistant.ts"` 通过。

### ref(utils): Plugin storage open-in-editor 事件改用 typed builder

- `packages/utils/transport/events/index.ts`
- `packages/utils/__tests__/transport-domain-sdks.test.ts`
  - `PluginEvents.storage.openInEditor` 保持既有对外事件名 `plugin:storage:open-in-editor` 不变，内部从 `defineRawEvent` 收口为 `defineEvent('plugin').module('storage').event('open-in-editor')`。
  - 补充 storage event metadata 回归断言，固定 `namespace=plugin / module=storage / action=open-in-editor`，完成 shared `events/index.ts` 中三段 raw event 的无损 typed 化清零。
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/transport-domain-sdks.test.ts"` 通过（`1 file / 20 tests`）；`pnpm -C "packages/utils" exec eslint "transport/events/index.ts" "transport/events/assistant.ts" "__tests__/transport-domain-sdks.test.ts"` 通过；脚本扫描 `packages/utils/transport/events/{index,app}.ts` 确认三段 `defineRawEvent` 已清零。

### ref(utils): Plugin widget transport 事件改用 typed builder

- `packages/utils/transport/events/index.ts`
- `packages/utils/__tests__/transport-domain-sdks.test.ts`
  - `PluginEvents.widget.register/update/unregister` 保持既有对外事件名 `plugin:widget:*` 不变，内部从 `defineRawEvent` 收口为 `defineEvent('plugin').module('widget')...`。
  - 补充 widget event metadata 回归断言，固定 `namespace=plugin / module=widget`，继续压缩 plugin 链路 raw event 构造面。
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/transport-domain-sdks.test.ts"` 通过（`1 file / 19 tests`）；`pnpm -C "packages/utils" exec eslint "transport/events/index.ts" "transport/events/assistant.ts" "__tests__/transport-domain-sdks.test.ts"` 通过。

### ref(utils): Assistant transport 事件改用 typed builder

- `packages/utils/transport/events/assistant.ts`
- `packages/utils/__tests__/transport-domain-sdks.test.ts`
  - Assistant floating-ball 与 voice-panel 事件保持既有对外事件名 `assistant:floating-ball:*` / `assistant:voice-panel:*` 不变，内部从 `defineRawEvent` 收口为 `defineEvent('assistant').module(...).event(...)`。
  - 补充 typed event metadata 回归断言，固定 `namespace/module/action`，避免 Assistant 链路后续回退到 raw event 构造。
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/transport-domain-sdks.test.ts"` 通过（`1 file / 18 tests`）；`pnpm -C "packages/utils" exec eslint "transport/events/assistant.ts" "__tests__/transport-domain-sdks.test.ts"` 通过。

### ref(tuff-intelligence): 包内 Intelligence SDK 同步 typed builder

- `packages/tuff-intelligence/src/transport/sdk/domains/intelligence.ts`
  - `@talex-touch/tuff-intelligence` 自带的 `agentSession*`、`agentTool*` 与 `workflow*` SDK 事件同步从 `defineRawEvent` 收口到 typed builder。
  - 对外事件名继续保持 `intelligence:agent:*` / `intelligence:workflow:*`，与 `packages/utils` shared SDK 和 CoreApp main handler 的 typed event 语义对齐。
  - 验证：`pnpm -C "packages/tuff-intelligence" exec eslint "src/transport/sdk/domains/intelligence.ts"` 通过。

### ref(core-app): Intelligence main handler 事件改用 typed builder

- `apps/core-app/src/main/modules/ai/intelligence-module.ts`
  - 主进程 `intelligence:agent:*` 与 `intelligence:workflow:*` handler 注册事件保持对外名称不变，内部构造从 `defineRawEvent` 收口为 `defineEvent('intelligence').module('agent|workflow')...`。
  - 与 renderer/shared SDK 的 typed builder 事件对象语义对齐，继续压缩 agent/workflow 链路 raw event 依赖。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/ai/intelligence-sdk.test.ts" "src/main/modules/ai/intelligence-deepagent-orchestration.test.ts" "src/main/channel/common.test.ts"` 通过（`3 files / 14 tests`）；`pnpm -C "apps/core-app" exec eslint "src/main/modules/ai/intelligence-module.ts"` 通过。

### ref(utils): Agent session/tool SDK 事件改用 typed builder

- `packages/utils/transport/sdk/domains/intelligence.ts`
- `packages/utils/__tests__/transport-domain-sdks.test.ts`
  - `agentSession*`、`agentPlan/Execute/Reflect` 与 `agentTool*` SDK 事件保持 `intelligence:agent:*` 对外事件名不变，内部从 `defineRawEvent` 收口为 `defineEvent('intelligence').module('agent')...`。
  - `agentSessionSubscribe` 与 `agentToolApprove` 回归测试补充 `namespace/module/action` 断言，固定 agent 链路不再依赖 raw event 构造。
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/transport-domain-sdks.test.ts"` 通过（`1 file / 17 tests`）；`pnpm -C "packages/utils" exec eslint "transport/sdk/domains/intelligence.ts" "__tests__/transport-domain-sdks.test.ts"` 通过。

### ref(utils): Workflow SDK 事件改用 typed builder

- `packages/utils/transport/sdk/domains/intelligence.ts`
- `packages/utils/__tests__/transport-domain-sdks.test.ts`
  - `workflowList/get/save/delete/run/history` 继续保持对外事件名 `intelligence:workflow:*`，但内部定义从 `defineRawEvent` 收口为 `defineEvent('intelligence').module('workflow')...`。
  - 回归测试在字符串 event name 外增加 `namespace/module/action` 断言，确认 Workflow SDK 不再依赖 raw event 构造。
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/transport-domain-sdks.test.ts"` 通过（`1 file / 16 tests`）；`pnpm -C "packages/utils" exec eslint "transport/sdk/domains/intelligence.ts" "__tests__/transport-domain-sdks.test.ts"` 通过。

### breaking(utils/core-app): Agent API 事件硬切为 typed transport 命名

- `packages/utils/transport/events/index.ts`
- `packages/utils/__tests__/transport-domain-sdks.test.ts`
- `apps/core-app/src/main/modules/ai/agents/agent-channels.ts`
- `docs/plan-prd/02-architecture/intelligence-agents-system-prd.deep-dive-2026-03.md`
  - Agent management API 与 task push 事件从历史 raw 名称（如 `agents:list-all`、`agents:execute-immediate`、`agents:task-started`）硬切为 typed transport 命名：`agents:api:*` / `agents:push:*`。
  - 主进程注册与 renderer SDK 共用 `AgentsEvents` typed event 对象，不再注册旧 raw agent 管理事件。
  - `transport-domain-sdks.test.ts` 增加具体 event name 断言，防止 SDK 后续回退到 raw 名称。
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/transport-domain-sdks.test.ts"` 通过（`1 file / 16 tests`）；`pnpm -C "apps/core-app" exec vitest run "src/main/channel/common.test.ts" "src/main/modules/ai/intelligence-deepagent-orchestration.test.ts" "src/renderer/src/modules/hooks/useWorkflowEditor.test.ts"` 通过（`3 files / 13 tests`）。

### fix(core-app): 统一 Workflow Editor 默认 Agent ID

- `apps/core-app/src/renderer/src/modules/hooks/useWorkflowEditor.ts`
- `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceWorkflowPage.vue`
- `apps/core-app/src/renderer/src/modules/hooks/useWorkflowEditor.test.ts`
  - Workflow Editor 新建 agent step 与保存空 `agentId` 的兜底值从历史 `deepagent.workflow` 硬切为真实已注册内置 Agent：`builtin.workflow-agent`。
  - 页面 Agent ID placeholder 同步为 `builtin.workflow-agent`，避免用户按旧提示保存后指向不存在的 Agent。
  - 新增 hook 回归测试，覆盖默认新建步骤与保存 payload 兜底，防止 agent/workflow 链路再次回退到旧兼容 ID。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/renderer/src/modules/hooks/useWorkflowEditor.test.ts"` 通过（`1 file / 2 tests`）。

### fix(tuffex): 补强 Agents 列表文案与键盘选择契约

- `packages/tuffex/packages/components/src/agents/`
- `packages/tuffex/docs/components/agents.md`
  - `TxAgentsList` 新增 `enabledTitle`、`disabledTitle`、`emptyText` 覆盖项，默认文案保持兼容，便于 Nexus/CoreApp 侧按场景本地化 section 与空态。
  - `TxAgentItem` 显式以 `select` 事件承载选择语义，disabled item 不再通过父级透传 click 触发选择；Enter 与 Space 键可触发 enabled item。
  - 新增 `agents.test.ts` 覆盖分组文案、空态文案、enabled/disabled click 与键盘选择行为。
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/agents/__tests__/agents.test.ts"` 通过（`1 file / 5 tests`）。

### feat(nexus): 落地设备授权 Phase 1 风控首批闭环

- `apps/nexus/server/utils/authStore.ts`
- `apps/nexus/server/api/app-auth/device/{start,approve,cancel,abort}.post.ts`
- `apps/nexus/server/api/devices/{revoke.post,audits.get}.ts`
- `apps/nexus/server/utils/__tests__/device-auth-risk.test.ts`
- `docs/plan-prd/{TODO.md,04-implementation/NexusDeviceAuthRiskControl-260316.md}`
  - 新增 `auth_device_auth_audits` 结构化审计表，记录设备授权 `request/approve/reject/cancel/revoke/trust/untrust` 的时间、来源、操作者、原因、安全元数据；当前用户可通过 `GET /api/devices/audits` 查询授权时间线。
  - `start` 与 `approve` 统一复用 `evaluateDeviceAuthRateLimit()`：按 10 分钟窗口约束 `device/IP/user` 设备码申请频率，连续 reject/cancel 达阈值后进入默认 10 分钟冷却，并返回 `429 + retryAfterSeconds`。
  - `approve` 的 IP mismatch、长期授权策略拒绝、频控/冷却拒绝都会写入审计；`cancel`、设备端 `abort` 与设备撤销也补齐审计打点。
  - 长期授权时间窗改为后端判定：NextAuth JWT `iat` 注入 session context，`evaluateDeviceAuthLongTermPolicy()` 只允许签名 session 签发后 10 分钟内确认长期授权；前端 `reauth=1` 仅作为交互态，不作为信任依据。
  - 可信设备白名单落到 `auth_devices.trusted_at`，Dashboard 设备页可对未撤销设备执行信任/取消信任；长期授权必须同时满足可信设备、常用登录地与 session 时间窗。
  - 验证：`pnpm -C "apps/nexus" exec vitest run "server/utils/__tests__/device-auth-risk.test.ts"` 通过（`1 file / 4 tests`）；`pnpm -C "apps/nexus" run typecheck` 通过（仅保留既有 Nuxt/Vue duplicated imports 与 vue-router volar subpath warning）。
## 2026-05-04

### ref(core-app): 收口 Electron runtime 与 raw IPC 边界

- `apps/core-app/src/main/core/window-security-profile{,.test}.ts`
- `apps/core-app/src/main/config/default.ts`
- `apps/core-app/src/main/modules/{box-tool/core-box/{window,meta-overlay},division-box/session,plugin/plugin-module}.ts`
- `apps/core-app/src/{preload/index,shared/ipc/raw-channel}.ts`
- `apps/core-app/src/renderer/src/{modules/channel/channel-core,modules/preload/process-info,modules/platform/renderer-platform,modules/hooks/env-hooks,modules/sentry/sentry-renderer,components/Versions,views/base/settings/SettingUpdate}.ts`
- `apps/core-app/src/main/modules/{platform/capability-runtime.test,sync/{index,sync-b64-repush.test}}.ts`
- `scripts/check-coreapp-runtime-boundaries.mjs`
- `apps/core-app/docs/compatibility-legacy-scan-summary.md`
- `docs/plan-prd/{TODO.md,docs/PRD-QUALITY-BASELINE.md}`
  - 新增 `WindowSecurityProfile` / `buildWindowWebPreferences()` 作为 CoreApp main 内部唯一窗口安全 profile 构造入口；主窗口、CoreBox、DivisionBox shell、Assistant、OmniPanel 与 MetaOverlay 不再散落 `webSecurity:false/nodeIntegration:true/contextIsolation:false/sandbox:false`。
  - 主窗口因仍承载历史 `<webview>` 插件详情面，仅保留显式 `enableWebviewTag`；CoreBox 插件 UI 与 DivisionBox 插件 UI 暂走 `compat-plugin-view` profile，后续按插件 Surface 兼容验证逐步收紧。
  - `@main-process-message` / `@plugin-process-message` 集中到 `shared/ipc/raw-channel.ts`，主/渲染 channel-core 改为内部 adapter 常量；renderer `window.touchChannel` 变为 deprecated bootstrap bridge，不再作为新增业务入口。
  - renderer 不再直接依赖 Node 全局 `process` 读取平台/架构/versions/build type，改从 CoreApp preload 私有 `getProcessInfo()` 与 build-info 获取，支撑 app-grade `nodeIntegration:false/contextIsolation:true/sandbox:true` baseline。
  - 新增 `runtime:guard` 并接入 `legacy:guard`，冻结宽松 WebPreferences、裸 `ipcRenderer/ipcMain`、raw IPC event string、`window.touchChannel`、`window.$t/window.$i18n` 与旧 `/api/sync/*`。
  - 平台 capability 回归补强 macOS Automation、Windows PowerShell、Linux `xdotool`、native share mail-only、permission deep-link，确保 degraded/unsupported path 均带 `issueCode/reason/limitations`。
  - sync `b64:` 旧 payload 仍只读迁移；命中后标记 dirty 并调度 encrypted repush，新增 focused test 固定该行为。

### ref(core-app): 清理残留兼容运行面

- `apps/core-app/src/main/index.ts`
- `apps/core-app/src/main/modules/permission-center.ts`
- `apps/core-app/src/preload/preload-view.js`
- `apps/core-app/src/renderer/src/modules/sync/sync-item-mapper.ts`
- `docs/plan-prd/TODO.md`
  - 删除未接入模块启动链路的旧 `permission-center.ts` runtime 文件，并移除 `main/index.ts` 中误导性的 `PermissionCenter` / `DropManager` / `ServiceCenter` 注释入口；`platform.permission-center` 继续作为当前平台能力 ID 保留。
  - 删除未被 Electron/Vite 构建入口或窗口 runtime 引用的裸 IPC `preload-view.js`，避免后续误用 `ipcRenderer.send/on` 暴露面。
  - renderer `sync-item-mapper` 只保留插件 storage qualified-name helper，移除会抛错的 retired sync payload API；同步 payload 编解码/写入继续以 main 侧 `sync-payload-wire` / `sync/index` 为唯一实现。
  - 未纳入本轮的高风险或需真机复核专项已登记到 `TODO`：旧 Channel 底座 hard-cut、Electron `webPreferences` security hardening、Linux `xdotool` 依赖提示与 smoke。

### fix(core-app): 收敛 beta 打包启动日志噪音

- `apps/core-app/{electron.vite.config.ts,electron-builder.yml}`
- `apps/core-app/src/main/modules/{tray,build-verification}/`
- `apps/core-app/src/main/core/{before-quit-guard,module-manager,precore}.ts`
- `apps/core-app/src/main/modules/sentry/sentry-service.ts`
- `apps/core-app/package.json`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.test.ts`
- `packages/utils/{plugin/sdk-version,__tests__/permission-status.test,transport/sdk/main-transport}.ts`
- `packages/tuffex/packages/script/build/index.ts`
- `apps/nexus/content/docs/dev/reference/manifest.{zh,en}.mdc`
  - Sentry Vite sourcemap 上传不再随 production/release 构建默认启用，必须显式设置 `SENTRY_UPLOAD_SOURCEMAPS=1` 且提供 `SENTRY_AUTH_TOKEN`，避免本地 beta 打包因无权限触发 `@sentry/cli` 403。
  - Sentry 退出流程不再用远程 Nexus telemetry outbox 上传阻塞 `before-quit`；退出时只保证本地 outbox/统计落盘，远程上传交给正常运行期轮询，避免 benchmark/快速退出出现 before-quit timeout。
  - macOS Dock 图标设置改为先解析为非空 `NativeImage` 再调用 `app.dock.setIcon()`，并把 `resources/icon.png` 作为真实 extraResources 文件带入包内，避免 `.icns` 路径存在但 Electron 无法加载时输出 error 级启动噪音。
  - BuildVerification 会把 release asset 的相对签名路径解析成绝对 URL，避免 `/api/releases/*.sig` 这类 payload 被直接请求导致 `Failed to parse URL`。
  - SDK allowlist 临时保留历史 `260421` marker，仅用于兼容已经安装的早期 `touch-dev-utils` 本地副本；当前推荐与新包仍保持 `260428`。
  - before-quit 超时日志补充当前卸载模块观测，benchmark 快速退出时降为 warning；TuffTransport main 侧不再为正常 `port_closed/sender_destroyed` 端口清理输出 warning。
  - `build:unpack` 改用 `pnpm run build`，避免 npm 误读 pnpm workspace `.npmrc` 配置刷出 unknown config warning；Tuffex 构建脚本改为 Sass namespace import，消除明确可定位的 Sass import deprecation。

### fix(core-app/build): 修复 promoted resources runtime 依赖漏包

- `apps/core-app/scripts/build-target{,.js}/runtime-modules.js`
- `apps/core-app/src/main/core/runtime-modules.contract.test.ts`
- `docs/plan-prd/{01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1,docs/PRD-QUALITY-BASELINE}.md`
  - `syncMissingPackagedRuntimeModules` 不再因为 promoted runtime 根模块已存在于 `Resources/node_modules` 就跳过其闭包同步；当 `@opentelemetry/resources` 这类模块被外置到 resources 时，会继续把 `@opentelemetry/core`、`@opentelemetry/semantic-conventions` 与必需 peer `@opentelemetry/api` 同步到同一可解析路径。
  - resources 可解析闭包显式纳入必需 `peerDependencies`，但跳过 `peerDependenciesMeta.optional` 标记的可选 peer，避免 `langsmith` 这类可选 OpenTelemetry peer 被无意义拉入。
  - packaged verifier 会把“不在 asar、只能从 resources 解析”的 promoted runtime 视为 resources root 校验，阻断“根模块存在但二级/peer 依赖仍只在 asar 内、运行时不可达”的坏产物。
  - 新增 contract 覆盖 promoted resources root 的 dependencies / required peer / optional peer 规则，以及真实 afterPack 场景下根模块已在 resources 时仍同步其依赖闭包。

## 2026-05-03

### ref(core-app): 收敛 runtime dependency 打包清单

- `apps/core-app/scripts/{ensure-runtime-modules,ensure-platform-modules}.js`
- `apps/core-app/scripts/build-target/runtime-modules.js`
- `apps/core-app/src/main/core/runtime-modules.contract.test.ts`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - `runtime-modules.js` 升级为单一 runtime module manifest / closure 来源，统一承载 packaged roots、resources roots、平台 native roots 与依赖闭包解析。
  - `ensure-runtime-modules` 与 `ensure-platform-modules` 退为复制编排层，复用同一套模块解析、目标路径映射与 copy helper，避免 build 前同步、afterPack resources 兜底、平台补包继续各自维护发现逻辑。
  - 新增 hoisted/transitive dependency contract，模拟 app 直依、workspace hoist、包内局部传递依赖、optional 缺失与 workspace native root 复制边界，固定 pnpm/electron-builder 漏包高风险场景。
  - 保持现有打包行为：普通 runtime 闭包仍进入 app `node_modules`/asar 可解析路径，`resources/node_modules` 标记模块仍走 resources 兜底，平台补包仍对 peer/optional 缺失只告警。

### ref(core-app): 抽薄插件加载前失败分支

- `apps/core-app/src/main/modules/plugin/{plugin-module,plugin-preflight-helper{,.test}}.ts`
  - 插件加载前 runtime drift、loader fatal 与 metadata/sdk gate 失败态收口到 preflight helper，统一组装 issue、`load_failed` 状态与 `PluginEvents.push.stateChanged` 更新广播。
  - `plugin-module` 保留现有加载编排与日志语义，不继续做整块生命周期拆分，先把最容易膨胀的加载前失败胶水从主流程抽薄。
  - 新增 direct tests 固定 `PLUGIN_RUNTIME_DRIFT`、`SDKAPI_BLOCKED`、`LOADER_FATAL` 的 issue/loadError/broadcast 契约，确保外部行为不变。

## 2026-05-03

### ref(core-app): 缩窄 renderer 兼容状态残留

- `apps/core-app/src/renderer/src/modules/{platform/renderer-platform,lang/{language-preferences,useLanguage}}.ts`
  - renderer 平台状态解析拆出 raw runtime hints，`useRendererPlatform()` 不再先把 Electron 平台归一成 state 后再二次归一，减少平台真值来源的绕路。
  - 语言启动偏好把“采用 legacy localStorage 快照”和“清理 legacy 快照”拆成两个显式标志；无效旧 key 会在 hydration 后清理，但不会影响 typed `appSetting.lang` 判定。

### fix(core-app): 同步 payload 升级为真实密文

- `apps/core-app/src/main/modules/sync/{index,sync-payload-crypto,sync-payload-wire}.ts`
- `apps/core-app/src/main/utils/secure-store.ts`
- `apps/core-app/src/renderer/src/modules/{sync/sync-item-mapper,storage/account-storage,platform/renderer-platform}.ts`
- `apps/core-app/src/{main/modules/sync,renderer/src/modules/{storage,platform,lang}}/*.test.ts`
  - Sync 写入路径从旧 `b64:` Base64 payload 升级为 main 侧 AES-GCM `enc:v1:<base64-json-envelope>`；payload key 使用 secure-store 保护，不从 `deviceId` 派生。
  - `payload_enc` 与 blob 文本只写密文，服务端 wire shape 保持 `payload_enc/payload_ref` 不变；`meta_plain` 仅保留 `qualified_name/schema_version/payload_size/content_hash/crypto_version/key_id` 等非业务字段。
  - pull 侧仅把旧 `b64:` 作为 migration fallback 解码；命中后标记 dirty，下一次 push 自动升级为 `enc:v1`。
  - renderer `sync-item-mapper` 退为拒写兼容壳，避免第二套 Base64 编解码重新接入生产同步。
  - `AccountStorage` 不再把 legacy token 字段写回 `account.ini`；renderer platform 测试锁定 `startup > electron > browser fallback` 优先级。
  - 定向回归覆盖 crypto 非确定性、解密、篡改失败、空 payload、blob 明文泄露回归、legacy fallback、账号 token 不落盘与平台/语言兼容迁移。

## 2026-05-01

### ref(core-app): 收口 startup/runtime 兼容边界

- `packages/utils/preload/{loading,renderer}.ts`
- `apps/core-app/src/preload/index.ts`
- `apps/core-app/src/renderer/src/{AppEntrance.vue,env.d.ts,main.ts}`
- `apps/core-app/src/renderer/src/modules/{hooks/{useAppLifecycle,useStartupInfo,useUpdateRuntime}.ts,lang/useLanguage.ts,platform/renderer-platform.ts,sdk/plugin-sdk.ts,store/providers/nexus-store-provider.ts,sentry/sentry-renderer.ts}`
- `apps/core-app/src/renderer/src/components/{base/{TouchScroll,effect/GlassSurface}.vue,render/WidgetFrame.vue}`
- `apps/core-app/src/main/{db/db-write-scheduler.ts,modules/{clipboard.ts,ocr/{ocr-config-policy,ocr-service}.ts,box-tool/search-engine/{usage-stats-queue,query-completion-service}.ts,plugin/{plugin-module.ts,runtime/plugin-runtime-repair{,.test}.ts}}`
- `apps/core-app/docs/compatibility-legacy-scan{,-summary}.md`
  - preload 启动链路改为 typed `StartupContext` bridge，renderer 不再依赖 `window.$startupInfo` / `window.$isMetaOverlay` 或二次 startup transport fallback；入口模式、startup metadata 与 meta overlay 统一经由 preload contract 读取。
  - 语言初始化改成 hydration 后一次性迁移 legacy localStorage 快照；稳态启动与运行期只读 typed `appSetting.lang`。
  - renderer 平台 sniff 收口到 `renderer-platform`，`TouchScroll`、`GlassSurface`、Sentry renderer 不再直接触碰 `navigator.platform/userAgent` 或 `process.platform`。
  - 插件 runtime 不再按插件名偷偷修目录；加载前统一执行 runtime drift 检查，发现缺失 runtime 文件、旧 import 或 package/runtime 版本漂移时直接以 `PLUGIN_RUNTIME_DRIFT` 阻断。
  - DB write scheduler 删除 `droppable` 兼容入口，clipboard/OCR/usage-stats/query-completions 统一显式声明 `dropPolicy` / `maxQueueWaitMs`。
  - 更新安装不再把 `update:install` 超时包装成 started；超时仅提示“等待系统接管确认”，避免 optimistic success。
  - Widget 空态从单一“暂未就绪”细分为 loading / missing renderer / render error；同时收口 `plugin-sdk`、`nexus-store-provider`、update/widget/lifecycle/sentry 等 renderer 高频 raw console。
  - 新增 `useStartupInfo` / `useUpdateRuntime` focused Vitest，固定 typed startup bridge 单一路径与 update install ack-timeout 语义。
  - 新增 `pnpm console:guard` 质量门禁与 allowlist，冻结 CoreApp runtime 裸 `console.*` 边界；renderer 平台直读 `navigator.platform/userAgent/process.platform` 由 ESLint 限定只允许 `renderer-platform.ts` 保留。

## 2026-04-30

### ref(utils): hard-cut active-app system SDK fallback

- `packages/utils/plugin/sdk/system.ts`
- `packages/utils/__tests__/system-sdk.test.ts`
- `apps/nexus/content/docs/dev/architecture/ipc-events-sdk-map.{zh,en}.mdc`
- `apps/core-app/docs/compatibility-legacy-scan{,-summary}.md`
  - `getActiveAppSnapshot()` 不再在 typed transport 失败时回退到 raw `system:get-active-app`，与主进程已经停止注册 raw handler 的 hard-cut 事实对齐。
  - 回归测试固定 typed 失败直接抛出且不得调用 raw channel，避免 SDK 层把 transport 问题吞成空快照。
  - Nexus IPC map 改为记录 typed `app:system:get-active-app` 事件，避免开发文档继续暗示 raw bridge 仍可用。

### fix(core-app): 补强桌面包运行时依赖闭包门禁

- `apps/core-app/scripts/build-target/runtime-modules.js`
- `apps/core-app/scripts/build-target.js`
- `apps/core-app/scripts/build-target/after-pack.js`
- `docs/plan-prd/{01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1,docs/PRD-QUALITY-BASELINE}.md`
  - 桌面打包校验从 root runtime module 扩展到 `PACKAGED_RUNTIME_MODULES` 的完整依赖闭包，避免 `@sentry/electron -> @opentelemetry/sdk-trace-base -> @opentelemetry/resources` 这类传递缺包留到用户启动时才崩。
  - `afterPack` 额外扫描 `app.asar` 中缺失的普通运行时闭包模块并同步到 `Resources/node_modules`，避免 pnpm/electron-builder 对 hoisted transitive dependency 的漏包继续进入产物。
  - `resources/node_modules` 标记模块继续强制校验整条闭包都落在 resources 兜底路径；普通运行时闭包允许存在于 `app.asar` 或 `resources/node_modules`，保持现有打包策略不变。
  - 不调整 Sentry 初始化、不禁用 telemetry、不切换打包路径，仅把坏产物拦截前移到构建阶段。

### fix(ci): 修复 AI 与 Tuff CLI clean CI 回归

- `retired-ai-app/server/utils/__tests__/aiapp-stream-emitter-seq.test.ts`
- `packages/tuff-cli/src/bin/tuff.ts`
- `.github/workflows/package-tuff-cli-ci.yml`
- `package.json`
- `apps/nexus/SETUP.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - AI heartbeat 仍按 seq-optional 事件处理，测试固定“不写入 trace、不携带 `seq` 字段”的真实输出契约，避免把字段缺省误判为失败。
  - Tuff CLI watch build 改为结构化 watcher type guard，避开 Vite/Rollup 类型版本漂移导致的 DTS 构建失败。
  - Tuff CLI package CI 在 clean runner 的 CLI job 内显式构建 `tuff-cli-core` 与 `unplugin-export-plugin`，避免依赖上游 job 的本地 `dist` 残留。
  - Cloudflare Pages 文档入口改为 `pnpm nexus:build`，避免 Git 集成构建误跑根目录 CoreApp `pnpm build`。

### chore(deps): 收口 Dependabot 安全告警与锁文件 SoT

- `package.json` / `pnpm-workspace.yaml` / `pnpm-lock.yaml`
- `apps/{core-app,nexus}/package.json`
- `packages/{tuff-cli,tuff-cli-core,unplugin-export-plugin,utils,tuffex}/package.json`
- `plugins/{clipboard-history,touch-image,touch-music,touch-translation}/package.json`
- `.github/dependabot.yml`
  - 根 `pnpm-lock.yaml` 作为 monorepo 唯一依赖锁定源，移除 core-app / nexus / touch-music / touch-translation 的独立 lockfile，避免 GitHub Dependabot 对陈旧嵌套锁重复告警。
  - 升级 `mathjs`、`compressing`、`electron`、`next-auth`、`vite`、`tsup` 等直接依赖到安全版本；移除 Nexus 未使用的 optional `nodemailer` 直接依赖，避免把邮件 provider peer 装入运行面；通过根 `pnpm.overrides` 收敛 `simple-git`、`fast-xml-parser`、`@xmldom/xmldom`、`node-forge`、`h3`、`tar`、`postcss`、`devalue`、`flatted`、`serialize-javascript` 等高频传递漏洞。
  - Dependabot npm 扫描保持根目录入口，并按 security/version updates 分组，减少重复 PR 与重复告警噪声。

### ref(core-app): 收口 renderer storage 消费入口

- `apps/core-app/src/renderer/src/modules/storage/{app-storage,account-storage,app-storage-boundary.test}.ts`
- `apps/core-app/src/renderer/src/modules/channel/storage/{index,accounter}.ts`
- `apps/core-app/src/renderer/src/{App.vue,main.ts,base/router.ts,components/{download,plugin}/*,modules/{auth,box,hooks,lang,layout,openers,update}/*,views/{base,box}/**/*}`
  - 新增 neutral renderer storage facade：业务消费统一从 `~/modules/storage/app-storage` 获取 `appSetting` / `openers` / `storageManager`，底层继续复用 `@talex-touch/utils/renderer/storage` 与 `useStorageSdk()`。
  - `~/modules/channel/storage` 退为 bootstrap/兼容 re-export 边界，设置页、CoreBox、插件视图、auth、下载中心与 layout/hooks 不再继续扩散旧命名入口。
  - 补充 renderer storage boundary contract，静态约束业务源码不得重新 import `~/modules/channel/storage` 或相对 `channel/storage`。

### feat(core-app): 补齐应用索引诊断证据导出

- `apps/core-app/src/renderer/src/views/base/settings/{SettingFileIndexAppDiagnostic,app-index-diagnostic-evidence}.ts`
- `apps/core-app/src/renderer/src/modules/lang/{en-US,zh-CN}.json`
  - 应用搜索诊断新增复制证据与保存 JSON 入口，导出 payload 固定包含当前 target/query、命中 stage、app/index 元数据与最近一次单项 reindex 结果。
  - 导出结构内置 `windows-app-scan-uwp` / `windows-third-party-app-launch` 人工回归复用字段，但不接入 Release Evidence 写入链，范围保持为本地诊断证据收集。
  - 补充 focused Vitest 固定 payload schema、stage 命中归纳与回归 caseId，便于后续真机记录直接粘贴复用。

### fix(core-app): 再收口索引重建 renderer outcome

- `apps/core-app/src/renderer/src/views/base/settings/{SettingFileIndex,SettingFileIndexAppDiagnostic,index-rebuild-flow}.ts`
- `apps/core-app/src/renderer/src/modules/lang/{en-US,zh-CN}.json`
  - file rebuild 与 app reindex 均复用 `resolveIndexRebuildOutcome()` 处理 `requiresConfirm`、失败 reason/error 与成功 fallback toast，不改 main/sdk 契约。
  - app reindex 在 renderer 侧补齐确认弹窗后才以 `force: true` 重试；file rebuild 继续保留电量确认细节，但确认 payload 也由统一 outcome 传递。
  - focused renderer test 固定 confirm payload、失败 reason 和成功 fallback 三条路径，避免两个设置页再次分叉。

### fix(nexus): 修复组件文档与 updates 公告详情入口

- `apps/nexus/app/components/content/TuffDemoWrapper.vue`
- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/server/api/docs/page.get.ts`
- `apps/nexus/content.config.ts`
  - 组件示例改为进入视口后再加载，避免长组件文档一次性挂载全部交互 demo 导致浏览器内存峰值过高。
  - docs 路径规范化兼容 `.zh.md` / `.en.md` / `.mdc` 链接，组件介绍页旧格式链接可回到 canonical docs path。
  - Nuxt Content docs collection 同时纳入 `.md` 与 `.mdc`，让 updates 公告中指向 `release/performance-persistence` 的详情页可被内容系统查询到。

## 2026-04-28

### ref(core-app): 收口插件 WebView 粗糙残留

- `apps/core-app/src/renderer/src/components/plugin/PluginView.vue`
- `apps/core-app/src/renderer/src/modules/lang/{en-US,zh-CN}.json`
- `apps/core-app/src/main/modules/plugin/plugin-installer.ts`
- `apps/core-app/docs/compatibility-legacy-scan{,-summary}.md`
  - 插件 WebView 删除陈旧 debug 注释，加载提示、忽略加载失败与重启插件操作接入 i18n。
  - WebView crash / failed-load 日志只记录插件名、状态和错误描述，不再直接打印完整 plugin 对象。
  - 插件安装风险确认删除关于未来 TouchID 接入的 TODO 注释；当前真实路径仍保持 Electron warning dialog。
  - 兼容性审计报告同步记录 `preload` debug console 只属于显式诊断边界，普通生产路径 console 不回潮。

### ref(core-app): 清理下载中心假设置组件与旧 i18n 调用

- `apps/core-app/src/renderer/src/components/download/*`
- `apps/core-app/src/renderer/components.d.ts`
- `apps/core-app/src/renderer/src/modules/lang/{en-US,zh-CN}.json`
- `apps/core-app/docs/compatibility-legacy-scan{,-summary}.md`
  - 删除未被引用的 `DownloadSettings.vue`；该旧组件内的选择临时目录按钮只弹“功能待实现”，且真实下载设置页已由 `views/base/settings/SettingDownload.vue` 承担。
  - 下载组件目录内模板文案从全局 `$t(...)` 收口到 `useI18n()` 的 `t(...)`，并清理 `TaskCard` / `DownloadTask` 中硬编码的下载模块、优先级与剩余时间中文文案。
  - 兼容性审计报告同步记录该假设置组件与旧 i18n 风格收口，后续同类复核优先按“可点击入口必须有真实执行路径”判断。

### ref(core-app): 移除应用详情页假动作入口

- `apps/core-app/src/renderer/src/views/base/application/AppConfigure.vue`
- `apps/core-app/docs/compatibility-legacy-scan{,-summary}.md`
  - 应用详情页删除无真实执行路径的 open explorer、uninstall、save footer 与永远不渲染的 spec 区块，避免旧 UI 把注释残留/空 handler 呈现为可用能力。
  - 保留 launch 与 help 两个真实动作；help 外链查询参数统一编码，避免应用名称包含空格或特殊字符时生成不稳定 URL。
  - 兼容性审计报告同步记录该假动作收口，后续复核仍按“用户可点击入口必须有真实执行路径”判断。

### fix(core-app): 对齐 app/file 索引重建交互契约

- `packages/utils/transport/events/types/app-index.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider-diagnostics.ts`
- `apps/core-app/src/renderer/src/views/base/settings/{SettingFileIndex,SettingFileIndexAppDiagnostic,index-rebuild-flow}.ts`
  - `settingsSdk.appIndex.reindex()` 增加 `force` 确认语义，首次调用只做目标预检并返回 `requiresConfirm`，确认后才执行单项关键词重建或重扫。
  - renderer 侧抽出统一重建结果归一化 helper，对齐 file/app 两条链路的确认态、失败态与成功提示处理。
  - 补充 focused contract 测试，固定 typed SDK 映射、main handler 透传、app-provider preflight 与 renderer outcome 语义，避免“点击前没检查”回归。

### chore(deps): 升级全仓同主版本依赖

- `package.json` / `pnpm-workspace.yaml` / `pnpm-lock.yaml`
- `apps/{core-app,nexus,aiapp}/package.json`
- `packages/*/package.json` / `plugins/*/package.json`
  - 全仓 workspace 依赖完成同主版本 patch/minor 升级，覆盖 CoreApp、Nexus、AI、Utils、Tuffex、CLI packages 与官方插件包。
  - 版本准备同步完成：root/CoreApp `2.4.10-beta.3`，`@talex-touch/utils@1.0.50`，`@talex-touch/tuffex@0.3.5`，`@talex-touch/tuff-cli@0.0.3` 与 `tuff-intelligence` patch 版本。
  - CLI 发布边界收口：`@talex-touch/tuff-cli-core` 标记为内部 workspace 包，不进入 npm 发布清单；删除独立 `packages/tuffcli` 兼容包，避免与 `@talex-touch/tuff-cli` 发布职责重复；`@talex-touch/tuff-cli` 显式使用 workspace core / unplugin 构建，避免发布包打入旧版 `unplugin-export-plugin`。
  - `@talex-touch/unplugin-export-plugin` 保留为 `tuff-cli` 复用的低层构建能力与高级自定义入口，文档明确普通插件开发优先使用 `@talex-touch/tuff-cli`，不推荐作为默认安装入口。
  - GitHub Actions 发布链路同步收口：补齐 `tuff-cli` / `tuff-intelligence` package CI，新增 `tuff-intelligence` npm 发布 workflow；CLI 发布 workflow 只发布 `unplugin-export-plugin` 与 `tuff-cli`，不再引用已删除的 `tuffcli` 或内部 `tuff-cli-core`，并在发布 `unplugin-export-plugin` 前等待当前 `utils` 版本可见。
  - `next-auth` 保持 `~4.21.1`，避免破坏 `@sidebase/nuxt-auth@0.9.4` 的 peer 约束；major 升级项继续保留为单独兼容迁移任务。
  - AI 补充 `markmap-common`，根 peer 规则补充 UnoCSS wasm runtime 的 `@emnapi/*` 可选 peer，消除本轮升级新增 peer 噪声。
  - 插件构建兼容同步收口：`touch-image` 对齐当前 Tuff SDK 初始化入口并补齐缺失图片视图，`touch-music` 将 `<script setup>` 中的组件选项迁移为 `defineOptions()`，避免新版 Vue 编译器阻断构建。
  - `@talex-touch/utils` 补充 npm `files` 白名单，避免发布包携带本地旧 tarball、测试目录与开发配置。

### fix(utils): 补齐 regShortcut 快捷键语义参数

- `packages/utils/plugin/sdk/common.ts`
- `packages/utils/__tests__/plugin-shortcut-sdk.test.ts`
- `packages/utils/plugin/sdk/README.md`
  - `regShortcut()` 新增可选 `id` / `description` 参数并透传到 `shortcon:reg`，避免插件通过公共 SDK 注册的快捷键只能以 raw key 作为语义并触发 `missing-description` 告警。
  - 自定义 `id` 注册后，`shortcon:trigger` 回调同时匹配该稳定 id 与原始快捷键，避免“注册成功但触发不到回调”的 SDK 表面缺口。
  - 补充定向 Vitest 固定 payload 透传与自定义 id 触发语义。

### fix(tuff-cli): 对齐 manifest validate 的 sdkapi hard-cut

- `packages/tuff-cli-core/src/validate.ts`
- `packages/tuff-cli-core/src/__tests__/validate.test.ts`
- `packages/tuff-cli/src/cli/commands/create.ts`
- `packages/unplugin-export-plugin/src/cli/commands/create.ts`
- `packages/utils/plugin/sdk-version.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.test.ts`
  - `tuff validate` 现在复用共享 `checkSdkCompatibility()` 与 `resolveSdkApiVersion()`，非 canonical marker（如 `260421`）和未来 marker（如 `260501`）会在 CLI 预检阶段失败，不再被当成普通 outdated warning 放过。
  - 插件创建脚手架更新既有 manifest 时也会重写 unsupported / future marker，避免模板保留一个随后被运行时阻断的 `sdkapi`。
  - 明确列入支持列表的历史 marker 仍可通过校验，但继续提示升级到当前 `260428`，保持“runtime allowlist hard-cut + developer guidance recommend current”的分层语义。
  - loader dev-source 回归补齐当前 `sdkapi` manifest，避免测试场景把 dev-source fallback 与 SDK 阻断混在一起。

### ref(core-app): hard-cut analytics startup metric legacy events

- `packages/utils/transport/events/app.ts`
- `packages/utils/transport/events/types/app.ts`
- `packages/utils/transport/sdk/domains/settings.ts`
- `packages/utils/analytics/types.ts`
- `apps/core-app/src/main/modules/analytics/{analytics-module.ts,core/analytics-core.ts,README.md}`
- `apps/core-app/src/renderer/src/views/base/settings/SettingAbout.vue`
- `docs/plan-prd/{TODO.md,docs/compatibility-debt-registry.csv}`
- `scripts/legacy-boundary-allowlist.json`
  - 删除 `AppEvents.analytics.getCurrent/getHistory/getSummary/report`、settings SDK 同名方法与主进程 handler，不再通过旧 StartupAnalytics 输出面提供启动指标兼容事件。
  - `AnalyticsSnapshot.metrics.startup` 成为当前启动摘要出口，包含总耗时、主进程模块耗时、renderer handshake 耗时、模块数与评级；设置 About 页改为读取 `analytics.getSnapshot`。
  - 移除 `packages/utils/transport/events/app.ts` 的 compatibility debt registry / legacy allowlist 项，避免 app event 定义继续保留 analytics legacy alias。

### test(core-app): restore workflow/everything web typecheck gate

- `apps/core-app/src/renderer/src/modules/hooks/useWorkflowEditor.test.ts`
- `apps/core-app/src/renderer/src/views/base/settings/setting-everything-state.test.ts`
- `apps/core-app/src/main/modules/clipboard.ts`
- `docs/plan-prd/{TODO.md,docs/compatibility-debt-registry.csv}`
- `scripts/legacy-boundary-allowlist.json`
  - Workflow editor 回归测试把 `workflowSave` 捕获 payload 显式收窄为 `WorkflowDefinition`，避免保存断言被 `{}` 推断挡住 `typecheck:web`；行为仍固定空 `agentId` 保存时回填 `builtin.workflow-agent`。
  - Everything 设置状态 fixture 补齐当前 `EverythingStatusResponse.backendAttemptErrors` 必填字段，恢复 renderer web typecheck 对 Everything 状态契约的覆盖。
  - Clipboard 模块注释里的 `NSFilenamesPboardType` 描述从 legacy wording 改为 older macOS format；该文件不再登记 legacy keyword debt。
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/renderer/src/modules/hooks/useWorkflowEditor.test.ts" "src/renderer/src/views/base/settings/setting-everything-state.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:web` 通过（Tuffex dts 插件仍打印既有声明生成诊断，但命令退出码为 0）。

### fix(tuffex): expose alert/avatar/badge props for dts generation

- `packages/tuffex/packages/components/src/alert/src/TxAlert.vue`
- `packages/tuffex/packages/components/src/avatar/src/TxAvatar.vue`
- `packages/tuffex/packages/components/src/badge/src/TxBadge.vue`
  - `TxAlert` / `TxAvatar` / `TxBadge` 的 `defineProps` 直接复用已导出的 `AlertProps` / `AvatarProps` / `BadgeProps`，避免 `withInstall()` 导出的组件类型引用 SFC 内部私有 `Props` 导致 `TS4023`。
  - `defineEmits` 维持本地接口，避免 Vue SFC 编译器无法解析导入 emits 类型。
  - 验证：`pnpm -C "packages/tuffex/packages/components" run build` 通过；首批 `TxAlert` / `TxAvatar` / `TxBadge` `TS4023` 诊断不再出现，剩余 dts 诊断集中在 slot 调用/slot 类型注解。

### fix(tuffex): clear remaining slot dts diagnostics

- `packages/tuffex/packages/components/src/button/src/button.vue`
- `packages/tuffex/packages/components/src/empty/src/TxEmpty.vue`
- `packages/tuffex/packages/components/src/flip-overlay/src/TxFlipOverlay.vue`
- `packages/tuffex/packages/components/src/select/src/TxSelect.vue`
- `packages/tuffex/packages/components/src/select/src/TxSelectItem.vue`
- `packages/tuffex/packages/components/src/stagger/src/TxStagger.vue`
- `packages/tuffex/packages/components/src/tooltip/src/TxTooltip.vue`
- `packages/tuffex/docs/.vitepress/theme/components/DemoBlock.vue`
  - Slot 读取统一显式标注为 Vue `Slots`，默认/具名 slot 调用改为带空 props 的调用形式，避免声明生成阶段把内部 slot 函数签名推断为不可命名类型。
  - `button` / `stagger` 的 VNode 处理补充显式 `VNode` 类型，`tooltip` 的 max height 字符串值同步收窄，保持运行行为不变。
  - 验证：`pnpm -C "packages/tuffex" exec eslint "packages/components/src/flip-overlay/src/TxFlipOverlay.vue" "packages/components/src/select/src/TxSelect.vue" "packages/components/src/select/src/TxSelectItem.vue" "docs/.vitepress/theme/components/DemoBlock.vue"` 通过（`DemoBlock.vue` 被当前 eslint ignore 规则跳过）；`pnpm -C "packages/tuffex/packages/components" run build` 通过且不再输出 dts 诊断。

### fix(core-app): 阻断 unsupported sdkapi marker

- `packages/utils/plugin/sdk-version.ts`
- `apps/core-app/src/main/modules/plugin/sdk-compat.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.ts`
- `packages/test/src/common/sdk-version.test.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.test.ts`
- `apps/nexus/content/docs/dev/{api,reference}`
  - `SUPPORTED_SDK_VERSIONS` 现在是插件声明 `sdkapi` 的 canonical allowlist；非 canonical marker 与未来 marker 不再归一化到最近支持版本，而是统一阻断为 `SDKAPI_BLOCKED`。
  - loader 删除 `SDK_VERSION_COMPAT_WARNING` 非阻断路径，避免 hard-cut 后仍把未知 marker 包装成“可兼容运行”。
  - Nexus manifest / permission / runtime issue code 文档同步说明 unsupported marker 会被阻断，推荐新插件直接声明当前 `260428`。

### chore(plugins): bundled plugins 使用当前 sdkapi marker

- `plugins/*/manifest.json`
- `packages/test/src/common/sdk-version.test.ts`
- `apps/nexus/content/docs/dev/api/storage.{zh,en}.mdc`
  - 官方 bundled plugins 的 manifest 统一声明当前 `sdkapi: 260428`，不再停留在 `260121/260215` 旧 marker 上。
  - Nexus Storage API 的 SQLite 示例 manifest 也改用当前推荐 marker；`sdkapi >= 260215` 仍只作为 SQLite SDK 能力下限说明保留。
  - 这些插件已经具备 `category` 与权限声明；本轮只收敛 SDK marker，让官方插件默认进入当前 hard-cut / capability auth 语义。
  - `sdk-version` 回归从“canonical marker”收紧为“必须等于 `CURRENT_SDK_VERSION`”，防止后续官方插件再次以旧 SDK marker 进入仓库。

### fix(utils): StorageSubscription 优先使用 typed storage transport

- `packages/utils/renderer/storage/storage-subscription.ts`
- `packages/test/src/common/storage-subscription.test.ts`
  - `StorageSubscription` 在同时初始化 channel 与 transport 时，不再优先走 legacy `storage:get` raw channel 拉快照；当前 CoreApp 初始化传入 transport 后会直接使用 `StorageEvents.app.get`。
  - typed transport 可用时不再额外注册 legacy `storage:update` listener，避免把已迁移路径仍标记成 legacy channel active。
  - 补充回归测试，固定“transport + channel 同时存在时不得发送 legacy snapshot 请求”的 hard-cut 语义。

### ref(renderer): 收口 storage 初始化、订阅与消费入口

- `packages/utils/renderer/storage/{bootstrap,base-storage,storage-subscription}.ts`
- `packages/utils/renderer/hooks/use-storage-sdk.ts`
- `packages/utils/transport/sdk/domains/storage.ts`
- `apps/core-app/src/renderer/src/{main.ts,modules/channel/storage/{base,index,accounter}.ts,modules/hooks/useAppLifecycle.ts,views/base/{begin/internal/SetupPermissions.vue,settings/{SettingMessages,SettingSentry}.vue}}`
- `packages/utils/__tests__/{renderer-storage-transport,transport-domain-sdks}.test.ts`
  - 新增 renderer storage bootstrap 入口，CoreApp renderer 初始化不再显式解析 `useChannel()`，统一从 `TuffTransport` 初始化 storage 读写与更新订阅。
  - `TouchStorage` 与 `StorageSubscription` 支持从 legacy channel listener 升级到 typed storage stream，保留显式 fallback 但优先使用 `StorageEvents.app.updated`。
  - 新增 `createStorageSdk()` / `useStorageSdk()`，设置、引导权限与账号持久化消费不再直接 `transport.send(StorageEvents.app.*)`。
  - 设置页消息中心改用 `subscribeStorage()` 订阅 `analytics-messages.json`，避免消费端直接操作 storage update stream。
  - 补充 contract 测试固定 storage domain SDK 映射、默认 transport 路径，以及 legacy listener 被 transport 初始化清理的升级语义。

### chore(utils): 收敛插件 sdkapi 260428 推荐口径

- `plugins/clipboard-history/manifest.json`
- `packages/test/src/common/sdk-version.test.ts`
- `apps/nexus/content/docs/dev/reference/manifest.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/api/permission.{zh,en}.mdc`
- `AGENTS.md`
  - `clipboard-history` 内置插件 manifest 从非 canonical `260421` 收敛到当前推荐 `260428`，避免继续触发 unsupported SDK marker 兼容告警。
  - Nexus manifest / permission 文档与仓库说明同步更新推荐 `sdkapi` 为 `260428`；`260228` 仍作为 capability auth 的启用下限，不新增额外运行时门槛。
  - `sdk-version` 回归补充官方插件 manifest canonical marker 检查，防止后续再引入不在 `SUPPORTED_SDK_VERSIONS` 中的日期 marker。

## 2026-04-27

### chore(docs): 补齐 2.5.0 发布阻塞证据收口状态

- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `scripts/legacy-boundary-allowlist.json`
  - `TODO` 主文件压缩状态改为完成，当前行数维持在 `312` 行，实时 checkbox 口径更新为 `已完成 85 / 未完成 24 / 总计 109 / 完成率 78%`。
  - Release Evidence 写入路径继续以 `/api/admin/release-evidence/doc-guard` 与 matrix 为准；本地环境未提供 `release:evidence` API key 或管理员登录态，本轮不伪造写入，只记录阻塞状态与可复用证据载荷。
  - Release Evidence 写入序列已固化：先 `POST /api/admin/release-evidence/doc-guard` 记录 docs guard 汇总；平台回归先 `POST /api/admin/release-evidence/runs` 创建对应 `platform/scope` run，再对 `/runs/:runId/items` upsert 稳定 `caseId`。
  - Windows required caseId：`windows-everything-file-search`、`windows-app-scan-uwp`、`windows-third-party-app-launch`、`windows-shortcut-launch-args`、`windows-tray-update-plugin-install-exit`。
  - macOS required caseId：`macos-first-run-permissions`、`macos-omnipanel-accessibility`、`macos-native-share-tray-dock-update`、`macos-plugin-permission-install-update`、`macos-exit-resource-release`。
  - Linux non-blocking caseId：`linux-best-effort-smoke`，写入时使用 `status=best_effort` 且 `requiredForRelease=false`，证据中明确记录 `xdotool` / desktop environment 限制与无法保证项。
  - 当前执行环境为 macOS arm64，只能补本机 CoreApp 基线与 macOS 可自动化验证；Windows 阻塞级回归与 Linux best-effort smoke 仍需对应真机/环境补证。
  - `compat:registry:guard` 与 `legacy-boundary` 暴露 test/detector 级 `legacy-keyword` 漏登记项；已按 detection-only / regression-fixture 语义补入 compatibility registry 与 allowlist，不扩大运行时兼容面。
  - 已验证：`pnpm docs:guard`、`pnpm docs:guard:strict`、`pnpm compat:registry:guard`、`node "scripts/check-legacy-boundaries.mjs"`、`pnpm network:guard` 均通过；compat registry 仅保留历史 cleanup candidate 警告。
  - 已验证：`pnpm -C "apps/nexus" exec vitest run "server/utils/releaseEvidenceStore.test.ts" "server/api/admin/release-evidence/releaseEvidence.api.test.ts"` 通过（`2` 个文件 / `13` 条测试），确认 run/item/matrix/doc-guard 写入契约仍有效。
  - 已验证：`pnpm -C "apps/nexus" run build` 通过；构建输出保留既有 Nuxt/Vite warning，包括 D1 binding 提示、billing 重复 auto-import、CSS lexical warning 与大 chunk warning。
  - 已验证：Nexus 本地 Pages smoke 使用 `wrangler pages dev dist --d1 DB --binding AUTH_ORIGIN/NUXT_AUTH_ORIGIN/AUTH_SECRET/NUXT_AUTH_SECRET` 启动；`/docs` 最终跳转到 `/docs/dev/index` 并返回 `200`，`/docs/dev/components/`、`/updates`、`/api/docs/navigation`、`/api/docs/page?path=/docs/dev/components`、`/api/docs/sidebar-components` 均返回 `200`。
  - 已验证：Nexus `_nuxt` 样例 chunk 加载通过，`entry.BWQUpQOH.css`、`docs.CLjfLGkI.css`、`Ddx1KrEM.js`、`DVNr3VB7.js`、`updates.DfZPd2gI.css` 均返回 `200`；浏览器打开组件页无 console warning/error，sidebar 链接可见，Playwright 点击切换时目标进程崩溃，已用 HTTP 验证 `/docs/dev/components/button` 与对应 `page` API 均返回 `200`，不把该点击步骤伪造为完整通过。
  - 已验证：`pnpm -C "apps/core-app" run typecheck`、`pnpm -C "apps/core-app" run typecheck:node`、`pnpm -C "apps/core-app" run typecheck:web` 均通过。
  - 已验证：`pnpm -C "apps/core-app" exec vitest run ...` 覆盖 Everything、App/UWP、搜索 baseline、插件安装/权限、native-share、平台能力与插件更新中断提示，结果为 `11` 个文件 / `65` 条测试通过。
  - 已验证：CoreApp macOS 自动化补证通过，`pnpm -C "apps/core-app" run test:omnipanel` 为 `3` 个文件 / `26` 条测试通过，`pnpm -C "apps/core-app" run test:shortcut-lifecycle` 为 `3` 个文件 / `25` 条测试通过；补充 `tray-manager`、`quit-paths`、`system-permission-refresh`、`active-app`、`clipboard-action-diagnostics`、`darwin` 定向 Vitest 为 `6` 个文件 / `19` 条测试通过。
  - 已验证：`env -u SENTRY_AUTH_TOKEN NUXT_DISABLE_SENTRY=true pnpm -C "apps/core-app" run build` 通过；原始 `pnpm -C "apps/core-app" run build` 被当前 shell 的 `SENTRY_AUTH_TOKEN` 创建 release 权限不足拦截（Sentry `403`），已按本地构建验证口径排除外部上传副作用。
  - 已验证：`env -u SENTRY_AUTH_TOKEN NUXT_DISABLE_SENTRY=true pnpm -C "apps/core-app" run build:snapshot:mac` 通过，macOS arm64 snapshot 打包成功并生成 `apps/core-app/dist/tuff.app.zip`；该证据覆盖本机打包链路，不替代签名/公证/安装更新的人工回归结论。
  - 已验证：`git diff --check` 通过。

### fix(core-app): 归一化插件更新下载中断提示

- `apps/core-app/src/main/modules/plugin/providers/utils.ts`
- `apps/core-app/src/main/modules/plugin/providers/utils.test.ts`
- `apps/core-app/src/renderer/src/composables/store/store-install-error-utils.ts`
- `apps/core-app/src/renderer/src/composables/store/store-install-error-utils.test.ts`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
  - 插件包下载流如果在 Electron/Node 层抛出 `The operation was aborted`，现在会统一归一为 `NETWORK_TIMEOUT`，避免市场更新弹窗直接暴露底层 AbortError。
  - 安装失败提示新增中英文本地化文案，将下载超时或中断明确提示为插件源网络问题。
  - 已补定向回归：`store-install-error-utils.test.ts` 覆盖历史裸 AbortError 与标准 `NETWORK_TIMEOUT`，`providers/utils.test.ts` 覆盖下载流 abort 归一化。

### fix(core-app): 修复文件索引重建重复订阅

- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-watch-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-watch-service.test.ts`
  - 文件索引 watcher 注册完成后同步 `fsEventsSubscribed` 状态，避免手动重建索引时再次向 `TouchEventBus` 注册同一组文件系统事件并触发 `EventHandler already exists (Repeat on)`。
  - 已补定向回归：重复调用 `ensureFileSystemWatchers()` 时只注册一次文件系统事件订阅。

## 2026-04-26

### chore(docs): 收口文档治理门禁与历史路线锚点

- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`
- `docs/plan-prd/docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - `TODO` 主清单从 `416` 行压缩到 `310` 行，保留当前两周主线、2.5.0 阻塞级回归与文档门禁节奏；AI / Intelligence 长尾与历史完成索引下沉到长期债务池。
  - 修复 `TODO` 统计漂移，当前实时 checkbox 口径为 `已完成 84 / 未完成 25 / 总计 109 / 完成率 77%`。
  - `DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md` 明确降权为 2026-03-17 文档盘点历史快照，不再承载当前“下一步路线”权威；当前路线以六主文档、`TODO` 与 `CHANGES` 为准。
  - 已验证：`pnpm docs:guard`、`pnpm docs:guard:strict` 均通过（`5 pass / 0 fail`）。
  - 已验证：`pnpm -C "apps/nexus" run build` 通过；用于本地 Pages smoke 时需同时注入 `AUTH_ORIGIN` / `NUXT_AUTH_ORIGIN` / `AUTH_SECRET` / `NUXT_AUTH_SECRET` 与本地 `--d1 DB` 绑定，否则 docs content API 会因缺少 auth origin 或 D1 binding 失败。
  - Nexus 本地 smoke：`/docs`、`/docs/dev/components`、`/updates`、`/api/docs/navigation`、`/api/docs/page`、`/api/docs/sidebar-components` 与 `_nuxt` CSS/JS chunk 均返回 `200`；浏览器抽查到静态 `_nuxt/*` 资源加载成功且无 console warning/error。
  - Release Evidence API 写入需要管理员登录态或 `release:evidence` API key；当前本地环境未发现可用写入凭证，本轮将命令与 smoke 证据记录在 `CHANGES`，后续 CI 可用同一证据载荷写入 `/api/admin/release-evidence/doc-guard`。

### fix(core-app): 修复 macOS 辅助功能权限状态刷新

- `apps/core-app/src/renderer/src/views/base/settings/SettingSetup.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/SetupPermissions.vue`
- `apps/core-app/src/renderer/src/modules/system/system-permission-refresh.ts`
  - “前往系统设置”点击前先复查当前权限；若系统已授予 Accessibility，直接刷新 UI 为已授权，不再重复打开系统设置。
  - Accessibility 请求后改为短轮询刷新，避免用户在系统设置里稍后打开开关时，应用仍停留在 2 秒前的“已拒绝”旧状态。
  - 首次引导页与应用设置页共用等待授权工具，减少两处权限定时器逻辑漂移。

### feat(nexus): 新增 Release Evidence API 采集 2.5.0 回归证据

- `apps/nexus/server/utils/releaseEvidenceStore.ts`
- `apps/nexus/server/api/admin/release-evidence/*`
- `apps/nexus/server/api/dashboard/api-keys.post.ts`
- `apps/nexus/app/pages/dashboard/api-keys.vue`
- `apps/nexus/i18n/locales/{zh,en}.ts`
- `apps/nexus/server/utils/releaseEvidenceStore.test.ts`
- `apps/nexus/server/api/admin/release-evidence/releaseEvidence.api.test.ts`
  - 新增 D1-only `release_evidence_runs` / `release_evidence_items` 存储，缺少 D1 时直接返回 `500 Database not available`，不做 memory fallback。
  - 新增管理端 API：run 创建/分页/详情、item upsert、`matrix` 聚合与 `doc-guard` 快速写入；所有路由统一使用 `requireAdminOrApiKey(event, ['release:evidence'])`。
  - 新增 API key scope `release:evidence`，并接入创建白名单与 dashboard scope 配置；既有 `release:sync` 仍按 release 子 scope 兼容规则覆盖。
  - `evidence` 限定为 JSON object，序列化后最大 128KB；matrix 不落独立快照，按指定 version 最新 matching items 聚合平台阻塞矩阵。
  - `doc-guard` 快速写入现在会在创建 run 前预校验 item 输入，避免非法 `status/evidence` 请求失败后留下无效 run。
  - 已补定向回归：`pnpm -C "apps/nexus" exec vitest run "server/utils/releaseEvidenceStore.test.ts" "server/api/admin/release-evidence/releaseEvidence.api.test.ts"`。

### feat(nexus): 复用 Tuffex 收口公共 updates 页面

- `apps/nexus/app/pages/updates.vue`
- `apps/nexus/i18n/locales/{zh,en}.ts`
- `packages/tuffex/packages/components/src/{blank-slate,error-state,guide-state,loading-state,no-data,no-selection,offline-state,permission-state,search-empty}/src/*.vue`
- `packages/tuffex/packages/components/src/empty-state/__tests__/empty-state-wrappers.test.ts`
  - 公共 updates 页的要闻列表、历史版本列表、loading 与空态改为复用 `TxCardItem`、`TxTag`、`TxSpinner`、`TxSkeleton`、`TxNoData`；最新版本详情使用 `TxCard` 承载，避免继续维护一套页面内手写卡片/标签/状态样式。
  - `Critical` 标记补齐双语 `updates.latest.critical`，更新类型标签移除代码内中文 fallback，统一由 locale 文件兜底。
  - 要闻区保留无外层卡片的页面区块结构，只让实际更新/版本条目使用卡片组件，避免卡片套卡片与产品域组件反向污染 Tuffex。
  - 频道切换时会在同一次 router replace 中清理 `history=1`，避免历史版本展开状态跨 release/beta/snapshot 频道残留。
  - 修复 Tuffex empty-state 系列 wrapper 使用 `v-slots` 导致 Nuxt SSR `getSSRProps` 崩溃的问题；wrapper 现在显式转发 `icon/title/description/actions` slots，并新增 SSR 回归覆盖。

### fix(tuffex): 补齐 Transfer 动作按钮可访问标签

- `packages/tuffex/packages/components/src/transfer/src/{TxTransfer.vue,types.ts}`
- `packages/tuffex/packages/components/src/transfer/__tests__/transfer.test.ts`
- `packages/tuffex/packages/components/src/empty-state/__tests__/empty-state-wrappers.test.ts`
- `apps/nexus/app/components/content/demos/{FloatingFloatingDemo.vue,TransferTransferDemo.vue}`
- `apps/nexus/content/docs/dev/components/transfer.{zh,en}.mdc`
  - `TxTransfer` 新增 `addAriaLabel` / `removeAriaLabel`，为左右移动的 icon-only 操作按钮提供可本地化无障碍标签，默认行为与既有 `v-model` / `change` 事件保持兼容。
  - Transfer 文档与 Demo 同步展示本地化 aria label；Floating Demo 改成浮动信息层/状态条示例，减少纯装饰图形对组件用途的干扰。
  - empty-state wrapper SSR 回归补上 `icon` slot 断言，覆盖与实现声明保持一致。

### ref(core-app): hard-cut DivisionBox flow trigger 与 legacy startup migrations

- `packages/utils/transport/events/{index.ts,types/division-box.ts}`
- `packages/utils/types/flow.ts`
- `apps/core-app/src/main/modules/{division-box/ipc.ts,platform/capability-registry.ts,permission/{index.ts,permission-guard.ts,permission-store.ts},storage/{index.ts,main-storage-registry.ts},download/{index.ts,logger.ts,migration-manager.test.ts},flow-bus/native-share.ts,box-tool/addon/apps/app-provider.ts,system/desktop-shortcut.ts}`
- `apps/core-app/src/main/utils/app-root-path.ts`
- `apps/core-app/src/renderer/src/{main.ts,modules/auth/auth-env.ts,modules/storage/theme-style.ts}`
  - 物理删除 `division-box:flow:trigger` 事件面和主进程 blocked handler；DivisionBox capability 改为仅描述真实容器能力，不再挂 `FLOW_TRIGGER_UNAVAILABLE`。
  - 删除 dev data root、permission JSON、layout opacity、renderer auth/theme startup migration 与 download legacy migration manager；相关测试/文档/导出同步清理。
  - macOS `messages` share 改为显式 `requiresUserAction`，不再把“打开 Messages + 写入剪贴板”当成已完成投递。
  - `app-provider` steady-state 关键词同步不再持续清理 legacy item ids；`clipboard` 与 `omni-panel` 的 Win/Linux 模拟快捷键收口到 `desktop-shortcut` helper。

### feat(core-app): 补齐 Device Idle renderer 配置与诊断入口

- `packages/utils/transport/events/types/device-idle.ts`
- `packages/utils/transport/sdk/domains/settings.ts`
- `apps/core-app/src/main/channel/common.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
  - `settingsSdk.deviceIdle` 新增实时诊断读取能力，renderer 可拿到当前空闲时长、电量状态、策略设置与允许/拦截原因。
  - App 设置页的后台索引策略区新增最小诊断块，支持查看当前 snapshot、手动刷新，并在保存空闲阈值、强制时长、电量策略后同步刷新诊断。
  - 诊断文案覆盖 `not-idle`、`battery-low`、`battery-critical` 与允许执行状态，避免用户只能看到“允许项异常”而无法判断被哪条策略拦住。

### feat(core-app): 增加应用搜索单项诊断入口

- `packages/utils/transport/events/types/app-index.ts`
- `packages/utils/transport/sdk/domains/settings.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
  - `settingsSdk.appIndex` 新增 `diagnose` / `reindex` typed transport 能力，可按 app 路径、bundleId 或名称定位单个应用，返回当前 DB 字段、`displayName`、`alternateNames`、生成关键词与已入库关键词。
  - 应用索引高级设置区新增最小诊断面板，可输入目标应用和测试 query，直接查看 precise / phrase / prefix / FTS / N-gram / subsequence 各阶段是否命中目标 item。
  - 诊断入口支持单项关键词重建和单项重新扫描，遇到“某个应用搜不到”时可先在 UI 内完成定位与修复，不需要先翻主进程日志。

### feat(core-app): 补齐 device idle 设置与诊断面板

- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
- `apps/core-app/src/main/channel/common.ts`
- `packages/utils/transport/sdk/domains/settings.ts`
  - 文件索引设置页新增 device idle 最小配置面板，可查看和修改空闲阈值、强制执行间隔、充电豁免与低电量拦截策略。
  - `settingsSdk.deviceIdle.getDiagnostic()` 接入主进程 `deviceIdleService.canRun()`，renderer 可直接显示当前 snapshot、允许/拦截状态和可读诊断文案。
  - 补充 renderer 侧诊断文案 helper 与 focused tests，锁定空闲时长、电池状态和拦截原因的展示口径。

### chore(governance): 补齐 size guard 临时增长例外账本

- `scripts/large-file-boundary-allowlist.json`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
  - 为当前 `size:guard` 剩余 23 个违规项补齐 `growthExceptions` 与 registry trace，所有例外仍在 `2.5.0` 前退场。
  - 同轮拆分清退：`apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue` `1716 -> 1065`；`packages/utils/transport/events/index.ts` `3104 -> 2411`。
  - `packages/utils/transport/events/app.ts` 承接原 `AppEvents` 兼容命名，已同步登记 legacy keyword 清册，不新增运行时分支。
  - `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts` 抽出单项诊断/reindex 到 `app-provider-diagnostics.ts`，cap 收紧到 `3290`。
  - `SIZE-GROWTH-2026-04-26-CORE-APP-INTELLIGENCE-MODULE`: `apps/core-app/src/main/modules/ai/intelligence-module.ts` cap `1863`
  - `SIZE-GROWTH-2026-04-26-CORE-APP-TUFF-INTELLIGENCE-RUNTIME`: `apps/core-app/src/main/modules/ai/tuff-intelligence-runtime.ts` cap `1551`
  - `SIZE-GROWTH-2026-04-26-CORE-APP-APP-PROVIDER-TEST`: `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.test.ts` cap `1259`
  - `SIZE-GROWTH-2026-04-26-CORE-APP-APP-PROVIDER`: `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts` cap `3290`
  - `SIZE-GROWTH-2026-04-26-CORE-APP-RECOMMENDATION-ENGINE`: `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.ts` cap `1891`
  - `SIZE-GROWTH-2026-04-26-CORE-APP-SEARCH-CORE`: `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts` cap `2581`
  - `SIZE-GROWTH-2026-04-26-CORE-APP-CLIPBOARD`: `apps/core-app/src/main/modules/clipboard.ts` cap `3299`
  - `SIZE-GROWTH-2026-04-26-CORE-APP-DOWNLOAD-CENTER`: `apps/core-app/src/main/modules/download/download-center.ts` cap `1538`
  - `SIZE-GROWTH-2026-04-26-CORE-APP-OCR-SERVICE`: `apps/core-app/src/main/modules/ocr/ocr-service.ts` cap `1625`
  - `SIZE-GROWTH-2026-04-26-CORE-APP-OMNI-PANEL`: `apps/core-app/src/main/modules/omni-panel/index.ts` cap `1868`
  - `SIZE-GROWTH-2026-04-26-CORE-APP-PLUGIN-MODULE`: `apps/core-app/src/main/modules/plugin/plugin-module.ts` cap `3674`
  - `SIZE-GROWTH-2026-04-26-CORE-APP-SENTRY-SERVICE`: `apps/core-app/src/main/modules/sentry/sentry-service.ts` cap `1304`
  - `SIZE-GROWTH-2026-04-26-CORE-APP-LINGPAN`: `apps/core-app/src/renderer/src/views/base/LingPan.vue` cap `2000`
  - `SIZE-GROWTH-2026-04-26-AIAPP-TH-INPUT`: `retired-ai-app/app/components/input/ThInput.vue` cap `1251`
  - `SIZE-GROWTH-2026-04-26-AIAPP-AIGC-COMPLETION`: `retired-ai-app/app/composables/api/base/v1/aigc/completion/index.ts` cap `1896`
  - `SIZE-GROWTH-2026-04-26-AIAPP-AIAPP-CHAT-PAGE`: `retired-ai-app/app/composables/useAIChatPage.ts` cap `2122`
  - `SIZE-GROWTH-2026-04-26-AIAPP-ADMIN-CHANNELS`: `retired-ai-app/app/pages/admin/system/channels.vue` cap `1428`
  - `SIZE-GROWTH-2026-04-26-AIAPP-CHAT-STREAM`: `retired-ai-app/server/api/chat/sessions/[sessionId]/stream.post.ts` cap `1791`
  - `SIZE-GROWTH-2026-04-26-AIAPP-AIAPP-TOOL-GATEWAY`: `retired-ai-app/server/utils/aiapp-tool-gateway.ts` cap `2164`
  - `SIZE-GROWTH-2026-04-26-PACKAGES-TUFF-CLI-TUFF-CLI`: `packages/tuff-cli/src/bin/tuff.ts` cap `1281`
  - `SIZE-GROWTH-2026-04-26-PACKAGES-TUFF-INTELLIGENCE-DEEPAGENT-ENGINE`: `packages/tuff-intelligence/src/adapters/deepagent-engine.ts` cap `2138`
  - `SIZE-GROWTH-2026-04-26-PACKAGES-TUFF-INTELLIGENCE-INTELLIGENCE-TYPES`: `packages/tuff-intelligence/src/types/intelligence.ts` cap `2319`
  - `SIZE-GROWTH-2026-04-26-PACKAGES-UTILS-UTILS-INTELLIGENCE-TYPES`: `packages/utils/types/intelligence.ts` cap `2317`

### chore(governance): 清理已退场 legacy 关键字债务记录

- `docs/plan-prd/docs/compatibility-debt-registry.csv`
  - 移除 `compat:registry:guard` 已判定为 cleanup candidate 的 `legacy-keyword` 记录，保留仍由文件命名命中的 compat-file 账本项。
  - 账本清理后 `pnpm compat:registry:guard` 不再输出 cleanup warning，不改变 legacy/size 门禁阈值。

### refactor(core-app): 移除 DivisionBox active sessions 假命令

- `apps/core-app/src/main/modules/division-box/command-provider.ts`
- `apps/core-app/src/main/modules/division-box/command-provider.test.ts`
  - CoreBox 的 DivisionBox provider 不再注入 `division-box:show-active-sessions` 结果；该结果此前只记录 active sessions 日志，没有打开任何用户可见界面，属于未接通 UI 的伪命令。
  - 保留真实 shortcut mapping 的搜索和执行路径，并新增回归测试确保 active session 存在时也不会暴露无动作命令。

### refactor(core-app): 收口插件状态按钮命令式 DOM 渲染

- `apps/core-app/src/renderer/src/components/plugin/action/PluginStatus.vue`
  - 插件状态按钮不再通过 `innerHTML`、手动 `classList` 和 mount-time watcher 改写 DOM；状态文案、样式 class 与点击动作统一由 Vue computed 派生。
  - 重新加载失败时不再直写 `console.error`，保留开发期 `devLog` 诊断，避免 renderer 状态组件继续保留 raw console 与命令式 UI 旧实现。

### refactor(core-app): 移除 DivisionBox keepAlive 空 timer API

- `apps/core-app/src/main/modules/division-box/session.ts`
  - 删除未被调用的 `keepAliveTimer`、`startKeepAliveTimer()` 与 `stopKeepAliveTimer()`；该公开方法没有真实计时逻辑，只留下 “for now” 注释，会误导后续维护者以为 session 自身有 keepAlive timer。
  - 当前 keepAlive 生命周期继续由 `DivisionBoxManager` 的状态监听与 `LRUCache` 管理，不改变 session 创建、 inactive 缓存和 destroy 清理语义。

### refactor(core-app): 删除 screen-capture 占位链路并收口服务日志

- `apps/core-app/src/main/addon/device/screen-capture.ts`
- `apps/core-app/src/renderer/src/modules/hooks/application-hooks.ts`
- `apps/core-app/src/main/service/{official-plugin.service.ts,file-watch.service.ts}`
- `apps/core-app/src/main/core/tuff-icon.ts`
- `apps/core-app/src/main/modules/{build-verification/index.ts,plugin/adapters/feature-search-tokens.ts}`
- `apps/core-app/src/main/modules/box-tool/{core-box/manager.ts,addon/system/system-actions-provider.ts}`
- `apps/core-app/src/main/utils/plugin-injection.ts`
- `apps/core-app/src/main/modules/download/{logger.ts,database-service.ts,chunk-manager.ts,concurrency-adjuster.ts,network-monitor.ts,performance-monitor.ts,download-worker.ts,notification-service.ts,error-logger.ts}`
- `apps/core-app/src/main/modules/download/download-center.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/{darwin.ts,win.ts,search-processing-service.ts}`
- `apps/core-app/src/main/modules/box-tool/{item-sdk/box-item-manager.ts,search-engine/usage-stats-cache.ts,search-engine/time-stats-aggregator.ts}`
- `apps/core-app/src/main/modules/box-tool/search-engine/{usage-stats-queue.ts,recommendation/recommendation-engine.ts,recommendation/context-provider.ts,recommendation/item-rebuilder.ts}`
- `apps/core-app/src/main/modules/plugin/providers/{tpex-provider.ts,utils.ts}`
- `apps/core-app/src/main/modules/storage/{storage-polling-service.ts,storage-lru-manager.ts,storage-frequency-monitor.ts}`
- `apps/core-app/src/main/modules/ai/intelligence-sdk.ts`
- `apps/core-app/src/main/utils/{i18n-helper.ts,perf-context.ts,release-signature.ts}`
- `apps/core-app/src/main/modules/box-tool/search-engine/{search-index-service.ts,workers/search-index-worker.ts}`
- `apps/core-app/src/main/{core/channel-core.ts,modules/storage/index.ts}`
  - 删除未被任何入口引用、且全文件只剩注释的主进程 screen-capture 占位文件；renderer 同步移除无人发送的 `@screen-capture` 注册函数，避免后续误以为屏幕捕获能力已接通。
  - `OfficialPluginService`、`FileWatchService`、`TuffIconImpl` 的 raw console 调试输出切到 `createLogger`，保留失败原因但减少散落日志和原始路径暴露。
  - CoreBox Manager、SystemActions file-index、BuildVerification、FeatureSearchTokens 的小范围 raw console 也统一收口到已有 logger；SystemActions 去掉 file-index 的重复控制台输出，只保留结构化日志。
  - 旧插件注入脚本不再向插件 WebContents 输出 `Touch # Auto inject JS`，并删除同文件底部未启用的样式注释块。
  - Download 外围模块（数据库、切片、worker、通知、网络、性能、并发和错误日志器）的 raw console 改为 `download/logger.ts` 统一导出的结构化 logger；失败日志优先记录 taskId/chunkIndex/pathLength 等元数据，避免直接输出本地路径。
  - DownloadCenter 主模块同样切到 `DownloadCenter` logger，初始化/销毁、任务批量操作、临时文件清理、transport handler 和通知点击均不再直接写 console；日志改造后失去引用的 `formatBytes()` 已删除。
  - macOS/Windows 应用扫描和搜索后处理慢日志切到 `AppScanner` logger，失败日志不再直接输出 app/file 完整路径。
  - BoxItemManager、插件 provider 工具、UsageStatsCache 与 TimeStatsAggregator 的可选调试/告警日志也切到项目 logger，减少搜索与插件安装路径里的 raw console 残留。
  - UsageStatsQueue、Recommendation ContextProvider 与 ItemRebuilder 的 flush/debug/rebuild 失败日志切到项目 logger；保留原有队列丢弃、merge back 与可选上下文降级语义，不改变推荐召回和排序。
  - RecommendationEngine 主文件中 provider 注册、缓存命中、候选计数、推荐生成耗时和插件 provider 失败也统一使用 `RecommendationEngine` logger，避免推荐主路径继续散落 raw debug/warn。
  - Storage polling/LRU/frequency monitor 的维护日志改用 `Storage:*` logger，保留周期保存、强制保存、LRU 驱逐和高频访问告警语义，去掉 chalk 拼接式 raw console 输出。
  - Intelligence SDK、main i18n helper、PerfContext 和 SignatureVerifier 的普通 warn/error 输出切到项目 logger；AI 调用、翻译 fallback、慢上下文告警和签名拉取失败语义保持不变。
  - SearchIndexService 与 search-index worker 的索引摘要、慢批次、零结果诊断、初始化和 pinyin 预热日志切到 `SearchIndex` logger；不再直出完整 DB path 或 FTS 查询表达式。
  - 清理 `channel-core` 里的 dead debug 注释和 storage JSDoc 里的 `console.log` 示例；兼容性扫描报告同步标记剩余 console 命中属于有意保留边界。
  - `application-hooks` 清掉外链拦截里的旧 safe-link 注释块，只保留当前 `url:open` / localhost 判断主路径。

### refactor(core-app): 收口预览、终端与服务中心调试残留

- `apps/core-app/src/main/modules/box-tool/addon/preview/{preview-provider.ts,preview-registry.ts}`
- `apps/core-app/src/main/modules/terminal/terminal.manager.ts`
- `apps/core-app/src/main/service/{protocol-handler.ts,service-center.ts}`
  - Preview Provider 不再把即时预览表达式和结果值直接写入主进程日志，只保留 abilityId、长度、entryId 等结构化元数据，避免搜索/剪贴板内容进入调试输出。
  - Preview Registry / Terminal / Protocol Handler / ServiceCenter 统一改用 `createLogger`，清理 stale no-op 文案、死协议注释和 raw console 调试输出。
  - ServiceCenter 删除无读取方的注册快照 `save()` / `filePath` 伪持久化路径，避免把运行时插件服务注册误表达成可恢复状态。
  - ServiceCenter 转发插件服务时不再把原始 file service payload 打到日志，只记录插件、服务名与扩展名；二次启动不支持的文件/目录提示也改成明确的 unsupported 语义。

### refactor(core-app): 清理兼容审计后的无引用 legacy/no-op 残留

- `apps/core-app/src/main/addon/device/blue-tooth.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/renderer/src/modules/layout/index.ts`
  - 删除未被任何入口引用、且全文件仅剩注释的 Bluetooth/USB 旧实验代码，避免继续作为假的设备能力入口误导后续维护。
  - 移除 renderer layout 模块中无内部调用的 `useLayout` legacy alias，只保留当前主入口 `useDynamicTuffLayout`。
  - File Provider 移除旧主线程内容解析/FTS 索引 helper 与空调用保活逻辑；当前文件内容解析、progress 持久化与 FTS 写入统一由 `file-index-worker -> FileProviderIndexRuntimeService -> SearchIndexWorkerClient.persistAndIndex` 管线承担。

### fix(core-app): 清理插件 Widget 预览硬编码 mock 文案

- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginFeatureDetailCard.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginFeatures.vue`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
  - Widget 预览面板的 `Mock Payload` 标签接入 `plugin.features.widget.preview.mockLabel`，避免开发工具 UI 继续暴露 raw 英文占位文案。
  - Widget 预览状态与提示（未选择、载荷无效、mock payload 解析/空内容/渲染中）统一走 `plugin.features.widget.preview.*`，避免同一开发面板内中英混杂。

### fix(core-app): 修复 CoreBox macOS 应用中文名检索漏召回

- `apps/core-app/src/main/modules/box-tool/addon/apps/{darwin.ts,app-provider.ts,search-processing-service.ts,app-types.ts,app-utils.ts}`
- `apps/core-app/src/main/modules/box-tool/addon/apps/{darwin.test.ts,app-provider.test.ts,search-processing-service.test.ts}`
  - macOS 应用扫描在 Spotlight 英文名优先时，会保留 `InfoPlist.strings` 中的本地化名称为 `alternateNames`，避免“网易云音乐”等中文显示名被扫描阶段丢弃。
  - 应用关键词同步会把 `alternateNames` 一并生成中文、全拼和首字母关键词；搜索后处理也会用 alternate name 做候选命中，确保索引召回后不会被显示名过滤掉。
  - 应用搜索索引 itemId 改为优先使用稳定路径/app identity，并在同步时清理旧 bundleId 索引，避免同一 bundleId 的多个 `.app` 互相覆盖。

### fix(core-app): 收口 Flow Transfer 与平台 capability 假成功语义

- `apps/core-app/src/main/modules/flow-bus/{flow-bus.ts,module.ts,flow-consent.ts,flow-bus.test.ts}`
- `apps/core-app/src/main/modules/platform/{capability-adapter.ts,capability-registry.ts,capability-runtime.test.ts}`
- `apps/core-app/src/main/modules/system/{permission-checker.ts,permission-checker.test.ts,active-app.ts,active-app.test.ts}`
  - Flow Transfer 不再把“目标插件未注册 delivery handler”当作已投递：dispatch 会返回 `TARGET_OFFLINE`，插件 transport 投递异常也会向上变成失败结果，不再被 `.catch(() => {})` 吞掉。
  - Platform capability 清单不再把条件型能力宣称为完全 supported：`platform.flow-transfer` 标记为 `best_effort/TARGET_HANDLER_REQUIRED`，`platform.division-box` 标记为 `best_effort/FLOW_TRIGGER_UNAVAILABLE`，active-app 在 macOS/Windows 也明确为 best-effort，并删除已无生产调用且语义过度乐观的 `isActiveAppCapabilityAvailable()`。
  - macOS notification 检查不再把 `Notification.isSupported()` 当成权限已授予；原生通知可用时返回 `notDetermined + canRequest`，避免首次设置页把“运行时支持”误报成“系统已授权”。

### fix(core-app): 补齐 OmniPanel 右键长按时长配置与权限提示

- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `apps/core-app/src/renderer/src/views/base/settings/{SettingTools.vue,SettingSetup.vue}`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN.json,en-US.json}`
- `packages/utils/common/storage/entity/app-settings.ts`
  - OmniPanel 右键长按阈值不再写死为 `600ms`；新增持久化配置项 `omniPanel.mouseLongPressDurationMs`，主进程在触发时按当前设置实时读取。
  - 设置页新增“OmniPanel 右键长按时长”选项，快捷方式弹窗里的鼠标触发文案会直接显示当前阈值，避免只能看到“右键长按”却不知道具体时长。
  - macOS 未授予辅助功能权限时，OmniPanel 鼠标触发不再继续显示成普通“可用”状态，而会明确提示需要先授予权限，减少静默失效。

### fix(core-app): 修正 macOS 权限状态与 OmniPanel 快捷键默认值

- `apps/core-app/src/main/modules/system/permission-checker.ts`
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `apps/core-app/src/renderer/src/views/base/settings/{SettingSetup.vue,SettingTools.vue}`
- `packages/utils/common/storage/entity/app-settings.ts`
- `docs/plan-prd/01-project/CHANGES.md`
  - macOS 通知权限此前错误走 `systemPreferences.getMediaAccessStatus('notifications')`，Electron 只支持 `microphone/camera/screen`，导致已允许通知时仍显示“不支持”；本轮改为基于 `Notification.isSupported()` 判定原生通知能力，避免把可用通知误报为不支持。
  - “唤起 OmniPanel”键盘快捷键新默认改为关闭，保留右键长按触发的既有默认；用户显式打开后的设置仍按持久化值优先。
  - 辅助功能的请求入口会调用 `isTrustedAccessibilityClient(true)` 再打开系统设置，确保当前运行体可以被加入 macOS 辅助功能授权列表。

### fix(core-app): 补齐 Clipboard 自动粘贴失败诊断链路

- `apps/core-app/src/main/modules/clipboard.ts`
- `packages/utils/{transport/events,plugin/sdk}/`
- `plugins/clipboard-history/`
- `docs/plan-prd/{TODO.md,01-project/CHANGES.md}`
  - `clipboard.copyAndPaste` 和 `history.applyToActiveApp` 不再把主进程返回的 `{ success:false, message }` 压成静默 `false`；SDK 会保留 message/code 并抛出可展示错误。
  - 主进程 `apply` / `copy-and-paste` 失败时返回结构化 `ClipboardActionResult`，并写入只含 type、长度、file count、platform、pluginName、delayMs 等安全元数据的日志，避免记录剪贴板明文。
  - macOS `osascript -> System Events` 自动化权限失败会映射为 `MACOS_AUTOMATION_PERMISSION_DENIED`，UI 可直接提示用户去系统设置授权；clipboard-history 插件版本同步 bump 到 `1.1.8`。

## 2026-04-25

### fix(core-app): 防止 CoreBox 系统主题更新时访问已释放 UI view

- `apps/core-app/src/main/modules/box-tool/core-box/{window.ts,web-contents-view-guard.ts,web-contents-view-guard.test.ts}`
- `docs/plan-prd/01-project/CHANGES.md`
  - CoreBox 附着插件 UI 后会在跟随系统主题时监听 `nativeTheme.updated`；当 `WebContentsView` 已被释放或 Electron 侧 `webContents` 短暂不可用时，handler 仍直接调用 `view.webContents.isDestroyed()`，会触发主进程 `Cannot read properties of undefined (reading 'isDestroyed')` 崩溃。
  - 本轮新增 `getLiveViewWebContents()` 作为极小生命周期 guard，并把 CoreBox 主题注入、暗色 class 更新、DevTools/focus 等同一 UI view 路径的直接访问统一收口，确保空 view 直接跳过而不是打崩主进程。

## 2026-04-23

### refactor(core-app): 收口 SearchLogger 对旧日志配置键的 runtime fallback

- `apps/core-app/src/main/modules/storage/{index.ts,main-storage-registry.ts,search-engine-logs-setting-transfer.ts,search-engine-logs-setting-transfer.test.ts}`
- `apps/core-app/src/main/modules/box-tool/search-engine/{search-logger.ts,search-logger.burst.test.ts}`
- `docs/plan-prd/{TODO.md,docs/compatibility-debt-registry.csv}`
- `docs/plan-prd/01-project/CHANGES.md`
  - 搜索日志开关此前在 UI 和主进程里已经主要走 `app-setting.ini -> searchEngine.logsEnabled`，但 `SearchLogger` 仍保留对旧 `search-engine-logs-enabled` 单键文件的 runtime fallback，形成双轨配置读取。
  - 本轮把这条旧路径改成一次性启动迁移：只有旧值为 `true` 且新配置尚未显式声明时，才把值写回 `app-setting.ini`；旧值为 `false` 时不回写默认值，只删除旧文件。
  - 迁移时会先立即持久化新的 `app-setting.ini`，再删除旧文件，避免出现“旧值删掉了、新值还没落盘”的窗口；随后 `SearchLogger` 主路径只再读取 `app-setting.ini`，compatibility registry 里的对应 legacy 条目也同步移除。

### fix(core-app): 收口零散活跃 UI 标签 raw 英文

- `apps/core-app/src/renderer/src/components/store/StoreItemCard.vue`
- `apps/core-app/src/renderer/src/components/base/{tuff/TFormInput.vue,template/FormTemplate.vue}`
- `apps/core-app/src/renderer/src/modules/lang/{en-US,zh-CN}.json`
- `docs/plan-prd/01-project/CHANGES.md`
  - 正常 UI 里还残留几个零散英文：Store 卡片的 `Official Plugin` tooltip、密码输入框的 `Caps Lock` 提示，以及 `FormTemplate` 的 `Content` 默认占位。
  - 本轮优先复用 `store.officialBadge`，并只补两条通用 key `common.capsLock / common.content`；`FormTemplate` 的英文默认 props 也一并改成空字符串，避免框架层再次漏出英文。

### fix(core-app): 收口插件命令详情抽屉 raw 英文标题

- `apps/core-app/src/renderer/src/components/plugin/tabs/CommandDetailDrawer.vue`
- `apps/core-app/src/renderer/src/modules/lang/{en-US,zh-CN}.json`
- `docs/plan-prd/01-project/CHANGES.md`
  - `CommandDetailDrawer` 此前仍直接写着 `Command Details / Command Data` 两个英文标题，在中文环境里会从插件详情页抽屉直接露出来。
  - 本轮只把这两个标题切到 `plugin.details` i18n，不改抽屉结构、命令描述内容或 JSON 数据展示。

### fix(core-app): 收口 SettingAbout 构建元数据标签 raw 英文

- `apps/core-app/src/renderer/src/views/base/settings/SettingAbout.vue`
- `apps/core-app/src/renderer/src/modules/lang/{en-US,zh-CN}.json`
- `docs/plan-prd/01-project/CHANGES.md`
  - About 设置页里 `Version / Build ID / Git Hash / Build Type / Build Time` 这几条构建元数据此前仍直接写在模板里，中文环境会在正式设置页继续露出英文标签。
  - 本轮只把这 5 个标题切到 `settingAbout` i18n，保留构建值本身和其它诊断术语不动，避免扩大到 debug/下载等无关区域。

### fix(core-app): 收口 PluginNew 创建页 raw 英文与失效取消按钮

- `apps/core-app/src/renderer/src/views/base/plugin/PluginNew.vue`
- `apps/core-app/src/renderer/src/modules/lang/{en-US,zh-CN}.json`
- `docs/plan-prd/01-project/CHANGES.md`
  - `PluginNew` 的 create tab 之前仍直接写着 `Templates / General / Readme / Actions / Download / Cancel / Create`、多条英文校验提示，以及 `Attention / Installing degit` 这类弹层标题；中文环境下会像半成品开发页。
  - 本轮只收 create tab：新增 `plugin.new.create` 文案，把模板说明、字段标题、校验提示、协议提醒、degit 环境提示与创建按钮统一切到 i18n。
  - 顺手补上 `Cancel` 按钮关闭行为，避免这个动作按钮继续只是视觉占位。

### fix(core-app): 收口剪贴板触发提示 raw 英文与原始 payload 直出

- `apps/core-app/src/renderer/src/modules/hooks/{application-hooks.ts,clipboard-trigger-mention-utils.ts,clipboard-trigger-mention-utils.test.ts}`
- `apps/core-app/src/renderer/src/modules/lang/{en-US,zh-CN}.json`
- `docs/plan-prd/01-project/CHANGES.md`
  - `clipboard:trigger` 之前直接把 `Clipboard / You may copied "${payload.data}"` 和原始 `image/html` payload 丢给 `blowMention`，既有英文硬编码，也会把剪贴板原文直接走进 `v-html` 渲染链。
  - 本轮新增可测试的 renderer 侧映射，把 `text/image/html` 分别收口成可读标题与安全正文：文本预览先做 HTML escape 和换行处理，图片与 HTML 只显示通用说明，不再把原始 payload 直接展示给用户。
  - 这样既修掉明显的英文/病句提示，也避免剪贴板内容继续以 HTML 形式注入到提示弹层。

### fix(core-app): 收口外部链接确认弹层 raw 英文

- `apps/core-app/src/renderer/src/modules/hooks/{useUrlProcessor.ts,application-hooks.ts,confirm-external-link.ts,confirm-external-link.test.ts}`
- `apps/core-app/src/renderer/src/modules/lang/{en-US,zh-CN}.json`
- `docs/plan-prd/01-project/CHANGES.md`
  - `useUrlProcessor` 与 `application-hooks` 之前各自内联了一份 `Allow to open external link? / Cancel / Sure` 英文确认框，文案、按钮语义和行为都重复维护。
  - 本轮抽成共享 `confirmExternalLinkOpen()` helper，并切到 `notifications.externalLinkConfirmTitle + common.cancel/open` i18n，两个外链入口统一走同一套确认提示。
  - 顺手补上关闭弹层时默认按“取消打开”收口，避免 `TouchTip` 被 `Esc` 关闭后遗留未 resolve 的 Promise。

### fix(core-app): 收口拖拽插件解析入口 raw 英文与旧错误码

- `apps/core-app/src/renderer/src/modules/hooks/dropper-resolver.ts`
- `apps/core-app/src/renderer/src/components/plugin/action/mention/plugin-apply-install-utils.ts`
- `apps/core-app/src/renderer/src/modules/lang/{en-US,zh-CN}.json`
- `docs/plan-prd/01-project/CHANGES.md`
  - 拖拽 `.tpex` 文件的前置解析入口此前仍直接弹 `Only .tpex plugin packages are supported. / Parsing plugin package... / Failed to read plugin file.` 等英文提示，并把 `10091 / 10092` 旧错误码继续原样透给用户。
  - 本轮继续只在 renderer 提示层收口，复用上一轮拖拽安装工具里的错误映射，把扩展名校验、解析中状态、读取失败和 resolver 错误统一切到 `plugin.dropInstall` 文案。
  - 这样拖拽安装流从前置解析弹层到安装提及卡都不再混出英文调试提示，同一套旧 code 也只有一份解释逻辑。

### fix(core-app): 收口拖拽插件安装提及卡 raw 英文与错误码

- `apps/core-app/src/renderer/src/components/plugin/action/mention/{PluginApplyInstall.vue,plugin-apply-install-utils.ts,plugin-apply-install-utils.test.ts}`
- `apps/core-app/src/renderer/src/modules/lang/{en-US,zh-CN}.json`
- `docs/plan-prd/01-project/CHANGES.md`
  - 拖入本地插件包后的安装提及卡此前仍直接显示 `Installing... / Ignore / Install / Install Error / Install Success` 等英文 UI 文案，并把 `10091 / 10092 / INTERNAL_ERROR / plugin already exists` 这类旧消息直接暴露到用户提示里。
  - 本轮维持旧 `@install-plugin` 返回契约不动，只在 renderer 提示层新增可测试的错误映射，把损坏包、解析失败、重复安装与通用失败统一翻译成可读提示。
  - 同步补齐提及卡按钮、安装中状态和成功/失败标题的 i18n，避免拖拽安装这条旧入口继续像半成品调试界面。

### fix(core-app): 收口 Store 详情评分错误 raw fallback

- `apps/core-app/src/renderer/src/composables/store/{useStoreRating.ts,store-rating-error-utils.ts,store-rating-error-utils.test.ts}`
- `apps/core-app/src/renderer/src/views/base/store/StoreDetailOverlay.vue`
- `apps/core-app/src/renderer/src/modules/lang/{en-US,zh-CN}.json`
- `docs/plan-prd/01-project/CHANGES.md`
  - Store 详情评分请求此前仍会把 `Failed to fetch`、`Network Error` 或 `UNKNOWN_ERROR` 这类运行时异常原样带到详情侧栏和失败提示里，继续暴露 raw 异常文本。
  - 本轮补一个可测试的 renderer 侧评分错误归一化，把已知 code 保留给 UI 判定，其余运行时异常统一折叠成通用错误，再映射到 `store.rating` i18n 文案。
  - 同步把评分 HTTP 失败英文提示收口成通用请求失败语义，避免加载评分摘要和提交评分时共用一条文案却仍写成 submit-only。

### fix(core-app): 收口 Store 详情与安装流残留的 raw 英文/错误码

- `apps/core-app/src/renderer/src/views/base/store/StoreDetailOverlay.vue`
- `apps/core-app/src/renderer/src/composables/store/{useStoreInstall.ts,useStoreReadme.ts,store-install-error-utils.ts,store-install-error-utils.test.ts}`
- `apps/core-app/src/renderer/src/modules/lang/{en-US,zh-CN}.json`
- `docs/plan-prd/01-project/CHANGES.md`
  - Store 详情页此前仍有 `Loading README...`、`No README`、`Rating`、`Loading...` 等英文 fallback，README 加载失败也还保留英文兜底；本轮补齐 `store.detailDialog` / `store.rating` 文案，避免在中文环境继续露出 raw 英文占位。
  - 安装失败弹窗此前会直接拼接 `STORE_INSTALL_NO_SOURCE`、`INSTALL_FAILED`、`HTTP_ERROR_503` 甚至 `sdkapi` gate 的英文句子；本轮新增可测试的 renderer 侧失败原因解析，把常见 code / sdk gate 错误翻译成用户可读提示，未知诊断信息仍原样保留。
  - 顺手修正 `store.detailDialog.version` 英文文案前缀空格，避免详情侧栏继续出现细小但明显的 UI 粗糙点。

### docs(nexus): 收口壁纸指南残留的假云同步口径

- `apps/nexus/content/docs/guide/features/wallpaper.{zh,en}.mdc`
- `apps/nexus/content/docs/guide/features/corebox-workflow.{zh,en}.mdc`
- `docs/plan-prd/01-project/CHANGES.md`
  - ThemeStyle 运行时当前只会把壁纸复制到本地壁纸库，并记录本地 `sync.enabled` 状态；不存在跨设备云同步上传。
  - Nexus 指南页原先仍写成“复制到壁纸库后开启云同步 / cloud sync”，会把刚在 renderer 收口过的真相重新写回假能力。
  - 本轮把壁纸指南与 CoreBox 能力页统一改成“复制到本地壁纸库 + 记录本地同步状态”，避免文档继续误导用户把本地状态开关理解成已上线云同步。

### fix(core-app): 收口详细信息页剩余 raw placeholder 空态

- `apps/core-app/src/renderer/src/views/base/LingPan.vue`
- `apps/core-app/src/renderer/src/modules/lang/{en-US,zh-CN}.json`
- `docs/plan-prd/01-project/CHANGES.md`
  - 继续复核 `/details` 页后，发现 Worker/索引/OCR 三块表格仍直接显示 `NO_WORKERS`、`NO_INDEXING_RECORDS`、`NO_RESULT`、`NO_OCR_TASKS`，并夹带 `NONE / NOT_STARTED / UNKNOWN / FILE_SOURCE / DATA_URL` 这类未收口占位。
  - 本轮把这些空态、缺省值和 OCR source fallback 统一切到 `settingAbout` i18n 文案，仅保留诊断表头本身的 debug 风格，避免设置入口继续出现 raw placeholder。

### fix(core-app): 收口详细信息页 Active Application 调试占位

- `apps/core-app/src/renderer/src/views/base/LingPan.vue`
- `apps/core-app/src/renderer/src/modules/lang/{en-US,zh-CN}.json`
- `docs/plan-prd/01-project/CHANGES.md`
  - `/details` 页的 Active Application 卡片之前直接渲染 `📱 / UNKNOWN_APP / NO_WINDOW_TITLE / NO_ACTIVE_APPLICATION_DETECTED` 这类调试占位，用户在正常设置入口里也会看到明显未收口的诊断文本。
  - 本轮把展示逻辑改成“优先显示真实应用名，其次回退 bundleId / identifier / 可执行文件名”，图标位改成首字母 fallback，并把缺失标题/未检测到活跃应用切到正常 i18n 文案，避免继续暴露 raw placeholder。

### refactor(core-app): 删除权限 hard-cut 后残留的 legacy i18n key

- `packages/utils/i18n/message-keys.ts`
- `packages/utils/i18n/locales/{en,zh}.json`
- `docs/plan-prd/ISSUES.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - 权限体系当前已经没有“旧 SDK 跳过权限校验”的运行时路径，但 `packages/utils` 里仍残留 `permission.enforcementDisabled` 与 `permission.legacyPluginWarning` 两条未引用 key，会让 i18n 清单继续保留过期语义。
  - 本轮直接删除这两条 dead key，并同步从 `ISSUES.md` 的 unused key 列表里去掉，避免后续兼容扫描和文档阅读继续误判 hard-cut 仍保留 legacy bypass 口径。

### fix(core-app): 接通 Store 搜索框的真实查询链路

- `apps/core-app/src/renderer/src/components/base/input/FlatCompletion.vue`
- `apps/core-app/src/renderer/src/components/base/input/flat-completion-utils.ts`
- `apps/core-app/src/renderer/src/components/base/input/flat-completion-utils.test.ts`
- `docs/plan-prd/01-project/CHANGES.md`
  - `StoreHeader` 早已把 `placeholder` 和 `@search` 接到 `FlatCompletion`，但后者之前仍写死 `Search...` 且不会往上发出 `search` 事件，导致 Store 搜索框只有输入 UI、没有实际过滤行为。
  - `FlatCompletion` 现在会复用调用方传入的 placeholder，并在每次输入变化后把标准化查询同步给上层，再按同一查询生成补全结果，避免 placeholder 与真实搜索状态继续漂移。
  - 新增纯 TS 定向回归，锁定“placeholder 透传 + 查询归一化 + 结果裁剪到 8 条”的行为；组件模板绑定由 `typecheck:web` 覆盖。

### fix(core-app): 收口 ThemeStyle 的假云同步文案

- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `docs/plan-prd/01-project/CHANGES.md`
  - ThemeStyle 里的背景同步开关当前只会保留本地 `sync.enabled` 状态，并在需要时触发本地壁纸入库，不会执行真实云上传。
  - 设置页文案改为“记录同步状态 / Track Sync Status”，并明确说明当前只记录本地同步状态，避免继续把未闭环能力描述成可用云同步。

### refactor(core-app): 收口插件 sdkapi warning code 与运行时文档口径

- `packages/utils/plugin/sdk-version.ts`
- `packages/utils/plugin/index.ts`
- `packages/utils/permission/index.ts`
- `packages/utils/__tests__/permission-status.test.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.test.ts`
- `packages/utils/i18n/message-keys.ts`
- `packages/utils/i18n/locales/{en,zh}.json`
- `apps/nexus/content/docs/dev/reference/runtime-startup-env.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/reference/manifest.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/api/permission.{zh,en}.mdc`
- `AGENTS.md`
- `docs/plan-prd/ISSUES.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - `sdkapi` 缺失 / 非法 / 低于门槛现在统一只代表 `SDKAPI_BLOCKED`，不再保留 `SDK_VERSION_MISSING` / `SDK_VERSION_OUTDATED` 这类 legacy warning 语义，避免把 hard-cut 又说回“兼容模式”。
  - 对于“声明了更高 SDK marker”或“使用非 canonical marker 但仍可归一化”的非阻断场景，loader 改为统一发出 `SDK_VERSION_COMPAT_WARNING`，不再误用 `SDK_VERSION_OUTDATED`。
  - `packages/utils` 里的 permission helper 不再把旧 sdk 当成权限绕过路径；同步删除未使用的 plugin i18n key，并把 AGENTS / manifest / permission / runtime-startup 文档统一到当前 `260228 + SQLite SoT` 口径。

### refactor(core-app): 删除 renderer 权限中心未使用的旧 SDK 兼容壳

- `apps/core-app/src/renderer/src/components/permission/index.ts`
- `apps/core-app/src/renderer/src/components/permission/PermissionRequestDialog.vue`（删除）
- `apps/core-app/src/renderer/src/components/permission/PermissionStatusCard.vue`（删除）
- `apps/core-app/src/renderer/src/composables/usePluginPermission.ts`（删除）
- `apps/core-app/src/renderer/components.d.ts`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - 权限中心里三处已经无调用、但仍保留旧 `sdkapi` “跳过权限校验 / 旧版 SDK”语义的 renderer 壳代码已物理删除，避免后续继续把过时状态模型当成可复用实现。
  - `components/permission` 入口与自动组件声明同步收口，只保留仍在设置页使用的 `PermissionList`。
  - compatibility registry 同步移除已删除的 `PermissionStatusCard` 条目，并补齐当前扫描缺失/陈旧记录，`pnpm compat:registry:guard` 恢复通过。

### fix(core-app): 让插件 sdkapi hard-cut 真正落到加载与安装预检

- `apps/core-app/src/main/modules/plugin/plugin-loaders.ts`
- `apps/core-app/src/main/modules/plugin/plugin-installer.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.test.ts`
- `apps/core-app/src/main/modules/plugin/plugin-installer.test.ts`
- `docs/plan-prd/01-project/CHANGES.md`
  - `plugin-loaders` 现在会在读取 manifest 后立刻执行统一 `sdk-compat` gate；缺失、无效或低于门槛的插件会被显式打成 `SDKAPI_BLOCKED`，并以 `load_failed` 保持可见但不可启用，不再只是留下 warning。
  - 安装预检复用同一套 gate，旧插件会在 `prepareInstall` 阶段直接失败，避免进入“已安装但只能以 blocked 留在列表里”的半状态。
  - 补齐主进程定向回归，覆盖 loader 阻断与 installer 预检阻断两条关键路径。

### fix(core-app): 收紧插件安装任务索引到 provider 作用域

- `apps/core-app/src/renderer/src/modules/install/install-manager.ts`
- `apps/core-app/src/renderer/src/modules/install/install-manager.test.ts`
- `docs/plan-prd/01-project/CHANGES.md`
  - 安装状态索引不再把 `providerId::pluginId` 额外挂一份 plain `pluginId` fallback，避免多源市场里同名插件共享同一条安装状态。
  - renderer 侧新增定向回归，锁定“同一 `pluginId` 在不同 provider 下必须命中各自任务；只有 provider-less 插件才允许 plain `pluginId` 查找”的行为。

### fix(core-app): 运行期权限守卫对 sdkapi blocked 返回真实错误语义

- `apps/core-app/src/main/modules/permission/permission-guard.ts`
- `apps/core-app/src/main/modules/permission/permission-guard.test.ts`
- `docs/plan-prd/01-project/CHANGES.md`
  - 运行期权限守卫现在会把 `sdkapi` 不兼容显式返回为 `SDKAPI_BLOCKED`，不再伪装成普通 `PERMISSION_DENIED`。
  - 对应 denied 结果会关闭 `showRequest`，避免上层把 blocked 插件继续引导到权限授权弹窗。

## 2026-04-22

### chore(ci): 下线 contributors README automation 以停止重复 PR 噪声

- `.github/workflows/readme-contributors.yml`
- `.github/workflows/README.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - 官方仓库已手动禁用并同步删除 `readme-contributors.yml`，避免每次 `master` push 都继续生成新的 `contributors readme action update` PR。
  - PR 池清淤策略改为直接保留业务 replacement PR，不再让 README contributors automation 持续占用 open PR 配额。
  - workflow 说明文档已同步标记 contributors README automation 退役，后续如需维护 contributors 列表，改走显式人工变更而不是自动 PR。

### feat(core-app/app-index): 接通 user-managed launcher foundation 最小闭环

- `packages/utils/transport/events/types/app-index.ts`
- `packages/utils/transport/events/index.ts`
- `packages/utils/transport/sdk/domains/settings.ts`
- `packages/utils/__tests__/transport-domain-sdks.test.ts`
- `apps/core-app/src/main/channel/common.ts`
- `apps/core-app/src/main/channel/common.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/search-processing-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/search-processing-service.test.ts`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/plan-prd/TODO.md`
  - `settingsSdk.appIndex` 现已补齐 `listEntries / upsertEntry / removeEntry / setEntryEnabled` typed contract，main `common.ts` 同步注册对应 handler，不再需要独立 `ipcMain.handle` 旁路。
  - `app-provider` 复用现有 `files + file_extensions` 模型支持 user-managed launcher entry 的新增、更新、删除、启用/禁用与冲突校验，manual entry 的启动元数据继续落在扩展字段中，不新增 schema/table。
  - 搜索与执行继续复用现有 `resolveAppItemId`、`TuffItemBuilder`、`TuffSearchResultBuilder` 与 `scheduleAppLaunch`；禁用的 manual entry 会从 recommendation/search 过滤，并可重新启用恢复。
  - 新增定向回归，覆盖 transport 映射、main handler 输入校验、managed entry 落库/冲突/enable toggle，以及 manual disabled entry 的 recommendation 过滤。

### refactor(core-app): 一次性硬收口插件 compat、平台 capability 与启动迁移

- `apps/core-app/src/main/modules/plugin/sdk-compat.ts`
- `apps/core-app/src/shared/plugin-sdk-blocked.ts`
- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `packages/utils/plugin/sdk/channel.ts`
- `packages/utils/plugin/sdk/types.ts`
- `apps/core-app/src/main/modules/global-shortcon.ts`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginDetails.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginPermissions.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingPermission.vue`
- `apps/core-app/src/main/modules/platform/capability-adapter.ts`
- `apps/core-app/src/main/channel/common.ts`
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `apps/core-app/src/main/modules/clipboard.ts`
- `apps/core-app/src/main/core/startup-migrations.ts`
- `apps/core-app/src/main/modules/permission/index.ts`
- `apps/core-app/src/main/modules/permission/permission-store.ts`
- `apps/core-app/src/main/modules/storage/index.ts`
- `apps/core-app/src/renderer/src/modules/startup/startup-migrations.ts`
- `apps/core-app/src/renderer/src/modules/auth/auth-env.ts`
- `apps/core-app/src/renderer/src/modules/storage/theme-style.ts`
- `apps/core-app/src/renderer/src/AppEntrance.vue`
- `apps/core-app/src/renderer/src/components/base/input/FlatMarkdown.vue`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useResize.ts`
- `docs/plan-prd/01-project/CHANGES.md`
  - 插件 `sdkapi` 阻断语义收成唯一真相：快捷键、插件详情页、权限页、设置页统一只展示 blocked 解释，不再保留“legacy SDK 继续运行/跳过权限校验”的双轨文案。
  - 插件运行时桥接不再把 `channel.raw` / `channel.sendSync` 当正式能力暴露；旧插件命中后会得到明确 migration error，而不是继续 silent fallback。
  - 新增统一 platform capability adapter，把 `active app / selection capture / auto paste / native share / permission deep-link / Everything / Tuff CLI` 的 `supported | best_effort | unsupported`、`reason`、`issueCode` 收成同一口径，并接到 `CommonChannel`、OmniPanel、Clipboard 与平台能力设置页。
  - 历史迁移改为启动期一次性执行：main 侧新增 startup migration runner，权限 `permissions.json -> SQLite`、layout opacity 清理、dev data root 迁移不再混在 steady-state 读路径里；renderer 侧把 auth 旧 localStorage 清理和 theme-style 迁移移到统一 startup migrations。
  - 收掉几个明确 debt 热点：`AppEntrance` 去除固定 `100ms` 初始化延时，`FlatMarkdown` 删掉 Milkdown `@ts-ignore` 热点，`CoreBox` resize 删除旧 Element Plus 滚动容器 shim。

### fix(core-app): 收口 Everything 设置页禁用态优先级

- `apps/core-app/src/renderer/src/views/base/settings/SettingEverything.vue`
- `apps/core-app/src/renderer/src/views/base/settings/setting-everything-state.ts`
- `apps/core-app/src/renderer/src/views/base/settings/setting-everything-state.test.ts`
- `docs/plan-prd/01-project/CHANGES.md`
  - Everything 设置页的主状态改为优先反映用户配置态：当用户已手动禁用 Everything 时，不再被后端 `unavailable` 探测结果覆盖成“不可用”。
  - 启用/禁用按钮改为在状态已加载后始终可见，避免“已禁用 + 当前后端不可用”时把控制入口一起隐藏。
  - 安装引导只在“用户已启用但后端不可用”时展示，减少禁用态下的误导信息；新增 renderer 侧纯函数回归锁定组合状态。

### fix(core-app): Everything 运行时故障同次查询直接回退文件索引

- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.test.ts`
- `docs/plan-prd/01-project/CHANGES.md`
  - `EverythingProvider` 新增运行时 fallback 错误语义，显式区分“后端真实故障”和“正常 0 结果”，避免把 SDK/CLI 故障伪装成空搜索。
  - 当 Everything 在查询阶段超时、CLI 失效或 SDK 回退链失败时，当前这一次查询会直接降级到 `file-provider`，不再要求用户再敲一次搜索才能拿到 Windows 文件结果。
  - 设置页 `everything:test` 在后端真实故障时改为明确返回失败，不再误报成“成功但找到 0 个结果”；补齐对应 Provider 回归。

## 2026-04-21

### fix(core-app): Everything CLI 运行时失效后自动退出 stale ready

- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.test.ts`
- `docs/plan-prd/01-project/CHANGES.md`
  - `EverythingProvider` 在 CLI 搜索执行阶段遇到非超时错误时，会立刻把后端标记为 `unavailable` 并记录最近错误，避免 Windows 文件搜索后续继续命中 stale ready 的 Everything 空结果。
  - 这样下一次 provider 路由会自动回退到 `file-provider`，优先保住可用搜索能力，而不是把用户困在“已探测成功但实际不可用”的状态。
  - 补充 Provider 定向回归，覆盖 `es.exe` 运行时失效后 backend 自动降级的路径。

### feat(core-app): 补齐 Everything 搜索结果文件图标预热

- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.test.ts`
- `docs/plan-prd/01-project/CHANGES.md`
  - `EverythingProvider` 新增轻量结果图标缓存与懒提取：优先复用缓存图标，未命中的前排结果会通过现有 icon worker 在后台预热，避免 Windows Everything 结果长期停留在默认文件图标。
  - 预热链路显式复用 `appTaskGate`，并限制单次搜索的后台图标任务数量，避免把快速搜索退化成图标提取风暴。
  - 补充定向回归，覆盖“首次搜索默认图标、后台预热完成后下一次搜索命中缓存图标”的路径。

### fix(core-app): 让 Everything 设置页手动检查真正重探测后端

- `apps/core-app/src/shared/events/everything.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.test.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingEverything.vue`
- `docs/plan-prd/01-project/CHANGES.md`
  - `everything:status` 新增可选 `refresh` 请求参数；设置页首次进入与“立即检查”会触发真实后端重探测，不再只读取启动期缓存状态。
  - `EverythingProvider` 抽出统一 backend refresh 流程，重新启用 Everything 时会即时重跑 `sdk-napi -> cli` 探测链，避免用户在应用运行期间安装/修复依赖后仍长时间停留在 stale unavailable。
  - 补充 Provider 定向回归，锁定“手动刷新会重探测”和“重新启用会重探测”两条设置页关键恢复路径。

### fix(core-app): 修复 Tuff CLI 探测调试日志的元数据类型

- `apps/core-app/src/main/channel/common.ts`
- `docs/plan-prd/01-project/CHANGES.md`
  - `detectTuffCliAvailability()` 的 debug 日志将 `args` 从 `string[]` 收口为单行字符串，避免违反 logger primitive 元数据约束并阻塞 `core-app` node typecheck。

### fix(core-app): 修复翻译 widget 回车复制与 renderer setupState 合并告警

- `apps/core-app/src/renderer/src/components/render/WidgetFrame.vue`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useKeyboard.ts`
- `apps/core-app/src/renderer/src/modules/plugin/widget-host-key-bridge.ts`
- `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts`
- `plugins/touch-translation/widgets/translate-panel.vue`
- `docs/plan-prd/01-project/CHANGES.md`
  - 为 CoreBox 内嵌 widget 增加轻量键盘桥，`touch-translation` 在非 UI View 模式下也能接收到 `ArrowUp / ArrowDown / Enter`，可直接切换 provider 并用回车复制当前选中的中文结果。
  - `WidgetRegistry` 的 setupState 自愈合并从 Proxy 改为基于实例原型的显式上下文合并，减少开发态 `Property '$' was accessed via 'this'` 告警噪音。

### feat(plugins): 增强 touch-translation widget 信息层并发布 1.0.7

- `plugins/touch-translation/index/main.ts`
- `plugins/touch-translation/index/providers/google.ts`
- `plugins/touch-translation/index/types.ts`
- `plugins/touch-translation/widgets/translate-panel.vue`
- `plugins/touch-translation/package.json`
- `plugins/touch-translation/manifest.json`
- `apps/core-app/tuff/modules/plugins/touch-translation/package.json`
- `apps/core-app/tuff/modules/plugins/touch-translation/manifest.json`
- `docs/plan-prd/01-project/CHANGES.md`
  - `touch-translation` widget 默认焦点继续落在右侧结果区，并在结果状态变化后优先选中首个成功 provider，支持在多结果之间稳定切换。
  - 为 Google 结果补充音标、转写、词性、更多释义与发音音频；选中的 provider 会展开更多语言信息，并支持直接播放读音。
  - 同步发布 `1.0.7` 插件包，承接本轮 widget 布局与交互增强。

### refactor(core-app): 对插件 sdk/权限 legacy 路径执行硬切并清理假能力入口

- `apps/core-app/src/main/modules/plugin/sdk-compat.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.ts`
- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/main/modules/permission/permission-store.ts`
- `apps/core-app/src/main/modules/permission/permission-guard.ts`
- `apps/core-app/src/main/modules/division-box/ipc.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingPermission.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginPermissions.vue`
- `apps/core-app/src/renderer/src/views/base/plugin/ViewPlugin.vue`
- `apps/core-app/src/renderer/src/components/plugin/PluginView.vue`
- `apps/core-app/src/main/core/channel-core.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts`
- `apps/core-app/src/main/modules/division-box/ipc.flow-trigger.test.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.test.ts`
- `apps/core-app/src/main/modules/plugin/plugin.test.ts`
- `apps/core-app/src/main/modules/permission/permission-store.test.ts`
- `apps/core-app/src/main/modules/permission/permission-guard.test.ts`
- `docs/plan-prd/01-project/CHANGES.md`
  - `core-app` 新增统一 `sdk-compat` 门槛，缺失/无效/低于 `PERMISSION_ENFORCEMENT_MIN_VERSION` 的插件会在 loader 阶段直接打上 `SDKAPI_BLOCKED` 错误并保持可见但不可启用，运行时权限检查也不再对 legacy sdk 放行。
  - 插件详情页与权限页的阻断态改为只认显式 `SDKAPI_BLOCKED`，不再回退展示“已跳过权限校验”这类 legacy 文案；直接调用 `enable()` 也会被硬切保护，避免通过旁路重新进 runtime。
  - `DivisionBoxEvents.flowTrigger` 过渡期保留结构化失败响应，但不再尝试创建 session，并新增 compat 命中日志；同时删除 renderer 里未使用的 `@plugin-process-message` 直发链路与相关 dead code。
  - 清理 `SearchEngineCore` 中残留的 `ClipboardProvider` 注释注册，并保留 `EverythingProvider` 的结果图标缓存与懒预热链路；`touch-translation` runtime repair 日志明确标记为 compat patch 命中，便于下一轮按 telemetry 决定是否删补丁。

### refactor(core-app): 直接迁移 Tuff CLI probe 到 tuffcli 命令

- `apps/core-app/src/main/channel/common.ts`
- `apps/core-app/src/main/channel/common.test.ts`
- `packages/tuff-cli/src/bin/tuff.ts`
- `packages/tuff-cli/bin/tuffcli.js`
- `packages/tuff-cli/package.json`
- `packages/tuff-cli-core/src/publish.ts`
- `docs/plan-prd/01-project/CHANGES.md`
  - `CommonChannel` 不再调用 `tuff` 兼容 shim 探测 CLI，而是直接改为 `tuffcli --version`；开发态同时补充 workspace `.bin` 与 `packages/tuff-cli/bin/tuffcli.js` 已知入口，避免继续触发旧 shim 的 deprecated 噪音日志。
  - `@talex-touch/tuff-cli` 新增 `tuffcli` 二进制导出，CLI 帮助、错误提示与 `publish` 子命令文案会按实际入口动态展示 `tuff` 或 `tuffcli`，不再把 `tuffcli` 用户引导回旧命令名。

### fix(ci): 让 utils npm 自动发布对重复版本保持幂等

- `.github/workflows/package-utils-publish.yml`
- `.github/workflows/README.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - `package-utils-publish` 在 `npm view` 预检查之后，如果 `npm publish` 因“该版本已存在”失败，会再次向 registry 探测 `@talex-touch/utils@<version>`；只要版本已经可见，就把本次 run 视为成功，避免并发/延迟可见场景下把真实已发布版本误报成 CI 失败。
  - 同步更新 GitHub Actions 工作流说明，明确 `@talex-touch/utils` 的自动发布现在具备重复版本幂等能力。

### fix(plugins): 将翻译共享 helper 下沉到 utils 并修复 widget sandbox 加载失败

- `packages/utils/plugin/translation.ts`
- `packages/utils/plugin/translation.cjs`
- `packages/utils/plugin/sdk/index.ts`
- `plugins/touch-translation/index.js`
- `plugins/touch-translation/index/main.ts`
- `plugins/touch-translation/index/providers/tuffintelligence.ts`
- `plugins/touch-translation/src/composables/useTranslation.ts`
- `plugins/touch-translation/src/composables/useTranslationProvider.ts`
- `plugins/touch-translation/src/providers/tuffintelligence-translate.ts`
- `plugins/touch-translation/widgets/translate-panel.vue`
- `plugins/touch-translation/package.json`
- `plugins/touch-translation/manifest.json`
  - 将翻译方向、provider 顺序、错误文案等共享 helper 从插件本地 `shared/` 目录下沉到 `@talex-touch/utils/plugin`，避免 widget sandbox 因相对路径模块不可用而跳过编译。
  - renderer 侧智能翻译 provider 改为复用 `@talex-touch/utils/plugin/sdk` 现有 intelligence SDK，prelude 侧共享逻辑改为从 utils 包内 runtime helper 读取，不再保留插件私有 shared 运行时代码。
  - 修复 `touch-translate` widget 在沙箱中报 `Module "../shared/translation-shared.cjs" is not available` 的初始化失败问题，并重新生成 `1.0.5` 发布包。

### feat(utils): 新增 sdkapi 260428 并收敛脚手架与插件版本口径

- `packages/utils/plugin/sdk-version.ts`
- `packages/tuff-cli/src/cli/commands/create.ts`
- `packages/unplugin-export-plugin/src/cli/commands/create.ts`
- `plugins/touch-dev-utils/manifest.json`
- `packages/test/src/common/sdk-version.test.ts`
- `apps/core-app/src/main/modules/plugin/install-queue.test.ts`
- `apps/nexus/content/docs/dev/reference/manifest.{zh,en}.mdc`
  - 新增受支持的 `sdkapi: 260428` marker，并将其设为当前推荐版本；现有权限/能力基线保持不变，`260228` 仍是 capability auth 的启用下限。
  - 两个插件创建脚手架改为直接复用 `CURRENT_SDK_VERSION`，避免继续硬编码旧值 `260215` 导致新插件 manifest 与运行时定义漂移。
  - `touch-dev-utils` manifest 从不受支持的 `260421` 收敛到 `260428`，同时补充共享回归测试与文档口径，避免再次触发“unsupported SDK marker”降级告警。

### fix(plugins): 修复 touch-translation widget 空白页并发布 1.0.6

- `plugins/touch-translation/index.js`
- `plugins/touch-translation/index/main.ts`
- `plugins/touch-translation/package.json`
- `plugins/touch-translation/manifest.json`
- `packages/test/src/plugins/translation.test.ts`
  - 移除 `touch-translation` prelude 对 `plugin.search.updateQuery()` 的错误依赖；该 API 不存在于当前插件运行时注入对象中，会导致翻译请求启动阶段直接抛错并留下空白 widget。
  - 翻译请求开始时不再先清空 feature 项，改为在失败时回填错误态 widget，确保 `touch-translate` 至少能给出可见反馈而不是白屏。
  - 新增 prelude 回归测试，锁定 canonical / bundled 产物都不再依赖 `plugin.search.updateQuery`，并同步发布 `1.0.6` 插件包。

### fix(core-app): 自愈 touch-translation 运行时旧包漂移并对齐 bundled 副本

- `apps/core-app/scripts/build-target.js`
- `apps/core-app/scripts/lib/touch-translation-runtime-sync.js`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/main/modules/plugin/runtime/plugin-runtime-repair.ts`
- `apps/core-app/src/main/modules/plugin/runtime/plugin-runtime-repair.test.ts`
- `apps/core-app/src/main/modules/plugin/widget/processors/vue-processor.test.ts`
- `apps/core-app/tuff/modules/plugins/touch-translation/*`
- `packages/test/src/plugins/translation.test.ts`
- `docs/plan-prd/01-project/CHANGES.md`
  - `PluginModule` 在加载 `touch-translation` 前会先检查运行时插件目录；只要发现 manifest/package 版本落后于 bundled 运行时种子，或 widget 仍引用 `../shared/translation-shared.cjs`，就自动用稳定 build 产物重建该插件目录，避免旧安装包继续触发 widget sandbox 初始化失败。
  - `apps/core-app/tuff/modules/plugins/touch-translation` 顶层 runtime 文件已改为对齐 canonical `dist/build` 产物，manifest 保持 runtime 形态（`dev.source=false`），并同步补齐 `1.0.5` 发布包，避免 legacy dev data 迁移再次把旧实现带回用户运行时目录。
  - 新增 widget 依赖边界单测与 translation 插件一致性回归，锁定“relative import 继续非法、translate-panel 不再依赖 `translation-shared.cjs`、bundled/runtime 构件版本与关键入口与 canonical build 保持一致”。

### fix(core-app): 归一化 TPEX 市场插件相对资源地址

- `apps/core-app/src/renderer/src/modules/store/providers/tpex-api-provider.ts`
- `apps/core-app/src/renderer/src/modules/store/providers/tpex-api-provider.test.ts`
  - `TpexApiProvider` 现在会把 TPEX API 返回的相对 `packageUrl / readmeUrl / iconUrl` 按 provider base URL 归一成绝对地址，避免插件详情 README 通过 `network:request` 读取时把 `/api/store/plugins/.../readme` 直接传到主进程并触发 `ERR_INVALID_URL`。
  - 补充 renderer 侧回归测试，固化相对资源地址归一化行为；官方市场插件的 README、图标和下载地址不再依赖后端是否提前返回绝对 URL。

### feat(plugins): 收口翻译插件主链路并新增程序员工具插件

- `plugins/touch-translation/index.js`
- `plugins/touch-translation/index/main.ts`
- `plugins/touch-translation/shared/translation-shared.cjs`
- `plugins/touch-translation/shared/translation-shared.test.ts`
- `plugins/touch-translation/src/composables/useTranslation.ts`
- `plugins/touch-translation/src/composables/useTranslationProvider.ts`
- `plugins/touch-translation/src/components/TranslationCard.vue`
- `plugins/touch-translation/src/components/ProviderConfigModal.vue`
- `plugins/touch-translation/src/pages/multi-translate.vue`
- `plugins/touch-translation/widgets/translate-panel.vue`
- `plugins/touch-dev-utils/manifest.json`
- `plugins/touch-dev-utils/package.json`
- `plugins/touch-dev-utils/index.js`
- `packages/test/src/plugins/translation.test.ts`
- `packages/test/src/plugins/dev-utils.test.ts`
- `apps/nexus/content/docs/guide/features/plugins/dev-utils.{zh,en}.mdc`
- `apps/nexus/content/docs/guide/features/plugins/translation.{zh,en}.mdc`
- `apps/nexus/content/docs/guide/features/plugins/index.{zh,en}.mdc`
- `apps/nexus/content/docs/guide/features/plugin-ecosystem.{zh,en}.mdc`
- `apps/nexus/content/docs/guide/features/recommended-plugins.{zh,en}.mdc`
  - `touch-translation` 新增共享 helper，统一快翻 widget 与多源页的默认翻译方向、provider 顺序、默认启用态和错误文案；`fy-multi` 不再硬编码中文目标语言。
  - provider 展示名、排序和配置保存链路进一步收口；多源页结果卡片复用统一 provider 名称，Baidu / Tencent / MyMemory 配置保存字段补齐。
  - 新增 `touch-dev-utils` 官方插件，保持纯本地与最小权限，支持 UUID、JWT、时间戳、命名转换、Query String 解析/组装、字符串转义/反转义。
  - 补齐插件公共测试与包内共享 helper 测试，并同步 Nexus 插件目录、推荐组合与翻译插件说明文档。

### fix(core-app): 修复插件升级完成后误报 Invalid manifest payload

- `apps/core-app/src/main/modules/plugin/plugin-installer.ts`
- `apps/core-app/src/main/modules/plugin/plugin-installer.test.ts`
  - `PluginInstaller.finalizeInstall()` 走完整安装链路时，`PluginResolver.resolve(..., whole=true)` 成功回调返回的是字符串状态而不是 manifest 对象；安装器现在接受该成功返回值，不再把升级成功误判为 `Invalid manifest payload`。
  - 新增安装器回归测试，固化“完整安装成功回调返回 `success` 字符串”场景，避免后续再次把 preview 阶段和 finalize 阶段的 payload 语义混用。

### fix(core-app): 关闭登录凭证安全存储后冷启动不再触发 Keychain

- `apps/core-app/src/main/modules/auth/index.ts`
- `apps/core-app/src/main/modules/auth/index.test.ts`
- `apps/core-app/src/main/utils/secure-store.ts`
- `apps/core-app/src/main/utils/secure-store.test.ts`
  - `AuthModule` 在 `auth.useSecureStorage=false` 的冷启动分支改为直接进入 session-only 模式，不再隐式清理 `auth.token` secure-store，避免每次启动都触发 macOS Keychain 访问。
  - 历史凭证清理时机收紧为用户显式关闭安全存储或主动登出；重新开启时仅在存在内存 token 的前提下才回写系统安全存储。
  - `secure-store` 改为按需解析 `electron.safeStorage`，移除启动期顶层绑定，避免 `auth/common/network` 这类预加载模块仅因导入 helper 就提前接触系统安全存储。
  - 补齐主进程回归测试，覆盖 session-only 冷启动零触碰、显式 true/false 切换清理/持久化，以及 secure-store 懒加载行为。

### refactor(transport): 统一 main/renderer/plugin stream 内部协议层

- `packages/utils/transport/sdk/stream/protocol.ts`
- `packages/utils/transport/sdk/stream/client-runtime.ts`
- `packages/utils/transport/sdk/stream/server-runtime.ts`
- `packages/utils/transport/sdk/main-transport.ts`
- `packages/utils/transport/sdk/renderer-transport.ts`
- `packages/utils/transport/sdk/plugin-transport.ts`
- `packages/utils/__tests__/transport/stream-protocol.test.ts`
- `packages/utils/__tests__/main-transport-stream.test.ts`
- `packages/utils/__tests__/renderer-transport-stream.test.ts`
- `packages/utils/__tests__/plugin-transport-stream.test.ts`
  - 新增内部共享 stream 协议层，统一 `streamId`、`:stream:*` 事件名派生、port envelope 归一化、client/server 生命周期与 cancel 语义，对外 `ITuffTransport.stream()` / `StreamOptions` / `STREAM_SUFFIXES` 保持不变。
  - `TuffRendererTransport.stream` 与 `TuffPluginTransport.stream` 现在共用同一套 client runtime，默认走 `MessagePort`，port 不可用、打开失败、运行中关闭或 messageerror 时自动回退到现有 `:stream:*` channel。
  - `TuffMainTransport.onStream` 改为委托共享 server runtime，主进程只保留 sender / plugin context 解析与 port 查找；插件来源 stream 会按 plugin scope 解析 port，不再局限于 window scope。
  - server runtime 修复 cancel 状态提前清理导致的晚到 `emit/end` 继续分发问题，取消后不会再把数据或结束事件推回客户端。

### fix(clipboard): 收敛插件图片原图预览与 stream 降级

- `packages/utils/plugin/sdk/clipboard.ts`
- `packages/utils/__tests__/plugin-clipboard-sdk.test.ts`
- `packages/utils/common/utils/safe-shell.ts`
  - `history.onDidChange()` 对旧版插件 transport 的同步 `stream` 抛错增加防御，订阅失败不再冒泡为插件启动失败或用户可见 toast。
  - 新增 Clipboard SDK 单元测试，固化 `Stream is not supported in plugin transport` 兼容降级行为。
  - 保持图片历史列表轻量传输语义：`content/value` 仍为 preview，原图继续通过 `meta.image_original_url` 与 `getHistoryImageUrl(id)` 按需解析。
  - `execFileSafe()` 显式将 Node `stdout/stderr` 归一为 string，避免依赖方类型检查被 Buffer union 拦截。

## 2026-04-20

### fix(clipboard): 修复插件剪贴板 stream 与图片原图预览链路

- `packages/utils/transport/sdk/plugin-transport.ts`
- `packages/utils/plugin/sdk/clipboard.ts`
- `packages/utils/transport/events/types/clipboard.ts`
- `apps/core-app/src/main/modules/clipboard.ts`
  - `TuffPluginTransport.stream` 支持插件通道 fallback stream 事件，避免 clipboard SDK 订阅 `ClipboardEvents.change` 时抛出 `Stream is not supported in plugin transport`。
  - 剪贴板历史 typed item 补充轻量 `thumbnail/meta` 字段，图片项直接携带 `meta.image_original_url`，详情预览可立即切到原始 `tfile://` 图源。
  - 新增插件 transport stream 单元测试，覆盖数据、结束和取消事件。

### fix(core-app): 修复二次启动主窗口恢复与更新页检查入口

- `apps/core-app/src/main/modules/addon-opener-handlers.ts`
- `apps/core-app/src/main/modules/update/UpdateService.ts`
- `apps/core-app/src/main/modules/update/update-system.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUpdate.vue`
  - 二次启动时主窗口恢复链路补齐 `show()`，最小化窗口先 `restore()`，隐藏到托盘的主窗口也会重新显示并聚焦。
  - 更新检查的“无新版本”结果不再作为错误返回，前端会进入“当前已是最新版本”状态并清空错误信息。
  - 设置页操作区在未下载完成时恢复“检查更新”主按钮；“查看下载包”仅在已有缓存 release 时作为辅助入口展示。

### fix(tuff-cli): 在个人信息菜单补齐退出登录入口

- `packages/tuff-cli/src/bin/tuff.ts`
- `packages/tuff-cli-core/src/repositories.ts`
- `packages/tuff-cli-core/src/__tests__/repositories.test.ts`
- `packages/tuff-cli/src/cli/repositories.ts`
- `packages/tuff-cli/src/cli/i18n/locales/zh.ts`
- `packages/tuff-cli/src/cli/i18n/locales/en.ts`
- `packages/tuff-cli/package.json`
  - `tuff` 交互式个人信息页新增“退出登录 / Logout”选项，复用现有 `clearAuthToken` 与退出成功提示，避免用户只能进入设置页才能登出。
  - 本地插件仓库记录跳过系统临时目录，并在展示时过滤已残留的临时目录项，避免 `tuff-*-publish-*` 临时发布目录与真实插件工程同时显示成多个同名插件。
  - `@talex-touch/tuff-cli` 版本提升到 `0.0.2`，用于发布已补齐账号菜单的 CLI 包。

### fix(nexus): 收敛文档路由切换时的 chunk 拉取失败白屏

- `apps/nexus/nuxt.config.ts`
  - Nexus 默认关闭 `NuxtLink` 可视区预取，避免文档页左侧大量链接同时触发 `_nuxt` chunk / payload 预加载，在 Cloudflare challenge / rate-limit 场景下放大成 `429` 与动态 import 失败。
  - 开启 `emitRouteChunkError: 'automatic-immediate'`，路由切换时若 chunk 拉取失败会按目标路径即时重载，避免 docs 页面只更新 URL/侧栏 active、正文区留空。

### fix(core-app): 恢复 legacy 插件 sdkapi 兼容策略

- `packages/utils/plugin/sdk-version.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.ts`
- `apps/core-app/src/main/modules/plugin/plugin-resolver.ts`
- `apps/core-app/src/main/modules/plugin/plugin-installer.ts`
- `apps/core-app/src/main/modules/permission/permission-store.ts`
- `apps/core-app/src/main/modules/permission/permission-guard.ts`
- `apps/nexus/content/docs/dev/reference/runtime-startup-env.zh.mdc`
- `apps/nexus/content/docs/dev/reference/runtime-startup-env.en.mdc`
  - 注：这是 2026-04-17 的阶段性回退记录，已在 2026-04-22/2026-04-23 被后续 `sdkapi` hard-cut 收口替代。
  - 未声明 `sdkapi` 或低于 `251212` 的 legacy 插件恢复为 warning + 权限兼容跳过，不再在加载、安装预检或运行期权限守卫中被误标记为 `SDKAPI_BLOCKED`。
  - `resolveSdkApiVersion` 对有效但低于首个支持标记的版本保留原始版本号，避免把旧但合法的 `YYMMDD` sdkapi 误报为 invalid。
  - Runtime startup issue code 文档同步收口：`SDKAPI_BLOCKED` 仅作为历史/保留硬阻断码，legacy 缺失或过低走 `SDK_VERSION_MISSING` / `SDK_VERSION_OUTDATED` warning。

### fix(tuff-cli): 修复插件发布误判并收口 npm 自包含包

- `packages/tuff-cli-core/src/publish.ts`
- `packages/tuff-cli/src/bin/tuff.ts`
- `packages/tuff-cli/package.json`
- `packages/tuff-cli/tsup.config.ts`
  - `tuff publish` 默认改走 Nexus Dashboard 版本发布链路：根据 `manifest.id` 解析 Dashboard 插件标识，读取 `/api/dashboard/plugins` 定位插件，再上传到 `/api/dashboard/plugins/{id}/versions`。
  - 发布响应改为强校验 JSON 结构与 `version.id/version/status`，`200 + text/html` 的 Nuxt 404 页面不再被误判为发布成功；失败信息包含 endpoint、HTTP 状态与响应摘要。
  - `tuff login` 显式命令默认使用浏览器设备授权流程，`tuff login <token>` 保留为兼容入口；401 发布失败会提示重新授权。
  - `@talex-touch/tuff-cli` npm 包改为自包含内部 workspace CLI 依赖，发布包不再携带 `workspace:*` 运行时依赖和 `src` 源码目录。

### fix(core-app): CoreBox 第三方 App 启动改为后台 handoff

- `apps/core-app/src/main/modules/box-tool/addon/apps/app-launcher.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`
  - CoreBox 执行 `app-provider` 应用结果时立即隐藏窗口并 fire-and-forget 发送执行事件，不再等待第三方 App 完全启动后才恢复交互。
  - AppProvider 将 `path / shortcut / uwp` 启动统一交给后台 launcher；`shell.openPath` 错误、`spawn` 同步错误或早期非 0 退出会通过系统通知上报启动失败。
  - 保留 `shortcut` 的 `launchArgs / workingDirectory` 和 Windows Store `explorer.exe shell:AppsFolder\\...` handoff 行为，普通插件 feature 与系统 action 仍走原等待语义。

### fix(core-app): 修复 webcontent 插件静态路由加载

- `apps/core-app/src/main/modules/plugin/view/plugin-view-loader.ts`
- `apps/core-app/src/main/modules/plugin/view/plugin-view-loader.test.ts`
  - 插件生产本地加载 extensionless route 时，优先解析同名预渲染 HTML 文件（如 `/clipboard-manager` → `clipboard-manager.html`）；文件不存在才回退到原有 `index.html#...` hash 路由。
  - 修复 `clipboard-history` 这类已打包静态路由插件在 prod 中被加载到 `index.html#/clipboard-manager` 后显示 `Not here` 的问题，同时保留已有 SPA/hash 插件行为。
  - 补齐 PluginViewLoader 回归测试，覆盖同名预渲染页面优先级。

### fix(core-app): 收口 2.5.0 legacy blocker 与 guard scope

- `scripts/lib/scan-config.mjs`
- `scripts/legacy-boundary-allowlist.json`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
- `packages/utils/transport/events/types/core-box.ts`
- `packages/utils/transport/events/index.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/window.ts`
- `apps/core-app/src/main/modules/division-box/session.ts`
- `apps/core-app/src/main/modules/division-box/flow-trigger.ts`
- `apps/core-app/src/main/modules/division-box/flow-trigger.test.ts`
- `apps/core-app/src/main/modules/division-box/ipc.ts`
- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `apps/core-app/src/renderer/src/modules/hooks/core-box.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useVisibility.ts`
- `apps/core-app/src/renderer/src/modules/channel/channel-core.ts`
- `apps/core-app/src/renderer/src/modules/store/providers/nexus-store-provider.ts`
- `apps/core-app/src/renderer/src/modules/store/providers/nexus-store-provider.test.ts`
  - `apps/core-app/scripts` 与 `retired-ai-app/scripts` 已纳入 legacy/compat 显式扫描范围，移除脚本级 scope leak；新增命中手工补入 allowlist 与 compatibility registry，未使用 `--write-baseline` 覆盖基线。
  - CoreBox trigger 新增 typed `CoreBoxEvents.ui.trigger`，CoreBox/DivisionBox renderer 监听与 main push 统一走 event catalog；DivisionBox 不再直接广播旧 channel type，renderer raw channel 兼容边界同步移除 `LEGACY_CHANNEL_*` 内部命名。
  - 插件 channel bridge 移除 legacy header type 语义，仅保留 transport source 与 plugin context；动态插件事件仍通过现有 raw event transport 承载，不新增 SDK/API。
  - Nexus store provider 只接受 Nexus API `{ plugins: [...] }` 响应；旧数组 manifest、旧 `path` 包地址与 base URL 自动拼接改为结构化错误。
  - FlowTrigger 保留注册表面，但触发时显式返回 `FLOW_TRIGGER_UNAVAILABLE`，避免在 Flow runtime 未接入前创建假成功 session。
  - permission JSON->SQLite、dev data root migration、theme localStorage migration 已从 release blocker 降权为 `core-app-migration-exception`，保留定向 regression 责任。
  - 自动门禁证据：`git diff --check`、`pnpm docs:guard`、`pnpm docs:guard:strict`、`pnpm compat:registry:guard`、`node scripts/check-legacy-boundaries.mjs`、`pnpm network:guard` 已通过；`pnpm legacy:guard` 在 legacy/compat 子门禁通过后被既有 `size:guard` 大文件基线漂移拦截；当前 worktree 未安装本地依赖，CoreApp vitest 与 typecheck 待依赖恢复后补跑。

### docs(core-app): 锁定 2.5.0 前置治理口径

- `docs/plan-prd/TODO.md`
- `docs/plan-prd/README.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/docs/compatibility-debt-registry.csv`
  - 当前主线从 `Nexus 设备授权风控` 调整为 `CoreApp legacy 清理 + Windows/macOS 2.5.0 阻塞级适配`；Nexus 风控保留实施入口与历史证据，但不再作为当前主线。
  - `2.5.0` 前 CoreApp 剩余 legacy/compat 债务必须关闭或显式降权，禁止新增 legacy 分支、raw channel、旧 storage protocol、旧 SDK bypass。
  - Windows/macOS 回归设为 release-blocking；Linux 仅记录 `xdotool` / desktop environment 限制与非阻塞 smoke，不作为 `2.5.0` blocker。
  - 本条仅记录文档口径与清册调整，不表示运行时代码已完成清理或平台回归已通过。

### fix(nexus/core-app): 收口组件文档页卡顿与 Windows Everything 搜索稳定性

- `apps/nexus/app/components/docs/DocsComponentSyncTable.vue`
- `apps/nexus/app/components/DocsSidebar.vue`
- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/server/api/docs/component-sync.get.ts`
- `apps/nexus/server/api/docs/navigation.get.ts`
- `apps/nexus/server/api/docs/page.get.ts`
- `apps/nexus/server/api/docs/sidebar-components.get.ts`
- `apps/nexus/app/components/content/TuffDemoWrapper.vue`
- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
  - Nexus 组件同步表改为读取服务端轻量数据源，不再在浏览器端触发 Nuxt Content 全量组件文档查询；组件索引页加入 prerender，降低 prod 首次点击 `/docs/dev/components` 时的 sqlite/wasm 初始化风险。
  - `DocsSidebar` 不再把 `category/syncStatus/verified` frontmatter 当作 Nuxt Content SQL 列直接投影，组件页 SSR 阶段不再因为 `no such column: "category"` 注入错误 payload。
  - 文档正文页与侧栏主导航改为走 `/api/docs/page`、`/api/docs/navigation`、`/api/docs/sidebar-components` 服务端接口，客户端不再为 `/docs/guide/*` 与 `/docs/dev/*` hydration / 路由切换初始化 Nuxt Content sqlite wasm，修正自定义域名受 Cloudflare challenge 时正文丢失、侧栏报错和原始 i18n key 直接落屏的问题。
  - 文档页服务端取数补齐 locale 感知路径回退：优先命中 `${path}.${locale}`，再回退 `index` 与无 locale 文档，保证 `en/zh` 切换时标题、描述和正文都能落到同一套内容解析链路。
  - `TuffDemoWrapper` 改为基于文档实际引用 demo 的显式 registry 懒加载，不再在 wrapper 初始化阶段枚举全部 demo 组件。
  - Everything provider 补齐 AbortSignal 取消、多词查询透传、CLI CSV 解析、SDK 目录元数据保留与状态错误码字段；SearchCore 明确 `@everything` / `@file` Windows 路由，并将 inputs/filter 纳入搜索缓存 key。
  - Targeted regression 已覆盖 SDK->CLI fallback、CLI 解析、SDK abort、目录元数据、`@file/@everything` 路由与同文本不同输入缓存隔离。

## 2026-04-19

### fix(core-app): 修正托盘运行态回显、补齐 Windows Store 元数据并持久化下载中心视图模式

- `apps/core-app/src/main/modules/tray/tray-manager.ts`
- `apps/core-app/src/main/modules/tray/tray-manager.test.ts`
- `apps/core-app/src/main/channel/common.ts`
- `packages/utils/transport/events/types/app.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/win.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/win.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/search-processing-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/search-processing-service.test.ts`
- `apps/core-app/src/renderer/src/components/download/DownloadCenterView.vue`
- `packages/utils/common/storage/entity/app-settings.ts`
  - Tray 初始化阶段改为基于主窗口真实 `isVisible()` 同步运行态，`TraySettings` 新增 `trayReady / windowVisible`，静默启动与 macOS `hideDock + showTray + startSilent` 首帧不再回显错误的“窗口已显示/托盘已就绪”假状态。
  - Windows `Get-StartApps` 扫描补齐 `PackageFamilyName / InstallLocation`，并在 TS 侧解析 `AppxManifest.xml` 的 `DisplayName / Description / VisualElements logo`；Windows Store / UWP 搜索结果现在保留 `Windows Store` 副标题，同时补上真实标题、描述与 data URL 图标，启动链路仍保持 `explorer shell:AppsFolder\\...`。
  - 下载中心 `detailed / compact` 视图模式接入 `appSetting.downloadCenter.viewMode` 统一持久化，关闭视图、跨页面切换和重启后都能按上次选择回显；缺失值或非法旧值会自动回退并修正为 `detailed`。

## 2026-04-18

### fix(core-app): 补齐存储统计通道并收敛设置页 SVG/i18n/Transition 控制台告警

- `apps/core-app/src/main/channel/common.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useSvgContent.ts`
- `apps/core-app/src/renderer/src/components/base/TuffIcon.vue`
- `apps/core-app/src/renderer/src/views/storage/Storagable.vue`
- `apps/core-app/src/renderer/src/views/base/styles/ThemeStyle.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
  - `system:get-storage-usage` 重新接回主进程 `CommonChannel`，存储页摘要、插件占用和数据库表统计不再因为缺少 handler 直接报错。
  - `useSvgContent` 对同源 `/api/*` SVG 优先走 renderer 侧请求并关闭外层重复重试，避免请求首次失败后继续被主进程 network cooldown 放大成二次噪音；`TuffIcon` 同步补齐直接 `<img>` 回退，SVG 内容预取失败时不再立刻退成错误占位。
  - `Storagable` 与 `ThemeStyle` 收敛为单一根节点，修复路由 `<Transition>` 下的 fragment 根节点告警；补齐 `settingSentry` 语言包，设置页不再持续输出缺失 key 警告。

### fix(core-app): 收敛 settings 表单组件并修正权限/快捷方式/下载入口展示

- `apps/core-app/src/renderer/src/components/tuff/TuffGroupBlock.vue`
- `apps/core-app/src/renderer/src/components/tuff/TuffBlockInput.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingTools.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingSetup.vue`
- `apps/core-app/src/renderer/src/views/base/settings/components/ShortcutDialog.vue`
- `apps/core-app/src/renderer/src/views/base/settings/components/ShortcutDialogRow.vue`
- `apps/core-app/src/renderer/src/components/download/FlatDownload.vue`
- `apps/core-app/src/main/modules/system/permission-checker.ts`
  - settings 页残留的原生文本/数字输入统一切回 `tuffex` 输入体系，`group` 内块级子项样式也收敛为无圆角基线，避免设置页继续出现手写输入壳子和分组圆角不一致的问题。
  - 权限设置页的通知权限状态改为“无法校验即明确标记为 unsupported”，不再把不可验证状态伪装成已授权；只有可请求的权限才继续展示“打开系统设置”动作。
  - 快捷方式弹层头部改成标题、搜索框、关闭按钮同一行，表格区恢复单一滚动容器并保留底部固定操作区；下载中心入口按钮改成单行展示，有任务时直接用任务摘要替换“下载中心”标题。

### fix(core-app): 收口下载设置展示门控并修复窄窗布局挤压

- `apps/core-app/src/renderer/src/views/base/settings/AppSettings.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingDownload.vue`
- `apps/core-app/src/renderer/src/components/tuff/TuffBlockSlot.vue`
- `apps/core-app/src/renderer/src/components/tuff/TuffBlockSelect.vue`
- `apps/core-app/src/renderer/src/components/tuff/TuffBlockInput.vue`
- `apps/core-app/src/renderer/src/components/tuff/TuffBlockFlatSelect.vue`
- `packages/tuffex/packages/components/src/select/src/TxSelect.vue`
- `packages/tuffex/packages/components/src/popover/src/TxPopover.vue`
- `packages/tuffex/packages/components/src/base-anchor/src/TxBaseAnchor.vue`
  - 下载设置页现在仅在“关于”里的“高级设置”开启后展示，和既有“高级设置会显示下载设置”的产品语义保持一致，默认设置列表不再暴露这组偏底层的下载参数。
  - 下载设置块内部的选择器、临时目录展示与操作区补齐宽度约束和自适应增高，长路径与窄窗口场景不再把左侧标题/描述挤成竖排。
  - 通用块行布局同步收敛为“左侧信息自适应收缩、右侧控件按内容宽度贴右”；同时修复 Tuffex `reference-full-width` 链路里 `TxSelect` 触发器未随锚点拉满的问题，更新设置等下拉控件右侧不再残留一段空白点击区。
  - 应用侧 `TuffBlockInput / TuffBlockSelect / TuffBlockFlatSelect` 的默认控件宽度对齐到 Tuffex block 组件基线，宽窗口下不再把普通输入框和下拉框放大成一整条长控件；需要更宽布局时仍可通过自定义 slot 覆盖。

### fix(core-app): 收敛 macOS 辅助功能门控并完成 auth 存储收口

- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `apps/core-app/src/main/modules/omni-panel/index.test.ts`
  - OmniPanel 在 macOS 上新增辅助功能门控：未授予 Accessibility 权限时不再启动全局输入 hook，右键长按链路会在启动期直接短路，避免应用一启动就触发“辅助功能访问”系统弹窗。
  - `CommandOrControl+Shift+P` 仍可继续打开 OmniPanel，但在未授权场景会自动退化为“仅打开面板、不抓取当前选中文本”；所有 `System Events` / `osascript` 选区捕获路径都增加前置检查，避免再次触发系统权限请求。
- `apps/core-app/src/main/modules/auth/index.ts`
- `apps/core-app/src/renderer/src/modules/auth/auth-env.ts`
- `apps/core-app/src/renderer/src/modules/auth/auth-env.test.ts`
- `apps/core-app/src/renderer/src/modules/auth/useAuth.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUser.vue`
- `packages/utils/common/storage/entity/app-settings.ts`
  - auth 存储链路完成硬切：登录凭证继续以系统安全存储为默认路径，系统能力不可用时进入显式 degraded session 模式，不再回退到 legacy 明文 seed / 本地配置旁路。
  - renderer 侧 legacy `localStorage` 认证键仅做清理，不再导入 secure-store；旧 `machineSeed` / `allowLegacyMachineSeedFallback` 等配置字段移除，旧数据不再参与运行时决策。
  - 用户设置页同步暴露安全存储不可用状态，并收敛说明文案到“系统安全存储 / degraded session”两种真实语义。

### Core-App 兼容层硬切

- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.ts`
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `apps/core-app/src/main/modules/omni-panel/index.test.ts`
- `apps/core-app/src/shared/events/omni-panel.ts`
  - 插件触发输入统一收敛为 `TuffQuery`；OmniPanel deprecated toggle event/type 删除，旧 SDK 插件继续由 `SDKAPI_BLOCKED` 直接阻断，不再保留运行时兼容旁路。
  - 安装阶段补齐同一套 `sdkapi` Hard-Cut；OmniPanel 选中文本抓取在 Linux/macOS 失败场景补充显式 `supportLevel / issueCode / issueMessage`，不再把“空上下文”当作静默成功。
- `apps/core-app/src/main/modules/ai/tuff-intelligence-storage-adapter.ts`
- `apps/core-app/src/main/service/store-api.service.ts`
- `apps/core-app/src/main/service/store-api.service.test.ts`
- `apps/core-app/src/main/service/agent-store.service.ts`
- `apps/core-app/src/main/service/agent-store.service.test.ts`
- `apps/core-app/src/main/core/touch-app.ts`
- `apps/core-app/src/main/modules/file-protocol/index.ts`
- `apps/core-app/src/main/modules/file-protocol/index.test.ts`
- `apps/core-app/src/shared/update/channel.ts`
- `apps/core-app/src/shared/update/channel.test.ts`
  - Intelligence prompt 存储切到 prompt registry 单一 SoT；Store/Agent 侧停止读取 legacy key；`touch-app` 启动只认统一 `app-setting.ini`；`tfile://` 仅接受 canonical `tfile:///absolute/path`；update channel 仅接受 canonical 枚举值。
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.regression-baseline.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/channel/common.ts`
- `apps/core-app/src/main/channel/common.test.ts`
- `apps/core-app/src/main/modules/flow-bus/native-share.ts`
  - Windows 文件搜索改为 `Everything` 可选加速 + `file-provider` 保底：普通查询优先 Everything，过滤/索引型查询直接走 `file-provider`，Everything 不可用时自动回退，不再空结果。
  - 平台 capability 文案收敛：`native-share` 仅 macOS 标记 `supported`，Win/Linux 不再把 `mailto` 描述成原生系统分享。
- `apps/core-app/src/renderer/src/views/base/styles/LayoutSection.vue`
- `apps/core-app/src/renderer/src/views/base/styles/LayoutAtomEditor.vue`
- `apps/core-app/src/main/modules/box-tool/file-system-watcher/file-system-watcher.ts`
- `apps/core-app/src/main/modules/permission/permission-store.ts`
- `apps/core-app/src/main/modules/tray/tray-manager.ts`
  - 布局设置页移除 disabled “Coming Soon/Publish to Cloud” 正式入口；`file-provider` / `file-system-watcher` / `permission-store` / `tray-manager` / `file-protocol` 移除 ad-hoc `console.*`，统一走项目 logger。

### fix(core-app): 修复 Windows 应用扫描、默认主唤起快捷键与托盘直启

- `apps/core-app/src/main/modules/box-tool/addon/apps/*`
  - Windows 应用扫描现在为 `.lnk` 保留 `target + args + cwd` 启动元数据，并新增 `stableId / launchKind / launchTarget / launchArgs / workingDirectory / displayPath` 统一应用身份与启动描述，修复一批依赖快捷方式参数的桌面应用无法正确纳入或启动的问题。
  - 新增 `Get-StartApps` 补扫链路，Windows Store / UWP 应用现在会以 `shell:AppsFolder\\<AUMID>` 形式入库与去重，并支持通过 `explorer.exe` 执行；搜索结果副标题优先展示 `displayPath`，避免直接暴露 `shell:AppsFolder\\...` 伪路径。
- `apps/core-app/src/main/modules/box-tool/core-box/index.ts`
  - 主唤起快捷键 `core.box.toggle` 默认改为启用，仅影响新安装用户；`core.box.aiQuickCall` 继续默认关闭，历史 `shortcut-setting` 不做迁移与回写。
- `apps/core-app/src/main/index.ts`
- `apps/core-app/src/main/modules/tray/tray-manager.ts`
- `apps/core-app/src/main/channel/common.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingSetup.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/SetupPermissions.vue`
- `packages/utils/common/storage/entity/app-settings.ts`
- `packages/utils/transport/events/types/app.ts`
  - 托盘模块不再受 `setup.experimentalTray` 运行时门控，启动时会直接进入 tray 初始化链路；设置与引导页同步移除 `experimentalTray` 语义，运行态只保留 `showTray / hideDock / startSilent / closeToTray` 等真实配置项。

### fix(release): 让外部部署与 Nexus 边缘拦截不再误伤发布流水线

- `.github/workflows/aiapp-image.yml`
  - AI 镜像 push 成功后触发 1Panel webhook 现在改为有限重试 + warning 降级；当 `ONEPANEL_WEBHOOK_URL` 指向的 1Panel 暂时不可达时，不再把整个 `AI Image Publish` workflow 误判为失败。
- `.github/workflows/build-and-release.yml`
  - `sync-nexus-release` 保留 Cloudflare access token 透传能力，默认不做 challenge 降级跳过；challenge 产生时会保留失败行为，便于在 CI 里暴露真实问题。
- `.github/workflows/README.md`
  - 同步补充 AI webhook 与 Nexus sync 的降级口径，明确“镜像已发布 / GitHub Release 已创建”与“外部部署触发 / 外站元数据同步”在 CI 中的阻塞边界。

### fix(release): 回归 sync-nexus 步骤级失败语义

- `.github/workflows/build-and-release.yml`
  - 移除 `Cloudflare challenge` 的流程级/步骤级跳过逻辑，改为严格按 Nexus API HTTP 响应码判断；所有 API 失败都直接进入失败分支，避免 CI 被外部链路策略静默掩盖。

### fix(release): 收紧 Nexus sync 成功与分流判定

- `.github/workflows/build-and-release.yml`
  - `POST /api/releases` 仅在返回精确的 `Release tag already exists.` 错误时才转 `PATCH`，避免把其他 400 参数错误误判成“已存在后更新”。
  - `create / patch / get / link-github / publish` 统一补最小 JSON 结构校验，不再把任意 2xx 返回体都视为成功，降低 HTML 错页或代理页被误判为成功的风险。
- `.github/workflows/README.md`
  - 同步记录 Nexus sync 的重复 tag 分流与最小响应结构校验规则，便于后续维护发布流水线。

### fix(release): 为 Nexus release 同步补 Cloudflare challenge 诊断与可选 OOB 透传

- `.github/workflows/build-and-release.yml`
  - `sync-nexus-release` job 现在支持从 GitHub Actions vars / secrets 读取可选 `ADMIN_CF_ACCESS_CLIENT_ID` 与 `ADMIN_CF_ACCESS_CLIENT_SECRET`，自动透传到 Nexus release 写接口，便于后续用 Cloudflare Access service token 绕过边缘 challenge。
  - 对 Nexus `create / patch / link-github / publish` 写请求统一补 `Accept` 与稳定 `User-Agent`，并抽成共享 shell helper，避免每个 curl 分支继续散落重复 header 组装逻辑。
  - 当上游返回 Cloudflare challenge HTML 时，workflow 会显式给出“配置 `NEXUS_SYNC_BASE_URL` 或 OOB service token”提示，不再直接把整页 challenge 当普通失败输出，便于后续直接定位发布阻塞点。

## 2026-04-17

### refactor(core-app): 收敛插件安装与日志服务主进程日志出口

- `apps/core-app/src/main/modules/plugin/install-queue.ts`
- `apps/core-app/src/main/modules/plugin/plugin-installer.ts`
- `apps/core-app/src/main/modules/plugin/plugin-ui-utils.ts`
- `apps/core-app/src/main/modules/plugin/dev-plugin-installer.ts`
- `apps/core-app/src/main/modules/plugin/plugin-resolver.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/main/service/plugin-log.service.ts`
  - `PluginInstaller`、`PluginInstallQueue`、`DevPluginInstaller` 与 `plugin-ui-utils` 的下载进度、安装元数据持久化、拒绝/失败清理、活跃 UI 检测与关闭流程也统一切到 `PluginSystem` logger，插件安装热路径不再在不同文件里混用 `console.warn/error`。
  - `PluginResolver` 安装/更新/解析流程的裸 `console.*` 已统一切到 `PluginSystem` logger，补齐 `pluginName / source / targetDir / whole / removedCount` 最小上下文，插件安装失败与清理失败不再只剩字符串拼接日志。
  - `plugin-module` 内插件 storage/sqlite/api/store 等 IPC handler 的 catch 分支统一走 `PluginSystem:IPC` helper，保留原有返回值语义，同时把几十处散落的 `console.error` 收敛成同一命名空间，便于后续按 `handler` 聚合排障。
  - `plugin-log.service` 的 session 列表、buffer 查询、订阅管理与打开日志目录/文件改为统一 logger；过程态查询降到 `debug`，`shell.openPath()` 失败会返回真实错误而不是一律回 `success`。

### refactor(core-app): 收敛 UpdateSystem 主进程日志到统一 logger 体系

- `apps/core-app/src/main/modules/update/update-system.ts`
  - `UpdateSystem` 内剩余裸 `console.*` 已全部替换为统一 `createLogger('UpdateSystem')` 出口，避免更新检查、下载安装、renderer override 与 macOS 自替换流程继续混用主进程原生控制台输出。
  - 更新下载、renderer override 调度/跳过、签名校验、安装触发、目录创建与强退兜底等路径统一补 `tag / taskId / asset / coreRange / path / reason` 最小上下文，主进程排障不再依赖字符串拼接搜索。
  - 将“override 已激活”“override 已禁用”等纯过程态日志降为 `debug`，保留真正需要线上观察的 `info / warn / error`，继续压低更新热路径噪声。

### fix(core-app): 收口 beta 更新版本判断与更新弹窗重复展示

- `apps/core-app/src/main/utils/version-util.ts`
- `apps/core-app/src/main/modules/update/UpdateService.ts`
- `apps/core-app/src/main/modules/update/update-system.ts`
- `apps/core-app/src/shared/update/version.ts`
- `apps/core-app/src/shared/update/version.test.ts`
- `apps/core-app/scripts/build-target.js`
- `apps/core-app/src/renderer/src/modules/hooks/useUpdateRuntime.ts`
- `apps/core-app/src/renderer/src/modules/mention/dialog-mention.ts`
- `apps/core-app/src/renderer/src/modules/update/update-dialog-session.ts`
- `apps/core-app/src/renderer/src/modules/update/update-dialog-session.test.ts`
  - `version-util` 读取应用版本时补上根 `package.json` 兜底，避免主进程单例早于 `polyfills` 初始化时退回到 `app.getVersion()`，把 `2.4.9-beta.15` 误判成打包产物里的 `2.4.9-SNAPSHOT.15`。
  - 主进程 `UpdateService` 与 `UpdateSystem` 统一复用 shared update version helper：`beta / alpha / snapshot` 现在会落到同一 preview 比较序列，缓存命中、官方源 fallback 与 GitHub 返回乱序场景都不再把 `beta.12` 误当成比 `beta.15` 更新。
  - `build-target.js` 改为区分 runtime version 与 builder version：beta 仍按 snapshot build 产线打包，但仅 Windows builder metadata 继续做 `SNAPSHOT` 兼容转换；macOS/Linux 运行时版本保持 `package.json` 的 beta tag，不再把安装包自身版本写坏成 snapshot。
  - renderer 侧更新弹窗收口为单入口，新增会话级 tag 去重/动作中锁/成功后抑制，`checkApplicationUpgrade()` 与 `UpdateEvents.available` 不再为同一版本连续弹两次；手动 force check 仍可绕过会话抑制重新查看。
  - `blowMention()` 补齐显式 `z-index`，修复点“下次提醒我”后又弹出一层低层级不可操作 dialog 的问题。

### fix(core-app): 收敛 Download 迁移链日志并修复首迁移缺陷

- `apps/core-app/src/main/modules/download/logger.ts`
- `apps/core-app/src/main/modules/download/migrations.ts`
- `apps/core-app/src/main/modules/download/migration-manager.ts`
- `apps/core-app/src/main/modules/download/migration-manager.test.ts`
  - 新增 download 迁移链专用 logger，`migrations.ts` 与 `migration-manager.ts` 内裸 `console.*` 全部切到统一日志出口，并补 `dbPath / oldDbPath / version / migration / count / durationMs` 最小上下文。
  - `allMigrations` 补回 `create_base_tables`，`migration-manager` 在导入 legacy 下载数据前先确保新库 schema 已完成迁移初始化，避免首次迁移直接向不存在的表写入。
  - 修正 `download_chunks.index` 建索引时的 SQL 转义问题，并补齐测试中的 Electron 路径 mock 与 legacy 文件名约定，使 `migration-manager.test.ts` 能稳定覆盖迁移管理器与迁移执行器整条链路。

### fix(core-app): 收敛主进程预期网络失败与可选取消日志噪声

- `apps/core-app/src/main/core/channel-core.ts`
- `apps/core-app/src/main/core/channel-missing-handler-policy.ts`
- `apps/core-app/src/main/core/channel-missing-handler-policy.test.ts`
- `apps/core-app/src/main/modules/analytics/startup-analytics.ts`
- `apps/core-app/src/main/modules/analytics/storage/db-store.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/manager.ts`
- `apps/core-app/src/main/modules/sentry/sentry-service.ts`
- `apps/core-app/src/main/modules/update/UpdateService.ts`
- `apps/core-app/src/main/utils/network-log-noise.ts`
- `apps/core-app/src/main/utils/network-log-noise.test.ts`
  - 抽出 `network-log-noise.ts` 作为主进程统一降噪规则，集中识别 `localhost:3200` fallback、连接拒绝、DNS/timeout、`NETWORK_HTTP_STATUS_403/429`、Cloudflare challenge 等预期远端失败；`startup-analytics`、`sentry-service`、`UpdateService` 不再各自维护一份字符串匹配。
  - `SentryService` 对远端 HTML 响应改为安全摘要（如 `cloudflare_challenge` / `html_response`），避免把整页 challenge/body 直接写入错误日志；`UpdateService` 对上游 rate-limit 与远端不可用统一落 `check_deferred`，不再把这类预期失败记成常规错误。
  - `channel-core` 新增可测的 missing-handler policy，transport 可选 `:stream:cancel` 在未注册 handler 时直接安静返回成功且不计入 no-handler 指标；`analytics db-store` 仅在真实丢弃/失败时输出 `warn`，纯节流压力降到 `info`，`CoreBoxManager` 退出非 UI 模式时不再额外 `console.warn`。

### fix(core-app): 收口 CoreBox runtime teardown 边界

- `apps/core-app/src/main/core/runtime-accessor.ts`
- `apps/core-app/src/main/core/runtime-accessor.test.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/index.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/index.test.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/manager.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/meta-overlay.ts`
  - `runtime-accessor` 新增可空读取入口，避免 `core-box` 在窗口关闭、快捷键反注册与 overlay 延后回调阶段继续依赖 try/catch 兜住 “runtime not registered”。
  - `CoreBoxModule.onDestroy()` 调整为先释放快捷键、transport disposer 与诊断订阅，最后再清 runtime 注册，避免 teardown 中残留回调继续命中已清理 runtime。
  - `CoreBoxManager` 与 `MetaOverlayManager` 在 runtime 缺失时改为安静跳过窗口同步/动作派发，只保留本地 UI 收尾，不再在退出路径额外抛出主进程异常。

### refactor(core-app): 收敛 DivisionBox 主进程日志到统一 logger 体系

- `apps/core-app/src/main/modules/division-box/logger.ts`
- `apps/core-app/src/main/modules/division-box/module.ts`
- `apps/core-app/src/main/modules/division-box/manager.ts`
- `apps/core-app/src/main/modules/division-box/lru-cache.ts`
- `apps/core-app/src/main/modules/division-box/ipc.ts`
- `apps/core-app/src/main/modules/division-box/command-provider.ts`
- `apps/core-app/src/main/modules/division-box/flow-trigger.ts`
- `apps/core-app/src/main/modules/division-box/shortcut-trigger.ts`
  - 新增 `division-box/logger.ts` 作为模块内统一日志入口，按 `Module / Manager / IPC / CommandProvider / FlowTrigger / ShortcutTrigger / LRU` 拆分子命名空间，避免生命周期、会话、快捷键和 Flow 触发链继续混用裸 `console.*`。
  - 会话创建/销毁、内存压力驱逐、命令执行、Flow/Shortcut 触发等关键路径统一补 `sessionId / targetId / shortcutId / mappingId / pluginId` 等最小定位字段，减少后续主进程排障时的字符串搜索和上下文丢失。
  - `division-box` 主进程目录复核后仅剩 `session.ts` 内两处注入脚本侧 `console.error`；该部分运行在页面注入上下文，不与本轮主进程 logger 治理混做。

### refactor(core-app): 收敛 FlowBus 主进程日志到统一 logger 体系

- `apps/core-app/src/main/modules/flow-bus/logger.ts`
- `apps/core-app/src/main/modules/flow-bus/module.ts`
- `apps/core-app/src/main/modules/flow-bus/ipc.ts`
- `apps/core-app/src/main/modules/flow-bus/flow-bus.ts`
- `apps/core-app/src/main/modules/flow-bus/session-manager.ts`
- `apps/core-app/src/main/modules/flow-bus/target-registry.ts`
  - 新增 `flow-bus/logger.ts` 作为模块内统一日志入口，按 `Module / IPC / Dispatch / Session / TargetRegistry` 拆分子命名空间，避免 FlowBus 生命周期、分发与注册链继续混用裸 `console.*`。
  - 模块初始化/销毁、快捷键触发、detach 回滚、payload fallback、session 状态推进、target 注册变更等关键路径统一补 `sessionId / senderId / targetId / pluginId / windowId` 最小上下文，便于主进程排障时直接按字段过滤。
  - 过程性 session/target 变更日志降为 `debug`，保留真正需要线上观察的 `info / warn / error`，减少 FlowBus 热路径默认输出噪声。

### fix(release): 校正 beta tag 的 prerelease 发布语义并完成本地打包复核

- `.github/workflows/build-and-release.yml`
  - `Determine Release Type and Tag` 额外输出 `prerelease` 标记，按 tag / 手动触发类型区分 `beta`、`snapshot` 与正式版；`Create Release` 改为消费该显式标记，避免 `v*-beta.*` 被误标成正式 GitHub Release。
- `apps/core-app/electron-builder.yml`
- `apps/core-app/scripts/build-target.js`
- `apps/core-app/scripts/build-target/after-pack.js`
- `apps/core-app/scripts/build-target/runtime-modules.js`
- `apps/core-app/scripts/ensure-platform-modules.js`
  - 新增共享运行时依赖清单，并把 `resources/node_modules` 的闭包同步前移到 `afterPack`：`langsmith`、`compressing`、`@vue/compiler-sfc` 与其传递依赖在生成 installer / dmg / AppImage 之前就进入最终产物，构建校验不再通过 post-build 补包掩盖真实缺包。
  - `electron-builder.yml` 只保留静态资源声明，`resources/node_modules` 运行时模块改由共享清单统一驱动，消除 `electron-builder.yml` / `build-target.js` / `ensure-platform-modules.js` 三处重复维护。
  - 继续补齐 `compressing -> tar-stream -> readable-stream` 与 `langsmith` 相关依赖闭包，将 `process-nextick-args`、`core-util-is`、`inherits`、`string_decoder`、`util-deprecate`、`once`、`wrappy`、`typed-array-buffer`、`uuid`、`semver`、`p-queue` 等缺包纳入同一条同步/校验链，避免安装包启动时继续报 `Cannot find module 'process-nextick-args'`、`Cannot find module 'uuid'` 一类错误。
  - 将主进程运行时使用的 `@vue/compiler-sfc` 运行时闭包同步到 `resources/node_modules` 作为可解析兜底路径，并把 `@vue/compiler-sfc -> @vue/compiler-core / @vue/compiler-dom / @vue/compiler-ssr / @vue/shared` 闭包纳入同一条打包校验链，阻断安装包启动时继续报 `Cannot find module '@vue/compiler-core'`。
  - 将 `SearchIndexService` 对 `searchLogger` 的依赖改为运行时惰性加载，避免 `SearchIndexWorker` 在打包产物内因为静态卷入主进程存储链路而继续报 `Cannot find module 'electron'`，恢复搜索索引 worker 在安装包内的正常启动。
- `apps/core-app/src/main/modules/system/active-app.ts`
- `apps/core-app/src/main/modules/system/active-app.test.ts`
  - macOS 未授予 `System Events` 自动化权限时，`active-app` 解析改为短时退避并降级返回 `null`，不再持续输出带完整堆栈的错误日志；补充对应测试覆盖权限拒绝场景。
- `apps/core-app/src/main/core/precore.ts`
- `apps/core-app/src/main/core/single-instance-guard.ts`
- `apps/core-app/src/main/modules/addon-opener.ts`
- `apps/core-app/src/main/modules/addon-opener-handlers.ts`
  - 收口单实例事件链：主进程统一在 `precore` 注册 `second-instance` 并继续通过 `APP_SECONDARY_LAUNCH` 事件总线分发，`AddonOpener` 不再在 macOS 侧额外注册 Windows 风格的 `second-instance` 监听；同时对主窗口聚焦补活体判断，避免重复启动时继续出现 `Object has been destroyed` 未捕获异常。
- `apps/core-app/src/main/modules/plugin/plugin-runtime-integrity.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.ts`
- `apps/core-app/src/main/modules/plugin/plugin-resolver.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
  - 新增插件运行时 UI 完整性校验与一次性本地自愈：`webcontent` 插件安装后会校验必需入口文件，已安装目录在缺少 `index.html` 等入口文件时会优先尝试从同目录 `.tpex` 包恢复；安装失败会清理半残插件目录，避免下一次重装被 `plugin already exists` 卡住；保存 manifest 时保留更完整的 `_files` / `_signature` 元数据，避免再次把打包元信息截断到“只剩少量文件”的坏状态。
- `apps/core-app/src/main/core/channel-core.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/manager.ts`
- `apps/core-app/src/main/modules/update/UpdateService.ts`
- `apps/core-app/src/main/modules/analytics/startup-analytics.ts`
- `apps/core-app/src/main/modules/analytics/storage/db-store.ts`
- `apps/core-app/src/main/modules/sentry/sentry-service.ts`
- `apps/core-app/src/main/utils/network-log-noise.ts`
  - 收口剩余主进程日志噪音：`CoreBoxManager.exitUIMode()` 在本就不处于 UI 模式时不再额外输出 warn；`app:file-index:progress:stream:cancel` 这类可选 stream cancel 请求若晚于 handler 生命周期抵达，会按“可忽略取消”回包而不再刷 `No handler registered`。
  - 将 Update / StartupAnalytics / Sentry 的上游 403 / 429 失败统一识别为“远端限流或挑战页”场景：更新检查改为短 warn + 冷却语义，不再输出整段错误堆栈；启动分析上报改为沿用同一降级判断；Sentry 遥测失败会把 Cloudflare HTML 挑战页摘要成短标签，避免把整页 HTML 打进日志。
  - `AnalyticsStore` 的 queue pressure 汇总改为区分硬失败与纯节流场景：仅真正丢弃/失败时保留 warn，单纯 throttle / skip 改降为 info，减少正常背压时的误报感。
- `package.json`
- `apps/core-app/package.json`
  - 根包与 `core-app` 版本提升到 `2.4.9-beta.15`，用于本轮 beta 发布。
- `notes/update_2.4.9-beta.15.zh.md`
- `notes/update_2.4.9-beta.15.en.md`
  - 新增本轮 beta 发布说明，记录发布语义修正与本地打包/启动复核结论。
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
  - 同步记录 beta tag 必须保持 prerelease 语义的发布约束，确保文档与当前发布流水线一致。

### refactor(core-app): 收口 compat 运行路径并显式化跨平台降级

- `apps/core-app/src/renderer/src/components/download/DownloadCenterView.vue`
- `apps/core-app/src/renderer/src/views/base/settings/AppSettings.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingDownload.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUser.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingPermission.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginPermissions.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUpdate.vue`
- `apps/core-app/src/main/modules/auth/index.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
- `apps/core-app/src/main/modules/system/linux-desktop-tools.ts`
- `apps/core-app/src/main/modules/system/active-app.ts`
- `apps/core-app/src/main/modules/clipboard.ts`
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `apps/core-app/src/main/modules/file-protocol/index.ts`
- `apps/core-app/src/main/polyfills.ts`
- `apps/core-app/src/main/channel/common.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
  - 下载中心不再挂载旧的下载设置弹窗，统一跳转到设置页；下载设置页补上真实目录选择与“恢复默认目录”，移除运行时 placeholder toast。
  - `allowLegacyMachineSeedFallback` 不再暴露在用户设置页；主进程仅在开发/内部逃生阀下允许 legacy plaintext seed 回退，并对历史配置命中记录明确 warning。
  - 插件权限页面语义收紧为 `enforced / blocked` 两态，旧版 SDK 不再以“兼容警告但可继续授权”的正常状态展示。
  - Windows `@file` / file filter 搜索在 Everything 缺失或禁用时不再静默空结果，改为返回显式 unavailable notice；Everything 健康说明同步改成“文件搜索未就绪/缺依赖”。
  - Linux `xdotool` 依赖改为共享探测与统一 unavailable reason，`active-app`、模拟复制粘贴和 capability 限制说明不再各自输出泛化错误。
  - 更新设置页按平台显式区分安装语义：macOS 继续“重启完成更新”，Windows/Linux 明确为“打开安装包并交给系统安装”。
  - 清理只剩 transport 调用的 legacy 参数与空壳 compat 入口；`polyfills.ts` 保留环境注入，但移除了 `console.*` monkey patch 与全局 logger 注入。
  - 补充定向测试文件：Everything unavailable notice 与 legacy `tfile://` URL 归一化；下一轮继续删除仍在读旧配置但已稳定迁移的数据入口。

## 2026-04-15

### fix(core-app/build): 补齐 LangChain 打包依赖链并恢复 beta 安装包启动

- `apps/core-app/scripts/ensure-platform-modules.js`
  - 将 `@langchain/core`、`@langchain/openai`、`@langchain/anthropic` 与 `@langchain/langgraph` 纳入应用侧运行时依赖同步名单，显式把 hoisted 依赖链同步到 `apps/core-app/node_modules`，避免 `p-retry -> retry` 这类 LangChain 传递依赖在安装包内丢失。
- `apps/core-app/electron-builder.yml`
  - 将 `@langchain/core` 已确认缺失的直依赖（`@cfworker/json-schema`、`ansi-styles`、`camelcase`、`decamelize`、`langsmith`、`mustache`、`retry`）显式复制到 `resources/node_modules`，保证安装包内按 Node 默认查找链仍可解析。
- `apps/core-app/scripts/build-target.js`
  - 将打包后运行时依赖校验进一步扩展到 `@langchain/core` 及其当前已知高风险依赖（含 `p-retry`、`retry`、`langsmith`、`mustache`、`camelcase`、`decamelize`、`ansi-styles`、`@cfworker/json-schema`），让构建阶段直接拦截“桌面包可生成但一启动就缺少 LangChain 依赖”的坏包。
- `package.json`
- `apps/core-app/package.json`
  - 根包与 `core-app` 版本提升到 `2.4.9-beta.14`，用于本轮 LangChain 运行时依赖修复后的 beta 打包与验证。
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
  - 同步记录桌面打包链路对 LangChain 运行时依赖的新增校验要求，保证发布质量门禁与当前实现一致。

### fix(core-app/build): 补齐 Sentry 打包依赖链并阻断主进程启动即崩

- `apps/core-app/scripts/ensure-platform-modules.js`
  - 将 `@sentry/electron` 纳入应用侧运行时依赖同步名单，递归补齐 `@sentry/node -> require-in-the-middle -> module-details-from-path` 依赖链，避免 Windows 安装包启动时因缺少传递模块直接在 main process 崩溃。
- `apps/core-app/electron-builder.yml`
  - 将 `module-details-from-path` 显式作为 `extraResources` 复制到 `resources/node_modules`，绕过上游包元数据导致的漏打包风险，保证主进程仍可按 Node 默认查找链正常解析。
- `apps/core-app/scripts/build-target.js`
  - 将打包后运行时依赖校验从 `ms` 扩展到 `@sentry/electron`、`require-in-the-middle` 与 `module-details-from-path`，并接受 `app.asar` 与 `resources/node_modules` 两个合法运行时落点，提前拦截“构建成功但启动即报错”的坏包。
- `package.json`
- `apps/core-app/package.json`
  - 根包与 `core-app` 版本提升到 `2.4.9-beta.13`，用于下一次 beta 打包与发布流水线。
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
  - 同步记录发布链路新增的运行时依赖校验要求，确保文档口径与当前构建门禁一致。

### fix(core-app): 清理 file-provider 服务拆分遗留并恢复 release 编译

- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-watch-service.ts`
- `package.json`
- `apps/core-app/package.json`
- `docs/plan-prd/01-project/CHANGES.md`
  - 删除 `file-provider` 在 opener/index runtime 服务拆分后遗留的未使用 wrapper、字段与 import，避免 `noUnusedLocals` 在 release 构建阶段直接失败。
  - 补回 `IndexWorkerFileResult -> PersistEntry` 的主线程转换函数，保证 index runtime service 仍能把 worker 结果持久化并写入搜索索引。
  - 移除 `FileProviderWatchService` 中未消费的 `isCaseInsensitiveFs` 依赖透传，收口到当前实际使用的 watch service 接口。
  - 根包与 `core-app` 版本提升到 `2.4.9-beta.12`，用于重新触发发布流水线。

## 阅读方式

- 当前主线：`2.4.9-beta.4` 基线下，下一动作统一为 `Nexus 设备授权风控`。
- 历史主线：`2.4.8 OmniPanel Gate`、`v2.4.7 Gate A/B/C/D/E` 均已收口（historical）。
- 旧记录入口：见文末“历史索引导航”。

## 2026-05-05

### fix(core-app): Windows crash diagnostics, app launch, Store indexing and titlebar fixes

- `createLogger` / module logger now persist main-process diagnostics to log4js file appenders, including error stacks and app launch context.
- Windows app scanning preserves `.lnk` shortcut path, args and cwd, and indexes Store/UWP apps from `Get-StartApps` with AppsFolder AUMID launch metadata.
- Store/UWP scanning now reads StartApps/Appx metadata as UTF-8, resolves package manifest icon assets, and treats URL/PWA Start menu entries as `openExternal` URLs instead of fake AppsFolder AUMIDs.
- App execution now logs `item.id`, path, launch kind, shortcut target, `shell.openPath` result and stack traces; shortcut launch is tried before target fallback, and Store apps launch through `shell:AppsFolder\\AUMID`.
- App startup maintenance now defers heavy backfill/full-sync work during recent search activity to reduce dev/startup lag.
- Everything status records per-backend attempt errors while keeping `sdk-napi -> cli -> unavailable` fallback.
- Windows main titlebar reserves native caption control space, improves button contrast, and adds Simple/Flat logo left spacing.
- Windows active-app detection now uses a typed UInt32 foreground-window process id, parses noisy PowerShell output from the final JSON line, and rate-limits compact failure diagnostics.
- Corrupted Windows app `display_name` values from stale index data, such as `U+FFFD` replacement characters or square glyphs, now fall back to clean app `name` values and are repaired by app backfill/full sync.
- Diagnostic report: `docs/plan-prd/report/windows-search-diagnostics-2026-05-05.md`.
- Verification: `pnpm -C "apps/core-app" run typecheck:node` passed; targeted app-provider/display-name/search-processing Vitest passed; Web typecheck/database snapshot/dev launch were not rerun in this commit.

## 2026-04-09

### fix(core-app): 修正 plugin runtime 时序与 clipboard 上下文保留

- `apps/core-app/src/main/channel/common.ts`
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.ts`
- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.test.ts`
- `apps/core-app/src/main/modules/plugin/plugin.test.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useClipboard.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/types.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useVisibility.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/clipboard-query-inputs.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/clipboard-query-inputs.test.ts`
- `apps/core-app/src/renderer/src/views/box/CoreBox.vue`
  - `BasePluginLoader` 创建 `TouchPlugin` loading shell 时改为显式 `skipDataInit: true`，避免在 runtime 注入前访问 `getDataPath()`。
  - `TouchPlugin.setRuntime()` 在 runtime 就绪后补齐插件数据目录初始化，保证 deferred shell 与真实 plugin 走同一条目录准备路径。
  - 短文本 auto-paste 不再丢失真实 clipboard 上下文；执行插件时会保留并注入真实文本 clipboard 输入，而不是仅剩 query text。
  - 平台能力页与 omni-panel 执行错误中的 stale hardcoded copy 已收口，不再展示“开发中”/`not implemented yet` 这类占位表达。
  - 回归测试覆盖 loader 不再 eager init 数据目录、runtime 注入后的目录初始化行为，以及 clipboard 文本输入构建。

## 2026-04-08

### refactor(core-app): 兼容层继续收口到显式能力分级与一次迁移路径

- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/main/channel/common.ts`
- `apps/core-app/src/main/modules/platform/capability-registry.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/search-processing-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/item-rebuilder.ts`
- `apps/core-app/src/main/modules/clipboard/clipboard-request-normalizer.ts`
- `apps/core-app/src/main/core/touch-app.ts`
- `apps/core-app/src/main/service/store-api.service.ts`
- `apps/core-app/src/main/service/agent-store.service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts`
- `apps/core-app/electron-builder.yml`
- `apps/core-app/scripts/build-target.js`
  - 删除仓内无运行时引用的 `app-addon` 与 renderer 侧 deprecated `useUpdate.ts` 兼容壳，避免继续暴露错误入口。
  - 插件加载广播新增 `loadState/loadError`，加载中与加载失败不再依赖 `Loading...` / `Fatal Error` 文本或空 emoji 图标表达状态。
  - recommendation app rebuild 改为直接走 app-item 映射，不再通过 `dummyQuery` 复用搜索后处理。
  - 平台 capability 补充 `supportLevel/limitations`，显式区分 `supported / best_effort / unsupported`；`native-share`、`terminal`、`tuff-cli`、`active-app` 不再用“缺席即静默降级”的方式表达能力。
  - Windows Everything 状态新增健康分级与原因说明；不可用/禁用时明确表现为 degraded fallback，而非静默空白。
  - `startSilent` 旧 split setting、旧 store source key、旧 agent store key 改为一次迁移后写回新结构并清理旧入口；mac `LSUIElement` 不再在打包配置中默认写死，改为显式构建开关注入。

### fix(aiapp-build): 收口 tuff-intelligence aiapp 导出边界并恢复前端构建

- `packages/tuff-intelligence/src/aiapp.ts`
- `packages/tuff-intelligence/src/aiapp-server.ts`
- `packages/tuff-intelligence/package.json`
- `retired-ai-app/server/**/*`
  - `@talex-touch/tuff-intelligence` 收口为 browser-safe 入口，仅保留 `business/aiapp` projection / trace / legacy card / stream helper 与前端共享类型。
  - 新增 `@talex-touch/tuff-intelligence-server` 子路径，承载 runtime / store / deepagent engine / protocol 类型，`retired-ai-app/server` 原子迁移到新入口，避免前端 import `/aiapp` 时再把 `deepagents / @langchain/langgraph / node:async_hooks` 卷入浏览器 bundle。
  - 不引入前端 alias、shim 或构建绕过；本次只修共享包导出边界与消费者引用。
- `retired-ai-app/server/utils/__tests__/aiapp-entry-contract.test.ts`
  - 新增导出契约回归，验证 `/aiapp` 不再暴露 `AbstractAgentRuntime / DecisionDispatcher / DeepAgentLangChainEngineAdapter / D1RuntimeStoreAdapter`，同时确认 `/aiapp-server` 仍承载服务端 runtime/store/engine 导出。

### fix(aiapp-history): 标题生成后同步回写 quota 历史与会话映射

- `retired-ai-app/server/utils/aiapp-quota-history-sync.ts`
- `retired-ai-app/server/utils/aiapp-trace-window.ts`
- `retired-ai-app/server/api/chat/sessions/[sessionId]/title.post.ts`
- `retired-ai-app/server/api/chat/sessions/[sessionId]/stream.post.ts`
- `retired-ai-app/server/api/aigc/conversation/[id].get.ts`
- `retired-ai-app/server/utils/aiapp-system-message-response.ts`
- 新增统一的 runtime -> quota 历史回写 helper，按 runtime `title + messages + trace tail` 生成快照并同步维护 `aiapp_quota_history` / `aiapp_quota_sessions`。
- `POST /api/chat/sessions/:sessionId/title` 不再只更新 runtime 标题；现在会 best-effort 回写兼容历史，修复前端标题已生成但历史列表仍停留旧标题/旧汇聚快照的问题。
- `GET /api/aigc/conversation/:id` 与流式收尾同步复用同一条回写链路，避免不同入口再次出现快照格式或映射字段漂移。
- trace 尾窗口读取改为按批次向前补到最近的 `turn.started`，修复长 turn 中 `intent.*` 已落库但在恢复/快照阶段被 2000 条尾窗口裁掉、最终只剩 tool card 的问题。
- `retired-ai-app/server/utils/__tests__/aiapp-quota-history-sync.test.ts`
- `retired-ai-app/server/utils/__tests__/aiapp-trace-window.test.ts`
- `retired-ai-app/server/utils/__tests__/aiapp-system-message-response.test.ts`
  - 新增回归，覆盖“标题/trace 回写成功时同步更新历史与映射”“runtime 会话缺失时不重复写入”“长 turn 回溯最近 `turn.started` 后 intent 不再被 tool card 挤掉”。

## 2026-04-07

### fix(aiapp-stream): trace-first 恢复链清理旧 runtime 审计脏卡

- `packages/tuff-intelligence/src/business/aiapp/projection.ts`
- `retired-ai-app/shared/aiapp-system-card-blocks.ts`
- `retired-ai-app/server/utils/quota-conversation-snapshot.ts`
- `retired-ai-app/server/api/aigc/conversation/[id].get.ts`
- `retired-ai-app/server/api/chat/sessions/[sessionId]/stream.post.ts`
- `retired-ai-app/server/utils/aiapp-system-message-response.ts`
- `retired-ai-app/server/utils/aiapp-trace-window.ts`
  - 非 `tool.call.*` 的 `run.audit` 不再投影为前端可见 system/runtime 卡，避免 `attachment.resolve.*` 这类内部审计在刷新恢复后误显示成“工具调用 / runtime / 200”。
  - quota snapshot 只要存在 runtime traces，就统一以 trace projection 为准并清理旧 `aiapp_run_event_card / aiapp_tool_card` 脏块，不再回退信任历史 `messages` 里的遗留卡片。
  - 会话详情读取改为按 runtime `messages + traces` 对齐并回写 quota history，修复已写脏老会话中 `analyse intent` 被旧卡污染的问题，确保前后端恢复语义一致。
  - 新增长会话 trace tail 窗口 helper；会话详情、quota history 回写与 `messages.get` 不再读取“最早 2000 条 trace”，而是按 `session.lastSeq` 读取“最新 2000 条”，修复刷新后最新 turn 的 intent/websearch/planning 卡片偶发消失的问题。
- `retired-ai-app/server/utils/__tests__/aiapp-system-message.test.ts`
- `retired-ai-app/server/utils/__tests__/quota-conversation-snapshot.test.ts`
- `retired-ai-app/server/utils/__tests__/aiapp-system-message-response.test.ts`
- `retired-ai-app/server/utils/__tests__/aiapp-trace-window.test.ts`
  - 新增回归，覆盖“非工具审计不可见”“trace-first 清理旧 runtime/tool 脏卡”“trace 存在但无可见卡时不回退旧 message cards”。
  - 追加回归，覆盖“长会话按 `lastSeq` 读取 trace 尾部，最新 intent 不丢失”。

### fix(aiapp-stream): 首页默认 DeepAgent 并收口 legacy 单前端消费链

- `retired-ai-app/app/composables/api/base/v1/aigc/completion/index.ts`
- `retired-ai-app/app/composables/api/base/v1/aigc/completion/legacy-stream-contract.ts`
- `retired-ai-app/app/composables/api/base/v1/aigc/completion/legacy-stream-sse.ts`
  - 首页生产入口继续保留旧 UI，但流式消费收口到 legacy `$completion` 单链；SSE frame 解析、请求 payload 组装、executor body 构造全部抽成纯 helper，避免旧首页与新 AI Workspace 再并行漂移。
  - 默认 DeepAgent 主链不再从 `conversation.aiappMode` 回填请求参数；仅显式实验态 `meta.aiappMode=true` 时才兼容透传 `aiappMode=true`。
  - `fromSeq + follow` 统一复用共享 seq cursor 解析，首页恢复流固定跟随真实可恢复事件，不再受 AI 模式分叉影响。
- `retired-ai-app/app/pages/index.vue`
- `retired-ai-app/app/components/input/ThInput.vue`
- `retired-ai-app/app/components/input/ThInputPlus.vue`
  - 首页移除 `AI 模式` 默认标签与输入开关；默认发送、标题展示、恢复逻辑均不再依赖 `aiappMode`。
- `packages/tuff-intelligence/src/business/aiapp/types.ts`
- `packages/tuff-intelligence/src/business/aiapp/emitter.ts`
- `packages/tuff-intelligence/src/business/aiapp/stream.ts`
- `retired-ai-app/server/api/chat/sessions/[sessionId]/stream.post.ts`
- `retired-ai-app/server/api/chat/sessions/[sessionId]/trace.get.ts`
- `retired-ai-app/server/utils/aiapp-stream-quota-projector.ts`
- `retired-ai-app/server/utils/quota-conversation-snapshot.ts`
  - 收紧 trace contract：`stream.started / stream.heartbeat / replay.* / run.metrics / done / error` 等 seq-optional 生命周期事件不再持久化到 trace，也不再参与 replay/follow/fromSeq 边界推进；历史脏 trace 在 replay、trace.get 与 quota snapshot 中统一过滤。
- `retired-ai-app/server/utils/__tests__/legacy-completion-stream-contract.test.ts`
- `retired-ai-app/server/utils/__tests__/aiapp-stream-emitter-seq.test.ts`
- `retired-ai-app/server/utils/__tests__/aiapp-stream-replay.test.ts`
  - 补齐 legacy SSE 契约测试，覆盖 `assistant.delta / assistant.final / run.audit / turn.approval_required / replay / done / error` 与分块持续解析；同时验证 seq-optional 生命周期事件不会重新污染 trace。
- 验收：
  - `pnpm -C "retired-ai-app" exec vitest run "server/utils/__tests__/aiapp-stream-emitter-seq.test.ts" "server/utils/__tests__/aiapp-stream-replay.test.ts" "server/utils/__tests__/legacy-completion-stream-contract.test.ts" "server/utils/__tests__/aiapp-runtime-seq.test.ts" "server/utils/__tests__/aiapp-sse-response.test.ts"` 已通过。
  - `pnpm -C "retired-ai-app" exec vitest run "server/utils/__tests__/aiapp-runtime.test.ts" "server/utils/__tests__/aiapp-completion-flow.test.ts" "server/utils/__tests__/legacy-stream-input.test.ts" "server/utils/__tests__/aiapp-chat-utils-parse.test.ts"` 已通过。
  - `pnpm -C "retired-ai-app" run typecheck` 已通过。

## 2026-04-06

### docs(aiapp): 补充单流完整流程图与运行时审计结论

- `docs/plan-prd/02-architecture/aiapp-single-stream-runtime.md`
  - 补充 AI / DeepAgent 单流运行时完整 Mermaid 流程图，明确 `intent gate -> strict pre-read memory -> runtime persist-first -> shared projection -> frontend strict seq consume` 的主链顺序。
  - 修正文档中的 seq 合同表述，明确 `stream.started / stream.heartbeat / replay.* / run.metrics / done / error` 为可无 seq 的豁免事件，其余可恢复事件必须带稳定 `seq`。
  - 增加实现审计结论与已知边界，显式标注 `aiapp-memory-tool.ts` 不得重新接回标准 AI runtime 主路径，并补充前端本地状态不得伪造成 trace event。
- `docs/INDEX.md`
  - 刷新 AI 单流运行时文档入口说明，标记该文档已包含“完整流程图 + 审计结论”，作为后续排查的权威入口。

### ref(aiapp): 统一 messages.get 的 trace projection 命名

- `retired-ai-app/server/utils/aiapp-system-message-response.ts`
  - 将 `listMessagesWithLazySystemProjection()` 重命名为 `listMessagesWithTraceProjection()`，使函数名与当前“始终 trace projection + legacy 兼容”的真实行为一致。
- `retired-ai-app/server/api/chat/sessions/[sessionId]/messages.get.ts`
- `retired-ai-app/server/api/v1/chat/sessions/[sessionId]/messages.get.ts`
- `retired-ai-app/server/utils/__tests__/aiapp-system-message-response.test.ts`
  - 同步更新调用点与测试命名，避免后续维护时误以为仍存在旧 lazy 补 system 的双轨语义。

## 2026-04-04

### AI / DeepAgent 单流包级复用收口

- `@talex-touch/tuff-intelligence` 新增单流共享能力：trace/seq helper、replay trace mapper、system projection、legacy run-event projection、客户端可见性判定。
- `retired-ai-app` 前后端改为直接复用包内 AI 合同；删除本地重复实现 `aiapp-stream-shared.ts`、`aiapp-system-message.ts`、`aiapp-legacy-run-event-card.ts`。
- 前端不再为可恢复事件自动补 `seq`；非豁免事件缺失 `seq` 时直接丢弃并输出诊断，避免本地伪顺序污染 trace/runtime card。
- quota snapshot 改为基于包内 trace projection 重建运行卡，并保留 thinking legacy projector 与 tool sources 合并逻辑。
- `/api/chat/sessions/:sessionId/stream` replay 改为复用包内标准 trace -> stream mapper，服务端仅负责 redaction。

---

## 2026-04-06

### refactor(core-app): 兼容治理继续 hard-cut 并收口 renderer/update 与 placeholder 残留

- `apps/core-app/src/main/channel/common.ts`
  - secure-store 改为统一复用 `src/main/utils/secure-store.ts`，删除 channel 内部重复的 key/path/read/write/decrypt/encrypt 实现。
- `apps/core-app/src/main/modules/auth/index.ts`
  - auth token / machine seed 继续收口到统一 secure-store helper，并移除已无必要的旧 secure-store 依赖代码。
- `apps/core-app/src/main/modules/file-protocol/index.ts`
  - tfile 本地文件边界统一切到 `local-file-policy`，不再保留独立 allowed roots / macOS 路径大小写分支实现。
- `apps/core-app/src/renderer/src/modules/hooks/useUpdateRuntime.ts`
  - 新增基于 `useUpdateSdk() + useDownloadSdk()` 的非 deprecated runtime hook，负责更新检查、可用更新弹层、下载完成提示、设置读写与安装流程。
- `apps/core-app/src/renderer/src/views/base/settings/SettingUpdate.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingAbout.vue`
- `apps/core-app/src/renderer/src/modules/hooks/useAppLifecycle.ts`
- `apps/core-app/src/renderer/src/composables/layout/useLayoutController.ts`
  - runtime 页面/生命周期不再依赖 `useApplicationUpgrade` 兼容壳，统一切到 update SDK runtime hook。
- `apps/core-app/src/renderer/src/modules/intelligence/builtin-prompts.ts`
- `apps/core-app/src/renderer/src/modules/hooks/usePromptManager.ts`
- `apps/core-app/src/renderer/src/modules/storage/prompt-library.ts`
  - builtin prompt 改为静态配置源；prompt library 默认不再注入 fake custom prompt 数据。
- `apps/core-app/src/renderer/src/views/box/DivisionBoxHeader.vue`
  - 删除 toast-only settings 假入口，避免展示未实现能力。
- `apps/core-app/src/main/modules/division-box/manager.ts`
  - 清理 future multi-view placeholder 表述，保持“当前只走已实现 transferred-view 流程”的语义。
- `apps/core-app/src/renderer/src/components/download/*`
- `apps/core-app/src/renderer/src/components/tuff/template/*`
  - 删除 production `src` 中未引用的 `Example/Test/README/VISUAL/IMPLEMENTATION_SUMMARY` 残留文件，并同步清理 `components.d.ts` 里的悬空全局组件声明。
- 验收：
  - `pnpm -C "apps/core-app" run typecheck` 已通过。
  - `pnpm -C "apps/core-app" exec vitest run "src/main/modules/clipboard.transport.test.ts" "src/main/modules/omni-panel/index.test.ts" "src/main/channel/common.test.ts"` 已通过（`3 files / 17 tests`）。
  - `rg` 回归扫描确认 runtime 非测试代码中的 `sendSync(` / `resolveRuntimeChannel(` / `legacy-toggle` 已清零，`genTouchApp()` 仅保留 bootstrap 入口。
  - `rg` 回归扫描确认 renderer production `src` 下 `UpdatePromptExample/DownloadCenterTest/TuffItemTemplateExample/README/VISUAL/IMPLEMENTATION_SUMMARY` 命中为 0。

### refactor(core-app): 收口 hard-cut 兼容层并显式暴露权限后端降级态

- `apps/core-app/src/main/core/deprecated-global-app.ts`
  - 移除未使用的全局 `$app` 读取入口，仅保留模块上下文里的 channel 解析函数，避免 runtime 再回退到全局 app。
- `apps/core-app/src/main/modules/permission/permission-store.ts`
  - 删除 `json-readonly` 式静默兜底路径，SQLite backend 不可用时统一进入 `degraded/backend-unavailable`。
  - `grant/revoke/grantSession/clearAuditLogs` 等变更路径改为显式失败并回滚内存态，不再出现“本次成功、重启丢失”的假象。
- `apps/core-app/src/main/modules/permission/index.ts`
  - 权限状态、性能诊断和变更响应统一回传 `backendState`，供设置页和插件页显式展示后端降级态。
- `apps/core-app/src/renderer/src/views/base/settings/SettingPermission.vue`
  - 设置页新增权限后端不可写告警，后端降级时禁用授予/撤销/清空等变更操作，并直出失败原因。
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginPermissions.vue`
  - 插件权限页补充 backend unavailable 状态说明与失败提示，禁用需要写入后端的切换和批量操作。
- `apps/core-app/src/main/channel/common.ts`
  - 停止注册 legacy `system:get-active-app` 运行时桥接。
- `apps/core-app/src/main/modules/omni-panel/index.ts`
  - 停止注册 legacy feature toggle 事件，仅保留现代 transport 事件。
- `apps/core-app/src/main/modules/flow-bus/native-share.ts`
  - Windows/Linux 文案改为 mail-only fallback，避免继续暗示存在完整原生分享能力。
- `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/context-provider.ts`
  - 清掉固定 `isOnline=true / batteryLevel=100 / isDNDEnabled=false` 的假 system context；探测不到时返回空，并仅在真实 system signal 存在时参与 cache key。
- `apps/core-app/src/main/modules/box-tool/addon/app-addon.ts`
  - 标记为 internal legacy app cache shim，避免继续扩散到主执行链。
- 新增/扩展测试：
  - `apps/core-app/src/main/modules/permission/permission-store.test.ts`
  - `apps/core-app/src/main/channel/common.test.ts`
  - `apps/core-app/src/main/modules/omni-panel/index.test.ts`
  - `apps/core-app/src/main/modules/tray/tray-manager.test.ts`
  - `apps/core-app/src/renderer/src/modules/update/platform-target.test.ts`

## 2026-04-03

### refactor(aiapp-stream): DeepAgent / AI 收敛为 trace-first 单流

- `packages/tuff-intelligence/src/runtime/agent-runtime.ts`
  - runtime 发射路径改为“先持久化 trace，再产出 envelope”，`onMessage()` 向上游 yield 的统一是带 `meta.traceId/meta.seq` 的已持久化事件，不再直接透传原始 envelope。
  - `assistant.delta` 改为按批次缓冲后持久化，flush 边界与 live SSE 对齐，保证前端看到的 delta 与 trace 中的 seq 一一对应，不再出现“已渲染 token 但 trace 无对应事件”的双轨漂移。
- `packages/tuff-intelligence/src/business/aiapp/types.ts`
  - 新增 persisted envelope 校验，AI stream 在把 runtime envelope 映射成 SSE event 前会显式要求 `meta.seq/meta.traceId`，防止未持久化事件误入主流。
- `packages/tuff-intelligence/src/business/aiapp/stream.ts`
  - 移除 DeepAgent 路径的 synthetic `planning.started / planning.updated / planning.finished` 注入；当前仅透传 runtime 真实提供的 planning 事件。
  - replay 路径的 `assistant.delta / thinking.* / assistant.final` shape 改为与 live SSE 保持一致，补播时不再退化成仅有 `payload.text` 的旧形态。
- `packages/tuff-intelligence/src/business/aiapp/emitter.ts`
  - emitter 新增 seq 合同保护：除 `stream.heartbeat` 等纯传输事件外，缺少 `seq` 的 stream event 会直接失败，避免再次回到双轨状态。
- `retired-ai-app/server/utils/aiapp-intent-resolver.ts`
  - classifier 失败路径不再把 `websearchRequired` 硬编码为 `false`，改为使用“最新/今天/查一下/实时”等启发式兜底。
  - 工具启发式新增与联网相同的“不要联网 / offline only”禁用判定，确保 classifier_failed 时仍能优先尊重显式离线要求。
- `retired-ai-app/server/utils/aiapp-runtime.ts`
  - AI 标准路径移除 runtime 侧 `getmemory` 工具注入与 prompt 提示，记忆读取改为严格前置决策；DeepAgent 运行时不再绕过 `memoryReadDecision` 自主取记忆。
- `retired-ai-app/server/api/chat/sessions/[sessionId]/stream.post.ts`
  - 流过程中停止 eager `saveMessage(role=system)`；`messages` 表继续只持久化 `user/assistant`，system/runtime 卡片统一来自 trace 投影。
- `retired-ai-app/server/utils/aiapp-system-message-response.ts`
  - `messages.get` 改为始终按 trace 投影 system message；存在历史 legacy system row 时按 message id 去重，并以 trace projection 覆盖旧内容，避免双份 system card。
- `retired-ai-app/app/composables/aiapp-stream-shared.ts`
  - 新增共享 stream helper，统一两条 AI chat consumer 的 seq 标准化、trace 排序/去重以及 runtime card 事件识别，减少前端双轨消费规则漂移。
- `retired-ai-app/app/composables/useAIChatPage.ts`
  - 新页聊天链路改为复用共享 stream helper，trace 抽屉与运行卡只消费真实事件，不再依赖 synthetic planning 阶段。
- `retired-ai-app/app/composables/api/base/v1/aigc/completion/index.ts`
  - legacy 首页聊天链路复用共享 seq normalizer / runtime card 判定，继续兼容旧 UI，但运行卡来源改为 trace-first 单流合同。
- 文档：
  - 新增 `docs/plan-prd/02-architecture/aiapp-single-stream-runtime.md`，说明 AI 单流顺序合同、trace/SSE/messages 职责分工、严格前置记忆与无 synthetic planning 约束。
- 新增/扩展测试：
  - `retired-ai-app/server/utils/__tests__/aiapp-runtime.test.ts`
  - `retired-ai-app/server/utils/__tests__/aiapp-runtime-seq.test.ts`
  - `retired-ai-app/server/utils/__tests__/aiapp-intent-resolver.test.ts`
  - `retired-ai-app/server/utils/__tests__/aiapp-stream-planning-gate.test.ts`
  - `retired-ai-app/server/utils/__tests__/aiapp-stream-emitter-seq.test.ts`
  - `retired-ai-app/server/utils/__tests__/aiapp-stream-replay.test.ts`
  - `retired-ai-app/server/utils/__tests__/aiapp-system-message-response.test.ts`

### fix(aiapp-chat): 收口 legacy intent 假卡并按工具判定触发 planning

- `retired-ai-app/app/composables/api/base/v1/aigc/completion/index.ts`
  - legacy 首页链路不再在发送前本地预插 synthetic `intent.started` 运行卡，改为只消费服务端真实 `intent.*` 事件，避免出现重复的 `analyse intent`。
  - 运行卡合并逻辑新增无 `turnId` 场景的 pending intent 兜底：当 shared projector 下发真实 `intent:latest` 卡时，会优先吸收旧 `intent:${session}:pending` 卡并迁移到真实 key，确保 `intent.completed` 后只剩一张 completed 卡，不再残留 shimmer。
- `retired-ai-app/shared/aiapp-legacy-run-event-card.ts`
  - 新增 legacy run-event card key 解析 helper，统一 live 合并阶段对 pending intent fallback 的判定规则。
- `packages/tuff-intelligence/src/business/aiapp/stream.ts`
  - `planning.started / updated / finished` 改为仅在 `metadata.toolDecision.shouldUseTools === true` 时发出；普通问答、无需工具的轮次不再默认展示“执行规划”。
- 新增/扩展测试：
  - `retired-ai-app/server/utils/__tests__/aiapp-legacy-run-event-card.test.ts`
  - `retired-ai-app/server/utils/__tests__/aiapp-stream-planning-gate.test.ts`

## 2026-04-02

### fix(aiapp-chat): 首包事件到达后立即解除 legacy 等待态

- `retired-ai-app/app/composables/api/base/v1/aigc/completion/index.ts`
  - legacy 首页链路在收到 `turn.accepted / turn.queued / turn.started` 以及首批 `intent / planning / assistant / run.audit` 事件时立即标记“已受理”，不再等到 thinking/assistant delta 才解除 `WAITING`。
  - `ChatItem` 因 `WAITING` 只渲染 loading 的问题得到修正，运行卡会在首包到达时即时显示，不再等整轮完成后一次性出现。
  - `turn.started` 从 legacy ignored-event 噪音日志中移出，避免控制台持续误报“ignored legacy stream event turn.started”。
- `retired-ai-app/app/components/input/ThInput.vue`
  - `ThInputPlus.hide` 改为显式布尔值，修复首页输入区的 `Invalid prop: Expected Boolean, got Undefined` 警告。

### fix(aiapp-chat): 修复 legacy 流式运行卡延迟出现与快照时间线错位

- `retired-ai-app/app/composables/api/base/v1/aigc/completion/index.ts`
  - legacy 首页聊天链路的运行卡消费改为复用 shared projector，补齐 `planning.started / planning.updated / planning.finished` 实时卡片映射，减少与新页协议漂移。
  - 运行卡 key 新增优先复用 shared `cardKey`，并在 live 更新阶段保留 planning 的 `detail.todos`，避免 finished 覆盖后丢失步骤列表。
- `retired-ai-app/shared/aiapp-legacy-run-event-card.ts`
  - 新增 legacy run-event 纯投影 helper，对 `intent / planning / memory / websearch` 统一复用 `aiapp-system-message`，仅保留 `thinking` 的兼容拼装逻辑。
- `retired-ai-app/shared/aiapp-chat-block-order.ts`
  - 新增聊天 block 时间线排序工具，统一按 `seq + streamOrder` 排序，且让带 seq 的运行卡优先回到 assistant markdown 前。
- `retired-ai-app/app/components/chat/ChatItem.vue`
  - 聊天气泡渲染改为复用共享 block 排序工具，实时流与快照回放采用同一套排序规则。
- `retired-ai-app/server/utils/quota-conversation-snapshot.ts`
  - 快照重建不再固定 `preservedBlocks + cardBlocks` 追加，改为按共享时间线排序重新合并，修复运行卡总是落在 assistant markdown 后的问题。
- `retired-ai-app/server/utils/aiapp-sse-response.ts`
  - 新增 SSE 响应头 helper，集中定义 `X-Accel-Buffering: no`。
- `retired-ai-app/server/api/chat/sessions/[sessionId]/stream.post.ts`
  - 会话流式接口补齐 anti-buffer 响应头，减少 1Panel / Nginx 代理层对 SSE 的缓冲。
- `retired-ai-app/deploy/README.zh-CN.md`
  - 部署文档补充 1Panel / Nginx 对 `/api/chat/sessions/*/stream` 的 `proxy_buffering off` 配置说明。
- `retired-ai-app/deploy/README.md`
  - 英文部署文档同步补充 SSE 反向代理配置说明。
- 新增/扩展测试：
  - `retired-ai-app/server/utils/__tests__/aiapp-chat-block-order.test.ts`
  - `retired-ai-app/server/utils/__tests__/aiapp-legacy-run-event-card.test.ts`
  - `retired-ai-app/server/utils/__tests__/aiapp-sse-response.test.ts`
  - `retired-ai-app/server/utils/__tests__/quota-conversation-snapshot.test.ts`

### fix(aiapp-ui): 收敛记忆运行卡标签并展示本轮新增记忆

- `retired-ai-app/server/utils/aiapp-memory-facts.ts`
  - `upsertAIMemoryFacts` 返回值新增 `addedFacts`，仅回传本轮真正新增的标准化记忆项，避免把已存在 fact 误展示成“新沉淀”。
- `retired-ai-app/server/api/chat/sessions/[sessionId]/stream.post.ts`
  - `memory.updated` 事件与持久化 trace payload 新增 `facts` 字段，实时流、历史回放与快照重建统一复用同一份新增记忆明细。
- `retired-ai-app/app/components/chat/attachments/card/AIRunEventCard.vue`
  - `memory` 卡片不再显示 `Memory` / `已完成` pill，折叠态仅保留标题与摘要。
  - 当 `detail.facts` 非空时，展开区按列表展示本轮新增记忆内容，仅显示 `fact.value`，旧历史卡无明细时保持仅摘要展示。
- 新增/扩展测试：
  - `retired-ai-app/server/utils/__tests__/aiapp-memory-facts.test.ts`
  - `retired-ai-app/server/utils/__tests__/quota-conversation-snapshot.test.ts`

### fix(aiapp-ui): 规划卡直出步骤并隐藏跳过记忆卡

- `retired-ai-app/shared/aiapp-system-message.ts`
  - `memory.updated` 在 `stored=false` 时不再投影为前端 system message，避免“记忆未更新 / no_fact_extracted”类跳过卡进入聊天区。
  - system card 合并阶段为 `planning` 保留上一帧非空 `detail.todos`，解决 `planning.finished` 覆盖后仅剩 `todoCount`、丢失具体步骤的问题。
- `retired-ai-app/shared/aiapp-runtime-redaction.ts`
  - 前端系统消息过滤新增 `memory.context` 与 `memory/skipped` 隐藏规则，确保 live 流、刷新和 lazy projection 下都不再展示跳过记忆卡。
- `retired-ai-app/app/components/chat/attachments/card/AIRunEventCard.vue`
  - `执行规划` 卡直接展示 `detail.todos` 步骤列表，无需展开即可看到规划内容。
  - 隐藏 `planning` 类型标签，仅保留右侧执行状态标签；其他卡片标签行为保持不变。
- 新增/扩展测试：
  - `retired-ai-app/server/utils/__tests__/aiapp-runtime-redaction.test.ts`
  - `retired-ai-app/server/utils/__tests__/aiapp-system-message.test.ts`

### feat(aiapp-memory): 设置页展示记忆详情并将读记忆/工具判定接入运行时

- `retired-ai-app/server/utils/aiapp-memory-facts.ts`
  - 新增 `listAIMemoryFactsByUser`，按添加时间倒序返回用户记忆详情。
  - 新增 `buildAIMemoryContextSystemMessage`，将命中的记忆事实注入当前轮隐藏 system context。
- `retired-ai-app/server/api/v1/chat/memory/facts.get.ts`
  - 新增用户记忆详情接口，供个人设置页直接读取 `value/createdAt/updatedAt`。
- `retired-ai-app/app/composables/useAIMemorySettings.ts`
  - 记忆设置状态新增 `facts/factsLoading`，开关切换后同步刷新或清空记忆详情。
- `retired-ai-app/app/components/chore/personal/profile/account/AccountModuleAppearance.vue`
  - 在个人设置页新增“记忆详情”列表，展示记忆内容与“添加时间”。
- `retired-ai-app/server/utils/aiapp-intent-resolver.ts`
  - intent 分类结果新增 `memoryReadDecision` 与 `toolDecision`，每轮显式判断是否需要读取记忆及启用工具。
- `retired-ai-app/server/api/chat/sessions/[sessionId]/stream.post.ts`
  - 运行时按 `memoryReadDecision` 拉取记忆 facts 并注入隐藏 system context。
  - builtinTools 改为按 `toolDecision` 做运行时裁剪，避免“无需工具”的轮次仍暴露默认工具。
- `retired-ai-app/server/utils/aiapp-memory-tool.ts`
  - 新增 deepagent 可调用的 `getmemory` 工具，按 query 优先返回相关记忆，未命中时回退最近记忆，并附带添加时间供模型参考。
- `retired-ai-app/server/utils/aiapp-runtime.ts`
  - 新增 `disableDefaultBuiltinTools`，支持在运行时显式关闭默认工具注入。
  - 开启记忆后会把 `getmemory` 注入 deepagent 自定义 tools，并补充 prompt 提示 agent 在个性化问题上优先查记忆而不是猜测。
- `packages/tuff-intelligence/src/adapters/deepagent-engine.ts`
  - `DeepAgentEngineOptions` 新增 `tools`，deepagent 调用与流式执行都会透传自定义 tools。
  - 当存在自定义 tools 时自动关闭 direct stream 快路径，避免跳过 deepagent tool 调用链。
- 新增/扩展测试：
  - `retired-ai-app/server/utils/__tests__/aiapp-memory-facts.test.ts`
  - `retired-ai-app/server/utils/__tests__/aiapp-intent-resolver.test.ts`
  - `retired-ai-app/server/utils/__tests__/aiapp-runtime.test.ts`
  - `retired-ai-app/server/utils/__tests__/aiapp-memory-tool.test.ts`

## 2026-03-31

### fix(core-app/build): 补齐 hoisted runtime 依赖

- `apps/core-app/scripts/ensure-runtime-modules.js`
  - 新增打包前 runtime 依赖同步脚本，从 `core-app` 运行时依赖树递归解析 hoisted/transitive 模块，并把缺失模块补齐到 `apps/core-app/node_modules`，为后续构建后镜像完整 runtime 模块集合到 `resources/node_modules` 提供基础，避免启动时再出现 `ms`、`module-details-from-path`、`retry`、`uuid` 一类传递依赖缺失。
- `apps/core-app/scripts/build-target.js`
  - 在 `electron-builder` 前新增 runtime 依赖同步步骤；构建完成后自动把完整 runtime 模块集合镜像到 `resources/node_modules`，并将运行时依赖校验升级为同时检查 `app.asar` 与 `resources/node_modules`，提前拦截“可打包但启动即崩”的坏包。
  - Windows 本地 `--dir` 验包场景下关闭 `win.signAndEditExecutable`，绕过 `winCodeSign` 额外下载，减少因外部网络 EOF 导致的本地验包失败。

### fix(core-app/worker): 收窄 sqlite retry utils 入口

- `apps/core-app/src/main/db/sqlite-retry.ts`
  - `sleep` 改为从 `@talex-touch/utils/common/utils` 窄路径引入，避免 `search-index-worker` 因引用 `@talex-touch/utils` 根聚合入口而把 Electron 相关聚合代码一起卷入 worker chunk。
- `apps/core-app/src/main/modules/box-tool/search-engine/search-logger.ts`
  - `StorageList` 改为从 `@talex-touch/utils/common/storage/constants` 窄路径引入，避免搜索索引 worker 因 `@talex-touch/utils` / `common/index` 聚合出口把 `electron/file-parsers` 一并卷入，导致 worker 进程里 `require('electron')` 失败。

### fix(aiapp/chat): 收口 routing 选择前端暴露并脱敏运行记录

- `retired-ai-app/server/api/chat/sessions/[sessionId]/stream.post.ts`
  - `routing.selected` 不再通过 SSE 直接下发到前端；仅在后端 trace 中保留脱敏摘要，错误事件中的路由字段也同步剥离。
- `retired-ai-app/server/api/chat/sessions/[sessionId]/trace.get.ts`
  - 会话 trace API 过滤 `routing.selected`，并对错误 trace payload 做前端可见级脱敏。
- `retired-ai-app/server/utils/aiapp-system-message-response.ts`
  - 历史 system message 返回前增加 routing 卡片过滤，避免旧会话重放时再次暴露路由选择细节。
- `retired-ai-app/shared/aiapp-system-message.ts`
  - system message / 运行卡投影统一忽略 routing 事件，保证实时流、懒投影与快照回放行为一致。
- `retired-ai-app/app/composables/useAIChatPage.ts`
  - 前端运行态不再消费 `routing.selected`，历史 trace / system message 也会在加载时过滤。
- `retired-ai-app/app/components/chat/attachments/ErrorCard.vue`
  - 错误卡不再展示 route/model/channel/selection reason 等路由诊断字段。
- 新增/扩展测试：
  - `retired-ai-app/server/utils/__tests__/aiapp-runtime-redaction.test.ts`
  - `retired-ai-app/server/utils/__tests__/aiapp-system-message.test.ts`
  - `retired-ai-app/server/utils/__tests__/quota-conversation-snapshot.test.ts`

### fix(aiapp/chat): 收口 websearch 运行卡展示状态

- `retired-ai-app/app/components/chat/attachments/card/AIRunEventCard.vue`
  - websearch 运行卡移除 `Websearch` 与完成态 pill，仅在执行中保留 shimmer 展示，减少噪音标签。
- `retired-ai-app/app/composables/api/base/v1/aigc/completion/index.ts`
  - websearch 决策与执行事件改为复用同一张运行卡；`intent_not_required` 时不再创建卡片，执行未落定时保持 running 以驱动 shimmer。
- `retired-ai-app/shared/aiapp-system-message.ts`
  - system message 投影统一 websearch 卡片 key / 标题 / 隐藏条件，确保实时流与历史回放行为一致。
- `retired-ai-app/server/utils/quota-conversation-snapshot.ts`
  - 会话快照重建对齐新规则：无需联网时不复活 websearch 卡片，决策与执行态合并为单卡。
- 新增/扩展测试：
  - `retired-ai-app/server/utils/__tests__/aiapp-system-message.test.ts`
  - `retired-ai-app/server/utils/__tests__/quota-conversation-snapshot.test.ts`

### fix(core-app/app-index): 修复 app 重建后偶发搜不到应用

- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
  - app 重建改为只清理 `type='app'` 的共享存储记录与 `app-provider` 搜索索引，不再误删 file 侧数据。
  - 新增 app 维护任务局部串行执行器，统一串行化 `startup backfill / full sync / mdls scan / manual rebuild`，降低交错写入导致的偶发丢失。
  - app 主键比较统一为稳定键：扫描结果走 `bundleId || uniqueId || path`，DB 记录走 `bundleId || path`，避免补漏、全量同步与重建链路判重不一致。
  - `startup backfill` 与 `full sync / rebuild` 改为强制 fresh scan，不再复用 `AppScanner` 的 5 分钟缓存。
  - 手动重建前清空 pending deletion 状态，避免旧的 grace 删除状态污染新一轮重建。
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.test.ts`
  - 新增回归测试，覆盖 app 重建只清理 app 数据、纠偏任务强制 fresh scan，以及维护任务串行化。
- `apps/core-app/src/renderer/src/views/storage/Storagable.vue`
  - 存储清理页“清理并重建”文案更新为“应用与文件搜索索引”重建，避免误解为仅文件索引。

### feat(aiapp/coze): 接入独立 Coze 渠道适配与 Bot/Workflow 路由

- `retired-ai-app/server/utils/aiapp-channel.ts`
  - AI 渠道抽象新增 `adapter='coze'`、`transport='coze.openapi'`、`providerTargetType='coze_bot' | 'coze_workflow'` 与中国区默认 API/OAuth 地址。
- `retired-ai-app/server/utils/aiapp-admin-channel-config.ts`
  - 管理端渠道配置新增 `region/oauthClientId/oauthClientSecret/oauthTokenUrl`，Coze 新建时自动填充中国区默认地址，`oauthClientSecret` 继续加密存储并支持编辑留空保留旧值。
  - Coze 目标列表改为手工维护，不再依赖渠道级默认 target；同一 `targetId` 可按不同 `targetType` 共存。
- `retired-ai-app/server/utils/aiapp-admin-routing-config.ts`
  - 模型绑定与 Route Combo 路由新增 `providerTargetType`，旧数据缺省按 `model` 兼容读取。
- `retired-ai-app/server/utils/aiapp-coze-auth.ts`
  - 新增 Coze token 获取与缓存层，兼容 `OAuth 应用凭证` 与 `服务身份凭证（JWT）` 两种鉴权模式。
  - token 缓存 key 从单纯 `channelId` 升级为“渠道 + 凭证指纹”，管理员切换 Coze 凭证后不会继续误命中旧 token。
- `retired-ai-app/server/utils/aiapp-coze-engine.ts`
  - 新增独立 Coze engine adapter，分别打通 `Bot` 与 `Workflow` 流式执行、附件透传、失败态映射与运行审计。
- `retired-ai-app/server/utils/aiapp-runtime.ts`
  - `coze` 渠道不再复用 OpenAI-compatible / DeepAgent 兼容层，运行时直接走 Coze engine。
  - 当 Coze 路由仍配置 AI 本地 `builtinTools/tool-gateway` 时，保存与运行改为显式拒绝，避免静默失效。
- `retired-ai-app/server/api/admin/channels/test.post.ts`
  - 渠道测试新增 Coze 分支，改为校验 Coze 凭证有效性与 API base URL 可达性，不再走 `/v1/responses` 探测。
- `retired-ai-app/server/utils/aiapp-channel-model-sync.ts`
  - Coze 第一版禁用自动发现/同步目标，后台仅保留手工维护 Bot / Workflow 列表。
- `retired-ai-app/app/pages/admin/system/channels.vue`
  - 管理后台渠道页新增 Coze 适配器配置项与目标类型编辑能力；Coze 行不再展示“拉取渠道模型”，改为手工维护目标列表。
  - Coze 渠道新增“鉴权方式”切换，可在 `OAuth 应用凭证` 与 `服务身份凭证（JWT）` 间切换；JWT 模式支持配置 `App ID / Key ID / Audience / Private Key`，私钥仍按加密存储并支持编辑留空保留旧值。
- `retired-ai-app/app/pages/admin/system/model-groups.vue`
  - 模型组映射新增 `targetType` 维度，并在 Coze 绑定摘要中直接显示 `targetType / targetId`。
- `retired-ai-app/app/pages/admin/system/route-combos.vue`
  - Route Combo 路由新增 `targetType` 选择与摘要展示，Coze route 必须显式指定 `coze_bot` 或 `coze_workflow`。
- 新增/扩展测试：
  - `retired-ai-app/server/utils/__tests__/aiapp-coze-auth.test.ts`
  - `retired-ai-app/server/utils/__tests__/aiapp-coze-engine.test.ts`
  - 扩展 `retired-ai-app/server/utils/__tests__/aiapp-admin-channel-config.test.ts`
  - 扩展 `retired-ai-app/server/utils/__tests__/aiapp-channel-model-sync.test.ts`
  - 扩展 `retired-ai-app/server/utils/__tests__/aiapp-runtime.test.ts`
  - 扩展 `retired-ai-app/server/utils/__tests__/aiapp-route-health.test.ts`

### feat(aiapp/routing): 新增 scene-aware 专项模型路由

- `retired-ai-app/shared/aiapp-routing-scene.ts`
  - 新增 AI 内置 scene 定义与标准化工具，第一版固定支持 `intent_classification`、`image_generate`，并保留未来自定义 scene 元数据扩展位。
- `retired-ai-app/server/utils/aiapp-admin-routing-config.ts`
  - `modelCatalog` 新增 `scenes[]`，`routingPolicy` 新增 `scenePolicies[]`。
  - 读取兼容旧 `intentNanoModelId / intentRouteComboId / imageGenerationModelId / imageRouteComboId`，缺少 `scenePolicies` 时自动派生；新保存时同步回写 legacy 字段。
  - 对显式 `scenePolicies` 增加校验：同一 scene 不允许重复，且内置 scene 必须命中已打对应 scene 标签的 model group。
- `retired-ai-app/server/utils/aiapp-routing-resolver.ts`
  - 意图路由新增内部 scene 解析层：`intent_classification` / `image_generate` 优先命中 `scenePolicies`，再退回 legacy 专项字段、请求模型与默认模型。
  - 路由结果新增 `scene`，并把 scene 注入 selection reason，便于诊断专项路由命中链路。
- `retired-ai-app/server/api/chat/sessions/[sessionId]/stream.post.ts`
  - `routing.selected` 事件、运行 trace、conversation metadata 与 routing metrics metadata 全部补充 `scene`，让专项路由在运行态可见。
- `retired-ai-app/app/composables/useAIRoutingAdmin.ts`
  - 管理端表单模型补齐 `modelGroup.scenes[]` 与 `routingPolicy.scenePolicies[]`，并在前端继续兜底兼容 legacy 专项字段。
- `retired-ai-app/app/pages/admin/system/model-groups.vue`
  - 模型组页新增 `Scenes` 维护区与列表预览，支持内置预设 scene + `allow-create` 自定义输入。
- `retired-ai-app/app/pages/admin/system/routing-policy.vue`
  - 专项模型入口切换为固定两条 built-in scene row：管理员可分别为 `intent_classification`、`image_generate` 选择 model group 与可选 route combo。
  - 未知/custom scene policy 在第一版 UI 中保持透传保留，不参与直接编辑，避免覆盖未来配置。
- `retired-ai-app/app/composables/useAIChatPage.ts`
  - 运行态 routeState 新增 `scene`，调试视图中的 route label 也会显示当前命中的专项 scene。
- `retired-ai-app/app/components/chat/attachments/card/AIRunEventCard.vue`
  - Routing 运行卡明细新增 `Scene` 字段，便于直接从运行卡确认专项路由命中结果。
- 新增/扩展测试：
  - `retired-ai-app/server/utils/__tests__/aiapp-admin-routing-config.test.ts`
  - `retired-ai-app/server/utils/__tests__/aiapp-routing-resolver.intent.test.ts`

### fix(core-app/build): 修复 Windows 下 `asar` 依赖校验误判

- `apps/core-app/scripts/build-target.js`
  - 将 `app.asar` 文件列表统一归一化为 POSIX 路径后再校验运行时依赖，避免 `@electron/asar` 在 Windows 上返回反斜杠路径时，把已打进包内的模块误判为缺失。

## 2026-03-30

### fix(core-app/build): 补齐打包产物中的 `ms` 运行时依赖

- `apps/core-app/package.json`
  - 将 `ms` 显式声明为 `core-app` 运行时依赖，避免 electron-builder 过滤掉未在应用依赖树中声明的传递模块。
- `apps/core-app/scripts/build-target.js`
  - 新增 `app.asar` 运行时依赖校验，构建成功前显式检查关键模块是否真正进入包内，避免生成“能打包但启动即崩”的坏包。

### fix(core-app/runtime): 隔离开发态与打包版用户数据目录

- `apps/core-app/src/main/polyfills.ts`
  - 开发态启动时改为显式使用独立 `userData` 目录 `@talex-touch/core-app-dev`，避免与打包版共用 `@talex-touch/core-app` 导致缓存、索引和配置互相污染。
  - 打包版继续沿用现有正式目录，避免影响已安装用户的数据与迁移路径。

### fix(core-app/storage): 清库重建时补齐 app index 自动恢复

- `apps/core-app/src/main/service/storage-maintenance.ts`
  - `storage:cleanup:file-index` 在 `rebuild=true` 时改为同时触发 app index 与 file index 重建，不再只重建 file index。
  - 由于 `files / file_extensions / keyword_mappings` 为 app/file 共用存储，清理索引后可自动恢复 CoreBox 的应用搜索结果。
  - 重建失败改为显式返回错误，避免后台静默吞掉异常。
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
  - 新增正式的 app index rebuild 入口，统一复用全量同步链路。
- `apps/core-app/src/renderer/src/views/storage/Storagable.vue`
  - 存储清理失败提示透出主进程返回的错误信息，便于快速定位索引恢复异常。
- `apps/core-app/src/main/service/storage-maintenance.test.ts`
  - 新增回归测试，覆盖“清理并重建”会同时触发 app/file 索引重建，以及 app rebuild 失败时的错误透传。

## 2026-03-29

### refactor(core-app): 平台兼容与 legacy 收口

- `apps/core-app/src/main/channel/common.ts`
  - 复用既有 `platformCapabilityRegistry` 动态补登记 `platform.active-app`、`platform.native-share`、`platform.permission-checker`，不再用静态清单伪装平台能力。
  - `system:get-active-app` legacy 事件保留桥接，但加入一次性弃用告警与命中计数，内部统一回到现代 active-app 实现。
- `apps/core-app/src/main/modules/system/active-app.ts`
  - 补齐 Windows PowerShell / Linux `xdotool + ps` 前台应用解析，实现成功、命令缺失、异常输出三类路径的显式分流。
  - 平台能力探测改为真实命令可用性判断，Linux 缺依赖时不再把“未实现”混同为“空结果”。
- `apps/core-app/src/main/modules/flow-bus/native-share.ts`
  - 原生分享目标收紧为真实可执行目标：macOS 保留 `system-share/airdrop/mail/messages`，Windows/Linux 只暴露 `mail`。
  - image data URL 分享改为先落临时文件；Windows/Linux 对不可执行目标直接诚实失败，不再走剪贴板/文件夹伪 fallback。
- `apps/core-app/src/main/modules/system/permission-checker.ts`
  - Windows 管理员权限检查改为非侵入式 PowerShell 角色判断，移除向系统目录写测试文件的历史实现。
  - Windows/Linux 通知权限状态收紧为 `unsupported`；Linux 打开系统设置改为按标准桌面入口尝试并在失败时显式返回 unsupported。
- `apps/core-app/src/main/modules/clipboard.ts`
  - legacy clipboard bridge 保留兼容入口，但所有旧事件统一桥接到现有 typed handler，并增加一次性弃用告警与命中计数。
- `apps/core-app/src/main/modules/omni-panel/index.ts`
  - `omni-panel:feature:toggle` legacy 事件保留桥接到现有 `toggleFeature` 路径，同时记录一次性弃用告警与使用次数。
- `apps/core-app/src/main/modules/division-box/window-pool.ts`
  - 高频 `console.*` 调试噪音改为结构化 logger，保留 dev 可观测性并降低运行时噪音。
- `apps/core-app/src/main/modules/division-box/session.ts`
  - DivisionBox session 生命周期、预加载、窗口销毁等高频路径改用结构化 logger，减少 ad-hoc `console.*` 输出。
- `apps/core-app/src/main/modules/plugin/plugin-loaders.ts`
  - 插件错误占位 icon / plugin 形态抽成单一工厂，避免 loader 与 plugin module 多处手工拼装 placeholder。
- `apps/core-app/src/main/modules/tray-holder.ts`
  - 删除已无运行时引用的 deprecated tray holder 遗留模块。
- 新增测试：
  - `apps/core-app/src/main/modules/system/active-app.test.ts`
  - `apps/core-app/src/main/modules/flow-bus/native-share.test.ts`
  - `apps/core-app/src/main/modules/system/permission-checker.test.ts`
  - 扩展 `apps/core-app/src/main/channel/common.test.ts`
  - 扩展 `apps/core-app/src/main/modules/omni-panel/index.test.ts`
  - 扩展 `apps/core-app/src/main/modules/plugin/plugin-loaders.test.ts`
- 验证：
  - `pnpm -C "apps/core-app" exec vitest run ...`（本轮相关 7 个测试文件，38 tests passed）
  - `pnpm -C "apps/core-app" run typecheck:node` 仍被仓库既有问题阻塞：`apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` 缺失 `./services/file-provider-index-flush-service`

## 2026-03-28

### feat(aiapp-chat): 意图运行卡折叠体验优化（extra 插槽 + chevron 展开）

- `retired-ai-app/app/components/chat/attachments/card/AIRunEventCard.vue`
  - 运行卡组件新增 `extra` 插槽能力，右侧交互统一为 `chevron-right` 折叠/展开。
  - `intent` 类型卡片改为极简展示：默认仅显示 `Analyse intent`，展开后仅展示 `reason`（其余参数不再展示）。
  - `intent` 类型隐藏 cardType/status 标签与底部 trace 元信息，减少噪声。
  - `intent + running` 状态改为复用独立 `ShimmerText` 组件渲染，强化“分析中”反馈。
  - event card 外观改为轻量样式：卡片容器去背景/去边框，并改为内容宽度自适应，避免整行撑满。
  - chevron 折叠按钮改为无边框纯图标点击区，去掉外圈视觉噪声。
  - 标题前前置图标移除；secondary 文本统一降为 normal 字重，避免视觉过重。
  - 标题区强制单行布局（标题与 chevron 同行不换行）；展开/收起新增过渡动画，避免内容瞬时跳变。
  - 标题与 chevron 进一步微调：降低标题/图标不透明度，缩小图标尺寸并收紧间距，整体更轻更紧凑。
- `retired-ai-app/app/composables/api/base/v1/aigc/completion/index.ts`
  - 流式 block 写入补充 `seq + streamOrder` 元信息，文本/事件卡/错误块统一走顺序化插入路径，按接收序稳定渲染。
  - `aiapp_run_event_card` 增加乱序保护与终态防回退（旧 seq 或非终态事件不覆盖已终态卡片）。
  - 发送阶段预置 `intent.started` 运行卡，确保“Analyse intent”在分析开始时立即可见，不等待完成事件。
- `packages/tuff-intelligence/src/business/aiapp/conversation.ts`
  - 关闭 `intentWebsearchReason=classifier_failed` 时的启发式联网兜底：当意图层明确 `intentWebsearchRequired=false` 时，统一保持不联网（`intent_not_required`）。
- `retired-ai-app/server/utils/__tests__/aiapp-conversation-shared.test.ts`
  - 同步断言：`classifier_failed` 场景不再触发 `heuristic_required_classifier_fallback`，改为 `intent_not_required`。
- `retired-ai-app/app/components/chat/ChatItem.vue`
  - 聊天块渲染增加顺序编排：优先按 `seq`，同 seq 按 `streamOrder`，确保文本与事件卡按接收顺序展示。
- `retired-ai-app/app/components/other/ShimmerText.vue`
  - 新增通用文本 shimmer 组件（基于 `TextShaving` 的文本流光思路抽离），支持通过 `active` 开关控制动效启停。
  - 调整为纯文本渲染：无背景、无边框，仅保留文字流光层，避免出现“文字浮层块”观感。

### feat(aiapp-admin/channels): 渠道配置增加一键测试

- `retired-ai-app/app/pages/admin/system/channels.vue`
  - 渠道编辑抽屉新增「测试渠道」按钮，支持在保存前快速校验当前渠道是否可用。
  - 新增测试态 loading 与按钮禁用联动，避免与「拉取渠道模型 / 保存」并发触发。
  - 编辑态允许 API Key 留空并复用已保存密钥完成测试；新增态仍要求先填写 API Key。
  - 渠道列表 table 的每行操作区升级为 actions group：`编辑 / 测试 / 删除`，支持直接在行内快速测试。
- `retired-ai-app/server/api/admin/channels/test.post.ts`
  - 新增管理端测试接口 `POST /api/admin/channels/test`，按渠道 transport（`responses` / `chat.completions`）发起最小请求探活。
  - 支持 `channelId` 兜底读取已保存配置（`baseUrl/apiKey/model/timeoutMs`），降低重复输入成本。
  - 返回结构化测试结果（channelId/model/transport/durationMs/preview），并在上游非 2xx 时透传 HTTP 错误上下文。
- `retired-ai-app/server/api/admin/__tests__/channels-test.post.test.ts`
  - 新增接口单测，覆盖显式参数成功、编辑态配置回退、必填参数校验、上游非 2xx 错误映射。

## 2026-03-27

### perf(core-app/db): WAL 膨胀止血与关键词写放大治理

- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
  - `app_provider_full_sync` 轮询注册增加 `lane=maintenance + backpressure=latest_wins + dedupeKey + maxInFlight=1`，防止 full sync 重入排队。
  - `AppIndexSettings` 新增 `fullSyncCooldownMs`、`fullSyncPersistRetry`，默认向后兼容。
  - `app_provider_last_full_sync` 持久化改为“重试 + 内存兜底时间戳”，DB 写失败时仍可抑制周期性 full sync 风暴。
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
  - 首次全量扫描成功后也写回 `scan_progress`，避免重启后重复全扫。
  - `processFileExtensions` 改为“仅变更写入”：读取当前 `keywords` 扩展并比对，只有差异才执行 upsert，降低 `file-index.extensions.upsert` 锁竞争。
- `apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts`
  - 新增 `search_index_meta` 关键字哈希门控：输入未变化时跳过 `keyword_mappings` 写入。
  - `keyword_mappings` 写路径由全量 `delete+insert` 改为 delta（增/删/改关键字），减少热页改写。
  - n-gram 生成改为“限来源 + 限数量”（优先高优先级关键词，限制每项最大 n-gram 数），收敛写放大。
- `apps/core-app/src/main/modules/database/index.ts`
  - 新增 WAL 维护任务：周期 `wal_checkpoint(PASSIVE)` 与空闲条件下 `wal_checkpoint(TRUNCATE)`。
  - 新增 DB 健康遥测日志：`walSizeBytes`、`walPeakBytes`、`busyRetryCount`、`schedulerQueuePeak`、`openFdCount`。
- `apps/core-app/src/main/db/sqlite-retry.ts`
  - 增加全局 `SQLITE_BUSY` 重试计数器并暴露读取接口，供 DB 健康遥测使用。
- `apps/core-app/src/main/db/schema.ts`
  - 新增内部表 `search_index_meta(provider_id,item_id,keyword_hash,updated_at)`。
- `apps/core-app/resources/db/migrations/0021_search_index_meta.sql`
  - 增加对应迁移与索引 `idx_search_index_meta_updated_at`。

## 2026-03-25

### fix(core-app/file-index): 修复 SQLITE_BUSY 连锁与索引日志刷屏

- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
  - `flushIndexWorkerResults` 引入 `inflight` 可恢复批次，`persistAndIndex` 失败时按“pending 优先”回补，避免批次丢失与旧数据覆盖新更新。
  - 定时 flush 统一走调度入口并固定兜底 `.catch`，消除 `Unhandled rejection` 噪声。
  - 增加 SQLite busy 退避重试调度（指数退避 + 抖动）与轻量背压等待（`dbWriteScheduler.waitForCapacity`）。
- `apps/core-app/src/main/modules/box-tool/search-engine/workers/search-index-worker.ts`
  - 为 `persistChunk / upsertFiles / upsertScanProgress` 增加 `withSqliteRetry` 写入重试封装，并统一重试 label。
- `apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts`
  - 将每批 `Indexed/Removed/removeByProvider` 的 `console.debug` 改为时间窗聚合 summary 输出。
  - 慢批次（>=1.5s）保留即时日志，兼顾诊断与降噪。
- 新增测试：
  - `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-flush-service.test.ts`
  - `apps/core-app/src/main/modules/box-tool/search-engine/workers/search-index-worker.retry.test.ts`
  - `apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.logging.test.ts`

### fix(aiapp-websearch): 收敛 responses_builtin 回退上下文污染

- `retired-ai-app/server/utils/aiapp-tool-gateway.ts`
  - `normalizeResponsesBuiltinDocs` 改为优先使用结构化来源（payload citation/source）；仅在无结构化来源时启用文本 URL 兜底。
  - 停止使用 `responses_builtin` 的 `summaryText` 回填 `source.snippet` 与 `doc.content`，避免同一段自由总结污染多条来源。
  - `buildContextText` 在有来源时仅注入条目化引用（title/url/snippet），不再注入 `Websearch summary` 自由文本块。
- `retired-ai-app/server/utils/__tests__/aiapp-tool-gateway.test.ts`
  - 补充断言：`output_text + annotations` 场景下，context 不应包含自由总结文本。
  - 新增用例：无结构化来源时，允许从文本 URL 生成最小来源集合（`responses_builtin_text_fallback`）。
  - 保持既有回归：`provider_pool_empty`、`fallback_*`、`no-source guard` 路径不变。

### fix(aiapp-chat): 旧链路聊天稳定性止血（滚动/会话竞态/历史加载）

- `retired-ai-app/app/components/chat/ThChat.vue`
  - 修正回到底部判定：统一基于 `scrollHeight - (scrollTop + clientHeight)`，移除 `window.innerWidth/document.body.clientHeight` 误用。
  - 删除消息变更后的无条件自动回底，改为仅在流式增量且“用户仍接近底部”时跟随。
  - 补充 `wrapRef` 空值保护，避免边界时机报错。
- `retired-ai-app/app/pages/index.vue`
  - 会话切换改为可取消 token 流程，替换延迟 `setTimeout` 回写，修复快速切换错位。
  - `mounter` 改为单飞初始化；事件与快捷键仅注册一次，修复 `onMounted/onActivated` 双触发重复监听。
  - 增加 `conversationReady` 发送门禁与摘要会话 hydrate 流程，避免“历史未就绪误发到空会话”。
  - 路由 `id` 解析失败不再自动回退新会话，改为保留当前状态并提示重试。
- `retired-ai-app/app/composables/api/base/v1/aigc/history/index.ts`
  - `loadHistories` 增加单飞锁与状态门禁，`LOADING` 期间禁止重复翻页。
  - 默认使用 `summary=1` 拉取轻量历史，并在空列表时正确落为 `COMPLETED`，避免无限触发加载。
- `retired-ai-app/app/components/history/index.vue`
  - `IntersectionObserver` 增加 `LOADING/COMPLETED` 门禁；组件卸载时断开 observer 和 watch 清理。
- `retired-ai-app/server/api/aigc/history.get.ts`
  - 新增 `summary=1` 摘要模式，返回轻量会话结构并批量回填 `run_state`。
- `retired-ai-app/server/utils/quota-history-store.ts`
  - 新增 `listQuotaHistorySummary`，仅查询历史列表必要字段（不取全量消息载荷）。
- `retired-ai-app/server/utils/chat-turn-queue.ts`
  - 新增批量 `getSessionRunStateMapSafe`，替代逐条 N+1 状态查询。

### fix(aiapp-routing/websearch): classifier_failed 联网兜底 + quota-auto 尊重禁用绑定 + Thinking 终态收口

- `packages/tuff-intelligence/src/business/aiapp/conversation.ts`
  - `shouldExecuteAIWebsearch` 在 `intentWebsearchRequired=false` 且 `intentWebsearchReason=classifier_failed` 时允许启发式联网兜底，避免“今日新闻”被硬门禁拦截。
- `retired-ai-app/server/api/chat/sessions/[sessionId]/stream.post.ts`
  - 透传 `intentWebsearchReason` 到联网决策，便于 classifier fallback 生效并可观测。
- `retired-ai-app/server/utils/aiapp-routing-resolver.ts`
  - 为 `quota-auto` 增加“模型绑定禁用策略”过滤：若某 `channelId+providerModel` 仅存在禁用绑定，不再进入候选池。
- `retired-ai-app/app/composables/api/base/v1/aigc/completion/index.ts`
  - 旧链路运行卡片新增 `websearch.decision/websearch.skipped` 展示，明确“是否检索/为何跳过”。
  - `Thinking` 事件对 `__end__` 哨兵去噪，并在 `assistant.final/done/error/turn.finished` 兜底收口，避免卡片长期停留“进行中”。
- `retired-ai-app/server/utils/__tests__/aiapp-conversation-shared.test.ts`
  - 新增断言：`classifier_failed` + 新闻类问题触发启发式联网。
- `retired-ai-app/server/utils/__tests__/aiapp-routing-resolver.intent.test.ts`
  - 新增断言：`quota-auto` 会跳过显式禁用的 provider 绑定。

### fix(aiapp-websearch-ui): 结果可见性增强与状态收口（旧链路）

- `retired-ai-app/app/composables/api/base/v1/aigc/completion/index.ts`
  - `websearch.decision` 运行卡状态改为 `completed`（仅表达“决策已完成”），避免长期停留“进行中”。
  - `aiapp_tool_card` 增加时序防回退：支持按 `seq` 忽略旧事件；终态（`completed/failed/rejected/cancelled`）禁止被非终态覆盖。
  - `aiapp_tool_card` 合并策略增强：后续事件未携带 `sources` 时保留已有来源，避免“搜到内容”被清空。
- `retired-ai-app/app/components/chat/attachments/card/AIToolCard.vue`
  - 来源展示增强为 `title + domain + url + snippet`，并默认展示 Top 5，提升“具体搜到了什么”的可读性。
- `retired-ai-app/shared/aiapp-system-message.ts`
  - `websearch.decision` 的 system-policy 卡状态统一收口为 `completed`，与前端旧链路语义对齐。
- `retired-ai-app/server/utils/quota-conversation-snapshot.ts`
  - 快照重建侧同步 `websearch.decision` 收口策略。
  - 工具卡重建增加乱序与终态防回退保护，并在空 `sources` 更新时保留已有来源。
- `retired-ai-app/server/utils/__tests__/quota-conversation-snapshot.test.ts`
  - 新增回归：`websearch.decision` 卡应为 `completed`。
  - 新增回归：`run.audit` 乱序/空 `sources` 场景下，工具卡不回退且保留来源列表。

## 2026-03-24

### feat(aiapp-message-first): AI 数据层 message-first + system 白名单入模

- 数据层改为 message-first（trace 保留调试/兼容副本）：
  - `retired-ai-app/server/api/chat/sessions/[sessionId]/stream.post.ts`
  - 新增 `retired-ai-app/shared/aiapp-system-message.ts`
  - 新增统一 projector：将 `planning/intent/routing/memory/websearch/run.audit` 投影为 `role=system` 消息并实时写入 `messages`，统一 metadata（`eventType/seq/turnId/cardType/contextPolicy/summary`）。
- 历史懒迁移（不回写）：
  - 新增 `retired-ai-app/server/utils/aiapp-system-message-response.ts`
  - `messages.get`（含 v1）在“旧会话无 system 消息”时按需从 trace 合成内存态 system 视图。
- 上下文白名单过滤统一收敛：
  - `packages/tuff-intelligence/src/business/aiapp/conversation.ts`
  - `packages/tuff-intelligence/src/adapters/deepagent-engine.ts`
  - `retired-ai-app/server/utils/aiapp-langgraph-engine.ts`
  - `retired-ai-app/server/utils/aiapp-title.ts`
  - 规则固定为：`user/assistant` 全量入模；`system` 仅 `eventType=system.policy|tool.summary` 且 `contextPolicy=allow` 入模，其余排除。
- 前端消费链路收敛为“卡片由 system messages 派生”：
  - `retired-ai-app/app/composables/useAIChatPage.ts`
  - assistant 继续单气泡增量渲染，聊天区默认不逐条展开系统运行日志，工具卡优先由 system message 推导。
- 会话计数语义修正：
  - 仅统计 `user + assistant`，不计 `system`，避免运行日志导致计数膨胀。

### fix(core-app/apps-search): macOS 中文应用名检索修复（simple-plist 路径）

- 修复 `InfoPlist.strings` 本地化名称读取链路：
  - `apps/core-app/src/main/modules/box-tool/addon/apps/darwin.ts`
  - 读取顺序调整为 `simple-plist.readFile` 优先，失败时回退轻量 `.strings` 解析（UTF-16/UTF-8 + key/value 抽取）。
  - 仅提取 `CFBundleDisplayName/CFBundleName`，并保留原有 locale 优先级与 fallback。
- 修复应用名更新策略与历史数据回填：
  - `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
  - `display_name` 从“仅空值可写”调整为“新值非空且变化时可覆盖”，支持英文锁定数据回填为中文名。
  - 启动 backfill 增加已存在 app 的 displayName 校正流程，并输出更新/失败统计日志。
- 修复名称与检索关键词一致性：
  - displayName 变更后统一触发 `_syncKeywordsForApp`，确保中文词与拼音词同步刷新进索引。
- 新增单元测试：
  - `localized-strings-parser.test.ts`：覆盖 `simple-plist` 失败后的 `.strings` 回退解析、异常回退安全性。
  - `display-name-sync-utils.test.ts`：覆盖“英文旧值 -> 中文新值更新 / 相同值不重复写入 / 空值不覆盖”规则。

### perf(core-app): Dev 启动压测闭环脚本 + 启动阻塞链路降噪治理

- 新增启动压测执行器与报告产物：
  - `apps/core-app/scripts/startup-benchmark-dev.mjs`
    - 支持 `--runs`、`--timeoutMs`、`--traceDeprecation`、`--continueOnFail`；
    - 支持 `--mode analyze` 对既有日志重建报告；
    - 自动落盘 `logs/run-XX.log`、`data/run-XX.json`、`第XX次运行报告.md` 与 `汇总报告.md`。
  - `apps/core-app/package.json`
    - 新增脚本：`startup:bench:dev`、`startup:bench:analyze`。
  - 报告目录：`docs/engineering/reports/startup-dev-runs-2026-03-24/`
    - 固化 `第01次运行报告.md` 为用户提供日志基线。
- 启动主路径性能与告警治理：
  - `apps/core-app/src/main/modules/system-update/index.ts`
    - 启动期 `runRefreshUpdates('startup')` 改为延后异步触发，不再阻塞模块加载；
    - 启动刷新失败改为信息级日志，保留轮询期慢刷新告警。
  - `apps/core-app/src/main/modules/sentry/sentry-service.ts`
    - `sentry.nexus.flush` 改为启动宽限后执行（移除 `runImmediately`）；
    - 对本地开发常见网络不可达上报失败降为信息级，保留重试与持久化统计。
  - `apps/core-app/src/main/modules/analytics/startup-analytics.ts`
    - `startup-analytics.outbox.flush` 改为启动宽限后执行（移除 `runImmediately`）；
    - 队列 flush 的不可达网络场景降为信息级，避免启动窗口噪声告警。
  - `apps/core-app/src/main/core/touch-window.ts`
    - `console-message` 监听迁移到 Electron 新事件签名，修复 deprecation 告警。
  - `apps/core-app/src/main/index.ts`
    - 新增 `TUFF_STARTUP_BENCHMARK_ONCE` 启动压测一次性退出开关（仅基准模式生效）。
  - `apps/core-app/src/main/modules/box-tool/file-system-watcher/file-system-watcher.ts`
    - 增加 macOS `Photos Library.photoslibrary` 忽略；
    - `EPERM/EACCES` 走可恢复信息日志，不再作为错误告警污染启动日志；
    - 增加路径注册去重中的 in-flight 保护，减少重复 watch。
  - `apps/core-app/src/main/modules/ai/intelligence-sdk.ts`
    - `vision.ocr` 无效 data URL 识别为可恢复输入异常，降级为信息日志，避免重复 warn 噪声。
  - `apps/core-app/electron.vite.config.ts`
    - Sentry Vite 插件改为仅生产构建按需动态加载，避免 dev 启动引入 `@sentry/cli` 旧依赖链触发 `DEP0040 punycode`。

### perf(core-app): 启动窗口稳定性收尾（告警误报抑制 + 静默启动健康判定优化）

- `DEP0040` 根因链路收口（SDK 侧）：
  - `packages/tuff-intelligence/src/adapters/deepagent-engine.ts`
    - `@langchain/openai` 与 `deepagents` 改为按需动态 `import()`，避免主进程启动期被动拉起 openai/node-fetch/whatwg-url 依赖链。
  - `packages/tuff-intelligence/src/adapters/index.ts`
    - 移除 `deepagent-engine` 的根 adapters 重导出，降低非 AI 场景的启动期模块求值成本。
- 启动路径稳定化：
  - `apps/core-app/src/main/modules/download/download-center.ts`
    - 去除模块 `onInit` 阶段对 `PollingService.start()` 的提前调用，统一由启动主流程在 `ALL_MODULES_LOADED` 后启动轮询。
  - `apps/core-app/src/main/core/touch-app.ts`
    - 新增 `waitUntilInitialized()/isSilentStart()`，将渲染器初始化等待能力显式化。
  - `apps/core-app/src/main/index.ts`
    - 静默启动场景改为“渲染器后台初始化，不阻塞 Startup health 判定”；前台启动仍保持阻塞等待，确保交互一致性。
  - `apps/core-app/src/main/utils/perf-monitor.ts`
    - 增加 `TUFF_PERF_STARTUP_LAG_GRACE_MS`（默认 `2500ms`）启动宽限，抑制冷启动窗口 `event_loop.lag` 误报。
- 压测脚本判定修正：
  - `apps/core-app/scripts/startup-benchmark-dev.mjs`
    - 汇总报告 `finalPass` 改为按“最近 10 次认证窗口”判定，不再被历史无效样本永久污染。
- 结果：
  - `docs/engineering/reports/startup-dev-runs-2026-03-24/` 已扩展到 `第62次运行报告`。
  - 最近 10 次（Run53~Run62）连续达标，汇总报告口径显示：
    - `最近10次 Startup health P50: 527ms`
    - `最近10次 Startup health P95: 932ms`
    - `最近10次 WARN/ERROR: 0/0`

### feat(core-app): 启动搜索卡顿永久治理（平衡模式 + 双库隔离）

- 背景：
  - 启动期持续出现 `SQLITE_BUSY` 风暴、`analytics.snapshots` 失败重试灌队列与 `event_loop.lag`，导致搜索首段体验抖动。
- 核心改造：
  - `apps/core-app/src/main/modules/database/index.ts`
    - 新增 aux 库初始化与迁移（`database-aux.db`），高频非核心表分流到 aux；
    - 新增 `getAuxDb()/getAuxClient()/isAuxEnabled()/isAuxReady()`，支持运行态判定与降级回退。
  - `apps/core-app/src/main/db/runtime-flags.ts`（new） + `apps/core-app/src/main/db/startup-degrade.ts`（new）
    - 增加 `TUFF_DB_AUX_ENABLED`、`TUFF_DB_QOS_ENABLED`、`TUFF_STARTUP_DEGRADE_ENABLED`；
    - 启动降载窗口收口为“时间阈值 + 核心队列低水位”双条件。
  - `apps/core-app/src/main/db/db-write-scheduler.ts`
    - 调度选项扩展：`priority/maxQueueWaitMs/budgetKey/dropPolicy/maxBusyFailures/circuitOpenMs`；
    - 单队列升级为优先级选择执行（`critical > interactive > background > best_effort`）；
    - 增加 `latest_wins`、标签熔断、策略注册表与 circuit 状态导出；
    - 新增 `SQLITE_BUSY` 比例观测字段。
  - `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
  - `apps/core-app/src/main/modules/box-tool/search-engine/workers/search-index-worker*.ts`
    - `file-index.full-scan/reconcile/scan-progress` 写入下沉到 worker 单写入入口，避免主线程与 worker 交叉写争锁。
  - `apps/core-app/src/main/db/utils.ts`
    - recommendation cache 改 aux 落库，读取支持 aux 优先 + core 兜底；
    - `recommendation.cache` 写入改 `latest_wins`。
  - `apps/core-app/src/main/modules/analytics/storage/db-store.ts`
  - `apps/core-app/src/main/modules/clipboard.ts`
    - analytics 快照失败指数退避；
    - clipboard 在启动高压期自动降频，并对图像持久化增加去抖。
  - store 注入改造（显式 core/aux）：
    - `analytics-module.ts`、`startup-analytics.ts`、`sentry-service.ts`
    - `report-queue-store.ts`、`telemetry-upload-stats-store.ts`
    - 兼容窗口内关键读取支持 fallback。
- 新增测试：
  - `apps/core-app/src/main/db/db-write-scheduler.test.ts`
    - 覆盖 QoS 优先级、best-effort 丢弃、busy 熔断开启/恢复。
- 验证：
  - `pnpm -C "apps/core-app" run typecheck:node`
  - `pnpm -C "apps/core-app" run typecheck:web`
  - `pnpm -C "apps/core-app" exec vitest run "src/main/db/db-write-scheduler.test.ts"`
  - `pnpm -C "apps/core-app" exec vitest run "src/main/modules/analytics/startup-analytics.test.ts"`

### perf(core-app): 事件循环长停顿归因增强 + Clipboard 严重 lag 自保护

- 背景：
  - 在 `SQLITE_BUSY` 风暴收敛后，仍观察到 `contexts=[]` 且 `pollingRecent.durationMs` 很小的秒级 `event_loop.lag`，需要快速区分“应用逻辑阻塞”与“系统/原生阻塞”。
- 变更：
  - `apps/core-app/src/main/utils/perf-monitor.ts`
    - 新增 `inferEventLoopLagCause()`，对严重 lag 进行归因标记：
      - `native_or_system_stall`
      - `polling_queue_backlog`
      - `unattributed_main_thread_block`
    - `event_loop.lag` 日志新增 `queueDepthByLane`、polling dropped/coalesced 计数、`suspectedCause`，并把归因写入 message hint（`suspect=...`）。
  - `apps/core-app/src/main/modules/clipboard.ts`
    - 在“最近窗口内发生严重 lag”时短时跳过 clipboard 轮询检查（含节流日志），防止主线程恢复阶段再次叠加高频检查负载。
  - `apps/core-app/src/main/utils/perf-monitor.severe-lag.test.ts`
    - 新增归因单测，覆盖“无上下文 + 无队列负载 -> native/system stall”。
- 验证：
  - `pnpm -C "apps/core-app" run typecheck:node`
  - `pnpm -C "apps/core-app" exec vitest run "src/main/db/db-write-scheduler.test.ts" "src/main/modules/analytics/startup-analytics.test.ts" "src/main/utils/perf-monitor.severe-lag.test.ts"`

### fix(core-app/clipboard): 启动预热改为首次按需加载，减少冷启动主线程争用

- 背景：
  - 启动日志中 `Clipboard cache hydrate slow` 与 `event_loop.lag` 出现在模块加载期重叠窗口，放大了模块计时噪声。
  - `initialCache` 预热不再要求在启动阶段立即完成。
- 变更：
  - `apps/core-app/src/main/modules/clipboard.ts`
    - 移除 `onInit` 内 `loadInitialCache()` 启动即执行。
    - 新增 `ensureInitialCacheLoaded()`：在 `clipboard.getLatest`（typed/legacy）与首个 change stream 首次快照时按需触发一次懒加载。
    - `loadInitialCache` 支持可选 `waitForIdle`，懒加载路径默认不等待 idle gate，避免首次查询被额外串行等待。
- 影响：
  - 启动阶段减少一段非必要 DB hydrate 工作，降低与其他模块初始化的事件循环竞争。
  - 历史/分页查询仍走 DB 查询链路，不受本次策略调整影响。

### perf(core-app/download): ErrorLogger 初始化改为非阻塞，降低模块加载临界路径耗时

- 背景：
  - 启动日志中 `Module loaded 1.7s module=DownloadCenter` 与主线程 lag 时间窗重叠，需要先削减模块内部可避免的同步等待。
- 变更：
  - `apps/core-app/src/main/modules/download/download-center.ts`
    - 将 `await this.errorLogger.initialize()` 改为后台启动 `startErrorLoggerInitialization()`，不阻塞 `onInit` 返回。
    - `onDestroy` 增加对 `errorLoggerInitInFlight` 的等待，避免“销毁后晚到初始化”重新注册轮询任务的竞态。
    - 慢启动日志字段从 `errorLogger` 调整为 `errorLoggerKickoff`，语义与新路径一致。
- 影响：
  - DownloadCenter 初始化关键路径不再受日志目录准备/轮询注册影响。
  - 错误日志能力仍保留，且退出阶段保持清理顺序正确。

### fix(core-app/apps): macOS 本地化应用名回填与索引纠偏（simple-plist 路径）

- 问题：
  - 部分 macOS 应用（如网易云音乐）`InfoPlist.strings` 为 UTF-16 文本时，`simple-plist.readFile` 可能无法直接解析，导致回退到英文 `CFBundleName`。
  - `displayName` 在 app 索引链路中存在“已有值后仅空值可写”策略，历史英文值会长期锁定，进而缺失中文关键词。
- 变更：
  - `apps/core-app/src/main/modules/box-tool/addon/apps/darwin.ts`
    - 保留 `simple-plist` 优先读取；
    - 新增 `.strings` 轻量回退解析（UTF-16/UTF-8 解码 + key/value 提取），仅提取 `CFBundleDisplayName`/`CFBundleName`。
  - `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
    - `upsert` 与 full sync 更新条件调整为：新 `displayName` 非空且与旧值不同即覆盖；
    - `_initialize` 增加 displayName 漂移检测，即使 `mtime` 不变也会进入更新；
    - startup backfill 增加“已存在 app 的 displayName 修正 + 关键词重建”流程，并输出更新/失败统计。
  - 新增 `display-name-sync-utils` 与 `localized-strings-parser` 两个小型工具模块，减少主流程分支复杂度。
- 影响：
  - 中文应用名会稳定进入 `files.display_name` 与 `keyword_mappings`，`网易云` / `网易云音乐` / 拼音检索召回一致性提升。
  - 不改 IPC/API，对 Windows/Linux 无行为变更。

---

## 2026-03-23

### fix(aiapp): 会话 ensure 幂等化，避免运行中状态被覆盖导致刷新续流中断

- 问题：
  - `POST /api/chat/sessions` 在 `sessionId` 已存在时仍走 `createSession + completeSession('idle')`，会把运行中的会话状态误写为 `idle`。
  - legacy 页面刷新后依赖 `run_state=executing/planning` 触发 `fromSeq+follow`，状态被覆盖后会出现“对话还在跑但无法自动续流”。
- 变更：
  - `retired-ai-app/server/api/chat/sessions/index.post.ts`
    - 新增已存在会话短路：若命中同 `sessionId`，不再改写 runtime status；
    - 仅在会话不存在时才创建并初始化 `idle`；
    - 继续保留“首句标题补写 + quota_history/aiapp_quota_sessions 占位”行为。
  - `retired-ai-app/app/composables/api/base/v1/aigc/completion/index.ts`
    - 去掉一次重复 `ensureRemoteSessionInitialized` 调用，减少并发写状态窗口。
  - `retired-ai-app/app/pages/index.vue`
    - 路由 `id` 同步改为先 `history.replaceState` 再 `router.replace`，减少发送后立刻刷新导致 query 未落地的概率；
    - 自动续流前若本地无消息，先 `syncHistory` 拉一次最新快照再决定是否 follow。

### fix(core-dev-startup): root path hardening + one-time dev data migration

- Unified runtime root-path policy:
  - `app.isPackaged === true` -> `userData/tuff`
  - `app.isPackaged === false` -> `userData/tuff-dev`
- Removed dev-mode writes to `app.getAppPath()/tuff` as active root to avoid workspace pollution and path instability.
- Added one-time best-effort migration for dev data:
  - Source: `app.getAppPath()/tuff`
  - Target: `app.getPath('userData')/tuff-dev`
  - Marker: `.dev-data-migration.json` (records migrated / skipped / failed reason to avoid repeated attempts).
- Hardened startup directory initialization order in precore:
  - Ensure root first, then `root/logs`, then bind `crashDumps`.
- Hardened `checkDirWithCreate` to synchronous recursive mkdir and aligned call-sites by removing unnecessary `await`.
- Startup observability improvements:
  - Corrected single-instance warning semantics to “quitting new instance”.
  - Added early `unhandledRejection` logging in precore.
  - Added optional deprecation trace switch via `TUFF_TRACE_DEPRECATION=1`.
- Added targeted tests:
  - `src/main/utils/app-root-path.test.ts`
  - `src/main/utils/common-util.test.ts`

### refactor(core-app): 高频异步化链路收口（Polling lanes / Sentry outbox / Clipboard Stage-B / Perf 探针解耦）

- 背景：
  - 线上启动与运行期日志出现 `Event loop lag`、`sentry.nexus.flush` 和 `Clipboard.check` 互相放大，主线程存在“高频任务被 I/O 串行拖慢”的风险。
  - 目标明确为“**不降频，且后续可提频**”，因此采用调度/执行/传输分层异步化，而非靠降低轮询频率止血。
- 变更（调度层）：
  - `packages/utils/common/utils/polling.ts` 完成 lane 化调度重构：`critical/realtime/io/maintenance/legacy_serial`。
  - 新增背压语义：`strict_fifo/latest_wins/coalesce`，并保持旧调用默认落到 `legacy_serial + strict_fifo` 兼容行为。
  - 新增诊断字段：`lastSchedulerDelayMs/maxSchedulerDelayMs`、`queueDepthByLane`、`dropped/coalesced/timeout/error` 统计。
- 变更（Sentry/Startup Analytics）：
  - `apps/core-app/src/main/modules/analytics/startup-analytics.ts` 改为 outbox 异步上传：上报路径仅入队，后台 `io lane` flush（退避 + 重试）。
  - 启动与 Sentry 的 outbox flush 任务改为“仅首次注册，后续复用”，避免高频事件下反复 `register` 造成调度抖动。
  - `apps/core-app/src/main/modules/sentry/sentry-service.ts` 将 Nexus telemetry 改为“内存 batch -> 持久 outbox -> 后台上传”，并补齐：
    - cooldown 期间不再丢事件（仅暂停发送，不暂停入队）；
    - outbox 有界增长（超限裁剪最老数据）；
    - 上传透传 idempotency key（header + metadata）。
  - `analytics_report_queue` 作为共享 outbox，使用 `metadata.kind` 做严格分流，避免 startup/sentry 互相消费。
- 变更（Clipboard/Perf）：
  - `apps/core-app/src/main/modules/clipboard.ts`：轮询任务迁移到 `realtime + latest_wins`；重任务拆到 Stage-B 异步链路（OCR/source 回填），主检查路径只保留轻量判定与落库。
  - `activeApp.snapshot` 改为独立缓存刷新任务（`clipboard.active-app.refresh`）；Stage-B 优先读取短 TTL 缓存，避免在处理链路里同步等待 active app 查询。
  - `apps/core-app/src/main/modules/ocr/ocr-service.ts`：OCR source 改为“文件路径优先”(`file source`)，仅 `data:` 才走 `data-url`，移除主进程 `readFile + base64` 转换热路径。
  - `ocr-service:dispatcher` 任务改为 `maintenance + latest_wins`，并补 `maxInFlight/timeout/jitter`，避免 OCR 轮询回到 legacy 串行路径。
  - OCR worker 执行链路接入：`ocr-service` 优先走 worker OCR，失败自动回退 provider invoke；新增 worker bundle 多候选路径解析与缓存（dev/build/packaged 路径差异兜底）。
  - 新增高频压测脚本 `apps/core-app/scripts/clipboard-polling-stress.ts` 与命令 `pnpm -C "apps/core-app" run clipboard:stress`，输出 per-lane queue peak 与 scheduler delay 对比报告（含 `p95/max`）。
  - `apps/core-app/src/main/utils/perf-monitor.ts`：event-loop 探针改为独立 `setInterval` 采样，避免被业务调度器延迟污染。
- 验证：
  - `pnpm -C "packages/utils" run test -- "__tests__/polling-service.test.ts"` 通过。
  - `pnpm -C "apps/core-app" exec vitest run "src/main/modules/analytics/startup-analytics.test.ts"` 通过。
  - `pnpm -C "apps/core-app" exec vitest run "src/main/modules/ocr/ocr-service.test.ts"` 通过（新增 file-source、worker path 优先与 worker 失败回退用例）。
  - `startup-analytics.test.ts` 增加“flush 任务仅首次注册”用例并通过。
  - `pnpm -C "apps/core-app" run clipboard:stress -- --durationMs 3000` 产出 `docs/engineering/reports/clipboard-polling-stress-*/summary.json` 压测报告。
  - `pnpm -C "apps/core-app" run typecheck:node` 通过。

### refactor(core-app/clipboard): 阶段诊断逻辑抽离为独立模块（保持语义不变）

- 变更：
  - 新增 `apps/core-app/src/main/modules/clipboard/clipboard-phase-diagnostics.ts`，承载 `trackPhase/trackPhaseAsync/buildPhaseDiagnostics/toPerfSeverity` 与 phase alert 判定规则。
  - `apps/core-app/src/main/modules/clipboard.ts` 移除内联诊断实现，改为模块化导入，主模块仅保留编排逻辑。
  - 新增 `apps/core-app/src/main/modules/clipboard/clipboard-phase-diagnostics.test.ts`，覆盖 `gate_wait`、`image_pipeline` 及 severity 映射行为。
- 价值：
  - 降低 `Clipboard` 主模块复杂度，便于后续独立调参与扩展 phase code 规则。
  - 保持现有日志字段与告警等级输出一致，不改变运行时对外行为。

### ref(core-app/file-provider): progress stream 节流策略独立模块化

- 变更：
  - 新增 `file-provider-progress-stream-service.ts`，统一维护 progress stream 发送判定与 flush delay 计算。
  - `file-provider.ts` 改为调用策略函数，移除内联节流规则分支。
  - 新增 `file-provider-progress-stream-service.test.ts`，覆盖阶段切换、静默兜底、最小间隔节流、步进触发与 delay 计算。
- 价值：
  - 减少 `FileProvider` 主类分支复杂度，便于后续单点调参和回归验证。
  - 保证“阶段变化优先 + latest-wins 节流”行为可测试、可演进。

### ref(core-app/perf): perf-monitor 阈值与节流配置模块化

- 变更：
  - 新增 `apps/core-app/src/main/utils/perf-monitor-config.ts`，集中维护 IPC/UI/event-loop 阈值、severe lag 窗口参数、summary 与日志节流参数。
  - `apps/core-app/src/main/utils/perf-monitor.ts` 移除内联阈值常量，改为统一从配置模块导入。
  - 新增 `apps/core-app/src/main/utils/perf-monitor-config.test.ts`，覆盖 UI 专用阈值与默认回退阈值。
- 价值：
  - 将“策略参数”与“运行时采集逻辑”解耦，后续调参无需修改核心监控流程。
  - 降低 perf-monitor 文件体积与认知负担，避免阈值散落导致漂移。

### ref(core-app/perf): perf summary 聚合器独立模块化

- 变更：
  - 新增 `apps/core-app/src/main/utils/perf-monitor-aggregator.ts`，承载 `kinds/topSlow/topEvents/topPhaseCodes` 的聚合计算。
  - `apps/core-app/src/main/utils/perf-monitor.ts` 的 `flushSummary()` 改为调用聚合器，主类聚焦采集与上报编排。
  - 新增 `apps/core-app/src/main/utils/perf-monitor-aggregator.test.ts`，覆盖 key 生成、phase code 聚合优先级与排序行为。
- 价值：
  - 进一步降低 `perf-monitor` 复杂度，缩小变更影响面。
  - 让 summary 规则具备独立可测性，后续扩展指标时回归风险更低。

### ref(core-app/clipboard): legacy IPC 事件与归一化适配器抽离

- 变更：
  - 新增 `apps/core-app/src/main/modules/clipboard/clipboard-legacy-bridge.ts`，集中维护 legacy raw 事件定义（`clipboard:get-history` 等）与请求归一化函数（copy-and-paste/write）。
  - `apps/core-app/src/main/modules/clipboard.ts` 改为导入适配器，typed 与 legacy 两条写入/粘贴路径复用同一归一化逻辑，减少重复分支。
  - `apps/core-app/src/main/modules/clipboard.ts` 新增 `registerLegacyClipboardBridge()`，将 legacy handler 注册块从 `registerTransportHandlers()` 中抽离，主流程职责更聚焦。
  - 新增共享处理方法（`handleSetFavoriteRequest/handleDeleteRequest/handleGetImageUrlRequest/handleCopyAndPasteRequest/handleWriteRequest`），typed 与 legacy 事件统一复用，避免同构逻辑双份维护。
  - `apps/core-app/src/main/modules/clipboard.ts` 将 typed 事件注册按职责拆分为 `registerTypedClipboardQueryHandlers/registerTypedClipboardMutationHandlers/registerTypedClipboardReadHandlers/registerTypedClipboardStreamHandlers`，提升可读性与后续维护效率。
  - 新增 `apps/core-app/src/main/modules/clipboard/clipboard-legacy-bridge.test.ts`，覆盖 payload 归一化与 legacy item 时间戳映射。
- 价值：
  - 降低 `ClipboardModule` 中 legacy 兼容层的耦合度，后续协议调整只改单模块。
  - 减少 typed 与 legacy 分支行为漂移风险，增强回归可测性。

### fix(core-app/startup): 拆分模块加载与渲染器就绪计时口径，修正启动统计误读

- 问题：
  - `apps/core-app/src/main/index.ts` 里 `All modules loaded` 计时覆盖了 `touchApp.waitUntilInitialized()`，导致日志与 `modulesLoadTime` 统计被渲染器加载时间放大（表现为 `All modules loaded` 与 `Renderer ready` 时长接近）。
  - `apps/core-app/src/renderer/index.html` 依赖外部 `cdn.jsdelivr` 的 Remixicon 样式，网络抖动会阻塞页面 `load`，放大 `Renderer ready` 耗时波动（多次启动样本出现 5~13s 抖动）。
- 变更：
  - 将启动计时拆分为两段：
    - `All modules loaded`：仅覆盖 `loadStartupModules(...)` 阶段；
    - `Startup health check passed`：覆盖完整启动健康检查（包含渲染器初始化等待）。
  - `modulesLoadTime` 改为在模块加载结束后立即采样并写入 analytics，避免混入渲染器阶段耗时。
  - 启动成功日志中的 `modules` 元信息改为实际加载数量（`loadedModuleCount`）。
  - 移除 renderer 入口页外部 Remixicon CDN 样式依赖，改为使用本地 UnoCSS 图标类；
  - 将两个 `ri-file-line` 兜底图标切换为 `i-ri-file-line`（`ClipboardFileTag.vue` / `UnifiedFileTag.vue`）。
- 影响：
  - 不改变模块加载顺序、事件触发顺序与功能行为；
  - 启动日志和启动分析统计口径与语义保持一致，便于准确定位启动瓶颈；
  - 降低 dev 环境下 `Renderer ready` 对外网/CDN可用性的耦合，减少冷启动长尾抖动。
- 验证：
  - `pnpm -C "apps/core-app" run typecheck:node` 通过。
  - `pnpm -C "apps/core-app" exec vue-tsc --noEmit -p tsconfig.web.json --composite false` 通过。

### fix(aiapp): 补齐 Milkdown 数学样式依赖（katex CSS 解析失败）

- 问题：
  - `retired-ai-app/app/components/article/MilkContent.vue` 与 `retired-ai-app/app/components/article/MilkdownRender.vue` 直接导入 `katex/dist/katex.min.css`；
  - 但 `retired-ai-app/package.json` 未声明 `katex` 依赖，导致 Vite 在 dev 阶段报 `Failed to resolve import "katex/dist/katex.min.css"`。
- 变更：
  - `retired-ai-app/package.json` 增加 `katex: ^0.16.28` 显式依赖；
  - 同步 `pnpm-lock.yaml` 对应 importer 依赖项。
- 验证：
  - `pnpm -C "retired-ai-app" exec node -p "require.resolve('katex/dist/katex.min.css')"` 成功返回解析路径；
  - `retired-ai-app/node_modules/katex/dist/katex.min.css` 文件存在。

### fix(aiapp): Websearch 门控收紧 + 可恢复跳过 + 刷新卡片持久化

- Websearch 决策统一收口为意图强门控（新旧链路一致）：
  - `packages/tuff-intelligence/src/business/aiapp/conversation.ts`
    - `intentWebsearchRequired === false` 时强制关闭并返回 `intent_not_required`；
    - 仅在 `intentWebsearchRequired` 缺失时才允许 heuristic 兜底。
  - `retired-ai-app/server/api/chat/sessions/[sessionId]/stream.post.ts`
  - `retired-ai-app/server/api/aigc/executor.post.ts`
    - `websearch.decision` / `websearch.skipped` 增加 `gateMode: intent_strict` 审计字段；
    - 当 gateway 返回可恢复跳过信号时，`websearch.skipped` 透传具体 reason，避免误判为工具硬失败。
- Fallback 失败降级为可恢复跳过（不中断主回答）：
  - `retired-ai-app/server/utils/aiapp-tool-gateway.ts`
    - `fallback_unsupported_channel` / `fallback_endpoint_missing` 归类为 recoverable skip；
    - 审计改为 `tool.call.completed + status=skipped`（保留 `connectorReason`），不再产出 `tool.call.failed` 噪音。
  - 继续保留 no-source guard（需要联网但无来源时明确防幻觉约束）。
- 修复刷新后意图/工具卡丢失：
  - `retired-ai-app/server/utils/quota-conversation-snapshot.ts`
    - 新增 runtime trace 重建逻辑，注入 `aiapp_run_event_card` 与 `aiapp_tool_card` 到 assistant block；
    - 仅按“最新 turn”回填，避免跨 turn 卡片重复污染。
  - `retired-ai-app/server/api/chat/sessions/[sessionId]/stream.post.ts`
  - `retired-ai-app/server/api/aigc/conversation/[id].get.ts`
    - 两条快照回填链路统一传入 runtime traces，确保首轮回填与刷新后表现一致。
- 前端兼容显示优化（聊天页保持现状）：
  - `retired-ai-app/app/composables/useAIChatPage.ts`
  - `retired-ai-app/app/components/chat/attachments/card/AIRunEventCard.vue`
    - `websearch.skipped` 原因映射为中性文案（如通道不支持联网时自动离线回答），减少“系统故障”误解。
- 测试：
  - 更新：`retired-ai-app/server/utils/__tests__/aiapp-conversation-shared.test.ts`
  - 更新：`retired-ai-app/server/utils/__tests__/aiapp-tool-gateway.test.ts`
  - 新增：`retired-ai-app/server/utils/__tests__/quota-conversation-snapshot.test.ts`
  - 通过：`pnpm -C "retired-ai-app" test -- "server/utils/__tests__/aiapp-conversation-shared.test.ts" "server/utils/__tests__/aiapp-tool-gateway.test.ts" "server/utils/__tests__/quota-conversation-snapshot.test.ts"`
  - `pnpm -C "retired-ai-app" run typecheck` 失败，存在仓库既有大量 TS 问题（与本次改动无直接关联）。

### fix(aiapp): stream 后端逐事件投影同步（替代前端触发上传）

- 问题：
  - 仅依赖 `finally` 阶段回填时，流中刷新可能出现 `aiapp_tool_card` / `aiapp_run_event_card` / thinking 状态短暂丢失。
  - 需要将一致性职责固定在后端 stream 链路，避免前端触发上传参与状态保障。
- 变更：
  - 新增 `retired-ai-app/server/utils/aiapp-stream-quota-projector.ts`：
    - 在后端按 SSE 逐事件投影（含 `assistant.*`、`thinking.*`、`run.audit`、`intent.*`、`routing.*`、`memory.*`、`websearch.*`、`error/done`）；
    - `stream.heartbeat` 仅透传，不进入快照；
    - 使用串行队列 + `assistant.delta` 短防抖写入，`assistant.final/thinking.final/done/error/finally` 强制 flush。
  - `retired-ai-app/server/api/chat/sessions/[sessionId]/stream.post.ts`：
    - 在 `emitEvent` 包装层接入 projector，SSE 发送后立即 `apply`；
    - `finally` 阶段先强制 flush projector，再执行现有 `syncLegacyQuotaConversationFromRuntime(...)` 兜底校准。
  - `retired-ai-app/server/utils/quota-conversation-snapshot.ts`：
    - 补齐 `thinking.delta` / `thinking.final` 到 `aiapp_run_event_card` 的重建与内容合并；
    - `run.audit` 卡片补齐 camel/snake 归一化（`auditType/callId/ticketId/toolName/status`）与审批状态链路映射。
- 验证：
  - 新增：`retired-ai-app/server/utils/__tests__/aiapp-stream-quota-projector.test.ts`
  - 新增：`retired-ai-app/server/utils/__tests__/quota-conversation-snapshot.test.ts`
  - 通过：`pnpm -C "retired-ai-app" exec vitest run -c "./vitest.config.ts" "server/utils/__tests__/quota-conversation-snapshot.test.ts" "server/utils/__tests__/aiapp-stream-quota-projector.test.ts"`
  - 通过：`pnpm -C "retired-ai-app" exec eslint "server/api/chat/sessions/[sessionId]/stream.post.ts" "server/utils/quota-conversation-snapshot.ts" "server/utils/aiapp-stream-quota-projector.ts" "server/utils/__tests__/quota-conversation-snapshot.test.ts" "server/utils/__tests__/aiapp-stream-quota-projector.test.ts"`
  - `pnpm -C "retired-ai-app" run typecheck` 失败，存在仓库既有大量 TS 问题（与本次改动无直接关联）。

### fix(aiapp/legacy-ui): 发送即建会话 + 用户首句临时标题 + 刷新续流恢复

- 问题：
  - 旧 `completion` 链路首轮发送时，会话与历史可见性依赖流式阶段，导致“AI 未结束前刷新”可能出现当前会话丢失或无法续流。
  - 会话标题依赖后续 AI 生成，首轮缺少稳定的用户可见标题。
- 变更：
  - `retired-ai-app/server/api/chat/sessions/index.post.ts`
    - 支持 `title/topic/message` 输入，创建会话时优先写入“用户首句裁剪标题”；
    - 创建阶段补写 `quota_history` 占位快照与 `aiapp_quota_sessions`，确保“发送即创建且可见”。
  - `retired-ai-app/app/composables/api/base/v1/aigc/completion/index.ts`
    - 流式请求前显式调用 `POST /api/chat/sessions` 绑定会话（同 id），避免会话延迟创建；
    - 新增 `fromSeq/follow` 透传能力，支持刷新后 follow 模式续流；
    - 发送首轮使用用户消息前缀作为 `initialTitle`，后续仍可被 AI 标题覆盖。
  - `retired-ai-app/app/pages/index.vue`
    - 首次发送即锁定 `select + route(id)`，并立即本地快照为 `pending`；
    - 启动时主动加载历史并按 `route.id` 恢复会话；
    - 对 `runtimeState=executing/planning` 的会话自动触发 `fromSeq+follow` 续流。
- 验证：
  - 通过：`pnpm -C "retired-ai-app" exec eslint "app/pages/index.vue" "app/composables/api/base/v1/aigc/completion/index.ts" "app/composables/api/base/v1/aigc/completion-types.ts" "server/api/chat/sessions/index.post.ts" "server/api/chat/sessions/[sessionId]/stream.post.ts" "server/utils/quota-conversation-snapshot.ts" "server/utils/aiapp-stream-quota-projector.ts" "server/utils/__tests__/quota-conversation-snapshot.test.ts" "server/utils/__tests__/aiapp-stream-quota-projector.test.ts"`
  - 通过：`pnpm -C "retired-ai-app" exec vitest run -c "./vitest.config.ts" "server/utils/__tests__/legacy-stream-input.test.ts" "server/utils/__tests__/quota-conversation-snapshot.test.ts" "server/utils/__tests__/aiapp-stream-quota-projector.test.ts"`

### feat(core-app-hardcut): 兼容债务并行硬切（legacy channel/storage/插件 API/更新与 AgentStore）

- 跨平台与更新识别收敛：
  - 新增 `apps/core-app/src/renderer/src/modules/update/platform-target.ts`（统一平台/架构识别，未知显式 `unsupported`，AppImage 小写识别修复）与对应测试。
  - 更新 Provider 全部改为复用统一识别逻辑，不再隐式默认到某 OS。
  - Linux 首次引导权限探测修复：`permission-checker` 按 OS 选择默认探测路径，未知平台返回 `unsupported`。
- 权限系统硬切：
  - `permission-guard/store/channel-guard` 移除 legacy `sdkapi` 放行与 `allowLegacy` 配置。
  - `sdkapi` 缺失或低于门槛统一阻断为 `SDKAPI_BLOCKED`（加载/安装/运行一致）。
- Storage/Channel 直连硬切：
  - 主进程移除 legacy storage 事件处理（`storage:get/save/reload/save-sync/saveall`）与 `StorageEvents.legacy.update` 广播路径。
  - 渲染侧移除 `window.$channel` 业务入口，统一 `touchChannel`。
- 插件 API 兼容层硬切：
  - 移除 deprecated 兼容暴露（含顶层 `box/feature` 兼容别名与旧 searchManager 路径），统一迁移到 `plugin.box` / `plugin.feature` 与 `boxItems`。
  - 失败路径统一给出明确错误码（`SDKAPI_BLOCKED`）与迁移导向。
- 占位/伪实现补齐：
  - `agent-store.service.ts` 实装真实目录拉取、下载、完整性校验、解包、安装元数据落盘、失败回滚与真实更新比对。
  - `OfficialUpdateProvider` 的维护/负载/状态改为真实接口探测，后端不可用返回 `unavailable + reason`，不再固定假值。
  - `ExtensionLoader` 补齐 unload 生命周期，销毁时逆序释放扩展资源。
- 测试与门禁：
  - 新增：`extension-loader.test.ts`、`agent-store.service.test.ts`、`platform-target.test.ts`。
  - 更新：`permission-guard.test.ts`、`permission-store.test.ts`。
  - 验证通过：
    - `pnpm -C "apps/core-app" run typecheck`
    - `pnpm -C "apps/core-app" run typecheck:node`
    - `pnpm -C "apps/core-app" exec vitest run "src/main/modules/permission/permission-guard.test.ts" "src/main/modules/permission/permission-store.test.ts" "src/renderer/src/modules/update/platform-target.test.ts" "src/main/modules/extension-loader.test.ts" "src/main/service/agent-store.service.test.ts"`

### chore(scripts): 门禁脚本去重 + 构建脚本拆分首轮（稳定性工程化）

- guard 公共能力抽取：
  - 新增 `scripts/lib/scan-config.mjs`、`scripts/lib/file-scan.mjs`、`scripts/lib/version-utils.mjs`；
  - `legacy/compat/size/network` 四类脚本复用统一扫描与版本比较逻辑，减少重复维护点。
- 网络门禁收敛为单实现：
  - 删除 `apps/core-app/scripts/check-network-boundaries.js`（重复实现）；
  - root `scripts/check-network-boundaries.mjs` 新增 `--scope`，支持按子目录精确扫描；
  - `apps/core-app` 的 `network:guard` 改为复用 root 脚本（`--scope apps/core-app/src`）。
- 构建脚本拆分首轮：
  - 从 `apps/core-app/scripts/build-target.js` 提取 mac 后处理到 `apps/core-app/scripts/build-target/postprocess-mac.js`；
  - 主脚本保留编排职责，降低单文件复杂度与后续改动风险。
- 运维脚本去重：
  - `scripts/debug-tuff.sh` 改为复用 `scripts/fix-app-permissions.sh`，避免权限/隔离属性逻辑双份维护。
- CI 脚本去重（第二轮）：
  - 新增 `scripts/ci/lib/github-client.mjs` 与 `scripts/ci/lib/openai-chat.mjs`；
  - `scripts/ci/ai-review.mjs`、`scripts/ci/pr-translation.mjs` 改为复用公共 GitHub/OpenAI 客户端逻辑，避免双份 API 调用实现漂移。
- 参数解析去重（第二轮）：
  - 新增 `scripts/lib/argv-utils.mjs`；
  - `scripts/check-doc-governance.mjs`、`scripts/check-release-gates.mjs`、`scripts/backfill-release-assets-from-github.mjs` 统一复用参数解析工具，减少重复实现与维护面。
- 网络请求工具去重（第三轮）：
  - 新增 `scripts/lib/http-utils.mjs`（`normalizeBaseUrl` + `fetchWithTimeout`）；
  - `scripts/check-release-gates.mjs` 与 `scripts/backfill-release-assets-from-github.mjs` 统一复用，消除重复实现。
- 发布门禁脚本拆分（第三轮）：
  - 新增 `scripts/check-release-gates/local-checks.mjs` 与 `scripts/check-release-gates/remote-checks.mjs`；
  - `scripts/check-release-gates.mjs` 收敛为编排入口，保留原有 JSON 输出契约与参数行为。

### fix(core-app): 关闭流程快捷键生命周期治理（修复 OmniPanel `uiohook` 退出竞态）

- `apps/core-app/src/main/modules/global-shortcon.ts`
  - 新增运行时反注册 API：`unregisterMainShortcut(id)`、`unregisterMainTrigger(id)`。
  - `registerMainShortcut/registerMainTrigger` 新增可选 `owner` 字段（向后兼容）。
  - 新增 `teardownRuntimeRegistrations()` 并在 `BEFORE_APP_QUIT` 与 `onDestroy` 执行幂等 runtime 清理。
  - `reregisterAllShortcuts()` 增加 MAIN/TRIGGER 运行时处理器存在性校验；缺失时标记 `runtime-missing` 并跳过注册。
  - `onDestroy()` 不再触发 trigger `onStateChange(false)`，避免销毁期回调反入业务模块。
- `apps/core-app/src/main/modules/omni-panel/index.ts`
  - 新增销毁态门禁：退出阶段阻断 `setupInputHook()`，防止清理后再次启用 `uiohook`。
  - `BEFORE_APP_QUIT` 与 `onDestroy` 复用同一清理链路（关闭开关/清计时器/清 hook/反注册 shortcut+trigger）。
- 双保险反注册补齐：
  - `apps/core-app/src/main/modules/box-tool/core-box/index.ts`：`core.box.toggle`、`core.box.aiQuickCall` 在 `onDestroy` 显式反注册。
  - `apps/core-app/src/main/modules/flow-bus/module.ts`：`flow:detach-to-divisionbox`、`flow:transfer-to-plugin` 在 `onDestroy` 显式反注册。
  - `apps/core-app/src/main/modules/division-box/shortcut-trigger.ts`：`unregister/clear` 改为同步反注册主进程快捷键。
  - `apps/core-app/src/main/modules/division-box/module.ts`：销毁时调用 `shortcutTriggerManager.clear()`。
- 测试补齐：
  - `apps/core-app/src/main/modules/omni-panel/index.test.ts` 新增“destroying 状态不再重启 input hook”用例。
- 新增 `apps/core-app/src/main/modules/global-shortcon.test.ts`，覆盖 runtime 反注册、onDestroy/before-quit teardown、副作用回归。
  - 新增 `apps/core-app/src/main/modules/division-box/shortcut-trigger.test.ts`，覆盖 `unregister/clear` 反注册行为。
  - `apps/core-app/package.json` 新增 `test:shortcut-lifecycle`，使用固定测试文件列表替代 shell 通配符，规避 zsh `no matches found`。

### fix(core-app): 修复 `vue-sonner` 运行时缺失导致的 renderer 预编译阻塞

- `apps/core-app/package.json`
  - 将 `vue-sonner` 从 `devDependencies` 迁回 `dependencies`，避免生产/精简安装场景出现运行时缺包。
- 本次仅处理 P0 启动阻塞，`StartupAnalytics` 本地 telemetry、`Perf:EventLoop`、macOS IMK 系统日志保持为 P2 观察项，不在本补丁扩 scope。

### perf(core-search): CoreBox 搜索性能优化（P0/P1/P2 首轮落地）

- P0（体感提速）：
  - `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`
    - `BASE_DEBOUNCE` 从 `150ms` 调整为 `80ms`，保留去重窗口 `200ms`。
  - `apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts`
    - 新增 `warmup()` 预热入口，初始化阶段补齐复合索引：
      - `idx_keyword_mappings_provider_keyword(provider_id, keyword)`
      - `idx_keyword_mappings_provider_item(provider_id, item_id)`
    - 保留历史单列索引，不做删除。
  - `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
    - `init` 增加非阻塞 `searchIndexService.warmup()` 调用，避免首搜触发冷启动建索引；
    - 搜索入口增加 `markSearchActivity()`，供后台任务避让判断。
  - `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
    - 语义检索改为“先 precise + FTS 形成候选，再按预算补召回”；
    - 触发条件：`query.length >= 3` 且 `candidateIds < 20`；
    - 语义补召回加 `Promise.race` 超时预算 `120ms`，超时/异常降级为空结果。

- P1（重路径瘦身）：
  - `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
  - `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
    - app/file 精确词路径改为批量 `lookupByKeywords(...)`，替代逐 term 多次 SQL。
  - `apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts`
    - `lookupBySubsequence(...)` 增加扫描上限参数（默认 `2000`）并落地 SQL `LIMIT`。
  - `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
    - subsequence 触发约束更新为：`candidateIds < 5 && query.length >= 2 && query.length <= 8`，并传入 `scanLimit=2000`。

- P2（后台任务避让）：
  - 新增 `apps/core-app/src/main/modules/box-tool/search-engine/search-activity.ts`。
  - `file-provider` 自动索引与 `app-provider` 启动 backfill / full sync / mdls 扫描，在“最近 2s 有搜索活动”窗口内跳过本轮调度（下次 idle 周期继续）。

- 回归验证：
  - 新增测试：`apps/core-app/src/main/modules/box-tool/search-engine/search-activity.test.ts`（3 cases）。
  - 通过：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/search-activity.test.ts" "src/main/modules/box-tool/search-engine/search-gather.test.ts"`。
  - `pnpm -C "apps/core-app" run typecheck:node` 当前被仓库既有问题阻断（`src/main/modules/extension-loader.test.ts` 的 Dirent 类型错误），与本次搜索改动无直接关联。

### fix(core-search): 文件搜索结果稳定性修复（快速层超时补发 + type 过滤零命中不再回退）

- `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.ts`
  - 修复 fast layer 超时后“慢完成结果丢失”问题：超时后的 fast provider 结果改为以 deferred 增量补发，不再静默丢弃。
  - 最终 `isDone` 触发条件收敛为“deferred 层与超时 fast provider 全部完成”，避免总数与结果批次不一致。
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
  - 修复“文本 + type 过滤”场景零命中时错误回退为 type-only 结果的问题；现改为返回空结果，避免出现与查询文本无关的文件列表。
- `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.test.ts`
  - 新增回归测试，覆盖 fast layer 超时后 late result 补发与最终计数一致性。

### fix(core-main): 启动/关停链路止血与生命周期契约收口

- 启动 fail-fast 与主流程收敛：
  - `apps/core-app/src/main/index.ts`
    - 启动模块加载切换到 `loadStartupModules`，必需模块加载失败立即抛错并终止启动。
    - `ALL_MODULES_LOADED` 与 polling 启动仅在模块加载 + `touchApp.waitUntilInitialized()` 完整成功后触发。
    - 启动失败统一记录错误并 `app.quit()`，不再出现“假健康启动”。
  - `apps/core-app/src/main/core/startup-module-loader.ts`
    - 新增可复用启动模块加载器，支持 required/optional 分流、skip 策略与加载指标回调。
- 退出链路统一（移除运行时硬退出）：
  - `apps/core-app/src/main/channel/common.ts`
  - `apps/core-app/src/main/modules/tray-holder.ts`
  - `apps/core-app/src/main/modules/tray/tray-menu-builder.ts`
  - 以上路径移除 `process.exit(0)` 退出分支，统一回归 `app.quit()` + 既有关停流程。
- IPC 稳定性修复：
  - `apps/core-app/src/main/channel/common.ts`
    - `dialogOpenFileEvent` 双重注册收敛为单一注册点，并保留路径记忆兼容行为。
- EventBus 契约修复：
  - `apps/core-app/src/main/core/eventbus/touch-event.ts`
    - `once` 监听器触发后即消费移除；
    - `emit` / `emitAsync` 增加 handler 级异常隔离，单点异常不再中断后续 handler；
    - 新增轻量诊断：`getDiagnostics()`（事件/handler 总数与 once 消费计数）。
  - `packages/utils/eventbus/index.ts`
    - `ITouchEventBus` 增加 `emitAsync` 与诊断接口定义。
- 关停时序增强：
  - `apps/core-app/src/main/core/precore.ts`
    - `before-quit` 改为异步编排，先 `emitAsync(BEFORE_APP_QUIT)` 再推进退出。
  - `apps/core-app/src/main/core/module-manager.ts`
    - 退出卸载 reason 统一为 `app-quit`，`destroy` 上下文显式标记 `appClosing=true`。
- 测试补齐：
  - 新增：
    - `apps/core-app/src/main/core/eventbus/touch-event.test.ts`
    - `apps/core-app/src/main/core/startup-module-loader.test.ts`
    - `apps/core-app/src/main/channel/common.registration.test.ts`
    - `apps/core-app/src/main/core/quit-paths.test.ts`
  - 更新：
    - `apps/core-app/src/main/core/module-manager.test.ts`（新增 `appClosing` 断言）
- 验证结果：
  - `pnpm -C "apps/core-app" exec vitest run "src/main/core/module-manager.test.ts" "src/main/channel/common.test.ts" "src/main/modules/tray/tray-manager.test.ts" "src/main/core/eventbus/touch-event.test.ts" "src/main/core/startup-module-loader.test.ts" "src/main/channel/common.registration.test.ts" "src/main/core/quit-paths.test.ts"` 通过（19 tests）。
  - `pnpm -C "apps/core-app" run typecheck:node` 通过。

### refactor(core-main): 生命周期收口补完 + `$app` 去耦首轮 + 结构治理首轮

- 生命周期收口补完：
  - `apps/core-app/src/main/core/startup-health.ts`
    - 新增 `runStartupHealthCheck`，将 `loadStartupModules + waitUntilInitialized` 合并为统一健康门禁，失败即中断启动。
  - `apps/core-app/src/main/core/before-quit-guard.ts`
    - 新增 `runWithBeforeQuitTimeout`（默认 `8s`），`before-quit` handler 超时/异常均记录后继续退出，防止关停卡死。
  - `apps/core-app/src/main/core/module-manager.ts`
    - 卸载观测增强：新增 `ModuleUnloadObservation`、`getLastUnloadObservation()`；记录 `reason/appClosing/duration/failedCount` 作为关停回归基线。
- `$app` 去耦首轮（高风险模块）：
  - `packages/utils/types/modules/module-lifecycle.ts`
    - 新增 `MainRuntimeContext`，生命周期上下文注入 `ctx.runtime`。
  - `apps/core-app/src/main/core/module-manager.ts`
    - lifecycle context 统一注入 runtime（`app/window/channel/moduleManager/logger/config`）。
  - `apps/core-app/src/main/core/deprecated-global-app.ts`
    - 新增一次性 deprecate 告警兼容层（仅用于迁移过渡）。
  - 首批迁移完成：
    - `apps/core-app/src/main/modules/plugin/plugin-module.ts`
    - `apps/core-app/src/main/modules/update/UpdateService.ts`
    - 两处优先使用 runtime 注入，不再依赖直接读取 `globalThis.$app`。
- 主进程结构治理首轮（保持外部契约不变）：
  - plugin 编排层抽取：
    - `apps/core-app/src/main/modules/plugin/services/plugin-io-service.ts`
    - `apps/core-app/src/main/modules/plugin/services/plugin-manager-orchestrator.ts`
  - file-provider 路径/查询层抽取：
    - `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-path-service.ts`
    - `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-search-service.ts`
  - Update 检查/下载/安装编排抽取：
    - `apps/core-app/src/main/modules/update/services/update-action-controller.ts`
- 质量门禁新增：
  - `scripts/check-main-global-app-usage.mjs` + `scripts/main-global-app-allowlist.json`：阻止 `src/main/**` 新增 `$app` 直接读取。
  - 根脚本新增：`pnpm guard:global-app`、`pnpm test:core-main`。
- 测试补齐：
  - 新增：
    - `apps/core-app/src/main/core/startup-health.test.ts`
    - `apps/core-app/src/main/core/before-quit-guard.test.ts`
    - `apps/core-app/src/main/modules/plugin/services/plugin-manager-orchestrator.test.ts`
    - `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-path-service.test.ts`
    - `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-search-service.test.ts`
    - `apps/core-app/src/main/modules/update/services/update-action-controller.test.ts`
- 验证结果：
  - `pnpm -C "apps/core-app" run test:core-main` 通过。
  - `pnpm -C "apps/core-app" run typecheck:node` 通过。
  - `pnpm guard:global-app` 通过。
  - `pnpm test:core-main` 通过（root 聚合子集）。

## 2026-03-22

### fix(core-platform): 移除 Windows 兼容性启动提醒

- 主进程启动握手移除 `platformWarning` 下发：
  - `apps/core-app/src/main/channel/common.ts` 不再写入 `startupInfo.platformWarning`。
  - `apps/core-app/src/main/utils/common-util.ts` 删除 `checkPlatformCompatibility()` / `getMacOSVersion()` 及对应 `os` 依赖。
- 渲染进程触发链路完整下线：
  - `apps/core-app/src/renderer/src/App.vue` 删除 `capturePlatformWarningContext()`。
  - `apps/core-app/src/renderer/src/modules/hooks/useAppLifecycle.ts` 删除 `maybeShowPlatformWarning()` 及相关调用。
- 类型与组件声明同步清理：
  - `apps/core-app/src/renderer/src/env.d.ts`、`packages/utils/types/startup-info.ts` 删除 `platformWarning?: string`。
  - `apps/core-app/src/renderer/components.d.ts` 删除 `PlatformCompatibilityWarning` 全局声明。
- 物理删除无用模块：
  - `apps/core-app/src/renderer/src/modules/mention/platform-warning.ts`
  - `apps/core-app/src/renderer/src/components/base/dialog/PlatformCompatibilityWarning.vue`
- 测试同步：`apps/core-app/src/main/channel/common.test.ts` 清理 `checkPlatformCompatibility` mock。
- 目标：彻底移除已过时的平台兼容性提示，避免“能力已可用但仍提示测试中”的用户误导。

### feat(core-hardcut): legacy 通道与兼容桥一次性下线

- `apps/core-app/src/main/channel/common.ts`：
  - 删除 legacy raw-event 桥接注册（生命周期/临时文件/存储清理/URL confirm 等），仅保留 typed transport 主链路。
  - `openExternal` 逻辑改为基于决策直接执行，不再经过 legacy confirm 事件。
- `apps/core-app/src/main/modules/analytics/analytics-module.ts`：
  - 删除 `analytics:get-summary`、`analytics:export` 兼容桥接。
- `apps/core-app/src/main/core/module-manager.ts`：
  - 删除 `module.filePath` legacy 回退，固定走 `ResolvedModuleFileConfig` 入口解析。
- `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.ts` + `packages/utils/common/search/gather.ts`：
  - 删除 legacy gather 分支与旧参数壳，固定 layered 搜索路径。
- `apps/core-app/src/renderer/src/views/base/settings/SettingAbout.vue`：
  - 渲染端 analytics 调用切到 `AppEvents.analytics.*` typed 事件，不再发送 raw legacy 事件。

### feat(aiapp-hardcut): 实体存储与 legacy API 一次性切换

- 新增 `retired-ai-app/server/utils/aiapp-entity-store.ts`：
  - 正式表 `aiapp_entities` + 迁移表 `aiapp_entity_migrations`。
  - 启动即执行一次性迁移：建表 -> 拷贝 -> 按 domain 对账 -> 写 marker -> 旧表 rename 备份。
  - 迁移失败写 `failed` marker 并 fail-fast，阻断静默脏切。
- AI server 全量调用已切换到 `aiapp-entity-store`（`get/list/upsert/delete/seed` 新函数族）；`aiapp-compat-store.ts` 已物理删除。
- 物理删除 legacy 路由：
  - `retired-ai-app/server/api/v1/chat/sessions/[sessionId]/stream.post.ts`
  - `retired-ai-app/server/api/v1/chat/sessions/[sessionId]/turns.post.ts`

### breaking(utils-hardcut): SDK legacy 出口移除

- 物理删除：
  - `packages/utils/transport/legacy.ts`
  - `packages/utils/permission/legacy.ts`
- `packages/utils/transport/index.ts` 与 `packages/utils/permission/index.ts` 移除 legacy re-export。
- widget processor 与 renderer 注入白名单移除 `@talex-touch/utils/transport/legacy`。
- ESLint 增加硬门禁：导入 `@talex-touch/utils/transport/legacy` / `@talex-touch/utils/permission/legacy` 直接报错。

### chore(governance): compatibility 债务台账失效条目清理

- `docs/plan-prd/docs/compatibility-debt-registry.csv` 清理已失效记录：
  - 删除已物理移除文件 `PlatformCompatibilityWarning.vue` 的 compat-file 台账项。
  - 删除 `compat:registry:guard` 标注为 stale 的 4 条 `legacy-keyword` 记录（`aiapp-settings.vue`、`pages/aiapp/admin/channels.vue`、`aiapp-channel.ts`、`aiapp-runtime.ts`）。
- 验证：`pnpm compat:registry:guard` 无 warning，台账覆盖保持有效。

### feat(aiapp-websearch): SoSearch adapter 接入并设为默认主 provider

- `retired-ai-app/server/utils/aiapp-websearch-connector.ts`：
  - 新增 `SoSearch adapter`，接入 `GET {baseUrl}/search?q=...`（无鉴权）。
  - 支持 `baseUrl` 已含 `/search` 的 endpoint 归一化，避免重复拼接路径。
  - 复用现有 `search/fetch/extract` 标准链路与 fallback/去重策略，不改工具网关语义。
- `retired-ai-app/server/utils/aiapp-admin-datasource-config.ts`：
  - `AIWebsearchProviderType` 新增 `sosearch`。
  - 默认 provider 池升级为：`sosearch-main -> searxng-main -> serper-backup -> tavily-backup`。
  - `sosearch-main` 默认 `baseUrl` 留空，部署后手填。
- `retired-ai-app/app/pages/admin/system/websearch-providers.vue`：
  - 管理页新增 `SoSearch` provider 选项（快捷添加按钮 + Type 下拉项）。
  - 前端默认 providers、归一化解析与空值回退逻辑补齐 `sosearch`。
- 测试补齐：
  - `aiapp-websearch-connector.test.ts` 新增 SoSearch 响应解析、`/search` endpoint 去重、`baseUrl` 为空回退空结果用例。
  - `aiapp-admin-datasource-config.test.ts` 新增默认 provider 顺序与 `sosearch` 类型读写用例。

### fix(aiapp-approval): 工具审批通用化收敛 + websearch 免审批

- `retired-ai-app/server/utils/aiapp-tool-gateway.ts`：
  - 新增通用工具审批策略入口 `shouldRequireToolApproval()`，按工具维度判定是否启用审批。
  - 默认将 `websearch` 审批策略关闭（`TOOL_APPROVAL_POLICY[websearch]=false`），高风险检索不再进入审批中断分支。
- `retired-ai-app/app/composables/api/base/v1/aigc/completion/index.ts`：
  - 工具卡 `upsert` 增加通用身份归并（`callId/ticketId/toolName + 活跃态`），避免审批事件拆分成新卡，审批按钮可稳定嵌入同一工具卡。
  - `send()` 增加取消收敛（Abort -> `CANCELLED`）与执行流计数，修复“停止生成无效/等待审批态无法收口”。
  - 新增审批等待检查点回调，进入 `approval_required` 时可先完成本地会话快照，避免同步长期停留 `PENDING`。
- `retired-ai-app/app/pages/index.vue`：
  - 接入 `onReqCheckpoint('approval_required')`，在等待审批阶段即时落盘会话并恢复发送状态。
  - 会话同步状态判定中 `CANCELLED` 不再标记为 `FAILED`，保证停止后状态可收敛。
- 测试更新：`aiapp-tool-gateway.test.ts` 将高风险 websearch 场景改为“不中断审批，直接 completed”。

### fix(aiapp-admin-channels): 单渠道启用/禁用状态可正确持久化

- `retired-ai-app/server/utils/aiapp-admin-channel-config.ts`：
  - 修复布尔归一化链路：`normalizeText(false)` 不再被吞空，`enabled=false` 可正确落库并回读。
  - 同步修复渠道模型布尔字段（`models[].enabled/thinkingSupported/thinkingDefaultEnabled`）的持久化正确性。
- 新增测试：`retired-ai-app/server/utils/__tests__/aiapp-admin-channel-config.test.ts`
  - 覆盖 `channel.enabled=false` 与 `models[].enabled=false` 的保存与回读回归场景。

### fix(aiapp-websearch): 终态事件收口 + fallback unavailable 可解释化 + 无来源防编造

- `retired-ai-app/server/api/chat/sessions/[sessionId]/stream.post.ts`：
  - `websearch.decision` 保持判定语义；`enabled=false` 时立即发 `websearch.skipped`。
  - 审批中断（`approval_required/rejected`）与工具异常路径统一先发 `websearch.skipped` 作为终态。
  - `done/error` 前增加 `terminal_finalize` 兜底：若仍停留 decision 态，补发 `websearch.skipped`，避免前端“一直执行中”。
  - 当本轮无来源且意图要求联网时，向运行时消息注入 `No External Sources Retrieved` guard，约束模型显式说明“未获取外部来源”，禁止编造“最新/新闻”事实。
- `retired-ai-app/server/api/aigc/executor.post.ts`：
  - `run.audit` 流同步收口 `websearch.skipped` 终态（decision=false、审批分支、异常分支、terminal finalize）。
  - `run.audit` 工具审计转发补齐 `providerChain/providerUsed/fallbackUsed/dedupeCount`，便于 unavailable 根因定位。
  - 执行消息同样接入“无来源 guard”注入策略（仅在 `websearchRequired=true` 且 `sourceCount=0` 时触发）。
- `retired-ai-app/server/utils/aiapp-tool-gateway.ts`：
  - fallback unavailable reason 语义规范化：`provider_pool_empty`、`fallback_unsupported_channel`、`fallback_endpoint_missing`、`fallback_execution_failed`。
  - 维持兼容错误码（含 `WEBSEARCH_DATASOURCE_UNAVAILABLE`），同时确保失败审计可解释“为何 unavailable”。
- `retired-ai-app/app/composables/useAIChatPage.ts`：
  - websearch 阶段卡状态调整：`executed => done`、`skipped => skipped`，`decided` 不再长期映射 running。
  - `done/error` 本地兜底：若仍在 decision 态，自动转 `skipped(terminal_finalize)`，防止服务端漏发导致 UI 卡住。
  - 新一轮消息发送前清空 `toolCallMap/toolCalls`，工具卡仅显示当前轮次，消除上一轮残留。
- 测试补齐：`retired-ai-app/server/utils/__tests__/aiapp-tool-gateway.test.ts` 新增 fallback reason 分类与 no-source guard 用例。

### feat(core-search-observability): 搜索卡顿诊断观测增强（主日志 + 自动短开）

- 搜索主链路新增 `search-trace/v1` 结构化日志（仅主进程现有日志，不新增 JSONL）：
  - 覆盖事件：`ipc.query.received`、`session.start`、`first.result`、`session.end`、`session.cancel`、`session.error`。
  - 统一字段：`sessionId/event/ts`、`query.len/query.hash`、`inputCount/inputTypes`、阶段耗时（parse/providerSelect/mergeRank/total）、结果计数、provider 汇总、争用快照（DB 队列 + 最近 event loop lag + app task gate）。
- 查询日志脱敏：搜索诊断日志不再写 query 明文，统一改为 `len + sha1(hash,12)`。
- SearchLogger 升级为“双态开关”：
  - 手动开关沿用 `appSetting.searchEngine.logsEnabled`；
  - 新增内存态 `enableBurst(durationMs, reason)`，到期自动失效，不持久化配置。
- PerfMonitor 增加严重卡顿窗口触发能力与 lag 快照接口：
  - 触发条件：`lag >= 2000ms` 且 `30s` 窗口内出现 `2` 次；
  - 冷却：`120s`；
  - 提供订阅接口供业务模块注册 burst 行为。
- CoreBox 模块接入自动短开：
  - 监听 PerfMonitor 严重 lag 触发事件；
  - 自动启用 `30s` 搜索诊断 burst，便于复现时快速抓取搜索链路证据。

### fix(aiapp-chat): Markdown 只读渲染去除尾部空行

- 在 `retired-ai-app/app/components/render/RenderContent.vue` 新增只读渲染范围样式：`.RenderContent .MilkContent.markdown-body .ProseMirror[contenteditable="false"]`。
- 处理规则：
  - 隐藏末尾空段落（覆盖 `p:last-child:empty` 与 `p:last-child:has(> br.ProseMirror-trailingBreak)`）。
  - 强制最后可见块元素 `margin-bottom: 0`，消除聊天消息尾部多余空白行。
- 兼容性兜底：在不支持 `:has` 的环境下，通过运行时 class（`ProseMirror--TailEmpty`）保持同等效果；不改动原始 Markdown 文本与存储语义。

### chore(governance): 文档门禁恢复可用（日期口径 + TODO 统计）

- 六主文档 `更新时间` 统一到 `2026-03-22`（`INDEX/README/TODO/Roadmap/Release Checklist/Quality Baseline`）。
- `TODO` 统计表改为实时计数结果（`done=95 / todo=16 / total=111 / 86%`），修复 `todo-stats` 漂移。
- 验证结果：`pnpm docs:guard && pnpm docs:guard:strict` 全通过。

### chore(governance): compat 扫描范围补齐 `retired-ai-app/shared`

- `scripts/check-compatibility-debt-registry.mjs` 扫描范围新增 `retired-ai-app/shared`，修复 scope leak。
- 补齐新增 `legacy-keyword` 命中项到 `compatibility-debt-registry.csv`，恢复 registry 覆盖完整性。
- 验证结果：`pnpm compat:registry:guard` 通过（保留 cleanup candidate 警告）。

### fix(governance): legacy transport import 多行检测漏检修复

- `scripts/check-legacy-boundaries.mjs` 与 `scripts/check-compatibility-debt-registry.mjs` 的 `legacy-transport-import` / `legacy-permission-import` 正则支持多行 `import`，避免 `import { ... } from '.../legacy'` 被漏检。
- 补齐 `packages/utils/plugin/channel.ts` 在 `legacy-transport-import` 维度的门禁基线与台账登记（allowlist + compatibility registry）。
- 目标：确保 `legacy` 门禁统计真实反映源码状态，避免“0 命中”假阴性。

### chore(governance): size guard 阻断恢复（基线同步）

- 更新 `scripts/large-file-boundary-allowlist.json`：
  - 新增本轮超长文件基线：`ThInput.vue`、`completion/index.ts`、`useAIChatPage.ts`、`stream.post.ts`、`aiapp-tool-gateway.ts`。
  - 调整 growth exception cap：
    - `SIZE-GROWTH-2026-03-16-AIGC-EXECUTOR` (`retired-ai-app/server/api/aigc/executor.post.ts`) -> `2429`
    - `SIZE-GROWTH-2026-03-16-DEEPAGENT` (`packages/tuff-intelligence/src/adapters/deepagent-engine.ts`) -> `2081`
- 验证结果：`pnpm size:guard` 通过。

### docs(nexus-risk): 设备授权风控文档闭环补齐

- `NexusDeviceAuthRiskControl-260316.md` 增补：
  - Phase 0 验收证据矩阵
  - 回滚演练记录（2026-03-22）
  - 风控告警与值守说明
  - 最小可复现门禁命令与发布前检查单
- `TODO` 对应项同步收口：
  - `Phase 0 验收证据` -> 已完成
  - `告警策略与值守` -> 已完成
  - `发布前检查单` -> 已完成

## 2026-03-21

### fix(aiapp-websearch): 非 Responses 渠道不再触发 `responses_builtin` 硬失败

- `aiapp-tool-gateway` 增加 fallback 资格判断：仅当渠道为 `openai + responses` 且可解析 Responses endpoint 时，才尝试 `responses_builtin`。
- 调整 fallback 容错：当 provider 池已有部分结果时，即使 fallback 请求异常，也不会中断整次 websearch，继续返回已命中的 provider 结果。
- 新增回归测试 `aiapp-tool-gateway.test.ts`：
  - 覆盖“provider 有结果 + channel 为 `chat.completions`”场景；
  - 断言不会调用 Responses 接口、不会因 fallback 报错、结果保持 `gateway` 成功返回。

### fix(core-settings): 账号/主题/订阅状态一致性修复

- `useAuth` 挂载初始化与 `beginner.init` 解耦：认证状态拉取与同步始终执行；登录恢复提示逻辑继续受 `beginner.init` 门控，修复“已登录却被判为未登录”体感问题。
- 主题持久化 SoT 统一到 `StorageList.THEME_STYLE`（`theme-style.ini`）：
  - renderer 侧改为 `TouchStorage` 存储，不再把 `localStorage('theme-style')` 作为常规读源；
  - 新增一次性 legacy 迁移：当远端仍是默认态时，自动吸收旧 `theme-style` 并清理本地遗留键；
  - 主题切换 `light/dark/auto` 三种模式均同步写入 `theme.style.auto + theme.style.dark`，避免模式切换后反复回到 auto。
- `TuffUserInfo` 新增订阅兼容判定 `computeSubscriptionActive`：优先 `isActive`，次选 `status`（支持 `ACTIVE/TRIALING`），最后回落 `expiresAt`；缺字段默认避免误报“已过期”。
- 新增回归测试：
  - `theme-style.utils.test.ts`（模式映射与 legacy 解析）
  - `use-auth-policies.test.ts`（认证初始化与登录恢复提示门控策略）
  - `user-subscription.test.ts`（`isActive/status/expiresAt` 兼容判定）

### fix(aiapp-routing-admin): 渠道模型同步不再自动创建/更新 Model Groups（仅保留手动编排）

- 调整 `syncAIChannelModels`：同步流程仅更新渠道侧 `channels[].models/defaultModelId/modelsLastSyncedAt`，不再把 discovered 模型写入 routing `modelCatalog`。
- 移除同步链路中的自动合并调用，避免在“模型组管理”中出现“未手动创建却被同步生成”的分组项。
- 新增回归测试 `aiapp-channel-model-sync.test.ts`，确保 `admin/channel-models/sync` 不会触发 `mergeDiscoveredModelsIntoCatalog`。

### feat(aiapp-routing-admin-ui): Model Groups 支持多选批量删除与分页

- `admin/system/model-groups` 新增表格勾选列，支持多选批量删除（含二次确认与“至少保留一个模型组”约束）。
- 新增分页器（`total/sizes/pager/jumper`），支持页大小切换（10/20/50/100）。
- 新增跨分页选中同步逻辑：翻页后保留已选项，保存/删除后自动清理无效选中并回收越界页码。
- `quota-auto` 设为系统保留模型组：行内删除禁用，批量删除自动排除，确保该分组始终可用。
- 后端 `normalizeModelCatalog` 调整为“仅强制保留 `quota-auto`”，不再自动补回 `gpt/gemini/claudecode` 等 system 默认分组；新增回归测试覆盖该行为。

### fix(aiapp-image): image.generate 兼容“url 字段携带 base64”并修复 Capability Lab 预览

- `aiapp-tool-gateway` 的 `image.generate` 结果解析增强：
  - 当上游把图片数据放在 `url` 字段（`data:image/...` 或 raw base64）时，自动识别并落 `runtime media cache`，继续对外返回 URL-first 结果；
  - 保留原有 `b64_json` 解析路径，并补充 base64 payload 规范化，减少异常格式导致的空结果。
- `retired-ai-app/app/pages/test/image-lab.vue` 增加图片预览兜底：
  - 优先 `url` 预览，缺失时回落到 `base64` 组装 `data:image/...` 预览；
  - 避免“结果存在但页面不显示”的误判。
- 新增回归测试 `aiapp-tool-gateway.test.ts`：覆盖“`url` 字段为 base64 payload”场景，确保输出被归一到 runtime cache URL。

### feat(aiapp-multimodal): Provider 多模态能力配置统一到 `capabilities` 并打通媒体运行时回退

- 模型组配置升级为统一能力映射：
  - `AIModelCatalogItem` 新增 `capabilities`（`websearch/file.analyze/image.generate/image.edit/audio.tts/audio.stt/audio.transcribe/video.generate`）。
  - 保留并兼容 legacy 字段（`allowWebsearch/allowImageGeneration/allowFileAnalysis/allowImageAnalysis`），读取时自动合并回填，写回时同步双轨字段。
  - 旧配置自动“仅补缺不覆盖”补齐缺失能力位，不改用户已有绑定/优先级/路由策略。
- 路由解析新增能力门控与排除重试：
  - `resolveAIRoutingSelection` 新增 `requiredCapability` 与 `excludeRouteKeys`；
  - 当能力不匹配时自动过滤候选；无可用候选时返回统一错误码 `AIAPP_CAPABILITY_UNSUPPORTED`。
- 媒体调用链路新增自动回退：
  - 新增 `executeAIMediaWithFallback`，对媒体能力执行“失败/unsupported 后按 routeKey 回退到下一 provider”；
  - `chat stream` 与 `aigc executor` 的 `image_generate` 分支接入该回退链路。
- Tool Gateway 新增多模态 REST 能力：
  - 新增 `image.edit`、`audio.tts`、`audio.stt`、`audio.transcribe`；
  - `video.generate` 返回明确未实现错误 `AIAPP_MEDIA_VIDEO_NOT_IMPLEMENTED`。
- 媒体输出统一为 URL-first：
  - 新增运行时媒体缓存与 `GET /api/runtime/media-cache/:id`；
  - 图片/音频二进制默认落缓存 URL 返回；
  - 支持 `output.includeBase64` 可选返回 `base64`（默认关闭）。
- 能力测试入口升级：
  - 新增 `POST /api/runtime/capability-test/invoke`，统一测试 `image.generate/image.edit/audio.tts/audio.stt/audio.transcribe/video.generate`；
  - `retired-ai-app/app/pages/test/image-lab.vue` 升级为 capability lab，展示路由结果、回退尝试链路与媒体结果。
- 测试补齐：
  - 新增 `aiapp-admin-routing-config.capabilities.test.ts`；
  - 扩展 `aiapp-routing-resolver.intent.test.ts`（能力门控、排除已失败 route）；
  - 扩展 `aiapp-tool-gateway.test.ts`（image.edit/audio.tts/audio.stt/audio.transcribe/video 未实现）。

### feat(aiapp-routing-admin-ui): 模型组能力开关重构为“模板化 + 分层配置 + 规则联动”

- `admin/system/model-groups` 编辑弹窗重构为分层结构：
  - 新增分区：`运行状态`、`推理策略`、`能力矩阵`、`工具权限`；
  - 能力文案改为“中文主标签 + key 副文”，`video.generate` 显示“实验中”。
- 新增模型组模板预设（可一键覆盖）：
  - `通用对话`、`研究检索`、`多模态创作`、`语音助手`；
  - 新建模型组默认套用 `通用对话`，减少手工点选成本。
- 新增规则联动与保存校验：
  - `thinkingSupported=false` 时强制 `thinkingDefaultEnabled=false`；
  - 关闭 `websearch` 时自动移除 `builtinTools.websearch`；
  - `defaultRouteComboId` 改为下拉选择，历史脏值展示“失效”并阻止保存。
- 新增共享能力元数据与规则模块：
  - 新增 `retired-ai-app/shared/aiapp-capability-meta.ts`，统一维护 `AICapabilityMeta`、能力分组、模板预设、legacy 回填、route combo 校验；
  - 管理端、服务端与运行时消费同一份 capability 解析与联动规则。
- 运行时对齐：
  - `useAIRuntimeModels` 与 `ThInput` 改为基于统一能力映射判断禁用状态与提示文案；
  - `capabilities` 成为主语义源，`allow*` 保持兼容派生写回。
- 回归测试：
  - 新增 `aiapp-capability-meta.shared.test.ts`（模板矩阵、thinking/websearch 联动、legacy 优先级、route combo 校验）；
  - 更新 `aiapp-admin-routing-config.capabilities.test.ts` 对齐显式 `capabilities` 优先断言。

## 2026-03-20

### feat(core-intelligence): 多模态 Provider 统一配置与运行时分发（LangChain 优先）

- 能力配置统一补齐（保持点号能力 ID 不变）：
  - 新增/补齐默认能力：`image.generate`、`image.edit`、`audio.stt`、`video.generate`（保留既有 `audio.tts`、`audio.transcribe`）。
  - 配置回填策略升级为“仅补缺不覆盖”：历史配置缺失能力自动回填，不改写用户已有模型绑定、优先级与 Prompt。
- 运行时分发补齐：
  - `invoke` 分发新增 `image.edit`、`audio.tts`、`audio.stt`、`audio.transcribe`、`video.generate` case，避免“已注册但不可调用”。
  - 保持失败策略：首 provider `unsupported/失败` 后自动回退下一 provider，全部尝试后再返回最终错误。
- Provider 适配（LangChain + REST 补齐）：
  - LangChain 主链继续承接 `chat/embedding/vision`；
  - OpenAI-compatible（含 OpenAI / SiliconFlow / Custom）新增媒体 REST 能力：
    - `POST /images/generations`、`POST /images/edits`
    - `POST /audio/speech`、`POST /audio/transcriptions`、`POST /audio/translations`
  - `Anthropic / DeepSeek` 对缺失媒体端点显式返回 `unsupported`，由策略层自动回退。
- 媒体结果返回规范：
  - 默认 URL-first：图片/音频落临时文件并返回 `tfile://` URL；
  - 新增 `output.includeBase64`（默认 `false`）可选返回 base64，控制 IPC 体积；
  - 输出结构保持向后兼容，在原字段上新增可选 `url/base64`。
- `video.generate` 范围约束：
  - 本期仅落配置与能力注册（含测试器提示“配置已生效，运行时未实现”），真实视频生成端点延后实现。
- 回归验证：
  - 已通过定向测试：`intelligence-sdk`、`local-provider`、`tuff-intelligence-runtime`；
  - `typecheck:node` 已通过。

### feat(aiapp-websearch): 全局 Provider 池聚合配置落地（SearXNG/Serper/Tavily + builtin 兜底）

- `datasource.websearch` 升级为“纯全局池”结构：
  - 新增 `providers[]`（`id/type/enabled/priority/baseUrl/apiKeyEncrypted/timeoutMs/maxResults`）；
  - 新增 `aggregation`（`mode/targetResults/minPerProvider/dedupeKey/stopWhenEnough`）；
  - 新增 `crawl`（`enabled/timeoutMs/maxContentChars`）。
- 保留 legacy 字段兼容映射：
  - 当新 `providers` 为空时，自动把 `gatewayBaseUrl/apiKeyRef` 映射为 `legacy-gateway` 单 provider；
  - 新结构写回后清空 legacy 字段扩展入口，仅保留读取兼容。
- `aiapp-tool-gateway` 执行链路切换为 provider 聚合：
  - 按 `priority` 执行主 provider，不足 `targetResults` 时按顺序补召回；
  - 基于 `dedupeKey(url | url+content)` 去重，并在达到目标后停止；
  - 仍不足时回退 `responses_builtin`（OpenAI Responses 内置检索）。
- 管理端新增全局配置页面：`/admin/system/websearch-providers`：
  - 支持 provider 列表增删改、启停、排序、key 维护（留空不变 / clear 清空）；
  - 支持单页维护 `aggregation` 与 `crawl`（“聚合填写”入口）。
- 审计与观测增强：
  - `websearch.executed` 新增 `providerChain/providerUsed/fallbackUsed/dedupeCount`；
  - 保持并透传 `source/sourceReason/sourceCount` 便于排障。
- 单测补齐：
  - 新增 `aiapp-admin-datasource-config.test.ts`（legacy 映射、加密/脱敏、key 保持与清空）；
  - 更新 `aiapp-tool-gateway.test.ts` 适配 provider 池聚合与 fallback 分支；
  - 保留 `aiapp-websearch-connector.test.ts` 去重与 allowlist 回归。

### feat(aiapp-image-lab): 新增 LangChain 兼容图像直连测试页与 Runtime API

- 新增页面 `retired-ai-app/app/pages/test/image-lab.vue`：
  - 提供 `Base URL / API Key / Model / Prompt / size / count / timeoutMs` 手动输入；
  - 支持“拉取模型 + 生成图像 + 清空结果”流程；
  - 展示图片预览、`revisedPrompt`、`callId`、耗时与错误信息；
  - `apiKey` 仅保存在页面内存态，不写入 URL 和本地持久化。
- 新增 runtime 接口（登录可用）：
  - `POST /api/runtime/image-test/models`：按手填 `baseUrl/apiKey` 拉取可用模型列表；
  - `POST /api/runtime/image-test/generate`：按手填配置直接触发图像生成并返回图片结果。
- 后端能力复用与扩展：
  - 复用 `discoverAIChannelModels` 实现模型发现；
  - 复用 `executeAIImageGenerateTool` 实现图像生成，并扩展支持 `size/count`（默认 `1024x1024`、`1`）。
- 测试覆盖新增：
  - `aiapp-tool-gateway` 增加 `size/count` 默认与透传用例、空结果失败用例；
  - 新增 runtime image-test API handler 单测，覆盖参数校验与上游错误映射。

### fix(aiapp-routing): Route Combo 跳过已关闭模型，避免继续命中无效 providerModel

- `retired-ai-app/server/utils/aiapp-routing-resolver.ts`：
  - 新增渠道模型可用性校验，Route Combo / 模型绑定 / 候选池筛选阶段统一跳过“渠道内已禁用或不存在”的 `providerModel`；
  - fallback 选模策略增强：优先回退到渠道内启用模型，避免落到已关闭模型导致 400（`Model does not exist`）持续报错。
- `retired-ai-app/server/utils/__tests__/aiapp-routing-resolver.intent.test.ts`：
  - 新增回归用例：当 Route Combo 同时包含已关闭模型与可用模型时，验证路由会自动忽略已关闭模型并选择可用模型。

### feat(aiapp-routing-admin): 渠道模型批量管理 + 模型优先级 + 内置工具迁移到模型组

- `retired-ai-app/app/pages/admin/system/channels.vue`：
  - 渠道模型列表新增「一键清空 / 全部启用 / 全部禁用」；
  - 渠道模型新增 `priority` 字段并参与保存。
- `retired-ai-app/server/utils/aiapp-admin-channel-config.ts` / `aiapp-channel-model-sync.ts`：
  - 渠道模型配置支持 `priority` 归一化与同步默认值（默认 `100`）。
- `retired-ai-app/app/pages/admin/system/model-groups.vue` / `app/composables/useAIRoutingAdmin.ts`：
  - 模型组新增 `builtinTools` 配置入口，并写入 routing 配置。
- `retired-ai-app/server/utils/aiapp-routing-resolver.ts`：
  - 内置工具优先读取模型组配置；若模型组未配置则兼容回退到渠道配置；
  - `quota-auto` 选择时支持渠道模型 `priority` 参与排序。

### fix(aiapp-markdown): MilkContent 只读代码块移除高度上限与顶部偏移

- `MilkContent` 的 `createReadonlyCodeBlockView` 移除 `--editor-code-content-max-height` 注入，代码块视图不再受 `max-height` 变量限制。
- `style.scss` 中 `EditorCode-Content` 与 `EditorCode-InlinePreview` 去除 `max-height`，保持内容自然撑开；保留横向/纵向溢出滚动能力。
- `EditorCode--Sticky` 的 `HeaderHost` 统一改为 `top: 0`，不再使用 `84px` 顶部偏移变量。

### fix(aiapp-markdown-ui): 修复只读代码块右侧复制按钮可见性

- `RenderCodeHeader` 的复制按钮从“仅图标”调整为“图标 + 文案（复制/已复制）”，避免图标字体未命中时出现按钮空白。
- 同步微调复制按钮尺寸与间距（`min-width/gap`），保证代码头右侧操作区在浅色主题下稳定可辨识。

### fix(aiapp-runtime-ui): 运行事件最小化前台展示 + 审批协议统一

- `POST /api/chat/sessions/:sessionId/stream` 与 `POST /api/aigc/executor` 的高风险 websearch 审批分支统一从 `error` 语义切换为 `turn.approval_required`，并以 `done(status=waiting_approval)` 收束，不再误判为失败轮次。
- 意图解析链路合并记忆沉淀决策：`intent.completed` 新增 `memoryDecision(shouldStore/reason)`，轮次结束按该决策触发事实抽取与写入，不再以消息条数变化误判“已沉淀”。
- 新增 `aiapp_chat_memory_facts` 事实存储与去重写入；`memory.updated` 改为沉淀语义（`addedCount/stored/reason` 为主，`historyBefore/historyAfter` 仅兼容），前端仅在 `stored=true` 时展示“已沉淀记忆/已沉淀 X 条记忆”，并移除记忆卡调试字段展示。
- `AIRunEventCard` 改为默认收起（失败态默认展开），新增“详情/收起”交互；联网卡片仅在 `websearch.executed && sourceCount>0` 显示。
- 修复只读代码块 header 双重 sticky：保留 `HeaderHost` sticky，取消内层 header sticky，并在聊天只读渲染链路默认关闭 sticky header。

### fix(aiapp-markdown-compat): 旧聊天页 Markdown 原样显示兼容修复

- 旧聊天页 `ChatItem` 对 assistant 的 `text` block 增加兼容渲染：改走 `RenderContent`（Markdown），user 侧 `text` 仍保持 `<pre>` 文本展示，避免语义回归。
- `@talex-touch/tuff-intelligence-conversation` 新增 `normalizeLooseMarkdownForRender`，统一做轻量渲染归一化：`CRLF -> LF`，并修复智能引号包裹 fence（如 “`cpp 与 `” 这类分隔符写法）。
- `ThContent -> MilkContent` 接入该归一化函数，减少非标准 fence 导致的代码块降级为纯文本问题。
- 会话快照序列化前向修复：assistant 纯字符串块默认映射为 `markdown`（user/system 保持 `text`），阻止新快照继续产出旧形态。

## 2026-03-19

### feat(aiapp-strict): AI 严格模式禁降级 + 顶部 AIAPP 标识 + 提示词升级

- `executor` 与 `chat stream` 双链路新增严格模式拦截：`aiappMode=true` 且 LangGraph 不可用时直接返回结构化错误 `AIAPP_STRICT_MODE_UNAVAILABLE`，不再回退 `deepagent`。
- `createAIRuntime` 新增严格控制参数（`strictAIMode/allowDeepAgentFallback`），严格模式下关闭 `AIFallbackEngineAdapter`，LangGraph 运行失败直接透传失败。
- 新增 `aiapp-system-prompt` Builder，运行时系统提示词升级为 ThisAi 模板，并注入 `name/ip/ua`（不可得时安全降级）。
- `index.vue` 顶部 header 与状态栏新增显式 `AIAPP` 模式标签，普通模式显示“普通模式”，提升模式可感知差异。
- `executor/stream` 统一补齐记忆与联网审计：新增 `memory.context`、`websearch.decision`（含触发/未触发原因）等审计事件，并将 `memoryEnabled`、历史条数与 websearch connector 来源透传到 runtime metadata / routing metrics。

### feat(aiapp-websearch): datasource 缺失时新增 Responses 内置检索 fallback

- `aiapp-tool-gateway` 新增 websearch 后备路径：当 datasource gateway 未配置时，优先使用 OpenAI Responses 内置 websearch 工具执行检索。
- 工具审计 payload 新增 `connectorSource/connectorReason`，可区分 `gateway`、`responses_builtin` 与不可用原因（不再静默无感）。
- websearch 工具非审批类失败改为返回 `null + tool.call.failed` 审计，不中断主对话链路；审批 required/rejected 仍保持阻塞失败。
- 新增单测覆盖：strict runtime 行为、prompt builder 插值、websearch fallback 与失败可观测分支。

### feat(aiapp-ui): 旧 UI 硬切换到会话级事件卡片流（无全局运行态）

- 保留 `ThChat/ThInput/History` 旧界面骨架，移除运行态全局条作为状态主承载；运行态改为会话消息内卡片长期留存。
- `completion/index.ts` 事件消费改为新事件族单通道：统一解析 `event || type`，主流程仅消费 `intent.* / routing.selected / memory.context / websearch.* / thinking.* / assistant.* / run.audit / error / done`。
- 新增 `aiapp_run_event_card` 渲染组件并接入 `ChatItem`；支持 `intent/routing/memory/websearch/thinking` 卡片 upsert、流式增量（thinking）与会话隔离（`sessionId+turnId` 作用域）。
- Legacy 事件（`turn.* / status_updated / completion / verbose / session_bound`）前端不再驱动状态，仅做一次性告警忽略。
- 管理端渠道配置硬切：`adapter` 固定 `openai`，不再提供 `legacy` 选项；`transport` 仅保留 `responses/chat.completions`。

### fix(aiapp-markdown): 修复 Mermaid Mindmap 在 Milkdown 只读渲染链路失效

- 根因修复：`mermaid mindmap` 动态依赖 `cytoscape-cose-bilkent` 时触发 CJS/ESM 默认导出不兼容，导致预览渲染失败。
- 新增前端构建 shim：`cytoscape-cose-bilkent`、`cytoscape-fcose` 统一导出稳定 `default`，并在 `nuxt.config.ts` 中接入 alias。
- 保持 `MilkContent` 渲染交互不变，仅在 dev 环境补充 Mermaid 渲染失败错误码日志（如 `E_MERMAID_ESM_EXPORT`）便于定位。

### refactor(aiapp-markdown): 复用图渲染内核 + 代码头双层 Sticky

- 新增 `article/renderers` 共享渲染内核：
  - `mermaid-renderer`：统一初始化、渲染与错误码上报；
  - `markmap-renderer`：统一 transform/mount/fit/reset/destroy 生命周期。
- 编辑态 `EditorMermaid`、`EditorMindmap` 改为复用共享内核，保留原有工具栏与下载/复制交互。
- 只读链路 `MilkContent` code block 改为复用同一内核，语言路由收敛：
  - `mermaid` / `flowchart` -> Mermaid；
  - `mindmap` -> Markmap。
- `MilkContent` 新增可选接口（默认向后兼容）：
  - `stickyCodeHeader?: boolean = true`
  - `codeContentMaxHeight?: string = 'min(56vh, 680px)'`
- 代码块结构升级为 `EditorCode-Chrome + HeaderHost + Content`，实现“页面滚动可见 + 块内滚动可见”的双层 sticky 体验。

### feat(aiapp-chat): 记忆开关迁移个人设置 + 模型列表收敛后端配置 + AI 入口并入 `+`

- 记忆系统开关从主聊天输入面板迁移到「个人设置 -> 外观」，支持一键开关；关闭时自动执行 `memory/clear(scope=all)` 并同步写入 `memory/settings`。
- 主聊天输入区 `ThInputPlus` 移除“记忆系统”，新增“AI 模式”开关，作为会话与发送 meta 的统一入口（放入 `+` 面板）。
- 运行时模型前端列表改为“仅后端配置可见 + 默认 Auto 项”：
  - 去除前端 GPT/Gemini/Claude 硬编码 fallback；
  - API 失败或空配置时仅保留 `Auto(quota-auto)`，避免展示未在后端配置的模型。

### refactor(aiapp-input): 合并“分析图片/分析文件”为单一“分析文件”入口

- 输入区 `ThInputPlus` 移除独立“分析图片”入口，统一为一个“分析文件”按钮（支持图片 + 文档）。
- `ThInput` 侧统一附件能力判定为 `allowFileAnalysis`，粘贴/上传/文件选择不再区分 image/file 双开关。
- 运行时模型能力兼容：`allowFileAnalysis` 优先，缺省回退历史 `allowImageAnalysis`；对外返回保持两字段同值，避免旧客户端语义分叉。

### fix(aiapp-input): 优化输入面板高度并补齐记忆系统快捷开关

- `ThInputPlus` 去除固定 `320px` 高度，改为按内容自适应，避免在“分析文件”合并后出现大面积空白。
- 在输入面板新增“记忆系统”开关项，复用现有 `v1/chat/memory/settings` 能力切换当前会话记忆状态。
- `ThInput` / `pages/index.vue` 打通记忆开关状态与禁用提示，策略或提交中状态下保持只读并给出明确提示。

### fix(aiapp-input): 修复 Legacy UI 中 AI 开关关闭后仍透传 `aiappMode=true`

- 修复 `pages/index.vue` 中发送元数据合并逻辑：`aiappMode` 改为“显式输入优先，未提供时回退会话状态”，不再使用 `OR` 强制吸附历史会话值。
- 结果：当用户在 `ThInputPlus` 中关闭 `AI 模式` 后，本轮请求可正确透传 `aiappMode=false`；仅在未显式设置时沿用会话级默认。
- 聊天页顶部与底部模式标签改为会话联动展示：`aiappMode=true` 显示 `AIAPP`，关闭后显示 `普通模式`，避免静态 `AIAPP` 误导。

### fix(aiapp-chat): turns 失败响应脱敏（隐藏连接端点与本地路径）

- `POST /api/v1/chat/sessions/:sessionId/turns` 增加统一异常兜底：数据库/网络异常不再把底层错误对象直接冒泡到前端。
- 新增服务端错误脱敏工具（`server/utils/aiapp-http.ts`）：对 `IP:PORT`、域名端口、绝对本机路径执行遮罩处理。
- 对瞬时连接类错误（如 `ETIMEDOUT/ECONNREFUSED`）返回统一可读文案与稳定状态码（`503`），降低前端日志泄露内部拓扑风险。
- 前端 `completion` 错误文案解析增加二次脱敏，确保即使上游异常信息带敏感连接串，也不会直接展示给用户。

### fix(aiapp-sync): chat sessions 流式链路回灌 quota 历史快照

- `POST /api/chat/sessions/:sessionId/stream` 在流结束阶段新增“兼容快照回灌”：从 runtime 会话实时读取 `messages + title`，统一写入 `aiapp_quota_history`，避免旧 `syncHistory` 拉到陈旧快照后覆盖本地会话。
- 同步维护 `aiapp_quota_sessions` 映射（`chat_id = runtime_session_id`），保证旧会话入口与新 runtime 会话保持一致可追踪。
- 回灌链路采用 best-effort（失败仅 `warn`，不阻断主流式响应），优先保障对话主链路稳定。

### fix(aiapp-sync-ui): 旧聊天页发送完成后停用 legacy 会话拉取覆盖

- `retired-ai-app/app/pages/index.vue` 移除发送完成阶段对 `syncHistory()` 的依赖，不再请求 `GET /api/aigc/conversation/:id` 回填当前会话。
- 会话同步状态改为本地收敛：发送开始置 `pending`，请求完成按最终状态置 `success/failed`，并仅更新本地 `history list` 快照，避免空 `messages` 响应覆盖本地上下文。
- `REQUEST_SAVE_CURRENT_CONVERSATION`（含 `Ctrl+S` 与状态栏同步按钮）改为本地快照保存，不再触发 legacy 会话详情接口。

### fix(aiapp-approval-ui): 补齐工具审批入口并移除审批超时失败分支

- 旧聊天页 `aiapp_tool_card` 新增内联“批准/拒绝”按钮：当 `status=approval_required` 且存在 `ticketId/sessionId` 时，可直接调用 `POST /api/v1/chat/sessions/:sessionId/tool-approvals/:ticketId` 完成审批。
- 工具卡 payload 补充 `sessionId`，避免 UI 端审批动作缺少上下文导致无法提交。
- 审批链路改为“前端显式决策 + 单次事件续跑”：去除前端轮询审批状态，不再生成“审批等待超时（>Ns）”错误卡。
- 前端审批成功后通过 `aiapp-tool-approval-decision` 事件回传当前会话，触发流式链路 resume；拒绝时直接落工具拒绝态并结束当前轮次。
- 对 `event=error` 且 `code=TOOL_APPROVAL_REQUIRED` 的流事件改为“等待审批态”处理，不再额外渲染错误卡干扰审批流程。

## 2026-03-18

### fix(aiapp-build): 拆分前端安全子入口，修复 `AsyncLocalStorage` 运行时异常

- 新增 `@talex-touch/tuff-intelligence-conversation` 子入口（`packages/tuff-intelligence/src/aiapp-conversation.ts`），仅导出 `serializeAIExecutorMessages`，避免前端链路误引入 `deepagents/langgraph` 的 Node-only 依赖。
- `retired-ai-app/app/composables/api/base/v1/aigc/completion/index.ts` 改为从 `aiapp-conversation` 引用序列化能力，不再通过 `@talex-touch/tuff-intelligence` 聚合入口取值。
- 结果：消除浏览器打包链路对 `node:async_hooks` 的依赖，修复 `import_node_async_hooks.AsyncLocalStorage is not a constructor` 导致的 500 问题。

### fix(aiapp-executor): 渠道路由失败错误透传到前端可见

- `retired-ai-app/server/api/aigc/executor.post.ts` 在渠道选择失败分支补齐并下发结构化错误信息：`code/reason/request_id/status_code/detail`，并附带 `model_id/provider_model/route_combo_id/selection_reason/selection_source` 等诊断字段。
- `retired-ai-app/app/composables/api/base/v1/aigc/completion/index.ts` 保留 SSE `error` 事件中的结构化字段，错误 block 写入 `extra`（`requestId/statusCode/code/reason/detail`），不再只保留 message。
- `retired-ai-app/app/components/chat/attachments/ErrorCard.vue` 优先读取结构化 `extra`，补充展示诊断摘要与路由上下文，并稳定展示可复制的 `requestId`，便于用户感知与问题定位。

### fix(aiapp-intelligence): 前后端会话结构统一 + websearch 按意图触发

- 新增 `packages/tuff-intelligence/src/business/aiapp/conversation.ts` 共享 util，并在前后端同时接入：
  - `serializeAIExecutorMessages`：统一会话消息序列化，保留 `card/tool` 等非 markdown block（即使 `value` 为空也不丢失）。
  - `buildAIConversationSnapshot`：统一会话快照构建，避免后端将历史消息退化为纯 markdown 文本导致 toolcall/tool card 信息丢失。
  - `extractLatestAIUserTurn` / `buildAITitleMessages`：统一最新用户轮提取与标题消息抽取规则。
- `legacy executor` websearch 触发策略收敛：
  - 新增 `shouldExecuteAIWebsearch` 判定，websearch 不再“联网开关开启即调用”；
  - 优先使用意图分类结果（`websearchRequired`），仅在意图要求时触发；
  - 意图缺失时走启发式兜底（如“最新/实时/查一下/today/latest”等时效检索场景）。
- `aiapp-intent-resolver` 输出新增 `websearchRequired/websearchReason`，并在 `executor` 侧落地判定与观测字段（`websearchDecision`）。
- 新增回归测试：`retired-ai-app/server/utils/__tests__/aiapp-conversation-shared.test.ts`，覆盖 block 保留、快照结构、标题抽取与 websearch 判定逻辑。
- 新增稳定子入口 `@talex-touch/tuff-intelligence`（`src/aiapp.ts` + package exports），AI 前后端调用从深路径/根聚合出口收敛到领域子入口，降低路径耦合与误引入风险。
- 补齐 `aiapp` 子入口导出清单（含 runtime/store/protocol/adapters 的 AI 侧必需符号），并将 `retired-ai-app` 中原 `@talex-touch/tuff-intelligence` 根出口引用全部迁移到 `@talex-touch/tuff-intelligence`。

### feat(aiapp-graph): 新建会话可选 AI 模式（Graph 优先，DeepAgent 回退）

- 前端主聊天页（`/`）新建会话新增模式选择：
  - 可选择“启用 AI 模式（Graph 优先）”或“普通模式”；
  - 会话级持久化字段新增 `aiappMode`，并在聊天头部展示当前会话模式标签。
- v1 链路透传补齐：
  - `POST /api/v1/chat/sessions/:sessionId/turns` 入队 payload 新增 `aiappMode`；
  - `POST /api/v1/chat/sessions/:sessionId/stream` 代理 executor 时透传 `aiappMode`。
- 执行器编排决策增强：
  - `executor` 在 `aiappMode=true` 时向 orchestrator 传入 `preferLangGraph=true`；
  - orchestrator 会优先选择可用且绑定 `langgraphAssistantId` 的 route combo；
  - 若本地 Graph 服务不可用或无可用 Graph combo，保持自动回退 `deepagent`，不影响现有稳定性。

### feat(aiapp-tools): 通用工具调用提示 + AI 数据源抓取（V1 双线并行）

- 新增 `AIToolGateway` 与 `websearch` connector 抽象（`search/fetch/extract`），并接入可配置网关主路径。
- 新增 `datasource.websearch` 配置（`gatewayBaseUrl/apiKeyRef/allowlistDomains/timeoutMs/maxResults/crawlEnabled/ttlMinutes`）并纳入 Admin settings 聚合读写。
- 新增工具审批票据存储与 API：
  - `GET /api/v1/chat/sessions/:sessionId/tool-approvals?status=pending`
  - `POST /api/v1/chat/sessions/:sessionId/tool-approvals/:ticketId`
- 工具生命周期统一输出 `run.audit`（`tool.call.started/approval_required/approved/rejected/completed/failed`），payload 固定字段对齐 `callId/toolId/toolName/riskLevel/status/inputPreview/outputPreview/durationMs/ticketId/sources/errorCode/errorMessage`。
- `legacy executor` 与 `v1 chat stream` 打通工具事件透传：已清理 `status_updated(calling/result)` 的工具兼容映射，统一以 `run.audit` 作为工具卡片唯一事件源，并对高风险场景启用阻塞式审批。
- 前端补齐统一解析：
  - Tool 卡片统一由 `run.audit` 驱动（不再消费 legacy `status_updated(calling/result)` 生成工具卡）；
  - 增加 `AIToolCard` 渲染组件，展示工具状态、输入/输出预览、来源链接、审批 ticket 信息。

### feat(aiapp-approval): 审批通过自动续跑 + Legacy 工具事件 Phase 2 收口

- 旧聊天页 `$completion` 增加审批自动续跑：
  - 收到 `turn.approval_required` 后自动轮询 `GET /api/v1/chat/sessions/:sessionId/tool-approvals`；
  - 票据 `approved` 后复用原 `request_id` 自动恢复 `stream` 执行；
  - 票据 `rejected` 或轮询超时时，统一写入 Tool 卡片失败态并落错误消息。
- 新增运行时公共配置（含回滚开关）：
  - `aiappToolApprovalAutoResume`（默认 `true`）
  - `aiappToolApprovalPollIntervalMs`（默认 `1500`）
  - `aiappToolApprovalPollTimeoutMs`（默认 `600000`）
  - `aiappEnableExecutorEventCompat`（默认 `false`）
- 补充审批自动续跑回归测试：
  - 新增 completion flow 单测，覆盖 `request_id` 复用（跳过 turn 创建）与审批 `approved/rejected/timeout` 三条分支状态映射。
- Legacy Phase 2（工具提示相关）：
  - `$completion` 默认关闭 legacy `completion/verbose/status_updated(tool)` 兼容分支；
  - 主链路统一为 `turn.* + run.audit`；
  - 通过 `NUXT_PUBLIC_AIAPP_ENABLE_EXECUTOR_EVENT_COMPAT=true` 可按需启用旧事件解析窗口。

### feat(aiapp-intent-image): Intent 图像路由 + image.generate 工具闭环（V1）

- 新增 `AIIntentResolver`（混合策略）：
  - 显式命令优先：`/image`、`/img`；
  - 规则命中：中英文图像生成语义匹配；
  - nano 分类兜底：结构化 JSON 输出 `intent/confidence/reason/prompt`，失败默认回退 `chat`（fail-open）。
- 路由能力扩展：
  - `AIRoutingPolicy` 新增 `intentNanoModelId/intentRouteComboId/imageGenerationModelId/imageRouteComboId`；
  - `AIModelCatalogItem` 新增 `allowImageGeneration`；
  - `resolveAIRoutingSelection` 新增 `intentType`（`chat | image_generate | intent_classification`）并按 intent 选择模型与 route combo。
- 运行时模型接口增强：
  - `GET /api/runtime/models` 新增 `allowImageGeneration`；
  - Admin 模型组与路由策略页面同步支持新字段编辑与展示。
- 工具网关新增 `image.generate`：
  - 生命周期统一发 `run.audit`（`tool.call.started/.../completed/failed`）；
  - V1 仅支持 `openai` 适配器执行图像生成，非支持适配器返回明确错误码并写入 `tool.call.failed`。
- 新旧两条会话链路并行接入：
  - `legacy executor` 与 `chat sessions stream` 均支持意图命中后图像短路执行，返回 Markdown 图片内容并同步 Tool 卡片审计事件。
- Legacy 收口（Phase 1）：
  - 前端工具卡状态仅由 `run.audit + tool.call.*` 驱动；
  - `turn.approval_required` 统一映射为标准工具审计 payload；
  - 去除 tool parser 中 `websearch` 硬编码兜底（改为通用 `tool/tool.unknown`）。

### feat(aiapp-ui): 主聊天 Markdown 流式增量渐变显示

- 仅在 AI 主聊天链路生效：`ThChat -> ChatItem -> RenderContent -> ThContent -> MilkContent`。
- `RenderContent` 新增可选属性 `streamingGradient`（默认关闭），仅在 `dotEnable=true` 且 markdown 内容持续增量时触发节流渐变 pulse。
- 新增独立 overlay 扫光动画，保留原有 `Generating-Dot` 光标行为，并在组件卸载时清理 pulse/dot 相关计时器。
- 增加 `prefers-reduced-motion` 自动降级：系统开启“减少动态效果”时不触发渐变 pulse。
- `ChatItem` 仅对 `block.type === 'markdown'` 主聊天渲染接入 `streaming-gradient`，不影响分享图、后台 Prompt 预览和其他产品线。

### fix(aiapp-markdown): Milkdown 渲染兼容修复与版本核验

- 修复 `refractor` 语言模块导入路径兼容性：统一为 `refractor/*`，避免 `refractor/lang/*` 在 Bundler 模式下触发模块解析失败。
- 修复 `MilkdownRenderStashed` 的 prism 插件导入错误：从 `@milkdown/kit/plugin/prism` 更正为 `@milkdown/plugin-prism`。
- 修复 `MilkdownEditor` 上传器类型签名不兼容：对齐 `Uploader` 新签名参数，移除错误的 DOM `Node[]` 强类型约束。
- 优化主聊天流式 markdown 刷新策略：改为“优先按换行边界增量刷出 + 超时强制刷出”，减少有序/无序列表在流式阶段的半截语法重排抖动。
- 清理 `MilkdownRenderStashed` 的重复实现，改为复用 `MilkdownRender` 薄封装，降低后续配置漂移与维护成本。
- 新增开发态专用测试路由：`/test/markdown-stream`，用于可视化验证主聊天 Markdown 流式渐变与列表稳定性（非 dev 环境访问返回 404）。
- 测试页新增 `autoplay/speed` 查询参数（示例：`/test/markdown-stream?autoplay=1&speed=70`），便于稳定复现实录与截图对比。
- 测试页默认回放速度调整为 `16ms`，并将速度滑块/查询参数下限同步为 `16`，便于高频流式回归。
- 根据主聊天体验回归进一步微调：
  - 渐变效果收敛为“底部横线扫光”，并改为仅在增量包含换行（行完成）时触发；
  - `Generating-Dot` 跟随节流从 `80ms` 提升至 `24ms`，并增加 `requestAnimationFrame` 持续追踪，减少光标滞后；
  - 进一步将 `Generating-Dot` 改为帧级即时定位（去除位置过渡拖影），并将无换行场景 markdown 强制刷出窗口从 `320ms` 下调到 `64ms`，提升“贴尾”感；
  - 修复 `Generating-Dot` 在代码块场景的横向偏移：定位改为“最后可见文本节点末尾的折叠 Range”，并排除无文本尾节点（如 copy 按钮）锚点污染；
  - `Generating-Dot` 定位继续增强：改为“文本节点优先 + 列表/段落/代码块兜底锚点”，避免在半结构态（如仅出现列表 marker）时回跳到上一个标题行；
  - 修正 `Generating-Dot` 锚点优先级：仅在无法取得文本尾锚点时才使用兜底锚点，避免 dot 被列表节点覆盖导致错位；
  - `Generating-Dot` 定位坐标改为基于 `cursor.offsetParent` 统一换算，并在空列表项（仅 marker）场景允许兜底锚点前置，降低列表阶段横向偏移；
  - `Generating-Dot` 闪烁动画改为 CSS 常驻，不再在每次位置刷新时重置 animation，避免高频更新下出现“看起来跟不上”的视觉滞后；
  - `Generating-Dot` 进一步修正列表中间态锚点抢占：当已有有效文本尾锚点时，后续空 `LI` 不再抢占 fallback，避免 dot 回跳到列表起始位；
  - `Generating-Dot` 纵向基线下调 `+3px`，贴近中文正文基线，减少“看起来偏上”的观感误差；
  - `MilkContent` 流式渲染 flush 间隔从 `80ms` 下调到 `16ms`，减少可见内容与光标跟随的时间差；
  - 主聊天 Markdown 代码块改为组件化头部：新增 `RenderCodeHeader`，统一承载语言类型标签、复制按钮与 `html/svg` 预览入口，并通过 `useRichArticle` 在只读渲染链路按代码块增量挂载；
  - 移除嵌套列表伪元素圆点，避免与默认 marker 叠加导致“双圆点”；
  - 表格样式改为轻边框、单行分隔、柔和表头与 hover，整体更简洁。
  - 修复只读代码块暗色背景冲突：统一覆盖 `EditorCode` 下 `pre/code/token` 背景，去除逐行黑底块与额外底色噪音；
  - 代码块预览能力扩展到 `mermaid`，并增加 `@braintree/sanitize-url` shim alias 兼容，修复预览渲染依赖导出错误；
  - Mermaid 预览加载态增强：弹层内增加 spinner + 状态条，弱网/首次加载时反馈更明确；
  - Mermaid 代码块交互优化：默认以内联预览展示，并支持一键切换到代码视图（预览/代码双态）；
  - SVG/HTML 代码块改为默认内联预览并限制最大展示尺寸；HTML 额外支持“展开”弹层查看完整页面；
  - 代码块“预览/代码”切换控件改为 `TxRadioGroup`，复制按钮改为图标态反馈；
  - 开发测试页 `/test/markdown-stream` 右侧 `Stream Preview` 改为固定高度内部滚动，长内容回放不再推高整页滚动。
- 对 `@milkdown/*` 执行最新稳定版本核验：当前 `core/kit` 最新为 `7.19.0`，`plugin-math` 最新为 `7.5.9`，`plugin-diagram` 最新为 `7.7.0`（上游已标记 deprecated），本次未引入额外版本漂移。

### feat(aiapp): 增加会话记忆管理（用户开关 + 清空当前/全部）

- 新增用户侧记忆配置接口：
  - `GET /api/v1/chat/memory/settings`
  - `POST /api/v1/chat/memory/settings`
  - `POST /api/v1/chat/memory/clear`
- 记忆配置与后台 `memoryPolicy` 打通：
  - `allowUserDisable=false` 时，用户端不允许切换记忆开关；
  - `allowUserClear=false` 时，用户端不允许清空记忆。
- `executor` 链路新增 `memoryEnabled` 透传与策略收敛：
  - 支持前端显式传入 `memoryEnabled`；
  - 未显式传入时读取用户偏好，并回退到后台默认策略。
- runtime 记忆加载改造：`memoryEnabled=false` 时，本轮不加载历史消息上下文（仅当前输入参与推理），但仍保留会话日志落库能力。
- 前端聊天页（`/`）新增记忆管理入口：
  - 记忆开关（持久化到服务端偏好）；
  - “清空当前”“清空全部”动作（带二次确认与执行态保护）。

### feat(aiapp-admin): Channels 支持模型同步与按模型配置格式

- `Channels` 管理页新增“同步渠道模型”按钮，复用 `POST /api/admin/channel-models/sync`，同步后自动刷新渠道配置。
- 渠道模型配置新增 `format` 字段（每个模型独立），支持在管理页直接配置并持久化到数据库设置。
- 路由解析新增“模型级格式覆盖”能力：当模型 `format` 为 `responses/chat.completions` 时，优先覆盖渠道级 `transport`。
- 模型同步时为新发现模型回填默认 `format`（继承渠道当前 `transport`），避免新增模型缺省格式为空。
- `Channels` 新增按渠道拉取模型接口：`POST /api/admin/channel-models/discover`（支持编辑态复用已保存 API Key，新增态可用表单 API Key 直接拉取）。
- 渠道编辑 UI 从弹窗改为右侧 Drawer，模型列表支持更长内容；“拉取渠道模型”入口迁移到编辑面板内。
- 渠道列表中的模型展示改为“共计 x 个模型 + 编辑按钮”，避免首页表格被超长模型字符串撑开。
- 渠道列表模型区按钮文案调整为“总览”，并恢复操作区独立“编辑”入口，降低误解成本。
- 管理端移除“管理总览”入口：`AdminSideNav` 不再展示该菜单；`/admin/system/aiapp-settings` 改为自动跳转到 `Channels`；AI 侧边栏管理入口同步指向 `Channels`。
- 管理页顶部右侧移除 `Legacy CMS 已进入退场阶段` 提示标签，替换为用户头像组件 `AccountAvatar`。
- `Channels` 列表支持直接操作：状态可在列表一键开关、新增删除渠道操作、新增优先级字段（列表与编辑态均可配置）。
- 渠道“设为默认”入口移除，后台改为按渠道优先级参与自动调度（同分时按渠道 ID 稳定排序）。

### feat(aiapp-runtime): Runtime 模型改为仅返回 ModelGroup，并补齐 image/file 能力开关

- `GET /api/runtime/models` 不再直接透出渠道发现的全量 provider models，改为仅返回 `routing.modelCatalog` 中启用且可见的模型组（ModelGroup）。
- Runtime 模型响应新增能力字段：
  - `allowImageAnalysis`
  - `allowFileAnalysis`
- 管理端 `Model Groups` 编辑页新增上述两项能力开关，并在列表新增能力摘要列，便于核对组能力配置。
- 输入区能力与模型组配置对齐：
  - `ThInputPlus` 新增独立“分析文件”入口，并支持按模型组能力禁用 `thinking/websearch/image/file`；
  - `ThInput` 在上传、粘贴、发送前增加能力约束：不支持图片/文件时阻止附件进入，不支持 `thinking/websearch` 时发送前强制关闭对应开关。

### refactor(aiapp-admin): 管理首页移除“我的应用/工作日历”并下线运势功能

- 管理首页（`/admin`）移除以下模块：
  - “我的应用”卡片（`lazy-cms-application`）
  - “工作日历”卡片（`el-calendar`）
  - 运势卡片（`ChorePersonalFortuneCard`）
- 个人中心账号页移除运势入口与弹窗打开逻辑：
  - 删除 `fortuneList` 拉取与展示标签
  - 删除 `AccountModuleFortune` 调起链路
- 前后端运势接口统一下线：
  - 前端移除 `$endApi.v1.account.dailyFortune()`
  - 后端 `GET /api/dummy/fortune` 返回 `410 fortune feature removed`
- 聊天附件渲染移除星座运势映射：
  - `QuotaVeTool` 删除 `xingzuoyunshi-star` 组件映射，避免继续渲染运势卡片。

### refactor(aiapp-admin): 下线部门/指南/监控/聊天应用管理并移除 Legacy CMS 路由

- 管理导航精简，移除以下入口：
  - 部门管理（`/admin/system/dept`）
  - 系统指南（`/admin/system/guide`）
  - 系统监控（`/admin/system/monitor`）
  - LiveChat（`/admin/chatapp/livechat`）
  - 聊天应用公众号菜单（`/admin/chatapp/menu`）
- 管理首页继续裁剪：
  - 删除“系统监控”卡片（不再渲染 `monitor` 模块）。
- 页面路由已物理删除（直接 404）：
  - `retired-ai-app/app/pages/admin/system/dept.vue`
  - `retired-ai-app/app/pages/admin/system/guide.vue`
  - `retired-ai-app/app/pages/admin/system/monitor.vue`
  - `retired-ai-app/app/pages/admin/chatapp/livechat.vue`
  - `retired-ai-app/app/pages/admin/chatapp/menu.vue`
- Legacy CMS 兼容层彻底移除：
  - 删除 `retired-ai-app/app/pages/cms/index.vue`
  - 删除 `retired-ai-app/app/pages/cms/[...path].vue`
- 同步清理配套残留：
  - `weChat.ts` 移除对已删除页面组件的错误导入；
  - `aiapp-compat-seeds` 删除 `menu_system_dept` 种子，避免新环境继续回填该入口。

## 2026-03-17

### Docs：文档盘点与下一步路线执行锚点固化

- 新增统一执行文档：`docs/plan-prd/docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md`。
- 固化盘点统计口径：全仓 Markdown `396`、`docs` `146`、`docs/plan-prd` `110`，并记录子域分布。
- 六主文档补齐锚点同步：`INDEX/README/TODO/Roadmap/Quality Baseline/CHANGES` 全部指向同一执行口径。
- 锁定优先级保持：先 `Nexus 设备授权风控`，再推进文档 strict 化与 Wave A/B/C 并行治理。

### refactor(aiapp): CMS Admin 化 + `/api/aiapp/*` 路径硬切

- 页面路由完成迁移：`/admin/**` 成为管理主入口，`/cms/**` 降级为 Legacy 跳转层。
- 管理导航切换为静态分组导航（系统管理/内容运营/AIGC/App 管理），不再依赖 CMS 动态菜单作为主链路导航来源。
- `channels/storage` 统一为列表页 + 添加/编辑弹框，主入口：
  - `/admin/system/channels`
  - `/admin/system/storage`
- API 路径完成硬切（不保留 `/api/aiapp/*` 兼容别名）：
  - `/api/aiapp/admin/*` -> `/api/admin/*`
  - `/api/aiapp/chat/*` -> `/api/chat/*`
  - `/api/aiapp/runtime/*` -> `/api/runtime/*`
- AI 附件预览路径改为 `/api/chat/sessions/:sessionId/attachments/:attachmentId/content`，并同步更新对应测试断言。
- Nexus OAuth 统一路径：
  - `/api/aiapp/oauth/authorize` -> `/api/oauth/authorize`
  - `/api/aiapp/oauth/token` -> `/api/oauth/token`
  - AI 登录回调链路已同步切换到新 OAuth 路径。

### refactor(aiapp-admin): App 管理按功能独立拆页

- 修复 Admin 左侧导航不可滚动问题：侧栏容器改为 `flex + overflow hidden`，菜单区单独 `el-scrollbar` 承担滚动。
- App 管理入口进一步拆分为独立页面：
  - `/admin/system/channels`
  - `/admin/system/storage`
  - `/admin/system/model-groups`
  - `/admin/system/route-combos`
  - `/admin/system/routing-policy`
  - `/admin/system/routing-metrics`
- `/admin/system/aiapp-settings` 调整为“管理总览页”，仅保留分功能入口跳转，不再承载聚合编辑表单。
- `Channels` 管理增强为“每渠道多模型”：
  - 每渠道可配置模型列表、默认模型、模型启用状态（不再是单一模型字符串）；
  - 列表页展示“模型列表 + 启用模型列表”。
- `Model Groups` 独立页新增 icon 配置与分组维度字段（icon type/value、质量/速度/成本评分、渠道模型映射）。
- 系统管理导航精简：默认隐藏 `角色管理 / 菜单管理 / 字典项` 入口（页面文件保留，后续按退场窗口统一下线）。

### feat(aiapp): AI 合并升级 V2（渠道负载均衡 + 模型目录 + 路由组合）

- 执行链路统一接入 `resolveAIRoutingSelection`：
  - `POST /api/aigc/executor`
  - `POST /api/v1/chat/sessions/:sessionId/stream`
  - `POST /api/aiapp/chat/sessions/:sessionId/stream`
- 请求参数扩展并兼容旧字段：
  - `modelId`（兼容旧 `model`）
  - `internet`
  - `thinking`
  - `routeComboId`
  - `queueWaitMs`
- 路由评比与负载均衡落地：
  - 新增 `aiapp_routing_metrics` 指标落库；
  - 新增 `ChannelModelScorer`（成功率 + TTFT + 总耗时综合评分）；
  - `Quota Auto` 速度优先选路 + 小流量探索；
  - 新增熔断/恢复（失败阈值、冷却窗口、半开探测）。
- 模型与渠道能力：
  - 每渠道支持多模型列表与默认模型；
  - 新增渠道模型发现与同步（OpenAI-compatible `/v1/models`）；
  - 新增全局模型目录（名称/描述/icon/thinking/websearch/成本速度质量标记）；
  - 新增路由组合管理（候选渠道模型、优先级、权重、降级链）。
- 运行时与前端：
  - 新增 `GET /api/aiapp/runtime/models`；
  - gptview（`/`）模型选择改为后端动态目录驱动；
  - 输入区新增 `thinking` 开关并与 `internet` 一起透传后端；
  - `/aiapp` 改为兼容跳转到 `/`。
- LangGraph 编排联动第一阶段：
  - 新增 `aiapp-langgraph-orchestrator` 可用性探测；
  - 路由组合绑定 `langgraphAssistantId/graphProfile` 时优先探测本地服务，不可用自动回退 deepagent。
- LangGraph 编排联动第二阶段：
  - 新增 `aiapp-langgraph-engine`，`createAIRuntime` 支持 `langgraph-local` 主引擎直连 `/runs/stream`；
  - 执行链路改为“LangGraph 主执行 + deepagent 自动回退（启动错误/空流）”，`executor` 与 `aiapp chat stream` 双入口复用；
  - `aiapp-settings` 后台升级为统一控制台：渠道多模型、模型目录（icon/thinking/websearch）、路由组合（含 LangGraph 绑定）、LB/Memory 策略、渠道模型同步与评比看板。
- 测试：
  - 新增 `aiapp-route-health.test.ts`；
  - 新增 `aiapp-channel-scorer.test.ts`；
  - `pnpm -C retired-ai-app run test -- server/utils/__tests__/aiapp-route-health.test.ts server/utils/__tests__/aiapp-channel-scorer.test.ts` 通过。

### fix(aiapp): 移除 CMS 第三方内容源板块，避免外部接口导致前台崩溃

- 移除 `retired-ai-app/app/pages/cms/index.vue` 中对 `https://api.vvhan.com` 的 3 处请求：
  - `dailyEnglish`
  - `hotlist/woShiPm`
  - `visitor.info`
- 同步删除对应展示区块：
  - 访客信息提示
  - 推荐阅读（产品经理）
  - 今日精彩
- 目的：消除第三方接口抖动/断连触发的页面运行时异常（`Cannot read properties of undefined (reading 'location')`），确保 CMS 基础功能稳定可用。

### fix(aiapp): 恢复 App 管理下 Channels/Storage 菜单入口（含存量数据补齐）

- 菜单种子新增 `App 管理` 目录与子项：
  - `Channels` -> `/cms/system/channels`
  - `Storage` -> `/cms/system/storage`
- 新增存量菜单补齐逻辑：`ensureSystemMenuSeed` 在已有数据库场景下会自动补缺失菜单 ID，不再依赖“空库一次性初始化”。
- `Channels` / `Storage` 页面改为“列表 + 添加/编辑弹框”交互：
  - `Channels` 支持列表浏览、添加渠道、编辑渠道、切换默认渠道
  - `Storage` 支持配置列表浏览、新增配置、编辑配置
- 新增页面文件：
  - `retired-ai-app/app/pages/cms/system/channels.vue`
  - `retired-ai-app/app/pages/cms/system/storage.vue`
- 两个页面统一复用 `/api/aiapp/admin/settings` 读写设置，保持后端配置权威源一致。

### Docs：新增治理看板（Legacy / Compat / Size）

- 新增单页治理看板：`docs/plan-prd/docs/DEBT-GOVERNANCE-BOARD-2026-03-17.md`。
- 新增执行清单：`docs/plan-prd/docs/DEBT-GOVERNANCE-EXECUTION-CHECKLIST-2026-03-17.md`（owner/ticket/验收命令对齐）。
- 看板固定按 `domain / owner / ticket / expiresVersion` 汇总当前债务与增长豁免：
  - registry 总量 `120`（`legacy-keyword 79` / `compat-file 26` / `raw-channel-send 13` / `size-growth-exception 2`）；
  - 超长文件基线 `46`，增长豁免 `2`。
- 明确“只减不增”执行口径：新增债务必须先入清册，`growthExceptions` 变更必须同步 `CHANGES + registry`，默认清退门槛维持 `v2.5.0`。

### refactor(aiapp): 首批 growth-exception 清退动作（1+2）

- `retired-ai-app/app/composables/useAIChatPage.ts` 抽离工具函数到 `app/composables/aiapp-chat.utils.ts`，行数 `1366 -> 1175`（退出超长文件集合）。
- `retired-ai-app/server/api/aigc/executor.post.ts` 抽离执行器工具到 `server/utils/aiapp-executor-utils.ts`，行数 `1666 -> 1370`（仍在治理窗口，继续压降）。
- 清退 `SIZE-GROWTH-2026-03-16-AIAPP-CHAT-PAGE`：
  - 从 `scripts/large-file-boundary-allowlist.json` 移除该文件 baseline + growth exception；
  - 从 `docs/plan-prd/docs/compatibility-debt-registry.csv` 移除对应 `size-growth-exception` 条目。

## 2026-03-16

### Docs：第三轮治理压缩收口（已完成）

- 主文档口径继续维持 `2026-03-16`；下一动作统一指向 `Nexus 设备授权风控`。
- 完成主入口压缩：`CHANGES/TODO/README/INDEX` 均压缩到目标行数。
- 完成长文档分层：Telemetry/Search/Transport/DivisionBox 原文下沉到 `*.deep-dive-2026-03.md`。
- 完成历史文档降权：Draft/实验文档补齐“状态/更新时间/适用范围/替代入口”头标。

### feat(aiapp): 附件慢链路治理 + CMS 设置合并（稳定优先）

- 新旧链路统一附件投递：`provider file id > public https url > base64`（仅兜底时读取对象，不再无条件内联）。
- `retired-ai-app/server/utils/aiapp-attachment-delivery.ts` 接入 `aiapp stream` 与 `aigc executor`，并发固定 `3`，失败错误码统一：
  - `ATTACHMENT_UNREACHABLE`
  - `ATTACHMENT_TOO_LARGE_FOR_INLINE`
  - `ATTACHMENT_LOAD_FAILED`
- `POST /api/aiapp/chat/sessions/:sessionId/uploads` 新增 `multipart/form-data`（兼容保留 `contentBase64`）。
- 新增附件能力探测：`GET /api/aiapp/chat/attachments/capability`，AI 与 legacy 输入框统一使用。
- 新增聚合后台设置 API：`GET/POST /api/aiapp/admin/settings`；旧 `channels/storage-config` 接口保留兼容并转调。
- 新增 CMS 系统页：`/cms/system/aiapp-settings`（Channels + Storage 同页编辑）；旧 `/aiapp/admin/*` 页面增加迁移提示。
- 配置权威源保持 `aiapp_admin_settings`，密钥字段脱敏返回；空值不覆写，需显式 clear 才会删除。

### fix(plugin-dev): watcher 止血 + CLI 依赖环切断

- `DevPluginWatcher` 改为“受控监听目标”：仅监听插件顶层关键文件（`manifest.json/index.js/preload.js/index.html/README.md`），不再递归监听整目录。
- chokidar 选项增强：`followSymlinks: false`、`depth: 1`、`ignorePermissionErrors: true`，并显式忽略 `node_modules/.git/.vite/dist/logs`，降低符号链接与深层目录导致的句柄风暴风险。
- watcher 增加 fatal 降级：命中 `EMFILE/ENOSPC/ENAMETOOLONG` 后记录高优先级日志并自动停用 dev watcher，避免日志雪崩与开发进程异常退出。
- `change` 回调增加全链路 `try/catch`，reload 失败只记录日志，不再向上冒泡成未处理异常。
- 切断 `@talex-touch/unplugin-export-plugin` 与 `@talex-touch/tuff-cli` 的双向 workspace 依赖：移除前者对后者的直接依赖，打断 `node_modules` 递归链。
- 旧 CLI 入口兼容策略更新：从 `@talex-touch/unplugin-export-plugin` 调用 `tuff` 时，若未安装 `@talex-touch/tuff-cli`，改为“显式报错 + 安装指引 + 非 0 退出”。
- 插件安装复制链路新增 `node_modules` 自动剔除：`PluginResolver` 与 `DevPluginInstaller` 在目录复制时过滤 `node_modules`，并在解包后做一次递归清理，防止历史残留再次落盘到运行态插件目录。

### feat(aiapp): Chat/Turn 新协议与单 SSE 尾段 Title

- 新增 `POST /api/v1/chat/sessions/:sessionId/turns`（会话入队，返回 `request_id/turn_id/queue_pos`）。
- 新增 `POST /api/v1/chat/sessions/:sessionId/stream`（`turn.*` 事件流 + 尾段 `title.generated/title.failed` + `[DONE]`）。
- 新增 `GET /api/v1/chat/sessions/:sessionId/messages`（返回 `messages + run_state + active_turn_id + pending_count`）。
- 服务端补齐 `chat-turn-queue`（会话级串行执行与状态持久化）。
- 历史会话链路改为 JSON：`aiapp_quota_history.value` 完成一次性 base64 -> JSON 迁移，后续读写统一 JSON 字符串并回包结构化 `value/messages`。

### fix(aiapp): run_state 查询故障降级，避免会话读取 500

- `aigc/conversation`、`aigc/conversations`、`aigc/history` 与 `v1/chat/sessions/:id/messages` 在运行态查询失败时统一降级为 `run_state=idle`，确保历史消息可读。
- 新增 `getSessionRunStateSafe` 兜底方法，避免队列表异常导致前端刷新误判“分析失败”。

### fix(chat-ui): 输入区 loading 与发送解耦

- 输入区状态拆分为 `send_state=idle|sending_until_accepted`，仅“等待受理”阶段显示 loading。
- 发送链路支持连续发送，不再每次发送前强制 abort 上一个请求。
- 修复 `verbose` 状态映射与 `ChatItem` 结束态误判。

### refactor(prompt): 标题生成 prompt 收敛

- 抽取 `retired-ai-app/server/utils/aiapp-title.ts`，统一标题生成逻辑。
- `aiapp-runtime` 默认系统提示压缩为更短、更稳的执行导向文案。

### CI/CD：AI webhook 自动部署恢复

- `aiapp-image.yml` 在 GHCR 推送成功后自动触发 `POST /deploy`。
- 安全约束：`X-AI-Token` / `Authorization: Bearer` 校验、仓库/分支白名单。
- 文档与运维说明同步至：`.github/workflows/README.md`、`retired-ai-app/deploy/README*.md`。
- 自动触发口径澄清：仅远端 `master` push（命中 workflow path）会触发，**本地 commit 不会触发 1Panel 自动更新**。
- 排障与兜底路径固化：当 webhook secrets 缺失或 1Panel webhook 不可达时，统一走 `ssh home` 手动执行部署脚本。

### fix(aiapp): 流式失败可见性 + CMS 设置收口修复

- 前端 SSE 解析新增兼容层：支持 `event/session_id/[DONE]` 到 `type/sessionId/done` 统一映射，并补齐 `turn.accepted/queued/started/delta/completed/failed` 处理。
- `turn.failed` 改为“双通道可见”：消息区强制追加 assistant 失败消息，底部保留带 `code/status_code/request_id` 的诊断信息。
- `v1/chat/sessions/:sessionId/stream` 的失败语义增强：`turn.failed` 增加可选 `code/status_code/detail`，并对 502/503/504 返回可操作文案（兼容保留 `message`）。
- CMS 收口补丁：`/cms/system/aiapp-settings` 页面独立滚动；AI 侧设置入口统一到该页；旧 `/aiapp/admin/channels|storage` 改为直接跳转。
- `/cms` 防御性修复：CMS 路径 browser-only API 增加客户端守卫，`router.back()` 增加无历史记录 fallback，降低 500 风险。

### Docs：文档治理门禁脚本落地

- 新增 `scripts/check-doc-governance.mjs`。
- 新增命令：`pnpm docs:guard`（report-only）与 `pnpm docs:guard:strict`（严格模式）。
- CI 已接入 `docs:guard` 报告步骤（本轮仍不阻塞发布流水线）。

### feat(quality): legacy debt 冻结门禁（Phase 0）

- 新增 `scripts/check-legacy-boundaries.mjs`，冻结两类新增债务：
  - 新增 `legacy` 关键词命中（视为新增兼容分支）；
  - 新增 `channel.send('x:y')` raw event 字符串调用。
- 新增基线白名单 `scripts/legacy-boundary-allowlist.json`：
  - 存量债务按文件 + 命中次数备案；
  - 每条债务强制要求 `expiresVersion`（当前统一 `2.5.0`）。
- root scripts 新增 `pnpm legacy:guard`，并接入 `lint/lint:fix` 作为默认门禁。
- Phase 1 最小收口落地（兼容不改行为）：
  - `packages/utils/plugin/sdk/channel.ts`：`sendSync` fallback 一次性退场告警；
  - `packages/utils/renderer/storage/base-storage.ts` 与 `storage-subscription.ts`：legacy storage channel 通路一次性退场告警。

### feat(governance): 统一实施 PRD 与五工作包并行口径

- 新增统一蓝图文档：`02-architecture/UNIFIED-LEGACY-COMPAT-STRUCTURE-REMEDIATION-PRD-2026-03-16.md`，明确“单一蓝图 + 五工作包并行 + 统一里程碑验收”。
- 新增兼容债务清册 SoT：`docs/plan-prd/docs/compatibility-debt-registry.csv`，固定字段：
  - `domain / symbol_or_path / reason / compatibility_contract / expires_version / removal_condition / test_case_id / owner`
- 新增清册门禁：`scripts/check-compatibility-debt-registry.mjs`（覆盖校验 + 过期校验）。
- 新增超长文件门禁：`scripts/check-large-file-boundaries.mjs` + `scripts/large-file-boundary-allowlist.json`（阈值 `>=1200` 冻结增长）。
- `legacy:guard` 升级为统一门禁入口：
  - `check-legacy-boundaries` + `compat:registry:guard` + `size:guard`。
- `check-legacy-boundaries` 新增规则：
  - 冻结新增 `transport/legacy` 与 `permission/legacy` 导入扩散。
- `pnpm-workspace.yaml` 与 root `lint/lint:fix` 默认范围改为主线：
  - `apps/core-app`、`apps/nexus`、`retired-ai-app`、`packages/*`、`plugins/*`；
  - 影子应用 `apps/g-*`、`apps/quota-*` 从默认 workspace 扫描隔离。
- 退场窗口标注补齐：
  - `packages/utils/transport/legacy.ts`
  - `packages/utils/permission/legacy.ts`
  - 明确 `v2.5.0` 前清退，不允许新增引用。
- 新增定向回归命令：`pnpm test:targeted`（utils/core-app/nexus 三段稳定用例）。
- 新增聚合门禁命令：`pnpm quality:gate`（`legacy:guard + network:guard + test:targeted + typecheck(node/web) + docs:guard`）。
- 新增 Sync 兼容壳自动化断言：
  - `apps/nexus/server/api/sync/__tests__/sync-routes-410.test.ts`
  - 固化 `/api/sync/pull|push` 必须返回 `410`，并断言 `statusMessage/data.message` 含 v1 迁移目标路径。
- 债务扫描口径升级为“显式白名单 + 漏扫报错 + scanScope 输出”：
  - `check-legacy-boundaries.mjs`
  - `check-compatibility-debt-registry.mjs`
- 超长文件门禁升级：
  - `--write-baseline` 不再允许自动上调 `maxLines`；
  - 引入 `growthExceptions` 显式增长豁免并校验 `CHANGES + compatibility registry` 同步。
- 本次临时增长豁免登记：
  - `SIZE-GROWTH-2026-03-16-AIGC-EXECUTOR` -> `retired-ai-app/server/api/aigc/executor.post.ts`
  - `SIZE-GROWTH-2026-03-16-DEEPAGENT` -> `packages/tuff-intelligence/src/adapters/deepagent-engine.ts`
  - `SIZE-GROWTH-2026-03-16-AIAPP-CHAT-PAGE` -> `retired-ai-app/app/composables/useAIChatPage.ts`
- 兼容债务清册清理：
  - 移除 2 条主线扫描口径外的陈旧条目（`retired-ai-app/shims-compat.d.ts`、`apps/nexus/i18n.config.ts`）。
  - `size-growth-exception` 调整为 registry-only domain，不再触发误判式 cleanup warning。
- 结构治理补丁：
  - 修复 Nexus 异常文件名：`apps/nexus/ sentry.server.config.ts` → `apps/nexus/sentry.server.config.ts`。
  - 同步扫描脚本豁免路径，移除异常路径分支。
- Transport legacy 第一轮收口（非破坏式）：
  - `packages/utils/plugin/preload.ts`、`packages/utils/renderer/storage/base-storage.ts` 改为从 `@talex-touch/utils/transport` 统一入口取类型，不再直连 `transport/legacy`。
  - `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts` 改为注入 `@talex-touch/utils/transport` 命名空间，同时保持 `@talex-touch/utils/transport/legacy` 兼容映射键。
  - `packages/utils/index.ts` 由 `export * from './transport/legacy'` 改为从 `./transport` 重导出兼容符号。
  - 结果：`legacy-transport-import` 从 `4 files / 4 hits` 降至 `0 files / 0 hits`（主线扫描口径）。
  - 同步清理 `compatibility-debt-registry.csv` 中 4 条 `legacy-transport-import` 条目与 2 条陈旧 `legacy-keyword` 条目。
- 大文件增长豁免上限更新（同 ticket 续期内）：
  - `SIZE-GROWTH-2026-03-16-AIGC-EXECUTOR`：`retired-ai-app/server/api/aigc/executor.post.ts` 上限 `1642 -> 1666`。
  - `SIZE-GROWTH-2026-03-16-DEEPAGENT`：`packages/tuff-intelligence/src/adapters/deepagent-engine.ts` 上限 `1919 -> 1924`。
  - `SIZE-GROWTH-2026-03-16-AIAPP-CHAT-PAGE`：`retired-ai-app/app/composables/useAIChatPage.ts` 新增上限 `1366`（baseline 仍为 `1362`）。
  - 目的：恢复 `size:guard` 基线一致性，后续仍按 `v2.5.0` 前拆分退场执行。

---

## 2026-03-15

### Release：`v2.4.9-beta.4` 基线快照固化

- 基线事实：
  - commit: `d93e4bec599bed2c0793aa8602ba6462a39bfbbe`
  - tag: `v2.4.9-beta.4`
- 关键 CI：
  - Build and Release: [23106614270](https://github.com/talex-touch/tuff/actions/runs/23106614270)
  - Contributes: [23106610206](https://github.com/talex-touch/tuff/actions/runs/23106610206)
  - AI Image Publish: [23106610203](https://github.com/talex-touch/tuff/actions/runs/23106610203)
  - CodeQL: [23106609938](https://github.com/talex-touch/tuff/actions/runs/23106609938)

### CLI：Phase1+2 完整迁移收口

- `@talex-touch/tuff-cli` 成为唯一推荐 CLI 主入口。
- `@talex-touch/tuff-cli-core` 承接 `args/config/auth/publish/validate/runtime-config/device/repositories` 等核心能力。
- `@talex-touch/unplugin-export-plugin` CLI 降级为兼容 shim（保留转发 + 弃用提示）。
- 三包构建入口补齐，修复 `No input files` 构建失败。

### Plugin Gate：`2.4.9` 插件完善主线收口

- 权限中心 Phase5 完成：`PermissionStore` 切换 SQLite 主存储，JSON 仅保留迁移备份。
- 安装权限确认闭环：`always/session/deny` 三分支明确反馈，无 silent failure。
- View Mode 安全闭环 + Phase4 落地：协议/path/hash/dev-prod 一致性回归完成。
- CLI 兼容策略固化：`2.4.x` 保留 shim，`2.5.0` 退场。

### Docs：第二轮遗留清债收口

- `OMNIPANEL-FEATURE-HUB-PRD` 改为 historical done（2.4.8 Gate）。
- `AIAPP-NEXUS-OAUTH-CLI-TEST-PLAN` 重写为“已落地 vs 未启动”。
- `TUFFCLI-INVENTORY` 改为 `tuff-cli` 主入口口径。
- `NEXUS-SUBSCRIPTION-PRD`、`NEXUS-PLUGIN-COMMUNITY-PRD` 增加历史/待重写标识。

---

## 2026-03-14

### v2.4.7 Gate D/E 历史闭环（不重发版）

- Gate D：通过 `workflow_dispatch(sync_tag=v2.4.7)` 执行历史资产回填。
- 关键 run：Build and Release [23091014958](https://github.com/talex-touch/tuff/actions/runs/23091014958)。
- 回填结果：`manifest + sha256` 补齐，签名缺口按历史豁免（仅 `v2.4.7`）。
- Gate E：按 historical done 关闭，不重发 `v2.4.7`。

### SDK Hard-Cut E~F 收口

- renderer 侧 `tryUseChannel/window.$channel/window.electron.ipcRenderer` 直连点完成收口。
- typed transport 事件与兼容层边界进一步清晰。

---

## 2026-03-12 ~ 2026-03-13

### AI Runtime 主路径收敛

- 主路径统一为 `Node Server + Postgres/Redis + JWT Cookie (+ MinIO)`。
- Cloudflare runtime / wrangler / D1/R2 降为历史归档语境。
- 会话与流式能力继续补齐（`fromSeq` 补播、pause/trace、运行态回传）。

### Core App 稳定性治理

- 生命周期与退出链路收敛、模块卸载幂等增强。
- Tray 实验特性开关化，默认入口回归更稳路径。

---

## 2026-03-09 ~ 2026-03-11

### AI M0/M1 高优先级收口

- Chat-first 页面与 SSE 协议稳定运行。
- 多模态输入链路与附件策略补齐（`dataUrl > previewUrl > ref` 优先级统一）。
- 兼容 API 迁移推进：`/api/aigc/*`、`/api/auth/status`、`/api/account/*` 等关键链路可用。

### 兼容阻塞修复

- `@element-plus/nuxt` 依赖归位到生产依赖，避免生产启动失败。
- 注入 `__BuildTime__` 与 `__THISAI_VERSION__`，修复 SSR 常量缺失。
- 修复 Milkdown 渲染阻塞路径，减少 Chat 页面 500/渲染异常。

---

## 2026-03-01 ~ 2026-03-08

### 文档主线收口（第一轮）

- 六主文档完成统一口径：状态、日期、下一动作对齐。
- 统一事实：`2.4.9-beta.4` 当前工作区、`2.4.8 OmniPanel historical`、`v2.4.7 Gate historical`。
- `next-edit` 与过期规划文档降权，减少“进行中/已完成”冲突叙述。

### AI API 批次迁移与运维能力补齐

- M2/M3 接口迁移覆盖运营常用域。
- 渠道合并能力落地：`POST /api/aiapp/admin/channels/merge-ends` + 一次性脚本。
- 支付/聊天应用相关路径按“协议兼容 + 本地 mock/豁免”策略收口。

---

## 2026-02-23 ~ 2026-02-28

### 发布链路与质量治理

- `build-and-release` 继续作为桌面发版主线；Nexus release 同步链路稳定。
- 质量门禁持续推进（typecheck/lint/test/build）并补齐文档证据。
- 插件市场多源、SDK 收口与历史 Gate 文档持续对齐。

---

## 历史索引导航（按月归档）

- [2026-03 月度归档](./archive/changes/CHANGES-2026-03.md)
- [2026-02 月度归档](./archive/changes/CHANGES-2026-02.md)
- [2025-11 月度归档](./archive/changes/CHANGES-2025-11.md)
- [归档索引 README](./archive/changes/README.md)
- [压缩前全量快照（legacy）](./archive/changes/CHANGES-legacy-full-2026-03-16.md)

---

## 说明

- 主文件只承担“当前可执行事实 + 近 30 天详细记录 + 历史索引入口”。
- 历史细节未删除，统一通过月度归档追溯。
- 后续新增记录遵循“同日同主题合并表达”规则，避免重复堆叠。
