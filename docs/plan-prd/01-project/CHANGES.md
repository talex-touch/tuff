# 变更日志

> 更新时间: 2026-04-21
> 说明: 主文件仅保留近 30 天（2026-03-22 ~ 2026-04-21）详细记录；更早历史已按月归档。

## 2026-04-21

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
  - 修复 `touch-translate` widget 在沙箱中报 `Module "../shared/translation-shared.cjs" is not available` 的初始化失败问题，并重新生成 `1.0.4` 发布包。

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
  - `apps/core-app/scripts` 与 `apps/pilot/scripts` 已纳入 legacy/compat 显式扫描范围，移除脚本级 scope leak；新增命中手工补入 allowlist 与 compatibility registry，未使用 `--write-baseline` 覆盖基线。
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

- `.github/workflows/pilot-image.yml`
  - Pilot 镜像 push 成功后触发 1Panel webhook 现在改为有限重试 + warning 降级；当 `ONEPANEL_WEBHOOK_URL` 指向的 1Panel 暂时不可达时，不再把整个 `Pilot Image Publish` workflow 误判为失败。
- `.github/workflows/build-and-release.yml`
  - `sync-nexus-release` 保留 Cloudflare access token 透传能力，默认不做 challenge 降级跳过；challenge 产生时会保留失败行为，便于在 CI 里暴露真实问题。
- `.github/workflows/README.md`
  - 同步补充 Pilot webhook 与 Nexus sync 的降级口径，明确“镜像已发布 / GitHub Release 已创建”与“外部部署触发 / 外站元数据同步”在 CI 中的阻塞边界。

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

### fix(pilot-build): 收口 tuff-intelligence pilot 导出边界并恢复前端构建

- `packages/tuff-intelligence/src/pilot.ts`
- `packages/tuff-intelligence/src/pilot-server.ts`
- `packages/tuff-intelligence/package.json`
- `apps/pilot/server/**/*`
  - `@talex-touch/tuff-intelligence/pilot` 收口为 browser-safe 入口，仅保留 `business/pilot` projection / trace / legacy card / stream helper 与前端共享类型。
  - 新增 `@talex-touch/tuff-intelligence/pilot-server` 子路径，承载 runtime / store / deepagent engine / protocol 类型，`apps/pilot/server` 原子迁移到新入口，避免前端 import `/pilot` 时再把 `deepagents / @langchain/langgraph / node:async_hooks` 卷入浏览器 bundle。
  - 不引入前端 alias、shim 或构建绕过；本次只修共享包导出边界与消费者引用。
- `apps/pilot/server/utils/__tests__/pilot-entry-contract.test.ts`
  - 新增导出契约回归，验证 `/pilot` 不再暴露 `AbstractAgentRuntime / DecisionDispatcher / DeepAgentLangChainEngineAdapter / D1RuntimeStoreAdapter`，同时确认 `/pilot-server` 仍承载服务端 runtime/store/engine 导出。

### fix(pilot-history): 标题生成后同步回写 quota 历史与会话映射

- `apps/pilot/server/utils/pilot-quota-history-sync.ts`
- `apps/pilot/server/utils/pilot-trace-window.ts`
- `apps/pilot/server/api/chat/sessions/[sessionId]/title.post.ts`
- `apps/pilot/server/api/chat/sessions/[sessionId]/stream.post.ts`
- `apps/pilot/server/api/aigc/conversation/[id].get.ts`
- `apps/pilot/server/utils/pilot-system-message-response.ts`
- 新增统一的 runtime -> quota 历史回写 helper，按 runtime `title + messages + trace tail` 生成快照并同步维护 `pilot_quota_history` / `pilot_quota_sessions`。
- `POST /api/chat/sessions/:sessionId/title` 不再只更新 runtime 标题；现在会 best-effort 回写兼容历史，修复前端标题已生成但历史列表仍停留旧标题/旧汇聚快照的问题。
- `GET /api/aigc/conversation/:id` 与流式收尾同步复用同一条回写链路，避免不同入口再次出现快照格式或映射字段漂移。
- trace 尾窗口读取改为按批次向前补到最近的 `turn.started`，修复长 turn 中 `intent.*` 已落库但在恢复/快照阶段被 2000 条尾窗口裁掉、最终只剩 tool card 的问题。
- `apps/pilot/server/utils/__tests__/pilot-quota-history-sync.test.ts`
- `apps/pilot/server/utils/__tests__/pilot-trace-window.test.ts`
- `apps/pilot/server/utils/__tests__/pilot-system-message-response.test.ts`
  - 新增回归，覆盖“标题/trace 回写成功时同步更新历史与映射”“runtime 会话缺失时不重复写入”“长 turn 回溯最近 `turn.started` 后 intent 不再被 tool card 挤掉”。

## 2026-04-07

### fix(pilot-stream): trace-first 恢复链清理旧 runtime 审计脏卡

- `packages/tuff-intelligence/src/business/pilot/projection.ts`
- `apps/pilot/shared/pilot-system-card-blocks.ts`
- `apps/pilot/server/utils/quota-conversation-snapshot.ts`
- `apps/pilot/server/api/aigc/conversation/[id].get.ts`
- `apps/pilot/server/api/chat/sessions/[sessionId]/stream.post.ts`
- `apps/pilot/server/utils/pilot-system-message-response.ts`
- `apps/pilot/server/utils/pilot-trace-window.ts`
  - 非 `tool.call.*` 的 `run.audit` 不再投影为前端可见 system/runtime 卡，避免 `attachment.resolve.*` 这类内部审计在刷新恢复后误显示成“工具调用 / runtime / 200”。
  - quota snapshot 只要存在 runtime traces，就统一以 trace projection 为准并清理旧 `pilot_run_event_card / pilot_tool_card` 脏块，不再回退信任历史 `messages` 里的遗留卡片。
  - 会话详情读取改为按 runtime `messages + traces` 对齐并回写 quota history，修复已写脏老会话中 `analyse intent` 被旧卡污染的问题，确保前后端恢复语义一致。
  - 新增长会话 trace tail 窗口 helper；会话详情、quota history 回写与 `messages.get` 不再读取“最早 2000 条 trace”，而是按 `session.lastSeq` 读取“最新 2000 条”，修复刷新后最新 turn 的 intent/websearch/planning 卡片偶发消失的问题。
- `apps/pilot/server/utils/__tests__/pilot-system-message.test.ts`
- `apps/pilot/server/utils/__tests__/quota-conversation-snapshot.test.ts`
- `apps/pilot/server/utils/__tests__/pilot-system-message-response.test.ts`
- `apps/pilot/server/utils/__tests__/pilot-trace-window.test.ts`
  - 新增回归，覆盖“非工具审计不可见”“trace-first 清理旧 runtime/tool 脏卡”“trace 存在但无可见卡时不回退旧 message cards”。
  - 追加回归，覆盖“长会话按 `lastSeq` 读取 trace 尾部，最新 intent 不丢失”。

### fix(pilot-stream): 首页默认 DeepAgent 并收口 legacy 单前端消费链

- `apps/pilot/app/composables/api/base/v1/aigc/completion/index.ts`
- `apps/pilot/app/composables/api/base/v1/aigc/completion/legacy-stream-contract.ts`
- `apps/pilot/app/composables/api/base/v1/aigc/completion/legacy-stream-sse.ts`
  - 首页生产入口继续保留旧 UI，但流式消费收口到 legacy `$completion` 单链；SSE frame 解析、请求 payload 组装、executor body 构造全部抽成纯 helper，避免旧首页与新 Pilot Workspace 再并行漂移。
  - 默认 DeepAgent 主链不再从 `conversation.pilotMode` 回填请求参数；仅显式实验态 `meta.pilotMode=true` 时才兼容透传 `pilotMode=true`。
  - `fromSeq + follow` 统一复用共享 seq cursor 解析，首页恢复流固定跟随真实可恢复事件，不再受 Pilot 模式分叉影响。
- `apps/pilot/app/pages/index.vue`
- `apps/pilot/app/components/input/ThInput.vue`
- `apps/pilot/app/components/input/ThInputPlus.vue`
  - 首页移除 `Pilot 模式` 默认标签与输入开关；默认发送、标题展示、恢复逻辑均不再依赖 `pilotMode`。
- `packages/tuff-intelligence/src/business/pilot/types.ts`
- `packages/tuff-intelligence/src/business/pilot/emitter.ts`
- `packages/tuff-intelligence/src/business/pilot/stream.ts`
- `apps/pilot/server/api/chat/sessions/[sessionId]/stream.post.ts`
- `apps/pilot/server/api/chat/sessions/[sessionId]/trace.get.ts`
- `apps/pilot/server/utils/pilot-stream-quota-projector.ts`
- `apps/pilot/server/utils/quota-conversation-snapshot.ts`
  - 收紧 trace contract：`stream.started / stream.heartbeat / replay.* / run.metrics / done / error` 等 seq-optional 生命周期事件不再持久化到 trace，也不再参与 replay/follow/fromSeq 边界推进；历史脏 trace 在 replay、trace.get 与 quota snapshot 中统一过滤。
- `apps/pilot/server/utils/__tests__/legacy-completion-stream-contract.test.ts`
- `apps/pilot/server/utils/__tests__/pilot-stream-emitter-seq.test.ts`
- `apps/pilot/server/utils/__tests__/pilot-stream-replay.test.ts`
  - 补齐 legacy SSE 契约测试，覆盖 `assistant.delta / assistant.final / run.audit / turn.approval_required / replay / done / error` 与分块持续解析；同时验证 seq-optional 生命周期事件不会重新污染 trace。
- 验收：
  - `pnpm -C "apps/pilot" exec vitest run "server/utils/__tests__/pilot-stream-emitter-seq.test.ts" "server/utils/__tests__/pilot-stream-replay.test.ts" "server/utils/__tests__/legacy-completion-stream-contract.test.ts" "server/utils/__tests__/pilot-runtime-seq.test.ts" "server/utils/__tests__/pilot-sse-response.test.ts"` 已通过。
  - `pnpm -C "apps/pilot" exec vitest run "server/utils/__tests__/pilot-runtime.test.ts" "server/utils/__tests__/pilot-completion-flow.test.ts" "server/utils/__tests__/legacy-stream-input.test.ts" "server/utils/__tests__/pilot-chat-utils-parse.test.ts"` 已通过。
  - `pnpm -C "apps/pilot" run typecheck` 已通过。

## 2026-04-06

### docs(pilot): 补充单流完整流程图与运行时审计结论

- `docs/plan-prd/02-architecture/pilot-single-stream-runtime.md`
  - 补充 Pilot / DeepAgent 单流运行时完整 Mermaid 流程图，明确 `intent gate -> strict pre-read memory -> runtime persist-first -> shared projection -> frontend strict seq consume` 的主链顺序。
  - 修正文档中的 seq 合同表述，明确 `stream.started / stream.heartbeat / replay.* / run.metrics / done / error` 为可无 seq 的豁免事件，其余可恢复事件必须带稳定 `seq`。
  - 增加实现审计结论与已知边界，显式标注 `pilot-memory-tool.ts` 不得重新接回标准 Pilot runtime 主路径，并补充前端本地状态不得伪造成 trace event。
- `docs/INDEX.md`
  - 刷新 Pilot 单流运行时文档入口说明，标记该文档已包含“完整流程图 + 审计结论”，作为后续排查的权威入口。

### ref(pilot): 统一 messages.get 的 trace projection 命名

- `apps/pilot/server/utils/pilot-system-message-response.ts`
  - 将 `listMessagesWithLazySystemProjection()` 重命名为 `listMessagesWithTraceProjection()`，使函数名与当前“始终 trace projection + legacy 兼容”的真实行为一致。
- `apps/pilot/server/api/chat/sessions/[sessionId]/messages.get.ts`
- `apps/pilot/server/api/v1/chat/sessions/[sessionId]/messages.get.ts`
- `apps/pilot/server/utils/__tests__/pilot-system-message-response.test.ts`
  - 同步更新调用点与测试命名，避免后续维护时误以为仍存在旧 lazy 补 system 的双轨语义。

## 2026-04-04

### Pilot / DeepAgent 单流包级复用收口

- `@talex-touch/tuff-intelligence/pilot` 新增单流共享能力：trace/seq helper、replay trace mapper、system projection、legacy run-event projection、客户端可见性判定。
- `apps/pilot` 前后端改为直接复用包内 Pilot 合同；删除本地重复实现 `pilot-stream-shared.ts`、`pilot-system-message.ts`、`pilot-legacy-run-event-card.ts`。
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

### refactor(pilot-stream): DeepAgent / Pilot 收敛为 trace-first 单流

- `packages/tuff-intelligence/src/runtime/agent-runtime.ts`
  - runtime 发射路径改为“先持久化 trace，再产出 envelope”，`onMessage()` 向上游 yield 的统一是带 `meta.traceId/meta.seq` 的已持久化事件，不再直接透传原始 envelope。
  - `assistant.delta` 改为按批次缓冲后持久化，flush 边界与 live SSE 对齐，保证前端看到的 delta 与 trace 中的 seq 一一对应，不再出现“已渲染 token 但 trace 无对应事件”的双轨漂移。
- `packages/tuff-intelligence/src/business/pilot/types.ts`
  - 新增 persisted envelope 校验，Pilot stream 在把 runtime envelope 映射成 SSE event 前会显式要求 `meta.seq/meta.traceId`，防止未持久化事件误入主流。
- `packages/tuff-intelligence/src/business/pilot/stream.ts`
  - 移除 DeepAgent 路径的 synthetic `planning.started / planning.updated / planning.finished` 注入；当前仅透传 runtime 真实提供的 planning 事件。
  - replay 路径的 `assistant.delta / thinking.* / assistant.final` shape 改为与 live SSE 保持一致，补播时不再退化成仅有 `payload.text` 的旧形态。
- `packages/tuff-intelligence/src/business/pilot/emitter.ts`
  - emitter 新增 seq 合同保护：除 `stream.heartbeat` 等纯传输事件外，缺少 `seq` 的 stream event 会直接失败，避免再次回到双轨状态。
- `apps/pilot/server/utils/pilot-intent-resolver.ts`
  - classifier 失败路径不再把 `websearchRequired` 硬编码为 `false`，改为使用“最新/今天/查一下/实时”等启发式兜底。
  - 工具启发式新增与联网相同的“不要联网 / offline only”禁用判定，确保 classifier_failed 时仍能优先尊重显式离线要求。
- `apps/pilot/server/utils/pilot-runtime.ts`
  - Pilot 标准路径移除 runtime 侧 `getmemory` 工具注入与 prompt 提示，记忆读取改为严格前置决策；DeepAgent 运行时不再绕过 `memoryReadDecision` 自主取记忆。
- `apps/pilot/server/api/chat/sessions/[sessionId]/stream.post.ts`
  - 流过程中停止 eager `saveMessage(role=system)`；`messages` 表继续只持久化 `user/assistant`，system/runtime 卡片统一来自 trace 投影。
- `apps/pilot/server/utils/pilot-system-message-response.ts`
  - `messages.get` 改为始终按 trace 投影 system message；存在历史 legacy system row 时按 message id 去重，并以 trace projection 覆盖旧内容，避免双份 system card。
