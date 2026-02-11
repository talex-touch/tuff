# Tuff 项目待办事项

> 从 PRD 文档中提炼的未完成任务清单
> 更新时间: 2026-02-10

---

## 📊 PRD 状态总览

| 状态 | 数量 | 说明 |
|------|------|------|
| ✅ 已完成 | 15 | 可归档或精简 |
| 🟡 进行中 | 6 | 部分实现 |
| 📝 待实现 | 2 | 规划中 |
| 📁 参考文档 | 6 | 指南/参考 |

---

## 🧭 Plan 目录对照（2026-01）

> 来源：`plan/` 目录。此处记录与实际落地的差距与后续待办。

### ✅ 已落地
- [x] 内部下载任务隐藏与通知抑制（`plan/2026-01-21_13-25-11-download-internal-visibility.md`）
- [x] TouchSDK/Window 示例迁移到 hooks（`plan/2026-01-20_18-50-26-touchsdk-window-hooks-migration.md`）
- [x] App Indexing 启动补漏 + 周期全量对比（`plan/planprd-app-indexing.md`）
- [x] Tuffex 组件 3/4/5/7/8（实现/测试/文档）（`plan/2026-01-20_21-16-53-tuffex-components-34578.md`）
- [x] Config Storage 上下文整理与策略文档（`plan/2026-01-20_18-55-03-context-requirements.md`、`plan/2026-01-20_18-47-35-config-storage-sqlite-json-sync.md`）

### 🟡 部分完成
- [ ] Config Storage SQLite/JSON 统一落地（pilot key 已落地，迁移/回滚/双写策略待补）（`plan/2026-01-20_18-47-54-config-storage-sqlite-json-sync.md`）
- [ ] SearchLogger 延迟初始化已修复，测试与验证补齐（`plan/2026-01-21_13-39-30-basemodule-lifecycle-analysis.md`）
- [ ] Nexus Examples 入口已落地，但“单一来源”策略未统一（`plan/2026-01-21_13-22-14-nexus-examples-section.md`）
- [ ] Transport MessagePort 支持已在 SDK 落地，业务高频通道迁移待推进（`plan/2026-01-21_03-01-57-transport-message-port.md`）
- [ ] TuffTransport 全量迁移与 async 任务模型，清理 sendSync（renderer 仍保留旧 Channel）（`plan/2026-01-21_01-29-05-transport-migration-async.md`）
- [ ] CLI refine：主流程已实现，`tuff validate` 与 manifest 校验待补（`plan/2026-01-20_18-48-52-plugin-cli-refine.md`）

### 🧰 Tuff CLI 分包与迁移
- [ ] 抽出 `@talex-touch/tuff-cli-core`（core/types 迁移与依赖关系整理）（`docs/plan-prd/06-ecosystem/TUFFCLI-SPLIT-PLAN.md`）
- [ ] 新建 `@talex-touch/tuff-cli` 接管 `tuff` bin（旧包保留 shim + 提示迁移）
- [ ] 兼容包 `@talex-touch/tuffcli` 对外导出 `defineConfig`/types（对齐 PRD 示例）
- [ ] 文档与示例统一新包名（PRD + Nexus docs + README）
- [ ] CLI 回归验证：help/create/build/dev/publish + dry-run

---

## 🧩 2026-02 新增进展

### ✅ 已落地
- [x] **CoreBox 内置能力抽离为 7 个独立插件**
  - `touch-browser-open`、`touch-browser-bookmarks`、`touch-quick-actions`、`touch-window-presets`、`touch-workspace-scripts`、`touch-system-actions`、`touch-intelligence-actions`
  - 移除内置 URL 系统和内部 AI providers
  - 含测试 + Nexus 文档
- [x] **SDK 统一 Hard-Cut 批次 A~D**
  - Settings/Permission/Download/Cloud Sync/Channel → SDK Hooks 迁移
  - Typed Transport Domain SDKs + event payloads
- [x] **Nexus OAuth 稳定化**
  - sign-in callback 修复 + session/app auth guard 拆分
  - Turnstile + Passkey step-up flow
- [x] **更新系统增强**
  - reusable update tasks + 下载管理增强
- [x] **原生能力集成**
  - tuff-native workspace 包 + 构建接入
  - 本地系统 OCR provider
  - Everything SDK fallback chain + 后端诊断
- [x] **代码质量治理**
  - B+ 评级（`docs/engineering/reports/code-quality-2026-02-03.md`）
  - Safe handler wrappers for channel/download modules

### 🟡 进行中
- [ ] **SDK Hard-Cut 批次 E~F**：renderer 直连点清理
- [ ] **Intelligence 管理 UI**：Capabilities/Channels/AuditLogs 组件开发中

