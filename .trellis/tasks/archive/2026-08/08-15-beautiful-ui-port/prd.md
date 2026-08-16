# PRD — Port Beautiful UI (beautifului.dev) AI primitives into tuffex + nexus docs

## 背景

用户要求研究 https://www.beautifului.dev/ （"Beautiful UI — Crafted primitives for AI-native interfaces"，Turbo 设计工作室 / Shane Levine 出品，**MIT 协议**，license 页明确允许自由使用），并将其全部组件移植进 tuffex 组件库，与现有组件融合，在 nexus 文档站产出完整案例文档。

原始诉求（2026-08-15）：
1. 所有组件都要扒下来，丢进我们的 AI 组件库，与现有组件融合
2. 要完美实现该站的样式（像素级还原其视觉语言）
3. 在 tuffex 组件库实现；nexus 出一个完整的案例 doc，交付链接

## 研究材料（已归档 research/beautifului-src/）

- 19 个组件的完整 React+TS+Tailwind 源码（`01-*.tsx` ~ `19-*.tsx`）
- `_global.css`：全站 CSS（9 个关键动效 keyframes：shimmer-text / fade-up / fade-in / eq-bounce / stream-in / caret-blink / pop-in / spin / pixel-on）
- `_design-tokens.json`：54 个 CSS 变量 × 明暗两套（--ink/--surface/--line/--accent/--shadow-* 体系）
- `shots/`：19 组件 × 明暗双主题截图（像素级还原的视觉基准）

## 需求

### R1 组件移植（tuffex）
19 个 Beautiful UI 组件全部落地为 tuffex Vue 3 组件（或并入现有组件的变体），清单：

| # | BUI 组件 | 一句话职责 |
|---|---------|-----------|
| 01 | Loading State | 像素网格加载器（Drive/Dots/Orbit 变体）+ shimmer 标签 + 计时 |
| 02 | Thinking | 可展开推理轨迹（Steps/Reasoning/Search/Coding 变体） |
| 03 | Streaming Text | 流式回答 + 内联来源 + 动作行 + 追问 |
| 04 | Approval Card | human-in-the-loop 多问题走查卡 |
| 05 | Tool Chips | 工具调用/代码编辑紧凑 chip 流 |
| 06 | Task Rows | agent 任务状态行（Capsules/List 变体） |
| 07 | Chat | 标签页聊天面板 + 推理回复 + composer |
| 08 | Prompt Bar | 输入条：@ 来源、/ 命令、模型选择器、听写（Rounded/Pill 变体） |
| 09 | Recommendation Card | agent 建议卡 + 置信度表 |
| 10 | Context Cards | RAG 检索知识块卡片 |
| 11 | Diff Table | AI 提案改动的表格扫掠动画 |
| 12 | Records Table | CRM 式表格（标签/排序/关系强度/页脚统计） |
| 13 | Filter Table | 状态 chip 过滤 + 行重组 |
| 14 | Sidebar Nav | 工作区导航 + 快捷搜索 |
| 15 | Search | 命令搜索 + 实时过滤 + 空态 |
| 16 | Insight Cards | 分页洞察卡 + 可 scrub 图表 |
| 17 | Code Block | 逐行流式代码块 |
| 18 | Fine-tune Card | 属性检查器（布局/滑杆/类型） |
| 19 | Selection Actions | 划词 → 交给 agent 改写的工具条 |

### R2 与现有组件融合
- 已知概念/命名重叠：`TxLoadingState`（同名不同物，页面空态包装器）、`chain-of-thought`、`reasoning-disclosure`、`tool-confirmation`、`tool-call-card`、`data-table`、`command-palette`、`chat`/`ai-elements`/`conversation-stream`、`sources`、`stream-markdown`、`nav-bar`、`stat-card`、`suggestion-chips`。
- 每个 BUI 组件必须有明确融合决策：**新增组件 / 现有组件加变体 / 现有原语组合复刻**，决策落在 design.md，不允许无脑重复造轮子，也不允许破坏现有组件 API。

### R3 样式完美还原
- BUI 的 token 体系（ink/surface/line/accent + 发丝线阴影 + 13px 正文 + 等宽数字）与 9 个 keyframes 须在 tuffex 内有对应实现，明暗两主题都要还原。
- 以 research/beautifului-src/shots/ 截图为视觉验收基准。
- 与 tuffex 现有主题体系兼容：不得全局污染现有组件样式。

### R4 nexus 文档
- 每个新组件按仓库既有约定产出 `.zh.mdc` + `.en.mdc` 组件文档（8 字段 frontmatter、status=beta、since=2.5.0、中文段名、zh/en 段数相等、MDC 围栏同深度），demo 注册进 demo-registry。
- 额外产出一个 **AI 套件总览案例页**（完整案例 doc），汇集 19 个组件的可交互 demo，作为交付给用户的入口链接。

### R5 合规
- MIT 署名义务：移植代码的组件目录/文件头保留来源与版权说明（adapted from Beautiful UI, © 2026 Shane Levine, MIT）。

## 约束

- Vue 3 + TS，遵循 tuffex 组件目录范式（组件目录 + src/ + __tests__/ + index.ts + Tx 前缀），无 i18n 系统（文案 props 默认英文）。
- 动效尊重 prefers-reduced-motion（BUI 源码本身有此行为，移植不得丢失）。
- tuffex 构建 + tuffex vue-tsc + nexus typecheck 都要过（tuffex 的 typecheck 弱于下游，必须跑下游）。
- 不破坏现有组件的公开 API 与现有文档。
- 共享文件（barrel、demo-registry、docs 索引）由主会话统一编辑，避免多 agent 争写。

## 验收标准

- [ ] AC1: 19 个 BUI 组件全部有落地实现（新组件或已记录的融合方案），tuffex 构建通过
- [ ] AC2: 每个落地组件有明暗两主题下与 shots/ 基准一致的视觉表现（截图抽查）
- [ ] AC3: 每个新组件有 zh+en 文档与注册 demo，nexus typecheck 通过
- [ ] AC4: 存在一个 AI 套件总览案例页，可通过一个链接看到全部 19 个组件案例；链接已交付用户
- [ ] AC5: MIT 署名在代码与文档中可见
- [ ] AC6: lint / typecheck（tuffex + nexus）/ 相关测试全绿