- `apps/pilot/app/composables/pilot-stream-shared.ts`
  - 新增共享 stream helper，统一两条 Pilot chat consumer 的 seq 标准化、trace 排序/去重以及 runtime card 事件识别，减少前端双轨消费规则漂移。
- `apps/pilot/app/composables/usePilotChatPage.ts`
  - 新页聊天链路改为复用共享 stream helper，trace 抽屉与运行卡只消费真实事件，不再依赖 synthetic planning 阶段。
- `apps/pilot/app/composables/api/base/v1/aigc/completion/index.ts`
  - legacy 首页聊天链路复用共享 seq normalizer / runtime card 判定，继续兼容旧 UI，但运行卡来源改为 trace-first 单流合同。
- 文档：
  - 新增 `docs/plan-prd/02-architecture/pilot-single-stream-runtime.md`，说明 Pilot 单流顺序合同、trace/SSE/messages 职责分工、严格前置记忆与无 synthetic planning 约束。
- 新增/扩展测试：
  - `apps/pilot/server/utils/__tests__/pilot-runtime.test.ts`
  - `apps/pilot/server/utils/__tests__/pilot-runtime-seq.test.ts`
  - `apps/pilot/server/utils/__tests__/pilot-intent-resolver.test.ts`
  - `apps/pilot/server/utils/__tests__/pilot-stream-planning-gate.test.ts`
  - `apps/pilot/server/utils/__tests__/pilot-stream-emitter-seq.test.ts`
  - `apps/pilot/server/utils/__tests__/pilot-stream-replay.test.ts`
  - `apps/pilot/server/utils/__tests__/pilot-system-message-response.test.ts`

### fix(pilot-chat): 收口 legacy intent 假卡并按工具判定触发 planning

- `apps/pilot/app/composables/api/base/v1/aigc/completion/index.ts`
  - legacy 首页链路不再在发送前本地预插 synthetic `intent.started` 运行卡，改为只消费服务端真实 `intent.*` 事件，避免出现重复的 `analyse intent`。
  - 运行卡合并逻辑新增无 `turnId` 场景的 pending intent 兜底：当 shared projector 下发真实 `intent:latest` 卡时，会优先吸收旧 `intent:${session}:pending` 卡并迁移到真实 key，确保 `intent.completed` 后只剩一张 completed 卡，不再残留 shimmer。
- `apps/pilot/shared/pilot-legacy-run-event-card.ts`
  - 新增 legacy run-event card key 解析 helper，统一 live 合并阶段对 pending intent fallback 的判定规则。
- `packages/tuff-intelligence/src/business/pilot/stream.ts`
  - `planning.started / updated / finished` 改为仅在 `metadata.toolDecision.shouldUseTools === true` 时发出；普通问答、无需工具的轮次不再默认展示“执行规划”。
- 新增/扩展测试：
  - `apps/pilot/server/utils/__tests__/pilot-legacy-run-event-card.test.ts`
  - `apps/pilot/server/utils/__tests__/pilot-stream-planning-gate.test.ts`

## 2026-04-02

### fix(pilot-chat): 首包事件到达后立即解除 legacy 等待态

- `apps/pilot/app/composables/api/base/v1/aigc/completion/index.ts`
  - legacy 首页链路在收到 `turn.accepted / turn.queued / turn.started` 以及首批 `intent / planning / assistant / run.audit` 事件时立即标记“已受理”，不再等到 thinking/assistant delta 才解除 `WAITING`。
  - `ChatItem` 因 `WAITING` 只渲染 loading 的问题得到修正，运行卡会在首包到达时即时显示，不再等整轮完成后一次性出现。
  - `turn.started` 从 legacy ignored-event 噪音日志中移出，避免控制台持续误报“ignored legacy stream event turn.started”。
- `apps/pilot/app/components/input/ThInput.vue`
  - `ThInputPlus.hide` 改为显式布尔值，修复首页输入区的 `Invalid prop: Expected Boolean, got Undefined` 警告。

### fix(pilot-chat): 修复 legacy 流式运行卡延迟出现与快照时间线错位

- `apps/pilot/app/composables/api/base/v1/aigc/completion/index.ts`
  - legacy 首页聊天链路的运行卡消费改为复用 shared projector，补齐 `planning.started / planning.updated / planning.finished` 实时卡片映射，减少与新页协议漂移。
  - 运行卡 key 新增优先复用 shared `cardKey`，并在 live 更新阶段保留 planning 的 `detail.todos`，避免 finished 覆盖后丢失步骤列表。
- `apps/pilot/shared/pilot-legacy-run-event-card.ts`
  - 新增 legacy run-event 纯投影 helper，对 `intent / planning / memory / websearch` 统一复用 `pilot-system-message`，仅保留 `thinking` 的兼容拼装逻辑。
- `apps/pilot/shared/pilot-chat-block-order.ts`
  - 新增聊天 block 时间线排序工具，统一按 `seq + streamOrder` 排序，且让带 seq 的运行卡优先回到 assistant markdown 前。
- `apps/pilot/app/components/chat/ChatItem.vue`
  - 聊天气泡渲染改为复用共享 block 排序工具，实时流与快照回放采用同一套排序规则。
- `apps/pilot/server/utils/quota-conversation-snapshot.ts`
  - 快照重建不再固定 `preservedBlocks + cardBlocks` 追加，改为按共享时间线排序重新合并，修复运行卡总是落在 assistant markdown 后的问题。
- `apps/pilot/server/utils/pilot-sse-response.ts`
  - 新增 SSE 响应头 helper，集中定义 `X-Accel-Buffering: no`。
- `apps/pilot/server/api/chat/sessions/[sessionId]/stream.post.ts`
  - 会话流式接口补齐 anti-buffer 响应头，减少 1Panel / Nginx 代理层对 SSE 的缓冲。
- `apps/pilot/deploy/README.zh-CN.md`
  - 部署文档补充 1Panel / Nginx 对 `/api/chat/sessions/*/stream` 的 `proxy_buffering off` 配置说明。
- `apps/pilot/deploy/README.md`
  - 英文部署文档同步补充 SSE 反向代理配置说明。
- 新增/扩展测试：
  - `apps/pilot/server/utils/__tests__/pilot-chat-block-order.test.ts`
  - `apps/pilot/server/utils/__tests__/pilot-legacy-run-event-card.test.ts`
  - `apps/pilot/server/utils/__tests__/pilot-sse-response.test.ts`
  - `apps/pilot/server/utils/__tests__/quota-conversation-snapshot.test.ts`

### fix(pilot-ui): 收敛记忆运行卡标签并展示本轮新增记忆

- `apps/pilot/server/utils/pilot-memory-facts.ts`
  - `upsertPilotMemoryFacts` 返回值新增 `addedFacts`，仅回传本轮真正新增的标准化记忆项，避免把已存在 fact 误展示成“新沉淀”。
- `apps/pilot/server/api/chat/sessions/[sessionId]/stream.post.ts`
  - `memory.updated` 事件与持久化 trace payload 新增 `facts` 字段，实时流、历史回放与快照重建统一复用同一份新增记忆明细。
- `apps/pilot/app/components/chat/attachments/card/PilotRunEventCard.vue`
  - `memory` 卡片不再显示 `Memory` / `已完成` pill，折叠态仅保留标题与摘要。
  - 当 `detail.facts` 非空时，展开区按列表展示本轮新增记忆内容，仅显示 `fact.value`，旧历史卡无明细时保持仅摘要展示。
- 新增/扩展测试：
  - `apps/pilot/server/utils/__tests__/pilot-memory-facts.test.ts`
  - `apps/pilot/server/utils/__tests__/quota-conversation-snapshot.test.ts`

### fix(pilot-ui): 规划卡直出步骤并隐藏跳过记忆卡

- `apps/pilot/shared/pilot-system-message.ts`
  - `memory.updated` 在 `stored=false` 时不再投影为前端 system message，避免“记忆未更新 / no_fact_extracted”类跳过卡进入聊天区。
  - system card 合并阶段为 `planning` 保留上一帧非空 `detail.todos`，解决 `planning.finished` 覆盖后仅剩 `todoCount`、丢失具体步骤的问题。
- `apps/pilot/shared/pilot-runtime-redaction.ts`
  - 前端系统消息过滤新增 `memory.context` 与 `memory/skipped` 隐藏规则，确保 live 流、刷新和 lazy projection 下都不再展示跳过记忆卡。
- `apps/pilot/app/components/chat/attachments/card/PilotRunEventCard.vue`
  - `执行规划` 卡直接展示 `detail.todos` 步骤列表，无需展开即可看到规划内容。
  - 隐藏 `planning` 类型标签，仅保留右侧执行状态标签；其他卡片标签行为保持不变。
- 新增/扩展测试：
  - `apps/pilot/server/utils/__tests__/pilot-runtime-redaction.test.ts`
  - `apps/pilot/server/utils/__tests__/pilot-system-message.test.ts`

### feat(pilot-memory): 设置页展示记忆详情并将读记忆/工具判定接入运行时

- `apps/pilot/server/utils/pilot-memory-facts.ts`
  - 新增 `listPilotMemoryFactsByUser`，按添加时间倒序返回用户记忆详情。
  - 新增 `buildPilotMemoryContextSystemMessage`，将命中的记忆事实注入当前轮隐藏 system context。
- `apps/pilot/server/api/v1/chat/memory/facts.get.ts`
  - 新增用户记忆详情接口，供个人设置页直接读取 `value/createdAt/updatedAt`。
- `apps/pilot/app/composables/usePilotMemorySettings.ts`
  - 记忆设置状态新增 `facts/factsLoading`，开关切换后同步刷新或清空记忆详情。
- `apps/pilot/app/components/chore/personal/profile/account/AccountModuleAppearance.vue`
  - 在个人设置页新增“记忆详情”列表，展示记忆内容与“添加时间”。
- `apps/pilot/server/utils/pilot-intent-resolver.ts`
  - intent 分类结果新增 `memoryReadDecision` 与 `toolDecision`，每轮显式判断是否需要读取记忆及启用工具。
- `apps/pilot/server/api/chat/sessions/[sessionId]/stream.post.ts`
  - 运行时按 `memoryReadDecision` 拉取记忆 facts 并注入隐藏 system context。
  - builtinTools 改为按 `toolDecision` 做运行时裁剪，避免“无需工具”的轮次仍暴露默认工具。
- `apps/pilot/server/utils/pilot-memory-tool.ts`
  - 新增 deepagent 可调用的 `getmemory` 工具，按 query 优先返回相关记忆，未命中时回退最近记忆，并附带添加时间供模型参考。
- `apps/pilot/server/utils/pilot-runtime.ts`
  - 新增 `disableDefaultBuiltinTools`，支持在运行时显式关闭默认工具注入。
  - 开启记忆后会把 `getmemory` 注入 deepagent 自定义 tools，并补充 prompt 提示 agent 在个性化问题上优先查记忆而不是猜测。
- `packages/tuff-intelligence/src/adapters/deepagent-engine.ts`
  - `DeepAgentEngineOptions` 新增 `tools`，deepagent 调用与流式执行都会透传自定义 tools。
  - 当存在自定义 tools 时自动关闭 direct stream 快路径，避免跳过 deepagent tool 调用链。
- 新增/扩展测试：
  - `apps/pilot/server/utils/__tests__/pilot-memory-facts.test.ts`
  - `apps/pilot/server/utils/__tests__/pilot-intent-resolver.test.ts`
  - `apps/pilot/server/utils/__tests__/pilot-runtime.test.ts`
  - `apps/pilot/server/utils/__tests__/pilot-memory-tool.test.ts`

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

### fix(pilot/chat): 收口 routing 选择前端暴露并脱敏运行记录

- `apps/pilot/server/api/chat/sessions/[sessionId]/stream.post.ts`
  - `routing.selected` 不再通过 SSE 直接下发到前端；仅在后端 trace 中保留脱敏摘要，错误事件中的路由字段也同步剥离。
- `apps/pilot/server/api/chat/sessions/[sessionId]/trace.get.ts`
  - 会话 trace API 过滤 `routing.selected`，并对错误 trace payload 做前端可见级脱敏。
- `apps/pilot/server/utils/pilot-system-message-response.ts`
  - 历史 system message 返回前增加 routing 卡片过滤，避免旧会话重放时再次暴露路由选择细节。
- `apps/pilot/shared/pilot-system-message.ts`
  - system message / 运行卡投影统一忽略 routing 事件，保证实时流、懒投影与快照回放行为一致。
- `apps/pilot/app/composables/usePilotChatPage.ts`
  - 前端运行态不再消费 `routing.selected`，历史 trace / system message 也会在加载时过滤。
- `apps/pilot/app/components/chat/attachments/ErrorCard.vue`
  - 错误卡不再展示 route/model/channel/selection reason 等路由诊断字段。
- 新增/扩展测试：
  - `apps/pilot/server/utils/__tests__/pilot-runtime-redaction.test.ts`
  - `apps/pilot/server/utils/__tests__/pilot-system-message.test.ts`
  - `apps/pilot/server/utils/__tests__/quota-conversation-snapshot.test.ts`

### fix(pilot/chat): 收口 websearch 运行卡展示状态

- `apps/pilot/app/components/chat/attachments/card/PilotRunEventCard.vue`
  - websearch 运行卡移除 `Websearch` 与完成态 pill，仅在执行中保留 shimmer 展示，减少噪音标签。
- `apps/pilot/app/composables/api/base/v1/aigc/completion/index.ts`
  - websearch 决策与执行事件改为复用同一张运行卡；`intent_not_required` 时不再创建卡片，执行未落定时保持 running 以驱动 shimmer。
- `apps/pilot/shared/pilot-system-message.ts`
  - system message 投影统一 websearch 卡片 key / 标题 / 隐藏条件，确保实时流与历史回放行为一致。
- `apps/pilot/server/utils/quota-conversation-snapshot.ts`
  - 会话快照重建对齐新规则：无需联网时不复活 websearch 卡片，决策与执行态合并为单卡。
- 新增/扩展测试：
  - `apps/pilot/server/utils/__tests__/pilot-system-message.test.ts`
  - `apps/pilot/server/utils/__tests__/quota-conversation-snapshot.test.ts`

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

### feat(pilot/coze): 接入独立 Coze 渠道适配与 Bot/Workflow 路由

- `apps/pilot/server/utils/pilot-channel.ts`
  - Pilot 渠道抽象新增 `adapter='coze'`、`transport='coze.openapi'`、`providerTargetType='coze_bot' | 'coze_workflow'` 与中国区默认 API/OAuth 地址。
- `apps/pilot/server/utils/pilot-admin-channel-config.ts`
  - 管理端渠道配置新增 `region/oauthClientId/oauthClientSecret/oauthTokenUrl`，Coze 新建时自动填充中国区默认地址，`oauthClientSecret` 继续加密存储并支持编辑留空保留旧值。
  - Coze 目标列表改为手工维护，不再依赖渠道级默认 target；同一 `targetId` 可按不同 `targetType` 共存。
