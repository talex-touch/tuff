# 变更日志

> 记录项目的重大变更和改进

## 2026-02-28

### 启动阶段卡顿治理（前端首屏加载竞争缓解）

**变更类型**: 性能优化 / 启动时序治理 / 主线程阻塞缓解

**描述**: 针对开发环境启动日志中出现的前端加载慢与事件循环 lag，收敛启动阶段重任务执行时机：补齐模块事件上下文、延后 DivisionBox 预热窗口、推迟 AppProvider 的 dev 启动扫描，并对 Storage 落盘做内容级去重，降低主线程竞争。

**主要变更**:
1. `TouchApp` 创建 `ModuleManager` 时注入 `touchEventBus` 与 `BEFORE_APP_QUIT`，恢复模块 `start` 阶段事件上下文。
2. `DivisionBoxModule` 在预热窗口池前等待主渲染器完成加载，避免与主窗口 dev server 首次编译并发竞争。
3. `AppProvider` 在 dev 模式下将 startup backfill / mdls 初扫延后到 45s，并在主渲染器加载中继续延后重任务。
4. `StorageModule` 增加 `persistedContent` 去重缓存，跳过重复内容写入；`persistConfig` 改为异步 `ensureFile`，减少同步 IO 阻塞。
5. `Intelligence` 配置加载增加 runtime 签名去重，避免同配置重复应用导致 provider 重复注册。

**修改文件**:
- `apps/core-app/src/main/core/touch-app.ts`
- `apps/core-app/src/main/modules/division-box/module.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/main/modules/storage/index.ts`
- `apps/core-app/src/main/modules/ai/intelligence-config.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### MetaOverlay 启动高度与 CoreBox 一次性同步（Meta+K）

**变更类型**: 交互稳定性修复 / CoreBox 视图一致性

**描述**: 修复 Meta+K 打开 MetaOverlay 时与 CoreBox 扩窗动画存在的高度竞态。新增一次延迟高度同步，确保 MetaOverlay 启动阶段与 CoreBox 窗口高度对齐，减少首帧裁切与视觉跳变。

**主要变更**:
1. `MetaOverlayManager.show` 在初次设定 bounds 后，追加一次延迟高度同步调度。
2. 新增 `heightSyncTimer` 生命周期管理，避免重复调度导致的多余更新。
3. `destroy` 阶段清理同步定时器，避免悬挂定时任务。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/core-box/meta-overlay.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### 风险治理流程固化（P0）与技术债里程碑落地（不执行大文件拆分）

**变更类型**: 文档治理 / 发布门禁收敛 / 风险管理

**描述**: 将风险登记从“记录型文档”升级为“发布门禁输入”，补齐 Owner、目标日期、缓解与回滚策略、证据字段，并将 Gate E 与风险状态绑定；同时基于深度技术债报告落地 TD-M1~M3 里程碑。本轮明确“大文件拆分先不执行”，仅保留边界与测试基线规划。

**主要变更**:
1. `RISK-REGISTER` 新增 GA 风险模板与 Gate 判定规则（P0 未收口禁止 Gate E）。
2. 风险表补齐 Owner/目标日期/回滚策略/状态；同步更新同步链路与 auth 迁移状态。
3. `TODO` 的 P0 风险治理与技术债落地条目改为已完成，并记录“本轮不拆分大文件”决策。
4. 发布清单补充风险门禁规则，Gate E 显式依赖 `P0=0`。

**修改文件**:
- `docs/plan-prd/01-project/RISK-REGISTER-2026-02.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md`
- `docs/plan-prd/01-project/CHANGES.md`

### v2.4.7 Gate C 质量门禁拆解（C1~C4）

**变更类型**: 发布治理 / 质量门禁执行计划

**描述**: 将 Gate C 从“阻塞描述”细化为可执行批次（C1~C4），明确按文件分组、建议负责人、验收命令与推进顺序，避免发布前质量收口无 owner、无节奏。

**主要变更**:
1. 发布清单新增 Gate C 批次表（C1 lint 阻断清零、C2 watermark 类型收口、C3 auth/device 类型收口、C4 全量复扫）。
2. TODO 的 `v2.4.7 发版推进` 同步增加 C1~C4 子任务，便于追踪 Gate C 实际进度。
3. 发布清单更新时间更新为 2026-02-28，并保留风险门禁与 Gate E 绑定规则。

**修改文件**:
- `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`

### Workspace 依赖统一（P0~P5）与 Catalog 冲突收敛

**变更类型**: 工程治理 / 依赖一致性 / 前端运行时收敛

**描述**: 完成 workspace 依赖统一升级（P0~P5 范围），清理 `pnpm-workspace.yaml` 中历史 `conflicts_*` catalog 分组，并移除 `@lobehub/icons`、`react/react-dom`、`motion-v` 的直接依赖入口，统一到纯 Vue 动画实现，避免 catalog 冲突和跨栈依赖漂移。

**主要变更**:
1. Catalog 全量升级到统一基线（default/build/dev/frontend/icons），并移除 `conflicts_*` 分组。
2. Nexus 侧移除 `motion-v` 与 React 直接依赖，相关 UI 动画改为 CSS 过渡/关键帧实现。
3. 补齐 `electron-builder-squirrel-windows` 以收敛 Electron Builder peer 提示。
4. 根 `pnpm.peerDependencyRules` 增加统一规则（`ignoreMissing` + `allowedVersions`）以减少跨生态弱约束噪音。

**修改文件**:
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `package.json`
- `apps/nexus/package.json`
- `apps/core-app/package.json`
- `apps/nexus/app/components/tuff/VortexBackground.vue`
- `apps/nexus/app/components/tuff/carousel/apple/AppleCard.vue`
- `apps/nexus/app/components/tuff/carousel/apple/AppleCarouselItem.vue`
- `apps/nexus/app/components/tuff/landing/TuffLandingAuroraBar.vue`
- `plugins/touch-translation/package.json`
- `docs/plan-prd/01-project/CHANGES.md`

### Plugin Injection 生命周期防护（`Object has been destroyed` 竞态修复）

**变更类型**: 稳定性修复 / 生命周期守卫抽取

**描述**: 修复插件注入链路在窗口或 `webContents` 已销毁时触发 `TypeError: Object has been destroyed` 的竞态问题。将注入构建与 Electron 销毁态判断抽取为复用 hooks，统一在 CoreBox / DivisionBox / Plugin Window 链路接入，避免未处理异常放大为主进程错误。

**主要变更**:
1. 新增 `use-electron-guard` hooks，统一封装 `isDestroyed()` 守卫与 `userAgent` 安全读取。
2. `TouchPlugin.__getInjections__` 改为使用安全 `userAgent` 解析，并在主窗口已销毁时回退到稳定值。
3. 新增 `usePluginInjections`，统一包装注入构建异常处理，避免调用侧直接崩溃。
4. CoreBox / DivisionBox / Plugin Module 的注入入口统一切换到 `usePluginInjections`，并复用 `useAliveWebContents` 做视图可用性判断。
5. 扩展到 MetaOverlay / ViewCache / DevServerMonitor / DivisionBox StateSync，统一复用 `useAliveTarget/useAliveWebContents` 处理窗口与视图销毁态，减少重复判定分支。

**修改文件**:
- `apps/core-app/src/main/hooks/use-electron-guard.ts`
- `apps/core-app/src/main/modules/plugin/runtime/plugin-injections.ts`
- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/window.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/meta-overlay.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/view-cache.ts`
- `apps/core-app/src/main/modules/division-box/session.ts`
- `apps/core-app/src/main/modules/division-box/state-sync.ts`
- `apps/core-app/src/main/modules/plugin/dev-server-monitor.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Legacy Channel 2.4.8 P0（Phase A/B/C/D）首轮收口

**变更类型**: 架构收敛 / 传输层统一 / 兼容语义迁移

**描述**: 按 `LegacyChannelCleanup-2408` 的 P0 范围完成首轮收口：CoreBox 触发链路移除 `ChannelType` 过滤参数；Clipboard legacy 事件发送/接收路径下线并统一到 `ClipboardEvents`；DivisionBox/FlowBus IPC 构造改为直接注入 `ITuffTransportMain`；Plugin 主链路移除对 raw `channelMap` 的读取，并通过 `transport.invoke(...)` 保留本地 reply 语义。

**主要变更**:
1. CoreBox `CoreBoxTransport` 改为 `scope: 'main' | 'plugin'` 过滤，输入/键盘注册链路不再依赖 `ChannelType`。
2. CoreBox `window.ts` 触发广播统一改为 `transport.broadcastToWindow(...)`。
3. DivisionBox / FlowBus IPC 改为 transport 注入，模块初始化阶段统一构建并传入 transport 实例。
4. Plugin 主链路移除 `channelMap` 访问，新增 `ITuffTransportMain.invoke(...)` + `TuffMainTransport.invoke(...)` 以支持主进程内事件派发与 reply 语义。
5. Clipboard legacy handler（`clipboardLegacy*`）下线，新增 `ClipboardEvents.queryMeta` 承接内部 `clipboard:query` 查询能力；CoreBox MetaOverlay 与预览历史模块改用 `ClipboardEvents.write/queryMeta/change`。
6. WidgetManager / Clipboard 注册入口去除 `ITouchChannel` 类型依赖。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/core-box/transport/core-box-transport.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/input-transport.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/key-transport.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/window.ts`
- `apps/core-app/src/main/modules/division-box/ipc.ts`
- `apps/core-app/src/main/modules/division-box/module.ts`
- `apps/core-app/src/main/modules/flow-bus/ipc.ts`
- `apps/core-app/src/main/modules/flow-bus/module.ts`
- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `apps/core-app/src/main/modules/plugin/widget/widget-manager.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/meta-overlay.ts`
- `apps/core-app/src/main/modules/clipboard.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/usePreviewHistory.ts`
- `packages/utils/transport/events/index.ts`
- `packages/utils/transport/events/types/clipboard.ts`
- `packages/utils/transport/types.ts`
- `packages/utils/transport/sdk/main-transport.ts`
- `packages/utils/transport/index.ts`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`

### CoreBox BoxItem 同步回包超时修复（改为 fire-and-forget）

**变更类型**: 稳定性修复 / IPC 交互语义收敛

**描述**: 修复 `box-item:sync-response` 在渲染端未挂载或主线程阻塞时可能触发 60s 回包超时的问题。主进程从“请求-应答”发送改为 fire-and-forget 广播，移除不必要的回包等待，避免日志噪音和超时堆积。

**主要变更**:
1. `BoxItemManager.emitToRenderer` 从 `transport.sendToWindow(...)` 切换为 `transport.broadcastToWindow(...)`。
2. 事件泛型约束收敛为 `TuffEvent<TReq, void>`，明确该链路仅做单向通知。
3. 同步 TODO 风险项状态，标记该 P1 问题已完成。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/item-sdk/box-item-manager.ts`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`

### Flow ↔ DivisionBox 权限 actor 解析收敛（corebox 免检 + sdkapi 优先级）

**变更类型**: 稳定性修复 / 权限判定一致性

**描述**: 收敛 DivisionBox 侧 Flow 入口的调用方识别策略，避免 `actorPluginId` 缺失或 `corebox` 来源时误判为插件调用，并补齐最小回归用例覆盖 `_sdkapi` 优先级与双权限校验行为。

**主要变更**:
1. `DivisionBoxIPC` 抽出 `resolveDivisionBoxPermissionActor`，统一 `context.plugin -> actorPluginId -> nested sourcePluginId` 解析顺序。
2. `actorPluginId = corebox` 或 actor 缺失时直接返回空 actor，不再回退 `payload.pluginId`，避免误触发插件权限校验。
3. `_sdkapi` 优先级明确为“payload 覆盖插件声明 sdkapi”，并通过单测固化。
4. 新增权限最小用例：`division-box:flow:trigger` 缺任一 `window.create` / `storage.shared` 均拒绝，双权限齐备后放行。

**修改文件**:
- `apps/core-app/src/main/modules/division-box/ipc.ts`
- `apps/core-app/src/main/modules/division-box/permission-actor.ts`
- `apps/core-app/src/main/modules/division-box/ipc.actor.test.ts`
- `apps/core-app/src/main/modules/permission/permission-guard.test.ts`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`

### 修复 Windows Release 误发布裸 EXE（避免 ICU 启动失败）

**变更类型**: 发布链路修复 / Windows 安装包可靠性

**描述**: 修复 `build-and-release` 在收集发布资产时递归匹配所有 `.exe` 导致 `win-unpacked/tuff.exe` 被误发布的问题。用户下载裸 EXE 后缺少 `resources/icudtl.dat` 等运行时文件，会触发 ICU 初始化失败并无法启动。现统一只发布 `*-setup.exe` 安装包，并显式排除 `win-unpacked` 与 `__uninstaller-*.exe`。

**主要变更**:
1. Release 资产列表改为仅展示 Windows `*-setup.exe`，避免误导下载。
2. 资产收集规则从“所有 `.exe`”收敛为“仅 `*-setup.exe` + 其他平台产物”。
3. 新增守卫校验：若未收集到 `*-setup.exe`，工作流直接失败，阻止错误资产发布。
4. Nexus 资产同步阶段新增过滤：非 `*-setup.exe` 的 Windows `.exe` 不再写入发布记录，保持下载入口一致。

**修改文件**:
- `.github/workflows/build-and-release.yml`
- `docs/plan-prd/01-project/CHANGES.md`

### 清理失效/过期 CI 工作流（Sync Guard / Legacy Release / opencode）

**变更类型**: 工程脚本清理 / CI 噪音收敛

**描述**: 移除已失效或已不再参与当前发布链路的 GitHub Actions 工作流，避免重复门禁与“脚本已删除但仍被 CI 调用”的必失败噪音；当前发布仍以 `build-and-release.yml`（tag 驱动）为唯一主链路。

**主要变更**:
1. 删除 `Sync Guard` 工作流：原流程依赖的 `scripts/check-no-legacy-sync-value-json.mjs` 已移除，导致 CI 必失败。
2. 删除 legacy/manual 的 release 工作流：`release-core/release-renderer/release-extensions`。
3. 删除 `opencode` 评论触发工作流（依赖外部 secret，且当前维护价值较低）。

**修改文件**:
- `.github/workflows/sync-guard.yml`（删除）
- `.github/workflows/release-core.yml`（删除）
- `.github/workflows/release-renderer.yml`（删除）
- `.github/workflows/release-extensions.yml`（删除）
- `.github/workflows/opencode.yml`（删除）
- `.github/workflows/README.md`
- `docs/plan-prd/01-project/CHANGES.md`

### Auth 敏感配置迁移到安全存储（localStorage -> safeStorage）

**变更类型**: 安全加固 / 渲染层敏感数据治理

**描述**: 收敛渲染端历史明文配置风险。登录初始化阶段新增一次性迁移逻辑，将 legacy `localStorage` 中的鉴权敏感项写入主进程 `safeStorage` 通道并清理旧键，避免长期明文驻留。

**主要变更**:
1. `auth-env.ts` 新增 `get/setAuthSensitiveValue`，统一通过 `AppEvents.system.getSecureValue/setSecureValue` 读写敏感字段。
2. 新增 `migrateLegacyAuthEnvToSecureStorage()`，首次启动自动迁移并删除 legacy 键。
3. `useAuth.initializeAuth()` 前置执行迁移，保证后续登录流程读取到安全存储数据。
4. 补齐 `auth-env.test.ts`，覆盖迁移与清理行为。

**修改文件**:
- `apps/core-app/src/renderer/src/modules/auth/auth-env.ts`
- `apps/core-app/src/renderer/src/modules/auth/useAuth.ts`
- `apps/core-app/src/renderer/src/modules/auth/auth-env.test.ts`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`

### Flow -> DivisionBox 权限回归补齐（结构化错误 + 前端提示）

**变更类型**: 稳定性修复 / 权限反馈一致性

**描述**: 针对 Flow 触发 DivisionBox 的权限拒绝场景，补齐“主进程结构化错误返回 + 渲染层定向提示”链路，避免仅凭字符串错误导致提示不稳定。

**主要变更**:
1. `flow-bus/ipc.ts` 统一 `FlowEvents.dispatch` 异常出口，返回 `{ success: false, error }` 结构并透出 `code/permissionId`。
2. `FlowDispatchResponse.error` 类型扩展为可携带 `code`、`permissionId`、`showRequest`，减少前后端语义漂移。
3. `useDetach.ts` 针对 `PERMISSION_DENIED` 给出必需权限提示，其余失败路径保持既有错误提示策略。

**修改文件**:
- `apps/core-app/src/main/modules/flow-bus/ipc.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useDetach.ts`
- `packages/utils/transport/events/types/flow.ts`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`

### Nexus Release 下载链路签名化（Signed URL + TTL + fallback）

**变更类型**: 发布链路增强 / 下载安全治理

**描述**: Release API 默认下发带签名的下载地址，下载端点校验签名并支持 TTL；在迁移阶段可通过配置控制 unsigned fallback，兼顾存量链接兼容。

**主要变更**:
1. 新增 `releaseDownloadSignature` 工具，封装签名 URL 生成、解析与校验逻辑。
2. `releaseSignature` 增加 `attachSignatureUrls(...)`，为 release 资产附加 signed `downloadUrl`，并保留 `fallbackDownloadUrl`。
3. `releases/latest|index|[tag]|[tag]/assets` API 统一接入签名 URL 输出。
4. `releases/[tag]/download/[platform]/[arch]` 支持签名校验、外链 302 跳转与 unsigned fallback 开关。
5. `nuxt.config.ts` 新增 `releaseDownload.secret/signedTtlSeconds/allowUnsignedFallback` 运行时配置。

**修改文件**:
- `apps/nexus/server/utils/releaseDownloadSignature.ts`
- `apps/nexus/server/utils/releaseSignature.ts`
- `apps/nexus/server/api/releases/latest.get.ts`
- `apps/nexus/server/api/releases/index.get.ts`
- `apps/nexus/server/api/releases/[tag].get.ts`
- `apps/nexus/server/api/releases/[tag]/assets.get.ts`
- `apps/nexus/server/api/releases/[tag]/download/[platform]/[arch].get.ts`
- `apps/nexus/nuxt.config.ts`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`

## 2026-02-27

### Meta+K Quick Actions 打开时强制最大展开

**变更类型**: 交互一致性优化 / 新链路收敛

**描述**: 在新的 Quick Actions 链路中，触发 `Meta+K` 后 CoreBox 可能保持当前高度，导致操作面板显示空间不足。现统一在 `MetaOverlayEvents.ui.show` 处理时先将 CoreBox 扩展到最大高度，再展示面板。

**主要变更**:
1. `MetaOverlayEvents.ui.show` 收到请求后先执行 `coreBoxManager.expand({ forceMax: true })`。
2. 保持现有 action 注册/执行协议不变，仅调整展示前的窗口尺寸策略。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/core-box/ipc.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Meta+K Quick Actions 叠层可见性修复（WebContentsView 定向投递）

**变更类型**: 稳定性修复 / 交互可见性修复

**描述**: 修复 `Meta+K` 打开后仅出现透明层、无任何内容的故障。根因是主进程向 `WebContentsView.webContents` 发送事件时，`TuffMainTransport.sendTo` 实际回落到了 `BrowserWindow.webContents`，导致 MetaOverlay 渲染器收不到 `ui.show/ui.hide`。

**主要变更**:
1. `TuffMainTransport.sendTo` 改为以“传入目标 WebContents”为准发送，不再通过窗口查找回退。
2. 保持现有 API 不变，兼容 `WebContents` 与带 `webContents` 字段的目标对象（如窗口/视图宿主）。
3. `MetaOverlayManager` 现有 `sendTo(this.metaView.webContents, ...)` 链路可正确命中 MetaOverlay 进程，叠层内容恢复显示并可跟随 CoreBox。

**修改文件**:
- `packages/utils/transport/sdk/main-transport.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### CoreBox UI View 生命周期竞态修复（webContents 空指针防护）

**变更类型**: 稳定性修复 / 崩溃防护

**描述**: 修复 CoreBox 在 show/focus 异步回调与 UI View detach/销毁并发时，访问 `this.uiView.webContents.isDestroyed()` 触发 `TypeError` 的问题。该异常会被 `DevProcessManager` 识别为 uncaught exception 并触发开发进程退出。

**主要变更**:
1. 在 `WindowManager` 新增 `getAliveUIViewWebContents()`，统一做 `uiView`/`webContents` 存活检查。
2. `show()` 的延时 focus、`Cmd/Ctrl+R` 的 UI reload、缓存 view 恢复、`sendToUIView`、键盘转发、插件 DevTools 打开等路径统一改为通过安全检查访问 `webContents`。
3. 保持现有行为不变，仅在 `webContents` 不可用时短路返回，避免空指针导致主进程崩溃。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/core-box/window.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### CoreBox 搜索排序修复（取消 app 硬置顶，启用匹配优先 + 使用频次提升）

**变更类型**: 搜索体验修复 / 排序策略优化

**描述**: 修复 `app` 与 `feature` 共存时 `app` 因 kind 权重过高被强制置顶的问题。排序改为“匹配分主导 + 使用频次/时效补充 + 类型软偏置”，并对 `feature/command` 的频次学习信号做适度增强，确保高匹配和高使用项能稳定前置。

**主要变更**:
1. `tuff-sorter` 评分模型从“kind 强主导”改为“match 主导 + usage/recency + kind 软偏置”。
2. 降低类型权重对最终排序的影响，消除 `app` 对 `feature` 的结构性压制。
3. 为 `feature/command` 增加频次权重系数，提升常用功能的自动前置能力。
4. 收敛 `tag/path/description` 来源的伪高亮加分，避免别名命中通过 fallback 高亮压过真实标题命中（如 `cleaner` 场景）。
5. 新增 `tuff-sorter` 单测，覆盖“强匹配 feature 前置”“高频 feature 前置”“明显强匹配仍优先”“别名伪高亮不越级”回归场景。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/search-engine/sort/tuff-sorter.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/sort/tuff-sorter.test.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Clipboard 历史检索补齐 OCR 元数据命中

**变更类型**: 检索能力修复 / 行为一致性增强

**描述**: 修复 Clipboard 历史 `keyword` 查询只匹配 `content` 的问题，统一扩展为同时匹配 `content`、`rawContent` 与 `metadata`，使 OCR 写入的 `ocr_text / ocr_excerpt / ocr_keywords` 能被关键词检索命中。

**主要变更**:
1. `ClipboardEvents.getHistory` 查询条件由单字段 `content LIKE` 扩展为多字段 OR 匹配。
2. legacy `clipboard:get-history` 查询路径同步扩展同样条件，避免新旧通道行为不一致。

**修改文件**:
- `apps/core-app/src/main/modules/clipboard.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Tray 改为实验特性（默认关闭）

**变更类型**: 稳定性修复 / 开发体验优化

**描述**: 针对 macOS 环境中“托盘对象创建成功但菜单栏不可见”的系统级可见性问题，当前版本将 Tray 收敛为实验特性，默认关闭，避免影响主流程入口。当前阶段暂无稳定修复方案，统一通过 Dock 作为默认入口。

**主要变更**:
1. Tray 新增实验开关：`setup.experimentalTray`（默认 `false`），需显式开启。
2. Tray 默认不初始化，移除原有健康检查重试与大量调试输出，保留基础生命周期与菜单更新逻辑。
3. 在 Tray 未启用时，macOS 强制 `regular` 激活策略并保持 Dock 可见，确保入口稳定。
4. 运行时 `TrayEvents.show.set` 在实验开关关闭时直接拒绝，并返回明确告警。
5. 文档明确已知问题：托盘可见性缺陷暂未稳定解决，当前阶段不默认开启。

**修改文件**:
- `apps/core-app/src/main/modules/tray/tray-icon-provider.ts`
- `apps/core-app/src/main/modules/tray/tray-manager.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### 插件安装门禁升级（无 sdkapi 视为过时插件并拒绝安装）

**变更类型**: 安装门禁 / 兼容策略收紧

**描述**: 对未声明 `manifest.sdkapi` 的插件，不再兼容安装。安装预检、安装解析与加载阶段统一改为硬拒绝，避免旧插件绕过 capability 认证基线。

**主要变更**:
1. `PluginInstaller.prepareInstall` 增加 `sdkapi` 强校验：缺失即抛错并中止安装流程。
2. `PluginResolver.resolve/install` 增加 `sdkapi` 强校验：缺失即返回 error，不进入安装落盘。
3. `plugin-loaders` 将缺失 `sdkapi` 从 warning 升级为 error（`SDK_VERSION_MISSING`），与安装门禁一致。

**修改文件**:
- `apps/core-app/src/main/modules/plugin/plugin-installer.ts`
- `apps/core-app/src/main/modules/plugin/plugin-resolver.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### 插件能力认证基线升级（sdkapi 260228 + Clipboard/OCR 不支持修复）

**变更类型**: 安全加固 / 权限认证收敛 / 能力降级修复

**描述**: 新增 `sdkapi 260228` 作为插件能力认证基线。权限中间件改为优先使用已加载插件声明的 `sdkapi` 做鉴权，避免通过 payload 伪造降级绕过；Clipboard transport 全链路补齐插件调用鉴权；当 Clipboard 或 Intelligence（如 `vision.ocr`）能力不支持时，返回可识别的稳定错误标识，便于插件侧兜底。

**主要变更**:
1. `packages/utils/plugin/sdk-version.ts` 新增 `SdkApi.V260228`，并将 `CURRENT_SDK_VERSION` 升级为 `260228`，补充 `CAPABILITY_AUTH_MIN_VERSION` 常量。
2. `channel-guard` 权限中间件改为优先读取已加载插件声明 `sdkapi`；`sdkapi >= 260228` 时若 payload 与声明不一致，拒绝调用（`SDKAPI_MISMATCH`）。
3. Clipboard SDK 的写类/查询类请求统一注入 `_sdkapi`；主进程 `ClipboardEvents.*` 全量 handler 增加插件权限校验（读/写分级）。
4. `ClipboardEvents.change` 流式订阅上下文补齐插件信息，支持流式权限校验。
5. Clipboard 权限拒绝统一映射为 `CLIPBOARD_CAPABILITY_UNAVAILABLE`；Intelligence invoke/test 对“不支持能力”错误统一映射为 `INTELLIGENCE_CAPABILITY_UNSUPPORTED`（覆盖 native OCR 不支持场景）。

**修改文件**:
- `packages/utils/plugin/sdk-version.ts`
- `packages/utils/plugin/sdk/clipboard.ts`
- `packages/utils/transport/events/types/clipboard.ts`
- `packages/utils/transport/types.ts`
- `packages/utils/transport/sdk/main-transport.ts`
- `apps/core-app/src/main/modules/permission/channel-guard.ts`
- `apps/core-app/src/main/modules/clipboard.ts`
- `apps/core-app/src/main/modules/ai/intelligence-module.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Clipboard 即时监听可靠性修复（startWatch 导出兼容）

**变更类型**: 稳定性修复 / 剪贴板监听可靠性

**描述**: 针对 `Clipboard native watcher module has no startWatch API` 告警导致 watcher 未生效的问题，补齐 `@crosscopy/clipboard` 在不同构建导出形态下（含 `default`、`module.exports` 及嵌套）的解析兜底，确保能稳定获取 `startWatch` 并即时触发检测。

**主要变更**:
1. `ClipboardModule.resolveClipboardWatcherModule` 从单一导出判定改为多候选解析（`mod` / `mod.default` / `mod['module.exports']` 及其嵌套），兼容 ESM/CJS 打包差异。
2. 保持 CoreBox 可见态高频轮询兜底（`500ms`）不变，确保 watcher 异常时仍不漏录。
3. watcher 不可解析时输出导出键诊断信息，便于快速定位运行时导出形态。

**修改文件**:
- `apps/core-app/src/main/modules/clipboard.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Clipboard SDK Transport-First 迁移（剪贴板 API 收敛）

**变更类型**: 架构收敛 / SDK 迁移 / 文档同步

**描述**: 将插件侧 `useClipboard()` 主通道迁移到 `ClipboardEvents.*`，减少对 `clipboard:*` raw channel 的依赖；同时补齐 transport clipboard 事件域与主进程 handler，覆盖读写、历史、清空、图片 URL、复制粘贴等能力。

**主要变更**:
1. 扩展 transport clipboard 类型定义与事件集合：新增 `clearHistory`、`getImageUrl`、`read`、`readImage`、`readFiles`、`clear`、`copyAndPaste` 等事件。
2. `packages/utils/plugin/sdk/clipboard.ts` 改为 transport-first 实现，历史查询、变更订阅、读写与粘贴统一走 `ClipboardEvents.*`。
3. 主进程 `ClipboardModule` 补齐新增 transport 事件处理，并增强 `ClipboardEvents.getHistory` 过滤能力（关键词、时间范围、来源应用、收藏、排序、files 类型）。
4. 同步 Nexus 文档：更新 Clipboard/Transport API 示例与 Channel 文档示例，明确新插件应走 SDK/Transport 路径。

**修改文件**:
- `packages/utils/transport/events/types/clipboard.ts`
- `packages/utils/transport/events/index.ts`
- `packages/utils/plugin/sdk/clipboard.ts`
- `apps/core-app/src/main/modules/clipboard.ts`
- `apps/nexus/content/docs/dev/api/clipboard.zh.mdc`
- `apps/nexus/content/docs/dev/api/clipboard.en.mdc`
- `apps/nexus/content/docs/dev/api/transport.zh.mdc`
- `apps/nexus/content/docs/dev/api/transport.en.mdc`
- `apps/nexus/content/docs/dev/api/channel.zh.mdc`
- `apps/nexus/content/docs/dev/api/channel.en.mdc`
- `docs/plan-prd/01-project/CHANGES.md`

### CoreBox 搜索卡顿收敛（Clipboard 轮询降压 + 零结果诊断节流）

**变更类型**: 性能优化 / 搜索体验修复 / 日志降噪

**描述**: 针对“搜索时偶发顿一下”的反馈，收敛两条高频热路径：其一是搜索零结果时每次都执行额外 `count(*)` 诊断查询并打 warning；其二是 native clipboard watcher 在 ESM/CJS 导出形态下可能接入失败。修复后保持 CoreBox 可见态高频轮询兜底，避免漏录，同时让 watcher 事件触发链路更稳定。

**主要变更**:
1. `Clipboard` 保持 CoreBox 可见态 `500ms` 轮询兜底，优先保障剪贴板变化不漏录。
2. `Clipboard` native watcher 增加导出兼容解析（`mod.startWatch` + `mod.default.startWatch`），修复“模块存在但识别不到 startWatch”的接入失败场景。
3. `SearchIndexService` 新增零结果诊断节流（按 provider，30s 窗口），避免每次 miss 都触发额外 `count(*)` 查询和 warning。

**修改文件**:
- `apps/core-app/src/main/modules/clipboard.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Clipboard History 插件迁移落地（插件可用化 + SDK legacy 桥接补齐）

**变更类型**: 功能迁移 / 插件可用化 / 兼容性修复

**描述**: 将 `clipboard-history` 插件迁入 monorepo 后，完成最小可运行适配：修复插件依赖配置、清理错误 prelude 逻辑，并补齐 Clipboard SDK 对应 legacy 通道桥接，确保图片场景和旧通道下的调用可用。

**主要变更**:
1. 修复运行目录插件：`apps/core-app/tuff/modules/plugins/clipboard-history/index.js` 从错误的 translation mock 切换为 `clipboard-history` feature 入口逻辑。
2. 修复插件 `package.json` 中无效 `catalog:*` 占位，改为可解析的 `workspace:^` 与明确版本依赖，避免 workspace 安装/校验失败。
3. 重写插件 `index.js` prelude：移除误植的 translation mock，仅保留 `clipboard-history` feature 的查询同步逻辑。
4. 主进程 Clipboard 模块补齐 legacy 事件：
   - `clipboard:get-latest`
   - `clipboard:get-image-url`
5. `packages/utils/plugin/sdk/clipboard.ts` 增加兼容兜底：
   - `getLatest()` 在 legacy 事件缺失时回退到 `getHistory(page=1,pageSize=1)`
   - `getHistoryImageUrl()` 事件异常时返回 `null`，避免插件侧直接抛错

**修改文件**:
- `apps/core-app/tuff/modules/plugins/clipboard-history/index.js`
- `apps/core-app/src/main/modules/clipboard.ts`
- `packages/utils/plugin/sdk/clipboard.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Clipboard 轮询漏录修复（快照签名 + 合并补跑 + 元数据落库兜底）

**变更类型**: 稳定性修复 / 数据完整性修复 / 轮询策略优化

**描述**: 针对日志中 `Clipboard check slow`、`Clipboard check failed`、`clipboard_history_meta FOREIGN KEY` 及 `SQLITE_BUSY` 相关问题，收敛剪贴板轮询路径中的“漏检 + 过长冷却 + 异步落库未兜底”三类风险，降低高频复制场景下的漏录概率与未处理 rejection 噪音。

**主要变更**:
1. 快速变更检测签名升级：由“格式 + 文本前 100 字符”改为“格式 + 文本长度/首尾摘要 + 文件签名 + 图片签名”，修复前缀相同文本与图片变更漏检。
2. 预读取缓存收敛：在单次轮询中复用 text/files/image 读取结果，避免重复读取导致额外阻塞。
3. 轮询执行改为 in-flight 合并补跑：检查进行中若收到新触发会标记 pending，当前轮次结束后立即补跑一轮，减少长任务期间的变化丢失。
4. 慢检查冷却改为动态窗口（有上限）：避免固定 5s 冷却带来的大漏录窗口，同时保留慢路径退让能力。
5. `clipboard_history_meta` 异步写入增加安全封装：统一 catch 队列丢弃/外键异常，避免未处理 rejection；外键场景降级为告警并跳过。
6. 设置页默认轮询间隔从 5s 调整到 3s，并与主进程 fallback 保持一致。
7. 新增 JS 原生监听尝试：优先加载 `@crosscopy/clipboard` 的 `startWatch` 作为变更触发器（触发即补跑且可绕过 cooldown），失败时自动降级为轮询；支持 `TUFF_CLIPBOARD_NATIVE_WATCH=0|false|off` 显式关闭。

**修改文件**:
- `apps/core-app/src/main/modules/clipboard.ts`
- `apps/core-app/package.json`
- `apps/core-app/src/renderer/src/views/base/settings/SettingTools.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### macOS 托盘可见性收口（内置模板图标 + 启动策略兜底）

**变更类型**: 运行稳定性修复 / macOS 托盘可见性增强

**描述**: 针对 `startSilent + hideDock` 场景下“托盘不可见导致无入口”的问题，继续收敛托盘图标来源与激活策略。内置图标从 SVG data-url 方案切换为内置 PNG buffer（`nativeImage.createFromBuffer`），规避部分环境下 SVG 模板图标创建失败；同时补充托盘启动可观测日志与无入口恢复兜底，降低“Dock 隐藏但托盘未出现”的概率。

**主要变更**:
1. `TrayIconProvider` 内置 macOS 模板图标改为 PNG buffer 方案（`createFromBuffer`），默认优先使用并记录实际图标来源（built-in/file/empty）。
2. 保留文件图标回退路径，并提供 `TUFF_TRAY_USE_FILE_ICON=1` 显式切回旧行为。
3. `TrayManager.applyActivationPolicy` 新增配置推断：当 `hideDock=true` 或 `startSilent=true` 且未指定 `TUFF_TRAY_ACTIVATION` 时，自动设置为 `accessory`。
4. macOS 在 `hideDock=true` 或 `startSilent=true` 默认启用托盘标题兜底（默认标题 `T`），确保即使图标渲染异常仍有可见入口；可通过 `TUFF_TRAY_TITLE_FALLBACK=0` 关闭，`TUFF_TRAY_TITLE` 自定义标题。
5. `TrayManager` 新增托盘启动关键日志（图标来源、尺寸、title fallback 等），便于用户日志直观定位“托盘对象存在但不可见”的场景。
6. 托盘可用性判断增加“安全入口模式”边界校验（`hideDock/startSilent` 下对异常 `bounds` 判定为不可用），避免 Tray 对象存在但仍不可见。
7. `TrayManager` 增加托盘 bounds 快照日志（创建后 + 健康检查），补齐定位链路。
8. 托盘不可用时恢复策略升级为切换 `regular` 激活策略并同时拉起 Dock 与主窗口，避免无入口死锁。
9. 增加 text-only 标题兜底能力（`TUFF_TRAY_TEXT_ONLY=1` 显式启用），用于特定环境下的菜单栏可见性排查。
10. 新增“本次会话 Dock 兜底锁定”：若托盘在创建后出现空 bounds 或边界异常，则该会话保持 Dock 可见，避免托盘间歇性失效导致入口丢失。
11. Dock 兜底锁定触发后立即生效（无需等待后续窗口事件），减少“启动后瞬时无入口”窗口。
12. 托盘健康检查延后到启动后约 2.6s，并将 Dock 兜底触发条件收敛为“重试后仍失败”，避免启动早期 bounds 抖动导致误判。
13. macOS dev 模式在 `hideDock/startSilent` 时默认强制 `regular` 激活策略并保持 Dock 可见（可用 `TUFF_TRAY_DEV_FORCE_REGULAR=0` 关闭），优先保证开发可用入口稳定。

