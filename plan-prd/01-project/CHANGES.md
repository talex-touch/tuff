# 变更日志

> 记录项目的重大变更和改进

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