- `apps/pilot/server/utils/pilot-admin-routing-config.ts`
  - 模型绑定与 Route Combo 路由新增 `providerTargetType`，旧数据缺省按 `model` 兼容读取。
- `apps/pilot/server/utils/pilot-coze-auth.ts`
  - 新增 Coze token 获取与缓存层，兼容 `OAuth 应用凭证` 与 `服务身份凭证（JWT）` 两种鉴权模式。
  - token 缓存 key 从单纯 `channelId` 升级为“渠道 + 凭证指纹”，管理员切换 Coze 凭证后不会继续误命中旧 token。
- `apps/pilot/server/utils/pilot-coze-engine.ts`
  - 新增独立 Coze engine adapter，分别打通 `Bot` 与 `Workflow` 流式执行、附件透传、失败态映射与运行审计。
- `apps/pilot/server/utils/pilot-runtime.ts`
  - `coze` 渠道不再复用 OpenAI-compatible / DeepAgent 兼容层，运行时直接走 Coze engine。
  - 当 Coze 路由仍配置 Pilot 本地 `builtinTools/tool-gateway` 时，保存与运行改为显式拒绝，避免静默失效。
- `apps/pilot/server/api/admin/channels/test.post.ts`
  - 渠道测试新增 Coze 分支，改为校验 Coze 凭证有效性与 API base URL 可达性，不再走 `/v1/responses` 探测。
- `apps/pilot/server/utils/pilot-channel-model-sync.ts`
  - Coze 第一版禁用自动发现/同步目标，后台仅保留手工维护 Bot / Workflow 列表。
- `apps/pilot/app/pages/admin/system/channels.vue`
  - 管理后台渠道页新增 Coze 适配器配置项与目标类型编辑能力；Coze 行不再展示“拉取渠道模型”，改为手工维护目标列表。
  - Coze 渠道新增“鉴权方式”切换，可在 `OAuth 应用凭证` 与 `服务身份凭证（JWT）` 间切换；JWT 模式支持配置 `App ID / Key ID / Audience / Private Key`，私钥仍按加密存储并支持编辑留空保留旧值。
- `apps/pilot/app/pages/admin/system/model-groups.vue`
  - 模型组映射新增 `targetType` 维度，并在 Coze 绑定摘要中直接显示 `targetType / targetId`。
- `apps/pilot/app/pages/admin/system/route-combos.vue`
  - Route Combo 路由新增 `targetType` 选择与摘要展示，Coze route 必须显式指定 `coze_bot` 或 `coze_workflow`。
- 新增/扩展测试：
  - `apps/pilot/server/utils/__tests__/pilot-coze-auth.test.ts`
  - `apps/pilot/server/utils/__tests__/pilot-coze-engine.test.ts`
  - 扩展 `apps/pilot/server/utils/__tests__/pilot-admin-channel-config.test.ts`
  - 扩展 `apps/pilot/server/utils/__tests__/pilot-channel-model-sync.test.ts`
  - 扩展 `apps/pilot/server/utils/__tests__/pilot-runtime.test.ts`
  - 扩展 `apps/pilot/server/utils/__tests__/pilot-route-health.test.ts`

### feat(pilot/routing): 新增 scene-aware 专项模型路由

- `apps/pilot/shared/pilot-routing-scene.ts`
  - 新增 Pilot 内置 scene 定义与标准化工具，第一版固定支持 `intent_classification`、`image_generate`，并保留未来自定义 scene 元数据扩展位。
- `apps/pilot/server/utils/pilot-admin-routing-config.ts`
  - `modelCatalog` 新增 `scenes[]`，`routingPolicy` 新增 `scenePolicies[]`。
  - 读取兼容旧 `intentNanoModelId / intentRouteComboId / imageGenerationModelId / imageRouteComboId`，缺少 `scenePolicies` 时自动派生；新保存时同步回写 legacy 字段。
  - 对显式 `scenePolicies` 增加校验：同一 scene 不允许重复，且内置 scene 必须命中已打对应 scene 标签的 model group。
- `apps/pilot/server/utils/pilot-routing-resolver.ts`
  - 意图路由新增内部 scene 解析层：`intent_classification` / `image_generate` 优先命中 `scenePolicies`，再退回 legacy 专项字段、请求模型与默认模型。
  - 路由结果新增 `scene`，并把 scene 注入 selection reason，便于诊断专项路由命中链路。
- `apps/pilot/server/api/chat/sessions/[sessionId]/stream.post.ts`
  - `routing.selected` 事件、运行 trace、conversation metadata 与 routing metrics metadata 全部补充 `scene`，让专项路由在运行态可见。
- `apps/pilot/app/composables/usePilotRoutingAdmin.ts`
  - 管理端表单模型补齐 `modelGroup.scenes[]` 与 `routingPolicy.scenePolicies[]`，并在前端继续兜底兼容 legacy 专项字段。
- `apps/pilot/app/pages/admin/system/model-groups.vue`
  - 模型组页新增 `Scenes` 维护区与列表预览，支持内置预设 scene + `allow-create` 自定义输入。
- `apps/pilot/app/pages/admin/system/routing-policy.vue`
  - 专项模型入口切换为固定两条 built-in scene row：管理员可分别为 `intent_classification`、`image_generate` 选择 model group 与可选 route combo。
  - 未知/custom scene policy 在第一版 UI 中保持透传保留，不参与直接编辑，避免覆盖未来配置。
- `apps/pilot/app/composables/usePilotChatPage.ts`
  - 运行态 routeState 新增 `scene`，调试视图中的 route label 也会显示当前命中的专项 scene。
- `apps/pilot/app/components/chat/attachments/card/PilotRunEventCard.vue`
  - Routing 运行卡明细新增 `Scene` 字段，便于直接从运行卡确认专项路由命中结果。
- 新增/扩展测试：
  - `apps/pilot/server/utils/__tests__/pilot-admin-routing-config.test.ts`
  - `apps/pilot/server/utils/__tests__/pilot-routing-resolver.intent.test.ts`

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

### feat(pilot-chat): 意图运行卡折叠体验优化（extra 插槽 + chevron 展开）

- `apps/pilot/app/components/chat/attachments/card/PilotRunEventCard.vue`
  - 运行卡组件新增 `extra` 插槽能力，右侧交互统一为 `chevron-right` 折叠/展开。
  - `intent` 类型卡片改为极简展示：默认仅显示 `Analyse intent`，展开后仅展示 `reason`（其余参数不再展示）。
  - `intent` 类型隐藏 cardType/status 标签与底部 trace 元信息，减少噪声。
  - `intent + running` 状态改为复用独立 `ShimmerText` 组件渲染，强化“分析中”反馈。
  - event card 外观改为轻量样式：卡片容器去背景/去边框，并改为内容宽度自适应，避免整行撑满。
  - chevron 折叠按钮改为无边框纯图标点击区，去掉外圈视觉噪声。
  - 标题前前置图标移除；secondary 文本统一降为 normal 字重，避免视觉过重。
  - 标题区强制单行布局（标题与 chevron 同行不换行）；展开/收起新增过渡动画，避免内容瞬时跳变。
  - 标题与 chevron 进一步微调：降低标题/图标不透明度，缩小图标尺寸并收紧间距，整体更轻更紧凑。
- `apps/pilot/app/composables/api/base/v1/aigc/completion/index.ts`
  - 流式 block 写入补充 `seq + streamOrder` 元信息，文本/事件卡/错误块统一走顺序化插入路径，按接收序稳定渲染。
  - `pilot_run_event_card` 增加乱序保护与终态防回退（旧 seq 或非终态事件不覆盖已终态卡片）。
  - 发送阶段预置 `intent.started` 运行卡，确保“Analyse intent”在分析开始时立即可见，不等待完成事件。
- `packages/tuff-intelligence/src/business/pilot/conversation.ts`
  - 关闭 `intentWebsearchReason=classifier_failed` 时的启发式联网兜底：当意图层明确 `intentWebsearchRequired=false` 时，统一保持不联网（`intent_not_required`）。
- `apps/pilot/server/utils/__tests__/pilot-conversation-shared.test.ts`
  - 同步断言：`classifier_failed` 场景不再触发 `heuristic_required_classifier_fallback`，改为 `intent_not_required`。
- `apps/pilot/app/components/chat/ChatItem.vue`
  - 聊天块渲染增加顺序编排：优先按 `seq`，同 seq 按 `streamOrder`，确保文本与事件卡按接收顺序展示。
- `apps/pilot/app/components/other/ShimmerText.vue`
  - 新增通用文本 shimmer 组件（基于 `TextShaving` 的文本流光思路抽离），支持通过 `active` 开关控制动效启停。
  - 调整为纯文本渲染：无背景、无边框，仅保留文字流光层，避免出现“文字浮层块”观感。

### feat(pilot-admin/channels): 渠道配置增加一键测试

- `apps/pilot/app/pages/admin/system/channels.vue`
  - 渠道编辑抽屉新增「测试渠道」按钮，支持在保存前快速校验当前渠道是否可用。
  - 新增测试态 loading 与按钮禁用联动，避免与「拉取渠道模型 / 保存」并发触发。
  - 编辑态允许 API Key 留空并复用已保存密钥完成测试；新增态仍要求先填写 API Key。
  - 渠道列表 table 的每行操作区升级为 actions group：`编辑 / 测试 / 删除`，支持直接在行内快速测试。
- `apps/pilot/server/api/admin/channels/test.post.ts`
  - 新增管理端测试接口 `POST /api/admin/channels/test`，按渠道 transport（`responses` / `chat.completions`）发起最小请求探活。
  - 支持 `channelId` 兜底读取已保存配置（`baseUrl/apiKey/model/timeoutMs`），降低重复输入成本。
  - 返回结构化测试结果（channelId/model/transport/durationMs/preview），并在上游非 2xx 时透传 HTTP 错误上下文。
- `apps/pilot/server/api/admin/__tests__/channels-test.post.test.ts`
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

### fix(pilot-websearch): 收敛 responses_builtin 回退上下文污染

- `apps/pilot/server/utils/pilot-tool-gateway.ts`
  - `normalizeResponsesBuiltinDocs` 改为优先使用结构化来源（payload citation/source）；仅在无结构化来源时启用文本 URL 兜底。
  - 停止使用 `responses_builtin` 的 `summaryText` 回填 `source.snippet` 与 `doc.content`，避免同一段自由总结污染多条来源。
  - `buildContextText` 在有来源时仅注入条目化引用（title/url/snippet），不再注入 `Websearch summary` 自由文本块。
- `apps/pilot/server/utils/__tests__/pilot-tool-gateway.test.ts`
  - 补充断言：`output_text + annotations` 场景下，context 不应包含自由总结文本。
  - 新增用例：无结构化来源时，允许从文本 URL 生成最小来源集合（`responses_builtin_text_fallback`）。
  - 保持既有回归：`provider_pool_empty`、`fallback_*`、`no-source guard` 路径不变。

### fix(pilot-chat): 旧链路聊天稳定性止血（滚动/会话竞态/历史加载）

- `apps/pilot/app/components/chat/ThChat.vue`
  - 修正回到底部判定：统一基于 `scrollHeight - (scrollTop + clientHeight)`，移除 `window.innerWidth/document.body.clientHeight` 误用。
  - 删除消息变更后的无条件自动回底，改为仅在流式增量且“用户仍接近底部”时跟随。
  - 补充 `wrapRef` 空值保护，避免边界时机报错。
- `apps/pilot/app/pages/index.vue`
  - 会话切换改为可取消 token 流程，替换延迟 `setTimeout` 回写，修复快速切换错位。
  - `mounter` 改为单飞初始化；事件与快捷键仅注册一次，修复 `onMounted/onActivated` 双触发重复监听。
  - 增加 `conversationReady` 发送门禁与摘要会话 hydrate 流程，避免“历史未就绪误发到空会话”。
  - 路由 `id` 解析失败不再自动回退新会话，改为保留当前状态并提示重试。
- `apps/pilot/app/composables/api/base/v1/aigc/history/index.ts`
  - `loadHistories` 增加单飞锁与状态门禁，`LOADING` 期间禁止重复翻页。
  - 默认使用 `summary=1` 拉取轻量历史，并在空列表时正确落为 `COMPLETED`，避免无限触发加载。
- `apps/pilot/app/components/history/index.vue`
  - `IntersectionObserver` 增加 `LOADING/COMPLETED` 门禁；组件卸载时断开 observer 和 watch 清理。
- `apps/pilot/server/api/aigc/history.get.ts`
  - 新增 `summary=1` 摘要模式，返回轻量会话结构并批量回填 `run_state`。
- `apps/pilot/server/utils/quota-history-store.ts`
  - 新增 `listQuotaHistorySummary`，仅查询历史列表必要字段（不取全量消息载荷）。
- `apps/pilot/server/utils/chat-turn-queue.ts`
  - 新增批量 `getSessionRunStateMapSafe`，替代逐条 N+1 状态查询。

### fix(pilot-routing/websearch): classifier_failed 联网兜底 + quota-auto 尊重禁用绑定 + Thinking 终态收口

- `packages/tuff-intelligence/src/business/pilot/conversation.ts`
  - `shouldExecutePilotWebsearch` 在 `intentWebsearchRequired=false` 且 `intentWebsearchReason=classifier_failed` 时允许启发式联网兜底，避免“今日新闻”被硬门禁拦截。
- `apps/pilot/server/api/chat/sessions/[sessionId]/stream.post.ts`
  - 透传 `intentWebsearchReason` 到联网决策，便于 classifier fallback 生效并可观测。
- `apps/pilot/server/utils/pilot-routing-resolver.ts`
  - 为 `quota-auto` 增加“模型绑定禁用策略”过滤：若某 `channelId+providerModel` 仅存在禁用绑定，不再进入候选池。
- `apps/pilot/app/composables/api/base/v1/aigc/completion/index.ts`
  - 旧链路运行卡片新增 `websearch.decision/websearch.skipped` 展示，明确“是否检索/为何跳过”。
  - `Thinking` 事件对 `__end__` 哨兵去噪，并在 `assistant.final/done/error/turn.finished` 兜底收口，避免卡片长期停留“进行中”。
- `apps/pilot/server/utils/__tests__/pilot-conversation-shared.test.ts`
  - 新增断言：`classifier_failed` + 新闻类问题触发启发式联网。
- `apps/pilot/server/utils/__tests__/pilot-routing-resolver.intent.test.ts`
  - 新增断言：`quota-auto` 会跳过显式禁用的 provider 绑定。

### fix(pilot-websearch-ui): 结果可见性增强与状态收口（旧链路）

- `apps/pilot/app/composables/api/base/v1/aigc/completion/index.ts`
  - `websearch.decision` 运行卡状态改为 `completed`（仅表达“决策已完成”），避免长期停留“进行中”。
  - `pilot_tool_card` 增加时序防回退：支持按 `seq` 忽略旧事件；终态（`completed/failed/rejected/cancelled`）禁止被非终态覆盖。
  - `pilot_tool_card` 合并策略增强：后续事件未携带 `sources` 时保留已有来源，避免“搜到内容”被清空。
- `apps/pilot/app/components/chat/attachments/card/PilotToolCard.vue`
  - 来源展示增强为 `title + domain + url + snippet`，并默认展示 Top 5，提升“具体搜到了什么”的可读性。