### 📝 待实现
- [ ] 文件系统/搜索范围权限收敛（默认不含用户目录，允许授权；区分 macOS/Windows 差异，尽量限制在 app 相关目录）（`plan/2026-01-22_10-00-00-file-search-scope-permission.md`）
- [ ] Perf Log 优化项：core-box:query 同步改造、/setting 路由拆分、tfile 路径兼容（`plan/2026-01-19_11-10-40-perf-log-analysis.md`）
- [ ] Nexus 首页内容整改与占位移除（`plan/2026-01-21_13-25-00-nexus-homepage-revamp.md`）
- [ ] Release Pipeline：OIDC + RSA + notes/assets 同步（`plan/planprd-release-pipeline.md`）

### ❓ 需人工确认
- [ ] Stash 弹出恢复处理（`plan/2026-01-20_21-17-14-stash-pop-recovery.md`）

### 📁 apps/core-app/plan 目录对照（2026-01）

> 来源：`apps/core-app/plan/` 目录。此处记录与实际落地的差距与后续待办。

#### ✅ 已落地
- [x] 需求汇总与执行顺序整合（统一需求文档已生成）（`apps/core-app/plan/2026-01-21_14-50-21-requirements-consolidation.md`）

#### 🟡 部分完成
- [ ] Script/Python/DLL 跨平台能力：已有文档与示例，未见代码实现（`apps/core-app/plan/2026-01-21_13-21-43-script-python-dll-cross-platform.md`）

#### 📝 待实现
- [ ] 自动更新方案梳理与落地（`apps/core-app/plan/2026-01-21_13-31-08-auto-update-plan.md`）

### ✅ 已完成 PRD (已归档到 `05-archive/`)
- `05-archive/plugin-loading-refactor.md` - 插件加载重构
- `02-architecture/intelligence-power-generic-api-prd.md` - Intelligence API (核心完成)
- `03-features/download-update/DOWNLOAD_CENTER_REFERENCE.md` - 下载中心
- `05-archive/widget-dynamic-loading-plan.md` - Widget 动态加载 (核心完成) ← 已归档
- `05-archive/permission-center-prd.md` - 权限中心 (Phase 1-4 完成) ← 已归档
- `05-archive/TUFF-TRANSPORT-PRD.md` - TuffTransport (已实现) ← 已归档
- `05-archive/SEARCH-DSL-PRD.md` - 搜索 DSL (已实现) ← 已归档
- `05-archive/NEXUS-TEAM-INVITE-PRD.md` - 团队邀请 (已落地) ← 已归档
- `05-archive/plugin-market-provider-frontend-plan.md` - 插件市场多源 (已落地) ← 已归档
- `05-archive/intelligent-recommendation-system-prd.md` - 智能推荐 (已落地) ← 已归档
- `05-archive/direct-preview-calculation-prd.md` - 直接预览计算 (已落地) ← 已归档

### 🟡 进行中 PRD
- `02-architecture/module-logging-system-prd.md` - 模块日志系统 (Phase 1-4 完成, SearchLogger 已集成)
- `03-features/flow-transfer-prd.md` - Flow Transfer (权限闭环已落地)
- `03-features/division-box-prd.md` - DivisionBox 深化 (生命周期事件对插件开放)
- `03-features/view/attach-view-cache-prd.md` - 缓存优化 (MVP 已落地)
- `03-features/view/view-mode-prd.md` - View Mode 增强 (部分实现)
- `02-architecture/intelligence-agents-system-prd.md` - Intelligence Agents (Phase 1-2 已落地，Phase 3 基础完成)
- `02-architecture/platform-capabilities-prd.md` - 平台能力体系 (能力目录 + 管理 UI 基础已落地)

### 📝 待实现 PRD
- `03-features/view/multi-attach-view-prd.md` - 多视图并行
- `03-features/build/build-signature-system-prd.md` - 构建签名

---

## 🔴 P0 紧急任务

### 🧩 TuffEx 迁移收尾（tuffex-ui -> tuffex）

- [ ] `packages/tuffex`：确保 `pnpm -C packages/tuffex build` 可跑通（Gulp + ts-node/esm）
- [ ] `packages/tuffex`：确保 `pnpm -C packages/tuffex docs:build` 可跑通
- [ ] `pnpm approve-builds`：如仍提示忽略 `less` 的 build scripts，在根目录执行并允许 `less`
- [ ] 全仓校验：grep 清理旧名（tuff-ui/tuffex-ui/touchx-ui）残留，确认无影响构建的引用
- [ ] 清理产物：确认 `packages/tuffex/**/node_modules` 与旧 `playground` 目录已删除（仓库内不提交）
- [ ] 提交变更：README/CONTRIBUTING/Nexus docs 链接更新 + createTestVue 删除 + 构建脚本修复
- [ ] 现有 ElMessageBox/ElMessage 等弹窗/提示统一迁移到目标组件方案，清点调用点并替换

