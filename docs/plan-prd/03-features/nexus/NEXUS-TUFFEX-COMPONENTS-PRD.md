# Nexus Tuffex 组件展示整合 PRD（草案）

Status: Draft

## 背景
- 组件展示目前在 `packages/tuffex/docs/components/`（VitePress）维护，Nexus 侧仅有安装/使用说明。
- Nexus 已具备 `@nuxt/content` 文档体系，可承载组件文档与示例。
- 目标是把组件展示集中到 Nexus，减少双维护与入口分散。

## 目标
- 在 Nexus 提供完整的组件展示页面与组件详情文档。
- 形成单一可信来源（SSoT），避免 Tuffex 文档与 Nexus 文档漂移。
- 保持示例可运行、结构清晰、检索友好。

## 现状盘点
- Tuffex 组件文档：`packages/tuffex/docs/components/*.md`。
- Nexus 文档入口：`apps/nexus/content/docs/dev/`，已存在 `Tuffex` 说明页。

## 范围
- 新增组件展示入口（推荐路径：`/docs/dev/components`）。
- 组件列表页 + 组件详情页（按分类/状态展示）。
- 组件示例渲染（支持交互 Demo、代码块与 API 说明）。
- 文档导航与索引更新（中/英）。
- 组件文档双语化（`*.zh.md` / `*.en.md`）。

## 非范围
- 组件 API 大规模调整或重构。
- 现有 Nexus UI 视觉重塑。
- 组件库打包与发布流程变更（除必要命名同步）。

## 方案（推荐）

### 信息架构
- `/docs/dev/components`：组件总览（分类 + 搜索 + 标签）。
- `/docs/dev/components/<slug>`：组件详情（Overview / Usage / API / Demo）。
- `/docs/dev/components/playground`（可选）：集中测试场。

### 内容模型（Frontmatter）
建议组件文档统一 Frontmatter，用于生成列表与检索。
```md
---
title: Button
description: 按钮与组合按钮
category: Form
status: stable
since: 1.0.0
tags: [action, primary, icon]
---
```

### 文档渲染与 Demo
- 使用 `@nuxt/content` + 自定义组件渲染（如 `<TuffDemo>`、`<PropsTable>`）。
- 依赖 `client-only` 包裹可能需要浏览器 API 的组件 Demo。
- 统一 Demo 插槽规范：`basic` / `advanced` / `api`。

### 迁移策略（SSoT）
**推荐：Nexus 成为唯一文档源**
1) 将 `packages/tuffex/docs/components` 迁入 `apps/nexus/content/docs/dev/components`。
2) Tuffex 侧文档改为跳转或保留极简入口（链接到 Nexus）。

**备选：同步脚本**
保留 Tuffex 目录作为源，新增同步脚本复制到 Nexus 内容目录（防止双改）。

**不推荐：iframe 或外链嵌入**
会导致样式/导航/SEO/体验割裂。

### 导航与索引
- 更新 `apps/nexus/content/docs/dev/index.zh.md` 与 `apps/nexus/content/docs/dev/index.en.md`。
- 新增组件索引页（`components/index.(zh|en).md`），聚合分类与推荐组件。

## 实施步骤
1) 命名确定（英文名固定 Tuffex，中文名 2-3 字）。
2) 搭建 `components` 文档目录与索引页。
3) 迁移/同步现有组件文档。
4) 完成 Demo 渲染组件与内容规范。
5) 完成双语补齐与翻译验收。
6) 更新导航与入口链接。
7) 回归检查（SSR、样式冲突、性能）。

## 验收标准
- Nexus 组件页可访问，列表/详情可浏览。
- Demo 可用、代码块清晰、API 信息完整。
- 中英入口一致，索引可检索，文档内容对齐。
- 不再出现 Tuffex/Nexus 文档内容分叉。

## 风险与对策
- **SSR/水合问题**：Demo 组件加 `client-only`，避免依赖 window。
- **样式冲突**：Demo 组件封装隔离样式，必要时 scope 或局部样式前缀。
- **文档漂移**：强制单一来源或同步脚本 + 校验。

## 开放问题
- 是否保留 Tuffex VitePress 站点（仅跳转 vs. 删除）。
- 是否新增在线 Playground（与现有 `packages/tuffex/docs/playground` 取舍）。

## 命名
- 英文名：**Tuffex**（固定）
- 中文名：**塔芙**