**修改文件**:
- `apps/core-app/src/main/modules/tray/tray-icon-provider.ts`
- `apps/core-app/src/main/modules/tray/tray-manager.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### CoreBox `Object has been destroyed` 闪退链路修复（窗口销毁竞态 + 插件事件降噪）

**变更类型**: 稳定性修复 / 生命周期竞态治理 / 通道超时降噪

**描述**: 针对日志中 `core-box:deactivate-providers -> closeDevTools -> Object has been destroyed` 的闪退链路，补齐窗口销毁态守卫；同时将不需要响应的插件通知改为广播，避免 `plugin:lifecycle:active`、`core-box:ui-resume`、`core-box:clipboard-meta-updated` 一类 60s 超时告警放大。

**主要变更**:
1. `WindowManager.hide` 增加销毁态检查与 `setPosition` 异常保护，避免定时器回调访问已销毁窗口。
2. `WindowManager.detachUIView` 关闭 DevTools 前增加 `isDevToolsOpened`/异常保护，规避 `closeDevTools` 空引用竞态。
3. CoreBox 的 `ui-resume`、`plugin:lifecycle:inactive`、`core-box:input-change`（UI转发链路）改为插件广播发送，减少无目标 view 时的请求超时。
4. PluginManager 的 `lifecycle active/inactive` 通知改为广播，避免 UI 未附着时 `sendToPlugin` 进入 60s request timeout。
5. OCR 的 `core-box:clipboard-meta-updated` 改为广播发送，降低插件 UI 关闭期间的无效请求告警。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/core-box/window.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
- `apps/core-app/src/main/modules/ocr/ocr-service.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### 退出流程梳理与收口（避免重复退出与关窗竞态）

**变更类型**: 生命周期一致性修复 / 退出链路稳定性治理

**描述**: 针对退出阶段“`window-all-closed` / `before-quit` / CoreBox 布局更新”并发触发导致的竞态，统一退出态标记并移除重复强退路径，避免关窗过程中继续触发布局缩放和 UI 解绑逻辑。

**主要变更**:
1. `precore` 在 `before-quit` 与 `window-all-closed` 统一标记 `isQuitting`，并在 dev graceful shutdown 进行中跳过重复 `app.quit()`。
2. `window-all-closed` 移除直接 `process.exit(0)`，改为依赖标准 `app.quit()` 链路，避免截断模块清理阶段。
3. CoreBox 布局更新在应用退出/DevProcessManager 关停中直接跳过，避免退出阶段触发 `shrink/detach` 竞态。
4. `CoreBoxManager.exitUIMode` 在应用退出态下快速短路，仅收敛状态，不再触发窗口操作。
5. 修正 `WindowAllClosedEvent` 的事件名误配（`WILL_QUIT` -> `WINDOW_ALL_CLOSED`），确保事件语义一致。

**修改文件**:
- `apps/core-app/src/main/core/precore.ts`
- `apps/core-app/src/main/core/eventbus/touch-event.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/index.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/manager.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### CoreBox 输入转发收敛（含 breaking 契约升级）

**变更类型**: 架构收敛 / 事件契约升级（Breaking Change）

**描述**: 将 CoreBox 输入转发链路从“分散组装 + 多点转发”收敛为统一入口 `input-forwarding`，并将 `core-box:input-change` 契约升级为强制完整载荷（`input/query/source` 必填）。该变更会影响任何仍发送不完整 payload 的调用方（需要补齐字段）。

**主要变更**:
1. 新增 `CoreBoxInputForwarding`，统一负责输入 payload 规范化与路由（UI attach 转发 + 激活 feature 转发）。
2. `PluginFeaturesAdapter.handleActiveFeatureInput` 改为接收标准化 payload，移除分散字段推断。
3. `CoreBoxInputChangeRequest` 升级为必填字段（`input`、`query`、`source`），作为统一输入事件契约。
4. `DivisionBox` 到插件的输入同步链路补齐 `source` 字段，避免契约断层。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/core-box/input-forwarding.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/input-transport.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/window.ts`
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
- `apps/core-app/src/main/modules/division-box/ipc.ts`
- `packages/utils/transport/events/types/core-box.ts`
- `docs/plan-prd/01-project/CHANGES.md`

## 2026-02-26

### 移除 sync:guard lint 门禁脚本

**变更类型**: 工程脚本清理 / 质量门禁调整

**描述**: 根据当前开发流程，移除已不再使用的 `sync:guard` 门禁脚本与 lint 链路依赖，避免 `pnpm lint` 因缺失脚本报错中断。

**主要变更**:
1. 根 `package.json` 的 `lint` 与 `lint:fix` 移除 `pnpm sync:guard` 调用。
2. 删除脚本文件 `scripts/check-no-legacy-sync-value-json.mjs`。
3. 保留 `intelligence:check` 作为 lint 链路中的附加检查项。

**修改文件**:
- `package.json`
- `scripts/check-no-legacy-sync-value-json.mjs`（删除）
- `docs/plan-prd/01-project/CHANGES.md`

### Release Notes 落地（Nexus Notes 页面 + GitHub 同步入库）

**变更类型**: 发布能力增强 / 更新通道体验补齐

**描述**: 新增版本化发布日志机制，约定 notes 路径为 `/notes/update_<version>`。Nexus release 更新项自动链接到 notes 页面；GitHub tag 发布后同步 Nexus release 时，会优先读取仓库 `notes/update_<version>.{zh,en}.md` 并写入 `notes/notesHtml`，实现“发布内容一次维护，多端统一展示”。

**主要变更**:
1. **Nexus Notes 路由**：新增 `/notes/[slug]` 页面与 `/api/notes/[slug]` 接口，按版本 slug 展示发布日志。
2. **Release Update 链接收敛**：发布类 updates 的 `link` 从 `updates#tag` 改为 `/notes/update_<version>`。
3. **GitHub → Nexus 同步增强**：`build-and-release` 在同步阶段优先读取 `notes/update_<version>.zh.md` / `.en.md`（或 `.md`）并渲染为 HTML 后写入 Nexus release。
4. **首个版本日志落地**：新增 `notes/update_2.4.7.zh.md` 与 `notes/update_2.4.7.en.md`。
5. **发布范围补齐**：`update_2.4.7` 内容按 `2.4.6 -> 2.4.7` 区间提交重新梳理，按 Intelligence/Release Pipeline/Nexus/Core-App/SDK/UI 六条主线归纳。
6. **提交级细化**：新增区间规模统计（提交量/触达文件/热区）与代表提交附录，便于后续审计与回溯。

**修改文件**:
- `apps/nexus/server/utils/releaseNotesPath.ts`
- `apps/nexus/server/utils/dashboardStore.ts`
- `apps/nexus/server/api/notes/[slug].get.ts`
- `apps/nexus/app/pages/notes/[slug].vue`
- `.github/workflows/build-and-release.yml`
- `notes/update_2.4.7.zh.md`
- `notes/update_2.4.7.en.md`
- `notes/update_2.4.7.appendix.md`
- `docs/plan-prd/01-project/CHANGES.md`

### v2.4.7 发版推进：文档进展梳理 + 版本基线对齐

**变更类型**: 发布推进 / 文档治理 / 版本管理

**描述**: 梳理当前项目文档进展并建立 `v2.4.7` 发版单一入口清单，统一记录发布门禁（Gate A~E）和阻塞项；同时将根包与 core-app 版本从 `2.4.7-beta.25` 对齐到稳定版 `2.4.7`，用于后续 tag 发布。

**主要变更**:
1. 新增发版推进文档：`RELEASE-2.4.7-CHECKLIST-2026-02-26.md`，沉淀文档进展矩阵、Gate 状态、阻塞与执行顺序。
2. 同步更新文档入口：`docs/INDEX.md`、`docs/plan-prd/README.md`、`docs/plan-prd/TODO.md` 增加发版推进入口与清单。
3. 路线图与质量基线补充 `v2.4.7` 发版门禁跟踪，明确 Gate A/B/C 的当前状态与后续收口动作。
4. 版本基线对齐：`package.json` 与 `apps/core-app/package.json` 统一为 `2.4.7`。

**修改文件**:
- `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `package.json`
- `apps/core-app/package.json`

### Tuff Intelligence Planner 超时与重试策略收口

**变更类型**: 运行稳定性修复 / Agent 执行策略细化

**描述**: 修复 Lab 实测中 planner 在 30s 超时直接失败且无有效重试的问题。统一将 Agent provider 调用超时下限收敛为 45s，并补齐“仅可重试错误”的单 provider 重试一次策略，避免短超时抖动导致编排链路提前中断。

**主要变更**:
1. Provider 调用超时下限统一为 `45_000ms`（即使 provider 配置为 30s，也会在 agent 调用链中按 45s 执行）。
2. 调用失败新增 retryable 判定（timeout/429/5xx/网络瞬断等），命中后同 provider 自动重试 1 次。
3. `retryCount` 指标改为“实际触发重试次数”，并在审计 metadata 中记录 `providerAttempt/retryable/willRetry`。

**修改文件**:
- `apps/nexus/server/utils/tuffIntelligenceLabService.ts`
- `apps/nexus/server/utils/__tests__/intelligence-agent-policy.test.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Legacy SyncStore 下线（移除遗留明文同步实现）

**变更类型**: P0 风险收口 / 架构清理

**描述**: 下线 `apps/nexus/server/utils/syncStore.ts`，移除遗留 `/api/sync/*` 时代的明文 `value_json` 同步实现，避免后续新功能误接入旧存储路径。当前同步能力继续仅保留 `/api/v1/sync/*` 主链路。

**主要变更**:
1. 删除 `apps/nexus/server/utils/syncStore.ts`（legacy 明文同步实现）。
2. 同步更新风险待办描述，明确 `syncStore.ts` 已清理，后续仅剩 `authStore.ts` 中历史 `value_json` 写入兼容清理。
3. 清理 `mergeUsers` 对 `sync_items` 的 `value_json` 明文写入 SQL，改为仅通过时间优先规则做冲突删除 + `user_id` 迁移，不再显式写 `value_json`。
4. 新增 CI 守卫工作流与检查脚本，禁止 `apps/nexus/server` 回归 `value_json` 关键字。
5. 新增 `mergeLegacySyncItemsForUsers` 单测，覆盖 source/target 新旧时间戳冲突场景。

**修改文件**:
- `apps/nexus/server/utils/syncStore.ts`（删除）
- `apps/nexus/server/utils/authStore.ts`
- `apps/nexus/server/utils/__tests__/authStore.sync-items-merge.test.ts`
- `scripts/check-no-legacy-sync-value-json.mjs`
- `.github/workflows/sync-guard.yml`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`

### FlipDialog 透传属性失效修复（遮罩误关根因）

**变更类型**: P1 行为修复 / 组件封装稳定性修复

**描述**: 系统性排查发现 `FlipDialog` 使用 `interface extends Omit<FlipOverlayProps, ...>` 的类型透传方案时，Vue SFC 编译后的 runtime props 仅保留显式声明字段，导致 `maskClosable/preventAccidentalClose/header/...` 等透传属性在运行时为 `undefined`。结果是业务层即使传入 `:prevent-accidental-close="true"`，实际未生效，遮罩点击仍按默认可关闭执行。

**主要变更**:
1. **透传策略调整**：`FlipDialog` 新增 `useAttrs()`，并通过 `v-bind="attrs"` 将未声明属性原样透传给 `TxFlipOverlay`。
2. **移除伪默认值**：移除 `maskClosable/closable/scrollable` 在 `FlipDialog` 内的无效默认声明，避免制造“看似配置成功但运行时丢失”的假象。
3. **双端一致修复**：同步修复 `apps/core-app` 与 `apps/nexus` 两套 `FlipDialog`，避免后续行为分叉。
4. **问题场景恢复**：`dashboard/api-keys` 的 `:mask-closable="false" + :prevent-accidental-close="true"` 现在会真实生效，遮罩点击不再直接关闭。

**修改文件**:
- `apps/nexus/app/components/base/dialog/FlipDialog.vue`
- `apps/core-app/src/renderer/src/components/base/dialog/FlipDialog.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### CoreApp FlipDialog P0 尺寸收敛（去最大化观感）

**变更类型**: UI 体验收敛 / 弹框规范治理 / 低风险样式与调用调整

**描述**: 针对 CoreApp 弹框“默认偏大”问题执行 P0 收口：下调 `FlipDialog` 全局尺寸 token，并将业务详情类弹框的 `size="xl"` 收敛到 `size="lg"`；仅保留样式编辑器等重编辑场景继续使用 `xl`。

**主要变更**:
1. **全局尺寸下调**：`md/lg/xl` 宽度 token 调整为 `760/920/1040` 基线（保留移动端收敛与 `full` 能力）。
2. **默认兜底宽度同步**：`FlipDialog` 卡片默认宽度 fallback 同步为新 `lg` 基线，减少样式变量失效时的“过大”回退。
3. **业务场景收敛**：以下弹框从 `xl` 调整为 `lg`，统一观感并降低“最大化”感受：
   - `TuffUserInfo`
   - `IntelligenceAuditOverlay`
   - `PluginDetails`
   - `PluginFeatures`
   - `PluginStorage`
   - `Store`
   - `ShortcutDialog`
   - `StoreSourceEditor`
4. **编辑器场景保留**：`CoreBoxEditorOverlay` / `MainLayoutEditorOverlay` / `RemotePresetOverlay` 继续使用 `xl`，用于高密度编辑内容。

**修改文件（核心）**:
- `apps/core-app/src/renderer/src/components/base/dialog/flip-dialog.utils.ts`
- `apps/core-app/src/renderer/src/components/base/dialog/FlipDialog.vue`
- `apps/core-app/src/renderer/src/components/base/TuffUserInfo.vue`
- `apps/core-app/src/renderer/src/components/intelligence/audit/IntelligenceAuditOverlay.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginDetails.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginFeatures.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginStorage.vue`
- `apps/core-app/src/renderer/src/views/base/Store.vue`
- `apps/core-app/src/renderer/src/views/base/settings/components/ShortcutDialog.vue`
- `apps/core-app/src/renderer/src/views/base/store/StoreSourceEditor.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### API Key 弹窗遮罩误触反馈修复（局部增强）

**变更类型**: 交互可用性修复 / 低风险样式调整

**描述**: `dashboard/api-keys` 创建弹窗开启 `preventAccidentalClose` 后，因全局 warning 红光已大幅减弱，遮罩误触时反馈不够可感知。为避免影响其它 overlay，改为在 API Key 弹窗局部增强遮罩误触反馈。

**主要变更**:
1. **局部 mask 标识**：API Key 创建弹窗新增 `mask-class="ApiKeyOverlay-Mask"`，只对该弹窗生效。
2. **误触可见性增强**：为 `ApiKeyOverlay-Mask` 增加更清晰的 warning 动画（遮罩红晕 + 卡片 glow），不改动全局 `TxFlipOverlay` warning 强度。
3. **交互提示补充**：遮罩区域增加 `not-allowed` 光标，明确“当前不可通过遮罩关闭”。
4. **danger 阴影慢淡出**：局部 warning glow 动画时长从 `720ms` 拉长到 `980ms`，并新增中段衰减关键帧（`52%`）让淡出更平缓。
5. **整卡弹动替代内层弹动**：禁用 API Key 场景下内层 `TxFlipOverlay-Shell` 的 focus 动画，改为在 `FlipDialog-Card` 上做整卡 scale 弹动，反馈更整体。
6. **关闭入口回归内置**：移除 API Key 页面手写 close 按钮，改为使用 `FlipDialog/TxFlipOverlay` 内置 header close，并透传 `headerTitle/headerDesc/closeAriaLabel`。

**修改文件**:
- `apps/nexus/app/pages/dashboard/api-keys.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Monorepo P0 稳定性收口（workspace 边界 + 包身份 + 根脚本）

**变更类型**: 工程稳定性修复 / 构建链路收敛 / 低风险配置治理

**描述**: 处理 workspace 误纳入构建产物目录导致的依赖解析波动（含 preload 模块加载异常场景）。本次将 `pnpm-workspace` 规则从宽匹配改为明确包目录 + 生成目录排除，并补齐缺失包身份信息（`name/private`）与根脚本契约，降低本地/CI 安装与运行时不确定性。

**主要变更**:
1. **workspace 边界收紧**：`apps/* + packages/* + plugins/*` 明确纳入，排除 `out/dist/.output/.nuxt/.vitepress/node_modules` 及 `apps/core-app/tuff/modules/plugins/**`。
2. **包身份补齐**：`touch-translation` 补齐包名并设为私有；`core-app/test/tuff-business/touch-music` 显式 `private: true`，降低误发布风险。
3. **根脚本收敛**：根 `lint/lint:fix` 统一为递归代码文件扫描命令，去掉对 `../../node_modules/eslint` 的硬路径耦合。
4. **pnpm 基线声明**：根包补齐 `packageManager`，并统一已修改子包的 `packageManager` 为同一版本。

**修改文件（核心）**:
- `pnpm-workspace.yaml`
- `package.json`
- `apps/core-app/package.json`
- `apps/nexus/package.json`
- `packages/test/package.json`
- `packages/tuff-business/package.json`
- `plugins/touch-music/package.json`
- `plugins/touch-translation/package.json`

### Tuff Intelligence Agent 一次切换收口（1+2+3+4）

**变更类型**: 架构收口 / Breaking 契约升级 / Lab 管理能力补齐

**描述**: 按一次切换策略完成 `intelligence-agent` 主链路增强：Provider 路由契约收口、Nexus/Core schema 对齐、Prompt Registry 管理 API + Lab UI 落地、`session.start -> plan -> execute -> reflect -> finalize` LangGraph 状态机接管 stream 运行主线。

**主要变更**:
1. **Provider 路由契约收口**：前端移除 `:id.probe/:id.test` legacy fallback；legacy 点号路由与中间件兼容入口统一返回 `410`，仅保留标准斜杠路由 `:id/probe|test`。
2. **共享 schema 对齐**：`packages/utils/types/intelligence.ts` 新增 Provider Sync DTO、Prompt Registry/Binding 管理 DTO、agent trace contract 常量，Nexus sync API 与 Core 渲染侧统一消费同一类型。
3. **Prompt Registry 管理能力补齐**：新增 `/api/admin/intelligence-agent/prompts*` 与 `/prompt-bindings*`（GET/POST/DELETE），并在 `IntelligenceAgentWorkspace` 增加 Prompt Registry 管理弹窗（记录与绑定的增删改查）。
4. **LangGraph 接管 stream 执行链**：新增 `intelligenceAgentGraphRunner`，将 `session/stream` 执行链切换为显式五阶段节点编排，保留审批门控、trace/checkpoint、pause/disconnect 和 metrics/audit 出口。
5. **执行策略收口**：执行阶段默认 `fail-fast`；仅当 action 显式 `continueOnError=true` 且满足“低风险读工具”策略时允许继续执行。
6. **Core 编排同构补齐**：Core 新增 `intelligence-agent-graph-runner`（LangGraph 五阶段节点），并在 `session:start` 增加 `autoRunGraph` 可选开关，支持按同构状态机一键运行 `plan -> execute -> reflect -> finalize`。

**修改文件（核心）**:
- `apps/nexus/server/utils/intelligenceAgentGraphRunner.ts`
- `apps/nexus/server/api/admin/intelligence-agent/session/stream.post.ts`
- `apps/nexus/server/api/admin/intelligence-agent/prompts.{get,post,delete}.ts`
- `apps/nexus/server/api/admin/intelligence-agent/prompt-bindings.{get,post,delete}.ts`
- `apps/nexus/server/middleware/intelligence-route-compat.ts`
- `apps/nexus/server/api/dashboard/intelligence/providers/[id].{probe,test}.post.ts`
- `apps/nexus/app/components/dashboard/intelligence/IntelligenceAgentWorkspace.vue`
- `apps/nexus/app/pages/dashboard/admin/intelligence.vue`
- `apps/nexus/server/api/dashboard/intelligence/providers/sync.get.ts`
- `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceChannelsPage.vue`
- `packages/utils/types/intelligence.ts`

### Nexus i18n 去 Query 化与 Locale 编排层收敛

**变更类型**: 稳定性修复 / 行为约束收口 / 兼容迁移

**描述**: Nexus i18n 改为 `no_prefix + cookie + 账号偏好` 主流模式，移除前端 `?lang` 生成与依赖；新增统一 Locale Orchestrator 串行化 `setLocale`，解决登录/回调/路由切换期间语言随机回退英文的问题。服务端同步收口 locale 为 `en|zh|null`，并对 profile patch 入参加入校验与归一化。

**主要变更**:
1. **统一编排层**：新增 `useLocaleOrchestrator`，统一处理初始化、归一化、持久化、legacy `lang` 一次性兼容读取与 URL 清理、登录后 profile locale 同步。
2. **前端去 query 化**：`app.vue`、`useSignIn`、`LanguageToggle`、`HeaderUserMenu`、`TheHeader`、`TuffLandingWaitlist`、`sign-up` 链路移除 `lang` 拼接/消费，不再在地址栏暴露语言参数。
3. **OAuth 回调参数收敛**：`buildOauthCallbackUrl` 不再注入 `lang`，相关单测更新，避免认证链路再次污染 query。
4. **服务端 locale 规范化**：新增 `server/utils/locale.ts`，`profile.patch` 三条接口仅接受 `en|zh|null`（兼容 `en-US/zh-CN` 自动归一化，非法值返回 400）。
5. **authStore 一致性**：`createUser/updateUserProfile/mapUser` 写入与读取统一归一化 locale；`me` 系列接口统一输出规范 locale。
6. **测试补齐**：新增 `server/utils/__tests__/locale.test.ts` 覆盖 locale 归一化与合法性判断。

**修改文件（核心）**:
- `apps/nexus/app/composables/useLocaleOrchestrator.ts`
- `apps/nexus/app/app.vue`
- `apps/nexus/app/composables/useSignIn.ts`
- `apps/nexus/app/composables/useOauthContext.ts`
- `apps/nexus/app/composables/useUserLocale.ts`
- `apps/nexus/app/components/LanguageToggle.vue`
- `apps/nexus/app/components/HeaderUserMenu.vue`
- `apps/nexus/app/components/TheHeader.vue`
- `apps/nexus/app/components/tuff/landing/TuffLandingWaitlist.vue`
- `apps/nexus/app/pages/sign-up/index.vue`
- `apps/nexus/server/utils/locale.ts`
- `apps/nexus/server/utils/authStore.ts`
- `apps/nexus/server/api/user/profile.patch.ts`
- `apps/nexus/server/api/auth/profile.patch.ts`
- `apps/nexus/server/api/v1/auth/profile.patch.ts`
- `apps/nexus/server/api/user/me.get.ts`
- `apps/nexus/server/api/auth/me.get.ts`
- `apps/nexus/server/api/v1/auth/me.get.ts`
- `apps/nexus/server/utils/__tests__/locale.test.ts`

### API Key 弹窗 i18n 收敛与显式关闭按钮补齐

**变更类型**: Dashboard 可用性修复 / 国际化完善

**描述**: 修复 API Key 创建弹窗缺少显式关闭按钮的问题，并将页面与弹窗内文案全面接入 `apps/nexus` i18n（`en/zh`），避免中英文混杂与硬编码文本。

**主要变更**:
1. **显式关闭入口**：API Key 创建弹窗顶部新增独立 close 按钮（`TxButton`），不依赖遮罩点击关闭。
2. **弹窗文案全量 i18n**：标题、副标题、表单字段、权限风险提示、按钮文本、创建中态文案全部改为 `t('dashboard.sections.apiKeys.*')`。
3. **列表与状态文案 i18n**：页面标题、空态、创建成功提示、创建/最近使用/过期状态文案、复制按钮文案统一 i18n 化。
4. **错误与确认文案 i18n**：加载/创建/删除失败错误文案与删除确认弹窗文案统一迁移到语言包。
5. **权限树与过期选项 i18n**：`scopeTree` 与 `expiryOptions` 改为 computed + `t()` 生成，跟随语言切换实时更新。

**修改文件**:
- `apps/nexus/app/pages/dashboard/api-keys.vue`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/i18n/locales/zh.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### TxFlipOverlay close warning 红色强度下调（再次减弱）

**变更类型**: 交互视觉微调 / 低风险样式调整

**描述**: `TxFlipOverlay` 的 close-guard warning 红色提示仍偏浓。保持原有动画节奏与范围不变，在上一版基础上继续将遮罩红晕与卡片 glow 的透明度再下调 80%，进一步降低视觉压迫感。

**主要变更**:
1. **遮罩红晕继续减弱**：`tx-flip-overlay-mask-warning` 的红色径向渐变 alpha 从 `0.11/0.06` 调整为 `0.022/0.012`（在上一版基础上再减 80%）。
2. **卡片 glow 继续减弱**：`tx-flip-overlay-close-guard-warning` 的三层 red drop-shadow alpha 从 `0.49/0.36/0.25` 调整为 `0.098/0.072/0.05`（在上一版基础上再减 80%）。

**修改文件**:
- `packages/tuffex/packages/components/src/flip-overlay/src/TxFlipOverlay.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Nexus Intelligence Providers 测试能力升级（详细弹窗 + 模型选择 + 响应展示）

**变更类型**: 管理后台体验增强 / Provider 诊断能力补齐 / 低风险接口扩展

**描述**: Nexus Intelligence 管理页将 providers 的“测试连接”从列表轻量提示升级为 `TxFlipOverlay` 详细测试弹窗，支持选择模型、输入测试 prompt，并展示模型返回文本、延迟、endpoint、trace 及错误片段。后端新增 provider probe 接口，复用 LangChain 调用链执行真实模型探测。

**主要变更**:
1. **前端测试交互升级**：`/dashboard/admin/intelligence` 的 provider 测试按钮改为打开详细测试弹窗，不再仅展示列表内 success/fail 提示。
2. **可选模型测试**：弹窗支持从 provider 已配置模型中选择目标模型（可回退默认模型）。
3. **响应细节可视化**：展示模型正文输出、latency、endpoint、traceId、retry 次数和错误响应片段。
4. **后端 probe 能力新增**：新增 `/api/dashboard/intelligence/providers/:id/probe`，以 LangChain 调用 provider 并返回结构化诊断结果。
5. **调用链复用**：`tuffIntelligenceLabService` 新增 `probeIntelligenceLabProvider` 导出，避免重复实现模型调用逻辑。
6. **风险功能门控降级**：当 `/api/dashboard/intelligence/ip-bans` 在当前环境被 feature-gate 关闭（`404 Feature not found`）时，前端自动降级隐藏 IP 封禁面板，不再持续显示错误噪音。
7. **路由命名修正**：补充 `providers/[id]/probe.post.ts` 与 `providers/[id]/test.post.ts`，确保前端调用的 `/providers/:id/probe` 与 `/providers/:id/test` 命中正确 API 路由（避免误落到页面 HTML 响应）。
8. **前端调用硬切换**：Provider Probe 与编辑态模型拉取统一只调用 `/providers/:id/probe|test`，不再做 legacy 回退。
9. **HTML 回包显式失败**：当错误路由返回 `200 + text/html`（非 API JSON）时，前端直接判定为错误，避免“表面 200 实际失败”的假成功场景。
10. **服务端契约硬收口**：`intelligence-route-compat` 中间件对 legacy 点号路由直接返回 `410`，不再执行重定向兼容。

**修改文件**:
- `apps/nexus/app/pages/dashboard/admin/intelligence.vue`
- `apps/nexus/server/api/dashboard/intelligence/providers/[id].probe.post.ts`
- `apps/nexus/server/utils/tuffIntelligenceLabService.ts`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/i18n/locales/en.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### FlipDialog 统一落地（Nexus 业务 FlipOverlay 场景迁移）

**变更类型**: 交互一致性优化 / 弹框体系收敛 / 中低风险页面改造

**描述**: 延续 CoreApp 的 `FlipDialog` 方案，在 Nexus `app/pages + app/components` 的业务场景中完成 `TxFlipOverlay` 迁移。统一 reference 传递、遮罩行为、source 隐藏恢复与宽弹框尺寸约束（`md/lg/xl`），并移除页面级重复 `Teleport`。文档演示与测试页（`content/demos`、`pages/test`）保留 `TxFlipOverlay`，用于组件示例与堆叠行为验证。

**主要变更**:
1. **Nexus 统一组件新增**：新增 `apps/nexus/app/components/base/dialog/FlipDialog.vue` 与 `flip-dialog.utils.ts`，复用 `reference` 优先级、自动隐藏 source、宽弹框尺寸映射与移动端收敛规则。
2. **业务页迁移完成**：Nexus 业务范围内历史 `TxFlipOverlay` 调用迁移到 `FlipDialog`，并统一 `source -> reference`。
3. **页面结构收敛**：移除业务页中包裹 `TxFlipOverlay` 的 `Teleport to="body"`，统一由 `FlipDialog` 内部承载。
4. **尺寸规范落地**：按场景设置 `size=md/lg/xl`，避免高瘦弹框和各页面自定义尺寸漂移。
5. **保留边界明确**：`apps/nexus/app/pages/test/flip-overlay-stack.vue` 与 `apps/nexus/app/components/content/demos/FlipOverlayFlipOverlayDemo.vue` 继续使用 `TxFlipOverlay`，不纳入业务迁移闭环。

**修改文件（核心）**:
- `apps/nexus/app/components/base/dialog/FlipDialog.vue`
- `apps/nexus/app/components/base/dialog/flip-dialog.utils.ts`
- `apps/nexus/app/components/assets/create/AssetCreateOverlay.vue`
- `apps/nexus/app/components/CreatePluginDrawer.vue`
- `apps/nexus/app/components/dashboard/ReviewModalOverlay.vue`
- `apps/nexus/app/components/VersionDrawer.vue`
- `apps/nexus/app/components/dashboard/PluginMetadataOverlay.vue`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
- `apps/nexus/app/components/dashboard/intelligence/IntelligenceAgentWorkspace.vue`
- `apps/nexus/app/components/docs/DocsAssistantDialog.vue`
- `apps/nexus/app/pages/dashboard/api-keys.vue`
- `apps/nexus/app/pages/dashboard/storage.vue`
- `apps/nexus/app/pages/dashboard/admin/intelligence.vue`
- `apps/nexus/app/pages/dashboard/account.vue`
- `apps/nexus/app/pages/dashboard/team.vue`
- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/app/pages/store.vue`

## 2026-02-25

### FlipDialog 统一落地（CoreApp FlipOverlay 场景收敛）

**变更类型**: 交互一致性优化 / 组件封装升级 / 页面调用收敛

**描述**: 在渲染层新增 `FlipDialog` 统一封装，替代业务页直接使用 `TxFlipOverlay + Teleport` 的分散实现。新组件统一了 reference 输入方式、遮罩行为、source 隐藏策略与宽弹框尺寸规则，并完成现有 16 个 `TxFlipOverlay` 场景迁移。

**主要变更**:
1. **统一组件新增**：新增 `FlipDialog`，支持 `reference` 参数与 `#reference` 插槽，且 `reference` 参数优先级最高。
2. **触发与可控打开**：`#reference` 默认点击自动打开（可通过 `referenceAutoOpen=false` 关闭），支持手动 `open/close/toggle`。
3. **source 隐藏策略**：打开时自动隐藏 reference 元素（`opacity: 0 + pointer-events: none`），关闭时恢复；`DOMRect` 场景优先隐藏 reference 插槽元素。
4. **尺寸体系统一**：新增 `size=md/lg/xl/full` 宽弹框规范，支持 `width/maxHeight/minHeight` 覆盖，移动端统一降维宽高策略。
5. **基础能力补齐**：`TxFlipOverlay` 增加 `cardStyle` 能力并接入模板，以支持上层统一尺寸透传。
6. **场景迁移完成**：以下 16 个场景完成 `TxFlipOverlay -> FlipDialog` 迁移，并移除页面级重复 `Teleport`：
   - `StoreHeader`
   - `IntelligenceAuditOverlay`
   - `TuffUserInfo`
   - `StoreSourceEditor`
   - `PluginInfo`
   - `PluginStorage`
   - `PluginFeatures`
   - `PluginDevSettingsOverlay`
   - `PluginDetails`
   - `RemotePresetOverlay`
   - `CoreBoxEditorOverlay`
   - `FlatDownload`
   - `MainLayoutEditorOverlay`
   - `Plugin`
   - `ShortcutDialog`
   - `Store`

**修改文件（核心）**:
- `apps/core-app/src/renderer/src/components/base/dialog/FlipDialog.vue`
- `apps/core-app/src/renderer/src/components/base/dialog/flip-dialog.utils.ts`
- `apps/core-app/src/renderer/src/components/base/dialog/FlipDialog.test.ts`
- `apps/core-app/src/renderer/src/components/store/StoreHeader.vue`
- `apps/core-app/src/renderer/src/components/intelligence/audit/IntelligenceAuditOverlay.vue`
- `apps/core-app/src/renderer/src/components/base/TuffUserInfo.vue`
- `apps/core-app/src/renderer/src/views/base/store/StoreSourceEditor.vue`
- `apps/core-app/src/renderer/src/components/plugin/PluginInfo.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginStorage.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginFeatures.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginDevSettingsOverlay.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginDetails.vue`
- `apps/core-app/src/renderer/src/views/base/styles/editors/RemotePresetOverlay.vue`
- `apps/core-app/src/renderer/src/views/base/styles/editors/CoreBoxEditorOverlay.vue`
- `apps/core-app/src/renderer/src/components/download/FlatDownload.vue`
- `apps/core-app/src/renderer/src/views/base/styles/editors/MainLayoutEditorOverlay.vue`
- `apps/core-app/src/renderer/src/views/base/Plugin.vue`
- `apps/core-app/src/renderer/src/views/base/settings/components/ShortcutDialog.vue`
- `apps/core-app/src/renderer/src/views/base/Store.vue`
- `packages/tuffex/packages/components/src/flip-overlay/src/types.ts`
- `packages/tuffex/packages/components/src/flip-overlay/src/TxFlipOverlay.vue`
- `packages/tuffex/packages/components/src/flip-overlay/__tests__/flip-overlay.test.ts`

### Intelligence Agent/Lab 页面收敛为共享工作台（Admin）

**变更类型**: 联调支持 / 页面能力恢复 / 低风险前台改造

**描述**: `intelligence-agent` 页面能力（会话流、历史回放、trace 详情、审批门控）抽取为共享工作台组件，`intelligence-agent` 与 `intelligence-lab` 两个路由统一复用，消除双维护。

**主要变更**:
1. **共享组件抽取**：新增 `IntelligenceAgentWorkspace`，承载完整 Agent 工作台交互。
2. **双路由复用**：`/dashboard/admin/intelligence-agent` 与 `/dashboard/admin/intelligence-lab` 统一渲染共享组件。
3. **能力对齐**：Lab 路由直接拥有 history/trace/approval 等完整能力，不再使用简化页。