### ✅ 模块日志系统 (v2.4.8) - Phase 1-4 核心完成
**来源**: `plan-prd/02-architecture/module-logging-system-prd.md`
**工期**: 8-11 天 → **Phase 1 已完成**

- [x] **Phase 1**: 核心实现 (2-3天) ✅ (2025-12-11)
  - [x] 实现 LogLevel 枚举 (`packages/utils/common/logger/types.ts`)
  - [x] 实现 ModuleLogger 类 (`packages/utils/common/logger/module-logger.ts`)
  - [x] 实现 LoggerManager 单例 (`packages/utils/common/logger/logger-manager.ts`)
  - [x] TuffTransportLogger 专用日志 (`packages/utils/common/logger/transport-logger.ts`)
  - [x] 导出到 @talex-touch/utils/common/logger

- [x] **Phase 2**: 迁移 SearchEngine (1-2天)
  - [x] 迁移 search-core.ts
  - [x] 迁移 search-gatherer.ts
  - [x] 保留 searchLogger 特殊功能

- [x] **Phase 3**: 迁移 Provider (1天)
  - [x] FileProvider
  - [x] AppProvider
  - [x] PluginFeaturesAdapter

- [x] **Phase 4**: 迁移核心模块 (2-3天)
  - [x] DatabaseModule
  - [x] StorageModule
  - [x] PluginModule
  - [x] ChannelCore

- [ ] **Phase 5**: UI 配置界面 (2天) - 可选
  - [ ] 设计配置页面
  - [ ] 模块列表展示
  - [ ] 单个模块开关/级别控制

**已实现文件**:
- `packages/utils/common/logger/types.ts` - LogLevel/类型定义
- `packages/utils/common/logger/module-logger.ts` - ModuleLogger 类
- `packages/utils/common/logger/logger-manager.ts` - LoggerManager 单例
- `packages/utils/common/logger/transport-logger.ts` - TuffTransport 专用日志
- `packages/utils/common/logger/index.ts` - 统一导出

**验收标准**:
- 90% 核心模块使用统一 Logger
- 日志禁用时性能开销 < 1%
- 配置修改 < 100ms 生效

---

## 🟡 P1 重要任务

### 1. ✅ 托盘系统优化 (v2.4.7) - TrayManager 完整实现，9个菜单项 + i18n + macOS Template 图标

### 1.1 🆕 Nexus Release 下载签名 URL (R2/S3)

- [ ] 下载端点支持生成对象存储 Signed URL 并 302 重定向（R2/S3 / R2 私有桶）
- [ ] 可配置签名有效期（默认 10-30 分钟）
- [ ] 本地/无绑定环境回退：直接返回二进制（已实现，作为 fallback）


---

### 2. 插件市场多源支持 🟡 进行中
**来源**: `plan-prd/03-features/plugin/plugin-market-provider-frontend-plan.md`
**工期**: 5.5 天

- [x] 类型与默认源 (0.5d)
- [x] Provider Registry & Storage (1d)
- [x] Provider 实现 - 官方 TpexApiProvider (1d)
- [x] Provider 实现 - NexusStoreProvider (1d)
- [x] UI 集成 - Market 页面 + Source Editor (1d)
- [x] 扩展 Provider - NPM (npm-package-provider.ts) ✅ (2025-12-10)
- [x] 扩展 Provider - GitHub/Gitee (repository-provider.ts) ✅ (2025-12-11)
- [x] NPM Provider 完整实现 ✅ (2025-12-11)
- [ ] 验收 & 文档 (0.5d)

#### 2.1 ✅ Nexus 联动与 Clerk 登录优化 (2025-12-09)
- [x] Nexus app-callback 页面 - 浏览器登录后回调到 App
- [x] tuff:// 协议处理 - addon-opener.ts 支持 auth/callback
- [x] useAuth.loginWithBrowser() - 外部浏览器登录方法
- [x] AuthTokenService - Clerk token 获取与缓存
- [x] TpexApiProvider.listUserPlugins() - 认证 API 支持
- [x] useUserPlugins composable - 获取用户插件列表
- [x] i18n 翻译 - en/zh 完整

---