- `apps/pilot/shared/pilot-system-message.ts`
  - `websearch.decision` 的 system-policy 卡状态统一收口为 `completed`，与前端旧链路语义对齐。
- `apps/pilot/server/utils/quota-conversation-snapshot.ts`
  - 快照重建侧同步 `websearch.decision` 收口策略。
  - 工具卡重建增加乱序与终态防回退保护，并在空 `sources` 更新时保留已有来源。
- `apps/pilot/server/utils/__tests__/quota-conversation-snapshot.test.ts`
  - 新增回归：`websearch.decision` 卡应为 `completed`。
  - 新增回归：`run.audit` 乱序/空 `sources` 场景下，工具卡不回退且保留来源列表。

## 2026-03-24

### feat(pilot-message-first): Pilot 数据层 message-first + system 白名单入模

- 数据层改为 message-first（trace 保留调试/兼容副本）：
  - `apps/pilot/server/api/chat/sessions/[sessionId]/stream.post.ts`
  - 新增 `apps/pilot/shared/pilot-system-message.ts`
  - 新增统一 projector：将 `planning/intent/routing/memory/websearch/run.audit` 投影为 `role=system` 消息并实时写入 `messages`，统一 metadata（`eventType/seq/turnId/cardType/contextPolicy/summary`）。
- 历史懒迁移（不回写）：
  - 新增 `apps/pilot/server/utils/pilot-system-message-response.ts`
  - `messages.get`（含 v1）在“旧会话无 system 消息”时按需从 trace 合成内存态 system 视图。
- 上下文白名单过滤统一收敛：
  - `packages/tuff-intelligence/src/business/pilot/conversation.ts`
  - `packages/tuff-intelligence/src/adapters/deepagent-engine.ts`
  - `apps/pilot/server/utils/pilot-langgraph-engine.ts`
  - `apps/pilot/server/utils/pilot-title.ts`
  - 规则固定为：`user/assistant` 全量入模；`system` 仅 `eventType=system.policy|tool.summary` 且 `contextPolicy=allow` 入模，其余排除。
- 前端消费链路收敛为“卡片由 system messages 派生”：
  - `apps/pilot/app/composables/usePilotChatPage.ts`
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
    - 移除 `deepagent-engine` 的根 adapters 重导出，降低非 Pilot 场景的启动期模块求值成本。
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

### fix(pilot): 会话 ensure 幂等化，避免运行中状态被覆盖导致刷新续流中断

- 问题：
  - `POST /api/chat/sessions` 在 `sessionId` 已存在时仍走 `createSession + completeSession('idle')`，会把运行中的会话状态误写为 `idle`。
  - legacy 页面刷新后依赖 `run_state=executing/planning` 触发 `fromSeq+follow`，状态被覆盖后会出现“对话还在跑但无法自动续流”。
- 变更：
  - `apps/pilot/server/api/chat/sessions/index.post.ts`
    - 新增已存在会话短路：若命中同 `sessionId`，不再改写 runtime status；
    - 仅在会话不存在时才创建并初始化 `idle`；
    - 继续保留“首句标题补写 + quota_history/pilot_quota_sessions 占位”行为。
  - `apps/pilot/app/composables/api/base/v1/aigc/completion/index.ts`
    - 去掉一次重复 `ensureRemoteSessionInitialized` 调用，减少并发写状态窗口。
  - `apps/pilot/app/pages/index.vue`
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

### fix(pilot): 补齐 Milkdown 数学样式依赖（katex CSS 解析失败）

- 问题：
  - `apps/pilot/app/components/article/MilkContent.vue` 与 `apps/pilot/app/components/article/MilkdownRender.vue` 直接导入 `katex/dist/katex.min.css`；
  - 但 `apps/pilot/package.json` 未声明 `katex` 依赖，导致 Vite 在 dev 阶段报 `Failed to resolve import "katex/dist/katex.min.css"`。
- 变更：
  - `apps/pilot/package.json` 增加 `katex: ^0.16.28` 显式依赖；
  - 同步 `pnpm-lock.yaml` 对应 importer 依赖项。
- 验证：
  - `pnpm -C "apps/pilot" exec node -p "require.resolve('katex/dist/katex.min.css')"` 成功返回解析路径；
  - `apps/pilot/node_modules/katex/dist/katex.min.css` 文件存在。

### fix(pilot): Websearch 门控收紧 + 可恢复跳过 + 刷新卡片持久化

- Websearch 决策统一收口为意图强门控（新旧链路一致）：
  - `packages/tuff-intelligence/src/business/pilot/conversation.ts`
    - `intentWebsearchRequired === false` 时强制关闭并返回 `intent_not_required`；
    - 仅在 `intentWebsearchRequired` 缺失时才允许 heuristic 兜底。
  - `apps/pilot/server/api/chat/sessions/[sessionId]/stream.post.ts`
  - `apps/pilot/server/api/aigc/executor.post.ts`
    - `websearch.decision` / `websearch.skipped` 增加 `gateMode: intent_strict` 审计字段；
    - 当 gateway 返回可恢复跳过信号时，`websearch.skipped` 透传具体 reason，避免误判为工具硬失败。
- Fallback 失败降级为可恢复跳过（不中断主回答）：
  - `apps/pilot/server/utils/pilot-tool-gateway.ts`
    - `fallback_unsupported_channel` / `fallback_endpoint_missing` 归类为 recoverable skip；
    - 审计改为 `tool.call.completed + status=skipped`（保留 `connectorReason`），不再产出 `tool.call.failed` 噪音。
  - 继续保留 no-source guard（需要联网但无来源时明确防幻觉约束）。
- 修复刷新后意图/工具卡丢失：
  - `apps/pilot/server/utils/quota-conversation-snapshot.ts`
    - 新增 runtime trace 重建逻辑，注入 `pilot_run_event_card` 与 `pilot_tool_card` 到 assistant block；
    - 仅按“最新 turn”回填，避免跨 turn 卡片重复污染。
  - `apps/pilot/server/api/chat/sessions/[sessionId]/stream.post.ts`
  - `apps/pilot/server/api/aigc/conversation/[id].get.ts`
    - 两条快照回填链路统一传入 runtime traces，确保首轮回填与刷新后表现一致。
- 前端兼容显示优化（聊天页保持现状）：
  - `apps/pilot/app/composables/usePilotChatPage.ts`
  - `apps/pilot/app/components/chat/attachments/card/PilotRunEventCard.vue`
    - `websearch.skipped` 原因映射为中性文案（如通道不支持联网时自动离线回答），减少“系统故障”误解。
- 测试：
  - 更新：`apps/pilot/server/utils/__tests__/pilot-conversation-shared.test.ts`
  - 更新：`apps/pilot/server/utils/__tests__/pilot-tool-gateway.test.ts`
  - 新增：`apps/pilot/server/utils/__tests__/quota-conversation-snapshot.test.ts`
  - 通过：`pnpm -C "apps/pilot" test -- "server/utils/__tests__/pilot-conversation-shared.test.ts" "server/utils/__tests__/pilot-tool-gateway.test.ts" "server/utils/__tests__/quota-conversation-snapshot.test.ts"`
  - `pnpm -C "apps/pilot" run typecheck` 失败，存在仓库既有大量 TS 问题（与本次改动无直接关联）。

### fix(pilot): stream 后端逐事件投影同步（替代前端触发上传）

- 问题：
  - 仅依赖 `finally` 阶段回填时，流中刷新可能出现 `pilot_tool_card` / `pilot_run_event_card` / thinking 状态短暂丢失。
  - 需要将一致性职责固定在后端 stream 链路，避免前端触发上传参与状态保障。
- 变更：
  - 新增 `apps/pilot/server/utils/pilot-stream-quota-projector.ts`：
    - 在后端按 SSE 逐事件投影（含 `assistant.*`、`thinking.*`、`run.audit`、`intent.*`、`routing.*`、`memory.*`、`websearch.*`、`error/done`）；
    - `stream.heartbeat` 仅透传，不进入快照；
    - 使用串行队列 + `assistant.delta` 短防抖写入，`assistant.final/thinking.final/done/error/finally` 强制 flush。
  - `apps/pilot/server/api/chat/sessions/[sessionId]/stream.post.ts`：
    - 在 `emitEvent` 包装层接入 projector，SSE 发送后立即 `apply`；
    - `finally` 阶段先强制 flush projector，再执行现有 `syncLegacyQuotaConversationFromRuntime(...)` 兜底校准。
  - `apps/pilot/server/utils/quota-conversation-snapshot.ts`：
    - 补齐 `thinking.delta` / `thinking.final` 到 `pilot_run_event_card` 的重建与内容合并；
    - `run.audit` 卡片补齐 camel/snake 归一化（`auditType/callId/ticketId/toolName/status`）与审批状态链路映射。
- 验证：
  - 新增：`apps/pilot/server/utils/__tests__/pilot-stream-quota-projector.test.ts`
  - 新增：`apps/pilot/server/utils/__tests__/quota-conversation-snapshot.test.ts`
  - 通过：`pnpm -C "apps/pilot" exec vitest run -c "./vitest.config.ts" "server/utils/__tests__/quota-conversation-snapshot.test.ts" "server/utils/__tests__/pilot-stream-quota-projector.test.ts"`
  - 通过：`pnpm -C "apps/pilot" exec eslint "server/api/chat/sessions/[sessionId]/stream.post.ts" "server/utils/quota-conversation-snapshot.ts" "server/utils/pilot-stream-quota-projector.ts" "server/utils/__tests__/quota-conversation-snapshot.test.ts" "server/utils/__tests__/pilot-stream-quota-projector.test.ts"`
  - `pnpm -C "apps/pilot" run typecheck` 失败，存在仓库既有大量 TS 问题（与本次改动无直接关联）。

### fix(pilot/legacy-ui): 发送即建会话 + 用户首句临时标题 + 刷新续流恢复

- 问题：
  - 旧 `completion` 链路首轮发送时，会话与历史可见性依赖流式阶段，导致“AI 未结束前刷新”可能出现当前会话丢失或无法续流。
  - 会话标题依赖后续 AI 生成，首轮缺少稳定的用户可见标题。
- 变更：
  - `apps/pilot/server/api/chat/sessions/index.post.ts`
    - 支持 `title/topic/message` 输入，创建会话时优先写入“用户首句裁剪标题”；
    - 创建阶段补写 `quota_history` 占位快照与 `pilot_quota_sessions`，确保“发送即创建且可见”。
  - `apps/pilot/app/composables/api/base/v1/aigc/completion/index.ts`
    - 流式请求前显式调用 `POST /api/chat/sessions` 绑定会话（同 id），避免会话延迟创建；
    - 新增 `fromSeq/follow` 透传能力，支持刷新后 follow 模式续流；
    - 发送首轮使用用户消息前缀作为 `initialTitle`，后续仍可被 AI 标题覆盖。
  - `apps/pilot/app/pages/index.vue`
    - 首次发送即锁定 `select + route(id)`，并立即本地快照为 `pending`；
    - 启动时主动加载历史并按 `route.id` 恢复会话；
    - 对 `runtimeState=executing/planning` 的会话自动触发 `fromSeq+follow` 续流。
- 验证：
  - 通过：`pnpm -C "apps/pilot" exec eslint "app/pages/index.vue" "app/composables/api/base/v1/aigc/completion/index.ts" "app/composables/api/base/v1/aigc/completion-types.ts" "server/api/chat/sessions/index.post.ts" "server/api/chat/sessions/[sessionId]/stream.post.ts" "server/utils/quota-conversation-snapshot.ts" "server/utils/pilot-stream-quota-projector.ts" "server/utils/__tests__/quota-conversation-snapshot.test.ts" "server/utils/__tests__/pilot-stream-quota-projector.test.ts"`
  - 通过：`pnpm -C "apps/pilot" exec vitest run -c "./vitest.config.ts" "server/utils/__tests__/legacy-stream-input.test.ts" "server/utils/__tests__/quota-conversation-snapshot.test.ts" "server/utils/__tests__/pilot-stream-quota-projector.test.ts"`

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

### feat(pilot-hardcut): 实体存储与 legacy API 一次性切换

- 新增 `apps/pilot/server/utils/pilot-entity-store.ts`：
  - 正式表 `pilot_entities` + 迁移表 `pilot_entity_migrations`。
  - 启动即执行一次性迁移：建表 -> 拷贝 -> 按 domain 对账 -> 写 marker -> 旧表 rename 备份。
  - 迁移失败写 `failed` marker 并 fail-fast，阻断静默脏切。
- Pilot server 全量调用已切换到 `pilot-entity-store`（`get/list/upsert/delete/seed` 新函数族）；`pilot-compat-store.ts` 已物理删除。
- 物理删除 legacy 路由：
  - `apps/pilot/server/api/v1/chat/sessions/[sessionId]/stream.post.ts`
  - `apps/pilot/server/api/v1/chat/sessions/[sessionId]/turns.post.ts`

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
  - 删除 `compat:registry:guard` 标注为 stale 的 4 条 `legacy-keyword` 记录（`pilot-settings.vue`、`pages/pilot/admin/channels.vue`、`pilot-channel.ts`、`pilot-runtime.ts`）。
- 验证：`pnpm compat:registry:guard` 无 warning，台账覆盖保持有效。

### feat(pilot-websearch): SoSearch adapter 接入并设为默认主 provider

- `apps/pilot/server/utils/pilot-websearch-connector.ts`：
  - 新增 `SoSearch adapter`，接入 `GET {baseUrl}/search?q=...`（无鉴权）。
  - 支持 `baseUrl` 已含 `/search` 的 endpoint 归一化，避免重复拼接路径。
  - 复用现有 `search/fetch/extract` 标准链路与 fallback/去重策略，不改工具网关语义。
- `apps/pilot/server/utils/pilot-admin-datasource-config.ts`：
  - `PilotWebsearchProviderType` 新增 `sosearch`。
  - 默认 provider 池升级为：`sosearch-main -> searxng-main -> serper-backup -> tavily-backup`。
  - `sosearch-main` 默认 `baseUrl` 留空，部署后手填。
- `apps/pilot/app/pages/admin/system/websearch-providers.vue`：
  - 管理页新增 `SoSearch` provider 选项（快捷添加按钮 + Type 下拉项）。
  - 前端默认 providers、归一化解析与空值回退逻辑补齐 `sosearch`。
- 测试补齐：
  - `pilot-websearch-connector.test.ts` 新增 SoSearch 响应解析、`/search` endpoint 去重、`baseUrl` 为空回退空结果用例。
  - `pilot-admin-datasource-config.test.ts` 新增默认 provider 顺序与 `sosearch` 类型读写用例。

### fix(pilot-approval): 工具审批通用化收敛 + websearch 免审批

- `apps/pilot/server/utils/pilot-tool-gateway.ts`：
  - 新增通用工具审批策略入口 `shouldRequireToolApproval()`，按工具维度判定是否启用审批。
  - 默认将 `websearch` 审批策略关闭（`TOOL_APPROVAL_POLICY[websearch]=false`），高风险检索不再进入审批中断分支。