**修改文件**:
- `apps/nexus/app/components/dashboard/intelligence/IntelligenceAgentWorkspace.vue`
- `apps/nexus/app/pages/dashboard/admin/intelligence-agent.vue`
- `apps/nexus/app/pages/dashboard/admin/intelligence-lab.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Intelligence 渠道同步（Nexus -> Core-App）与 Nexus LLM 优先链路

**变更类型**: 配置治理 / 渠道同步 / 运行链路优化

**描述**: 新增 Nexus 渠道同步接口，Core-App 渠道页支持一键拉取 Nexus providers 并合并本地配置；同时强化 `tuff-nexus` provider 的运行时 token 注入，确保 Core-App 在无手填 API Key 场景下优先可用 Nexus LLM。

**主要变更**:
1. **Nexus 同步接口**：新增 `/api/dashboard/intelligence/providers/sync`，输出标准化 provider schema（不回传明文 apiKey）。
2. **Core-App 同步入口**：`IntelligenceChannelsPage` 新增“从 Nexus 同步”操作，支持拉取并合并 providers。
3. **Nexus 优先保障**：同步后确保 `tuff-nexus-default` 保持启用与高优先级；无登录态时提示认证。
4. **运行时注入**：Core 主进程在 `testProvider/fetchModels` 场景为 `tuff-nexus` 自动注入 auth token（缺省回退 guest），避免手填 API Key。
5. **前端校验放宽**：`tuff-nexus` 渠道不再被前端 API Key 必填规则阻塞，配置错误提示更准确。

**修改文件**:
- `apps/nexus/server/api/dashboard/intelligence/providers/sync.get.ts`
- `apps/core-app/src/main/modules/ai/intelligence-module.ts`
- `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceChannelsPage.vue`
- `apps/core-app/src/renderer/src/components/intelligence/config/IntelligenceApiConfig.vue`
- `apps/core-app/src/renderer/src/components/intelligence/layout/IntelligenceItem.vue`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `docs/plan-prd/01-project/CHANGES.md`

### Assets 版本驳回重提（Re-edit）与审核时间线

**变更类型**: 审核流能力补齐 / 交互优化 / 数据模型扩展

**描述**: Dashboard Assets 支持对 `rejected` 版本进行 Re-edit 并重新提交审核；审核驳回原因可透传并持久化到版本记录。同时新增插件级“流程时间线”，管理员与发布者可查看插件与版本在审核链路中的关键状态演进。

**主要变更**:
1. **Re-edit 闭环**：在版本详情中为 `rejected` 版本新增 `Re-edit` 入口，复用 `VersionDrawer`（`create/reedit` 双模式），支持替换包与更新 changelog 后重新提审。
2. **后端重提接口**：新增 `PATCH /api/dashboard/plugins/:id/versions/:versionId/reedit`，仅 owner/admin 可操作，且仅允许 `rejected` 版本重提；重提后版本状态置为 `pending`。
3. **驳回原因落库**：版本状态接口支持 `reason` 入参；`rejected` 时写入 `reject_reason`，重新提审或通过时清空该字段。
4. **时间线事件流**：新增插件审核时间线存储与查询，记录 `plugin.created / plugin.status.changed / version.created / version.status.changed / version.reedited` 事件，并在详情抽屉展示。
5. **可见性控制**：时间线接口与前端展示仅对管理员与插件发布者开放。

**修改文件**:
- `apps/nexus/server/utils/pluginsStore.ts`
- `apps/nexus/server/api/dashboard/plugins/[id]/status.patch.ts`
- `apps/nexus/server/api/dashboard/plugins/[id]/versions/[versionId].patch.ts`
- `apps/nexus/server/api/dashboard/plugins/[id]/versions/[versionId]/reedit.patch.ts`
- `apps/nexus/server/api/dashboard/plugins/[id]/timeline.get.ts`
- `apps/nexus/app/pages/dashboard/assets.vue`
- `apps/nexus/app/components/VersionDrawer.vue`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
- `apps/nexus/app/types/dashboard-plugin.ts`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/i18n/locales/en.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Intelligence 模型调用全量切到 LangChain（Core + Nexus）

**变更类型**: Breaking Change / 架构收敛 / Provider 调用链重构

**描述**: Core 与 Nexus 的 Intelligence 模型调用路径从 provider 直连 HTTP（`/chat/completions`、`/messages`、`/api/chat`）切换为 LangChain 统一入口。Core 侧 OpenAI/DeepSeek/Siliconflow/Anthropic/Local provider 统一使用 LangChain adapter；Nexus agent 调用层同步切换为 LangChain 模型实例调用，保留现有审批、trace、fallback、retry、session contract。

**主要变更**:
1. **Core Provider 收敛**：新增 OpenAI-compatible LangChain provider 基座，OpenAI/DeepSeek/Siliconflow/Local 统一继承；Anthropic provider 切到 `@langchain/anthropic`。
2. **Nexus Agent 调用收敛**：`tuffIntelligenceLabService` 的 OpenAI-compatible / Anthropic / Local 模型调用改为 LangChain。
3. **直连移除**：从核心模型执行路径移除 provider 直连 fetch 调用，改为 LangChain runtime 调用。
4. **依赖补齐**：Core/Nexus 增加 `@langchain/anthropic`，Core 增加 `@langchain/openai` 显式依赖。

**修改文件（核心）**:
- `apps/core-app/src/main/modules/ai/providers/langchain-openai-compatible-provider.ts`
- `apps/core-app/src/main/modules/ai/providers/openai-provider.ts`
- `apps/core-app/src/main/modules/ai/providers/deepseek-provider.ts`
- `apps/core-app/src/main/modules/ai/providers/siliconflow-provider.ts`
- `apps/core-app/src/main/modules/ai/providers/anthropic-provider.ts`
- `apps/core-app/src/main/modules/ai/providers/local-provider.ts`
- `apps/nexus/server/utils/tuffIntelligenceLabService.ts`
- `apps/core-app/package.json`
- `apps/nexus/package.json`

### Store 命名硬切换（CoreApp + Nexus + Utils）

**变更类型**: Breaking Change / 协议与路由统一 / 数据迁移

**描述**: 插件与 Agent 的 `market` 体系执行无兼容硬切换为 `store`。`packages/utils`、`apps/core-app`、`apps/nexus` 的事件、SDK、路由、API 与页面路径统一改名；CoreApp 插件商店详情在市场页改为 `TxFlipOverlay` 展示。旧 `market` 命名仅保留在一次性迁移来源常量（历史表名/KV key）中用于数据复制，迁移后仅读写 `store` 命名。

**主要变更**:
1. **协议域统一**：插件与 Agent 事件域统一改为 `store` 命名（旧 `market` 命名空间已移除）。
2. **路由与页面统一**：CoreApp 与 Nexus 统一 `/store*`，移除 `/market*`。
3. **CoreApp 交互改造**：`/store` 详情改为 `TxFlipOverlay`，支持 source-aware FLIP；`/store/installed` 维持原展示方式。
4. **Nexus API 硬切换**：插件与审核接口统一切换到 `/api/store/*` 与 `/api/admin/store/reviews/*`。
5. **一次性数据迁移**：评分/评论表与 KV key 从 legacy `market` 命名迁移到 `store` 命名，仅在新命名无数据且旧命名有数据时执行复制（幂等）。
6. **文档全量同步**：`docs` 与 `apps/nexus/content` 的产品域术语、事件与路径完成 `market -> store` 全量替换（保留第三方固定链接语义）。

**修改文件（核心）**:
- `packages/utils/store/*`
- `packages/utils/transport/events/types/store.ts`
- `packages/utils/transport/sdk/domains/store.ts`
- `packages/utils/transport/sdk/domains/agents-store.ts`
- `apps/core-app/src/renderer/src/views/base/Store.vue`
- `apps/core-app/src/renderer/src/views/base/store/StoreDetailOverlay.vue`
- `apps/core-app/src/main/service/store-api.service.ts`
- `apps/core-app/src/main/service/agent-store.service.ts`
- `apps/nexus/app/pages/store.vue`
- `apps/nexus/app/layouts/store.vue`
- `apps/nexus/server/api/store/*`
- `apps/nexus/server/api/admin/store/reviews/*`
- `apps/nexus/server/utils/pluginRatingStore.ts`
- `apps/nexus/server/utils/pluginReviewStore.ts`

### FlipOverlay 关闭按钮内置化（业务页收敛）

**变更类型**: 交互一致性优化 / 组件用法收敛

**描述**: 清理业务页面中 `TxFlipOverlay` 场景的手写 close 按钮，统一回收为组件内置 close 入口，并将部分弹层标题/说明迁移到内置 header 配置，降低调用侧重复实现。

**主要变更**:
1. **关闭入口统一**：移除多个 overlay 里的手写 `CloseBtn`/`i-carbon-close` 按钮，改为 `TxFlipOverlay` 内置 close。
2. **header 配置收敛**：在可复用场景切换为 `header-title/header-desc/header-actions`，减少调用侧自管头部结构。
3. **复杂头部保留策略**：对仍需保留业务操作区（如刷新、筛选、步骤导航）的弹层，仅去除手写 close，保持原交互不变。

**修改文件**:
- `apps/core-app/src/renderer/src/components/base/TuffUserInfo.vue`
- `apps/core-app/src/renderer/src/components/download/FlatDownload.vue`
- `apps/core-app/src/renderer/src/components/intelligence/audit/IntelligenceAuditOverlay.vue`
- `apps/core-app/src/renderer/src/components/plugin/PluginInfo.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginDetails.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginDevSettingsOverlay.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginStorage.vue`
- `apps/core-app/src/renderer/src/views/base/store/StoreSourceEditor.vue`
- `apps/nexus/app/components/CreatePluginDrawer.vue`
- `apps/nexus/app/components/VersionDrawer.vue`
- `apps/nexus/app/components/assets/create/AssetCreateOverlay.vue`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
- `apps/nexus/app/components/dashboard/PluginMetadataOverlay.vue`
- `apps/nexus/app/components/docs/DocsAssistantDialog.vue`
- `apps/nexus/app/pages/dashboard/admin/intelligence-agent.vue`
- `apps/nexus/app/pages/dashboard/api-keys.vue`
- `apps/nexus/app/pages/dashboard/storage.vue`
- `apps/nexus/app/pages/docs/[...slug].vue`
- `docs/plan-prd/01-project/CHANGES.md`

### FlipOverlay 全量内置参数收敛（去手动动画/样式透传）

**变更类型**: 组件用法统一 / 样式收敛

**描述**: 在不新增 Core/Nexus 包装层的前提下，批量将业务侧 `TxFlipOverlay` 切换为组件内置默认行为，移除重复透传的动画与样式参数（`duration/rotate/speed/transition-name/mask-class/card-class`），保留必要业务特例（如 `closable=false`、`mask-closable=false`、`prevent-accidental-close=true`）。

**主要变更**:
1. **动画参数统一**：业务页不再手动传 `:duration/:rotate-x/:rotate-y/:speed-boost`，统一使用 `TxFlipOverlay` 内置默认动画。
2. **样式入口收敛**：业务页不再依赖 `transition-name/mask-class/card-class` 覆盖默认表现，统一使用组件内置 mask/card 风格。
3. **特例保留**：仅保留交互语义特例配置（如禁用右上角 close、防误关闭），避免破坏关键流程。
4. **冗余常量清理**：删除调用侧遗留 `FLIP_* / ISSUE_FLIP_* / ADD_DIALOG_FLIP_*` 常量，减少重复配置面。
5. **动态宽度场景内移**：`AssetCreateOverlay` 的宽窄切换从 `card-class` 下沉到内容容器类，避免对外部 card class 的依赖。

**修改文件（核心）**:
- `apps/core-app/src/renderer/src/components/base/TuffUserInfo.vue`
- `apps/core-app/src/renderer/src/components/download/FlatDownload.vue`
- `apps/core-app/src/renderer/src/components/intelligence/audit/IntelligenceAuditOverlay.vue`
- `apps/core-app/src/renderer/src/components/plugin/PluginInfo.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginDetails.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginDevSettingsOverlay.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginFeatures.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginStorage.vue`
- `apps/core-app/src/renderer/src/views/base/Plugin.vue`
- `apps/core-app/src/renderer/src/views/base/settings/components/ShortcutDialog.vue`
- `apps/core-app/src/renderer/src/views/base/styles/editors/CoreBoxEditorOverlay.vue`
- `apps/core-app/src/renderer/src/views/base/styles/editors/MainLayoutEditorOverlay.vue`
- `apps/core-app/src/renderer/src/views/base/styles/editors/RemotePresetOverlay.vue`
- `apps/nexus/app/components/CreatePluginDrawer.vue`
- `apps/nexus/app/components/VersionDrawer.vue`
- `apps/nexus/app/components/assets/create/AssetCreateOverlay.vue`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
- `apps/nexus/app/components/docs/DocsAssistantDialog.vue`
- `apps/nexus/app/pages/dashboard/account.vue`
- `apps/nexus/app/pages/dashboard/admin/intelligence.vue`
- `apps/nexus/app/pages/dashboard/api-keys.vue`
- `apps/nexus/app/pages/dashboard/storage.vue`
- `apps/nexus/app/pages/dashboard/team.vue`
- `apps/nexus/app/pages/docs/[...slug].vue`
- `docs/plan-prd/01-project/CHANGES.md`

### FlipOverlay 第二轮全量清理（移除遗留死样式）

**变更类型**: 组件用法统一 / 样式债务清理

**描述**: 在第一轮参数收敛后，继续对 CoreApp + Nexus 全量 `TxFlipOverlay` 使用点做二次扫描，移除已无调用入口的 `*-Mask/*-Card` 与 `TxFlipOverlay-*` 覆盖样式，统一回归组件内置样式与动画。

**主要变更**:
1. **死样式清理**：删除历史透传类名对应样式（如 `UserProfileOverlay-* / ProviderOverlay-* / StoreDetailOverlay-*` 等）。
2. **覆盖项归零**：清理 `:global(.XxxOverlay-Card .TxFlipOverlay-Header/Close/Actions)` 这类对内置结构的外部覆盖。
3. **范围补齐**：补齐第一轮未覆盖文件（`StoreSourceEditor`、`StoreHeader`、`PluginStorage`、`PluginDevSettingsOverlay`、`FlatDownload` 等）。
4. **保留策略不变**：仅保留业务语义开关（如 `closable=false`、`mask-closable=false`、`prevent-accidental-close=true`），不新增 wrapper。

**修改文件（节选）**:
- `apps/core-app/src/renderer/src/components/base/TuffUserInfo.vue`
- `apps/core-app/src/renderer/src/components/download/FlatDownload.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginDevSettingsOverlay.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginStorage.vue`
- `apps/core-app/src/renderer/src/components/store/StoreHeader.vue`
- `apps/core-app/src/renderer/src/views/base/store/StoreSourceEditor.vue`
- `apps/core-app/src/renderer/src/views/base/styles/editors/CoreBoxEditorOverlay.vue`
- `apps/nexus/app/components/CreatePluginDrawer.vue`
- `apps/nexus/app/components/VersionDrawer.vue`
- `apps/nexus/app/components/docs/DocsAssistantDialog.vue`
- `apps/nexus/app/pages/dashboard/account.vue`
- `apps/nexus/app/pages/dashboard/admin/intelligence.vue`
- `apps/nexus/app/pages/dashboard/api-keys.vue`
- `apps/nexus/app/pages/dashboard/storage.vue`
- `apps/nexus/app/pages/dashboard/team.vue`
- `apps/nexus/app/pages/store.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### 修复: Assets 列表状态悬浮提示审核中

**变更类型**: 交互细节优化 / Bug 修复

**描述**: 在 Dashboard Assets「我的发布物」表格中，当发布物存在待审核项（插件本身待审核或任一版本待审核）时，状态徽标悬浮提示“正在审核中”，避免仅显示“已通过”造成误解。

**主要变更**:
1. **待审核判定补齐**：新增 `hasPluginPendingReview`，并由后端透出 `hasPendingReview/pendingReviewCount`，统一判定插件与版本层面的 pending 状态。
2. **状态悬浮提示**：状态徽标与最新版本徽标均改为 `TxTooltip` 提示，在命中待审核项时 hover 显示“正在审核中”。
3. **i18n 文案补齐**：新增 `dashboard.sections.plugins.reviewingHint` 中英文文案。

**修改文件**:
- `apps/nexus/app/pages/dashboard/assets.vue`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/i18n/locales/en.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Intelligence Agent 一次切换（LangGraph + Prompt Registry）

**变更类型**: 架构切换 / Breaking API / 配置治理

**描述**: Intelligence 编排统一切换到 `agent` 命名空间，Core IPC 与 Nexus Admin API 同步改为 `intelligence-agent` 路径；Prompt 从 capability 内嵌模板迁移到独立 Prompt Registry（record + binding）并在 Core(SQLite) / Nexus(D1) 对齐 schema。旧 `intelligence-lab` 路由统一返回 `410`。

**主要变更**:
1. **Core IPC 命名收敛**：新增并启用 `intelligence:agent:session:{start,heartbeat,pause,recoverable,resume,cancel,get-state,stream,history,trace}` 与 `tool:approve`/`session:trace:export`。
2. **Nexus API 切换**：新增 `/api/admin/intelligence-agent/*`，页面调用全部切换；旧 `/api/admin/intelligence-lab/*` 入口停用。
3. **Prompt Registry 落库**：Core `aisdk-config` 增加 `promptRegistry/promptBindings`；Nexus D1 新增 `intelligence_prompt_registry` 与 `intelligence_prompt_bindings` 表，并提供解析能力。
4. **审批与风险门控**：保持 `high/critical` 必审；V1 工具集移除高风险写工具示例，仅保留读为主 + 低风险偏好写。
5. **Trace 契约升级**：会话流事件 `contractVersion` 升级到 `3`，统一 session 维度查询链路。
6. **收口补齐（1+2）**：`/api/admin/intelligence-agent/orchestrator/{plan,execute,reflect}` 统一下线为 `410`（引导到 `/session/stream`）；Dashboard 管理页路由与导航语义统一为 `/dashboard/admin/intelligence-agent`，旧 `/dashboard/admin/intelligence-lab` 页面同样返回 `410`（不再跳转）。

### TxFlipOverlay 多实例叠层升级（单层 Mask + 稳态位移）

**变更类型**: 组件能力增强 / 交互一致性优化

**描述**: `TxFlipOverlay` 新增多实例堆叠行为：连续打开多个 overlay 时使用单例全局遮罩层（位于所有卡片下方）+ 顶层交互层；尺寸匹配时自动触发旧层上移收缩；超出 3 层后按层级渐隐直至隐藏。新增 Nexus 独立测试页用于手工验证叠层表现。

**主要变更**:
1. **单层遮罩策略**：引入组件内部 stack registry + 单例全局遮罩层，遮罩始终下沉到所有 overlay 卡片层之下；仅顶层保留可交互点击层，下层交互层禁用交互，不再遮挡下层卡片露边。
2. **尺寸匹配叠层判定**：相邻层宽高分别满足 `|delta| <= max(8px, 上一层尺寸 * 5%)` 时，触发稳态叠层位移。
3. **递进位移与缩放**：匹配链路下层按深度应用 `-18/-36/-54px` 位移与 `0.95/0.90/0.85` 缩放，形成“旧层收缩、新层展开”效果。
4. **超层渐隐收敛**：深度超过 3 层后按透明度表递减（`1.00 → 0.92 → 0.78 → 0.62 → 0.38 → 0.16 → 0`），最旧层自动隐藏。
5. **测试与验证页补齐**：新增 flip-overlay 多实例单测覆盖 mask owner、尺寸匹配/不匹配、超层隐藏和 body lock 计数；新增 `/test/flip-overlay-stack` 页面用于可视化回归验证。
6. **文档同步**：同步 Tuffex/Nexus 中英文组件文档，补充多实例叠层规则与判定标准说明。

**修改文件**:
- `packages/tuffex/packages/components/src/flip-overlay/src/TxFlipOverlay.vue`
- `packages/tuffex/packages/components/src/flip-overlay/__tests__/flip-overlay.test.ts`
- `apps/nexus/app/pages/test/flip-overlay-stack.vue`
- `packages/tuffex/docs/components/flip-overlay.md`
- `apps/nexus/content/docs/dev/components/flip-overlay.zh.mdc`
- `apps/nexus/content/docs/dev/components/flip-overlay.en.mdc`
- `docs/plan-prd/01-project/CHANGES.md`

### Assets Review 改为表格入口并使用 FlipOverlay 弹窗

**变更类型**: 交互优化 / 审核流可视化

**描述**: 将 Dashboard Assets 页顶部的待审核卡片列表改为表格结构，审核入口收敛为行内 `Review` 按钮；点击后由 `TxFlipOverlay` 从触发源位置展开审核弹窗，替换原普通 Modal 形态。

**主要变更**:
1. **待审核区域表格化**：`pendingReviewItems` 以时间倒序渲染到 table，按发布物、审核类型、提交信息、更新时间、操作展示。
2. **行内触发审核**：表格行和 `Review` 按钮均可触发审核，保留管理员待审处理路径不变。
3. **审核弹窗 FlipOverlay 化**：`ReviewModalOverlay` 内部容器迁移为 `TxFlipOverlay`，新增 `source` 入参并接入 source-aware 动画。
4. **source 链路补齐**：`assets.vue` 新增 `reviewOverlaySource` 状态，打开/关闭时同步维护触发源引用。
5. **头部通用化**：审核弹窗改用 `TxFlipOverlay` 默认 close 区域，并通过 `header-display` 复用 `PluginMetaHeader`，统一头部呈现风格。
6. **引用链去歧义**：`assets.vue` 审核组件标签更名为 `ReviewOverlayDialog`，并删除 `ReviewModal.vue` 旧入口，仅保留 `ReviewModalOverlay.vue`，避免自动导入命名冲突导致旧弹窗被误命中。
7. **底部取消按钮收敛**：审核弹窗移除底部“Cancel（关闭）”，统一由右上角 close 关闭弹层；拒绝流程中的次级按钮改为“Back/返回”仅用于返回上一步。
8. **高度策略收敛**：审核弹窗由固定高改为 `max-height` 约束，并将上限收敛到 `min(68dvh, 560px)`，减少视觉压迫感。
9. **防误关闭开关收敛**：审核弹窗改为使用 `preventAccidentalClose=true`，统一拦截遮罩点击关闭并使用组件内置防误关交互。

**修改文件**:
- `apps/nexus/app/pages/dashboard/assets.vue`
- `apps/nexus/app/components/dashboard/ReviewModalOverlay.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### 修复: Assets 发布流程 License 步骤勾选控件缺失

**变更类型**: Bug 修复

**描述**: 修复 Dashboard Assets 页面发布版本弹层在 License 步骤中勾选控件未渲染的问题，恢复“同意协议”勾选交互与提交流程可见性。

**主要变更**:
1. **补齐组件导入**：在 `VersionDrawer` 中补充 `Switch` 组件导入，解决 `Failed to resolve component: Switch` 运行时告警。
2. **恢复协议确认交互**：License 步骤重新显示勾选控件，用户可明确勾选后再提交审核。

**修改文件**:
- `apps/nexus/app/components/VersionDrawer.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Nexus Store 插件详情改为 Header + Content + TxTabs

**变更类型**: 交互优化 / 信息架构调整

**描述**: 调整 Nexus `store` 页面插件详情展示结构。详情弹层由单列内容重构为 `Header + Content` 双区块，内容区接入 `TxTabs` 分页，降低信息堆叠感并提升浏览路径清晰度。

**主要变更**:
1. **结构拆分**：详情区拆分为插件头部信息（Header）和内容区（Content），头部集中展示图标、名称、官方标识、版本与安装量信息。
2. **Tabs 接入**：内容区引入 `TxTabs`，新增 `Overview / Versions / Reviews` 三个页签。
3. **内容复用**：复用 shared 组件 `SharedPluginDetailHeader`、`SharedPluginDetailReadme`、`SharedPluginDetailVersions`，避免重复实现。
4. **评论逻辑保留**：原有评论加载、分页、提交与登录态校验逻辑整体迁移到 `Reviews` Tab，行为不变。
5. **多语言补齐**：新增 `store.detail.tabs.*` 中英文文案键。

**修改文件**:
- `apps/nexus/app/pages/store.vue`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/i18n/locales/en.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### API Key 权限树与 FlipOverlay 防误关闭增强

**变更类型**: 交互优化 / 组件能力增强

**描述**: 优化 Dashboard API Key 创建弹层中的权限选择体验，权限从平铺列表升级为分组树状结构（无一键全选入口）；同时为 `TxFlipOverlay` 新增语义化“防误关闭”配置，支持遮罩点击拦截、页面退出拦截与误关闭红光警示，并在 API Key 场景启用。

**主要变更**:
1. **权限结构重构**：`api-keys` 页面将权限改为 `Plugins / Account / Releases` 分组树，子节点独立勾选，去除“快速全选”路径，保留最小授权思路。
2. **语义化防误关闭开关**：`TxFlipOverlay` 新增 `preventAccidentalClose`，开启后自动拦截遮罩点击关闭与页面退出（刷新/关闭）行为。
3. **误关闭即时反馈**：当触发被拦截的关闭动作时，overlay 卡片外围触发红色警示光效，提醒用户当前操作被保护。
4. **API Key 场景落地**：创建 API Key 弹层启用 `:prevent-accidental-close=\"true\"`，避免填写过程中误关闭导致信息丢失。
5. **测试与文档同步**：新增 flip-overlay 相关单测，并同步更新 Tuffex 与 Nexus 组件文档说明。

**修改文件**:
- `apps/nexus/app/pages/dashboard/api-keys.vue`
- `packages/tuffex/packages/components/src/flip-overlay/src/types.ts`
- `packages/tuffex/packages/components/src/flip-overlay/src/TxFlipOverlay.vue`
- `packages/tuffex/packages/components/src/flip-overlay/__tests__/flip-overlay.test.ts`
- `packages/tuffex/docs/components/flip-overlay.md`
- `apps/nexus/content/docs/dev/components/flip-overlay.zh.mdc`
- `apps/nexus/content/docs/dev/components/flip-overlay.en.mdc`
- `docs/plan-prd/01-project/CHANGES.md`

### Nexus Dashboard Assets 页面梳理（表格化 + 内置操作 + FlipOverlay）

**变更类型**: 交互优化 / 信息架构调整

**描述**: 参考 Dashboard「更新与要闻」页的管理结构，重排 Assets（发布物）页列表区域。将核心操作按钮收敛到列表卡片头部，新增显式刷新入口，并将详情展开从 Drawer 切换为 FlipOverlay，降低上下文跳转感。

**主要变更**:
1. **列表区重构为 table**：`myPlugins` 展示从卡片列表改为表格，增加类型/分类、状态、版本、安装量、更新时间等列。
2. **按钮收敛进列表区**：将「创建发布物 / 刷新」统一放入发布物 table 卡片头部，并移除「探索市场」入口，减少页面主标题区噪音。
3. **新增刷新按钮**：在列表头部增加刷新入口并复用既有 `refreshPlugins()` 数据刷新链路。
4. **详情容器迁移**：`PluginDetailDrawer` 内部容器由 `Drawer` 改为 `TxFlipOverlay`，支持由点击源位置翻转展开。
5. **编辑入口弹窗化**：详情里的“编辑信息”改为独立 `TxFlipOverlay` 弹窗承载表单，展开时保持详情层不关闭；弹窗 source 绑定到点击的「Edit metadata」按钮。
6. **头部展示组件化**：抽离统一 `PluginMetaHeader`，并通过 `TxFlipOverlay` 的 `header` 插槽承载自定义头部（含关闭按钮），确保展示一致且可复用。
7. **编辑弹窗组件化与尺寸统一**：将 metadata 编辑弹窗从 `assets.vue` 内联模板抽离为 `PluginMetadataOverlay` 组件，并将弹窗尺寸对齐编辑插件信息弹窗规格（宽度 `min(900px, 94vw)`）。
8. **创建发布物流程防闪回**：`AssetCreateOverlay` 步骤切换改为“直接切 step + `settled` 后统一解锁并刷新”，移除切换期 `runWithAutoSizer` 包裹与定时解锁，避免中间态尺寸被回写；同步通过 `AssetPluginFormStep.suspendLayoutEmit` 抑制切换期布局回传，消除“先新后旧再新”的回弹链路。
9. **Plugin 选择直达表单**：在创建发布物流程中，点击 `Plugin` 类型后直接进入 `plugin_form`，移除中间提示页，减少一步跳转与额外尺寸切换。
10. **高度测量与宽度抖动修正**：新增 overlay 已展开门控（`@opened` 后才允许 `TxAutoSizer.refresh`），并将 refresh 调度重构为“单一队列（pending）+ 条件满足自动 flush + opened 后双 RAF 补刷”，避免门控期与 ref 未就绪场景丢刷新；子表单 `layout-change` 统一路由到队列入口。为收敛视觉抖动，`TxFlipOverlay` 外层滚动关闭（仅保留内部滚动容器），并给创建弹窗容器补上宽度过渡，避免步骤切换时宽度硬跳。

**修改文件**:
- `apps/nexus/app/pages/dashboard/assets.vue`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
- `apps/nexus/app/components/dashboard/PluginMetaHeader.vue`
- `apps/nexus/app/components/dashboard/PluginMetadataOverlay.vue`
- `apps/nexus/app/components/assets/create/AssetCreateOverlay.vue`
- `apps/nexus/app/components/assets/create/AssetPluginFormStep.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core App 新建插件改为二级弹窗（非全屏）

**变更类型**: 交互优化 / 可用性改进

**描述**: 插件页底部“Add”打开的新建插件界面由全屏覆盖调整为居中二级弹窗，保留背景上下文，降低操作打断感。

**主要变更**:
1. **弹层尺寸收敛**：`PluginDrawer-Card` 从 `100vw x 100vh` 调整为受限宽高（`min(1060px, 92vw)` / `min(760px, 86vh)`）。
2. **视觉层级优化**：增加圆角、边框与阴影，明确二级弹窗层次。
3. **遮罩体验优化**：提升遮罩与背景模糊强度，强化焦点但不再表现为“页面切换”。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/Plugin.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### TxFlipOverlay 头部系统增强与全仓迁移

**变更类型**: 组件能力升级 / 交互一致性修复

**描述**: `TxFlipOverlay` 新增统一头部体系（默认圆形 close、分区插槽、可关闭开关），并对 Nexus/Core App 主要 overlay 调用完成迁移，消除双关闭按钮与部分场景交互不一致问题。

**主要变更**:
1. **头部 API 升级**：新增 `header/headerTitle/headerDesc/closable/closeAriaLabel`，保留 `maskClosable` 语义并延续 `scrollable` 默认内部滚动。
2. **插槽体系增强**：支持 `header`（全量覆盖）、`header-display`、`header-actions`、`header-close`，并统一向插槽暴露 `close/expanded/animating/closable/headerTitle/headerDesc`。
3. **默认关闭按钮标准化**：内置右上角圆形 close，支持 hover/active/focus-visible 与可配置 `aria-label`。
4. **滚动语义统一**：overlay 卡片改为 `header + body` 列布局，body 内部滚动，避免仅靠 `max-height` 导致内容不可滚动。
5. **弹层高度与页面滚动收敛**：FlipOverlay 卡片最大高度统一收敛到 `90dvh`（基于原参数缩减 10%），并在 overlay 打开时锁定 `body` 背景滚动，关闭后自动恢复。
6. **调用点迁移**：对保留自定义关闭按钮的业务 overlay 显式设置 `:closable=\"false\"`，避免双 close；官网 store 与 app store 场景同步适配新 header 能力。
7. **文档与 Demo 同步**：组件文档、Nexus 中英文文档与 demo 全面更新新 props/slots 与优先级说明。
8. **组件测试补齐**：新增 flip-overlay 测试，覆盖默认 header、插槽优先级、`closable=false`、close 事件链与滚动行为。
9. **视觉内置化迁移**：`TxFlipOverlay` 卡片默认内置 `surface + border`（`surface` 可配置 `pure/mask/blur/glass/refraction`，默认 `mask`），并新增 `globalMask`（默认启用）控制全局遮罩；Nexus/Core App overlay 调用侧移除外部背景/边框样式，统一由组件内部控制。

**修改文件**:
- `packages/tuffex/packages/components/src/flip-overlay/src/types.ts`
- `packages/tuffex/packages/components/src/flip-overlay/src/TxFlipOverlay.vue`
- `packages/tuffex/packages/components/src/flip-overlay/__tests__/flip-overlay.test.ts`
- `apps/nexus/app/pages/store.vue`
- `apps/core-app/src/renderer/src/components/store/MarketHeader.vue`
- `apps/nexus/app/pages/dashboard/updates.vue`
- `apps/nexus/app/pages/dashboard/storage.vue`
- `apps/nexus/app/pages/dashboard/admin/intelligence-lab.vue`
- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/app/components/docs/DocsAssistantDialog.vue`
- `apps/nexus/app/components/CreatePluginDrawer.vue`
- `apps/nexus/app/components/VersionDrawer.vue`
- `apps/nexus/app/components/assets/create/AssetCreateOverlay.vue`
- `apps/core-app/src/renderer/src/views/base/store/MarketSourceEditor.vue`
- `apps/core-app/src/renderer/src/views/base/Plugin.vue`
- `apps/core-app/src/renderer/src/components/download/FlatDownload.vue`
- `apps/core-app/src/renderer/src/components/base/TuffUserInfo.vue`
- `apps/core-app/src/renderer/src/components/intelligence/audit/IntelligenceAuditOverlay.vue`
- `apps/core-app/src/renderer/src/components/plugin/PluginInfo.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginDetails.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginDevSettingsOverlay.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginFeatures.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginStorage.vue`
- `packages/tuffex/docs/components/flip-overlay.md`
- `apps/nexus/content/docs/dev/components/flip-overlay.zh.mdc`
- `apps/nexus/content/docs/dev/components/flip-overlay.en.mdc`
- `apps/nexus/app/components/content/demos/FlipOverlayFlipOverlayDemo.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### CoreBox 系统噪音 App 过滤（单开关）

**变更类型**: 搜索体验优化 / 设置项新增

**描述**: 针对 CoreBox 应用搜索中的系统噪音项（如 `DiscHelper`、`OSDUIHelper`、`TMHelperAgent`、`Simulator` 等）新增“仅搜索结果过滤”能力。采用代码内置规则，不改扫描入库；系统设置新增单开关（默认开启），可一键回退到原行为。

**主要变更**:
1. **固定规则过滤器**：新增 `app-noise-filter.ts`，内置 Simulator、CoreServices Helper/Agent、开发辅助入口等判定规则，并加入主应用保护名单。
2. **搜索阶段按开关过滤**：`app-provider` 在 `onSearch` 返回阶段执行过滤，开关关闭即完全回退；新增 debug 日志输出过滤数量与规则命中分布。
3. **设置模型扩展**：`AppIndexSettings` 增加 `hideNoisySystemApps`，默认 `true`，并在主进程做旧配置缺省补齐，保持向后兼容。
4. **设置页单开关落地**：在“通用配置”中新增“过滤系统噪音应用”开关（仅高级设置可见），沿用既有加载/保存流程。
5. **测试补齐**：新增噪音判定单测，覆盖典型命中、误杀保护与边界输入。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-noise-filter.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-noise-filter.test.ts`
- `packages/utils/transport/events/types/app-index.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingSetup.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `docs/plan-prd/01-project/CHANGES.md`

### 发布链路收敛（Build 主线 + Nexus 同步 + CLI 四包自动发布）

**变更类型**: CI/CD 重构 / 发布治理

**描述**: 收敛桌面与 CLI 发布链路。桌面发版统一由 `build-and-release` 承担；Nexus release 与 updates 支持 API Key 细粒度权限；CLI 四包版本变更后自动发布 npm 并同步 Nexus 更新公告。官网部署由 Cloudflare Pages 平台侧 Git 自动部署，仓库不再维护独立 deploy workflow。

**主要变更**:
1. **桌面发版主线统一**：`build-and-release` 成为唯一 tag 发布入口；构建失败不再创建 Release。
2. **发布资产规范化**：自动生成并随 Release 上传 `tuff-release-manifest.json`（含核心资产 `sha256/platform/arch`）。
3. **Nexus release 自动同步**：tag 发布后自动创建/更新 Nexus release、链接 GitHub 资产并发布。
4. **权限模型粒度化**：release API 改为 `release:write/release:assets/release:publish`，并保留 `release:sync` 兼容映射；updates 新增 `release:news` API Key 通道。
5. **release 资产幂等写入**：按 `releaseId + platform + arch` upsert，避免重复同步产生多条资产记录。
6. **发布态防空资产**：release 发布前必须至少存在一个可下载资产，否则拒绝发布。
7. **CLI 四包自动发布**：新增 workflow 按顺序发布 `@talex-touch/tuff-cli-core` → `@talex-touch/tuffcli` → `@talex-touch/unplugin-export-plugin` → `@talex-touch/tuff-cli`；稳定版走 `latest`，预发布走 `next`。
8. **官网部署策略调整**：改为 Cloudflare Pages 平台侧 Git 自动部署，移除仓库内 `nexus-deploy.yml`。
9. **Legacy workflow 降级**：`release-core/release-renderer/release-extensions` 仅保留手动触发（归档/调试用途）。

**修改文件**:
- `.github/workflows/build-and-release.yml`
- `.github/workflows/release-core.yml`
- `.github/workflows/release-renderer.yml`
- `.github/workflows/release-extensions.yml`
- `.github/workflows/package-tuff-cli-publish.yml`
- `apps/nexus/server/utils/auth.ts`
- `apps/nexus/server/utils/releasesStore.ts`
- `apps/nexus/server/api/releases/index.post.ts`
- `apps/nexus/server/api/releases/[tag].patch.ts`
- `apps/nexus/server/api/releases/[tag]/assets.post.ts`
- `apps/nexus/server/api/releases/[tag]/link-github.post.ts`
- `apps/nexus/server/api/releases/[tag]/publish.post.ts`
- `apps/nexus/server/api/dashboard/updates.post.ts`
- `apps/nexus/server/api/dashboard/api-keys.post.ts`
- `apps/nexus/app/pages/dashboard/api-keys.vue`
- `.github/workflows/README.md`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`

### `tuff-native` OCR 显式加载修复（多 target 误载防回归）

**变更类型**: Bug 修复 / 原生模块加载稳定性

**描述**: 修复 `@talex-touch/tuff-native` 在多 `.node` target 场景下可能误加载到 `tuff_native_everything.node` 的问题，导致 `vision.ocr` 路径缺失 `getNativeOcrSupport/recognizeImageText` 并报 `native-module-not-loaded`。现在改为按入口显式加载目标模块，并增加导出契约校验。

**主要变更**:
1. **统一原生加载器**：新增 `native-loader.js`，显式加载 `build/Release/<module>.node`，并支持 `expectedExports` 校验。
2. **OCR 入口固定 target**：`index.js` 仅加载 `tuff_native_ocr.node`，并校验 `getNativeOcrSupport/recognizeImageText`。
3. **Everything 入口保持隔离**：`everything.js` 仅加载 `tuff_native_everything.node`，并校验 `search/query/getVersion`。
4. **错误可诊断性增强**：导出缺失时报 `ERR_NATIVE_EXPORT_MISMATCH`，错误信息包含缺失导出与实际导出列表。
5. **包清单收敛**：`package.json` `files` 增加 `native-loader.js`，移除未使用依赖 `node-gyp-build`。

**修改文件**:
- `packages/tuff-native/native-loader.js`
- `packages/tuff-native/index.js`
- `packages/tuff-native/everything.js`
- `packages/tuff-native/package.json`
- `pnpm-lock.yaml`
- `docs/plan-prd/01-project/CHANGES.md`

### Quick Actions 常用项直推 + 高危动作二次确认

**变更类型**: 交互优化 / 安全增强

**描述**: 调整 `touch-quick-actions` 的默认行为，空查询时直接推送常用动作（含重启、关机）；同时为高风险动作引入二次确认，降低误触系统级操作风险。

**主要变更**:
1. **常用项直推**：`onFeatureTriggered` 在空查询场景不再按分组头渲染，直接推送常用动作列表（优先 `restart/shutdown/lock-screen/mute-toggle/focus-settings`）。
2. **动作补齐**：Windows/macOS 快捷动作新增 `重启` 与 `关机`。
3. **二次确认**：`restart` / `shutdown` 增加双弹窗确认（两次“确定”后才执行命令）；取消时返回 `操作已取消`。
4. **测试覆盖**：补充 quick-actions 用例，验证常用项包含重启/关机、空查询直推行为及高危动作二次确认。

**修改文件**:
- `plugins/touch-quick-actions/index.js`
- `packages/test/src/plugins/quick-actions.test.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Plugin Feature ID 规范收敛（统一 `-`，拒绝 `.`）

**变更类型**: 规范收敛 / 插件生态一致性

**描述**: 明确并落实官方插件 `feature.id` 命名规范：仅允许字母、数字、下划线与连字符（`[A-Za-z0-9_-]`），不再使用点号分段（`.`）。此次将官方插件清单与脚本引用统一迁移为连字符写法，避免被运行时校验拒绝后出现“功能数 0 / 无法添加 Feature”的问题。

**主要变更**:
1. **清单统一**：官方插件 `manifest.json` 中的点号 `feature.id` 全部改为连字符形式（如 `system.actions` → `system-actions`）。
2. **脚本同步**：插件 Prelude 中按 `featureId` 分支的逻辑同步更新到新 ID，避免触发路径失联。
3. **测试同步**：`system-actions` 相关测试用例改用连字符 ID，保持行为断言一致。

**修改文件**:
- `plugins/touch-*/manifest.json`（含 browser/code-snippets/intelligence/snipaste/system/text/window/workspace 系列）
- `plugins/touch-code-snippets/index.js`
- `plugins/touch-text-snippets/index.js`
- `plugins/touch-intelligence/index.js`
- `packages/test/src/plugins/system-actions.test.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Widget 编译缓存命中修复（避免旧代码复用）

