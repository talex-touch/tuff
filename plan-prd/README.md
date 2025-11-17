# Talex Touch - 项目文档中心

> 统一的项目文档索引，包含所有 PRD、设计文档、实现指南

## 📂 文档结构

```
plan-prd/
├── 01-project/              # 项目级文档
│   ├── PROJECT_ANALYSIS.md  # 项目分析
│   ├── CHANGES.md           # 变更记录
│   ├── CALENDAR-PRD.md      # 开发排期
│   └── DESIGN_IMPROVEMENTS.md # 设计改进建议
│
├── 02-architecture/         # 架构设计
│   ├── platform-capabilities-prd.md
│   ├── ai-power-generic-api-prd.md
│   └── module-logging-system-prd.md
│
├── 03-features/             # 功能 PRD
│   ├── search/              # 搜索功能
│   │   ├── TUFF_USAGE_TRACKING_PRD.md
│   │   ├── USAGE_LOGGING_PLAN.md
│   │   ├── search-optimization-implementation-summary.md
│   │   ├── search-source-id-ranking-plan.md
│   │   └── search-usage-data-cleanup-plan.md
│   │
│   ├── download-update/     # 下载更新系统
│   │   ├── DOWNLOAD_CENTER_API.md
│   │   ├── MIGRATION_GUIDE.md
│   │   └── UPDATE_SYSTEM.md
│   │
│   ├── view/                # 视图功能
│   │   ├── view-mode-prd.md
│   │   ├── multi-attach-view-prd.md
│   │   └── attach-view-cache-prd.md
│   │
│   ├── plugin/              # 插件系统
│   │   ├── plugin-loading-refactor.md
│   │   └── plugin-storage-research.md
│   │
│   ├── build/               # 构建系统
│   │   ├── build-integrity-verification-prd.md
│   │   └── build-signature-system-prd.md
│   │
│   ├── division-box-prd.md
│   └── flow-transfer-prd.md
│
├── 04-implementation/       # 实现细节
│   ├── performance/         # 性能优化
│   │   ├── PERFORMANCE_OPTIMIZATIONS.md
│   │   ├── PERFORMANCE_QUICK_REFERENCE.md
│   │   ├── PROGRESS_TRACKER_USAGE.md
│   │   └── direct-preview-calculation-prd.md
│   │
│   └── components/          # 组件实现
│       ├── UPDATE_PROMPT_DIALOG.md
│       └── UPDATE_PROMPT_IMPLEMENTATION.md
│
├── 05-archive/              # 归档文档
│   ├── plan.md
│   ├── README_ANALYSIS.md
│   └── PRD-CLEANUP-REPORT.md
│
├── PROJECT_DOCS_INDEX.md    # 详细文档索引
└── README.md                # 本文件
```

## 🚀 快速导航

### 新人入门
1. [项目分析](01-project/PROJECT_ANALYSIS.md) - 了解项目整体架构
2. [变更记录](01-project/CHANGES.md) - 查看最新功能
3. [开发排期](01-project/CALENDAR-PRD.md) - 了解开发计划

### 开发者
- **搜索功能**: [search/](03-features/search/)
- **下载更新**: [download-update/](03-features/download-update/)
- **性能优化**: [performance/](04-implementation/performance/)
- **组件实现**: [components/](04-implementation/components/)

### 架构师
- [平台能力](02-architecture/platform-capabilities-prd.md)
- [AI 通用 API](02-architecture/ai-power-generic-api-prd.md)
- [日志系统](02-architecture/module-logging-system-prd.md)

## 📖 文档类型说明

### PRD (Product Requirements Document)
产品需求文档，描述功能需求、设计方案、实现计划

### Implementation Guide
实现指南，包含代码示例、API 文档、使用说明

### Architecture Design
架构设计文档，描述系统架构、模块设计、技术选型

## 🔗 代码位置映射

### 主进程 (Main Process)
- **下载中心**: `apps/core-app/src/main/modules/download/` → [DOWNLOAD_CENTER_API.md](03-features/download-update/DOWNLOAD_CENTER_API.md)
- **更新系统**: `apps/core-app/src/main/modules/update/` → [UPDATE_SYSTEM.md](03-features/download-update/UPDATE_SYSTEM.md)
- **搜索引擎**: `apps/core-app/src/main/modules/box-tool/search-engine/` → [search/](03-features/search/)

### 渲染进程 (Renderer Process)
- **下载 UI**: `apps/core-app/src/renderer/src/components/download/` → [components/](04-implementation/components/)
- **CoreBox**: `apps/core-app/src/renderer/src/modules/box/` → [search/](03-features/search/)

## 📝 文档维护规范

### 新增文档
1. 确定文档类型和所属目录
2. 使用清晰的文件名（英文，kebab-case）
3. 在文件开头注明迁移来源（如适用）
4. 更新本 README 的索引

### 更新文档
1. 保持文档与代码同步
2. 重大变更需更新相关文档
3. 添加变更日期和版本号

### 归档文档
1. 过时文档移至 `05-archive/`
2. 在原位置留下重定向说明
3. 更新索引移除归档文档

## 🔍 搜索技巧

### 按功能搜索
- 搜索功能: `03-features/search/`
- 下载更新: `03-features/download-update/`
- 视图功能: `03-features/view/`
- 插件系统: `03-features/plugin/`

### 按文档类型搜索
- PRD 文档: 主要在 `03-features/`
- 实现指南: 主要在 `04-implementation/`
- 架构设计: 主要在 `02-architecture/`

### 按关键词搜索
使用 IDE 的全局搜索功能，在 `plan-prd/` 目录下搜索关键词

## 📊 文档统计

- **项目文档**: 4 个
- **架构文档**: 3 个
- **功能 PRD**: 20+ 个
- **实现指南**: 7 个
- **归档文档**: 3 个

## 🤝 贡献指南

1. 文档使用 Markdown 格式
2. 代码示例使用语法高亮
3. 保持文档结构清晰
4. 添加目录和导航链接
5. 使用相对路径链接其他文档

## 📮 反馈

如有文档问题或建议，请：
1. 提交 Issue
2. 联系项目维护者
3. 提交 Pull Request

---

**最后更新**: 2024-11-17
**维护者**: Talex Touch Team
