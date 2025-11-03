# Tuff 项目文档索引

> 快速导航项目所有核心文档  
> 更新时间: 2025-10-30

---

## 🎯 核心文档 (必读)

### 1. [PROJECT_ANALYSIS.md](./PROJECT_ANALYSIS.md) 📊
**系统性分析报告**

- ✅ 架构优势分析 (模块系统/插件系统/IPC 通道等)
- ❌ 设计不足识别 (插件加载/日志系统/托盘系统等)
- 🎯 推荐优先级 (P0-P3)
- 📈 总体评价与建议

**适合**: 架构师、技术负责人、新成员了解项目全貌

---

### 2. [CHANGES.md](./CHANGES.md) ✅
**已完成功能清单**

- 🎯 核心功能 (17 项)
- 🛠️ 基础设施 (3 项)
- 📦 npm 包 (1 个)
- 🎨 UI 组件库
- 📚 文档
- ✨ 示例插件 (3 个)
- 📊 完成度评估 (~75%)

**适合**: 了解项目现状、评估已有能力

---

### 3. [CALENDAR-PRD.md](./CALENDAR-PRD.md) 📅
**开发排期计划**

- 📋 总览 (101-143 天工期)
- 🔴 P0 紧急修复 (2 项, 8-12 天)
- 🟡 P1 重要优化 (3 项, 13-19 天)
- 🟢 P2 新功能规划 (4 项, 45-62 天)
- 🔵 P3 架构升级 (2 项, 35-50 天)
- 🎯 5 个里程碑
- 📊 甘特图时间线

**适合**: 项目经理、团队 Leader、规划资源分配

---

### 4. [DESIGN_IMPROVEMENTS.md](./DESIGN_IMPROVEMENTS.md) 💡
**设计改进建议**

- 🔴 紧急改进 (2 项)
  - 插件加载死循环
  - 日志系统碎片化
- 🟡 重要改进 (3 项)
  - 托盘系统薄弱
  - 更新系统简单
  - 废弃 extract-icon API
- 🟢 增强改进 (2 项)
  - 能力抽象碎片化
  - AI 能力接入混乱

**适合**: 开发者、架构师、Code Review

---

## 📝 PRD 文档 (功能需求)

### P0 - 紧急修复类

#### [plugin-loading-refactor.md](./plan-prd/plugin-loading-refactor.md)
- **标题**: 插件加载重构说明
- **状态**: 待实施
- **工期**: 3-5 天
- **核心**: 修复重复 reload 循环、Dev 模式自写 manifest、Provider 日志缺失

#### [module-logging-system-prd.md](./plan-prd/module-logging-system-prd.md)
- **标题**: 模块日志系统 PRD
- **状态**: 待实施
- **工期**: 5-7 天
- **核心**: ModuleLogger 类、LoggerManager 单例、配置持久化、UI 界面

---

### P1 - 功能优化类

#### [tray-system-optimization-prd.md](./plan-prd/tray-system-optimization-prd.md)
- **标题**: Tray System Optimization PRD
- **状态**: 待实施
- **工期**: 5-7 天
- **核心**: 本地图标、丰富菜单(9 项)、窗口最小化到托盘、i18n

#### [deprecate-extract-icon-prd.md](./plan-prd/deprecate-extract-icon-prd.md)
- **标题**: 废弃 file:extract-icon API 并迁移至 tfile:// 协议
- **状态**: 待实施
- **工期**: 1-2 天
- **核心**: 性能优化 70%+、代码简化 70%+

#### [app-update-system-prd.md](./apps/core-app/plan-prd/app-update-system-prd.md)
- **标题**: 应用更新系统 PRD
- **状态**: 待实施
- **工期**: 7-10 天
- **核心**: OOP 策略模式、多更新源、集成下载中心、i18n

#### [download-center-prd.md](./apps/core-app/plan-prd/download-center-prd.md)
- **标题**: 统一下载中心 PRD
- **状态**: ✅ 已完成
- **核心**: 切片下载、断点续传、智能调度

---

### P2 - 新功能规划类