**变更类型**: Bug 修复 / 插件运行时稳定性

**描述**: 修复生产插件在 widget 路径不变时可能复用旧编译缓存的问题。此前缓存预热阶段仅按 `filePath/mtime` 判定，未强制比对 source hash，导致“同路径新内容”场景仍可能命中旧 `.cjs` 缓存，引发线上行为与源码不一致（如持续报旧行号错误）。

**主要变更**:
1. **预热阶段补齐 hash**：`WidgetManager.registerWidget` 在非 dev 模式下先加载一次 widget source，拿到 `hash` 后再尝试命中 compiled cache。
2. **避免重复加载**：若已预加载 source，则后续编译流程复用该结果，不再二次读取同一 widget 文件。

**修改文件**:
- `apps/core-app/src/main/modules/plugin/widget/widget-manager.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### WidgetRegistry 渲染补丁修复（Proxy 读取语义对齐）

**变更类型**: Bug 修复 / 渲染稳定性

**描述**: 修复 widget 渲染补丁在合并 `setupState` 时使用 `target[key]` 直接解引用的问题。该实现会绕过 getter 的标准 receiver 语义，在跨上下文 Proxy 场景下可能触发 `TypeError: Illegal invocation`。

**主要变更**:
1. **Proxy 读取改为 Reflect**：`renderWithSetupState` 的 `get` trap 统一改为 `Reflect.get(..., receiver)`，保持原生属性访问语义。
2. **补齐 has trap**：新增 `has` trap，确保 `setupState` 字段参与 `in` 检测，减少模板编译产物的上下文判定偏差。
3. **开发态定位增强**：新增 widget 运行时代码片段缓存与错误行回溯日志，渲染报错时可直接输出 `<anonymous>:line:col` 对应代码片段，缩短定位路径。
4. **沙箱方法绑定修复**：`createSandboxWindow/createSandboxDocument` 的 Proxy `get` 对函数成员统一返回 `bind(target)` 后的方法，修复 `window.addEventListener/removeEventListener` 等调用在沙箱上下文触发的 `Illegal invocation`。

**修改文件**:
- `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### PluginInfo 问题按钮修复（TxButton 适配 + Warning 波纹）

**变更类型**: Bug 修复 / 交互反馈优化

**描述**: 修复插件详情页右下角“问题”按钮在迁移到 `TxButton` 后的两个问题：按钮使用了不受支持的 `variant="icon"`，以及翻转弹层锚点 `source` 引用到了组件实例而非 `HTMLElement`。同时将 `warning` 态视觉升级为“从按钮中心向整个 PluginInfo 传递”的波纹扩散，并将 FAB 抽离为独立组件。

**主要变更**:
1. **TxButton 规范化**：将问题按钮改为 `variant="flat"` 并根据问题级别映射 `type`（warning/error），移除非法 variant 用法。
2. **Overlay 锚点修复**：由 `PluginFab` 通过 `source-change` 事件回传按钮锚点元素，确保 `TxFlipOverlay.source` 始终为 `HTMLElement`。
3. **组件抽离 + 波纹升级**：新增独立组件 `PluginFab`（结构：`TxButton + Waving`），并实现从按钮中心向整个 `PluginInfo` 容器扩散的双层延迟波纹；`error` 态继续保留高强度发光提示。

**修改文件**:
- `apps/core-app/src/renderer/src/components/plugin/PluginInfo.vue`
- `apps/core-app/src/renderer/src/components/plugin/PluginFab.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Store 展示一致性修复（官网 + Core App）

**变更类型**: Bug 修复 / 数据契约对齐

**描述**: 修复官网与 Core App 插件 Store 的多处展示不一致问题，重点解决详情 README 空白、安装状态误判、路由与标签页脱钩、以及更新检查重复触发。

**主要变更**:
1. **官网详情 README 对齐**：`/api/store/plugins/[slug]` 补充 `readmeMarkdown`（插件级 + 版本级），修复详情页 README 数据缺失。
2. **官网详情首屏优化**：详情主数据与社区数据（评分/评论）解耦，打开详情后先渲染主体，再异步加载社区模块。
3. **App 安装状态匹配增强**：安装状态识别从“仅插件名”扩展为“providerId + pluginId + name 多键匹配”，并透出 `installSource` 给渲染层用于精确对齐官方插件标识。
4. **Store 路由同步**：`tabs` 与路由双向同步，补齐 `/store/cli` 路由，避免刷新或前进后退后视图状态错位。
5. **更新检查去重**：移除重复的 `StoreEvents.api.checkUpdates` 注册，避免单次调用触发两次检查。
6. **安装来源状态保持**：`plugin store` 在增量推送覆盖时保留 `installSource`，并在 Store Grid 侧补齐 `providerId + pluginId` 复合键匹配，修复同名/同 ID 跨源状态串联与闪回误判。
7. **列表接口轻量化（兼容）**：`/api/store/plugins` 新增 `compact=1` 精简返回模式（移除列表态 `versions` 与版本大字段），并同步官网页面与 Core App/TPEX Provider 默认走轻量请求，降低列表首屏 payload。
8. **官网详情 Flip 动画与滚动体验**：官网 `store` 详情弹层切换为 `TxFlipOverlay`，从卡片源触发 FLIP 开合；同时增强 `TxFlipOverlay` 通用滚动容器（默认 `scrollable`），修复“仅 max-height 限高但内容不可滚动”的交互问题。

**修改文件**:
- `apps/nexus/server/api/store/plugins/[slug].get.ts`
- `apps/nexus/app/pages/store.vue`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/renderer/src/composables/store/usePluginVersionStatus.ts`
- `apps/core-app/src/renderer/src/views/base/Store.vue`
- `apps/core-app/src/renderer/src/components/store/MarketGridView.vue`
- `apps/core-app/src/renderer/src/base/router.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `docs/plan-prd/01-project/CHANGES.md`

### Dev 插件加载判定修复（避免 `dev.source=false` 误走远程 URL）

**变更类型**: Bug 修复 / 插件加载稳定性

**描述**: 修复通过系统动作安装本地目录插件后，`manifest.dev.source=false` 仍被误判为远程 Dev Loader，进而在 `dev.address` 为空时触发 `TypeError: Invalid URL` 的问题。

**主要变更**:
1. **Loader 选择收敛**：仅当 `dev.enable=true` 且 `dev.source=true` 且 `dev.address` 为合法 `http(s)` URL 时，才使用 `DevPluginLoader`。
2. **异常兜底修复**：`DevPluginLoader` 在 dev 地址非法时直接记录 issue 并返回，避免在 `catch` 中二次构造 URL 导致 fatal。
3. **行为一致性**：与插件运行/视图加载链路中的 `dev.source` 语义保持一致（`source=false` 默认走本地资源）。

**修改文件**:
- `apps/core-app/src/main/modules/plugin/plugin-loaders.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### CoreBox 推荐态展开高度修复（避免窗口尺寸“锁高”）

**变更类型**: Bug 修复 / 交互稳定性

**描述**: 修复 CoreBox 在推荐态（`recommend`）下，窗口高度偶发无法随内容减少而收缩的问题。根因是高度计算链路依赖 `TxScroll` 容器高度，而其内容层存在 `min-height: 100%` 约束，导致“当前窗口高度”被反向带入下一轮计算，形成尺寸锁定。

**主要变更**:
1. **测量对象调整**：`useResize` 优先改为测量 `.CoreBoxRes-ScrollContent` 的真实内容高度，不再优先依赖 scroll wrapper。
2. **保留兜底路径**：当内容节点不可用时，仍沿用原有 wrapper 测量逻辑，保证兼容性与回退能力。
3. **行为结果**：推荐结果数量减少后，CoreBox 高度可随内容正常回落，减少空白区域与视觉“过展开”。

**修改文件**:
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useResize.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Widget 分离窗口修复（Detached 模式状态回填）

**变更类型**: Bug 修复 / DivisionBox 稳定性

**描述**: 修复 Widget 从 CoreBox 分离到独立窗口后内容异常的问题。根因是 `tuff://detached` 场景仍走 `WebContentsView.loadURL`，导致分离窗口未正确复用 CoreBox 渲染链路，同时缺少分离项上下文回填。

**主要变更**:
1. **主进程分流**：DivisionBox 会对 `tuff://detached` URL 跳过 `attachUIView`，直接启用原生 DivisionBox CoreBox 渲染层。
2. **会话状态回填**：分离成功后将当前 item/query 写入 session state（`detachedPayload`），供新窗口启动时恢复上下文。
3. **渲染端恢复**：`useSearch` 在 detached 模式下优先读取 session state 恢复目标 item；若恢复失败则回退到 query 搜索，并按 `itemId/source` 过滤结果，避免窗口展示偏移。

**修改文件**:
- `apps/core-app/src/main/modules/division-box/manager.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useDetach.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Nexus 首管理员初始化提权（ADMINSECRET + 首用户校验）

**变更类型**: 安全增强 / 认证流程改进

**描述**: 新增“首管理员初始化”流程：当系统检测到尚无管理员账号时，登录用户会被引导到管理员初始化页面，输入 `ADMINSECRET` 后完成提权。提权严格限制为“首个活跃用户”且使用原子条件更新，避免并发下重复提权。

**主要变更**:
1. **后端状态与提权 API**：新增 `GET /api/admin-bootstrap/status` 与 `POST /api/admin-bootstrap/promote`（避开 `/api/auth/[...]` catch-all 冲突）。
2. **首用户原子校验**：新增 `getAdminBootstrapState` 与 `promoteFirstUserToAdmin`，仅当“无管理员 + 当前用户为首个活跃用户”时允许提权。
3. **运行时配置**：新增 server-only 配置 `ADMINSECRET`（同时兼容 `ADMIN_SECRET`）。
4. **登录后强制引导**：当用户已登录且系统无管理员时，前端全局路由自动跳转 `/auth/admin-bootstrap`。
5. **初始化页面**：新增管理员认证页面，支持状态提示、secret 提交、成功后自动返回目标页面。
6. **测试覆盖**：补充首管理员初始化状态与提权接口单测（成功、secret 错误、非首用户、已有管理员）。

**修改文件**:
- `apps/nexus/server/utils/authStore.ts`
- `apps/nexus/server/api/auth/admin-bootstrap/status.get.ts`
- `apps/nexus/server/api/auth/admin-bootstrap/promote.post.ts`
- `apps/nexus/server/api/user/me.get.ts`
- `apps/nexus/server/api/auth/me.get.ts`
- `apps/nexus/nuxt.config.ts`
- `apps/nexus/app/app.vue`
- `apps/nexus/app/pages/auth/admin-bootstrap.vue`
- `apps/nexus/app/composables/useCurrentUserApi.ts`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/server/api/auth/admin-bootstrap/__tests__/status.get.test.ts`
- `apps/nexus/server/api/auth/admin-bootstrap/__tests__/promote.post.test.ts`
- `apps/nexus/README.md`
- `docs/plan-prd/01-project/CHANGES.md`

### touch-translation 列表可读性与键盘导航优化（右侧默认焦点）

**变更类型**: 交互优化 / 可用性增强

**描述**: 优化翻译面板左右列表的焦点模型与结果卡片可读性。默认焦点切到右侧结果列表，支持键盘上下选择、回车复制；并新增左右列表焦点切换快捷键（`Meta/Ctrl + ←/→`）。

**主要变更**:
1. **焦点与选择模型**：新增 `providers/history` 双焦点区，默认焦点为右侧 `providers`。
2. **键盘交互**：支持 `ArrowUp/ArrowDown` 在当前焦点列表中移动选择；`Enter` 在右侧复制当前选中结果（成功复制译文，失败复制错误摘要）；在左侧触发历史项回填。
3. **焦点切换快捷键**：支持 `Meta/Ctrl + ArrowLeft` 切到左侧历史，`Meta/Ctrl + ArrowRight` 切回右侧结果。
4. **结果卡片可读性优化**：右侧卡片支持选中态高亮、状态徽标统一（翻译中/已完成/失败），并增加长错误摘要折叠（查看详情/收起详情）。
5. **布局稳定性优化**：右侧结果区与左侧历史区都改为限高内部滚动，避免长错误文本撑坏整体布局；修复复制按钮在长文本场景下易被挤压的问题。
6. **Widget 沙箱兼容修复**：移除对 `window.addEventListener` 的直接依赖，改为监听 `core-box:key-event`；同时对 `payload/history` 做 plain 数据归一化，并去除高风险 deep watch / 链式数组操作，规避 Proxy 跨上下文导致的 `Illegal invocation`。
7. **Provider 字段读取容错**：历史结果写入前统一走 `normalizeProviders` 安全读取（带 try/catch），避免跨上下文 payload getter 在 watch 回调内直接解引用导致渲染期 `Illegal invocation`。
8. **Payload 链路防崩溃**：`normalizeWidgetPayload` 与 `item.render.custom.data` 读取统一改为安全访问（try/catch），即使上游注入的是跨上下文 Proxy 也不再直接抛出渲染错误。

**修改文件**:
- `plugins/touch-translation/widgets/translate-panel.vue`
- `docs/plan-prd/01-project/CHANGES.md`

## 2026-02-24

### TuffCLI 设备授权状态回传增强（拒绝原因/IP 明细/标签页关闭感知）

**变更类型**: 认证体验修复 / 设备授权链路增强

**描述**: 修复设备码授权链路中“浏览器侧已拒绝但 CLI 仅超时”的盲区，并补齐授权页手动关闭的可观测性。CLI 现在可感知 Nexus 拒绝态、展示 IP 不一致明细，并在授权页关闭时提示“重新打开 or 关闭本次授权”。

**主要变更**:
1. **拒绝态显式回传**：Nexus 在 IP 不一致时将设备授权标记为 `rejected`，并记录拒绝原因与 IP 上下文；CLI 轮询到拒绝后会在终端提示并询问是否重试。
2. **IP 明细可见**：当拒绝原因为 `ip_mismatch` 时，CLI 展示“申请 IP / 当前访问 IP”。
3. **授权页可见性跟踪**：新增 `/api/app-auth/device/presence`，授权页上报 `opened/heartbeat/closed`；CLI 检测到标签页关闭后，提示“重新打开授权页 / 关闭本次授权”。
4. **授权中止接口**：新增 `/api/app-auth/device/abort`，CLI 选择关闭本次授权时可主动中止请求。
5. **短期/长期提示与刷新约束**：设备码成功后 CLI 提示当前授权类型与时长（短期 24h / 长期 30d）；短期授权明确不可刷新，`/api/auth/sign-in-token` 仅允许长期 app token 刷新。

**修改文件**:
- `packages/unplugin-export-plugin/src/bin/tuff.ts`
- `packages/unplugin-export-plugin/src/cli/i18n/locales/zh.ts`
- `packages/unplugin-export-plugin/src/cli/i18n/locales/en.ts`
- `apps/nexus/server/utils/authStore.ts`
- `apps/nexus/server/utils/auth.ts`
- `apps/nexus/server/api/app-auth/device/approve.post.ts`
- `apps/nexus/server/api/app-auth/device/poll.get.ts`
- `apps/nexus/server/api/app-auth/device/info.get.ts`
- `apps/nexus/server/api/app-auth/device/presence.post.ts`
- `apps/nexus/server/api/app-auth/device/abort.post.ts`
- `apps/nexus/server/api/auth/sign-in-token.post.ts`
- `apps/nexus/app/pages/device-auth.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### CoreBox 复制文件无输入时不触发搜索修复（剪贴板 files 判重补全）

**变更类型**: Bug 修复 / 搜索触发稳定性

**描述**: 修复 CoreBox 在“仅复制文件、输入框为空”场景下偶发不触发搜索的问题。根因是主进程剪贴板快路径判重仅使用 `formats + text`，会漏检“文件列表变化但文本不变”的更新。

**主要变更**:
1. **快路径判重补全 files 维度**：在剪贴板含文件格式时，将文件列表签名纳入 quick hash，避免误判“无变化”。
2. **避免重复读取**：将快路径读取到的文件列表在本轮检查中复用，减少重复 `readClipboardFiles()` 调用。
3. **行为保持最小改动**：仅调整主进程 clipboard 变更检测，不修改 CoreBox 查询协议与 provider 处理逻辑。

**修改文件**:
- `apps/core-app/src/main/modules/clipboard.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Nexus Store 页面 `process is not defined` 修复（收敛 renderer 导入范围）

**变更类型**: 运行时修复 / 前端稳定性

**描述**: 修复 `https://tuff.tagzxia.com/store` 在客户端初始化时偶发进入 Nuxt 500（`process is not defined`）的问题。根因是页面从 `@talex-touch/utils/renderer` 的 barrel 导入组件，导致无关模块被一并打包，最终把依赖 `process.platform` 的 Node 侧常量带入浏览器运行时。

**主要变更**:
1. **按需深路径导入**：`store.vue` 改为直接从 `@talex-touch/utils/renderer/shared/*` 导入 `SharedPluginDetailContent` 和类型，避免触发 renderer 总入口的全量 re-export 链。
2. **隔离 Node-only 代码影响面**：减少客户端 bundle 中对 `file-scan`/`file-parser` 相关模块的意外引入，避免浏览器侧访问 `process.*`。

**修改文件**:
- `apps/nexus/app/pages/store.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### touch-translation Prelude 打包修复（移除 `process is not defined`）

**变更类型**: 构建修复 / 运行时稳定性

**描述**: 修复 `touch-translation` 插件打包后在 plugin prelude VM 中报错 `ReferenceError: process is not defined`。根因是 prelude 侧间接打入 Vue CJS 包，触发 `process.env.NODE_ENV` 访问。

**主要变更**:
1. **收敛翻译客户端依赖**：`shared/tuffintelligence.ts` 移除对 `@talex-touch/utils/plugin/sdk/intelligence` 的静态依赖，改为基于 `createIntelligenceClient` 构建最小调用链。
2. **Renderer 通道兼容**：在 renderer 场景优先复用 `window.$channel`，并透传 `_sdkapi`（来自 `window.$plugin.sdkapi`）保持权限校验语义一致。
3. **Prelude 运行时兼容**：在非 renderer 场景继续走默认 channel resolver，避免引入 browser-only/renderer-only 依赖。
4. **产物体积回归正常**：`dist/build/index.js` 从异常膨胀降至轻量体积，且不再包含 `process.env.NODE_ENV` 引用。

**修改文件**:
- `plugins/touch-translation/shared/tuffintelligence.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### CoreBox 启动应用前先隐藏窗口（避免 hide 与 execute 并发）

**变更类型**: 交互修复 / 行为时序优化

**描述**: 调整 CoreBox 执行项的时序，执行应用启动前先等待 CoreBox 隐藏完成，避免 `ui.hide` 与 `item.execute` 并发触发导致的视觉闪烁或前后台切换突兀。

**主要变更**:
1. **执行链路串行化**：`handleExecute` 中非插件功能且不要求保持窗口打开时，`CoreBoxEvents.ui.hide` 改为 `await`，确保先隐藏再执行。
2. **最小改动范围**：仅调整 renderer 侧执行流程，不改 provider 执行语义，保持插件功能与 `keepCoreBoxOpen` 逻辑不变。

**修改文件**:
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 后台轮询错峰与性能日志降噪（SystemUpdate/FxRate/PerfMonitor）

**变更类型**: 性能优化 / 稳定性修复

**描述**: 针对 `system-update.poll` 与 `fx-rate.refresh` 在同一时间窗触发导致的事件循环抖动，以及休眠恢复场景下日志噪音过高问题，新增轮询错峰、慢任务退避与 sleep/suspend 日志节流机制。

**主要变更**:
1. **轮询错峰**：`system-update.poll` 与 `fx-rate.refresh` 首轮执行延迟引入固定偏移 + 随机抖动，避免小时级任务同窗叠加。
2. **慢任务退避**：当轮询任务单次执行耗时超过 800ms 时，自动延后下一轮调度窗口，降低持续高负载下的抖动风险。
3. **启动期解耦**：`SystemUpdateModule` 先执行一次启动刷新，再启动 FX 定时刷新，减少启动阶段并发网络任务竞争。
4. **日志降噪**：`PerfMonitor` 对 `System sleep/suspend detected ... skipping event loop lag report` 增加 60s 节流，保留关键信号同时抑制刷屏。

