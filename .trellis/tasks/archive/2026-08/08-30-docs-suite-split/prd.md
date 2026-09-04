# Nexus 开发者文档三套件重构与 tuffex 分包

## Goal

1. 开发者文档侧边栏的「组件/扩展」切换从白底胶囊改为下划线 tab 风格（用户提供的图一：Guide/Developer 样式），并整体优化开发者文档导航。
2. 约 158 篇组件文档按 **基础组件 / 进阶套件 / AI 套件** 三套件拆分，「组件」tab 下新增二级套件切换（用户已选定：二级切换，非超级分组）。
3. tuffex 分包：单包三入口方案（用户已选定）——`@talex-touch/tuffex/base`、`/pro`、`/ai` 三个分类 barrel，安装说明按套件区分。

## User Decisions (2026-08-30, AskUserQuestion)

- Trellis：父任务 + 3 子任务。
- 分包：单包三入口（不真拆 npm 包）。
- 侧边栏：二级套件切换（组件 tab 下 基础/进阶/AI 一排小切换，一次只显示一个套件的分类列表）。
- 组件到套件的归属由 Claude 决定（用户原话「你自己拆分下」）。

## Requirements

- R1 一级切换（组件/扩展）视觉改为下划线 tab：透明背景、激活项文字高亮 + 底部 2px 下划线、未激活灰色；亮/暗色两套。
- R2 组件 tab 下出现二级套件切换（基础/进阶/AI），同为下划线风格但层级弱一档；当前路由对应的组件文档自动定位到其所属套件。
- R3 每篇组件文档归属唯一套件与唯一子分类（见下方归属总表），frontmatter `category` 仍是唯一事实来源，套件由 category→suite 静态映射派生（不新增 frontmatter 字段、不动 API）。
- R4 hub `index.{zh,en}.mdc` 重组为三套件章节，但必须保留对每个组件 slug 的链接（覆盖测试 `tuffex-component-docs-coverage.test.ts` 要求）。
- R5 `scripts/recategorize-component-docs.py` 的 TAXONOMY 更新为新分类并重跑，脚本仍是分类的执行工具。
- R6 tuffex 新增 `packages/components/src/{base,pro,ai}/index.ts` 三个 barrel（只 re-export，不含新组件），随构建产出 `dist/es|lib/{base,pro,ai}/index.js`，被现有 `./*` 通配符 exports 覆盖；audit:exports / audit:readme / coverage 测试全部保持绿。
- R7 三 barrel 的成员清单与文档归属总表一一对应（同一事实来源）。
- R8 扩展 tab 内容与行为不变；组件文档正文不变（只动 frontmatter category 与 hub index）。

## 归属总表（唯一事实来源）

套件 key：`base`（基础组件）/ `pro`（进阶套件）/ `ai`（AI 套件）。

### base 基础组件（7 组 + 独立页 foundations、utils）

| category | zh 标签 | slugs |
|---|---|---|
| Basic | 通用 | avatar, avatar-variants, badge, button, copy-button, divider, flat-button, icon, icon-button, icon-chip, kbd, os-icon, status-badge, tag |
| Form | 表单 | cascader, checkbox, date-picker, file-uploader, flat-input, flat-radio, flat-select, form, image-uploader, input, number-input, picker, radio, rating, scrub-field, search-input, search-select, segmented-slider, select, slider, switch, tag-input, textarea, tree-select |
| Layout | 布局 | card, card-item, collapse, container, flex, grid, grid-layout, group-block, scroll, splitter, stack |
| Navigation | 导航 | breadcrumb, context-menu, dropdown-menu, flat-dropdown, nav-bar, pagination, sidebar-nav, steps, tab-bar, tabs |
| Data | 数据展示 | cell-link, data-table, dot-indicator, filter-chips, image-gallery, markdown-view, sortable-list, stat-card, timeline, transfer, tree |
| Feedback | 反馈 | alert, dialog, drawer, loading-overlay, modal, popover, progress, progress-bar, selection-actions, spinner, toast, tooltip |
| Status | 状态占位 | blank-slate, empty, empty-state, error-state, guide-state, layout-skeleton, loading-state, no-data, no-selection, offline-state, permission-state, search-empty, skeleton |