- `apps/pilot/app/composables/api/base/v1/aigc/completion/index.ts`：
  - 工具卡 `upsert` 增加通用身份归并（`callId/ticketId/toolName + 活跃态`），避免审批事件拆分成新卡，审批按钮可稳定嵌入同一工具卡。
  - `send()` 增加取消收敛（Abort -> `CANCELLED`）与执行流计数，修复“停止生成无效/等待审批态无法收口”。
  - 新增审批等待检查点回调，进入 `approval_required` 时可先完成本地会话快照，避免同步长期停留 `PENDING`。
- `apps/pilot/app/pages/index.vue`：
  - 接入 `onReqCheckpoint('approval_required')`，在等待审批阶段即时落盘会话并恢复发送状态。
  - 会话同步状态判定中 `CANCELLED` 不再标记为 `FAILED`，保证停止后状态可收敛。
- 测试更新：`pilot-tool-gateway.test.ts` 将高风险 websearch 场景改为“不中断审批，直接 completed”。

### fix(pilot-admin-channels): 单渠道启用/禁用状态可正确持久化

- `apps/pilot/server/utils/pilot-admin-channel-config.ts`：
  - 修复布尔归一化链路：`normalizeText(false)` 不再被吞空，`enabled=false` 可正确落库并回读。
  - 同步修复渠道模型布尔字段（`models[].enabled/thinkingSupported/thinkingDefaultEnabled`）的持久化正确性。
- 新增测试：`apps/pilot/server/utils/__tests__/pilot-admin-channel-config.test.ts`
  - 覆盖 `channel.enabled=false` 与 `models[].enabled=false` 的保存与回读回归场景。

### fix(pilot-websearch): 终态事件收口 + fallback unavailable 可解释化 + 无来源防编造

- `apps/pilot/server/api/chat/sessions/[sessionId]/stream.post.ts`：
  - `websearch.decision` 保持判定语义；`enabled=false` 时立即发 `websearch.skipped`。
  - 审批中断（`approval_required/rejected`）与工具异常路径统一先发 `websearch.skipped` 作为终态。
  - `done/error` 前增加 `terminal_finalize` 兜底：若仍停留 decision 态，补发 `websearch.skipped`，避免前端“一直执行中”。
  - 当本轮无来源且意图要求联网时，向运行时消息注入 `No External Sources Retrieved` guard，约束模型显式说明“未获取外部来源”，禁止编造“最新/新闻”事实。
- `apps/pilot/server/api/aigc/executor.post.ts`：
  - `run.audit` 流同步收口 `websearch.skipped` 终态（decision=false、审批分支、异常分支、terminal finalize）。
  - `run.audit` 工具审计转发补齐 `providerChain/providerUsed/fallbackUsed/dedupeCount`，便于 unavailable 根因定位。
  - 执行消息同样接入“无来源 guard”注入策略（仅在 `websearchRequired=true` 且 `sourceCount=0` 时触发）。
- `apps/pilot/server/utils/pilot-tool-gateway.ts`：
  - fallback unavailable reason 语义规范化：`provider_pool_empty`、`fallback_unsupported_channel`、`fallback_endpoint_missing`、`fallback_execution_failed`。
  - 维持兼容错误码（含 `WEBSEARCH_DATASOURCE_UNAVAILABLE`），同时确保失败审计可解释“为何 unavailable”。
- `apps/pilot/app/composables/usePilotChatPage.ts`：
  - websearch 阶段卡状态调整：`executed => done`、`skipped => skipped`，`decided` 不再长期映射 running。
  - `done/error` 本地兜底：若仍在 decision 态，自动转 `skipped(terminal_finalize)`，防止服务端漏发导致 UI 卡住。
  - 新一轮消息发送前清空 `toolCallMap/toolCalls`，工具卡仅显示当前轮次，消除上一轮残留。
- 测试补齐：`apps/pilot/server/utils/__tests__/pilot-tool-gateway.test.ts` 新增 fallback reason 分类与 no-source guard 用例。

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

### fix(pilot-chat): Markdown 只读渲染去除尾部空行

- 在 `apps/pilot/app/components/render/RenderContent.vue` 新增只读渲染范围样式：`.RenderContent .MilkContent.markdown-body .ProseMirror[contenteditable="false"]`。
- 处理规则：
  - 隐藏末尾空段落（覆盖 `p:last-child:empty` 与 `p:last-child:has(> br.ProseMirror-trailingBreak)`）。
  - 强制最后可见块元素 `margin-bottom: 0`，消除聊天消息尾部多余空白行。
- 兼容性兜底：在不支持 `:has` 的环境下，通过运行时 class（`ProseMirror--TailEmpty`）保持同等效果；不改动原始 Markdown 文本与存储语义。

### chore(governance): 文档门禁恢复可用（日期口径 + TODO 统计）

- 六主文档 `更新时间` 统一到 `2026-03-22`（`INDEX/README/TODO/Roadmap/Release Checklist/Quality Baseline`）。
- `TODO` 统计表改为实时计数结果（`done=95 / todo=16 / total=111 / 86%`），修复 `todo-stats` 漂移。
- 验证结果：`pnpm docs:guard && pnpm docs:guard:strict` 全通过。

### chore(governance): compat 扫描范围补齐 `apps/pilot/shared`

- `scripts/check-compatibility-debt-registry.mjs` 扫描范围新增 `apps/pilot/shared`，修复 scope leak。
- 补齐新增 `legacy-keyword` 命中项到 `compatibility-debt-registry.csv`，恢复 registry 覆盖完整性。
- 验证结果：`pnpm compat:registry:guard` 通过（保留 cleanup candidate 警告）。

### fix(governance): legacy transport import 多行检测漏检修复

- `scripts/check-legacy-boundaries.mjs` 与 `scripts/check-compatibility-debt-registry.mjs` 的 `legacy-transport-import` / `legacy-permission-import` 正则支持多行 `import`，避免 `import { ... } from '.../legacy'` 被漏检。
- 补齐 `packages/utils/plugin/channel.ts` 在 `legacy-transport-import` 维度的门禁基线与台账登记（allowlist + compatibility registry）。
- 目标：确保 `legacy` 门禁统计真实反映源码状态，避免“0 命中”假阴性。

### chore(governance): size guard 阻断恢复（基线同步）

- 更新 `scripts/large-file-boundary-allowlist.json`：
  - 新增本轮超长文件基线：`ThInput.vue`、`completion/index.ts`、`usePilotChatPage.ts`、`stream.post.ts`、`pilot-tool-gateway.ts`。
  - 调整 growth exception cap：
    - `SIZE-GROWTH-2026-03-16-AIGC-EXECUTOR` (`apps/pilot/server/api/aigc/executor.post.ts`) -> `2429`
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

### fix(pilot-websearch): 非 Responses 渠道不再触发 `responses_builtin` 硬失败

- `pilot-tool-gateway` 增加 fallback 资格判断：仅当渠道为 `openai + responses` 且可解析 Responses endpoint 时，才尝试 `responses_builtin`。
- 调整 fallback 容错：当 provider 池已有部分结果时，即使 fallback 请求异常，也不会中断整次 websearch，继续返回已命中的 provider 结果。
- 新增回归测试 `pilot-tool-gateway.test.ts`：
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

### fix(pilot-routing-admin): 渠道模型同步不再自动创建/更新 Model Groups（仅保留手动编排）

- 调整 `syncPilotChannelModels`：同步流程仅更新渠道侧 `channels[].models/defaultModelId/modelsLastSyncedAt`，不再把 discovered 模型写入 routing `modelCatalog`。
- 移除同步链路中的自动合并调用，避免在“模型组管理”中出现“未手动创建却被同步生成”的分组项。
- 新增回归测试 `pilot-channel-model-sync.test.ts`，确保 `admin/channel-models/sync` 不会触发 `mergeDiscoveredModelsIntoCatalog`。

### feat(pilot-routing-admin-ui): Model Groups 支持多选批量删除与分页

- `admin/system/model-groups` 新增表格勾选列，支持多选批量删除（含二次确认与“至少保留一个模型组”约束）。
- 新增分页器（`total/sizes/pager/jumper`），支持页大小切换（10/20/50/100）。
- 新增跨分页选中同步逻辑：翻页后保留已选项，保存/删除后自动清理无效选中并回收越界页码。
- `quota-auto` 设为系统保留模型组：行内删除禁用，批量删除自动排除，确保该分组始终可用。
- 后端 `normalizeModelCatalog` 调整为“仅强制保留 `quota-auto`”，不再自动补回 `gpt/gemini/claudecode` 等 system 默认分组；新增回归测试覆盖该行为。

### fix(pilot-image): image.generate 兼容“url 字段携带 base64”并修复 Capability Lab 预览

- `pilot-tool-gateway` 的 `image.generate` 结果解析增强：
  - 当上游把图片数据放在 `url` 字段（`data:image/...` 或 raw base64）时，自动识别并落 `runtime media cache`，继续对外返回 URL-first 结果；
  - 保留原有 `b64_json` 解析路径，并补充 base64 payload 规范化，减少异常格式导致的空结果。
- `apps/pilot/app/pages/test/image-lab.vue` 增加图片预览兜底：
  - 优先 `url` 预览，缺失时回落到 `base64` 组装 `data:image/...` 预览；
  - 避免“结果存在但页面不显示”的误判。
- 新增回归测试 `pilot-tool-gateway.test.ts`：覆盖“`url` 字段为 base64 payload”场景，确保输出被归一到 runtime cache URL。

### feat(pilot-multimodal): Provider 多模态能力配置统一到 `capabilities` 并打通媒体运行时回退

- 模型组配置升级为统一能力映射：
  - `PilotModelCatalogItem` 新增 `capabilities`（`websearch/file.analyze/image.generate/image.edit/audio.tts/audio.stt/audio.transcribe/video.generate`）。
  - 保留并兼容 legacy 字段（`allowWebsearch/allowImageGeneration/allowFileAnalysis/allowImageAnalysis`），读取时自动合并回填，写回时同步双轨字段。
  - 旧配置自动“仅补缺不覆盖”补齐缺失能力位，不改用户已有绑定/优先级/路由策略。
- 路由解析新增能力门控与排除重试：
  - `resolvePilotRoutingSelection` 新增 `requiredCapability` 与 `excludeRouteKeys`；
  - 当能力不匹配时自动过滤候选；无可用候选时返回统一错误码 `PILOT_CAPABILITY_UNSUPPORTED`。
- 媒体调用链路新增自动回退：
  - 新增 `executePilotMediaWithFallback`，对媒体能力执行“失败/unsupported 后按 routeKey 回退到下一 provider”；
  - `chat stream` 与 `aigc executor` 的 `image_generate` 分支接入该回退链路。
- Tool Gateway 新增多模态 REST 能力：
  - 新增 `image.edit`、`audio.tts`、`audio.stt`、`audio.transcribe`；
  - `video.generate` 返回明确未实现错误 `PILOT_MEDIA_VIDEO_NOT_IMPLEMENTED`。
- 媒体输出统一为 URL-first：
  - 新增运行时媒体缓存与 `GET /api/runtime/media-cache/:id`；
  - 图片/音频二进制默认落缓存 URL 返回；
  - 支持 `output.includeBase64` 可选返回 `base64`（默认关闭）。
- 能力测试入口升级：
  - 新增 `POST /api/runtime/capability-test/invoke`，统一测试 `image.generate/image.edit/audio.tts/audio.stt/audio.transcribe/video.generate`；
  - `apps/pilot/app/pages/test/image-lab.vue` 升级为 capability lab，展示路由结果、回退尝试链路与媒体结果。
- 测试补齐：
  - 新增 `pilot-admin-routing-config.capabilities.test.ts`；
  - 扩展 `pilot-routing-resolver.intent.test.ts`（能力门控、排除已失败 route）；
  - 扩展 `pilot-tool-gateway.test.ts`（image.edit/audio.tts/audio.stt/audio.transcribe/video 未实现）。

### feat(pilot-routing-admin-ui): 模型组能力开关重构为“模板化 + 分层配置 + 规则联动”

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
  - 新增 `apps/pilot/shared/pilot-capability-meta.ts`，统一维护 `PilotCapabilityMeta`、能力分组、模板预设、legacy 回填、route combo 校验；
  - 管理端、服务端与运行时消费同一份 capability 解析与联动规则。
- 运行时对齐：
  - `usePilotRuntimeModels` 与 `ThInput` 改为基于统一能力映射判断禁用状态与提示文案；
  - `capabilities` 成为主语义源，`allow*` 保持兼容派生写回。
- 回归测试：
  - 新增 `pilot-capability-meta.shared.test.ts`（模板矩阵、thinking/websearch 联动、legacy 优先级、route combo 校验）；
  - 更新 `pilot-admin-routing-config.capabilities.test.ts` 对齐显式 `capabilities` 优先断言。

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

### feat(pilot-websearch): 全局 Provider 池聚合配置落地（SearXNG/Serper/Tavily + builtin 兜底）

- `datasource.websearch` 升级为“纯全局池”结构：
  - 新增 `providers[]`（`id/type/enabled/priority/baseUrl/apiKeyEncrypted/timeoutMs/maxResults`）；
  - 新增 `aggregation`（`mode/targetResults/minPerProvider/dedupeKey/stopWhenEnough`）；
  - 新增 `crawl`（`enabled/timeoutMs/maxContentChars`）。
- 保留 legacy 字段兼容映射：
  - 当新 `providers` 为空时，自动把 `gatewayBaseUrl/apiKeyRef` 映射为 `legacy-gateway` 单 provider；
  - 新结构写回后清空 legacy 字段扩展入口，仅保留读取兼容。
- `pilot-tool-gateway` 执行链路切换为 provider 聚合：
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
  - 新增 `pilot-admin-datasource-config.test.ts`（legacy 映射、加密/脱敏、key 保持与清空）；
  - 更新 `pilot-tool-gateway.test.ts` 适配 provider 池聚合与 fallback 分支；
  - 保留 `pilot-websearch-connector.test.ts` 去重与 allowlist 回归。

### feat(pilot-image-lab): 新增 LangChain 兼容图像直连测试页与 Runtime API

- 新增页面 `apps/pilot/app/pages/test/image-lab.vue`：
  - 提供 `Base URL / API Key / Model / Prompt / size / count / timeoutMs` 手动输入；
  - 支持“拉取模型 + 生成图像 + 清空结果”流程；
  - 展示图片预览、`revisedPrompt`、`callId`、耗时与错误信息；
  - `apiKey` 仅保存在页面内存态，不写入 URL 和本地持久化。
- 新增 runtime 接口（登录可用）：
  - `POST /api/runtime/image-test/models`：按手填 `baseUrl/apiKey` 拉取可用模型列表；
  - `POST /api/runtime/image-test/generate`：按手填配置直接触发图像生成并返回图片结果。
- 后端能力复用与扩展：
  - 复用 `discoverPilotChannelModels` 实现模型发现；
  - 复用 `executePilotImageGenerateTool` 实现图像生成，并扩展支持 `size/count`（默认 `1024x1024`、`1`）。