**修改文件**:
- `apps/core-app/src/main/modules/system-update/index.ts`
- `apps/core-app/src/main/modules/box-tool/addon/preview/providers/fx-rate-provider.ts`
- `apps/core-app/src/main/utils/perf-monitor.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Nexus 认证入口统一到 AUTH_ORIGIN（防止 OAuth 跨域回调失败）

**变更类型**: 部署稳定性 / 登录修复

**描述**: Pages 默认域与自定义域并存时，用户若从非 `AUTH_ORIGIN` 域发起 OAuth，会出现 state cookie 与 callback 域不一致，导致回调失败。现新增 canonical origin 中间件，对页面请求统一重定向到 `AUTH_ORIGIN`。

**主要变更**:
1. **域名收敛**：生产环境下，非 `AUTH_ORIGIN` 的页面 GET/HEAD 请求统一 307 到 canonical origin。
2. **范围控制**：跳过 `/api/*`、`/_nuxt/*` 与 `__nuxt_error`，避免影响 API 与静态资源路径。
3. **开发保护**：开发环境与 localhost 请求保持原行为，不影响本地调试。

**修改文件**:
- `apps/nexus/server/middleware/canonical-origin.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Nexus OAuth 回调修复（Cloudflare Pages 下移除对 Node `https.request` 依赖）

**变更类型**: 登录修复 / 运行时兼容性

**描述**: 生产环境 `OAuthCallback` 报错定位为 `https.request is not implemented yet`。根因是 `next-auth` 的默认 OAuth 回调链路依赖 `openid-client`，其 token/userinfo 交换会走 Node `https` 模块；而 Nitro `cloudflare-pages` 产物对 `http/https` 仍为 unenv stub。现将 GitHub/LinuxDO 的 token 与 userinfo 交换改为 `fetch`，规避该运行时限制。

**主要变更**:
1. **OAuth 交换改造**：为 GitHub/LinuxDO provider 增加 `token.request` 与 `userinfo.request` 自定义实现，统一改用 `fetch`。
2. **行为兼容**：保留现有账号绑定策略（`allowDangerousEmailAccountLinking`）；GitHub 额外补齐 `/user/emails` 拉取，维持邮箱可用性。
3. **运行时兜底**：Pages 根环境与 preview 继续保留 `enable_nodejs_http_modules`，减少后续依赖升级时的兼容风险。
4. **回调稳定性增强**：`token.request` 透传 next-auth `checks.code_verifier`（PKCE），并对 GitHub token 交换改为不强制提交 `redirect_uri`，降低 provider 侧 `redirect_uri_mismatch` 触发概率。
5. **部署配置对齐**：`wrangler.toml` 生产配置显式迁移到 `env.production`，避免根级 `[vars]` 在本地 CLI 部署时覆盖/偏离 Dashboard 的生产环境绑定。
6. **Dashboard 构建兼容**：保留根级 `compatibility_flags`（`nodejs_compat` 等）与生产一致，避免 Dashboard 集成构建路径落到无 `nodejs_compat` 配置后触发 `crypto.getHashes` unenv 报错。

**修改文件**:
- `apps/nexus/server/api/auth/[...].ts`
- `wrangler.toml`
- `docs/plan-prd/01-project/CHANGES.md`

### Nexus 登录与账户邮箱展示优化（长邮箱省略）

**变更类型**: 交互优化 / 可读性改进

**描述**: 优化长邮箱在账户菜单与登录流程中的展示。原先长邮箱可能出现难读换行或撑破布局，现统一改为单行省略并保留 `title` 全量提示。

**主要变更**:
1. **账户菜单**：`HeaderUserMenu` 邮箱文本改为单行省略，避免 `break-all` 导致的域名断裂。
2. **登录流程**：登录/注册步骤里的邮箱预览改为单行省略，防止长邮箱挤压“更换邮箱”操作按钮。
3. **可访问性**：邮箱字段增加 `title`，鼠标悬停可查看完整邮箱。

**修改文件**:
- `apps/nexus/app/components/HeaderUserMenu.vue`
- `apps/nexus/app/pages/sign-in/components/SignInLoginStep.vue`
- `apps/nexus/app/pages/sign-in/components/SignInSignupStep.vue`
- `apps/nexus/app/pages/sign-in/index.vue`

### Core-app 首引导完成页 Welcome 收敛（对齐 Hello）+ ShortKey 组件

**变更类型**: 交互优化 / 视觉一致性

**描述**: 完成页 Welcome 动效布局对齐语言页 Hello 视觉比例，并新增独立 ShortKey 组件用于展示系统快捷键提示。

**主要变更**:
1. **Welcome 对齐 Hello 结构**：完成页动效区域改为固定容器 + 内部缩放，避免全屏占位导致主视觉失衡。
2. **ShortKey 独立组件**：新增 `BeginShortcutKey`，将按键外观与 hover/active 动效封装，供引导页复用。
3. **组合键展示完善**：完成页快捷键区改为 `Command/Ctrl + E` 双键展示，右侧补充独立 `E` 键位。
4. **Done 阶段快捷标记**：进入 Done 页面时标记 `beginner.shortcutArmed`，即使 `beginner.init=false` 也可响应 `Meta/Ctrl + E` 快捷触发。
5. **按键联动反馈**：监听 `Meta/Ctrl` 与 `E` 键盘事件，按下时同步触发双键帽“按压态”，随后追加绿色发光阴影。
6. **延迟唤起 CoreBox**：在 Done 步骤按下 `Meta/Ctrl + E` 后先播放按压+发光反馈，延迟后自动完成引导、隐藏主窗口并唤起 CoreBox。
7. **i18n 补齐**：`zh-CN/en-US` 新增 `beginner.done.shortcut.*` 文案键，并补充“可在设置中修改快捷键”提示。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/begin/internal/Done.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/components/BeginShortcutKey.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `apps/core-app/src/main/modules/box-tool/core-box/index.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 引导语言切换实时保存（点击即生效）

**变更类型**: 交互优化

**描述**: 首引导语言列表点击语言项后立即落盘并生效，不再依赖点击 Continue 才持久化。

**主要变更**:
1. **点击即保存**：语言列表点击时立刻更新 `followSystem` 与语言偏好。
2. **状态同步**：选择系统语言时实时切回 follow-system；选择其他语言时实时切换并持久化。
3. **返回默认态即跟随设备**：从语言列表返回默认卡片时强制切回系统语言并开启 follow-system，保证“默认=跟随设备”语义一致。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/begin/internal/LanguageSetup.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 首引导统一返回导航（跨步骤回退）

**变更类型**: 交互优化 / 流程修复

**描述**: 为首引导容器增加统一返回按钮，并修复原“仅记忆上一步”的回退逻辑，支持多步骤连续回退，避免来回跳转。

**主要变更**:
1. **统一返回入口**：在 `Beginner` 容器顶部新增 `TxButton` 返回按钮，所有引导步骤都可见。
2. **历史栈回退**：将原单一 `last_component` 改为历史栈，实现 `A -> B -> C -> Back -> B -> Back -> A` 的正确行为。
3. **回退一致性**：`provide('back')` 统一走容器回退逻辑，内嵌步骤调用与顶部按钮行为一致。
4. **首屏无返回按钮**：当无历史页面时隐藏返回入口，避免在 hello/首步骤出现无意义返回操作。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/begin/Beginner.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 引导语言页 startup 音效可听性修复（资源打包 + 交互重试）

**变更类型**: Bug 修复 / 体验优化

**描述**: 修复首引导语言页 startup 音效在部分环境“无声”的问题，避免静态资源未进包与自动播放策略拦截导致的失声。

**主要变更**:
1. **音效资源入包**：将 startup 音效放入 renderer 资产目录并通过 `import.meta.url` 解析，确保 dev/build 下路径一致可访问。
2. **自动播放失败兜底**：首次播放失败时自动绑定用户交互重试（pointer/keyboard），首个交互后自动重放并清理监听。
3. **音量微调**：引导音效默认音量从 `0.45` 调整为 `0.65`，提升可感知度。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/begin/internal/LanguageSetup.vue`
- `apps/core-app/src/renderer/src/assets/sounds/startup.m4a`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 引导页 i18n 全量补齐（Begin Flow）

**变更类型**: 体验优化 / 国际化一致性

**描述**: 对首引导 `begin` 流程进行全量文案排查，移除页面硬编码文案并统一接入 `vue-i18n`，确保中英文切换下引导体验一致。

**主要变更**:
1. **文案全量收敛到 i18n**：`AccountDo / Done / Forbidden / OptionMode / License` 中所有用户可见文案改为 `t(...)` 获取，去除模板硬编码字符串。
2. **交互提示国际化**：账号引导页登录成功/失败 toast 统一改为 i18n key，避免固定中文提示。
3. **语言包补齐**：`zh-CN/en-US` 新增 `beginner.account / beginner.done / beginner.forbidden / beginner.optionMode / beginner.license` 文案分组。
4. **代码清理**：删除引导页内无效注释与废弃注释代码，降低噪音并保持结构清晰。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/begin/internal/AccountDo.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/Done.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/Forbidden.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/OptionMode.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/License.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app SetupPermissions 首引导页可继续性修复（Tx 组件化收敛）

**变更类型**: Bug 修复 / 交互优化

**描述**: 修复权限页“已授权但继续按钮不可点”的体验问题，并将权限条目状态展示收敛到 Tuffex 组件，减少自定义样式复杂度。

**主要变更**:
1. **继续按钮可操作性修复**：移除基于同步状态的 `disabled` 门禁，改为点击时执行异步校验并给出提示，避免状态短暂未同步导致按钮“看起来不可点”。
2. **防重复提交**：新增 `isContinuing` 保护，继续动作进入加载态，避免多次点击触发重复跳转。
3. **Tx 组件替换**：权限条目容器切换为 `TxCard`，状态展示切换为 `TxStatusBadge`，保留 `TxButton` 操作入口。
4. **设置区组件化**：开关区切到 `TxCardItem + TuffSwitch` 组合，统一条目结构与交互语义，减少自定义块级布局。
5. **样式简化**：删除对 legacy `TBlockSelection` 的依赖样式，改为更扁平的结构样式与响应式收敛。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/begin/internal/SetupPermissions.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app SetupPermissions 权限页切换为 GroupBlock 方案（对齐 Settings 视觉）

**变更类型**: 交互优化 / 视觉一致性

**描述**: 首引导权限页移除 `TxCard` 形态，改为与 App Settings 一致的 `groupblock` 套件组织结构，减少样式分叉，提升组件一致性。

**主要变更**:
1. **权限区收敛**：权限条目统一使用 `TuffGroupBlock + TuffBlockSlot + TuffStatusBadge`，移除 `TxCard/TxCardItem` 组合。
2. **设置区收敛**：开关项统一使用 `TuffBlockSwitch`，保持与设置页相同交互语义。
3. **操作入口保留**：继续沿用 `TxButton` 作为重检/继续入口，兼容当前引导流程按钮交互。
4. **样式降复杂**：删除卡片特化样式，保留最小必要布局样式（状态区与响应式按钮排列）。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/begin/internal/SetupPermissions.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 首次引导收敛为单页语言确认（内嵌 Hello 动效）

**变更类型**: 交互优化 / 流程简化

**描述**: 根据最新交互调整，将原本独立的 Hello 页面合并进语言确认页顶部展示，移除单独 Hello 步骤，首次引导直接从 LanguageSetup 开始。

**主要变更**:
1. **移除独立 Hello 步骤**：`Beginner` 首屏恢复为 `LanguageSetup`，删除 `Greeting` 页面链路，减少一次页面切换。
2. **首屏主视觉替换**：语言页头部从“欢迎来到 Tuff”文本替换为 `hello.json` Lottie 动效，保留“我们已将您的语言设置为 {lang}”说明文案。
3. **流程保持稳定**：默认仍为系统语言确认，点击 `Change Language` 才展开列表，`Continue` 进入账号步骤。
4. **交互收敛到 Tuffex 组件**：语言信息区改为 `TxCard`，减少超宽占位并统一卡片视觉；底部 `Change Language` 保持 `TxButton`。
5. **列表可回退 + 过渡动画**：语言列表新增返回入口，支持从列表回到默认态，并增加入场/退场过渡动画；`hello` 动效与 startup 音效在语言页持续可见可听。
6. **尺寸与对齐再收敛**：语言区块整体缩小并左对齐，语言默认态与语言列表项前增加语言 icon，提升信息密度与识别度。
7. **布局回归居中与样式简化**：语言页整体重新居中，默认语言卡片采用“左侧语言 icon + 右侧文案”的结构，并合并样式规则以减少组件级微调代码。
8. **字号继续收敛 + 默认勾选态显式化**：语言页文本字号整体再收缩约 40%，并在默认态与列表态的右侧统一展示 checkmark（选中填充、未选中描边）。
9. **动效速度微调**：语言页 `hello` 动效恢复默认速率（1x）；完成页 `welcome` 动效在加载后设置 `setSpeed(1.5)`，保证节奏更紧凑但不突兀。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/begin/Beginner.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/LanguageSetup.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/Greeting.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/Done.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 首次引导语言流程重排（Hello 自动切换 + 系统语言默认确认）

**变更类型**: 交互优化 / 流程修正

**描述**: 调整首次引导顺序为「Hello 动画页 → 语言确认页 → 账号步骤」，并将语言页默认交互改为“系统语言直接继续、点击 Change Language 再进入列表选择”。

**主要变更**:
1. **引导链路重排**：`Beginner` 首屏改为 `Greeting`，`LanguageSetup` 的下一步改为 `AccountDo`，去除“语言页后再进 Hello 页”的反直觉路径。
2. **Hello 自动过渡**：`Greeting` 阶段监听 Lottie 播放完成与启动音效结束，二者都完成后延迟 1 秒自动跳转语言页，无需手动点击。
3. **语言页默认态收敛**：首屏文案改为“欢迎来到 Tuff / 我们已将您的语言设置为 {lang}”，默认按系统语言继续；点击底部 `Change Language` 才展开语言列表。
4. **Lottie 组件事件补齐**：`LottieFrame` 新增 `complete` 事件与卸载清理，支撑引导页对动画结束时机的精确编排。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/begin/Beginner.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/Greeting.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/LanguageSetup.vue`
- `apps/core-app/src/renderer/src/components/icon/lotties/LottieFrame.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 首次引导体验修复（索引延后 + 登录态修正 + Hello 音效 + 语言页美化）

**变更类型**: Bug 修复 / 体验优化

**描述**: 修复首次引导阶段“索引任务与引导并发导致启动期噪音/卡顿体感”与“登录按钮长期 loading”问题；同时补齐 Hello 阶段音效与语言选择页视觉优化。

**主要变更**:
1. **索引任务延后**：SearchEngine provider 加载改为“首次引导完成后再启动”，并通过 `appSetting.beginner.init` 订阅恢复加载，减少首次引导期间的扫描/索引竞争。
2. **登录 loading 语义修正**：引导登录页按钮 loading 改为仅跟随登录动作（`isSigningIn/isLoggingIn`），不再绑定认证初始化状态。
3. **Learn more 接入 Nexus**：引导登录说明链接切到 `getAuthBaseUrl()/sign-in`，统一走 Nexus 入口。
4. **Hello 音效**：Greeting 阶段挂载时播放 `public/sound/startup.m4a`，离开阶段自动停止。
5. **语言选择页视觉优化**：增强卡片层次、渐变背景、选中态与按钮反馈，保持现有流程与交互不变。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
- `apps/core-app/src/renderer/src/views/base/begin/internal/AccountDo.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/Greeting.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/LanguageSetup.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app OCR 队列失败熔断与延迟重试收敛（降低 SQLite 写争用）

**变更类型**: Bug 修复 / 稳定性增强

**描述**: 针对 OCR 高频失败导致的 `ocr_jobs` 重试风暴与 SQLite 写入争用，新增“按错误分类延迟重试 + 失败熔断自动停队列 + 用户提醒”机制，优先抑制异常配置或外部服务故障带来的持续回压。

**主要变更**:
1. **重试策略延长**：补充 `Native OCR module unavailable`、`OCR provider network failure` 等错误分类，并拉长相应重试间隔。
2. **持久化重试时间**：调度改为依赖 `ocr_jobs.nextRetryAt` 过滤可执行任务，移除仅内存重试节流依赖，避免重启后行为漂移。
3. **自动熔断停队列**：在时间窗内连续失败达到阈值后自动暂停 OCR 队列，并在 24h 内重复触发时按阶梯拉长冷却（30m → 1h → 2h …，上限 12h），避免持续冲击数据库写队列。
4. **用户可感知告警**：触发自动暂停时写入通知 Inbox，提示“多次错误已自动暂停”并附带恢复时间与排查建议。
5. **状态可观测**：OCR dashboard 快照新增 `queueDisabled` 状态，便于排障与运维观测。

**修改文件**:
- `apps/core-app/src/main/modules/ocr/ocr-service.ts`
- `apps/core-app/src/main/modules/ocr/ocr-service.test.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 性能诊断与重试日志降噪（聚合输出）

**变更类型**: 观测优化 / 稳定性增强

**描述**: 针对 `D.2026-02-24.log` 中高频重复日志（`DbRetry`、`AnalyticsStore`、`Perf:EventLoop`、`AuditLogger`）引发的信噪比下降问题，改为“按窗口聚合 + 节流输出”，保留关键异常可见性并显著降低刷屏。

**主要变更**:
1. **DbRetry 聚合节流**：`SQLITE_BUSY` 重试日志默认节流窗口从 5s 提升至 30s，并追加 `suppressedRetries` 聚合计数。
2. **AnalyticsStore 汇总**：快照/插件/清理的 queue-pressure 日志收敛为 60s 周期汇总，避免同类 warn 高频重复。
3. **EventLoop diagnostics 收敛**：`Event loop lag diagnostics` 改为“根因变化或高严重度窗口触发”再输出，减少重复诊断行。
4. **Perf summary 门禁**：`Perf summary / Top slow` 仅在存在 error 或慢事件超阈值时输出。
5. **AuditLogger 错误节流**：`flush` 与 `usage stats` 失败日志改为节流聚合，保留首条与 suppression 计数。
6. **Clipboard.persist 上下文释放修复**：将 `Clipboard.persist` 性能上下文释放迁移到 `finally`，避免异常路径遗漏释放导致事件循环诊断出现“超长持续中”误报。

**修改文件**:
- `apps/core-app/src/main/db/sqlite-retry.ts`
- `apps/core-app/src/main/modules/analytics/storage/db-store.ts`
- `apps/core-app/src/main/utils/perf-monitor.ts`
- `apps/core-app/src/main/modules/ai/intelligence-audit-logger.ts`
- `apps/core-app/src/main/modules/clipboard.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 启动链路卡顿治理（Storage Polling 不再被 AppTask 长时间阻塞）

**变更类型**: 性能修复 / 稳定性增强

**描述**: 结合 `D.2026-02-24.log` 与 `E.2026-02-24.err` 中 `storage.polling` 长时间活跃（12s/18s）与 `AppProvider.startupBackfill` 同窗问题，收敛主线程调度阻塞链路，避免“单任务长占用”放大为全局 perf 告警。

**主要变更**:
1. **AppTaskGate 支持超时等待**：`waitForIdle(timeoutMs)` 新增超时返回与 waiter 清理，避免等待队列在超时场景累积。
2. **Storage 持久化等待预算化**：`persistConfig` 对 app task 空闲等待增加 250ms 上限，超时后继续落盘，避免 `storage.polling` callback 长时间占用 PollingService 调度循环。
3. **Backfill 启动延后**：`AppProvider` 启动补漏从 500ms 延后至 15s，降低冷启动阶段与配置持久化、渲染初始化的竞争。
4. **BoxItem 同步通道前置注册**：CoreBox IPC register 阶段主动初始化 `BoxItemManager`，消除冷启动窗口期 `box-item:sync` 无 handler 错误。

**修改文件**:
- `apps/core-app/src/main/service/app-task-gate.ts`
- `apps/core-app/src/main/modules/storage/index.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/ipc.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app Analytics 上报压缩与失败熔断（减少高频重试与噪音）

**变更类型**: 观测优化 / 稳定性增强

**描述**: 针对 `analytics messages` 在网络异常下高频重试、重复告警与上报节奏过密问题，改为“批量压缩 + 抖动调度 + 失败熔断 + 节流日志”策略，降低上报风暴与日志噪音。

**主要变更**:
1. **上报节奏压缩**：基础 flush 周期由 30s 调整到 2min，批次由 10 提升到 25，减少请求频率。
2. **请求抖动分散**：flush 调度增加 ±20% jitter，避免多实例同周期集中上报。
3. **失败熔断**：连续失败达到阈值后开启 circuit cooldown（10m 起步，指数拉长，最大 60m），冷却期内暂停主动上报。
4. **日志节流聚合**：`Failed to report analytics messages` 改为 3min 节流输出，并附 `suppressedFailures` 汇总。
5. **队列元信息增强**：上报 payload 增加 `firstAt/lastAt/avgIntervalMs/count` 聚合字段，便于服务端按窗口做均值/频次分析。
6. **快照持久化降频**：`15m/1h/24h` 窗口写入增加最小持久化间隔（2min/5min/15min），并输出 `snapshotsThrottled` 汇总，减少 DB 写放大与无效上报。
7. **窗口封口写入**：`AnalyticsCore` 增加最小记录间隔 + 窗口强制封口策略，避免高频事件导致 1m 扇出快照过密。
8. **动态采样**：插件 SDK 非关键埋点按 DB 队列深度动态降采样（100%/50%/25%/10%），高压时优先保护主流程。
9. **健康指标日志**：新增 5min reporter health 指标（`requestsPerMin`、`queueDepth`、`dropRate`、`failRate`、`sdkSampleDropRate`），便于量化压缩收益。

**修改文件**:
- `apps/core-app/src/main/modules/analytics/analytics-module.ts`
- `apps/core-app/src/main/modules/analytics/core/analytics-core.ts`
- `apps/core-app/src/main/modules/analytics/storage/db-store.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 构建阶段预打包内置插件 Prelude（修复 utils 子路径 require 失败）

**变更类型**: Bug 修复 / 构建链增强

**描述**: 修复内置插件 `index.js` 在构建产物运行时直接 `require('@talex-touch/utils/*')` 子路径可能触发 `Cannot find module` 的问题。构建脚本新增“内置插件 Prelude 预打包”步骤，在 `npm run build` 前统一将 `tuff/modules/plugins/*` 的 `manifest.main` 入口打包为单文件，避免运行时再解析 workspace 子路径。

**主要变更**:
1. **构建前统一预打包**：`build-target.js` 增加内置插件 Prelude bundling 步骤，覆盖 `apps/core-app/tuff/modules/plugins` 下可执行插件入口。
2. **解析路径显式兜底**：预打包时注入 `nodePaths`（`apps/core-app/node_modules` + workspace 解析链），确保可解析 `@talex-touch/utils/*` 子路径。
3. **失败即中断构建**：任一插件 Prelude 预打包失败时直接中止打包流程，避免生成带隐患构建产物。

**修改文件**:
- `apps/core-app/scripts/build-target.js`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app OmniPanel Feature Hub 首期落地（自动装载 + Feature 执行链）

**变更类型**: 功能增强 / 架构收敛

**描述**: OmniPanel 从固定快捷动作升级为 Feature Hub，支持插件 Feature 执行、安装后自动装载首个 Feature、声明式 omniTransfer（含 SDK 门槛）与主渲染协议统一事件。

**主要变更**:
1. **Feature Hub 协议**：`omni-panel` 事件新增 `list/toggle/reorder/execute/refresh` typed payload，替代纯前端固定动作。
2. **主进程执行链**：OmniPanel 主进程模块新增注册表持久化、builtin/plugin/corebox 分发执行、上下文注入与刷新广播。
3. **自动装载策略**：新增安装后自动装载逻辑（声明式优先，回退首个可执行 feature），并接入插件安装完成事件。
4. **设置项落地**：通用设置新增 `autoMountFirstFeatureOnPluginInstall` 开关，默认关闭。
5. **SDK 与类型扩展**：插件类型新增 `feature.omniTransfer`；SDK 新增 `260225` 与声明式门槛常量。
6. **面板 UI 重构**：OmniPanel 渲染层改为 Feature 列表视图，支持启停、排序、搜索与执行反馈。

**修改文件**:
- `apps/core-app/src/shared/events/omni-panel.ts`
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `apps/core-app/src/main/core/eventbus/touch-event.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.ts`
- `apps/core-app/src/main/modules/plugin/plugin-feature.ts`
- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingSetup.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `packages/utils/common/storage/entity/app-settings.ts`
- `packages/utils/plugin/index.ts`
- `packages/utils/plugin/sdk-version.ts`

## 2026-02-23

### Core-app Widget Feature issue 降级为 warning，并忽略非开发模式下隐藏实验特性

**变更类型**: Bug 修复 / 噪音收敛

**描述**: 修复 widget feature 在资源缺失或编译失败时统一上报为 error 的问题，改为 warning；同时对 `experimental` 且插件非开发模式的 feature，不再触发 widget 预编译与 issue 上报，避免对正式可见功能造成干扰告警。

**主要变更**:
1. **issue 级别收敛**：widget loader/manager/compiler/processors 的 feature 级问题统一走 warning。
2. **隐藏实验特性免打扰**：新增 `isWidgetFeatureEnabled` 判定，非开发模式下跳过 `experimental` feature 的 issue 产生。
3. **预编译流程对齐可见性**：插件加载阶段的 widget 预编译与未使用扫描仅处理当前模式可见 feature。
4. **复用统一入口**：新增 `pushWidgetFeatureIssue`，统一注入 source/timestamp 并减少重复实现。

**修改文件**:
- `apps/core-app/src/main/modules/plugin/widget/widget-issue.ts`
- `apps/core-app/src/main/modules/plugin/widget/widget-loader.ts`
- `apps/core-app/src/main/modules/plugin/widget/widget-manager.ts`
- `apps/core-app/src/main/modules/plugin/widget/widget-compiler.ts`
- `apps/core-app/src/main/modules/plugin/widget/processors/script-processor.ts`
- `apps/core-app/src/main/modules/plugin/widget/processors/tsx-processor.ts`
- `apps/core-app/src/main/modules/plugin/widget/processors/vue-processor.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 窗口偏好切换为 pure/refraction/filter 并修正语义

**变更类型**: 交互修复 / 语义收敛

**描述**: 窗口偏好统一为 `pure` / `refraction` / `filter` 三档，并修正“普通与 Mica 观感反向”的问题。`pure` 使用纯色背景阻断窗口材质透出，`refraction` 保持材质透出，`filter` 在透出基础上叠加滤镜。

**主要变更**:
1. **偏好值统一**：窗口偏好类型改为 `pure/refraction/filter`，并兼容历史 `Default/Mica/Filter` 自动归一化。
2. **设置页切换**：ThemeStyle 的窗口偏好入口改为三档新值，Filter 可直接选择。
3. **渲染语义修复**：`AppLayout` 重新对齐 pure/refraction/filter 的透明度策略与 touch-blur 触发条件，pure 下增加纯色底阻断窗口特效透出。
4. **Header 分区透明度对齐**：Header 左侧（侧栏对应区）跟随 aside 透明度，右侧使用 header 透明度，消除左右明暗错位。
5. **壁纸链路兼容**：壁纸模糊与透明度附加策略改为基于 pure/refraction/filter 判定。
6. **文案与预览更新**：窗口偏好文案改为首字母大写（Pure/Refraction/Filter），ThemePreference 展示与预览样式切换到新值语义。
7. **切换反馈增强**：切换窗口偏好后增加全屏遮罩 + Spinner 短暂加载态，明确“窗口效果应用中”状态。

**修改文件**:
- `packages/utils/common/storage/entity/layout-atom-types.ts`
- `packages/utils/__tests__/preset-export-types.test.ts`
- `apps/core-app/src/renderer/src/modules/storage/theme-style.ts`
- `apps/core-app/src/renderer/src/views/base/styles/ThemeStyle.vue`
- `apps/core-app/src/renderer/src/views/base/styles/SectionItem.vue`
- `apps/core-app/src/renderer/src/views/base/styles/sub/ThemePreference.vue`
- `apps/core-app/src/renderer/src/views/layout/AppLayout.vue`
- `apps/core-app/src/renderer/src/styles/layout/_layout-shell.scss`
- `apps/core-app/src/renderer/src/modules/layout/useWallpaper.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 插件 Manifest 保存通道克隆失败修复

**变更类型**: Bug 修复 / 传输稳定性

**描述**: 修复插件详情页保存 dev 配置时，`manifest` 通过 transport 发送前携带 Vue 响应式代理对象，触发 `An object could not be cloned` 导致保存失败的问题。

**主要变更**:
1. **发送前序列化**：`pluginSDK.saveManifest` 在发送前统一将 `manifest` 转换为 JSON 可序列化的普通对象，避免 Proxy 进入 IPC payload。
2. **失败可观测**：当 `manifest` 不可 JSON 序列化时记录明确错误日志并返回失败，避免继续发送导致 transport 层克隆异常。

**修改文件**:
- `apps/core-app/src/renderer/src/modules/sdk/plugin-sdk.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 低电量阈值配置移除（保留低电量模式开关）

**变更类型**: 配置收敛 / UI 简化

**描述**: 动效设置中移除“低电量阈值”滑块与相关可配置字段，低电量模式仅保留开关；阈值改为统一跟随 `DeviceIdle` 电量策略，避免重复配置。

**主要变更**:
1. **设置页简化**：`ThemeStyle` 移除阈值滑块，仅保留“低电量模式”开关。
2. **运行时收敛**：`useBatteryOptimizer` 不再读取用户阈值配置，统一读取 `DeviceIdle.blockBatteryBelowPercent` 作为低电量判定阈值。
3. **配置模型清理**：`app-settings` 默认配置移除 `animation.lowBatteryThreshold` 字段，并清理对应 i18n 文案键。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/styles/ThemeStyle.vue`
- `apps/core-app/src/renderer/src/modules/hooks/useBatteryOptimizer.ts`
- `packages/utils/common/storage/entity/app-settings.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 后台索引调度电量策略抽离（BatteryPolicy）

**变更类型**: 架构收敛 / 调度策略复用

**描述**: 将后台索引调度相关的“低电量禁区”判断抽离为统一 `BatteryPolicy`，并将插件电量 SDK、渲染侧低电量动效判定统一接入同一阈值来源，避免多处重复实现与阈值漂移。

**主要变更**:
1. **统一策略模型**：在 `packages/utils/common` 新增 `BatteryPolicy`、`normalizeBatteryPolicy`、`evaluateBatteryPolicy` 与 `clampBatteryPercent`。
2. **服务判定复用**：`DeviceIdleService.canRun` 改用统一策略评估函数返回 `battery-low / battery-critical`。
3. **索引策略单源化**：`FileProvider` 移除本地电量阈值字段，自动扫描/手动重建统一以 `DeviceIdleService` 电量策略为准。
4. **插件与渲染对齐**：插件 `power` SDK 默认阈值与渲染侧 `useBatteryOptimizer` 统一读取 `DeviceIdle.blockBatteryBelowPercent`。
5. **前端入口下沉**：`SettingFileIndex` 的策略配置组改为常显，用户可直接配置统一 BatteryPolicy。
6. **回归保障**：新增 `battery-policy` 单测，覆盖策略归一化、critical 优先级、充电豁免与阈值裁剪行为。

**修改文件**:
- `packages/utils/common/battery-policy.ts`
- `packages/utils/common/index.ts`
- `packages/utils/__tests__/battery-policy.test.ts`
- `apps/core-app/src/main/service/device-idle-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useBatteryOptimizer.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 剪贴板自动粘贴/自动清除时间档位收敛

**变更类型**: 配置优化 / Bug 修复

**描述**: 调整工具设置中的时间档位，自动粘贴默认值改为 5 秒，自动清除默认值改为 5 分钟；同时将时间范围收敛为最短 1 秒、最长 5 分钟，并修复自动粘贴在从“禁用”切回定时值后偶发不生效的问题。

**主要变更**:
1. **默认值调整**：`tools.autoPaste.time` 默认改为 `5`（秒），`tools.autoClear` 默认改为 `300`（秒）。
2. **档位范围收敛**：自动粘贴/自动清除时间档位统一为 `1s ~ 5min`，移除 `10min/15min` 档位。
3. **生效逻辑修复**：`autoPaste.enable` 与 `autoPaste.time` 强绑定，避免历史 `enable=false` 遗留导致时间已切回但仍不触发自动粘贴。
4. **历史值兼容**：对超出新档位的历史时间值按最近档位归一，减少迁移冲击。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/settings/SettingTools.vue`
- `packages/utils/common/storage/entity/app-settings.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 剪贴板省电轮询项高级设置门禁修复

**变更类型**: Bug 修复 / 设置门禁一致性

**描述**: 修复工具设置中「剪贴板省电轮询策略」「剪贴板省电轮询间隔」在未开启高级设置时仍可见的问题，现仅在 `advancedSettings` 开启后展示。

**主要变更**:
1. **显示门禁补齐**：`SettingTools` 新增 `showAdvancedSettings` 计算属性，并将两个省电轮询项包裹在高级设置条件渲染下。
2. **行为一致性恢复**：与项目其他高级项保持一致，默认模式下不暴露高级策略配置。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/settings/SettingTools.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app Nexus 数据上传说明与匿名模式登录门禁

**变更类型**: 体验优化 / 隐私策略收敛

**描述**: Nexus 数据分析设置移除独立说明行，改为“启用数据上传”后的帮助 Tooltip；匿名模式默认关闭且未登录时不可切换，并在运行时对未登录状态强制按 `false` 生效。

**主要变更**:
1. **说明形态调整**：将原“说明”文案收敛到“启用数据上传”后的 `?` 图标 Tooltip，并精简提示文本。
2. **匿名门禁**：匿名模式开关在未登录时禁用，UI 展示固定为关闭；登录后才允许切换。
3. **生效逻辑收敛**：主进程对匿名模式新增登录态门禁，未登录即使配置为开启也按关闭执行。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/settings/SettingSentry.vue`
- `apps/core-app/src/main/modules/sentry/sentry-service.ts`
- `apps/core-app/src/main/modules/analytics/analytics-module.ts`
- `apps/core-app/src/main/modules/storage/main-storage-registry.ts`

### Core-app 静默启动配置链路修复（dev/prod）

**变更类型**: Bug 修复 / 配置一致性修复

**描述**: 修复“静默启动”在开发与生产环境均可能不生效的问题。根因是设置页部分入口仍在读写历史分散键（如 `app.window.startSilent` 独立文件），而启动阶段与托盘逻辑读取的是 `app-setting.ini` 的 `window.startSilent`，导致配置来源不一致。

**主要变更**:
1. **主进程启动兼容**：`TouchApp` 启动前读取 `app-setting.ini` 时，兼容合并历史 `app.window.startSilent` 文件值（仅在历史文件更新更晚或主配置缺失时生效），并回写到 `app-setting.ini`，保证后续链路单一来源。
2. **设置页写入收敛（Window）**：`SettingWindow` 改为直接读写 `appSetting.window.*` 与 `appSetting.setup.autoStart`，不再写入历史分散键文件。
3. **设置页写入收敛（Setup）**：`SettingSetup` 移除对历史分散键的读写，统一使用 `appSetting` 持久化并保留托盘/开机自启实时同步调用。
4. **行为结果**：静默启动设置可在 dev/prod 一致生效，且后续修改不会再被历史分散键污染。
5. **开发环境窗口行为修复**：静默启动时不再自动打开 DevTools，避免 dev 下因 DevTools 自动弹出导致主窗口被显式激活。

**修改文件**:
- `apps/core-app/src/main/core/touch-app.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingWindow.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingSetup.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 布局方案与窗口透明度解耦

**变更类型**: 交互一致性修复 / 视觉策略收敛

**描述**: 布局方案（simple/flat/compact 等）不再驱动主界面 header/aside 的透明度。透明度统一由窗口偏好（Default/Mica/Filter）控制，避免切换布局时出现非预期明暗变化。

**主要变更**:
1. **类型模型清理**：`LayoutAtomConfig` 移除 `header.opacity` 与 `aside.opacity` 字段，布局模型不再承载透明度语义。
2. **默认值与预设清理**：应用默认布局原子与各布局 preset（simple/flat/compact/minimal/classic/card/dock）移除 opacity 字段，避免旧预设继续影响透明度。
3. **布局原子解析收敛**：`resolveLayoutAtomsToCSSVars` 不再输出 `header/aside` 的 opacity 变量，只保留布局结构相关变量（边框、高度、宽度、位置等）。
4. **Layout Shell 变量改造**：`header/aside` 的 fake opacity 改为读取 `--layout-window-*` 变量，不再依赖 `--layout-*opacity`。
5. **窗口偏好接管透明度**：`AppLayout` 按 `theme.window` 计算并注入 `--layout-window-header-opacity` / `--layout-window-aside-opacity`，实现“窗口偏好影响透明度，布局方案仅影响布局”。
6. **预设默认清理**：移除 `LayoutShell` 中按布局 preset 注入的透明度变量，避免默认值回流干扰。
7. **历史配置自动清洗**：主进程 Storage 在读取/保存 `app-setting.ini` 时自动移除 `layoutAtomConfig.header/aside.opacity` 遗留字段，并在后续持久化时写回清洗结果。

**修改文件**:
- `packages/utils/common/storage/entity/layout-atom-types.ts`
- `packages/utils/common/storage/entity/app-settings.ts`
- `apps/core-app/src/renderer/src/modules/layout/atoms/presets.ts`
- `apps/core-app/src/renderer/src/modules/layout/atoms/atomResolver.ts`
- `apps/core-app/src/renderer/src/styles/layout/_layout-shell.scss`
- `apps/core-app/src/renderer/src/views/layout/shared/LayoutShell.vue`
- `apps/core-app/src/renderer/src/views/layout/AppLayout.vue`
- `packages/utils/__tests__/preset-export-types.test.ts`
- `apps/core-app/src/main/modules/storage/main-storage-registry.ts`
- `apps/core-app/src/main/modules/storage/index.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 布局预设编辑入口双门禁（Dev + 高级设置）

**变更类型**: 体验收敛 / 权限边界修正

**描述**: “自定义主界面 / 自定义 CoreBox / Nexus 预设” 三个 Beta 入口改为仅在 `dev` 启动版本且开启 `advancedSettings` 时可见，避免普通用户误触开发中能力。

**主要变更**:
1. **门禁条件统一**：`LayoutSection` 新增 `showPresetEditors`，仅在 `startupInfo.isDev === true && appSetting.dev.advancedSettings === true` 时显示入口。
2. **可见性收敛**：三个入口统一切换为条件渲染，非门禁状态下不占位、不展示。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/styles/LayoutSection.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app Header 左右分区透明度对齐 Sidebar

**变更类型**: 视觉一致性修复

**描述**: 窗口 Header 透明度按左右区域拆分：左侧（或右侧 Sidebar 对应区）与 Sidebar 保持相同透明度，另一侧保持 Header 透明度，避免顶部与侧栏交界处明暗不一致。

**主要变更**:
1. **Header 分区渲染**：将 Header 背景拆分为“侧栏对应区 + 主内容区”两段透明度。
2. **透明度对齐规则**：侧栏对应区使用 `--layout-window-aside-opacity`，主内容区使用 `--layout-window-header-opacity`。
3. **位置兼容**：适配 `aside-right`、`aside-bottom`、`aside-hidden` 三种布局位置，确保各模式下透明度行为一致。

**修改文件**:
- `apps/core-app/src/renderer/src/styles/layout/_layout-shell.scss`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 关于页条款入口接入官网文档跳转

**变更类型**: 体验修复 / 链路补齐

**描述**: 设置页「应用程序规范（Touch）」中的 `TalexTouch 服务条款` 与 `TalexTouch 软件许可证` 由仅展示文本改为可点击跳转，直接打开官网对应文档页面。

**主要变更**:
1. **条款链接接入**：点击 `服务条款` 跳转至 `Nexus /license`（服务条款页）。
2. **许可证链接接入**：点击 `软件许可证` 跳转至 `Nexus /protocol`（软件许可证页）。
3. **URL 来源统一**：链接基于 `getTuffBaseUrl()` 生成，避免硬编码域名。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/settings/SettingAbout.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 插件权限历史授权软禁用与预览读文件超时收敛

**变更类型**: 安全修复 / 稳定性修复 / 体验优化

**描述**: 修复插件权限在 Manifest 缩减后仍可沿用历史授权的问题。现在历史授权记录保留在本地存储中，但当权限未被当前 Manifest 声明时，运行时将拒绝访问；插件权限页同步提示“历史授权已禁用”。同时修复文件预览 `app:system:read-file` 在不可达路径场景下长时间阻塞导致的 IPC 超时报错。

**主要变更**:
1. **运行时权限收敛**：权限检查新增“声明态”约束，未在当前 Manifest 中声明的非默认权限即使历史上已授予，也不会在运行时生效。
2. **历史记录保留**：权限存储不删除历史授权记录，新增 `deprecatedGranted` 状态用于标记“保留但失效”的历史授权。
3. **插件页提醒**：插件详情权限页新增历史授权禁用提示区，按“应用更新后已过时 / 插件不再需要（曾授予）”两类标记展示，状态摘要支持显示“历史授权已禁用”。
4. **读文件超时控制**：`app:system:read-file` 新增可选超时参数并在主进程执行超时中断，Code/Text/Markdown 预览对超时给出用户友好提示，减少控制台噪音。
5. **快捷键入口迁移**：将“插件注册的全局快捷键”管理区从权限页迁移到详情页，权限页聚焦权限治理，详情页集中展示插件基础信息与运行配置。
6. **快捷键空态样式收敛**：插件详情页快捷键分组中的空态内层卡片去除圆角，避免与外层分组圆角叠加造成视觉噪点。

**修改文件**:
- `apps/core-app/src/main/modules/permission/permission-store.ts`
- `apps/core-app/src/main/modules/permission/permission-guard.ts`
- `apps/core-app/src/main/modules/permission/index.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/main/channel/common.ts`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginDetails.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginPermissions.vue`
- `apps/core-app/src/renderer/src/components/render/addon/preview/CodePreview.vue`
- `apps/core-app/src/renderer/src/components/render/addon/preview/TextPreview.vue`
- `apps/core-app/src/renderer/src/components/render/addon/preview/MarkdownPreview.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `packages/utils/permission/index.ts`
- `packages/utils/permission/types.ts`
- `packages/utils/transport/events/types/app.ts`
- `apps/core-app/src/main/modules/permission/permission-guard.test.ts`
- `packages/utils/__tests__/permission-status.test.ts`

### Core-app Store 新增 Tuff CLI Beta 页签联动

**变更类型**: 新功能 / 市场联动（Beta）

**描述**: Core-app 市场页新增 Tuff CLI 联动能力：当系统检测到已安装 `tuff` CLI 时，市场顶部出现 `CLI` 页签；当前阶段该页签仅提供 Beta 占位说明，标注“开发中”。

**主要变更**:
1. **安装检测接入**：平台能力列表查询时动态探测 `tuff --version`（含 Windows 候选命令），并引入 TTL 缓存降低探测频率。
2. **能力映射收敛**：检测通过后动态注入 `platform.tuff-cli` Beta 能力，供渲染层统一读取。
3. **市场页签联动**：`Store` 页按能力结果动态展示 `CLI` 页签，且在能力不可用时自动回退到 `store` 页签。
4. **Beta 占位页**：新增 `MarketCliBeta` 视图，展示“Beta Feature / 开发中”提示，明确当前交付状态。
5. **i18n 补齐**：补充中英文市场 CLI 文案键，保证多语言一致。

**修改文件**:
- `apps/core-app/src/main/channel/common.ts`
- `apps/core-app/src/renderer/src/views/base/Store.vue`
- `apps/core-app/src/renderer/src/components/store/MarketHeader.vue`
- `apps/core-app/src/renderer/src/views/base/store/MarketCliBeta.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`

### Core-app PluginInfo 问题入口改为悬浮按钮 + Flip 弹窗

**变更类型**: 交互优化 / 可视反馈增强

**描述**: PluginInfo 页面移除独立「问题」Tab，改为右下角常驻悬浮 `?` 按钮；点击后使用 Flip 动画打开问题弹窗。按钮根据问题等级显示差异化呼吸光效，无问题时不展示入口。

**主要变更**:
1. **入口形态调整**：移除 `Issues` Tab，仅在存在 `plugin.issues` 时渲染右下角悬浮按钮。
2. **Flip 弹层接入**：接入 `TxFlipOverlay`，以悬浮按钮为 source 打开问题弹窗，弹层内复用 `PluginIssues` 内容。
3. **风险视觉分级**：warning 显示浅黄色呼吸环；error 显示更强红色呼吸光效并叠加阴影，提升问题感知优先级。

**修改文件**:
- `apps/core-app/src/renderer/src/components/plugin/PluginInfo.vue`

### Core-app 插件存储页汉化与配置分组迁移

**变更类型**: 体验优化 / i18n 收敛 / UI 组件标准化

**描述**: 插件存储页完成全量 i18n 接入，替换原自定义统计卡为 tuffex `TxStatCard`，并将插件详情页中的“配置系统（路径目录）”信息迁移到存储页，统一“存储 + 路径”操作入口。

**主要变更**:
1. **统计卡标准化**：存储页顶部四个数据卡改为 `TxStatCard`（含占用率 progress 变体），移除重复样式实现。
2. **页面文案汉化**：存储页标题、按钮、空态、表头、状态栏、路径配置区全部接入 i18n，不再存在硬编码英文。
3. **配置系统迁移**：在存储页新增 `TuffGroupBlock` 配置分组，承载插件路径/数据目录/配置目录/日志目录，并支持直接打开对应路径。
4. **详情入口下移**：存储文件表格从主卡片主体迁移为“配置系统”中的“详细信息”入口，点击按钮通过 `TxFlipOverlay` 打开完整表格详情。
5. **文案字典补齐**：补充 `plugin.storage.*` 中英文键，覆盖统计、空态、表格、底栏、配置区、详情入口与路径打开失败提示。
6. **路径展示收敛**：配置系统中的路径展示统一为 `~/` 别名样式（如 `~/data/`、`~/data/config/`），右侧操作入口统一使用 `TxButton` 图标按钮。
7. **整块迁移完成**：原“存储文件”整块（标题、操作按钮、文件表格、底栏状态）整体迁移到“详细信息”弹窗中；配置系统仅保留“详细信息”入口与路径配置项。

**修改文件**:
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginStorage.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-app 插件详情开发设置分组下移与保存链路收敛

**变更类型**: 体验优化 / 可维护性修复

**描述**: 插件详情页改为“基础信息 + 开发设置分组”结构。开发配置不再通过弹窗管理，而是新增独立 `TuffGroupBlock` 下移展示；同时修复开发设置保存链路中的状态漂移问题，并补齐 manifest 全文查看能力。

**主要变更**:
1. **基础信息收敛**：详情页仅展示插件 ID、插件名称、插件描述；插件 ID 支持点击复制，hover 时仅对 ID 值增加下划线提示可复制。
2. **基础信息增强**：`自动启动` 从开发设置分组上移到基础信息分组；在“插件开发模式启用”或“应用处于 dev 环境”时提供 `manifest.json` 全文查看入口，后者显示 `Dev Only` 标记；点击后通过 Flip 动画弹出对话框，并以只读 JSON 编辑器展示全文。
3. **开发设置分组下移**：仅在插件启用开发模式时，在基础信息下方新增独立 `开发设置` 分组，展示保存、热重载、开发地址、源码模式。
4. **保存流程修复**：开发设置加载时统一读取最新 manifest 并建立快照，保存时合并写回 `manifest.dev`；主进程详情 API 改为按插件显示名/目录名双路匹配，避免保存请求命中失败。
5. **Dev 配置优先级修复**：开发模式加载远端 manifest 时，`plugin.dev` 统一以本地 manifest 的 dev 配置为准，避免热重载/开发地址/源码模式保存后被远端 manifest 覆盖。
6. **i18n 补齐**：新增中英文文案，覆盖插件名称、复制反馈、manifest 展开文案与加载态提示。

**修改文件**:
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginDetails.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.ts`

### Core-app Source Store Editor 滚动修复

**变更类型**: Bug 修复 / 交互可用性

**描述**: 修复 Source Store Editor 在来源项较多时无法滚动的问题，避免底部来源项被裁切后不可见。

**主要变更**:
1. **弹窗结构重写**：将 Source Editor 从绝对定位面板重构为 `TxFlipOverlay` 弹窗，统一使用 body 级遮罩和卡片容器，消除父级布局裁剪影响。
2. **新增入口上移**：新增来源入口改为 Header 区按钮。
3. **二次 Flip 弹窗**：新增来源表单改为独立 `TxFlipOverlay`（二级弹窗），与主来源弹窗解耦，打开/关闭均使用 Flip 动画。
4. **过时来源分区展示**：带 `outdated` 标记的来源在非高级模式默认隐藏；开启高级设置后在列表底部单独分区展示，不参与上方主列表排序索引。
5. **过时基线收敛**：默认来源中仅 `Tuff Nexus` 与 `NPM` 标记为非过时，其余内置来源标记为过时；对历史存储数据增加兼容归一化。
6. **拖拽排序保留**：主来源列表继续支持拖拽排序，且排序范围仅限非过时来源，避免与过时项发生索引干扰。
7. **滚动链路重建**：列表区改为 `TouchScroll native` 承载，使用 `flex + min-height: 0` 固定可滚动区域，确保长列表稳定可达。
8. **Flip 动画收敛**：来源列表使用 `TransitionGroup(source-flip)`，拖拽排序将 Sortable `animation` 设为 `0`，由 FLIP 过渡统一处理重排动画。
9. **来源定位增强**：市场页来源按钮点击时透传 source 元素，弹窗打开动画从触发点起始，交互反馈更明确。
10. **i18n 收敛**：Source Editor 页面文案（标题、副标题、按钮、占位符、来源类型与状态标签）接入中英文语言包，移除硬编码文本。
11. **弹窗尺寸微调**：主来源弹窗尺寸下调，降低遮挡；新增来源二级弹窗尺寸上调，提升表单可读性与可操作空间。
12. **表单组件统一**：新增来源二级弹窗内部输入控件统一替换为 tuffex `TxInput` / `TxSelect` / `TxSelectItem`，移除原生 `select` 与旧输入组件。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/store/MarketSourceEditor.vue`
- `apps/core-app/src/renderer/src/views/base/Store.vue`
- `apps/core-app/src/renderer/src/components/store/MarketHeader.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `apps/core-app/src/renderer/src/modules/storage/store-sources.ts`
- `packages/utils/store/constants.ts`

### Core App 工具设置下拉框返显修复

**变更类型**: Bug 修复 / 设置兼容性

**描述**: 修复 App Settings 中工具设置下拉框（自动粘贴、自动清除、剪贴板轮询）在旧配置数据下选择后不返显、持续显示“请选择”的问题。根因是历史数据存在字符串数值与结构漂移（如 `autoPaste` 形态不一致），导致 `TxSelect` 无法匹配当前值。

**主要变更**:
1. **配置形态校正**：在 `SettingTools` 初始化阶段补齐 `tools.autoPaste` 对象结构，避免 `v-model="appSetting.tools.autoPaste.time"` 在旧数据下写入失败。
2. **数值归一化**：对 `autoPaste.time`、`autoClear`、`clipboardPolling.interval`、`lowBatteryPolicy.interval` 增加统一的数字与可选值归一化，兼容历史字符串值并回落到安全默认值。
3. **禁用语义对齐**：当 `autoPaste.time === -1` 时同步修正 `autoPaste.enable`，避免 UI 与实际行为状态不一致。
4. **下拉值匹配增强**：`TxSelect` 增加字符串/数字值宽松匹配（如 `"180"` 与 `180`），避免历史字符串配置导致选项已存在但不回显。
5. **首屏返显修复**：`TuffBlockSelect` 改为 eager 挂载下拉内容，避免选项未挂载时 `TxSelect` 无法建立值到文案映射而首屏显示“请选择”。
6. **文案提取增强**：`TxSelectItem` 支持从默认 slot 文本提取 label（未显式传 `label` 时），避免选择后仅显示数字值（如 `180`）而不是“3 分钟”。
7. **兜底映射增强**：`TxSelect` 新增从 slot VNode 直接解析 value/label 的兜底逻辑，即使选项注册时机滞后也能在首屏用当前值解析展示文案。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/settings/SettingTools.vue`
- `apps/core-app/src/renderer/src/components/tuff/TuffBlockSelect.vue`
- `packages/tuffex/packages/components/src/select/src/TxSelect.vue`
- `packages/tuffex/packages/components/src/select/src/TxSelectItem.vue`
- `packages/tuffex/packages/components/src/popover/src/TxPopover.vue`
- `packages/tuffex/packages/components/src/popover/src/types.ts`
- `packages/tuffex/packages/components/src/base-anchor/src/TxBaseAnchor.vue`
- `packages/tuffex/packages/components/src/base-anchor/src/types.ts`
- `packages/tuffex/packages/components/src/select/src/types.ts`

### Nexus OAuth 在 Cloudflare Workers 的 HKDF 兼容修复

**变更类型**: 登录稳定性 / Edge 兼容

**描述**: 修复 Nexus 在 Cloudflare Pages/Workers 上点击 LinuxDO OAuth 即返回 `OAuthSignin` 的问题。根因是 Workers 打包后 `@panva/hkdf` 被包装为 namespace，`next-auth` CJS 默认导入在运行时得到非函数对象，导致 state/pkce cookie 生成失败。

**主要变更**:
1. **依赖收敛**：通过 workspace overrides 固定 `@panva/hkdf` 版本，避免漂移引发的运行时导出形态不一致。
2. **入口强制收敛**：在 `nuxt.config.ts` 的 `nitro.alias` 与 `vite.resolve.alias` 中将 `@panva/hkdf` 强制映射到 `dist/node/cjs/index.js`，避免 Workers 打包选中 `worker` 条件导出后被 CJS 默认导入误包装。
3. **运行链路一致化**：Edge SSR 与 Functions 统一走 CJS 入口，保证 `next-auth` 的 HKDF 默认导入在 Cloudflare 运行时可调用。

**修改文件**:
- `package.json`
- `apps/nexus/nuxt.config.ts`

### Nexus 组件文档页 SSR 崩溃修复（NumberFlow）

**变更类型**: 稳定性修复 / Edge SSR 兼容

**描述**: 修复 `https://tuff.tagzxia.com/docs/dev/components/index` 在 Cloudflare Pages/Workers 上返回 500 的问题。根因是 `@number-flow/vue` 在 SSR 打包路径中触发 `HTMLElement is not defined`，导致页面服务端渲染异常。

**主要变更**:
1. **SSR 导入收敛**：将相关组件中的 `@number-flow/vue` 从静态导入改为 `import.meta.client` 条件下的异步组件加载，避免 server bundle 初始化时触发浏览器全局对象引用。
2. **降级渲染兜底**：在 NumberFlow 组件不可用时回退为纯文本数值渲染，确保 SSR 输出稳定可用。
3. **示例页同步修复**：同步修复 Nexus docs 相关 demo 组件，消除文档页触发同类崩溃的入口。

**修改文件**:
- `packages/tuffex/packages/components/src/stat-card/src/TxStatCard.vue`
- `apps/nexus/app/components/content/demos/AutoSizerNumberFlowDemo.vue`
- `apps/nexus/app/components/content/demos/StatCardBasicDemo.vue`
- `apps/nexus/app/components/content/demos/StatCardInsightVariantDemo.vue`
- `apps/nexus/app/components/content/demos/StatCardProgressVariantDemo.vue`
- `apps/nexus/app/components/content/demos/StatCardStatCardDemo.vue`

### Nexus docs 页面 hydration mismatch 收敛

**变更类型**: 稳定性修复 / SSR 一致性

**描述**: 修复 docs 页面在部署环境中偶发 `Hydration completed but contains mismatches` 的问题。根因是 SSR 与客户端在语言和右侧文档辅助区渲染时机不一致，导致 `DocsOutline` / `DocsAsideCards` 节点树不一致。

**主要变更**:
1. **语言首屏一致性**：`app.vue` 在服务端优先基于 `Accept-Language` 判定首屏语言，并在 SSR 阶段 `await setLocale(...)`，避免首屏英文渲染后客户端切换中文引发的 hydration mismatch。
2. **右侧文档辅助区客户端化**：`docs` 布局将右侧 `DocsOutline` 与 `DocsAsideCards` 包裹在 `ClientOnly` 内，规避依赖客户端状态的节点在 SSR 阶段与客户端阶段结构不一致。

**修改文件**:
- `apps/nexus/app/app.vue`
- `apps/nexus/app/layouts/docs.vue`

### Nexus PWA 导航回退冲突修复（刷新回首页）

**变更类型**: 部署稳定性 / PWA 与 SSR 兼容

**描述**: 修复部署后在 docs、OAuth 回调等路由刷新或回跳时被错误落到首页的问题。根因是 Workbox `navigateFallback: '/'` 与 SSR 路由冲突，Service Worker 将导航请求统一回退到首页 HTML，导致页面错配与 hydration mismatch。

**主要变更**:
1. **禁用导航回退匹配**：将 `workbox.navigateFallbackDenylist` 收敛为全量拒绝（`/.*/`），避免 Service Worker 对 SSR 页面导航请求命中首页回退。
2. **开发配置同步收敛**：删除 `devOptions.navigateFallback`，保证本地预览与线上行为一致。

**修改文件**:
- `apps/nexus/app/config/pwa.ts`

### Nexus Cloudflare 变量绑定冲突收敛（LINUXDO_ISSUER）

**变更类型**: 部署稳定性 / 配置收敛

**描述**: Cloudflare Functions 发布阶段出现 `Binding name 'LINUXDO_ISSUER' already in use`。将 `LINUXDO_ISSUER` 收敛为单处 wrangler 定义，避免环境变量重复绑定冲突。

**主要变更**:
1. **单点定义**：移除 `env.preview.vars` 中的 `LINUXDO_ISSUER`，仅保留顶层 `[vars]` 定义。

**修改文件**:
- `wrangler.toml`

### Nexus 实验内容噪点水印隐藏策略收敛

**变更类型**: 体验修复 / 水印策略

**描述**: Nexus 风控与水印策略收敛为环境变量单开关，未启用时统一关闭导航入口、页面访问与服务端 API，避免“入口隐藏但链路仍可访问”的不一致行为。

**主要变更**:
1. **单一开关**：新增 `NUXT_PUBLIC_WATERMARK_ENABLED` 与 `NUXT_PUBLIC_RISK_CONTROL_ENABLED`（默认关闭），分别控制水印与风险控制能力。
2. **导航统一收敛**：Dashboard Nav 根据开关动态隐藏 `watermark` 与 `risk` 入口。
3. **路由统一拦截**：新增全局路由中间件，关闭时阻断 `/dashboard/watermark`、`/dashboard/admin/risk` 与 `/admin/emergency` 访问。
4. **服务端统一拦截**：新增服务端特性中间件，关闭时对风险/水印 API 返回 404，避免绕过前端直连调用。
5. **水印链路收敛**：`useWatermarkDisplayPolicy` 与 `watermark-risk` 插件只读取环境开关；关闭时不挂载噪点层、风险弹层，也不注入水印 token header。
6. **运行时配置补齐**：`nuxt.config.ts` 同步暴露 `runtimeConfig.{watermark,riskControl}.enabled` 与 `runtimeConfig.public` 对应字段。

**修改文件**:
- `apps/nexus/app/composables/useWatermarkDisplayPolicy.ts`
- `apps/nexus/app/app.vue`
- `apps/nexus/app/components/dashboard/DashboardNav.vue`
- `apps/nexus/app/plugins/watermark-risk.client.ts`
- `apps/nexus/app/middleware/feature-gates.global.ts`
- `apps/nexus/nuxt.config.ts`
- `apps/nexus/server/middleware/feature-gates.ts`
- `apps/nexus/server/middleware/watermark-guard.ts`
- `apps/nexus/server/utils/runtime-features.ts`
- `apps/nexus/README.md`

### Core-app 设置项位置调整（详细信息与搜索引擎日志）

**变更类型**: 体验优化 / 设置分组整理

**描述**: 将「详细信息」与「搜索引擎日志」两个开关从「实用工具」分组迁移到「应用程序规范（Touch）」分组，保证设置语义与分组一致。

**主要变更**:
1. **分组迁移**：在 `SettingAbout` 中新增两个开关入口，并复用原有配置字段。
2. **工具页收敛**：从 `SettingTools` 移除上述两个开关，减少实用工具分组噪音。
3. **高级设置门禁**：仅当“高级设置”开启后显示这两个开关，默认隐藏。
4. **国际化迁移**：中英文文案从 `settingTools` 收敛到 `settingAbout`。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/settings/SettingTools.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingAbout.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`