#### [view-mode-prd.md](./plan-prd/view-mode-prd.md)
- **标题**: 插件系统 "View Mode" 与开发模式增强 (v2.0)
- **状态**: 待实施
- **工期**: 10-15 天
- **核心**: 声明式视图、混合加载、Dev Server 健康探测、安全 URL 构造

#### [flow-transfer-prd.md](./plan-prd/flow-transfer-prd.md)
- **标题**: 插件系统 "Flow Transfer" 流转能力 (v1.0)
- **状态**: 待实施
- **工期**: 15-20 天
- **核心**: Flow Payload、Flow Target、Flow Bus、权限与审计

#### [multi-attach-view-prd.md](./plan-prd/multi-attach-view-prd.md)
- **标题**: 多插件 AttachUIView 并行共存能力 (v1.0)
- **状态**: 待实施
- **工期**: 10-15 天
- **核心**: MultiViewHost、布局模式(Tab/Split/Grid)、资源监控

#### [division-box-prd.md](./plan-prd/division-box-prd.md)
- **标题**: DivisionBox 交互容器能力深化 (v1.0)
- **状态**: 待实施
- **工期**: (与 multi-attach-view 相关)
- **核心**: 结构化生命周期、状态管理、布局与外观

#### [attach-view-cache-prd.md](./plan-prd/attach-view-cache-prd.md)
- **标题**: AttachUIView 缓存与自适应预加载策略 (v1.0)
- **状态**: 待实施
- **工期**: 10-12 天
- **核心**: 三级缓存(Hot/Warm/Cold)、Score 模型、LRU 回收

---

### P3 - 架构升级类

#### [platform-capabilities-prd.md](./plan-prd/platform-capabilities-prd.md)
- **标题**: 通用平台型能力建设 (v1.0)
- **状态**: 待实施
- **工期**: 20-30 天
- **核心**: Capability Catalog、PlatformCoreService、能力授权、观测

#### [ai-power-generic-api-prd.md](./plan-prd/ai-power-generic-api-prd.md)
- **标题**: AI Power 泛化接口与能力路由 (v1.0)
- **状态**: 待实施
- **工期**: 15-20 天
- **核心**: ai.invoke()、策略路由、多模型支持、观测与计费

---

## 📚 其他参考文档

### 开发指南

#### [CLAUDE.md](./CLAUDE.md) 🤖
- **标题**: AI 辅助开发指南
- **内容**: 
  - 开发命令
  - 架构概览
  - 技术栈
  - 核心模块说明
  - 关键文件位置

**适合**: AI 辅助开发、新成员快速上手

---

### 项目介绍

#### [README.md](./README.md) / [README.zh-CN.md](./README.zh-CN.md)
- **内容**:
  - 项目介绍
  - 功能特性
  - 安装使用
  - 贡献指南
  - 许可协议

**适合**: 外部用户、潜在贡献者

---

### 版本历史

#### [CHANGELOG.md](./apps/docs/CHANGELOG.md)
- **内容**: 
  - 2.0.0 (Upcoming)
  - 1.2.0 (2023-05-01)
  - 1.1.0 (2023-04-23)
  - 1.0.0 (2023-04-19)

**适合**: 了解版本演进、Release Notes

---

### 其他规划文档

#### [plan.md](./plan.md)
- **标题**: 跨平台文字选中与悬浮工具条系统
- **状态**: 计划中
- **内容**: 
  - 修复 active-win 依赖
  - 实现全局文字选中检测
  - 悬浮工具条窗口
  - 集成到 CoreBox
  - 截图 OCR 准备

#### [division-box-plan.md](./division-box-plan.md)
- **标题**: (旧版规划,已被 PRD 替代)

#### [plugin-storage-research.md](./plugin-storage-research.md)
- **标题**: 插件存储研究
- **内容**: 存储方案调研与设计

---

## 🗂️ 文档分类导航

### 按角色分类

**👨‍💼 项目经理/产品经理**:
1. PROJECT_ANALYSIS.md
2. CALENDAR-PRD.md
3. CHANGES.md