### 3. 🆕 插件权限中心 (Permission Center) 🟡 进行中
**来源**: `plan-prd/03-features/plugin/permission-center-prd.md`
**工期**: 12-15 天

- [x] **Phase 1**: 基础框架 (3-4天) ✅ (2025-12-12)
  - [x] 权限类型定义 (`packages/utils/permission/types.ts`)
  - [x] PermissionRegistry 实现 (`packages/utils/permission/registry.ts`)
  - [x] PermissionStore 实现 (JSON 文件)
  - [x] PermissionModule 主进程模块
  - [x] i18n 国际化消息 (17 种权限 + UI 文案)

- [x] **Phase 2**: 运行时拦截 (2-3天) ✅ (2025-12-12)
  - [x] PermissionGuard 实现
  - [x] Channel 层集成拦截器 (withPermission wrapper)
  - [x] API-权限映射表 (20+ API 映射)

- [x] **Phase 3**: UI 集成 (3-4天) ✅ (2025-12-12)
  - [x] 运行时权限请求弹窗 (PermissionRequestDialog.vue)
  - [x] 权限列表组件 (PermissionList.vue)
  - [x] 权限状态卡片 (PermissionStatusCard.vue)
  - [x] 权限中心设置页面 (SettingPermission.vue)
  - [x] 审计日志查看 (PermissionStore + SettingPermission.vue)

- [x] **Phase 4**: SDK & Hooks (2天) ✅ (2025-12-12)
  - [x] usePermission hooks
  - [x] usePermissionStatus hooks
  - [x] usePermissionRegistry hooks
  - [x] 插件加载器权限解析

- [ ] **Phase 5**: 测试与优化 (2天)
  - [ ] SQLite 迁移与数据库脚本（PermissionStore 当前为 JSON）
  - [ ] 安装时权限确认弹窗

**已实现文件**:
- `packages/utils/permission/types.ts` - 权限类型定义
- `packages/utils/permission/registry.ts` - 17 种权限注册
- `packages/utils/permission/index.ts` - 核心函数
- `apps/core-app/src/main/modules/permission/index.ts` - PermissionModule
- `apps/core-app/src/main/modules/permission/permission-store.ts` - JSON 存储
- `apps/core-app/src/main/modules/permission/permission-guard.ts` - 运行时拦截
- `apps/core-app/src/main/modules/permission/channel-guard.ts` - Channel wrapper
- `packages/utils/renderer/hooks/use-permission.ts` - Vue hooks
- `components/permission/PermissionRequestDialog.vue` - 权限请求弹窗
- `components/permission/PermissionList.vue` - 权限列表组件
- `components/permission/PermissionStatusCard.vue` - 权限状态卡片
- `views/base/settings/SettingPermission.vue` - 权限中心设置页
- `composables/usePluginPermission.ts` - UI 层 composable

**验收标准**:
- ✅ 插件加载时解析 permissions 和 sdkapi
- ✅ 未声明 sdkapi 的插件报 issue 警告
- ✅ 低版本 sdkapi 的插件跳过权限校验但提示用户
- ✅ 运行时拦截框架 (withPermission wrapper)
- [x] 权限检查耗时 < 5ms（performance test: `apps/core-app/src/main/modules/permission/permission-guard.test.ts`）

---

### 4. View Mode 与开发模式增强
**来源**: `plan-prd/03-features/view/view-mode-prd.md`
**工期**: 10-15 天

- [ ] **Phase 1**: 结构拆分 (2天)
  - [ ] 拆分 plugin-core.ts

- [ ] **Phase 2**: 类型增强 (1天)
  - [ ] 增强 IPluginWebview (改为 Map)
  - [ ] 增强 IPluginDev (添加 source)
  - [ ] 扩展 PluginIssue (code/suggestion/timestamp)

- [ ] **Phase 3**: 核心改造 (4-5天)
  - [ ] 插件加载逻辑 - 远程 manifest 覆盖
  - [x] Dev Server 健康探测机制 ✅ (2025-12-11) - 断连通知而非关闭窗口
  - [ ] CoreBoxManager 安全 URL 构造
  - [ ] 协议限制 (生产环境禁止 http)
  - [ ] Hash 路由强制检查

- [ ] **Phase 4**: 配置插件 (2-3天)
  - [ ] touch-translation 插件 dev 配置
  - [ ] 添加"多源翻译" view feature

**验收标准**:
- view 模式在生产/调试/源码开发三种模式均正常
- Dev Server 断开能优雅处理
- 生产环境严格禁止 http 协议

---

### 4. ✅ 直接预览计算能力 (v2.4.7) - 核心完成
**来源**: `plan-prd/04-implementation/performance/direct-preview-calculation-prd.md`
**工期**: 14-20 天 → **已完成核心功能**