### Core-app 窗口协议统一（WindowRole）

**变更类型**: 架构治理 / 稳定性修复

**描述**: 统一 main/preload/renderer 的窗口参数协议解析与模式判定，消除 `touchType/coreType/assistantType/metaOverlay` 在多处手写字符串导致的漂移风险；`omni-panel` 全链路由单一协议模块驱动。

**主要变更**:
1. **协议单一来源**：新增 `window-role` 模块，统一导出窗口角色常量、类型、参数构建/解析与渲染模式解析函数。
2. **主进程发参收敛**：所有窗口 `additionalArguments` 改为通过 `buildWindowArgs` 生成，移除分散手写参数字符串。
3. **解析链路统一**：`arg-mapper` 改为复用统一协议解析，同时保留原有 API 外观与原始未知值记录能力。
4. **入口路由收敛**：`AppEntrance` 改为单入口 mode 分发；未知 `coreType` 在开发态告警并安全回退 CoreBox。
5. **预加载收敛**：移除 DivisionBox 预加载全局特判标记，改为协议判定；保留 MetaOverlay hash/参数双路径识别。
6. **测试补齐**：新增 `window-role` 单测，覆盖构建、解析、未知值降级和模式映射。

**修改文件**:
- `packages/utils/renderer/window-role.ts`
- `packages/utils/renderer/hooks/arg-mapper.ts`
- `packages/utils/renderer/index.ts`
- `packages/utils/__tests__/renderer/window-role.test.ts`
- `apps/core-app/src/main/config/default.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/meta-overlay.ts`
- `apps/core-app/src/preload/index.ts`
- `apps/core-app/src/renderer/src/AppEntrance.vue`
- `apps/core-app/src/renderer/src/modules/devtools/app-entrance-log.ts`
- `apps/core-app/src/renderer/src/modules/hooks/core-box.ts`

## 2026-02-22

### Core-app Assistant（阿洛 aler）悬浮球与语音唤醒

**变更类型**: 新功能 / AI 默认能力接入

**描述**: 新增 Assistant 悬浮球与语音面板窗口，语音唤醒从 Porcupine 路线切换为浏览器 SpeechRecognition；同时 Intelligence 默认绑定内置 Tuff Nexus provider，并在主进程注入登录令牌，用户无需手动配置 provider 即可直接使用 AI 能力。

**主要变更**:
1. **悬浮球窗口**：新增独立 assistant touchType 的悬浮球窗口，支持位置拖拽与持久化。
2. **语音唤醒**：悬浮球侧实现 Web Speech 连续监听，默认唤醒词为“阿洛 / aler”，命中后打开语音面板。
3. **语音面板**：新增语音转写面板，可将识别文本直接提交到 CoreBox 输入并触发后续搜索流程。
4. **快捷键策略**：CoreBox 相关系统快捷键改为默认注册但禁用，避免首次安装即占用默认组合键。
5. **Intelligence 默认 provider**：`tuff-nexus-default` 默认启用并绑定核心文本能力；主进程加载配置时自动注入 auth token（无 token 时走 guest 占位）。
6. **权限能力扩展**：系统权限检查增加麦克风权限查询/请求通道，为语音能力提供统一权限入口。
7. **实验开关默认态**：Assistant 实验开关默认关闭，且悬浮球与语音唤醒默认关闭；仅在用户显式启用后生效。主进程需带 `TUFF_ENABLE_ASSISTANT_EXPERIMENT=1` 启动参数才会加载 Assistant 模块。

**修改文件**:
- `apps/core-app/src/main/config/default.ts`
- `apps/core-app/src/main/index.ts`
- `apps/core-app/src/main/modules/assistant/module.ts`
- `apps/core-app/src/main/modules/assistant/index.ts`
- `apps/core-app/src/main/modules/global-shortcon.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/index.ts`
- `apps/core-app/src/main/modules/ai/intelligence-config.ts`
- `apps/core-app/src/main/modules/system/permission-checker.ts`
- `apps/core-app/src/renderer/src/AppEntrance.vue`
- `apps/core-app/src/renderer/src/App.vue`
- `apps/core-app/src/renderer/src/main.ts`
- `apps/core-app/src/renderer/src/views/assistant/FloatingBall.vue`
- `apps/core-app/src/renderer/src/views/assistant/VoicePanel.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingSetup.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/SetupPermissions.vue`
- `packages/utils/common/storage/entity/app-settings.ts`
- `packages/utils/renderer/hooks/arg-mapper.ts`
- `packages/utils/transport/events/assistant.ts`
- `packages/utils/types/intelligence.ts`

**实现说明**:
- `docs/plan-prd/04-implementation/AssistantExperiment-VoiceFloatingBall-260223.md`

### Core-app OmniPanel（全景面板）命名统一与配置入口

**变更类型**: 功能增强 / 交互入口

**描述**: 全景面板统一命名为 `OmniPanel`，并新增设置页配置入口，支持按需启停快捷键与右键长按唤起。

**主要变更**:
1. **命名统一**：主进程模块、事件、窗口参数、preload 标记与渲染入口统一为 `omni-panel` / `OmniPanel`。
2. **配置入口**：设置页增加 `OmniPanel 快捷键` 与 `OmniPanel 右键长按唤起` 两个开关。
3. **运行时生效**：主进程监听 APP_SETTING 变化，实时更新全局快捷键启用状态与鼠标长按 Hook。
4. **快捷键可读性**：快捷键管理面板增加 `core.omniPanel.toggle` 的中英文展示文案。
5. **国际化键收敛**：补齐 `corebox.omniPanel.*` 文案并新增统一 i18n key 常量，避免硬编码。

**修改文件**:
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `apps/core-app/src/main/config/default.ts`
- `apps/core-app/src/main/index.ts`
- `apps/core-app/src/preload/index.ts`
- `apps/core-app/src/shared/events/omni-panel.ts`
- `apps/core-app/src/renderer/src/AppEntrance.vue`
- `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingTools.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `packages/utils/common/storage/entity/app-settings.ts`
- `packages/utils/renderer/hooks/arg-mapper.ts`
- `packages/utils/i18n/message-keys.ts`
- `packages/utils/i18n/index.ts`

### Core-app OmniPanel 触发方式接入快捷方式管理

**变更类型**: 功能增强 / 交互一致性

**描述**: OmniPanel 的键盘快捷键与鼠标右键长按触发统一接入 `global-shortcon` 管理，快捷方式弹窗可直接查看并启停两种触发方式。

**主要变更**:
1. **ShortcutType 扩展**：新增 `trigger` 类型，支持非键盘触发方式的统一存储与展示。
2. **主进程接入**：`global-shortcon` 新增 `registerMainTrigger`，触发项参与状态管理但不走 `globalShortcut.register`。
3. **OmniPanel 注册**：主进程注册 `core.omniPanel.toggle`（键盘）与 `core.omniPanel.mouseLongPress`（鼠标右键长按）两条系统触发项。
4. **设置页收敛**：移除 OmniPanel 独立开关，改为在快捷方式管理弹窗集中配置启停。
5. **弹窗展示增强**：快捷方式表格支持“快捷键/触发方式”混合展示，鼠标触发显示为只读触发标签。
6. **文案补齐**：中英文补充 OmniPanel 鼠标触发标签与行描述，保证可读性一致。

**修改文件**:
- `packages/utils/common/storage/entity/shortcut-settings.ts`
- `apps/core-app/src/main/modules/global-shortcon.ts`
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingTools.vue`
- `apps/core-app/src/renderer/src/views/base/settings/components/shortcut-dialog.types.ts`
- `apps/core-app/src/renderer/src/views/base/settings/components/ShortcutDialogRow.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`

### Core-app OmniPanel 启动链路修复与模块 Env Gate

**变更类型**: 稳定性修复 / 架构治理

**描述**: 修复 OmniPanel 未进入主进程加载链路与渲染入口误路由问题；同时为 `BaseModule` 增加 `env` 自动启用门控，支持按环境变量控制模块加载。

**主要变更**:
1. **模块 Env Gate**：`BaseModule` / `IBaseModule` 新增 `env` 属性，ModuleManager 仅在对应 env flag 启用时自动加载模块。
2. **Assistant 收敛**：Assistant 改为声明式 env 门控（`TUFF_ENABLE_ASSISTANT_EXPERIMENT`），移除模块内部重复判断逻辑。
3. **OmniPanel Env 门控**：OmniPanel 改为声明式 env 门控（`TUFF_ENABLE_OMNIPANEL_EXPERIMENT`），与 Assistant 保持一致的模块启用策略。
4. **OmniPanel 主进程接入**：`omniPanelModule` 正式加入 `modulesToLoad`，快捷键、鼠标触发与 IPC 处理器可正常初始化。
5. **OmniPanel 渲染入口**：AppEntrance 按 `coreType=omni-panel` 渲染独立 `OmniPanel` 视图，不再误落到 CoreBox。
6. **arg-mapper 类型补齐**：`coreType` 增加 `omni-panel`，并新增 `isOmniPanel()` 判断函数。
7. **选中文本捕获优化**：macOS 优先尝试通过 AXSelectedText 直读选中文本；复制兜底路径改为完整剪贴板快照恢复，避免覆盖图片/文件/HTML 剪贴板内容。

**修改文件**:
- `packages/utils/types/modules/module.ts`
- `apps/core-app/src/main/modules/abstract-base-module.ts`
- `apps/core-app/src/main/core/module-manager.ts`
- `apps/core-app/src/main/index.ts`
- `apps/core-app/src/main/modules/assistant/module.ts`
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `packages/utils/renderer/hooks/arg-mapper.ts`
- `apps/core-app/src/renderer/src/AppEntrance.vue`

### Nexus 多层水印与风险验证

**变更类型**: 安全与溯源 / 前端体验

**描述**: Nexus 全站引入隐写水印与结构指纹，Dashboard 追加明水印；水印异常或服务端风险信号触发 Turnstile 强制验证，提升溯源与防绕过能力。

**主要变更**:
1. **隐写水印**：全站覆盖的噪声纹理水印，肉眼不可见且支持拍照/着色场景的服务端检测。
2. **结构指纹**：通过 CSS 变量对导航、文档侧边栏、目录与 Footer 做轻微扰动，增强溯源。
3. **明水印**：仅 Dashboard layout 显示可见水印，其他页面保持纯净展示。
4. **风险阻断**：新增 Turnstile 验证弹窗，接收 428 风险码或检测到篡改即强制验证。
5. **防删监测**：水印 DOM 被移除/隐藏时自动恢复并触发风险上报。

**修改文件**:
- `apps/nexus/app/app.vue`
- `apps/nexus/app/layouts/dashboard.vue`
- `apps/nexus/app/components/TheHeader.vue`
- `apps/nexus/app/components/DocsSidebar.vue`
- `apps/nexus/app/components/DocsOutline.vue`
- `apps/nexus/app/components/TuffFooter.vue`
- `apps/nexus/app/components/watermark/InvisibleWatermark.vue`
- `apps/nexus/app/components/watermark/VisibleWatermark.vue`
- `apps/nexus/app/components/watermark/WatermarkRiskModal.vue`
- `apps/nexus/app/composables/useWatermarkToken.ts`
- `apps/nexus/app/composables/useWatermarkFingerprint.ts`
- `apps/nexus/app/composables/useWatermarkRisk.ts`
- `apps/nexus/app/composables/useWatermarkGuard.ts`
- `apps/nexus/app/composables/useTurnstileWidget.ts`
- `apps/nexus/app/plugins/watermark-risk.client.ts`
- `apps/nexus/app/utils/watermark.ts`
- `apps/nexus/server/api/watermark/issue.post.ts`
- `apps/nexus/server/api/watermark/turnstile/verify.post.ts`
- `apps/nexus/server/utils/watermarkToken.ts`
- `apps/nexus/server/utils/turnstile.ts`
- `apps/nexus/server/utils/watermarkGuard.ts`
- `apps/nexus/server/middleware/watermark-guard.ts`
- `apps/nexus/server/utils/watermarkDecode.ts`
- `apps/nexus/server/utils/watermarkStore.ts`
- `apps/nexus/server/api/watermark/resolve.post.ts`
- `apps/nexus/app/composables/useWatermarkDecode.ts`
- `apps/nexus/nuxt.config.ts`

### Nexus 水印溯源解码增强与测试入口

**变更类型**: 安全与溯源 / 管理工具

**描述**: 补强水印多频段解码与旋转/缩放容错，新增 Dashboard 水印溯源入口用于上传截图快速追溯用户与设备。

**主要变更**:
1. **多频段解码**：引入三频段噪声配置与派生种子，提升压缩图与拍照场景命中率。
2. **容错检测**：增加小角度旋转/缩放容错扫描，降低拍照倾斜对相关性计算的影响。
3. **测试入口**：Dashboard 增加水印解析页面，展示置信度与溯源信息。
4. **溯源留存**：水印种子记录保留 7 天，避免截图延迟解析导致错配。
5. **开发环境放开解析**：Resolve API 在非生产环境放开为登录用户可用，便于联调与验证。
6. **水印信号增强**：移除混合模式与模糊处理、提升噪声幅度与整体透明度，提升截图/拍照可检测性。
7. **块状噪声编码**：水印噪声改为块状低频编码，提升压缩/缩放场景相关性，减少重采样带来的相位漂移。
8. **二维码溯源**：新增固定追踪码二维码平铺水印，支持截图直接解码追溯用户与设备。

**修改文件**:
- `apps/nexus/shared/watermark/config.ts`
- `apps/nexus/app/utils/watermark-config.ts`
- `apps/nexus/app/utils/watermark.ts`
- `apps/nexus/app/composables/useWatermarkTrackingCode.ts`
- `apps/nexus/app/components/watermark/VisibleWatermark.vue`
- `apps/nexus/server/utils/watermarkTrackingStore.ts`
- `apps/nexus/server/utils/watermarkQr.ts`
- `apps/nexus/server/api/watermark/tracking.post.ts`
- `apps/nexus/package.json`
- `apps/nexus/app/components/watermark/InvisibleWatermark.vue`
- `apps/nexus/app/components/dashboard/DashboardNav.vue`
- `apps/nexus/app/pages/dashboard/watermark.vue`
- `apps/nexus/app/composables/useWatermarkDecode.ts`
- `apps/nexus/server/utils/watermarkDecode.ts`
- `apps/nexus/server/api/watermark/resolve.post.ts`
- `apps/nexus/server/utils/watermarkStore.ts`
- `apps/nexus/server/api/watermark/issue.post.ts`
- `apps/nexus/app/utils/role.ts`

### 设置页高级选项收起开关

**变更类型**: 体验优化 / 设置

**描述**: 在“应用程序规范”中新增高级设置开关，默认关闭；启用后才显示后台索引策略、应用索引调度与下载设置，减少设置页噪音。

**主要变更**:
1. **新增开关**：高级设置开关落地到 appSetting 并持久化。
2. **按需展示**：下载设置与索引策略/调度分组仅在开关启用后显示。

**修改文件**:
- `packages/utils/common/storage/entity/app-settings.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingAbout.vue`
- `apps/core-app/src/renderer/src/views/base/settings/AppSettings.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`

### Core-app 认证/凭证/同步触发收敛到主进程

**变更类型**: 架构调整 / 安全与一致性

**描述**: 登录、凭证、设备标识与同步触发统一由主进程持有与执行，渲染进程仅发送意图请求并监听状态，避免 token/设备信息停留在 renderer 导致的存储与同步冲突。

**主要变更**:
1. **AuthModule**：新增主进程 AuthModule，token 使用 safeStorage 持久化，device profile 写入 appSetting，并统一 `/api/v1/auth/*` 请求与状态广播。
2. **回调收敛**：登录与 step-up 回调由 addon-opener 直接交给主进程处理，token 变化联动同步启停。
3. **渲染端降级为代理**：`useAuth`/`account-channel` 仅保留 IPC、legacy 迁移与 fingerprint hash 计算。
4. **Nexus 请求统一**：渲染端发起的认证请求改为 `auth:nexus-request` 由主进程代理。
5. **Legacy 兼容移除**：移除 renderer 侧 auth/device 的 localStorage 迁移逻辑。
6. **Widget 沙箱收敛**：widget 执行强制依赖沙箱上下文，不再回退到 window.localStorage/sessionStorage。

**修改文件**:
- `apps/core-app/src/main/modules/auth/index.ts`
- `apps/core-app/src/main/modules/addon-opener.ts`
- `apps/core-app/src/main/modules/sync/index.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/main/index.ts`
- `packages/utils/common/storage/entity/app-settings.ts`
- `apps/core-app/src/renderer/src/modules/auth/useAuth.ts`
- `apps/core-app/src/renderer/src/modules/auth/account-channel.ts`
- `apps/core-app/src/renderer/src/modules/auth/auth-env.ts`
- `apps/core-app/src/renderer/src/modules/auth/device-attest.ts`
- `apps/core-app/src/renderer/src/modules/store/auth-token-service.ts`
- `apps/core-app/src/renderer/src/modules/store/nexus-auth-client.ts`

### Core-app 同步迁移到主进程

**变更类型**: 架构调整 / 数据一致性

**描述**: 同步拉取/推送与冲突处理由主进程统一接管，渲染进程仅触发指令与展示状态，确保落盘与冲突裁决在主进程完成，避免同步数据停留在 renderer 内存导致重启回滚。

**主要变更**:
1. **同步主流程迁移**：新增主进程同步模块，使用 CloudSyncSDK 进行拉取/推送与冲突处理。
2. **存储统一裁决**：拉取结果直接写入主进程存储并落盘，必要时合并本地脏数据后回推。
3. **渲染端降级为代理**：renderer 仅发送 start/stop/trigger 指令，状态从主进程存储同步。

**修改文件**:
- `apps/core-app/src/main/modules/sync/index.ts`
- `apps/core-app/src/main/index.ts`
- `apps/core-app/src/renderer/src/modules/sync/auto-sync-manager.ts`

### Tuffex Anchor reference class 透传

**变更类型**: 体验修复 / 组件

**描述**: BaseAnchor reference 容器新增 `referenceClass` 透传，Popover / DropdownMenu 可通过 class 调整 reference 容器布局（例如全宽）。

**主要变更**:
1. **Reference class**：`TxBaseAnchor` 新增 `referenceClass` 并支持 `is-full-width`。
2. **透传链路**：`TxPopover`/`TxDropdownMenu` 新增 `referenceClass`，`referenceFullWidth` 同步影响 Anchor reference。

**修改文件**:
- `packages/tuffex/packages/components/src/base-anchor/src/types.ts`
- `packages/tuffex/packages/components/src/base-anchor/src/TxBaseAnchor.vue`
- `packages/tuffex/packages/components/src/popover/src/types.ts`
- `packages/tuffex/packages/components/src/popover/src/TxPopover.vue`
- `packages/tuffex/packages/components/src/dropdown-menu/src/types.ts`
- `packages/tuffex/packages/components/src/dropdown-menu/src/TxDropdownMenu.vue`

### Nexus Header 用户菜单语言子菜单宽度修复

**变更类型**: 体验修复 / 账号菜单

**描述**: Header 用户菜单语言子菜单改用 reference class 撑满触发区域，确保列表项高亮与子菜单对齐一致。

**主要变更**:
1. **Reference class**：Language 子菜单 `TxPopover` 使用 `reference-class` 控制外层参考宽度。
2. **样式补齐**：针对 reference class 设置 100% 宽度，保证触发区域覆盖整行。

**修改文件**:
- `apps/nexus/app/components/HeaderUserMenu.vue`

### CI 构建引入 Electron 下载镜像与缓存路径

**变更类型**: 稳定性 / 构建修复

**描述**: GitHub Actions 拉取 Electron 产物时出现 502，构建改为使用镜像源并固定缓存目录，降低外网波动影响。

**主要变更**:
1. **镜像下载**：设置 `ELECTRON_MIRROR` 与 `ELECTRON_BUILDER_BINARIES_MIRROR`。
2. **缓存路径**：统一 `ELECTRON_CACHE` 与 `ELECTRON_BUILDER_CACHE` 到 workspace 内。

**修改文件**:
- `.github/workflows/build-and-release.yml`

### macOS 自动更新通道校验与旧包清理

**变更类型**: 行为修复 / 更新稳定性

**描述**: 修正 macOS 自动更新在渠道错配与旧包残留情况下触发降级安装的问题，同时避免持久化更新记录与待安装版本在当前版本更高时继续提示更新。

**主要变更**:
1. **待安装版本校验**：仅允许与当前有效渠道匹配且版本更高的 pending install 进入可安装状态。
2. **缓存记录过滤**：持久化更新记录在版本不满足更新条件时不再触发提示。
3. **默认通道对齐**：更新通道缺失时改为对齐当前版本通道，避免 beta 用户回退到 Release 检测。

**修改文件**:
- `apps/core-app/src/main/modules/update/UpdateService.ts`

### Core-app DB 写入队列与剪贴板持久化优化

**变更类型**: 稳定性 / 性能

**描述**: 解决事件循环阻塞与 SQLite 写入争用导致的分析持久化积压，剪贴板写入改为走串行队列与重试机制，并在队列压力下主动跳过非关键 analytics 写入。

**主要变更**:
1. **剪贴板持久化串行化**：clipboard history 与 metadata 写入改走 `DbWriteScheduler + withSqliteRetry`。
2. **Analytics 压力削峰**：队列深度过高时跳过 snapshots / cleanup / plugin analytics，减少锁争用与阻塞。
3. **队列压力日志节流**：压力告警增加 5s 级别节流，避免刷屏。
4. **剪贴板元数据降级**：队列压力下跳过 meta 表写入，正常情况下改为异步 + 可丢弃写入。

**修改文件**:
- `apps/core-app/src/main/modules/clipboard.ts`
- `apps/core-app/src/main/modules/analytics/storage/db-store.ts`

### CoreBox 剪贴板输入索引化与 ESC 搜索刷新

**变更类型**: 体验修复 / 性能

**描述**: CoreBox 搜索输入为剪贴板图片/文件补充 `clipboardId` 指引与预览信息，减少重复传输大体积内容；ESC 清除附件时强制触发搜索刷新，保持结果与输入一致。

**主要变更**:
1. **输入指引**：图片/文件输入 metadata 增加 `clipboardId` 与 `contentKind`，支持按需解析原始内容。
2. **预览标记**：图片输入补充 `canResolveOriginal` 标记，预览数据保持轻量。
3. **ESC 清理刷新**：清除附件时无论是否存在 clipboard 数据都触发搜索刷新。
4. **主进程补齐**：搜索与插件执行阶段按 `clipboardId` 自动补齐文件输入内容。

**修改文件**:
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useClipboardState.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useKeyboard.ts`

### 快捷键管理列表布局优化

**变更类型**: 体验优化 / 设置

**描述**: 快捷键管理列表提升可读性，快捷键列加宽、来源列后置，并支持命令 ID 一键复制与横向滚动。

**主要变更**:
1. **列顺序调整**：来源列移动到末尾，关键内容优先展示。
2. **快捷键列加宽**：输入框宽度与列宽提升，避免组合键被截断。
3. **命令 ID 复制**：命令 ID 支持点击复制并在 hover 时显示下划线。
4. **默认无横向滚动**：压缩列宽并省略长文本，保证默认视口内可读。
5. **保存状态视觉反馈**：保存中 shimmer、成功淡绿、失败淡红并使用 Carbon 图标。
6. **启用/状态合并**：启用与状态合并同列并保持默认可见。
7. **命令 ID 复制提示**：复制后显示成功/失败提示。
8. **复制工具统一**：ID 复制统一使用 clipboard 工具，移除旧式 execCommand 兼容逻辑。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/settings/SettingTools.vue`

### Nexus 登录页底部协议按钮可点击

**变更类型**: 体验修复 / 登录页

**描述**: 登录页底部协议/隐私按钮被主内容层覆盖导致无法点击，现提升 footer 层级避免遮挡。

**主要变更**:
1. **层级提升**：登录页法律 footer 增加更高层级，确保点击交互可用。

**修改文件**:
- `apps/nexus/app/components/auth/AuthLegalFooter.vue`

### Nexus Credits 额度优化、签到与支付抽象

**变更类型**: 计费与权益 / 体验增强

**描述**: Free 个人额度调整为每月 5；完成邮箱验证 + OAuth + Passkey 后可领取当月提升额度（下月起自动 100）；Plus/Pro 个人额度分别为 500/1200，Team/Enterprise 个人额度为 5000；Team 计划团队池默认 10000（含 5 席位），每新增 1 席位团队池增加 2000；新增每日签到领积分；引入支付抽象接口以支持多支付方式扩展。

**主要变更**:
1. **额度规则**：个人额度按资格与月份初始化，新增提升领取与签到奖励。
2. **API 扩展**：新增 credits claim/checkin/status 接口，summary 增加 boost 信息。
3. **前端入口**：Credits 页面新增领取与签到卡片、提示与动作。
4. **支付抽象**：新增 billing provider 接口与注册表，暂不接入真实支付。
5. **数据可视化**：Credits 页面新增趋势图、个人占比与模型/审计/签到 Tabs，补充趋势与模型/签到日历数据接口。