- 测试覆盖新增：
  - `pilot-tool-gateway` 增加 `size/count` 默认与透传用例、空结果失败用例；
  - 新增 runtime image-test API handler 单测，覆盖参数校验与上游错误映射。

### fix(pilot-routing): Route Combo 跳过已关闭模型，避免继续命中无效 providerModel

- `apps/pilot/server/utils/pilot-routing-resolver.ts`：
  - 新增渠道模型可用性校验，Route Combo / 模型绑定 / 候选池筛选阶段统一跳过“渠道内已禁用或不存在”的 `providerModel`；
  - fallback 选模策略增强：优先回退到渠道内启用模型，避免落到已关闭模型导致 400（`Model does not exist`）持续报错。
- `apps/pilot/server/utils/__tests__/pilot-routing-resolver.intent.test.ts`：
  - 新增回归用例：当 Route Combo 同时包含已关闭模型与可用模型时，验证路由会自动忽略已关闭模型并选择可用模型。

### feat(pilot-routing-admin): 渠道模型批量管理 + 模型优先级 + 内置工具迁移到模型组

- `apps/pilot/app/pages/admin/system/channels.vue`：
  - 渠道模型列表新增「一键清空 / 全部启用 / 全部禁用」；
  - 渠道模型新增 `priority` 字段并参与保存。
- `apps/pilot/server/utils/pilot-admin-channel-config.ts` / `pilot-channel-model-sync.ts`：
  - 渠道模型配置支持 `priority` 归一化与同步默认值（默认 `100`）。
- `apps/pilot/app/pages/admin/system/model-groups.vue` / `app/composables/usePilotRoutingAdmin.ts`：
  - 模型组新增 `builtinTools` 配置入口，并写入 routing 配置。
- `apps/pilot/server/utils/pilot-routing-resolver.ts`：
  - 内置工具优先读取模型组配置；若模型组未配置则兼容回退到渠道配置；
  - `quota-auto` 选择时支持渠道模型 `priority` 参与排序。

### fix(pilot-markdown): MilkContent 只读代码块移除高度上限与顶部偏移

- `MilkContent` 的 `createReadonlyCodeBlockView` 移除 `--editor-code-content-max-height` 注入，代码块视图不再受 `max-height` 变量限制。
- `style.scss` 中 `EditorCode-Content` 与 `EditorCode-InlinePreview` 去除 `max-height`，保持内容自然撑开；保留横向/纵向溢出滚动能力。
- `EditorCode--Sticky` 的 `HeaderHost` 统一改为 `top: 0`，不再使用 `84px` 顶部偏移变量。

### fix(pilot-markdown-ui): 修复只读代码块右侧复制按钮可见性

- `RenderCodeHeader` 的复制按钮从“仅图标”调整为“图标 + 文案（复制/已复制）”，避免图标字体未命中时出现按钮空白。
- 同步微调复制按钮尺寸与间距（`min-width/gap`），保证代码头右侧操作区在浅色主题下稳定可辨识。

### fix(pilot-runtime-ui): 运行事件最小化前台展示 + 审批协议统一

- `POST /api/chat/sessions/:sessionId/stream` 与 `POST /api/aigc/executor` 的高风险 websearch 审批分支统一从 `error` 语义切换为 `turn.approval_required`，并以 `done(status=waiting_approval)` 收束，不再误判为失败轮次。
- 意图解析链路合并记忆沉淀决策：`intent.completed` 新增 `memoryDecision(shouldStore/reason)`，轮次结束按该决策触发事实抽取与写入，不再以消息条数变化误判“已沉淀”。
- 新增 `pilot_chat_memory_facts` 事实存储与去重写入；`memory.updated` 改为沉淀语义（`addedCount/stored/reason` 为主，`historyBefore/historyAfter` 仅兼容），前端仅在 `stored=true` 时展示“已沉淀记忆/已沉淀 X 条记忆”，并移除记忆卡调试字段展示。
- `PilotRunEventCard` 改为默认收起（失败态默认展开），新增“详情/收起”交互；联网卡片仅在 `websearch.executed && sourceCount>0` 显示。
- 修复只读代码块 header 双重 sticky：保留 `HeaderHost` sticky，取消内层 header sticky，并在聊天只读渲染链路默认关闭 sticky header。

### fix(pilot-markdown-compat): 旧聊天页 Markdown 原样显示兼容修复

- 旧聊天页 `ChatItem` 对 assistant 的 `text` block 增加兼容渲染：改走 `RenderContent`（Markdown），user 侧 `text` 仍保持 `<pre>` 文本展示，避免语义回归。
- `@talex-touch/tuff-intelligence/pilot-conversation` 新增 `normalizeLooseMarkdownForRender`，统一做轻量渲染归一化：`CRLF -> LF`，并修复智能引号包裹 fence（如 “`cpp 与 `” 这类分隔符写法）。
- `ThContent -> MilkContent` 接入该归一化函数，减少非标准 fence 导致的代码块降级为纯文本问题。
- 会话快照序列化前向修复：assistant 纯字符串块默认映射为 `markdown`（user/system 保持 `text`），阻止新快照继续产出旧形态。

## 2026-03-19

### feat(pilot-strict): Pilot 严格模式禁降级 + 顶部 PILOT 标识 + 提示词升级

- `executor` 与 `chat stream` 双链路新增严格模式拦截：`pilotMode=true` 且 LangGraph 不可用时直接返回结构化错误 `PILOT_STRICT_MODE_UNAVAILABLE`，不再回退 `deepagent`。
- `createPilotRuntime` 新增严格控制参数（`strictPilotMode/allowDeepAgentFallback`），严格模式下关闭 `PilotFallbackEngineAdapter`，LangGraph 运行失败直接透传失败。
- 新增 `pilot-system-prompt` Builder，运行时系统提示词升级为 ThisAi 模板，并注入 `name/ip/ua`（不可得时安全降级）。
- `index.vue` 顶部 header 与状态栏新增显式 `PILOT` 模式标签，普通模式显示“普通模式”，提升模式可感知差异。
- `executor/stream` 统一补齐记忆与联网审计：新增 `memory.context`、`websearch.decision`（含触发/未触发原因）等审计事件，并将 `memoryEnabled`、历史条数与 websearch connector 来源透传到 runtime metadata / routing metrics。

### feat(pilot-websearch): datasource 缺失时新增 Responses 内置检索 fallback

- `pilot-tool-gateway` 新增 websearch 后备路径：当 datasource gateway 未配置时，优先使用 OpenAI Responses 内置 websearch 工具执行检索。
- 工具审计 payload 新增 `connectorSource/connectorReason`，可区分 `gateway`、`responses_builtin` 与不可用原因（不再静默无感）。
- websearch 工具非审批类失败改为返回 `null + tool.call.failed` 审计，不中断主对话链路；审批 required/rejected 仍保持阻塞失败。
- 新增单测覆盖：strict runtime 行为、prompt builder 插值、websearch fallback 与失败可观测分支。

### feat(pilot-ui): 旧 UI 硬切换到会话级事件卡片流（无全局运行态）

- 保留 `ThChat/ThInput/History` 旧界面骨架，移除运行态全局条作为状态主承载；运行态改为会话消息内卡片长期留存。
- `completion/index.ts` 事件消费改为新事件族单通道：统一解析 `event || type`，主流程仅消费 `intent.* / routing.selected / memory.context / websearch.* / thinking.* / assistant.* / run.audit / error / done`。
- 新增 `pilot_run_event_card` 渲染组件并接入 `ChatItem`；支持 `intent/routing/memory/websearch/thinking` 卡片 upsert、流式增量（thinking）与会话隔离（`sessionId+turnId` 作用域）。
- Legacy 事件（`turn.* / status_updated / completion / verbose / session_bound`）前端不再驱动状态，仅做一次性告警忽略。
- 管理端渠道配置硬切：`adapter` 固定 `openai`，不再提供 `legacy` 选项；`transport` 仅保留 `responses/chat.completions`。

### fix(pilot-markdown): 修复 Mermaid Mindmap 在 Milkdown 只读渲染链路失效

- 根因修复：`mermaid mindmap` 动态依赖 `cytoscape-cose-bilkent` 时触发 CJS/ESM 默认导出不兼容，导致预览渲染失败。
- 新增前端构建 shim：`cytoscape-cose-bilkent`、`cytoscape-fcose` 统一导出稳定 `default`，并在 `nuxt.config.ts` 中接入 alias。
- 保持 `MilkContent` 渲染交互不变，仅在 dev 环境补充 Mermaid 渲染失败错误码日志（如 `E_MERMAID_ESM_EXPORT`）便于定位。

### refactor(pilot-markdown): 复用图渲染内核 + 代码头双层 Sticky

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

### feat(pilot-chat): 记忆开关迁移个人设置 + 模型列表收敛后端配置 + Pilot 入口并入 `+`

- 记忆系统开关从主聊天输入面板迁移到「个人设置 -> 外观」，支持一键开关；关闭时自动执行 `memory/clear(scope=all)` 并同步写入 `memory/settings`。
- 主聊天输入区 `ThInputPlus` 移除“记忆系统”，新增“Pilot 模式”开关，作为会话与发送 meta 的统一入口（放入 `+` 面板）。
- 运行时模型前端列表改为“仅后端配置可见 + 默认 Auto 项”：
  - 去除前端 GPT/Gemini/Claude 硬编码 fallback；
  - API 失败或空配置时仅保留 `Auto(quota-auto)`，避免展示未在后端配置的模型。

### refactor(pilot-input): 合并“分析图片/分析文件”为单一“分析文件”入口

- 输入区 `ThInputPlus` 移除独立“分析图片”入口，统一为一个“分析文件”按钮（支持图片 + 文档）。
- `ThInput` 侧统一附件能力判定为 `allowFileAnalysis`，粘贴/上传/文件选择不再区分 image/file 双开关。
- 运行时模型能力兼容：`allowFileAnalysis` 优先，缺省回退历史 `allowImageAnalysis`；对外返回保持两字段同值，避免旧客户端语义分叉。

### fix(pilot-input): 优化输入面板高度并补齐记忆系统快捷开关

- `ThInputPlus` 去除固定 `320px` 高度，改为按内容自适应，避免在“分析文件”合并后出现大面积空白。
- 在输入面板新增“记忆系统”开关项，复用现有 `v1/chat/memory/settings` 能力切换当前会话记忆状态。
- `ThInput` / `pages/index.vue` 打通记忆开关状态与禁用提示，策略或提交中状态下保持只读并给出明确提示。

### fix(pilot-input): 修复 Legacy UI 中 Pilot 开关关闭后仍透传 `pilotMode=true`

- 修复 `pages/index.vue` 中发送元数据合并逻辑：`pilotMode` 改为“显式输入优先，未提供时回退会话状态”，不再使用 `OR` 强制吸附历史会话值。
- 结果：当用户在 `ThInputPlus` 中关闭 `Pilot 模式` 后，本轮请求可正确透传 `pilotMode=false`；仅在未显式设置时沿用会话级默认。
- 聊天页顶部与底部模式标签改为会话联动展示：`pilotMode=true` 显示 `PILOT`，关闭后显示 `普通模式`，避免静态 `PILOT` 误导。

### fix(pilot-chat): turns 失败响应脱敏（隐藏连接端点与本地路径）

- `POST /api/v1/chat/sessions/:sessionId/turns` 增加统一异常兜底：数据库/网络异常不再把底层错误对象直接冒泡到前端。
- 新增服务端错误脱敏工具（`server/utils/pilot-http.ts`）：对 `IP:PORT`、域名端口、绝对本机路径执行遮罩处理。
- 对瞬时连接类错误（如 `ETIMEDOUT/ECONNREFUSED`）返回统一可读文案与稳定状态码（`503`），降低前端日志泄露内部拓扑风险。
- 前端 `completion` 错误文案解析增加二次脱敏，确保即使上游异常信息带敏感连接串，也不会直接展示给用户。

### fix(pilot-sync): chat sessions 流式链路回灌 quota 历史快照

- `POST /api/chat/sessions/:sessionId/stream` 在流结束阶段新增“兼容快照回灌”：从 runtime 会话实时读取 `messages + title`，统一写入 `pilot_quota_history`，避免旧 `syncHistory` 拉到陈旧快照后覆盖本地会话。
- 同步维护 `pilot_quota_sessions` 映射（`chat_id = runtime_session_id`），保证旧会话入口与新 runtime 会话保持一致可追踪。
- 回灌链路采用 best-effort（失败仅 `warn`，不阻断主流式响应），优先保障对话主链路稳定。

### fix(pilot-sync-ui): 旧聊天页发送完成后停用 legacy 会话拉取覆盖

- `apps/pilot/app/pages/index.vue` 移除发送完成阶段对 `syncHistory()` 的依赖，不再请求 `GET /api/aigc/conversation/:id` 回填当前会话。
- 会话同步状态改为本地收敛：发送开始置 `pending`，请求完成按最终状态置 `success/failed`，并仅更新本地 `history list` 快照，避免空 `messages` 响应覆盖本地上下文。
- `REQUEST_SAVE_CURRENT_CONVERSATION`（含 `Ctrl+S` 与状态栏同步按钮）改为本地快照保存，不再触发 legacy 会话详情接口。

### fix(pilot-approval-ui): 补齐工具审批入口并移除审批超时失败分支

- 旧聊天页 `pilot_tool_card` 新增内联“批准/拒绝”按钮：当 `status=approval_required` 且存在 `ticketId/sessionId` 时，可直接调用 `POST /api/v1/chat/sessions/:sessionId/tool-approvals/:ticketId` 完成审批。
- 工具卡 payload 补充 `sessionId`，避免 UI 端审批动作缺少上下文导致无法提交。
- 审批链路改为“前端显式决策 + 单次事件续跑”：去除前端轮询审批状态，不再生成“审批等待超时（>Ns）”错误卡。
- 前端审批成功后通过 `pilot-tool-approval-decision` 事件回传当前会话，触发流式链路 resume；拒绝时直接落工具拒绝态并结束当前轮次。
- 对 `event=error` 且 `code=TOOL_APPROVAL_REQUIRED` 的流事件改为“等待审批态”处理，不再额外渲染错误卡干扰审批流程。

## 2026-03-18

### fix(pilot-build): 拆分前端安全子入口，修复 `AsyncLocalStorage` 运行时异常

- 新增 `@talex-touch/tuff-intelligence/pilot-conversation` 子入口（`packages/tuff-intelligence/src/pilot-conversation.ts`），仅导出 `serializePilotExecutorMessages`，避免前端链路误引入 `deepagents/langgraph` 的 Node-only 依赖。
- `apps/pilot/app/composables/api/base/v1/aigc/completion/index.ts` 改为从 `pilot-conversation` 引用序列化能力，不再通过 `@talex-touch/tuff-intelligence/pilot` 聚合入口取值。
- 结果：消除浏览器打包链路对 `node:async_hooks` 的依赖，修复 `import_node_async_hooks.AsyncLocalStorage is not a constructor` 导致的 500 问题。

### fix(pilot-executor): 渠道路由失败错误透传到前端可见

