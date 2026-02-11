# 变更日志

> 记录项目的重大变更和改进

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
   - 修复了 `useClerkConfig.ts` 中环境变量类型问题

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
- `packages/utils/auth/useClerkConfig.ts`

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