- [x] **Phase 1**: 表达式 + 单位换算
  - [x] CalculationService (Main)
  - [x] ExpressionEvaluator (mathjs)
  - [x] UnitRegistry + UnitConverter
  - [x] 查询识别正则
  - [x] PreviewCard 组件

- [x] **Phase 2**: 汇率 + 日期时间 ✅ (2025-12-10)
  - [x] FxRateProvider (ECB API + 备用源)
  - [x] TimeEngine (时区转换 + 时间计算)

**已实现文件**:
- `calculation-service.ts` - 主服务
- `expression-evaluator.ts` - mathjs 表达式计算
- `unit-converter.ts` - 单位换算
- `unit-registry.json` - 单位定义

---

## 🟢 P2 增强任务

### 1. ✅ Widget 动态加载 (v2.4.8) - 核心完成 + 多文件类型支持
**来源**: `plan-prd/03-features/plugin/widget-dynamic-loading-plan.md`
**工期**: 8-12 天 → **已完成核心功能**

- [x] Internal Widget 流程梳理
- [x] WidgetLoader 运行时概览
- [x] WidgetCompiler (@vue/compiler-sfc + esbuild)
- [x] WidgetManager (chokidar 监听 + 缓存)
- [x] IPC 通道 (plugin:widget:register/update/unregister)
- [x] 渲染器注册 (widget-registry.ts)
- [x] 多文件类型支持 ✅ (2025-12-11)
  - [x] WidgetTsxProcessor (.tsx, .jsx)
  - [x] WidgetScriptProcessor (.ts, .js)
- [ ] Dev 模式与远程源码 (待完善)

**已实现文件**:
- `widget-loader.ts` - 源码加载与缓存
- `widget-compiler.ts` - 统一编译入口
- `widget-manager.ts` - 生命周期管理
- `widget-registry.ts` (renderer) - 动态组件注册
- `processors/vue-processor.ts` - Vue SFC 处理器
- `processors/tsx-processor.ts` - TSX/JSX 处理器
- `processors/script-processor.ts` - TS/JS 处理器

---

### 2. ✅ Flow Transfer (v2.4.8) - 核心调度完成，权限/闭环完成

**新增功能** (2025-12-11):
- [x] ShareNotificationService - 系统分享操作反馈通知
- [x] 原生分享目标英文化 (System Share, AirDrop, Mail, Messages)
- [x] 分享结果自动通知 (clipboard, file revealed, airdrop ready 等)
- [x] 失败回退（fallback copy + detach rollback）

**已实现文件**:
- `flow-bus.ts` - 核心调度器
- `native-share.ts` - 原生分享服务
- `share-notification.ts` - 分享通知服务 ✨
- `target-registry.ts` - 目标注册表
- `session-manager.ts` - 会话管理器

**补充（IPC 迁移）**:
- ✅ Flow/DivisionBox IPC 全量迁移到 TuffTransport（renderer/main/plugin SDK），移除 legacy `flow:*`/`division-box:*`/`FlowIPCChannel`
- ✅ 验证：全仓 grep legacy 事件名为 0；`apps/core-app` `npm run typecheck` 通过

**待补**:
- [ ] 审计日志（会话历史/失败原因记录）
- [ ] 测试插件与开发文档补齐

---

### 3. 🟡 DivisionBox 深化 (v2.4.7) - 核心完成，生命周期开放待补

**补充（IPC 迁移）**:
- ✅ DivisionBox IPC 全量迁移到 TuffTransport（renderer/main），移除 legacy `division-box:*`
- ✅ 验证：全仓 grep legacy 事件名为 0；`apps/core-app` `npm run typecheck` 通过

**待补**:
- [x] 生命周期事件（prepare/attach/active/inactive/detach/destroy）对插件侧开放并统一进 SDK
- [ ] 与 FlowTransfer 的权限/触发入口对齐

---

### 4. 多视图并行共存
**来源**: `plan-prd/03-features/view/multi-attach-view-prd.md`
**工期**: 10-15 天

- [ ] **Phase 1**: 容器改造 (3-4天)
  - [ ] MultiViewHost 管理器
  - [ ] Map<panelId, AttachedView[]>

- [ ] **Phase 2**: 前端组件 (4-5天)
  - [ ] ViewDock 组件 (Tab/Split/Grid)
  - [ ] 拖拽交互
  - [ ] useDivisionBoxStore 多视图支持

