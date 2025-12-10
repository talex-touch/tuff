# Tuff 项目待办事项

> 从 PRD 文档中提炼的未完成任务清单
> 更新时间: 2025-12-10

---

## 🔴 P0 紧急任务

### 模块日志系统
**来源**: `plan-prd/02-architecture/module-logging-system-prd.md`
**工期**: 8-11 天

- [ ] **Phase 1**: 核心实现 (2-3天)
  - [ ] 实现 LogLevel 枚举
  - [ ] 实现 ModuleLogger 类 (debug/info/warn/error)
  - [ ] 实现 LoggerManager 单例
  - [ ] 配置读取/保存到 app-setting.ini
  - [ ] 导出到 @talex-touch/utils

- [ ] **Phase 2**: 迁移 SearchEngine (1-2天)
  - [ ] 迁移 search-core.ts
  - [ ] 迁移 search-gatherer.ts
  - [ ] 保留 searchLogger 特殊功能

- [ ] **Phase 3**: 迁移 Provider (1天)
  - [ ] FileProvider
  - [ ] AppProvider
  - [ ] PluginFeaturesAdapter

- [ ] **Phase 4**: 迁移核心模块 (2-3天)
  - [ ] DatabaseModule
  - [ ] StorageModule
  - [ ] PluginModule
  - [ ] ChannelCore

- [ ] **Phase 5**: UI 配置界面 (2天) - 可选
  - [ ] 设计配置页面
  - [ ] 模块列表展示
  - [ ] 单个模块开关/级别控制

**验收标准**:
- 90% 核心模块使用统一 Logger
- 日志禁用时性能开销 < 1%
- 配置修改 < 100ms 生效

---

## 🟡 P1 重要任务

### 1. ✅ 托盘系统优化 (v2.4.7) - TrayManager 完整实现，9个菜单项 + i18n + macOS Template 图标

---

### 2. 插件市场多源支持 🟡 进行中
**来源**: `plan-prd/03-features/plugin/plugin-market-provider-frontend-plan.md`
**工期**: 5.5 天

- [x] 类型与默认源 (0.5d)
- [x] Provider Registry & Storage (1d)
- [x] Provider 实现 - 官方 TpexApiProvider (1d)
- [x] Provider 实现 - NexusStoreProvider (1d)
- [x] UI 集成 - Market 页面 + Source Editor (1d)
- [ ] 扩展 Provider - NPM (npm-package-provider.ts) - 未实现
- [ ] 扩展 Provider - GitHub/Gitee (repository-provider.ts) - 未实现
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

### 3. View Mode 与开发模式增强
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
  - [ ] Dev Server 健康探测机制
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

- [ ] **Phase 2**: 汇率 + 日期时间 (待实现)
  - [ ] FxRateProvider (ECB API)
  - [ ] TimeEngine (luxon)

**已实现文件**:
- `calculation-service.ts` - 主服务
- `expression-evaluator.ts` - mathjs 表达式计算
- `unit-converter.ts` - 单位换算
- `unit-registry.json` - 单位定义

---

## 🟢 P2 增强任务

### 1. ✅ Widget 动态加载 (v2.4.7) - 核心完成
**来源**: `plan-prd/03-features/plugin/widget-dynamic-loading-plan.md`
**工期**: 8-12 天 → **已完成核心功能**

- [x] Internal Widget 流程梳理
- [x] WidgetLoader 运行时概览
- [x] WidgetCompiler (@vue/compiler-sfc + esbuild)
- [x] WidgetManager (chokidar 监听 + 缓存)
- [x] IPC 通道 (plugin:widget:register/update/unregister)
- [x] 渲染器注册 (widget-registry.ts)
- [ ] Dev 模式与远程源码 (待完善)

**已实现文件**:
- `widget-loader.ts` - 源码加载与缓存
- `widget-compiler.ts` - Vue SFC 编译
- `widget-manager.ts` - 生命周期管理
- `widget-registry.ts` (renderer) - 动态组件注册

---

### 2. ✅ Flow Transfer (v2.4.7) - FlowBus 核心调度 + 原生 Share + onFlowTransfer 适配检测，UI 面板待完善

---

### 3. ✅ DivisionBox 深化 (v2.4.7) - Manager + Session + LRU 缓存 + SDK

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
- [ ] 观测 & 计费 (进行中)
- [ ] Demo & 文档

---

### 3. Intelligence Agents 系统
**来源**: `plan-prd/02-architecture/intelligence-agents-system-prd.md`
**工期**: 15-25 天

- [ ] **Phase 1**: 基础框架 (v2.5.0)
  - [ ] 代理注册系统
  - [ ] 基础代理类型
  - [ ] 任务调度器
  - [ ] 与现有 IntelligenceSDK 集成

- [ ] **Phase 2**: 核心代理 (v2.6.0)
  - [ ] 文件管理代理
  - [ ] 搜索增强代理
  - [ ] 数据处理代理

- [ ] **Phase 3**: 高级功能 (v2.7.0)
  - [ ] 工作流编辑器
  - [ ] 用户自定义代理

**验收标准**:
- 代理执行成功率 > 95%
- 任务完成时间优化 50%
- 代理响应时间 < 2秒

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
| P0 紧急 | 1 | 0 | 1 | 待启动 |
| P1 重要 | 4 | 2 | 2 | 托盘+计算完成, 插件市场进行中 |
| P2 增强 | 6 | 4 | 2 | Widget+Flow+Division+推荐完成 |
| P3 长期 | 3 | 1 | 2 | Intelligence SDK 核心完成 |
| **总计** | **14** | **7** | **7** | **50% 完成** |

---

## 🎯 建议实施顺序 (更新)

### Q1 2026 (1-3月)
1. 模块日志系统 (P0)
2. 插件市场多源 (P1) - NPM/GitHub Provider 待实现
3. View Mode 增强 (P1)

### Q2 2026 (4-6月)
4. 多视图并行 (P2)
5. AttachUIView 缓存 (P2)
6. Intelligence 观测 & 计费 (P3)

### 已完成 ✅
- ~~托盘系统优化 (P1)~~ - 2025-12
- ~~Flow Transfer (P2)~~ - 2025-12
- ~~DivisionBox 深化 (P2)~~ - 2025-12
- ~~智能推荐系统 (P2)~~ - 2025-12
- ~~Nexus 联动 + Clerk 登录优化 (P1)~~ - 2025-12-09
- ~~直接预览计算 (P1)~~ - 2025-12-10 (核心完成)
- ~~Widget 动态加载 (P2)~~ - 2025-12-10 (核心完成)
- ~~Intelligence SDK (P3)~~ - 2025-12-10 (核心完成)

### Q4 2026 (10-12月)
7. 平台能力体系 (P3)
8. Intelligence Agents 系统 (P3)

---

**文档版本**: v1.3
**更新时间**: 2025-12-10
**维护者**: Development Team
