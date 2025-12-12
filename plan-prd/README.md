# Talex Touch - 项目文档中心

> 统一的项目文档索引，包含所有 PRD、设计文档、实现指南
> 更新时间: 2025-12-07

## 📂 文档结构

```
plan-prd/
├── 01-project/              # 项目级文档
│   ├── CHANGES.md           # 变更记录
│   ├── CALENDAR-PRD.md      # 开发排期
│   └── DESIGN_IMPROVEMENTS.md # 设计改进建议
│
├── 02-architecture/         # 架构设计
│   ├── platform-capabilities-prd.md           # P3 平台能力体系
│   ├── intelligence-power-generic-api-prd.md  # ✅ Intelligence 能力泛化接口 (核心完成)
│   ├── intelligence-agents-system-prd.md      # P3 Intelligence Agents 系统
│   └── module-logging-system-prd.md           # P0 模块日志系统
│
├── 03-features/             # 功能 PRD
│   ├── search/              # 搜索功能
│   │   └── intelligent-recommendation-system-prd.md  # P2 智能推荐
│   │
│   ├── download-update/     # 下载更新系统
│   │   └── DOWNLOAD_CENTER_REFERENCE.md  # 参考文档
│   │
│   ├── view/                # 视图功能
│   │   ├── view-mode-prd.md           # P1 View Mode 增强
│   │   ├── multi-attach-view-prd.md   # P2 多视图并行
│   │   └── attach-view-cache-prd.md   # P2 缓存优化
│   │
│   ├── plugin/              # 插件系统
│   │   ├── plugin-market-provider-frontend-plan.md  # P1 插件市场 (进行中)
│   │   ├── widget-dynamic-loading-plan.md           # P2 Widget 动态加载 (部分完成)
│   │   └── permission-center-prd.md                 # P1 插件权限中心 🆕
│   │
│   ├── build/               # 构建系统
│   │   ├── build-integrity-verification-prd.md  # P2 构建完整性验证
│   │   └── build-signature-system-prd.md        # P2 构建签名系统
│   │
│   ├── division-box-prd.md       # P2 DivisionBox 深化
│   ├── flow-transfer-prd.md      # P2 Flow Transfer
│   └── flow-transfer-detailed-prd.md
│
├── 04-implementation/       # 实现细节
│   └── performance/         # 性能优化
│       ├── PERFORMANCE_REFERENCE.md
│       └── direct-preview-calculation-prd.md  # P1 直接预览计算
│
├── 05-archive/              # 归档文档 (已完成/废弃)
│   └── plugin-loading-refactor.md  # ✅ 已完成
│
├── docs/                    # 参考文档
│   ├── DIVISION_BOX_*.md    # DivisionBox 系列文档
│   ├── AISDK_GUIDE.md       # AI SDK 指南
│   └── ...
│
├── TODO.md                  # 待办事项总览
└── README.md                # 本文件
```

## 🚀 快速导航

### 新人入门
1. [变更记录](01-project/CHANGES.md) - 查看最新功能和已完成工作
2. [开发排期](01-project/CALENDAR-PRD.md) - 了解开发计划
3. [设计改进](01-project/DESIGN_IMPROVEMENTS.md) - 待改进项

### 开发者
- **插件系统**: [plugin/](03-features/plugin/) - 插件市场、Widget 动态加载
- **视图功能**: [view/](03-features/view/) - View Mode、多视图、缓存
- **性能优化**: [performance/](04-implementation/performance/)

### 架构师
- [模块日志系统](02-architecture/module-logging-system-prd.md) - **P0 紧急**
- [平台能力](02-architecture/platform-capabilities-prd.md) - P3
- [Intelligence 通用 API](02-architecture/intelligence-power-generic-api-prd.md) - ✅ 核心完成
- [Intelligence Agents](02-architecture/intelligence-agents-system-prd.md) - P3

## 📖 文档类型说明

### PRD (Product Requirements Document)
产品需求文档，描述功能需求、设计方案、实现计划

### Implementation Guide
实现指南，包含代码示例、API 文档、使用说明

### Architecture Design
架构设计文档，描述系统架构、模块设计、技术选型

## 🔗 代码位置映射

### 主进程 (Main Process)
- **插件系统**: `apps/core-app/src/main/modules/plugin/`
- **搜索引擎**: `apps/core-app/src/main/modules/box-tool/search-engine/`
- **下载中心**: `apps/core-app/src/main/modules/download/` (已完成)

### 渲染进程 (Renderer Process)
- **CoreBox**: `apps/core-app/src/renderer/src/modules/box/`
- **插件市场**: `apps/core-app/src/renderer/src/modules/market/`

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

- **项目文档**: 3 个
- **架构文档**: 4 个
- **功能 PRD**: 13 个 (+1 Permission Center)
- **实现指南**: 2 个
- **归档文档**: 1 个

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

**最后更新**: 2025-12-12
**维护者**: Talex Touch Team