**修改文件**:
- `apps/nexus/server/utils/creditsStore.ts`
- `apps/nexus/server/api/credits/claim.post.ts`
- `apps/nexus/server/api/credits/checkin.post.ts`
- `apps/nexus/server/api/credits/checkin/status.get.ts`
- `apps/nexus/server/api/credits/trend.get.ts`
- `apps/nexus/server/api/credits/models.get.ts`
- `apps/nexus/server/api/credits/checkin/month.get.ts`
- `apps/nexus/app/pages/dashboard/credits.vue`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/server/utils/billing/`

### Tuff CLI 交互式引导与登录门控

**变更类型**: 体验增强 / CLI

**描述**: CLI 默认交互模式升级为上下选择，并在首次进入时新增语言/条款引导与 Nexus 登录门控，确保用户完成登录后再进入主菜单。

**主要变更**:
1. **交互式选择**：菜单选项支持 ↑/↓ + Enter 操作。
2. **首次引导**：首次运行要求选择语言并确认条款，状态写入 `~/.tuff/cli.json`。
3. **登录门控**：未登录时要求输入 Nexus Token，完成后进入主菜单。
4. **存储提示**：进入主菜单前提示本地配置与登录信息存储路径。
5. **设备码 OAuth**：CLI 支持浏览器授权 + 2 分钟心跳轮询，无需本地回调服务。
6. **官网条款链接**：首次引导直接展示官网服务条款与隐私政策地址。
7. **ASCII Logo**：CLI 进入交互模式输出 ASCII TUFF 标识。
8. **本地 URL 支持**：`--local` 时 CLI 使用本地 Nexus URL（默认 http://localhost:3200）。
9. **授权入口归一**：设备授权链接改为先进入登录页，再跳转到设备确认页面。
10. **全局参数增强**：新增 `--api-base`、`--config-dir`、`--non-interactive` 以适配多环境与脚本场景。
11. **设备授权扩展**：新增短期/长期/取消选项，授权完成自动关闭页面，并在 CLI 提示妥善保管 Token。

**修改文件**:
- `packages/unplugin-export-plugin/src/cli/prompts.ts`
- `packages/unplugin-export-plugin/src/bin/tuff.ts`
- `packages/unplugin-export-plugin/src/cli/runtime-config.ts`
- `packages/unplugin-export-plugin/src/core/auth.ts`
- `packages/unplugin-export-plugin/src/core/publish.ts`
- `packages/unplugin-export-plugin/src/cli/i18n/locales/zh.ts`
- `packages/unplugin-export-plugin/src/cli/i18n/locales/en.ts`
- `packages/unplugin-export-plugin/src/cli/prompts.ts`
- `apps/nexus/server/api/app-auth/device/start.post.ts`
- `apps/nexus/server/api/app-auth/device/poll.get.ts`
- `apps/nexus/server/api/app-auth/device/info.get.ts`
- `apps/nexus/server/api/app-auth/device/approve.post.ts`
- `apps/nexus/server/utils/authStore.ts`
- `apps/nexus/app/pages/device-auth.vue`

### Nexus 登录历史与设备管理展示授权来源

**变更类型**: 体验增强 / 安全可见性

**描述**: 登录历史与设备管理新增授权来源标识（App / CLI / External），便于识别设备授权渠道并随时撤回可疑来源。

**主要变更**:
1. **登录历史来源**：记录并返回 clientType，Dashboard 显示授权来源。
2. **设备来源标记**：设备列表展示授权来源标签，CLI 设备可直接撤回。
3. **设备授权补全**：CLI 设备授权写入来源与设备元信息。

**修改文件**:
- `apps/nexus/server/utils/authStore.ts`
- `apps/nexus/server/utils/auth.ts`
- `apps/nexus/server/api/login-history.get.ts`
- `apps/nexus/server/api/app-auth/device/start.post.ts`
- `apps/nexus/server/api/app-auth/device/poll.get.ts`
- `apps/nexus/server/api/auth/[...].ts`
- `apps/nexus/server/api/passkeys/verify.post.ts`
- `apps/nexus/app/plugins/device-headers.client.ts`
- `apps/nexus/app/pages/dashboard/overview.vue`
- `apps/nexus/app/pages/dashboard/account.vue`
- `apps/nexus/app/pages/dashboard/devices.vue`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/i18n/locales/en.ts`

### Nexus 设备授权风控增强

**变更类型**: 安全加固 / 设备授权

**描述**: 设备授权新增 IP 校验与长期授权风控，非常用设备或登录地将被限制长期授权；授权完成后尝试更完整的自动关闭。

**主要变更**:
1. **IP 校验**：设备授权确认时校验 CLI 发起 IP 与浏览器 IP，不一致拒绝。
2. **长期授权风控**：仅在常用设备 + 常用登录地组合下允许长期授权。
3. **自动关闭增强**：授权完成后尝试多种关闭策略。

**修改文件**:
- `apps/nexus/server/utils/authStore.ts`
- `apps/nexus/server/utils/auth.ts`
- `apps/nexus/server/api/app-auth/device/approve.post.ts`
- `apps/nexus/server/api/app-auth/device/info.get.ts`
- `apps/nexus/app/pages/device-auth.vue`

### Nexus OAuth 回跳支持同源绝对 redirect_url

**变更类型**: 行为修复 / 登录体验

**描述**: OAuth 回调在生产环境可能携带同源绝对 `redirect_url`，此前会被丢弃并回落到默认首页，导致登录后无法回到原页面。现支持识别同源绝对地址并回退为站内路径。

**主要变更**:
1. **同源回跳**：绝对地址回跳在同源时转换为站内路径保留。
2. **安全回退**：非同源或非法回跳仍回落到默认路径。

**修改文件**:
- `apps/nexus/app/composables/useOauthContext.ts`

### Nexus Cloudflare Pages SSR 输出路径对齐

**变更类型**: 部署稳定性 / 路由回落

**描述**: Cloudflare Pages + Workers 场景下，生产构建强制启用 SSR，预览/部署脚本与指引统一使用 `dist` 输出，避免误用静态目录导致刷新回首页。

**主要变更**:
1. **SSR 强制**：生产环境保持 SSR 启用，确保 Pages Functions 生效。
2. **输出对齐**：`preview:cf`/`deploy:cf` 与 Cloudflare 指引统一使用 `dist` 目录。

**修改文件**:
- `apps/nexus/nuxt.config.ts`
- `apps/nexus/package.json`
- `apps/nexus/SETUP.md`

### Nexus OAuth redirect_url 套娃与 sign-in 500 修复

**变更类型**: 行为修复 / 登录稳定性

**描述**: 登录失败重试场景下，`callbackUrl/error/oauth` 等中间态参数可能被带入 `redirect_url` 并反复嵌套，导致 URL 膨胀、刷新 `/sign-in` 出现 500。现统一净化回跳地址并阻断回跳到认证中间页。

**主要变更**:
1. **统一净化**：`sanitizeRedirect` 清理 `callbackUrl/callback_url/oauth/error` 等临时参数。
2. **认证路径阻断**：回跳目标命中 `/sign-in` 或 `/api/auth/signin` 时回落到安全默认页。
3. **入口收敛**：Header、用户菜单、全局认证重定向、sign-up 跳转统一复用净化逻辑。
4. **同源 fallback 拒绝**：OAuth 授权地址若解析为同源 URL（如 `/?callbackUrl=...`）直接判定为 provider fallback 错误，阻断 `window.location.assign`。
5. **服务端重定向兜底**：Auth redirect callback 识别并收敛 `/?callbackUrl=...` 异常回跳，统一回落到 `/sign-in` 错误页，避免前端缓存旧逻辑时再次套娃。
6. **Auth 响应层改写**：对 `/api/auth/signin/*` 的 JSON `url` 与 `Location` 响应头统一执行 fallback 规范化，确保旧前端缓存命中时也不会继续跳转到 `/?callbackUrl=...`。

**修改文件**:
- `apps/nexus/app/composables/useOauthContext.ts`
- `apps/nexus/app/components/TheHeader.vue`
- `apps/nexus/app/components/HeaderUserMenu.vue`
- `apps/nexus/app/app.vue`
- `apps/nexus/app/pages/sign-up/index.vue`
- `apps/nexus/server/utils/__tests__/useOauthContext.test.ts`
- `apps/nexus/server/api/auth/[...].ts`

### CoreBox UI 恢复事件 URL 修正与索引 addPath 类型收敛

**变更类型**: 稳定性 / 构建修复

**描述**: 修正 CoreBox 插件 UI 恢复事件在无 query 场景使用未定义 URL 的问题，并为 file/app index addPath 事件显式标注返回类型，避免 typecheck 失败。

**主要变更**:
1. **恢复事件 URL**：无 query 时恢复事件使用当前 attach URL。
2. **addPath 类型约束**：file/app index addPath 事件 handler 显式标注请求/返回类型，消除返回值类型漂移。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/core-box/window.ts`
- `apps/core-app/src/main/channel/common.ts`

### DivisionBox 窗口池延后初始化

**变更类型**: 性能优化 / 启动体验

**描述**: DivisionBox 窗口池初始化延后到全部模块加载完成后异步触发，避免启动阶段被预热窗口阻塞。

**主要变更**:
1. **延后时机**：监听 `ALL_MODULES_LOADED` 后再调度 window pool 初始化。
2. **异步调度**：初始化改为非阻塞调度，避免影响模块加载链路。

**修改文件**:
- `apps/core-app/src/main/modules/division-box/module.ts`

### CoreBox Dev 插件视图路由按 manifest 直出

**变更类型**: 行为调整 / 插件开发

**描述**: Dev 插件视图不再强制 hash 路由，交互路径按 manifest 原样生成；需要 hash 路由时请在 manifest 的 interaction.path 中显式配置 `#/...`。

**主要变更**:
1. **移除强制 hash**：dev 插件 URL 不再自动改写为 `/#/`。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/core-box/window.ts`

### Intelligence 审计用量写入 Upsert 化以降低锁冲突

**变更类型**: 稳定性 / 数据持久化

**描述**: Intelligence 审计用量统计写入改为 `INSERT ... ON CONFLICT DO UPDATE`，避免事务内先读后写导致的 `SQLITE_BUSY_SNAPSHOT` 争用。

**主要变更**:
1. **Upsert 统计**：用量统计直接累加写入，减少读写锁竞争窗口。

**修改文件**:
- `apps/core-app/src/main/modules/ai/intelligence-audit-logger.ts`

### AppProvider 配置写入串行化避免 SQLITE_BUSY

**变更类型**: 稳定性 / 数据持久化

**描述**: AppProvider 写入 config 表时改为走 `DbWriteScheduler + withSqliteRetry`，降低与索引 worker 并发写入时触发 `SQLITE_BUSY` 的概率，并避免未处理的 Promise 拒绝。

**主要变更**:
1. **统一配置写入**：mdls 扫描时间/locale、缺失图标缓存、待删除缓存写入走统一写入函数。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`

---

## 2026-02-27

### 新增: Tuff Quick Actions SDK（兼容 MetaSDK）

**变更类型**: 接口增强 / 开发者体验优化

**描述**: 基于 TuffDSL 扩展了 Quick Actions 动作类型，并新增 `QuickActionsSDK`，用于统一插件在 `⌘K / Ctrl+K` 动作层注册与清理动作；保留 `MetaSDK` 作为兼容别名。

**主要变更**:
1. **TuffDSL 扩展**:
   - 新增 `TuffQuickActionRender` 与 `TuffQuickAction` 类型定义。
   - MetaOverlay 事件类型复用 TuffDSL 动作结构，避免重复定义。

2. **SDK 新增与兼容**:
   - 新增 `packages/utils/plugin/sdk/quick-actions-sdk.ts`（`createQuickActionsSDK`）。
   - `meta-sdk.ts` 改为兼容层，内部转发到 `QuickActionsSDK`。
   - SDK 索引新增导出 `quick-actions-sdk`。

3. **插件运行时 API 接入**:
   - 插件上下文新增 `quickActions`（同时保留 `meta`）。
   - `meta` 与 `quickActions` 复用同一 SDK 实例，避免重复监听与重复注册风险。

4. **类型与测试同步**:
   - `MetaUnregisterActionsRequest` 增加可选 `actionId`，与现有主进程处理对齐。
   - 增加 Quick Actions 生命周期测试，覆盖监听释放行为。

**修改文件**:
- `packages/utils/core-box/tuff/tuff-dsl.ts`
- `packages/utils/transport/events/types/meta-overlay.ts`
- `packages/utils/plugin/sdk/quick-actions-sdk.ts`
- `packages/utils/plugin/sdk/meta-sdk.ts`
- `packages/utils/plugin/sdk/index.ts`
- `packages/utils/plugin/sdk/types.ts`
- `packages/utils/__tests__/plugin-sdk-lifecycle.test.ts`
- `apps/core-app/src/main/modules/plugin/plugin.ts`

---

## 2026-02-26

### 修复: CoreBox/推荐引擎/系统轮询稳定性与日志降噪

**变更类型**: 稳定性修复

**描述**: 修复了近期日志中高频出现的 DB 锁竞争、CoreBox 视图销毁竞态与错误日志放大问题。

**主要修复**:
1. **SQLite 写入竞争缓解**:
   - `system-update` 相关写入（state/config/fx rates）统一接入 `dbWriteScheduler + withSqliteRetry`
   - `recommendation_cache` 写入接入串行调度与重试，并允许在高压队列下按策略丢弃
   - 推荐性能埋点写入改为 droppable，降低主业务路径写入冲突

2. **推荐缓存大 payload 收敛**:
   - 缓存落库前对 `data:image/...base64` 大字段进行裁剪
   - 对失效 data-url icon 自动移除，避免把超大图标数据重复写入 DB 与错误日志

3. **CoreBox 窗口竞态修复**:
   - `detachUIView` 增加重入保护和 WebContents 存活检查
   - `hide` 延时回调增加 `isDestroyed` 判定，避免 `Object has been destroyed`
   - 规避 `closeDevTools` 空对象链路触发的异常

4. **错误日志降噪与可诊断性增强**:
   - RecommendationEngine 错误日志改为结构化精简 meta，避免输出超大异常对象
   - OpenAI JSON 解析失败时补充 HTML 响应提示，明确指向 baseUrl 配置错误场景
   - `system-update` 轮询内捕获刷新异常，避免 PollingService 持续放大错误堆栈

5. **macOS ActiveApp 稳定性增强**:
   - 增加并发中的解析复用（in-flight）
   - 对 `EBADF` 增加一次短延迟重试，降低瞬时 spawn 句柄错误

**修改文件**:
- `apps/core-app/src/main/db/utils.ts`
- `apps/core-app/src/main/modules/system-update/index.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/window.ts`
- `apps/core-app/src/main/modules/ai/runtime/base-provider.ts`
- `apps/core-app/src/main/modules/system/active-app.ts`

**影响**:
- 显著降低 `SQLITE_BUSY` 风险与错误日志体积
- 提升 CoreBox UI 视图切换时的稳定性
- 改善异常定位效率并减少重复噪声日志

---

## 2026-02-26

### 修复: Translation Widget 键盘交互与错误展示稳定性

**变更类型**: Bug 修复 / 交互优化

**描述**: 优化 translation 插件的 widget 列表交互，移除高风险键盘监听方式，补齐焦点切换与快捷复制流程，避免运行时 `Illegal invocation` 风险并提升可用性。

**主要变更**:
1. **键盘事件接入调整**:
   - 从直接 `window.addEventListener('keydown')` 切换为监听 `core-box:key-event`
   - 按 `Meta/Ctrl + ←/→` 在历史列与翻译结果列切换焦点

2. **列表导航与动作增强**:
   - `↑/↓` 在当前焦点列循环移动选中项
   - `Enter` 在结果列复制当前选中项，在历史列回填当前选中历史文本
   - 默认焦点设为右侧结果列

3. **数据与渲染稳定性**:
   - 增加 payload/provider/history 归一化处理，避免运行时结构差异导致异常
   - 错误信息支持折叠/展开，避免长错误文本撑坏布局
   - 历史记录更新改为不可变更新路径，减少深层 watch 带来的副作用

4. **插件版本同步**:
   - `touch-translation` 版本升级至 `1.0.2`（manifest / package.json 同步）

**修改文件**:
- `plugins/touch-translation/widgets/translate-panel.vue`
- `plugins/touch-translation/manifest.json`
- `plugins/touch-translation/package.json`

**影响**:
- Translation widget 键盘可达性与列表操作一致性提升
- 降低跨上下文事件调用导致运行时异常的概率

---

## 2026-02-25

### 审计: TxFlipOverlay 关闭按钮二轮排查总结

**变更类型**: 文档/审计记录

**审计范围**:
- `apps/core-app`
- `apps/nexus/app`
- 聚焦 `TxFlipOverlay` 使用点，排查是否仍存在“重复自写右上角 close”与内置 close 冲突

**审计结论**:
- 二轮复核未发现新的生产级冲突点。
- 当前命中的 `@click="close"` 主要为流程型“取消/关闭当前步骤”按钮，不属于重复右上角关闭。
- `:closable="false"` 的场景为设计特例（由业务内容自身控制关闭），未发现无关闭路径问题。

**保留项（业务可接受）**:
- `/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/core-app/src/renderer/src/views/base/settings/components/ShortcutDialog.vue`
- `/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/core-app/src/renderer/src/views/base/styles/editors/RemotePresetOverlay.vue`
- `/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/core-app/src/renderer/src/views/base/styles/editors/CoreBoxEditorOverlay.vue`
- `/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/core-app/src/renderer/src/views/base/styles/editors/MainLayoutEditorOverlay.vue`
- `/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/app/pages/dashboard/account.vue`
- `/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/app/pages/dashboard/team.vue`
- `/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/app/pages/dashboard/admin/intelligence.vue`
- `/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/app/pages/dashboard/api-keys.vue`
- `/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/app/components/dashboard/ReviewModalOverlay.vue`
- `/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/app/components/dashboard/PluginMetadataOverlay.vue`

**测试/演示页例外（不纳入生产问题）**:
- `/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/app/pages/test/flip-overlay-stack.vue`
- `/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/app/components/content/demos/FlipOverlayFlipOverlayDemo.vue`

**后续建议**:
- 若后续需要执行“零手写 close”规范，可在不影响流程可用性的前提下，统一保留内置 close 并移除非必要 `Cancel/Close` 按钮。

---

## 2026-02-21

### CoreBox 路径动作提示与索引扩展

**变更类型**: 体验增强 / 行为补齐

**描述**: CoreBox 识别拖拽/剪贴板路径时提供系统动作提示，支持一键添加 Dev 插件、TPEX 插件、应用索引与文件索引；文件索引新增 `extraPaths` 并支持动态追加监控路径。

**主要变更**:
1. **系统动作 Provider**：新增 system actions provider，识别 manifest.json / .tpex / 应用 / 文件路径并生成操作项。
2. **文件索引扩展路径**：file-provider 支持 `extraPaths` + 动态 watch，新增 addPath 入口并自动触发索引。
3. **应用索引手动添加**：app-provider 新增 addPath 入口，复用现有更新逻辑。
4. **传输事件与文案**：新增 app/file index addPath 事件与 SDK 方法，补齐 i18n 文案。
5. **插件安装反馈**：插件添加成功或失败后，主窗口弹出通知并在成功/已存在时自动打开对应插件详情。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/addon/system/system-actions-provider.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/main/channel/common.ts`
- `packages/utils/transport/events/types/file-index.ts`
- `packages/utils/transport/events/types/app-index.ts`
- `packages/utils/transport/events/index.ts`
- `packages/utils/transport/sdk/domains/settings.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`

### Core-app 托盘模块恢复 TrayManager

**变更类型**: 行为恢复 / 稳定性

**描述**: 托盘模块切回 TrayManager，恢复统一的托盘事件处理与 IPC 处理链路。

**主要变更**:
1. **托盘加载恢复**：core-app 启动模块切回 TrayManagerModule。

**修改文件**:
- `apps/core-app/src/main/index.ts`

### 文件索引错误提示 Popover 与重建确认修复

**变更类型**: 体验修复 / 行为一致性

**描述**: 文件索引错误详情改为按钮触发 Popover 查看，避免错误文本直接铺满面板；重建索引在电量低场景避免重复确认，保留关键电量阈值变更时的二次确认。

**主要变更**:
1. **错误 Popover 接入**：错误详情区域显示按钮并通过 Popover 展示错误细节。
2. **确认逻辑修复**：电量低确认不再重复弹窗，仅在阈值变更或电量未知时二次确认。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`

### CoreBox 图标 base64 规范修复

**变更类型**: 体验修复 / 稳定性

**描述**: 修复图标提取在 worker 返回 Uint8Array 时被错误拼接为数字串的 data URL，导致 `ERR_INVALID_URL`；新增 base64 合法性校验与无效缓存重提取，避免脏数据重复进入渲染。

**主要变更**:
1. **Buffer 归一化**：Icon worker 结果强制转为 Buffer，确保 base64 输出正确。
2. **合法性校验**：缓存 icon 不符合 base64 规范时跳过并触发重提取。
3. **Windows 图标修复**：Windows 应用图标写入前统一 Buffer，避免错误格式落盘。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/addon/files/workers/icon-worker-client.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/search-processing-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/win.ts`

### tfile 路径规范化与缩略图后台生成优化

**变更类型**: 性能优化 / 体验修复

**描述**: tfile URL 解析补充 `tfile://` 路径拼接容错与 macOS `/users` 规范化；文件索引缩略图改由后台 worker 队列生成，缺失缩略图时先展示占位图，避免主线程阻塞与频繁 IO。

**主要变更**:
1. **tfile 解析容错**：构建/解析 `tfile://` URL 时避免 hostname 小写化导致的 `/users` 路径异常。
2. **缩略图 worker**：新增 ThumbnailWorker 队列异步生成缩略图，索引后批量补齐与按需触发。
3. **占位预览**：图片无缩略图时先渲染占位图，避免直接加载原图引发卡顿。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/addon/files/thumbnail-config.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/workers/thumbnail-worker.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/workers/thumbnail-worker-client.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/utils.ts`
- `apps/core-app/src/main/modules/file-protocol/index.ts`
- `apps/core-app/src/main/modules/clipboard.ts`

### CoreBox widget 加载保持最大高度

**变更类型**: 体验修复 / 行为一致性

**描述**: widget 激活期间 CoreBox 不再因空结果收缩，强制保持最大高度，避免加载过程窗口抖动。

**主要变更**:
1. **布局更新扩展**：layout payload 支持 `forceMax` 标记。
2. **窗口尺寸策略**：检测 widget 激活时强制走最大高度分支，跳过空结果收缩。
3. **结果更新容错**：BoxItem update 在目标不存在时自动 upsert，避免 widget 结果首次更新丢失。
4. **事件广播补全**：widget 注册/更新事件同步发送至 CoreBox 窗口，确保自定义渲染可用。
5. **展示模式优化**：widget 模式下禁用外层滚动并使用全高渲染容器，避免 footer 抖动与列表滚动干扰。
6. **Widget 沙箱隔离**：为 widget 注入独立的 localStorage/sessionStorage/document.cookie，并改用 secure storage 持久化 localStorage + cookie，追加单条/总量限制以约束访问。
7. **隔离命名空间**：为 widget 提供独立的 BroadcastChannel / indexedDB / caches 命名空间，阻断跨插件通道。
8. **窗口逃逸拦截**：阻断 widget 通过 window/self/top/parent/opener/document.defaultView 获取真实窗口上下文。
9. **CoreBox 输入兼容**：补充 `core-box:set-query` handler，避免 widget 通过旧事件设置输入时报错。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/core-box/index.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useResize.ts`
- `apps/core-app/src/main/modules/box-tool/item-sdk/box-item-manager.ts`
- `apps/core-app/src/main/modules/plugin/widget/widget-manager.ts`
- `apps/core-app/src/renderer/src/views/box/CoreBox.vue`
- `apps/core-app/src/main/modules/box-tool/core-box/ipc.ts`
- `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts`
- `packages/utils/transport/events/types/core-box.ts`
- `apps/core-app/src/renderer/src/utils/tfile-url.ts`

### Core-app UI 安全与按钮一致性修复

**变更类型**: 体验修复 / 安全加固

**描述**: App 列表与市场来源列表移除 `v-html` 渲染避免注入；文件树文件类型识别更稳健；主题过渡兼容无 ViewTransition 环境；预加载消息发送限制 targetOrigin；多个原生 button 统一为 tuffex 按钮。

**主要变更**:
1. **安全渲染**：AppList / MarketSourceEditor 改为文本渲染，避免注入风险。
2. **文件类型判断**：FileTree 兼容 `isFile` / `type` / Symbol 标记。
3. **主题过渡兼容**：无 ViewTransition 时直接切换主题。
4. **postMessage 限域**：预加载消息按 origin 发送。
5. **按钮一致性**：settings/浮动导航/返回/预览句柄统一 TxButton。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/application/AppList.vue`
- `apps/core-app/src/renderer/src/views/base/store/MarketSourceEditor.vue`
- `apps/core-app/src/renderer/src/components/tree/FileTree.vue`
- `apps/core-app/src/renderer/src/modules/storage/theme-style.ts`
- `apps/core-app/src/preload/index.ts`
- `apps/core-app/src/renderer/src/views/base/settings/components/FailedFilesListDialog.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
- `apps/core-app/src/renderer/src/views/layout/shared/FloatingNav.vue`
- `apps/core-app/src/renderer/src/components/layout/LayoutBackButton.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginFeatureDetailCard.vue`

### Renderer 调试日志收敛与 devLog 封装

**变更类型**: 体验修复 / 可维护性

**描述**: 清理 renderer 侧测试/示例日志输出，运行期调试日志统一走 devLog（仅 DEV 输出），避免生产噪音；保留关键错误日志。

**主要变更**:
1. **devLog 封装**：新增 `utils/dev-log.ts` 统一开发态日志输出。
2. **测试/示例日志移除**：LoginTest/MemoryLeakTest/UpdatePromptExample 等不再输出 console.log。
3. **运行期调试收敛**：CoreBox/更新/市场/对话框等模块日志改为 devLog。

**修改文件**:
- `apps/core-app/src/renderer/src/utils/dev-log.ts`
- `apps/core-app/src/renderer/src/base/axios.ts`
- `apps/core-app/src/renderer/src/components/addon/TerminalTemplate.vue`
- `apps/core-app/src/renderer/src/components/download/UpdatePromptExample.vue`
- `apps/core-app/src/renderer/src/components/plugin/PluginView.vue`
- `apps/core-app/src/renderer/src/components/plugin/action/PluginStatus.vue`
- `apps/core-app/src/renderer/src/components/tree/FileTree.vue`
- `apps/core-app/src/renderer/src/components/tuff/template/TuffItemTemplateExample.vue`
- `apps/core-app/src/renderer/src/composables/useFileIndexMonitor.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useActionPanel.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useKeyboard.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/usePreviewHistory.ts`
- `apps/core-app/src/renderer/src/modules/channel/storage/accounter.ts`
- `apps/core-app/src/renderer/src/modules/division-box/components/DivisionBoxShell.vue`
- `apps/core-app/src/renderer/src/modules/hooks/application-hooks.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useAppLifecycle.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useLanguageSettings.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useUpdate.ts`
- `apps/core-app/src/renderer/src/modules/store/providers/nexus-store-provider.ts`
- `apps/core-app/src/renderer/src/modules/update/UpdateProviderManager.ts`
- `apps/core-app/src/renderer/src/views/base/application/AppList.vue`
- `apps/core-app/src/renderer/src/views/base/application/ApplicationIndex.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingWindow.vue`
- `apps/core-app/src/renderer/src/views/test/LoginTest.vue`
- `apps/core-app/src/renderer/src/views/test/MemoryLeakTest.vue`

### Renderer 旧组件库全量迁移至 Tuffex

**变更类型**: 体验一致性 / 组件统一

**描述**: core-app renderer 全面移除旧组件库依赖，改为 Tuffex 组件体系；新增 Transfer 组件与 Tree 叶子节点支持以补齐迁移能力。

**主要变更**:
1. **组件替换**：Alert/Collapse/Dropdown/Empty/Form/Pagination/Skeleton/Tree 等组件全部迁移至 Tuffex。
2. **能力补齐**：新增 `TxTransfer` 组件与 `TxTree` 的 `leaf` 能力，覆盖模型管理与文件树场景。
3. **插件移除**：renderer 启动流程移除旧组件库全量注册。
4. **用例同步**：文档模板示例切换到 TxButton/TxTag。
5. **构建清理**：移除旧组件库自动导入/组件解析器与依赖声明，清理 renderer 主题入口残留。

**修改文件**:
- `packages/tuffex/packages/components/src/transfer/src/TxTransfer.vue`
- `packages/tuffex/packages/components/src/transfer/index.ts`
- `packages/tuffex/packages/components/src/tree/src/TxTree.vue`
- `packages/tuffex/packages/components/src/tree/src/types.ts`
- `packages/tuffex/packages/components/src/alert/src/TxAlert.vue`
- `apps/core-app/src/renderer/src/main.ts`
- `apps/core-app/src/renderer/src/components/intelligence/config/IntelligenceModelConfig.vue`
- `apps/core-app/src/renderer/src/components/tree/FileTree.vue`
- `apps/core-app/src/renderer/src/components/download/DownloadHistoryView.vue`
- `apps/core-app/src/renderer/src/components/download/DownloadSettings.vue`
- `apps/core-app/src/renderer/src/components/download/DownloadTask.vue`
- `apps/core-app/src/renderer/src/components/download/TaskCard.vue`
- `apps/core-app/src/renderer/src/components/permission/PermissionRequestDialog.vue`
- `apps/core-app/src/renderer/src/components/permission/PermissionStatusCard.vue`
- `apps/core-app/src/renderer/src/views/base/styles/LayoutAtomEditor.vue`

### Nexus / Touch Music 移除旧组件库

**变更类型**: 依赖清理 / 组件统一

**描述**: Nexus 与 touch-music 插件清理旧组件库依赖与锁文件残留，插件 UI 迁移到 Tuffex（TxScroll/TxSlider/TxInput），并统一使用 `--tx-*` 主题变量。

**主要变更**:
1. **Nexus 清理**：锁文件移除旧组件库与 icons-vue 依赖。
2. **插件迁移**：touch-music 用 TxScroll/TxSlider/TxInput 替换旧组件库组件，并移除旧样式入口。
3. **主题变量**：touch-music 相关样式变量统一替换为 `--tx-*`。

**修改文件**:
- `apps/nexus/pnpm-lock.yaml`
- `plugins/touch-music/src/main.js`
- `plugins/touch-music/src/style.css`
- `plugins/touch-music/src/components/music/base/PlayProgressBar.vue`
- `plugins/touch-music/src/components/music/FooterFunction.vue`
- `plugins/touch-music/src/components/music/layout/Header.vue`
- `plugins/touch-music/src/components/music/layout/SearchResults.vue`
- `plugins/touch-music/src/components/music/PlayList.vue`
- `plugins/touch-music/src/components/music/word-lyric/WordLyricScroller.vue`
- `plugins/touch-music/src/components/music/word-lyric/leaf/LyricScroller.vue`
- `plugins/touch-music/src/components/music/base/PlayProgressBar.old.old.vue`

### 全仓清理旧组件库痕迹

**变更类型**: 依赖清理 / 文档一致性

**描述**: 全仓移除旧变量兼容与旧示例，统一为 Tuffex 变量与组件命名。

**主要变更**:
1. **样式兼容移除**：tuffex 组件去除旧变量回退，避免残留引用。
2. **插件更新**：touch-translation 样式变量统一为 `--tx-*`。
3. **文档同步**：PRD 示例组件统一切换为 Tuffex 组件命名。

**修改文件**:
- `packages/tuffex/packages/components/src/flat-select/src/TxFlatSelect.vue`
- `packages/tuffex/packages/components/src/flat-select/src/TxFlatSelectItem.vue`
- `packages/tuffex/packages/components/src/flat-radio/src/TxFlatRadio.vue`
- `packages/tuffex/packages/components/src/flat-radio/src/TxFlatRadioItem.vue`
- `plugins/touch-translation/widgets/translate-panel.vue`
- `docs/plan-prd/02-architecture/telemetry-error-reporting-system-prd.md`
- `docs/plan-prd/03-features/search/quick-launch-and-search-optimization-prd.md`
- `docs/plan-prd/TODO.md`
- `apps/core-app/src/renderer/src/views/base/settings/SettingPermission.vue`
- `apps/core-app/src/renderer/src/components/tuff/template/TuffItemTemplate.md`
- `apps/core-app/src/renderer/src/components/tuff/template/DESIGN_EXTENSIONS.md`

## 2026-02-20

### CI Windows 构建命令执行修复

**变更类型**: 工具链修复 / CI 稳定性

**描述**: 修复 Windows Runner 上 `tuffex` build 触发的 `spawn EINVAL`，改为通过 `cmd.exe` 执行构建命令，确保 Build and Release / Release Core Assets 的 Windows 阶段可稳定完成。

**主要变更**:
1. **命令执行修复**：Windows 下使用 `cmd.exe /d /s /c` 调用构建命令。
2. **参数安全处理**：统一命令行转义与拼接，保持非 Windows 行为不变。

**修改文件**:
- `packages/tuffex/packages/script/build/run.ts`

### Nexus 头像入口补充控制台跳转

**变更类型**: 体验修复 / 导航

**描述**: Header 用户菜单补充控制台入口；支持 hover 的设备点击头像可直接进入控制台，触屏设备保持菜单可用。

**主要变更**:
1. **头像快捷跳转**：hover 设备点击头像跳转 `/dashboard`。
2. **菜单入口**：用户菜单新增“控制台”项，触屏点击头像后也可进入。

**修改文件**:
- `apps/nexus/app/components/HeaderUserMenu.vue`

### Nexus 文档代码块高亮补全

**变更类型**: 体验修复 / 文档渲染

**描述**: 修复 ClientOnly/示例代码块挂载后未触发高亮的问题，确保代码在展开或渲染后立即着色。

**主要变更**:
1. **高亮解析复用**：抽离 highlight.js 解析逻辑供插件与代码块组件共享。
2. **挂载后高亮**：TuffCodeBlock 在挂载与内容变更时触发高亮，避免漏染。

**修改文件**:
- `apps/nexus/app/utils/highlight.ts`
- `apps/nexus/app/plugins/highlight.client.ts`
- `apps/nexus/app/components/content/TuffCodeBlock.vue`

### 更新系统实验性 Renderer Override 与 Nexus 版本分布统计

**变更类型**: 行为增强 / 可观测性

**描述**: Renderer Override 需要手动开启并受环境变量约束；更新检查/下载/安装失败与 Renderer Override 关键异常写入 Nexus 遥测消息；更新检查/下载/安装追加结构化 telemetry 事件并扩展 Update 行为分布统计（action/stage/result/channel/source/tag/itemKind）；Nexus 管理台新增版本分布统计（按近 N 天 visit 事件统计）。

**主要变更**:
1. **手动开关**：更新设置新增 Renderer Override 实验性开关（默认关闭，需 `TUFF_ENABLE_RENDERER_OVERRIDE=1` 生效）。
2. **异常上报**：更新检查/下载/安装失败与 Renderer Override 关键异常上报至 Nexus telemetry messages。
3. **更新埋点**：更新检查/下载/安装补充结构化 telemetry 事件（feature_use）。
4. **更新分布**：Nexus Analytics 增加 Update 行为/阶段/结果/渠道/来源/版本/触发方式分布统计卡片。
5. **版本分布**：Nexus Analytics 增加版本分布统计与饼图展示（基于 visit 事件）。

**修改文件**:
- `apps/core-app/src/main/modules/update/update-system.ts`
- `apps/core-app/src/main/modules/update/UpdateService.ts`
- `apps/core-app/src/main/core/touch-app.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUpdate.vue`
- `apps/core-app/src/renderer/src/modules/hooks/useUpdate.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `packages/utils/types/update.ts`
- `apps/nexus/server/utils/telemetryStore.ts`
- `apps/nexus/app/pages/dashboard/admin/analytics.vue`

### DivisionBox / Flow 权限入口对齐

**变更类型**: 权限闭环 / 行为一致性

**描述**: 统一 Flow 触发与 DivisionBox 打开场景的权限判定与入口归因，补齐 CoreBox 触发链路的权限校验与用户反馈。

**主要变更**:
1. **权限归因**：Flow Dispatch 增加 `actorPluginId`，仅在插件来源时写入；DivisionBox 打开入口仅对插件来源透传 pluginId。
2. **权限判定**：FlowBus 与 DivisionBox IPC 统一按 payload/context 解析 actor 与 sdkapi，避免误用默认版本。
3. **权限映射**：`division-box:flow:trigger` 绑定 `window.create` + `storage.shared` 双权限。
4. **用户反馈**：UI 模式触发 Flow 前置权限校验，拒绝时弹出 toast 提示。

**修改文件**:
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useDetach.ts`
- `packages/utils/transport/events/types/flow.ts`
- `apps/core-app/src/main/modules/permission/permission-guard.ts`
- `apps/core-app/src/main/modules/flow-bus/ipc.ts`
- `apps/core-app/src/main/modules/division-box/ipc.ts`
- `apps/core-app/src/main/modules/flow-bus/module.ts`