- [ ] **Phase 3**: SDK 适配 (2-3天)
  - [ ] plugin.uiView.onFocusChange()
  - [ ] plugin.uiView.getLayout()
  - [ ] Manifest uiView.supportedLayouts

**验收标准**:
- 单 CoreBox 成功并行挂载 3 个视图
- 支持 3 种布局模式切换
- FPS ≥ 40

---

### 5. AttachUIView 缓存优化
**来源**: `plan-prd/03-features/view/attach-view-cache-prd.md`
**工期**: 10-12 天

- [ ] **Phase 1**: 使用数据采集 (2-3天)
  - [ ] 打通视图使用埋点
  - [ ] 建立 ViewUsageStore

- [ ] **Phase 2**: Score 模型 (2-3天)
  - [ ] 定时任务计算 ViewScore
  - [ ] 可视化指标

- [ ] **Phase 3**: 缓存管理器 (3-4天)
  - [ ] Hot/Warm/Cool 阶段实现
  - [ ] LRU 回收机制

- [ ] **Phase 4**: SDK 接口 (2天)
  - [ ] requestPreload() API
  - [ ] setCachePolicy()
  - [ ] onEvicted() 回调

**验收标准**:
- 缓存命中率 ≥ 70%
- 平均打开时延下降 ≥ 40%
- 高频视图打开 < 200ms

---

### 6. ✅ 智能推荐系统 (v2.4.7) - RecommendationEngine + 上下文感知 + 多样性算法

---

## 🔵 P3 长期规划

### 1. 平台能力体系
**来源**: `plan-prd/02-architecture/platform-capabilities-prd.md`
**工期**: 20-30 天

- [ ] 能力模型设计
- [ ] PlatformCoreService 实现
- [ ] SDK 封装 (platform.invoke)
- [ ] 管理 UI
- [ ] 数据与监控
- [ ] 文档与生态推广

---

### 2. Intelligence 能力泛化接口 ✅ 核心完成
**来源**: `plan-prd/02-architecture/intelligence-power-generic-api-prd.md`
**工期**: 15-20 天 → **已完成核心功能**

- [x] 能力描述体系 (IntelligenceCapabilityRegistry)
- [x] Provider 接入框架 (OpenAI/Anthropic/DeepSeek/Siliconflow/Local)
- [x] 策略引擎 (RuleBased/Adaptive)
- [x] SDK 封装 (intelligence.invoke)
- [x] 观测 & 计费 ✅ (2025-12-10)
  - [x] 审计日志记录 (`intelligence-audit-logger.ts`)
  - [x] 配额控制 (`intelligence-quota-manager.ts`)
  - [x] 用量统计聚合 (日/月维度)
  - [x] IPC 通道 (9 个)
  - [x] 导出功能 (CSV/JSON) ✅
  - [x] 用量统计 UI 图表 ✅ (2025-12-10)
- [x] Demo & 文档 ✅ (2025-12-10)
  - [x] SDK 使用文档 (`README.md`)
  - [x] Renderer Hooks (`useIntelligenceStats`)
  - [ ] 示例插件 (touch-intelligence-demo) - 可选

**已实现文件**:
- `intelligence-module.ts` - 主模块
- `intelligence-sdk.ts` - SDK 封装
- `intelligence-audit-logger.ts` - 审计日志 ✨
- `intelligence-quota-manager.ts` - 配额管理 ✨
- `README.md` - SDK 文档 ✨
- `intelligence-service.ts` - 服务层
- `intelligence-capability-registry.ts` - 能力注册
- `intelligence-strategy-manager.ts` - 策略管理
- `providers/` - 5 家供应商适配

**Renderer Hooks** (`@talex-touch/utils`):
- `useIntelligence` - AI 能力调用
- `useIntelligenceStats` - 审计/统计/配额 ✨

---

### 3. Intelligence Agents 系统 ✅ Phase 1+2 完成
**来源**: `plan-prd/02-architecture/intelligence-agents-system-prd.md`
**工期**: 23 天 → **Phase 1+2 已完成**

#### Phase 1: 基础框架 (v2.5.0) - 5天 ✅
- [x] **Day 1**: 类型定义 + AgentRegistry ✅
  - [x] `packages/utils/types/agent.ts` - 核心类型 (+300行)
  - [x] `modules/ai/agents/agent-registry.ts` - 智能体注册表
- [x] **Day 2**: AgentManager + Scheduler ✅
  - [x] `agent-manager.ts` - 智能体管理器
  - [x] `agent-scheduler.ts` - 任务调度器 (优先级队列)
- [x] **Day 3**: AgentExecutor + IntelligenceSDK 集成 ✅
  - [x] `agent-executor.ts` - 任务执行器
  - [x] LLM 调用封装 (system prompt 构建)
