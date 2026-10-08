# TuffEx 补齐后台通用件：TxDescriptions、TxDataTable 骨架加载态、TxPagination 每页条数

父任务：`10-02-nexus-admin-console-overhaul`（D9；设计契约见父任务 `design.md` §2.1）。

## Goal

后台迁移需要三样 TuffEx 目前没有的通用件。按「TuffEx 原语 + Nexus 组合」的约定补进 TuffEx，并同步 Nexus 组件文档，供 #2 的后台组合件使用。

## Background

- `TxDataTable` 的 `loading` 只渲染一层带模糊的遮罩 + 转圈（`data-table/src/TxDataTable.vue:426-428`，样式 `:815-824`），且加载时隐藏空态行（`:536`）；首屏是空表头加遮罩，不是贴合列宽的骨架（spec `component-guidelines.md:311-341` 要求骨架默认、贴合版式、刷新不换骨架）。
- `TxPagination` 没有每页条数（`pagination/src/types.ts:1-25`）；`#info` 插槽可承载「共 N 条」（`TxPagination.vue:184-186`）。
- 键值对展示没有原语：后台用户抽屉（`users.vue:645-702`）、订阅抽屉（`:750-779`）手写 `<dl>`；即将新增的运行详情、插件详情、应急会话详情都需要。
- 版本：`packages/tuffex/package.json` 为 0.6.3，npm 最新已发布 0.6.2（2026-09-29）。新组件 `since: 0.6.3`；生命周期 / changelog 门禁要求当前版本有 changelog 章节（另一会话的 0.6.3 改动也在进行中，`CHANGELOG.md` 已有未提交修改）。

## Requirements

- **R1 `TxDescriptions` + `TxDescriptionsItem`（新组件，目录 `descriptions/`）**：语义 `<dl>`；props `columns`（默认 2，容器窄于阈值时 1 列）、`layout: 'horizontal' | 'vertical'`、`size: 'sm' | 'md'`（复用 `audit:vocab` 已有词表）、`emptyText`（默认 `—`，值为空时显示）、`labelWidth`（horizontal 时）；`TxDescriptionsItem` props `label`、`span`，值走默认插槽、`#label` 插槽可覆盖标签。只用 `--tx-*` token，遵守 `tuffex-design-rules.md`（正文 13–14px、无 letter-spacing、无 700 字重）。
- **R2 `TxDataTable` 骨架加载态**：新增 `loadingVariant: 'overlay' | 'skeleton'`（默认 `overlay`，现有行为不变）、`skeletonRows`（默认 5）。`skeleton` 时：无数据 + 加载 → 渲染 `skeletonRows` 行贴合列宽的骨架（复用 `TxSkeleton`，`aria-hidden`，表格 `aria-busy`），不显示遮罩与空态；有数据 + 加载 → 保留现有行、不加遮罩，仅以表头下方的细进度条提示刷新。
- **R3 `TxPagination` 每页条数**：新增 `pageSizes?: number[]`（提供才渲染选择器）、`v-model:pageSize`（emit `update:pageSize`、`pageSizeChange`）、`pageSizeLabel`（默认英文，调用方传本地化文案）。选择器复用库内现有 select 组件；若因此触发 `audit-package-size.mjs` 的按需入口预算，按先例在 `onDemandImportBudgets` 放行。
- **R4 文档**：按 `.trellis/spec/frontend/tuffex-docs-sync.md` 与项目记忆中的新增组件触点清单：
  - 新组件：`components.ts` 导出、README / README_ZHCN 分类计数、`components-lifecycle.json`（`since: 0.6.3`）、`CHANGELOG.md` 的 0.6.3（或 Unreleased）条目、`content/docs/dev/components/descriptions.{zh,en}.mdc`（8 字段 frontmatter，`status: beta`，`since: 0.6.3`）、demo SFC + `demo-registry.ts`、`DocsSidebar.vue` 与组件索引页的双语链接；
  - 扩展：`data-table.{zh,en}.mdc`、`pagination.{zh,en}.mdc` 的 Props 表、交互契约、最佳实践与新 demo；查出包装了这两个组件的其它组件并同步它们的文档。
- **R5 测试**：三项各有 `@vue/test-utils` 测试：TxDescriptions 的列数 / 空值 / 插槽；TxDataTable 骨架只在无数据时出现、刷新保留行、`overlay` 默认行为不变；TxPagination 改条数发事件、未提供 `pageSizes` 时不渲染选择器。

## Acceptance Criteria

- [ ] tuffex：`typecheck`、`vitest run`（含 `component-lifecycle-gate.test.ts`）、`gulp build`、`audit:size`、`audit:vocab`、`audit-readme-inventory` 通过。
- [ ] Nexus：`cd apps/nexus && ./node_modules/.bin/vitest run` 全绿（`test/docs/tuffex-component-docs-coverage.test.ts` 要求双语文档、双语索引链接、可解析的 demo、行精确的 `## API`、以 `Props` / `属性` 结尾的标题、`Best Practices` / `最佳实践`；固定栏目名按 `nexus-docs-structure.md` 的写法，其余英文小标题按 `tuffex-design-rules.md:21-25` 用句首大写），`node apps/nexus/build/check-mdc-fences.mjs` 通过。
- [ ] ego：`/zh/docs/dev/components/descriptions`、`data-table`、`pagination` 三页在亮 / 暗主题下截图；骨架 demo 可切换「首屏加载 / 刷新」两种状态。
- [ ] 现有 `TxDataTable` / `TxPagination` 调用方不传新 prop 时行为与渲染不变（对比改动前后的组件测试快照或 DOM）。
- [ ] 发版决定已询问老板（0.6.3 何时发；门禁在发版前保持红是否可接受）。

## Out of Scope

- 后台组合件（#2）；Nexus 页面迁移。
- TuffEx 其它组件的重构；i18n 体系（TuffEx 无 i18n，文案走 text props）。

## Decisions（实现与验收后，2026-10-02，老板）

- **CSS 体积上限**：同意 `audit-package-size.mjs` 的 `fullCssBytes` 由 629 KiB 提到 631 KiB（三件通用件合计 +2,275 B，实测全量 630.2 KiB，余量 0.8 KiB；其它会话的 0.6.3 改动合并后可能需要再评估）。
- **分页文档「分页导航」demo**：顺手修。该 demo 把 `TxSelect` 包在 `<label>` 里，精确点击箭头图标时 label 把点击再转发给 input，同一次点击触发两次切换，面板开了又关（ego 实测，见 `research/ui-verification.md`）。改为去掉 `<label>`、使用本任务新增的内置 `page-sizes`；`pagination.{zh,en}.mdc` 对应代码片段同步（片段里传给 `TxSelect` 的 `aria-label` 落在根 `div` 上，并不能为控件命名）。
- **库级问题另开任务**：`TxSelect` / `TxBaseAnchor` 被 `<label>` 包住时吞掉箭头点击，不在本任务内修。
- **补漏**：组件画廊（`DocsComponentsGallery.vue`）补 `descriptions` 格子——属 `tuffex-design-rules.md:322` 注册链第 8 条的必需项，原 R4 清单漏列。
- **提交**：本任务单独一个分支 `task/feat/tuffex-admin-primitives`（基于 `origin/stage`），PR 合进 `stage`。