### pro 进阶套件（4 组）

| category | zh 标签 | slugs |
|---|---|---|
| Advanced | 高级交互 | code-editor, command-palette, markdown-editor, search-panel, version-capsule, virtual-list |
| Visualization | 可视化 | allocation-bar, diff-table, signal-meter, spark-chart |
| Effects | 视觉效果 | border-beam, corner-overlay, edge-fade-mask, flip-overlay, fusion, glass-surface, glow-text, gradient-border, gradual-blur, keyframe-stroke-text, liquid, outline-border, stagger, text-transformer, transition, tuff-logo-stroke |
| Primitives | 底层原语 | auto-sizer, base-anchor, base-surface, floating, resize-box |

### ai AI 套件（4 组 + 独立页 ai-suite）

| category | zh 标签 | slugs |
|---|---|---|
| AiChat | 对话 | attachment-tray, chat, chat-composer, conversation-stream, message-actions, prompt-bar, suggestion-chips, typing-indicator |
| AiAgent | 智能体 | agent-trace, agents, approval-card, task-rows, tool-call-card, tool-chips, tool-confirmation, working-indicator |
| AiReasoning | 推理与生成 | ai-elements, chain-of-thought, code-stream, inline-citation, reasoning-disclosure, sources, stream-markdown, thinking-orb |
| AiContext | 上下文与洞察 | context-cards, context-indicator, fine-tune-card, insight-cards, recommendation-card |

独立页归属：`foundations` → base；`utils` → base；`ai-suite` → ai（作为 AI 套件落地页）。

主要迁移（原分类 → 新分类）：Data 里的 17 个 AI 组件、Form 里 3 个（chat-composer/fine-tune-card/prompt-bar）、Feedback 里 2 个（approval-card/tool-confirmation）、Status 里 5 个（agent-trace/context-indicator/task-rows/tool-chips/working-indicator）、Effects 里 1 个（thinking-orb）、Basic 里 1 个（inline-citation）迁入 AI 四组；markdown-editor/code-editor（Form）、command-palette/version-capsule（Navigation）、virtual-list/allocation-bar/diff-table/signal-meter/spark-chart（Data）、search-panel/scrub-field 注意：scrub-field 留在 Form；search-panel 迁入 Advanced；flip-overlay（Feedback）迁入 Effects。

> 注意：tuffex `packages/components/src/` 里还有未在 nexus 出文档的目录（如 chat 子件等）不在本表内；barrel 按「components.ts 已导出的组件」+ 本表归属生成，源码目录仅存在但未导出的不进 barrel。

## Acceptance Criteria

- [ ] AC1 侧边栏一级「组件/扩展」为下划线 tab（亮/暗色），无白底胶囊残留。
- [ ] AC2 组件 tab 下有 基础/进阶/AI 二级切换；切到某套件只渲染该套件的分类组；访问某组件文档时二级切换自动落在其套件上。
- [ ] AC3 158 篇组件文档 frontmatter category 与归属总表完全一致（脚本重跑幂等、零漏网 → 侧边栏「其他/misc」组为空）。
- [ ] AC4 `pnpm -C apps/nexus test` 绿（尤其 tuffex-component-docs-coverage）；`pnpm -C apps/nexus run typecheck` 绿。
- [ ] AC5 hub index.{zh,en}.mdc 按三套件重组且链接零丢失；zh/en 结构对等。
- [ ] AC6 tuffex `/base` `/pro` `/ai` 三入口构建后可解析（dist 产物存在、types 就位），`pnpm -C packages/tuffex run build && run audit:exports && run typecheck` 绿。
- [ ] AC7 三 barrel 成员并集 = components.ts 导出集（无遗漏、无重复、无越界）。
- [ ] AC8 SSR/hydration 无回归（侧边栏改动不引入 server/client 分歧；沿用现有 `server:false` + lazy 模式）。
- [ ] AC9 安装/使用文档更新：组件 hub 或 getting-started 说明三入口 import 方式。

## Out of Scope

- 不真拆 npm 包；不动 gulp 构建流程本身。
- 不为 src 中未导出/未写文档的组件补文档。
- 不改扩展 tab 的信息架构；不动 Guide（教程）区。
- 不改组件文档正文内容。