- `apps/pilot/server/api/aigc/executor.post.ts` 在渠道选择失败分支补齐并下发结构化错误信息：`code/reason/request_id/status_code/detail`，并附带 `model_id/provider_model/route_combo_id/selection_reason/selection_source` 等诊断字段。
- `apps/pilot/app/composables/api/base/v1/aigc/completion/index.ts` 保留 SSE `error` 事件中的结构化字段，错误 block 写入 `extra`（`requestId/statusCode/code/reason/detail`），不再只保留 message。
- `apps/pilot/app/components/chat/attachments/ErrorCard.vue` 优先读取结构化 `extra`，补充展示诊断摘要与路由上下文，并稳定展示可复制的 `requestId`，便于用户感知与问题定位。

### fix(pilot-intelligence): 前后端会话结构统一 + websearch 按意图触发

- 新增 `packages/tuff-intelligence/src/business/pilot/conversation.ts` 共享 util，并在前后端同时接入：
  - `serializePilotExecutorMessages`：统一会话消息序列化，保留 `card/tool` 等非 markdown block（即使 `value` 为空也不丢失）。
  - `buildPilotConversationSnapshot`：统一会话快照构建，避免后端将历史消息退化为纯 markdown 文本导致 toolcall/tool card 信息丢失。
  - `extractLatestPilotUserTurn` / `buildPilotTitleMessages`：统一最新用户轮提取与标题消息抽取规则。
- `legacy executor` websearch 触发策略收敛：
  - 新增 `shouldExecutePilotWebsearch` 判定，websearch 不再“联网开关开启即调用”；
  - 优先使用意图分类结果（`websearchRequired`），仅在意图要求时触发；
  - 意图缺失时走启发式兜底（如“最新/实时/查一下/today/latest”等时效检索场景）。
- `pilot-intent-resolver` 输出新增 `websearchRequired/websearchReason`，并在 `executor` 侧落地判定与观测字段（`websearchDecision`）。
- 新增回归测试：`apps/pilot/server/utils/__tests__/pilot-conversation-shared.test.ts`，覆盖 block 保留、快照结构、标题抽取与 websearch 判定逻辑。
- 新增稳定子入口 `@talex-touch/tuff-intelligence/pilot`（`src/pilot.ts` + package exports），Pilot 前后端调用从深路径/根聚合出口收敛到领域子入口，降低路径耦合与误引入风险。
- 补齐 `pilot` 子入口导出清单（含 runtime/store/protocol/adapters 的 Pilot 侧必需符号），并将 `apps/pilot` 中原 `@talex-touch/tuff-intelligence` 根出口引用全部迁移到 `@talex-touch/tuff-intelligence/pilot`。

### feat(pilot-graph): 新建会话可选 Pilot 模式（Graph 优先，DeepAgent 回退）

- 前端主聊天页（`/`）新建会话新增模式选择：
  - 可选择“启用 Pilot 模式（Graph 优先）”或“普通模式”；
  - 会话级持久化字段新增 `pilotMode`，并在聊天头部展示当前会话模式标签。
- v1 链路透传补齐：
  - `POST /api/v1/chat/sessions/:sessionId/turns` 入队 payload 新增 `pilotMode`；
  - `POST /api/v1/chat/sessions/:sessionId/stream` 代理 executor 时透传 `pilotMode`。
- 执行器编排决策增强：
  - `executor` 在 `pilotMode=true` 时向 orchestrator 传入 `preferLangGraph=true`；
  - orchestrator 会优先选择可用且绑定 `langgraphAssistantId` 的 route combo；
  - 若本地 Graph 服务不可用或无可用 Graph combo，保持自动回退 `deepagent`，不影响现有稳定性。

### feat(pilot-tools): 通用工具调用提示 + AI 数据源抓取（V1 双线并行）

- 新增 `PilotToolGateway` 与 `websearch` connector 抽象（`search/fetch/extract`），并接入可配置网关主路径。
- 新增 `datasource.websearch` 配置（`gatewayBaseUrl/apiKeyRef/allowlistDomains/timeoutMs/maxResults/crawlEnabled/ttlMinutes`）并纳入 Admin settings 聚合读写。
- 新增工具审批票据存储与 API：
  - `GET /api/v1/chat/sessions/:sessionId/tool-approvals?status=pending`
  - `POST /api/v1/chat/sessions/:sessionId/tool-approvals/:ticketId`
- 工具生命周期统一输出 `run.audit`（`tool.call.started/approval_required/approved/rejected/completed/failed`），payload 固定字段对齐 `callId/toolId/toolName/riskLevel/status/inputPreview/outputPreview/durationMs/ticketId/sources/errorCode/errorMessage`。
- `legacy executor` 与 `v1 chat stream` 打通工具事件透传：已清理 `status_updated(calling/result)` 的工具兼容映射，统一以 `run.audit` 作为工具卡片唯一事件源，并对高风险场景启用阻塞式审批。
- 前端补齐统一解析：
  - Tool 卡片统一由 `run.audit` 驱动（不再消费 legacy `status_updated(calling/result)` 生成工具卡）；
  - 增加 `PilotToolCard` 渲染组件，展示工具状态、输入/输出预览、来源链接、审批 ticket 信息。

### feat(pilot-approval): 审批通过自动续跑 + Legacy 工具事件 Phase 2 收口

- 旧聊天页 `$completion` 增加审批自动续跑：
  - 收到 `turn.approval_required` 后自动轮询 `GET /api/v1/chat/sessions/:sessionId/tool-approvals`；
  - 票据 `approved` 后复用原 `request_id` 自动恢复 `stream` 执行；
  - 票据 `rejected` 或轮询超时时，统一写入 Tool 卡片失败态并落错误消息。
- 新增运行时公共配置（含回滚开关）：
  - `pilotToolApprovalAutoResume`（默认 `true`）
  - `pilotToolApprovalPollIntervalMs`（默认 `1500`）
  - `pilotToolApprovalPollTimeoutMs`（默认 `600000`）
  - `pilotEnableLegacyExecutorEventCompat`（默认 `false`）
- 补充审批自动续跑回归测试：
  - 新增 completion flow 单测，覆盖 `request_id` 复用（跳过 turn 创建）与审批 `approved/rejected/timeout` 三条分支状态映射。
- Legacy Phase 2（工具提示相关）：
  - `$completion` 默认关闭 legacy `completion/verbose/status_updated(tool)` 兼容分支；
  - 主链路统一为 `turn.* + run.audit`；
  - 通过 `NUXT_PUBLIC_PILOT_ENABLE_LEGACY_EXECUTOR_EVENT_COMPAT=true` 可回滚兼容旧事件解析。

### feat(pilot-intent-image): Intent 图像路由 + image.generate 工具闭环（V1）

- 新增 `PilotIntentResolver`（混合策略）：
  - 显式命令优先：`/image`、`/img`；
  - 规则命中：中英文图像生成语义匹配；
  - nano 分类兜底：结构化 JSON 输出 `intent/confidence/reason/prompt`，失败默认回退 `chat`（fail-open）。
- 路由能力扩展：
  - `PilotRoutingPolicy` 新增 `intentNanoModelId/intentRouteComboId/imageGenerationModelId/imageRouteComboId`；
  - `PilotModelCatalogItem` 新增 `allowImageGeneration`；
  - `resolvePilotRoutingSelection` 新增 `intentType`（`chat | image_generate | intent_classification`）并按 intent 选择模型与 route combo。
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

### feat(pilot-ui): 主聊天 Markdown 流式增量渐变显示

- 仅在 Pilot 主聊天链路生效：`ThChat -> ChatItem -> RenderContent -> ThContent -> MilkContent`。
- `RenderContent` 新增可选属性 `streamingGradient`（默认关闭），仅在 `dotEnable=true` 且 markdown 内容持续增量时触发节流渐变 pulse。
- 新增独立 overlay 扫光动画，保留原有 `Generating-Dot` 光标行为，并在组件卸载时清理 pulse/dot 相关计时器。
- 增加 `prefers-reduced-motion` 自动降级：系统开启“减少动态效果”时不触发渐变 pulse。
- `ChatItem` 仅对 `block.type === 'markdown'` 主聊天渲染接入 `streaming-gradient`，不影响分享图、后台 Prompt 预览和其他产品线。

### fix(pilot-markdown): Milkdown 渲染兼容修复与版本核验

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

### feat(pilot): 增加会话记忆管理（用户开关 + 清空当前/全部）

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

### feat(pilot-admin): Channels 支持模型同步与按模型配置格式

- `Channels` 管理页新增“同步渠道模型”按钮，复用 `POST /api/admin/channel-models/sync`，同步后自动刷新渠道配置。
- 渠道模型配置新增 `format` 字段（每个模型独立），支持在管理页直接配置并持久化到数据库设置。
- 路由解析新增“模型级格式覆盖”能力：当模型 `format` 为 `responses/chat.completions` 时，优先覆盖渠道级 `transport`。
- 模型同步时为新发现模型回填默认 `format`（继承渠道当前 `transport`），避免新增模型缺省格式为空。
- `Channels` 新增按渠道拉取模型接口：`POST /api/admin/channel-models/discover`（支持编辑态复用已保存 API Key，新增态可用表单 API Key 直接拉取）。
- 渠道编辑 UI 从弹窗改为右侧 Drawer，模型列表支持更长内容；“拉取渠道模型”入口迁移到编辑面板内。
- 渠道列表中的模型展示改为“共计 x 个模型 + 编辑按钮”，避免首页表格被超长模型字符串撑开。
- 渠道列表模型区按钮文案调整为“总览”，并恢复操作区独立“编辑”入口，降低误解成本。
- 管理端移除“管理总览”入口：`AdminSideNav` 不再展示该菜单；`/admin/system/pilot-settings` 改为自动跳转到 `Channels`；Pilot 侧边栏管理入口同步指向 `Channels`。
- 管理页顶部右侧移除 `Legacy CMS 已进入退场阶段` 提示标签，替换为用户头像组件 `AccountAvatar`。
- `Channels` 列表支持直接操作：状态可在列表一键开关、新增删除渠道操作、新增优先级字段（列表与编辑态均可配置）。
- 渠道“设为默认”入口移除，后台改为按渠道优先级参与自动调度（同分时按渠道 ID 稳定排序）。

### feat(pilot-runtime): Runtime 模型改为仅返回 ModelGroup，并补齐 image/file 能力开关

- `GET /api/runtime/models` 不再直接透出渠道发现的全量 provider models，改为仅返回 `routing.modelCatalog` 中启用且可见的模型组（ModelGroup）。
- Runtime 模型响应新增能力字段：
  - `allowImageAnalysis`
  - `allowFileAnalysis`
- 管理端 `Model Groups` 编辑页新增上述两项能力开关，并在列表新增能力摘要列，便于核对组能力配置。
- 输入区能力与模型组配置对齐：
  - `ThInputPlus` 新增独立“分析文件”入口，并支持按模型组能力禁用 `thinking/websearch/image/file`；
  - `ThInput` 在上传、粘贴、发送前增加能力约束：不支持图片/文件时阻止附件进入，不支持 `thinking/websearch` 时发送前强制关闭对应开关。

### refactor(pilot-admin): 管理首页移除“我的应用/工作日历”并下线运势功能

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

### refactor(pilot-admin): 下线部门/指南/监控/微信管理并移除 Legacy CMS 路由

- 管理导航精简，移除以下入口：
  - 部门管理（`/admin/system/dept`）
  - 系统指南（`/admin/system/guide`）
  - 系统监控（`/admin/system/monitor`）
  - LiveChat（`/admin/wechat/livechat`）
  - 微信公众号菜单（`/admin/wechat/menu`）
- 管理首页继续裁剪：
  - 删除“系统监控”卡片（不再渲染 `monitor` 模块）。
- 页面路由已物理删除（直接 404）：
  - `apps/pilot/app/pages/admin/system/dept.vue`
  - `apps/pilot/app/pages/admin/system/guide.vue`
  - `apps/pilot/app/pages/admin/system/monitor.vue`
  - `apps/pilot/app/pages/admin/wechat/livechat.vue`
  - `apps/pilot/app/pages/admin/wechat/menu.vue`
- Legacy CMS 兼容层彻底移除：
  - 删除 `apps/pilot/app/pages/cms/index.vue`
  - 删除 `apps/pilot/app/pages/cms/[...path].vue`
- 同步清理配套残留：
  - `weChat.ts` 移除对已删除页面组件的错误导入；
  - `pilot-compat-seeds` 删除 `menu_system_dept` 种子，避免新环境继续回填该入口。

## 2026-03-17

### Docs：文档盘点与下一步路线执行锚点固化

- 新增统一执行文档：`docs/plan-prd/docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md`。
- 固化盘点统计口径：全仓 Markdown `396`、`docs` `146`、`docs/plan-prd` `110`，并记录子域分布。
- 六主文档补齐锚点同步：`INDEX/README/TODO/Roadmap/Quality Baseline/CHANGES` 全部指向同一执行口径。
- 锁定优先级保持：先 `Nexus 设备授权风控`，再推进文档 strict 化与 Wave A/B/C 并行治理。

### refactor(pilot): CMS Admin 化 + `/api/pilot/*` 路径硬切

- 页面路由完成迁移：`/admin/**` 成为管理主入口，`/cms/**` 降级为 Legacy 跳转层。
- 管理导航切换为静态分组导航（系统管理/内容运营/AIGC/App 管理），不再依赖 CMS 动态菜单作为主链路导航来源。
- `channels/storage` 统一为列表页 + 添加/编辑弹框，主入口：
  - `/admin/system/channels`
  - `/admin/system/storage`
- API 路径完成硬切（不保留 `/api/pilot/*` 兼容别名）：
  - `/api/pilot/admin/*` -> `/api/admin/*`
  - `/api/pilot/chat/*` -> `/api/chat/*`
  - `/api/pilot/runtime/*` -> `/api/runtime/*`
- Pilot 附件预览路径改为 `/api/chat/sessions/:sessionId/attachments/:attachmentId/content`，并同步更新对应测试断言。
- Nexus OAuth 统一路径：
  - `/api/pilot/oauth/authorize` -> `/api/oauth/authorize`
  - `/api/pilot/oauth/token` -> `/api/oauth/token`
  - Pilot 登录回调链路已同步切换到新 OAuth 路径。

### refactor(pilot-admin): App 管理按功能独立拆页

- 修复 Admin 左侧导航不可滚动问题：侧栏容器改为 `flex + overflow hidden`，菜单区单独 `el-scrollbar` 承担滚动。
- App 管理入口进一步拆分为独立页面：
  - `/admin/system/channels`
  - `/admin/system/storage`
  - `/admin/system/model-groups`
  - `/admin/system/route-combos`
  - `/admin/system/routing-policy`
  - `/admin/system/routing-metrics`
- `/admin/system/pilot-settings` 调整为“管理总览页”，仅保留分功能入口跳转，不再承载聚合编辑表单。
- `Channels` 管理增强为“每渠道多模型”：
  - 每渠道可配置模型列表、默认模型、模型启用状态（不再是单一模型字符串）；
  - 列表页展示“模型列表 + 启用模型列表”。
- `Model Groups` 独立页新增 icon 配置与分组维度字段（icon type/value、质量/速度/成本评分、渠道模型映射）。
- 系统管理导航精简：默认隐藏 `角色管理 / 菜单管理 / 字典项` 入口（页面文件保留，后续按退场窗口统一下线）。