- [x] **Day 4**: ToolRegistry + 基础工具 ✅
  - [x] `tools/tool-registry.ts` - 工具注册
  - [x] `tools/file-tools.ts` - 8个文件操作工具
- [x] **Day 5**: IPC 通道 + 基础 UI ✅
  - [x] `agents:list`, `agents:execute`, `agents:cancel` 通道
  - [x] 智能体列表界面 (IntelligenceAgentsPage)

#### Phase 2: 核心智能体 (v2.6.0) - 8天 ✅
- [x] **Day 1-2**: FileAgent 完整实现 ✅
  - [x] 文件搜索与筛选
  - [x] 批量重命名
  - [x] 自动整理归档
  - [x] 重复文件检测
- [x] **Day 3-4**: SearchAgent ✅
  - [x] 智能搜索、语义搜索
  - [x] 搜索建议、结果排序
- [x] **Day 5-6**: DataAgent ✅
  - [x] 数据提取与转换
  - [x] JSON/CSV/YAML 互转
  - [x] 数据清洗与分析
- [x] **Day 7-8**: 智能体市场 API + 文档 ✅ (2025-12-10)
  - [x] AgentMarketService (搜索/安装/卸载)
  - [x] 8 个 IPC 通道
  - [x] useAgentMarket composable

#### Phase 3: 高级功能 (v2.7.0) - 10天
- [ ] **Day 1-3**: WorkflowAgent + 编辑器（WorkflowAgent 已落地，编辑器未完成）
- [ ] **Day 4-6**: 记忆系统 + 上下文管理（MemoryStore/ContextManager 已落地）
- [ ] **Day 7-8**: 用户自定义代理
- [ ] **Day 9-10**: 代理协作 + 测试

**验收标准**:
- 代理执行成功率 > 95%
- 任务完成时间优化 50%
- 代理响应时间 < 2秒

---

### 4. 下载中心 ✅ 已完成
**来源**: `plan-prd/03-features/download-update/DOWNLOAD_CENTER_REFERENCE.md`
**状态**: 核心功能已完成

**已实现功能**:
- [x] DownloadCenterModule - 主模块 (39KB)
- [x] TaskQueue - 最小堆优先级队列
- [x] ChunkManager - 切片下载 + 断点续传
- [x] DownloadWorker - 并发下载工作器
- [x] NetworkMonitor - 网络监控 + 自适应并发
- [x] ConcurrencyAdjuster - 并发调整器
- [x] MigrationManager - 数据迁移
- [x] NotificationService - 下载通知
- [x] ErrorLogger + RetryStrategy - 错误处理
- [x] ProgressTracker - 进度跟踪 + 节流
- [x] PriorityCalculator - 优先级计算

**待优化项** (P3):
- [ ] 下载中心 UI 美化
- [ ] 批量下载模板
- [ ] 下载速度限制配置

**代码位置**: `apps/core-app/src/main/modules/download/`

---

## 📝 已完成功能备注

> **2025-12 重大更新**: 8 项核心功能已完成
>
> - ✅ **托盘系统优化** - TrayManager 完整实现
> - ✅ **Flow Transfer 流转能力** - FlowBus 核心调度完成
> - ✅ **DivisionBox 深化** - Manager + LRU 缓存 + SDK
> - ✅ **智能推荐系统** - RecommendationEngine 上线
> - ✅ **直接预览计算** - 表达式 + 单位换算完成
> - ✅ **Widget 动态加载** - Loader + Compiler + Manager 完成
> - ✅ **Intelligence SDK** - 5 家 Provider + 策略引擎完成
> - ✅ **插件市场多源** - TpexApi + Nexus Provider 完成

> **2026-02 重大更新**: 6 项核心进展
>
> - ✅ **CoreBox 插件抽离** - 7 个内置能力独立为插件
> - ✅ **SDK 统一 Hard-Cut** - 批次 A~D 完成，Typed Transport SDKs
> - ✅ **Nexus OAuth 稳定化** - sign-in callback + auth guard 拆分
> - ✅ **更新系统增强** - reusable update tasks
> - ✅ **原生能力集成** - tuff-native + OCR + Everything SDK
> - ✅ **代码质量治理** - B+ 评级 + safe handler wrappers

> **2025-11 UI/UX 改进**: 完成 15+ 项页面重构与优化
>
> - 登录/个人资料/欢迎/打卡/统计页面重构
> - 全局极简黑白风格统一
> - 状态栏移除与导航优化
> - tfile:// 协议全面实施
> - 插件加载重构 (死循环修复) - 已归档