### 旧同步链路禁用（/api/sync/*）

**变更类型**: 行为收口 / 兼容性

**描述**: 旧 `/api/sync/push` 与 `/api/sync/pull` 全部禁用并提示迁移至 `/api/v1/sync/*`，旧链路不再兼容。

**主要变更**:
1. **禁写提示**：旧 push 返回 410 并提示迁移路径。
2. **禁读提示**：旧 pull 返回 410 并提示迁移路径。

**修改文件**:
- `apps/nexus/server/api/sync/push.post.ts`
- `apps/nexus/server/api/sync/pull.get.ts`

### 翻译插件 SDK 升级与实验性功能隐藏

**变更类型**: 权限治理 / 行为一致性

**描述**: 翻译插件升级到最新 sdkapi，补充分类与 AI 权限；新增 feature.experimental 标记，非 dev 模式自动隐藏实验性功能（截图翻译默认隐藏）。

**主要变更**:
1. **SDK 与权限**：touch-translation 补齐 `sdkapi`、`category` 与 `intelligence.basic` 权限说明。
2. **实验性特性**：支持 `feature.experimental` 并在非 dev 模式过滤展示。
3. **权限前置**：智能翻译调用前增加 AI 权限校验与提示。

**修改文件**:
- `packages/utils/plugin/index.ts`
- `apps/core-app/src/main/modules/plugin/plugin-feature.ts`
- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
- `plugins/touch-translation/manifest.json`
- `plugins/touch-translation/index.js`
- `plugins/touch-translation/index/main.ts`

### Webcontent 插件 Transport 注入修复

**变更类型**: 稳定性 / 行为修复

**描述**: webcontent 动态 preload 脚本在临时目录执行时无法解析 `@talex-touch/utils/transport`，导致插件页面无法建立通信通道；统一通过 utils transport prelude 输出通道注入脚本，预加载仅负责 `$channel`，`$transport` 由插件前端 prelude 初始化。

**主要变更**:
1. **Prelude 注入**：主进程通过 `@talex-touch/utils/transport/prelude` 生成通道脚本并注入 preload。
2. **通道初始化**：CoreBox 与 DivisionBox 的 webcontent 注入一致化处理，避免特定容器失效。

**修改文件**:
- `packages/utils/transport/prelude.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/window.ts`
- `apps/core-app/src/main/modules/division-box/session.ts`

### Intelligence 审计写入降噪

**变更类型**: 性能优化 / 稳定性

**描述**: intelligence audit flush 在主线程批量序列化与写库时可能引发 event loop lag；缩小单批写入规模，并引入异步调度与分段 flush，降低阻塞时长。

**主要变更**:
1. **批次缩小**：flush 批次从 50 降至 20。
2. **延迟写入**：达到批次阈值后使用异步调度再写入，避免请求路径阻塞。
3. **分段 flush**：flush 过程按批次分段并让出事件循环，避免长时间占用主线程。

**修改文件**:
- `apps/core-app/src/main/modules/ai/intelligence-audit-logger.ts`

## 2026-02-19

### Intelligence OpenAI 兼容 Base URL 归一化

**变更类型**: 兼容性修复 / 管理台提示

**描述**: OpenAI 兼容提供商默认自动补全 `/v1`，避免误落到 UI 路径；如需 `/api/v1` 或 `/openai/v1`，需在 Base URL 中显式填写。

**主要变更**:
1. **Base URL 归一化**：OpenAI 兼容路径仅自动补全 `/v1`，不再尝试多种变体。
2. **提示更新**：管理台 Base URL 提示明确写法。

**修改文件**:
- `apps/nexus/server/utils/intelligenceModels.ts`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/i18n/locales/en.ts`

### Intelligence OpenAI 兼容输出提取增强

**变更类型**: 兼容性修复 / 运行稳定性

**描述**: 支持 OpenAI-compatible 响应仅返回 `reasoning_content` 的场景，避免被误判为“空响应”。

**主要变更**:
1. **输出提取**：当 `content` 为空时，依次回落到 `reasoning_content` / `reasoning` / `analysis` 字段。
2. **响应解析**：从 `message` 根对象提取内容，兼容非标准字段。

**修改文件**:
- `apps/nexus/server/utils/tuffIntelligenceLabService.ts`

### Intelligence System Prompt 上下文补充

**变更类型**: 能力增强 / 可追溯性

**描述**: TuffIntelligence Lab 所有模型调用增加统一系统上下文（角色、当前时间、当前用户、会话 ID）。

**主要变更**:
1. **系统上下文**：在 intent / planner / executor / reviewer / follow-up / final responder 等阶段注入统一提示。
2. **时间信息**：包含本地时间与 ISO 时间，便于审计与复盘。

**修改文件**:
- `apps/nexus/server/utils/tuffIntelligenceLabService.ts`

### Nexus Intelligence 模块整合积分

**变更类型**: 体验优化 / 管理台信息整合

**描述**: 管理后台将 AI 积分从独立导航合并到 Intelligence 模块，并统一命名为 Intelligence 模块，方便管理员在单页内查看渠道配置、审计与积分消耗。

**主要变更**:
1. **导航合并**：管理员侧移除单独的 AI Credits 菜单，合并到 Intelligence 模块页签。
2. **模块命名**：菜单与页面标题统一为 “Intelligence 模块”，同步中英文文案。
3. **积分视图**：原有积分消耗/流水视图作为新页签嵌入。

**修改文件**:
- `apps/nexus/app/components/dashboard/DashboardNav.vue`
- `apps/nexus/app/pages/dashboard/admin/intelligence.vue`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/i18n/locales/en.ts`

### Nexus 汇率服务（USD 基准 + 历史归档）

**变更类型**: 能力接入 / 服务端数据

**描述**: 新增 ExchangeRate-API 汇率服务，统一 USD 作为 base，按请求触发 + 8h TTL 缓存；成功响应写入 D1 历史表并将错误归档到 telemetry。

**主要变更**:
1. **运行时配置扩展**：新增 `exchangeRate` 配置项，包含 API Key、Base URL、TTL 与超时。
2. **双层缓存与历史记录**：新增 `exchange_rate_snapshots` 表并保留完整 payload，useStorage 作为 fallback。
3. **对外换算 API**：新增 `/api/exchange/convert`（仅支持 USD base）。
4. **错误归档**：上游错误写入 `telemetry_messages`，便于检索与审计。

**修改文件**:
- `apps/nexus/nuxt.config.ts`
- `wrangler.toml`
- `apps/nexus/server/utils/exchangeRateStore.ts`
- `apps/nexus/server/utils/exchangeRateService.ts`
- `apps/nexus/server/api/exchange/convert.get.ts`
- `apps/nexus/server/utils/__tests__/exchangeRateService.test.ts`
- `.spec/features/exchange-rate-service.md`
- `.spec/modules/exchange-rate-cache.md`
- `.spec/index.md`

### Nexus 汇率历史查询（非免费用户）

**变更类型**: 能力增强 / 高级权限

**描述**: 在 USD 基准汇率服务上新增历史查询能力，非 FREE 用户可访问历史曲线；新增归一化历史表并支持可选 payload 返回。

**主要变更**:
1. **历史查询 API**：新增 `/api/exchange/history`，支持按币种 + 时间范围查询。
2. **权限门槛**：非 FREE 用户可访问；`includePayload` 仅管理员允许。
3. **归一化历史表**：新增 `exchange_rate_rates`，便于时间序列查询。
4. **保留策略**：支持 `historyRetentionDays` 控制清理（默认不清理）。
5. **管理后台视图**：Admin Analytics 新增 Exchange 区块用于查看历史数据。

**修改文件**:
- `apps/nexus/nuxt.config.ts`
- `wrangler.toml`
- `apps/nexus/server/utils/exchangeRateStore.ts`
- `apps/nexus/server/utils/exchangeRateService.ts`
- `apps/nexus/server/api/exchange/history.get.ts`
- `apps/nexus/server/utils/__tests__/exchangeRateHistory.test.ts`
- `apps/nexus/app/pages/dashboard/admin/analytics.vue`
- `.spec/features/exchange-rate-service.md`
- `.spec/modules/exchange-rate-cache.md`
- `.spec/index.md`

### Nexus 汇率 API 计费与 Latest 接口

**变更类型**: 计费策略 / 接口扩展

**描述**: 汇率服务新增 `/api/exchange/latest`（USD 基准倍率表）并建立积分扣费规则；`convert` 每次扣 0.1，`latest` 每次扣 1，`history` 每次扣 2。

**主要变更**:
1. **Latest 接口**：新增 `/api/exchange/latest` 返回 USD 基准倍率与更新时间字段。
2. **扣费策略**：`convert`/`latest`/`history` 分别扣 0.1/1/2 credits。
3. **表结构优化**：credits 表字段使用 REAL 并统一保留 2 位小数。

**修改文件**:
- `apps/nexus/server/api/exchange/convert.get.ts`
- `apps/nexus/server/api/exchange/latest.get.ts`
- `apps/nexus/server/api/exchange/history.get.ts`
- `apps/nexus/server/utils/creditsStore.ts`

### 统一更新与汇率热数据链路（Nexus + CoreApp）

**变更类型**: 统一更新 / 热数据分发

**描述**: 扩展 Nexus Updates/Release 体系支持系统更新（公告/配置/热数据），新增 payload 存储与读取；CoreApp 增加 SystemUpdate 拉取与 fx-rate 热数据回填，更新服务支持 Official 源，并在汇率换算 API 中暴露更新时间字段。

**主要变更**:
1. **Updates 扩展**：`dashboard_updates` 增加 scope/type/channels 与 payload 元数据，新增 `/api/updates/:id/payload`。
2. **汇率更新时间暴露**：`/api/exchange/convert` 返回 `providerUpdatedAt/fetchedAt/providerNextUpdateAt`。
3. **汇率热数据刷新**：新增 fx-rate 刷新入口与 provider 客户端占位。
4. **CoreApp 系统更新拉取**：新增 SystemUpdateModule、fx_rates/system_config/system_update_state 表。
5. **官方更新源支持**：UpdateService 增加 OFFICIAL provider 并对接 Nexus `/api/releases/latest`。

**修改文件**:
- `apps/nexus/server/utils/dashboardStore.ts`
- `apps/nexus/server/utils/updateAssetStorage.ts`
- `apps/nexus/server/api/updates.get.ts`
- `apps/nexus/server/api/updates/[id]/payload.get.ts`
- `apps/nexus/server/api/dashboard/updates/fx-rate/refresh.post.ts`
- `apps/nexus/server/utils/fxRateProviderClient.ts`
- `apps/nexus/server/utils/exchangeRateService.ts`
- `apps/nexus/server/api/exchange/convert.get.ts`
- `apps/nexus/app/components/dashboard/UpdateFormDrawer.vue`
- `apps/nexus/app/pages/dashboard/updates.vue`
- `apps/nexus/app/pages/updates.vue`
- `apps/nexus/app/composables/useDashboardData.ts`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/i18n/locales/en.ts`
- `apps/core-app/src/main/modules/system-update/index.ts`
- `apps/core-app/src/main/db/schema.ts`
- `apps/core-app/resources/db/migrations/0020_system_update_tables.sql`
- `apps/core-app/src/main/modules/box-tool/addon/preview/providers/fx-rate-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/preview/abilities/currency-ability.ts`
- `apps/core-app/src/main/modules/update/UpdateService.ts`
- `apps/core-app/src/main/core/eventbus/touch-event.ts`

### CoreApp 页面标题 i18n 规范化

**变更类型**: 体验一致性 / 国际化

**描述**: CoreApp 页面标题支持 `$I18n:` 前缀解析，路由与布局标题统一走 i18n 解析逻辑。

**主要变更**:
1. **新增标题前缀约定**：`$I18n:<key>` 用于标记需要国际化的页面标题与路由名。
2. **布局标题解析**：ViewTemplate 与布局控制器统一解析前缀并回退到原文。
3. **路由标题本地化**：核心路由名替换为 i18n key 并补充双语文案。

**修改文件**:
- `apps/core-app/src/renderer/src/base/router.ts`
- `apps/core-app/src/renderer/src/components/base/template/ViewTemplate.vue`
- `apps/core-app/src/renderer/src/composables/layout/useLayoutController.ts`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/I18N_IMPLEMENTATION.md`

### Setting About 更新通道显示调整

**变更类型**: 体验一致性 / 信息展示

**描述**: 设置页关于模块的通道信息改为展示用户订阅的更新通道，避免与构建类型重复。

**主要变更**:
1. **更新通道替换**：将 Channel 字段改为 Update Channel，并读取更新订阅通道。
2. **订阅标识**：通道值附加 `sub` 标记便于区分构建类型。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/settings/SettingAbout.vue`

### Nexus App 登录回调失焦自动关闭

**变更类型**: 行为优化 / 体验改进

**描述**: 登录回调页在拉起客户端后检测到页面失焦即视为成功并关闭标签页，避免 dev token 提示干扰。

**主要变更**:
1. **失焦即关闭**：协议拉起后页面失焦触发自动关闭标签页。
2. **取消 dev token 提示**：成功且失焦时不再展示 dev-mode token 复制提示。

**修改文件**:
- `apps/nexus/app/pages/auth/app-callback.vue`

### 同步阻塞系统通知

**变更类型**: 行为优化 / 可观测性

**描述**: 同步连续失败后触发一次系统通知，提示配额/设备/鉴权问题，避免多次 toast 被忽略。

**主要变更**:
1. **失败阈值通知**：连续失败达到 3 次后发送系统通知（按原因去重）。
2. **发送端本地化**：同步通知文案在 renderer 侧完成 i18n 解析后发送。
3. **成功后重置**：同步成功后清理通知去重状态，下一轮可重新提示。

**修改文件**:
- `apps/core-app/src/renderer/src/modules/sync/auto-sync-manager.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`

### 同步设备自动回收

**变更类型**: 行为优化 / 账号安全

**描述**: 新设备开始同步时，超过设备上限会自动回收最久未活跃设备，并在当前设备提示回收结果。

**主要变更**:
1. **自动回收旧设备**：同步握手时先回收 30 天未活跃设备，仍超限则按 `last_seen_at` 从旧到新回收。
2. **同步握手提示**：握手返回回收列表（含设备名/平台/最近活跃），客户端弹出系统通知提醒。
3. **API 类型同步**：更新 Sync handshake 响应与类型定义。

**修改文件**:
- `apps/nexus/server/utils/authStore.ts`
- `apps/nexus/server/api/v1/sync/handshake.post.ts`
- `apps/nexus/openapi/nexus-sync.yaml`
- `apps/nexus/types/sync-api.d.ts`
- `packages/utils/types/cloud-sync.ts`
- `packages/utils/cloud-sync/cloud-sync-sdk.ts`
- `apps/core-app/src/renderer/src/modules/sync/auto-sync-manager.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`

### 文档治理基线与路线图收敛

**变更类型**: 文档治理 / 规划收敛

**描述**: 补齐“项目定义 → PRD 目标 → 质量约束 → 执行路线图”的文档闭环，统一后续迭代的执行标准。

**主要变更**:
1. **AGENTS 项目定义增强**：新增项目定位、交付边界、阶段性最终目标与文档同步责任。
2. **PRD 索引增强**：`docs/plan-prd/README.md` 增加 North Star 与活跃 PRD 质量约束。
3. **新增产品总览与 8 周路线图**：`docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`。
4. **新增 PRD 质量基线文档**：`docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`，要求活跃 PRD 必含目标、约束、验收、回滚。
5. **新增 Week 1 执行清单**：`docs/plan-prd/01-project/WEEK1-EXECUTION-PLAN-2026Q1.md`。
6. **补齐模块日志 PRD 质量段落**：`docs/plan-prd/02-architecture/module-logging-system-prd.md` 新增最终目标/质量约束/回滚策略。
7. **TODO 与索引对齐**：`docs/plan-prd/TODO.md`、`docs/INDEX.md` 新增治理入口与执行项。

### TuffIntelligence Lab 流式对话语义修正

**变更类型**: 行为调整 / 体验优化

**描述**: 调整 TuffIntelligence Lab 的对话恢复语义为“历史即上下文”，断链后无需显式恢复；状态日志改为模型原文直出，最终回答使用流式输出。

**主要变更**:
1. **取消显式恢复流程**：前端移除 recoverable/resume 交互，只保留历史加载与继续对话。
2. **状态日志直出**：意图、动作选择、动作结果统一采用模型原文作为状态消息。
3. **最终回答流式**：最终回答优先走流式推送，失败时回退为普通流。
4. **断链语义简化**：保留 `session.paused` 事件作为日志提示，不提供 recoverable/resume API。
5. **移除外部桥接依赖**：仅使用已启用 provider 执行链路。
6. **原始输出可追溯**：plan/reflect/followup 的原始输出与错误详情写入 stream detail，便于溯源与排障。
7. **快捷测试入口**：管理端对话页提供默认提示词按钮，便于快速验证工具能力。
8. **错误追踪增强**：错误事件补充 providerId/model/endpoint/status/responseSnippet 等详细字段。

**修改文件**:
- `apps/nexus/server/utils/tuffIntelligenceLabService.ts`
- `apps/nexus/app/pages/dashboard/admin/intelligence-lab.vue`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/i18n/locales/zh.ts`

### LangChain + Nuxt 流式对话接入（管理员测试页）

**变更类型**: 能力接入 / 测试通道

**描述**: 在 Nexus 内接入 LangChain，并新增管理员专用的流式对话测试页，支持历史回放。

**主要变更**:
1. **LangChain 接入**：新增 LangChain 流式调用与消息历史管理。
2. **Admin API**：新增 `/api/admin/intelligence/chat` GET/POST 路由，支持流式对话与历史回放。
3. **测试页面**：新增 `/dashboard/admin/intelligence-chat` 页面用于对话验证。
4. **Provider 对齐**：LangChain 调用复用 intelligence provider 配置，不再读取环境变量。

**修改文件**:
- `apps/nexus/server/api/admin/intelligence/chat.ts`
- `apps/nexus/app/pages/dashboard/admin/intelligence-chat.vue`
- `apps/nexus/package.json`
- `apps/nexus/nuxt.config.ts`

### 安全加固：路径与命令执行防护

**变更类型**: 安全加固 / 风险收敛

**描述**: 统一路径校验与命令执行封装，限制可疑路径访问并修复通道 key 回收问题。

**主要变更**:
1. **新增安全封装**：`safe-path` 与 `safe-shell` 统一路径校验与非 shell 执行。
2. **插件存储路径校验**：插件存储读写删/详情均限制在插件配置目录内。
3. **文件访问限制**：`fs:read-file`/`fs:write-file` 仅允许对话框批准路径；`tfile://` 访问限制在白名单根目录。
4. **命令执行去 shell**：App Scanner、Darwin app icon、Native Share、Terminal、Open-in-editor 等改为安全执行，并为终端执行增加权限校验。
5. **通道 key 回收修复**：修复 revokeKey 删除顺序导致的 key 残留。

---

## 2026-02-10

### CoreBox 内置能力抽离为独立插件

**变更类型**: 架构重构

**描述**: 将 CoreBox 的 7 个内置能力抽离为独立插件，实现核心框架与业务能力的解耦。

**主要变更**:
1. **新增 7 个独立插件**:
   - `touch-browser-open` - 浏览器打开 / URL 系统
   - `touch-browser-bookmarks` - 浏览器书签搜索
   - `touch-quick-actions` - 快捷操作
   - `touch-window-presets` - 窗口预设
   - `touch-workspace-scripts` - 工作区脚本
   - `touch-system-actions` - 系统操作
   - `touch-intelligence-actions` - AI 智能操作
2. **移除内置实现**: `apps/core-app/src/main/` 中对应内置 URL 系统和内部 AI providers 已移除
3. **测试与文档**: 每个插件含 shared loader 测试 + Nexus onboarding 文档

**相关提交**: `a304911e`, `17c48a79`, `30ba3518`, `6c2b7320`, `67c4a001`, `9fd6ca5f`

---

### SDK 统一 Hard-Cut 进展

**变更类型**: 架构治理

**描述**: 推进 SDK 统一 Hard-Cut，将 renderer 直连 IPC 迁移到 Typed Transport Domain SDKs。

**主要变更**:
1. **批次 A~D 已完成**: Settings/Permission/Download/Cloud Sync/Channel 迁移到 SDK Hooks
2. **Typed Transport Domain SDKs**: `packages/utils/transport/` 新增类型化域 SDK 和 event payloads
3. **Renderer SDK Hooks**: `packages/utils/renderer/hooks/` 迁移完成
4. **Safe handler wrappers**: Channel 和 download 模块增加安全处理器包装

**参考**: `docs/engineering/reports/sdk-unification-progress-2026-02-08.md`

---

### Nexus OAuth 稳定化

**变更类型**: Bug 修复 + 安全增强

**描述**: 修复 Nexus 认证流程中的多个问题，提升安全性。

**主要变更**:
1. **sign-in callback 修复**: 稳定化 OAuth 回调流程
2. **auth guard 拆分**: session 和 app auth guard 独立，避免相互干扰
3. **Turnstile + Passkey**: 新增 Turnstile 验证和 Passkey step-up flow
4. **设备认证**: 新增 device attestation flow 和 secure local seed handling

**相关提交**: `bf87e09e`, `1bea54ce`, `9b137b49`, `919064c2`

---

### 更新系统增强

**变更类型**: 功能增强

**描述**: 实现可复用更新任务和增强下载管理。

**主要变更**:
1. **reusable update tasks**: 更新任务可复用，减少重复代码
2. **下载管理增强**: 改进下载流程和错误处理
3. **版本守护**: 启动时版本校验（startup version guard）

**相关提交**: `7d5b479d`, `f4cc525e`

---

### 原生能力集成

**变更类型**: 功能增强

**描述**: 引入原生能力支持，增强系统集成。

**主要变更**:
1. **tuff-native**: 新增 workspace 包和构建接入
2. **本地 OCR**: 新增系统 OCR provider 和 native integration
3. **Everything SDK**: fallback chain 和后端诊断功能
4. **PowerSDK**: 低功耗适配支持

**相关提交**: `3ecac208`, `846413fa`, `e0bf259b`, `1a1fce3e`

---

### 代码质量治理

**变更类型**: 代码质量

**描述**: 系统性代码质量提升，达到 B+ 评级。

**参考**: `docs/engineering/reports/code-quality-2026-02-03.md`

---

## 2026-01

### Nexus 数据同步协议与审核系统

**变更类型**: 功能增强

**主要变更**:
1. **Nexus 统计扩展**: 搜索/执行细分指标、模块耗时可视化、隐私约束（不采集搜索词）
2. **Nexus 审核系统**: Review states 细化、auth gate、回归文档（NEXUS-REV-040~060）
3. **Nexus 文档迁移**: 组件 demo wrapper pattern、migration status banners

---

### 更新系统统一

**变更类型**: 功能增强

**主要变更**:
1. **兼容性标志更新**: compatibility flags 和 versioning 调整
2. **记录清理**: update repository 实现 record clearing
3. **Release 脚本增强**: Windows/macOS/Linux artifact 处理改进

---

### TuffEx 迁移与 CLI 分包规划

**变更类型**: 架构规划

**主要变更**:
1. **TuffEx 组件库迁移**: tuffex-ui → tuffex 重命名和构建脚本修复
2. **Tuff CLI 分包**: `@talex-touch/tuff-cli-core` + `@talex-touch/tuff-cli` 拆分规划

---

### 从 README.md 归档的旧里程碑（超过 3 个月）

以下条目从 README.md 近期里程碑中移出：
- **插件市场多源**（2025-12 完成）：TpexApi + Nexus + NPM + GitHub Provider
- **Search DSL**（2025-12 完成）：`@xxx` provider filter + pinned
- **Nexus Team Invite**（2025-12 完成）：邀请 + join 页面
- **直接预览计算**（2025-12 完成）：表达式 + 单位换算 + 汇率 + 时间
- **Widget 动态加载**（2025-12 完成）：Loader + Compiler + Manager

---

## 2025-11-27

### 完成: 代码质量迭代与文档整理

**变更类型**: 代码质量 + 文档整理

**核心工作**:

#### 1. 代码质量扫描 📊
- **中文硬编码识别**: 发现 2000+ 处中文字符（主要在注释）
- **日志系统碎片化**: 发现 300+ 处 `console.log` 待迁移
- **TODO 标记梳理**: 识别 17 处待实现功能
- **Extract Icon API 验证**: 确认 `tfile://` 协议全面实施完成

#### 2. 已完成功能归档 ✅
- **tfile:// 协议迁移**: 18 个组件已完成，性能提升 70%+
- **UI/UX 改进总结**: 记录 2025-11 月完成的 15+ 页面重构
  - 登录页面简化 (会话 31ef54b4)
  - 个人资料页三页重构 (会话 36a89e8a, 98b2468a, ebd24d48)
  - 欢迎页面优化 (会话 432448fe, aab8db44)
  - 打卡页面重设计 (会话 6bbe5bda)
  - 统计页面增强 (会话 73ab0bd6, 056e2013)
  - 状态栏全局移除 (会话 09fe75f4, 63e55aba)
  - Geek 风格统一 (会话 5d448a55, 2554c9d6)

#### 3. 文档更新 📝
- **新增**: 代码质量分析报告 (`code_quality_report.md`)
- **新增**: 已完成功能总结 (`completed_features_summary.md`)
- **更新**: `TODO.md` 移除 extract-icon API 任务
- **更新**: 任务统计 (13 → 12 项)

**下一步建议**:
1. 实施模块日志系统 PRD (P0)
2. 托盘系统优化 (P1)
3. 日志国际化改造
4. 清理高频 console.log

---

## 2025-11-20

### 完成: PRD清理与功能归档

**变更类型**: 文档整理

**已完成功能归档**:

#### 1. 搜索排序系统优化 ✅
- **来源**: `search-source-id-ranking-plan.md` + `search-optimization-implementation-summary.md`
- **核心成果**:
  - 实现 `source.id + item.id` 组合键统计
  - 新增 `item_usage_stats` 表,支持 search/execute/cancel 三种行为计数
  - 排序公式优化: `score = weight * 1e6 + match * 1e4 + recency * 1e2 + (executeCount*1 + searchCount*0.3 + cancelCount*(-0.5)) * exp(-0.1*days)`
  - 添加索引 `idx_item_usage_source_type`, `idx_item_usage_updated`
  - 实现 `QueryCompletionService` 查询补全系统
  - 实现 `UsageSummaryService` 定期汇总与清理
  - 批量查询优化,避免N+1问题
- **性能提升**: 查询耗时 5-10ms (P95), 排序更智能, 命中率>70%
- **迁移**: 0007_remarkable_silver_sable.sql

#### 2. 使用数据记录与清理 ✅
- **来源**: `USAGE_LOGGING_PLAN.md` + `TUFF_USAGE_TRACKING_PRD.md` + `search-usage-data-cleanup-plan.md`
- **核心成果**:
  - `usage_logs` 表记录所有搜索/执行行为
  - 自动清理过期日志(默认30天)
  - 定期汇总到 `item_usage_stats`
  - 异步写入不阻塞搜索流程

#### 3. 插件存储机制调研 ✅
- **来源**: `plugin-storage-research.md`
- **核心成果**:
  - 调研 Raycast/uTools/HapiGo 存储方案
  - 确定采用 JSON 文件 + 异步 Promise API
  - 每插件10MB限制,自动隔离
  - 实现 `StorageModule` 统一管理

#### 4. 下载中心系统 ✅
- **来源**: `DOWNLOAD_CENTER_API.md` + `UPDATE_SYSTEM.md` + `MIGRATION_GUIDE.md`
- **核心成果**:
  - 统一下载中心模块,支持切片下载、断点续传
  - 智能优先级调度(P0-P10)
  - 网络自适应并发控制(1-10)
  - SHA256校验、错误重试、进度节流
  - 完整的迁移系统,支持从旧系统无缝迁移
  - 更新系统集成,自动下载应用更新
- **性能优化**: 虚拟滚动(>50项)、数据库索引、任务缓存
- **文件位置**: `apps/core-app/src/main/modules/download/`

#### 5. 性能优化实施 ✅
- **来源**: `PERFORMANCE_OPTIMIZATIONS.md`
- **核心成果**:
  - 数据库索引优化(status/created/priority)
  - 虚拟滚动组件(VirtualTaskList.vue)
  - 搜索防抖(300ms)
  - 进度更新节流(1秒/任务)
  - 性能监控器(PerformanceMonitor)
- **性能提升**:
  - 500项列表渲染: 200ms → 20ms (10x)
  - 搜索响应: 150ms → 30ms (5x)
  - 数据库查询: 50-100ms → 5-10ms (5-10x)

#### 6. 更新提示UI实现 ✅
- **来源**: `UPDATE_PROMPT_IMPLEMENTATION.md` + `UPDATE_PROMPT_DIALOG.md`
- **核心成果**:
  - UpdatePromptDialog 组件
  - 支持RELEASE/BETA/SNAPSHOT频道
  - 自动下载、忽略版本、手动检查
  - 集成下载中心显示进度

#### 7. CoreBox Completion 分析 ✅
- **来源**: `corebox-completion-analysis.md`
- **核心成果**:
  - 识别性能、准确性、安全性问题
  - 提出缓存、智能权重、上下文感知改进方向
  - XSS安全修复建议

#### 8. 系统性架构分析 ✅
- **来源**: `PROJECT_ANALYSIS.md`
- **核心成果**:
  - 识别优势: 模块化架构、插件系统、IPC通道、tfile://协议
  - 识别不足: 插件加载死循环、日志混乱、托盘功能薄弱
  - 技术债务清单与优先级建议
  - 内容已整合到 `CLAUDE.md`

**删除文件**:
- `plan-prd/01-project/PROJECT_ANALYSIS.md`
- `plan-prd/03-features/search/search-source-id-ranking-plan.md`
- `plan-prd/03-features/search/search-optimization-implementation-summary.md`
- `plan-prd/03-features/search/USAGE_LOGGING_PLAN.md`
- `plan-prd/03-features/search/TUFF_USAGE_TRACKING_PRD.md`
- `plan-prd/03-features/search/search-usage-data-cleanup-plan.md`
- `plan-prd/03-features/plugin/plugin-storage-research.md`
- `plan-prd/04-implementation/corebox-completion-analysis.md`
- `plan-prd/04-implementation/components/UPDATE_PROMPT_*.md` (2个)
- `plan-prd/05-archive/*` (README_ANALYSIS.md, PRD-CLEANUP-REPORT.md, plan.md)

**影响**:
- PRD文件从35个减少到23个
- 已完成功能有明确历史记录
- 聚焦未实现的核心功能规划

---

## 2025-11-14

### 新增: 直接预览计算能力 PRD

**变更类型**: 文档/规划

**描述**:
- 新增 `plan-prd/direct-preview-calculation-prd.md`，定义搜索框直接预览计算的背景、范围、技术方案与里程碑。
- 将该能力纳入 PRD 索引的 P1 重要优化列表，并更新总 PRD 统计（17 个）。
- 补充 `plan-prd/README.md` 中的工期估算（新增 6-10 天）与整体工期区间。
- 新增「计算历史」保留策略（30 天 / 500 条）、单箭头入口、复用剪贴板历史（source 字段）方案。
- 扩展能力范围：新增颜色解析（HEX/RGB/HSL 互转 + 色块预览）与 ColorEngine 组件说明。

**修改文件**:
- `plan-prd/direct-preview-calculation-prd.md`
- `plan-prd/README.md`
- `plan-prd/CHANGES.md`

**影响**:
- 搜索体验有了明确的“直接预览计算”建设路线，可与插件搜索结果解耦，后续开发优先级明确。
- PRD 指标统计保持最新，方便规划人力。

---

# 2026-01-XX

### Analytics: Nexus 统计扩展与隐私约束

**变更类型**: 功能增强 + 隐私改进

**描述**: Nexus 分析面板新增搜索/执行细分指标与模块耗时可视化，同时强制不采集搜索词。

**主要变更**:
1. **隐私**:
   - 关闭搜索词采集与展示，仅保留长度/类型/耗时等聚合数据
2. **Nexus 指标扩展**:
   - 搜索场景/输入类型/Provider 分布
   - 平均排序耗时、平均结果数、平均执行延迟
3. **模块耗时**:
   - 统计模块加载耗时（avg/max/min/ratio）并可视化
4. **UI 优化**:
   - 二级 Breakdown Drawer 收纳细分分布

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
- `apps/nexus/server/utils/telemetryStore.ts`
- `apps/nexus/app/pages/dashboard/admin/analytics.vue`
- `docs/analytics-data-prd.md`

---

## 2025-01-XX

### 清理: 移除冗余的窗口关闭处理代码

**变更类型**: 清理/重构

**描述**:
- 移除了 `TouchApp` 中冗余的 `_setupWindowCloseHandler()` 方法
- 窗口关闭事件处理已由 `TrayManager` 模块统一管理（在 `registerWindowEvents()` 方法中）
- 清理了相关的注释和代码

**修改文件**:
- `apps/core-app/src/main/core/touch-app.ts`: 移除 `_setupWindowCloseHandler` 方法和相关调用

**技术细节**:
- 窗口关闭到托盘功能现在完全由 Tray 模块负责：
  - `TrayManager.registerWindowEvents()` 方法处理窗口关闭事件
  - 根据 `closeToTray` 配置决定是否最小化到托盘
  - 避免了代码重复和维护问题

**影响**:
- 代码结构更清晰，职责分离更明确
- 消除了代码重复和潜在的维护问题

---

## 2025-01-XX

### 修复: TypeScript 编译错误

**变更类型**: Bug 修复

**描述**: 修复了构建过程中的所有 TypeScript 类型错误

**主要修复**:
1. **未使用的声明 (TS6133)**:
   - 移除了未使用的导入（`path`, `fs`, `ModuleDestroyContext`）
   - 移除了未使用的私有方法（`_syncFileFromDevServer`）
   - 修复了未使用参数的警告

2. **类型不匹配 (TS2322)**:
   - 修复了 `Primitive` 类型错误（将 `unknown` 转换为 `string`）
   - 修复了 icon 类型错误（`'base64'` → `'url'`，字符串 → `ITuffIcon` 对象）
   - 修复了 `boolean | undefined` 类型问题

3. **属性不存在 (TS2339)**:
   - 修复了 `DevServerHealthCheckResult.data` 属性移除
   - 修复了 `ITouchPlugin._windows` 访问（使用类型断言）

4. **导入错误 (TS2304)**:
   - 修复了 `useAuthState.ts` 中缺少 `computed` 导入
   - 修复了 `useAuthConfig.ts` 中环境变量类型问题

5. **参数类型错误 (TS2345)**:
   - 修复了事件处理器类型，使用 `ITouchEvent` 基类并类型断言

**修改文件**:
- `apps/core-app/src/main/modules/analytics/startup-analytics.ts`
- `apps/core-app/src/main/modules/plugin/dev-server-monitor.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/search-processing-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/utils.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/providers/clipboard.ts`
- `apps/core-app/src/main/modules/tray/tray-manager.ts`
- `apps/core-app/src/main/service/failed-files-cleanup-task.ts`
- `packages/utils/core-box/builder/tuff-builder.ts`
- `packages/utils/search/types.ts`
- `packages/utils/auth/useAuthState.ts`
- `packages/utils/auth/useAuthConfig.ts`

**影响**: 项目现在可以通过 TypeScript 类型检查，构建流程正常

---

## 2025-01-XX

### 优化: GitHub Actions 构建发布流程

**变更类型**: 工作流优化

**描述**: 简化了构建发布流程，移除了手动触发时的版本号和标签创建

**主要变更**:
1. **简化手动触发**:
   - 移除了 `version` 输入字段
   - 移除了手动触发时的 Git 标签创建步骤
   - 手动触发时直接构建，不处理版本号

2. **标签触发优化**:
   - 保留标签推送触发机制（使用 bumpp 打好的标签自动触发）
   - 从标签自动提取版本号并更新 package.json

**修改文件**:
- `.github/workflows/build-and-release.yml`

**新的工作流程**:
- **方式 1**: 使用 `bumpp` 打标签后自动触发构建和发布
- **方式 2**: 手动触发构建（不创建标签，直接构建并创建 draft Release）

**影响**: 构建流程更简洁，符合团队工作流

---
