# 文档迁移总结

> 2024-11-17 文档整理与迁移记录

## 📋 迁移概览

本次迁移将散落在代码各处的 Markdown 文档统一整理到 `plan-prd/` 目录，建立清晰的文档索引结构。

## 🎯 迁移目标

1. ✅ 集中管理所有项目文档
2. ✅ 建立清晰的文档分类体系
3. ✅ 保持代码与文档的关联
4. ✅ 归档过时文档
5. ✅ 创建文档索引和导航

## 📦 迁移内容

### 从代码目录迁移的文档

#### 搜索引擎模块
**源位置**: `apps/core-app/src/main/modules/box-tool/search-engine/`

| 原文件 | 新位置 | 说明 |
|--------|--------|------|
| `TUFF_USAGE_TRACKING_PRD.md` | `03-features/search/TUFF_USAGE_TRACKING_PRD.md` | 使用跟踪 PRD |
| `USAGE_LOGGING_PLAN.md` | `03-features/search/USAGE_LOGGING_PLAN.md` | 日志记录计划 |

**代码链接**: 创建 `README.md` 指向新位置

#### 下载中心模块
**源位置**: `apps/core-app/src/main/modules/download/`

| 原文件 | 新位置 | 说明 |
|--------|--------|------|
| `API.md` | `03-features/download-update/DOWNLOAD_CENTER_API.md` | API 文档 |
| `MIGRATION_GUIDE.md` | `03-features/download-update/MIGRATION_GUIDE.md` | 迁移指南 |
| `PERFORMANCE_OPTIMIZATIONS.md` | `04-implementation/performance/PERFORMANCE_OPTIMIZATIONS.md` | 性能优化 |
| `PERFORMANCE_QUICK_REFERENCE.md` | `04-implementation/performance/PERFORMANCE_QUICK_REFERENCE.md` | 性能快速参考 |
| `PROGRESS_TRACKER_USAGE.md` | `04-implementation/performance/PROGRESS_TRACKER_USAGE.md` | 进度跟踪 |

**代码链接**: 创建 `README.md` 指向新位置

#### 更新系统模块
**源位置**: `apps/core-app/src/main/modules/update/`

| 原文件 | 新位置 | 说明 |
|--------|--------|------|
| `README.md` | `03-features/download-update/UPDATE_SYSTEM.md` | 更新系统文档 |

**代码链接**: 创建 `DOCS.md` 指向新位置

#### 下载 UI 组件
**源位置**: `apps/core-app/src/renderer/src/components/download/`

| 原文件 | 新位置 | 说明 |
|--------|--------|------|
| `IMPLEMENTATION_SUMMARY.md` | `04-implementation/components/UPDATE_PROMPT_IMPLEMENTATION.md` | 实现总结 |
| `UpdatePromptDialog.README.md` | `04-implementation/components/UPDATE_PROMPT_DIALOG.md` | 组件文档 |
| `UpdatePromptDialog.VISUAL.md` | ❌ 保留原位 | 视觉参考（组件专属） |

**代码链接**: 创建 `DOCS.md` 指向新位置