### feat(pilot): Pilot 合并升级 V2（渠道负载均衡 + 模型目录 + 路由组合）

- 执行链路统一接入 `resolvePilotRoutingSelection`：
  - `POST /api/aigc/executor`
  - `POST /api/v1/chat/sessions/:sessionId/stream`
  - `POST /api/pilot/chat/sessions/:sessionId/stream`
- 请求参数扩展并兼容旧字段：
  - `modelId`（兼容旧 `model`）
  - `internet`
  - `thinking`
  - `routeComboId`
  - `queueWaitMs`
- 路由评比与负载均衡落地：
  - 新增 `pilot_routing_metrics` 指标落库；
  - 新增 `ChannelModelScorer`（成功率 + TTFT + 总耗时综合评分）；
  - `Quota Auto` 速度优先选路 + 小流量探索；
  - 新增熔断/恢复（失败阈值、冷却窗口、半开探测）。
- 模型与渠道能力：
  - 每渠道支持多模型列表与默认模型；
  - 新增渠道模型发现与同步（OpenAI-compatible `/v1/models`）；
  - 新增全局模型目录（名称/描述/icon/thinking/websearch/成本速度质量标记）；
  - 新增路由组合管理（候选渠道模型、优先级、权重、降级链）。
- 运行时与前端：
  - 新增 `GET /api/pilot/runtime/models`；
  - gptview（`/`）模型选择改为后端动态目录驱动；
  - 输入区新增 `thinking` 开关并与 `internet` 一起透传后端；
  - `/pilot` 改为兼容跳转到 `/`。
- LangGraph 编排联动第一阶段：
  - 新增 `pilot-langgraph-orchestrator` 可用性探测；
  - 路由组合绑定 `langgraphAssistantId/graphProfile` 时优先探测本地服务，不可用自动回退 deepagent。
- LangGraph 编排联动第二阶段：
  - 新增 `pilot-langgraph-engine`，`createPilotRuntime` 支持 `langgraph-local` 主引擎直连 `/runs/stream`；
  - 执行链路改为“LangGraph 主执行 + deepagent 自动回退（启动错误/空流）”，`executor` 与 `pilot chat stream` 双入口复用；
  - `pilot-settings` 后台升级为统一控制台：渠道多模型、模型目录（icon/thinking/websearch）、路由组合（含 LangGraph 绑定）、LB/Memory 策略、渠道模型同步与评比看板。
- 测试：
  - 新增 `pilot-route-health.test.ts`；
  - 新增 `pilot-channel-scorer.test.ts`；
  - `pnpm -C apps/pilot run test -- server/utils/__tests__/pilot-route-health.test.ts server/utils/__tests__/pilot-channel-scorer.test.ts` 通过。

### fix(pilot): 移除 CMS 第三方内容源板块，避免外部接口导致前台崩溃

- 移除 `apps/pilot/app/pages/cms/index.vue` 中对 `https://api.vvhan.com` 的 3 处请求：
  - `dailyEnglish`
  - `hotlist/woShiPm`
  - `visitor.info`
- 同步删除对应展示区块：
  - 访客信息提示
  - 推荐阅读（产品经理）
  - 今日精彩
- 目的：消除第三方接口抖动/断连触发的页面运行时异常（`Cannot read properties of undefined (reading 'location')`），确保 CMS 基础功能稳定可用。

### fix(pilot): 恢复 App 管理下 Channels/Storage 菜单入口（含存量数据补齐）

- 菜单种子新增 `App 管理` 目录与子项：
  - `Channels` -> `/cms/system/channels`
  - `Storage` -> `/cms/system/storage`
- 新增存量菜单补齐逻辑：`ensureSystemMenuSeed` 在已有数据库场景下会自动补缺失菜单 ID，不再依赖“空库一次性初始化”。
- `Channels` / `Storage` 页面改为“列表 + 添加/编辑弹框”交互：
  - `Channels` 支持列表浏览、添加渠道、编辑渠道、切换默认渠道
  - `Storage` 支持配置列表浏览、新增配置、编辑配置
- 新增页面文件：
  - `apps/pilot/app/pages/cms/system/channels.vue`
  - `apps/pilot/app/pages/cms/system/storage.vue`
- 两个页面统一复用 `/api/pilot/admin/settings` 读写设置，保持后端配置权威源一致。

### Docs：新增治理看板（Legacy / Compat / Size）

- 新增单页治理看板：`docs/plan-prd/docs/DEBT-GOVERNANCE-BOARD-2026-03-17.md`。
- 新增执行清单：`docs/plan-prd/docs/DEBT-GOVERNANCE-EXECUTION-CHECKLIST-2026-03-17.md`（owner/ticket/验收命令对齐）。
- 看板固定按 `domain / owner / ticket / expiresVersion` 汇总当前债务与增长豁免：
  - registry 总量 `120`（`legacy-keyword 79` / `compat-file 26` / `raw-channel-send 13` / `size-growth-exception 2`）；
  - 超长文件基线 `46`，增长豁免 `2`。
- 明确“只减不增”执行口径：新增债务必须先入清册，`growthExceptions` 变更必须同步 `CHANGES + registry`，默认清退门槛维持 `v2.5.0`。

### refactor(pilot): 首批 growth-exception 清退动作（1+2）

- `apps/pilot/app/composables/usePilotChatPage.ts` 抽离工具函数到 `app/composables/pilot-chat.utils.ts`，行数 `1366 -> 1175`（退出超长文件集合）。
- `apps/pilot/server/api/aigc/executor.post.ts` 抽离执行器工具到 `server/utils/pilot-executor-utils.ts`，行数 `1666 -> 1370`（仍在治理窗口，继续压降）。
- 清退 `SIZE-GROWTH-2026-03-16-PILOT-CHAT-PAGE`：
  - 从 `scripts/large-file-boundary-allowlist.json` 移除该文件 baseline + growth exception；
  - 从 `docs/plan-prd/docs/compatibility-debt-registry.csv` 移除对应 `size-growth-exception` 条目。

## 2026-03-16

### Docs：第三轮治理压缩收口（已完成）

- 主文档口径继续维持 `2026-03-16`；下一动作统一指向 `Nexus 设备授权风控`。
- 完成主入口压缩：`CHANGES/TODO/README/INDEX` 均压缩到目标行数。
- 完成长文档分层：Telemetry/Search/Transport/DivisionBox 原文下沉到 `*.deep-dive-2026-03.md`。
- 完成历史文档降权：Draft/实验文档补齐“状态/更新时间/适用范围/替代入口”头标。

### feat(pilot): 附件慢链路治理 + CMS 设置合并（稳定优先）

- 新旧链路统一附件投递：`provider file id > public https url > base64`（仅兜底时读取对象，不再无条件内联）。
- `apps/pilot/server/utils/pilot-attachment-delivery.ts` 接入 `pilot stream` 与 `aigc executor`，并发固定 `3`，失败错误码统一：
  - `ATTACHMENT_UNREACHABLE`
  - `ATTACHMENT_TOO_LARGE_FOR_INLINE`
  - `ATTACHMENT_LOAD_FAILED`
- `POST /api/pilot/chat/sessions/:sessionId/uploads` 新增 `multipart/form-data`（兼容保留 `contentBase64`）。
- 新增附件能力探测：`GET /api/pilot/chat/attachments/capability`，Pilot 与 legacy 输入框统一使用。
- 新增聚合后台设置 API：`GET/POST /api/pilot/admin/settings`；旧 `channels/storage-config` 接口保留兼容并转调。
- 新增 CMS 系统页：`/cms/system/pilot-settings`（Channels + Storage 同页编辑）；旧 `/pilot/admin/*` 页面增加迁移提示。
- 配置权威源保持 `pilot_admin_settings`，密钥字段脱敏返回；空值不覆写，需显式 clear 才会删除。

### fix(plugin-dev): watcher 止血 + CLI 依赖环切断

- `DevPluginWatcher` 改为“受控监听目标”：仅监听插件顶层关键文件（`manifest.json/index.js/preload.js/index.html/README.md`），不再递归监听整目录。
- chokidar 选项增强：`followSymlinks: false`、`depth: 1`、`ignorePermissionErrors: true`，并显式忽略 `node_modules/.git/.vite/dist/logs`，降低符号链接与深层目录导致的句柄风暴风险。
- watcher 增加 fatal 降级：命中 `EMFILE/ENOSPC/ENAMETOOLONG` 后记录高优先级日志并自动停用 dev watcher，避免日志雪崩与开发进程异常退出。
- `change` 回调增加全链路 `try/catch`，reload 失败只记录日志，不再向上冒泡成未处理异常。
- 切断 `@talex-touch/unplugin-export-plugin` 与 `@talex-touch/tuff-cli` 的双向 workspace 依赖：移除前者对后者的直接依赖，打断 `node_modules` 递归链。
- 旧 CLI 入口兼容策略更新：从 `@talex-touch/unplugin-export-plugin` 调用 `tuff` 时，若未安装 `@talex-touch/tuff-cli`，改为“显式报错 + 安装指引 + 非 0 退出”。
- 插件安装复制链路新增 `node_modules` 自动剔除：`PluginResolver` 与 `DevPluginInstaller` 在目录复制时过滤 `node_modules`，并在解包后做一次递归清理，防止历史残留再次落盘到运行态插件目录。

### feat(pilot): Chat/Turn 新协议与单 SSE 尾段 Title

- 新增 `POST /api/v1/chat/sessions/:sessionId/turns`（会话入队，返回 `request_id/turn_id/queue_pos`）。
- 新增 `POST /api/v1/chat/sessions/:sessionId/stream`（`turn.*` 事件流 + 尾段 `title.generated/title.failed` + `[DONE]`）。
- 新增 `GET /api/v1/chat/sessions/:sessionId/messages`（返回 `messages + run_state + active_turn_id + pending_count`）。
- 服务端补齐 `chat-turn-queue`（会话级串行执行与状态持久化）。
- 历史会话链路改为 JSON：`pilot_quota_history.value` 完成一次性 base64 -> JSON 迁移，后续读写统一 JSON 字符串并回包结构化 `value/messages`。

### fix(pilot): run_state 查询故障降级，避免会话读取 500

- `aigc/conversation`、`aigc/conversations`、`aigc/history` 与 `v1/chat/sessions/:id/messages` 在运行态查询失败时统一降级为 `run_state=idle`，确保历史消息可读。
- 新增 `getSessionRunStateSafe` 兜底方法，避免队列表异常导致前端刷新误判“分析失败”。

### fix(chat-ui): 输入区 loading 与发送解耦

- 输入区状态拆分为 `send_state=idle|sending_until_accepted`，仅“等待受理”阶段显示 loading。
- 发送链路支持连续发送，不再每次发送前强制 abort 上一个请求。
- 修复 `verbose` 状态映射与 `ChatItem` 结束态误判。

### refactor(prompt): 标题生成 prompt 收敛

- 抽取 `apps/pilot/server/utils/pilot-title.ts`，统一标题生成逻辑。
- `pilot-runtime` 默认系统提示压缩为更短、更稳的执行导向文案。

### CI/CD：Pilot webhook 自动部署恢复

- `pilot-image.yml` 在 GHCR 推送成功后自动触发 `POST /deploy`。
- 安全约束：`X-Pilot-Token` / `Authorization: Bearer` 校验、仓库/分支白名单。
- 文档与运维说明同步至：`.github/workflows/README.md`、`apps/pilot/deploy/README*.md`。
- 自动触发口径澄清：仅远端 `master` push（命中 workflow path）会触发，**本地 commit 不会触发 1Panel 自动更新**。
- 排障与兜底路径固化：当 webhook secrets 缺失或 1Panel webhook 不可达时，统一走 `ssh home` 手动执行部署脚本。

### fix(pilot): 流式失败可见性 + CMS 设置收口修复

- 前端 SSE 解析新增兼容层：支持 `event/session_id/[DONE]` 到 `type/sessionId/done` 统一映射，并补齐 `turn.accepted/queued/started/delta/completed/failed` 处理。
- `turn.failed` 改为“双通道可见”：消息区强制追加 assistant 失败消息，底部保留带 `code/status_code/request_id` 的诊断信息。
- `v1/chat/sessions/:sessionId/stream` 的失败语义增强：`turn.failed` 增加可选 `code/status_code/detail`，并对 502/503/504 返回可操作文案（兼容保留 `message`）。
- CMS 收口补丁：`/cms/system/pilot-settings` 页面独立滚动；Pilot 侧设置入口统一到该页；旧 `/pilot/admin/channels|storage` 改为直接跳转。
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
  - `apps/core-app`、`apps/nexus`、`apps/pilot`、`packages/*`、`plugins/*`；
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
  - `SIZE-GROWTH-2026-03-16-AIGC-EXECUTOR` -> `apps/pilot/server/api/aigc/executor.post.ts`
  - `SIZE-GROWTH-2026-03-16-DEEPAGENT` -> `packages/tuff-intelligence/src/adapters/deepagent-engine.ts`
  - `SIZE-GROWTH-2026-03-16-PILOT-CHAT-PAGE` -> `apps/pilot/app/composables/usePilotChatPage.ts`
- 兼容债务清册清理：
  - 移除 2 条主线扫描口径外的陈旧条目（`apps/pilot/shims-compat.d.ts`、`apps/nexus/i18n.config.ts`）。
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
  - `SIZE-GROWTH-2026-03-16-AIGC-EXECUTOR`：`apps/pilot/server/api/aigc/executor.post.ts` 上限 `1642 -> 1666`。
  - `SIZE-GROWTH-2026-03-16-DEEPAGENT`：`packages/tuff-intelligence/src/adapters/deepagent-engine.ts` 上限 `1919 -> 1924`。
  - `SIZE-GROWTH-2026-03-16-PILOT-CHAT-PAGE`：`apps/pilot/app/composables/usePilotChatPage.ts` 新增上限 `1366`（baseline 仍为 `1362`）。
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
  - Pilot Image Publish: [23106610203](https://github.com/talex-touch/tuff/actions/runs/23106610203)
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
- `PILOT-NEXUS-OAUTH-CLI-TEST-PLAN` 重写为“已落地 vs 未启动”。
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

### Pilot Runtime 主路径收敛

- 主路径统一为 `Node Server + Postgres/Redis + JWT Cookie (+ MinIO)`。
- Cloudflare runtime / wrangler / D1/R2 降为历史归档语境。
- 会话与流式能力继续补齐（`fromSeq` 补播、pause/trace、运行态回传）。

### Core App 稳定性治理

- 生命周期与退出链路收敛、模块卸载幂等增强。
- Tray 实验特性开关化，默认入口回归更稳路径。

---

## 2026-03-09 ~ 2026-03-11

### Pilot M0/M1 高优先级收口

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

### Pilot API 批次迁移与运维能力补齐

- M2/M3 接口迁移覆盖运营常用域。
- 渠道合并能力落地：`POST /api/pilot/admin/channels/merge-ends` + 一次性脚本。
- 支付/微信相关路径按“协议兼容 + 本地 mock/豁免”策略收口。

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