---

## 📊 任务统计

| 优先级 | 任务数 | 已完成 | 剩余 | 状态 |
|--------|--------|--------|------|------|
| P0 紧急 | 2 | 2 | 0 | 模块日志系统 Phase 1-4 + TuffEx 迁移收尾 |
| P1 重要 | 6 | 5 | 1 | 托盘+计算+NPM+权限中心+OAuth 完成, View Mode 剩余 |
| P2 增强 | 7 | 6 | 1 | 插件抽离+SDK Hard-Cut A~D+原生集成 完成 |
| P3 长期 | 5 | 4 | 1 | Intelligence Agents Phase 3 剩余 |
| **总计** | **20** | **17** | **3** | **85% 完成** |

---

## 🎯 建议实施顺序 (更新)

### Q1 2026 (1-3月)
1. ~~模块日志系统 (P0)~~ - ✅ Phase 1-4 完成
2. ~~插件权限中心 (P1)~~ - ✅ Phase 1-4 完成
3. ~~CoreBox 插件抽离 (P1)~~ - ✅ 7 个插件已落地
4. ~~SDK 统一 Hard-Cut A~D (P1)~~ - ✅ 已完成
5. ~~Nexus OAuth 稳定化 (P1)~~ - ✅ 已闭环
6. ~~更新系统增强 (P2)~~ - ✅ 已落地
7. View Mode 增强 (P1) - 10-15天 - 待推进
8. SDK Hard-Cut E~F (P1) - 进行中

### Q2 2026 (4-6月)
5. 多视图并行 (P2) - 10-15天
6. AttachUIView 缓存 (P2) - 10-12天
7. Intelligence 观测 & 计费 (P3) - 3-5天
8. Intelligence Agents Phase 2 (P3) - 8天

### Q3 2026 (7-9月)
9. 平台能力体系 (P3) - 20-30天
10. Intelligence Agents Phase 3 (P3) - 10天

### 已完成 ✅
- ~~托盘系统优化 (P1)~~ - 2025-12
- ~~Flow Transfer (P2)~~ - 2025-12
- ~~DivisionBox 深化 (P2)~~ - 2025-12
- ~~智能推荐系统 (P2)~~ - 2025-12
- ~~Nexus 联动 + Clerk 登录优化 (P1)~~ - 2025-12-09
- ~~直接预览计算 (P1)~~ - 2025-12-10 (核心完成)
- ~~Widget 动态加载 (P2)~~ - 2025-12-10 (核心完成)
- ~~Intelligence SDK (P3)~~ - 2025-12-10 (核心完成)
- ~~下载中心 (P3)~~ - 2025-12-10 (核心完成)
- ~~Intelligence Agents Phase 1+2 (P3)~~ - 2025-12-10
- ~~插件市场 NPM Provider (P1)~~ - 2025-12-10
- ~~汇率/时间计算引擎 (P1)~~ - 2025-12-10
- ~~模块日志系统 Phase 1 (P0)~~ - 2025-12-11 ✨ NEW
- ~~Widget 多文件类型支持 (P2)~~ - 2025-12-11 ✨ NEW
- ~~Flow Transfer 系统分享通知 (P2)~~ - 2025-12-11 ✨ NEW
- ~~Everything SDK 集成方案 (P3)~~ - 2025-12-11 ✨ NEW
- ~~插件 sdkapi 版本字段 (P1)~~ - 2025-12-12 ✨ NEW - 权限系统前置
- ~~插件权限中心 Phase 1+4 (P1)~~ - 2025-12-12 ✨ NEW - 基础框架 + Hooks
- ~~插件权限中心 Phase 2 (P1)~~ - 2025-12-12 ✨ NEW - 运行时拦截
- ~~插件权限中心 Phase 3 (P1)~~ - 2025-12-12 ✨ NEW - UI 集成
- ~~CoreBox 插件抽离 (P1)~~ - 2026-02 ✨ NEW - 7 个独立插件
- ~~SDK Hard-Cut A~D (P1)~~ - 2026-02 ✨ NEW - Transport SDK + Hooks
- ~~Nexus OAuth 稳定化 (P1)~~ - 2026-02 ✨ NEW - callback + auth guard
- ~~更新系统增强 (P2)~~ - 2026-02 ✨ NEW - reusable update tasks
- ~~原生能力集成 (P2)~~ - 2026-02 ✨ NEW - tuff-native + OCR + Everything
- ~~代码质量治理 (P2)~~ - 2026-02 ✨ NEW - B+ 评级

---

**文档版本**: v1.12
**更新时间**: 2026-02-10
**维护者**: Development Team