**👨‍💻 开发者**:
1. DESIGN_IMPROVEMENTS.md
2. CLAUDE.md
3. 各 PRD 文档
4. README.md

**🏗️ 架构师**:
1. PROJECT_ANALYSIS.md
2. DESIGN_IMPROVEMENTS.md
3. platform-capabilities-prd.md
4. ai-power-generic-api-prd.md

**🆕 新成员**:
1. README.md
2. CLAUDE.md
3. PROJECT_ANALYSIS.md
4. CHANGES.md

---

### 按优先级分类

**🔴 紧急 (必读)**:
- PROJECT_ANALYSIS.md (了解全局)
- DESIGN_IMPROVEMENTS.md (了解问题)
- plugin-loading-refactor.md (紧急修复)
- module-logging-system-prd.md (紧急修复)

**🟡 重要 (近期)**:
- CALENDAR-PRD.md (了解排期)
- tray-system-optimization-prd.md
- app-update-system-prd.md
- deprecate-extract-icon-prd.md

**🟢 参考 (长期)**:
- view-mode-prd.md
- flow-transfer-prd.md
- multi-attach-view-prd.md
- attach-view-cache-prd.md
- platform-capabilities-prd.md
- ai-power-generic-api-prd.md

---

### 按文档类型分类

**📊 分析报告**:
- PROJECT_ANALYSIS.md

**✅ 功能清单**:
- CHANGES.md

**📅 排期计划**:
- CALENDAR-PRD.md

**💡 改进建议**:
- DESIGN_IMPROVEMENTS.md

**📝 需求文档 (PRD)**:
- 9 个 PRD 文档

**📚 参考文档**:
- CLAUDE.md
- README.md
- CHANGELOG.md
- plan.md
- plugin-storage-research.md

---

## 🔍 快速搜索

### 查找特定主题

| 主题 | 文档位置 |
|------|---------|
| 插件加载问题 | plugin-loading-refactor.md, DESIGN_IMPROVEMENTS.md |
| 日志系统 | module-logging-system-prd.md, DESIGN_IMPROVEMENTS.md |
| 托盘系统 | tray-system-optimization-prd.md, DESIGN_IMPROVEMENTS.md |
| 更新系统 | app-update-system-prd.md, DESIGN_IMPROVEMENTS.md |
| 下载中心 | download-center-prd.md, CHANGES.md |
| 视图模式 | view-mode-prd.md |
| 流转能力 | flow-transfer-prd.md |
| 多视图 | multi-attach-view-prd.md, division-box-prd.md |
| 缓存优化 | attach-view-cache-prd.md |
| 平台能力 | platform-capabilities-prd.md |
| AI 能力 | ai-power-generic-api-prd.md |
| 架构分析 | PROJECT_ANALYSIS.md |
| 开发排期 | CALENDAR-PRD.md |

---

## 📊 文档统计

| 类型 | 数量 | 说明 |
|------|------|------|
| 核心文档 | 4 | 分析/清单/排期/改进 |
| PRD 文档 | 11 | 功能需求文档 |
| 参考文档 | 5 | 指南/介绍/历史/规划 |
| **总计** | **20** | 完整文档体系 |

---

## 🔄 文档更新频率

| 文档 | 更新频率 | 负责人 |
|------|---------|--------|
| PROJECT_ANALYSIS.md | 每季度 | 架构团队 |
| CHANGES.md | 每个版本 | 产品团队 |
| CALENDAR-PRD.md | 每两周 | 项目经理 |
| DESIGN_IMPROVEMENTS.md | 每季度 | 架构团队 |
| PRD 文档 | 按需更新 | 产品团队 |
| README.md | 按需更新 | 核心团队 |

---

## 📞 联系方式

如对文档有疑问或建议,请联系:
- **项目负责人**: TalexDreamSoul (TalexDreamSoul@Gmail.com)
- **架构团队**: (通过 GitHub Issues)
- **产品团队**: (通过 GitHub Discussions)

---

**文档版本**: v1.0  
**生成时间**: 2025-10-30  
**维护团队**: Tuff Project Team