#### 其他模块文档
**保持原位**（工具生成或模块专属）:
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/README.md` - Hooks 使用文档
- `apps/core-app/src/renderer/src/modules/lang/I18N_IMPLEMENTATION.md` - i18n 实现
- `apps/core-app/src/renderer/src/modules/storage/README.md` - 存储模块文档

### plan-prd 内部重组

#### 移动到新分类

| 原文件 | 新位置 | 分类 |
|--------|--------|------|
| `search-optimization-implementation-summary.md` | `03-features/search/` | 搜索功能 |
| `search-source-id-ranking-plan.md` | `03-features/search/` | 搜索功能 |
| `search-usage-data-cleanup-plan.md` | `03-features/search/` | 搜索功能 |
| `view-mode-prd.md` | `03-features/view/` | 视图功能 |
| `multi-attach-view-prd.md` | `03-features/view/` | 视图功能 |
| `attach-view-cache-prd.md` | `03-features/view/` | 视图功能 |
| `plugin-loading-refactor.md` | `03-features/plugin/` | 插件系统 |
| `plugin-storage-research.md` | `03-features/plugin/` | 插件系统 |
| `build-integrity-verification-prd.md` | `03-features/build/` | 构建系统 |
| `build-signature-system-prd.md` | `03-features/build/` | 构建系统 |
| `direct-preview-calculation-prd.md` | `04-implementation/performance/` | 性能优化 |
| `division-box-prd.md` | `03-features/` | 功能 PRD |
| `flow-transfer-prd.md` | `03-features/` | 功能 PRD |
| `platform-capabilities-prd.md` | `02-architecture/` | 架构设计 |
| `ai-power-generic-api-prd.md` | `02-architecture/` | 架构设计 |
| `module-logging-system-prd.md` | `02-architecture/` | 架构设计 |
| `PROJECT_ANALYSIS.md` | `01-project/` | 项目文档 |
| `CHANGES.md` | `01-project/` | 项目文档 |
| `CALENDAR-PRD.md` | `01-project/` | 项目文档 |
| `DESIGN_IMPROVEMENTS.md` | `01-project/` | 项目文档 |

#### 归档文档

| 原文件 | 新位置 | 原因 |
|--------|--------|------|
| `plan.md` | `05-archive/` | 旧计划文档 |
| `README_ANALYSIS.md` | `05-archive/` | 临时分析文档 |
| `PRD-CLEANUP-REPORT.md` | `05-archive/` | 清理报告 |

## 📁 新目录结构

```
plan-prd/
├── 01-project/              # 项目级文档 (4 个)
├── 02-architecture/         # 架构设计 (3 个)
├── 03-features/             # 功能 PRD (20+ 个)
│   ├── search/              # 搜索 (5 个)
│   ├── download-update/     # 下载更新 (3 个)
│   ├── view/                # 视图 (3 个)
│   ├── plugin/              # 插件 (2 个)
│   ├── build/               # 构建 (2 个)
│   └── ...                  # 其他功能
├── 04-implementation/       # 实现细节 (7 个)
│   ├── performance/         # 性能 (4 个)
│   └── components/          # 组件 (2 个)
├── 05-archive/              # 归档 (3 个)
├── PROJECT_DOCS_INDEX.md    # 详细索引
├── README.md                # 主索引
└── MIGRATION_SUMMARY.md     # 本文件
```

## 🔗 代码链接文件

为保持代码与文档的关联，在原代码位置创建了链接文件：

| 位置 | 文件 | 作用 |
|------|------|------|
| `apps/core-app/src/main/modules/download/` | `README.md` | 指向下载中心文档 |
| `apps/core-app/src/main/modules/update/` | `DOCS.md` | 指向更新系统文档 |
| `apps/core-app/src/main/modules/box-tool/search-engine/` | `README.md` | 指向搜索引擎文档 |
| `apps/core-app/src/renderer/src/components/download/` | `DOCS.md` | 指向下载 UI 文档 |

## ✅ 完成的工作

1. ✅ 创建新的目录结构
2. ✅ 迁移代码内嵌文档到 plan-prd
3. ✅ 重组 plan-prd 内部文档
4. ✅ 归档过时文档
5. ✅ 创建代码链接文件
6. ✅ 更新主索引 README.md
7. ✅ 创建迁移总结文档

## 📊 统计数据

### 迁移文档数量
- **从代码迁移**: 10 个文件
- **内部重组**: 20+ 个文件
- **归档**: 3 个文件
- **新建链接**: 4 个文件

### 文档分布
- **项目文档**: 4 个
- **架构文档**: 3 个
- **功能 PRD**: 20+ 个
- **实现指南**: 7 个
- **归档文档**: 3 个

### 保留原位的文档
- **apps/docs/**: 30+ 个（文档站点）
- **插件 README**: 3 个（插件专属）
- **模块 README**: 3 个（模块专属）
- **.kiro/specs/**: 15+ 个（工具生成）
- **.serena/memories/**: 4 个（工具生成）

## 🎯 后续维护

### 文档更新规范
1. 新增功能文档放入对应的 `03-features/` 子目录
2. 实现细节文档放入 `04-implementation/`
3. 架构变更文档放入 `02-architecture/`
4. 及时更新 README.md 索引

### 代码同步
1. 代码重构时同步更新文档
2. 新增模块时创建对应文档
3. 保持代码链接文件的准确性

### 定期清理
1. 每季度检查文档时效性
2. 归档过时文档
3. 更新索引和导航

## 🔍 查找文档

### 按功能查找
- 搜索相关: `03-features/search/`
- 下载更新: `03-features/download-update/`
- 视图功能: `03-features/view/`
- 插件系统: `03-features/plugin/`

### 按类型查找
- PRD 文档: `03-features/`
- 实现指南: `04-implementation/`
- 架构设计: `02-architecture/`
- 项目文档: `01-project/`

### 全局搜索
使用 IDE 在 `plan-prd/` 目录下搜索关键词

## 📝 注意事项

1. **不要删除原文件**（已迁移的除外），保持 git 历史
2. **代码链接文件**使用相对路径，确保跨平台兼容
3. **文档内链接**需要更新为新路径
4. **保留原位文档**有其特殊原因，不要随意迁移

## 🎉 迁移成果

- ✅ 文档集中管理，易于查找
- ✅ 清晰的分类体系
- ✅ 代码与文档保持关联
- ✅ 过时文档已归档
- ✅ 完整的索引和导航

---

**迁移日期**: 2024-11-17
**执行者**: Kiro AI Assistant
**审核者**: 待审核
