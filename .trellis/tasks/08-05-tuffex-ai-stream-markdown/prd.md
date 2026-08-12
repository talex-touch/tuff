# ① TxStreamMarkdown 流式 Markdown 渲染（块级增量 + 代码高亮 + mermaid）

父任务：`.trellis/tasks/08-05-tuffex-ai-suite`
依赖：无（tuffex 内独立交付）。

## 背景

`TxMarkdownView`（`packages/tuffex/packages/components/src/markdown-view/`）每次 `content` 变更全文重 parse + 整棵 `v-html` 替换：流式场景下每个 delta 都重建全部 DOM，长回复会抖动、选区丢失、图片重载；且无代码高亮、无 mermaid、无流式光标。对标 ChatGPT 网页版的流式观感是本件的核心目标。

## Goal

在 tuffex 新增 L1 渲染原语：`TxStreamMarkdown`、`TxCodeBlock`、`TxMermaidBlock`。对持续增长的 Markdown 字符串做**块级增量渲染**——已闭合的块不再重渲染，只有尾部未闭合块随流更新。

## Requirements

### TxStreamMarkdown

- Props 至少含：`content: string`、`streaming?: boolean`、`sanitize?: boolean（默认 true）`、`theme?: 'light' | 'dark' | 'auto'`（语义与 TxMarkdownView 对齐）。
- 块级增量：`content` 追加时，已完成块的 DOM 节点保持引用不变（不重建）；仅尾部未闭合块重渲染。以 marked 的块级 lexer 为切分基础。
- 流式光标：`streaming` 为 true 时尾块末尾渲染闪烁光标（▍风格），`streaming` 置 false 后光标消失。
- 揭示动画：新块进入时淡入（透明度/位移/轻模糊任选组合），尊重 `prefers-reduced-motion`；动画只作用于新增块，不得触发既有块重排。
- 消毒：所有落入 DOM 的 HTML 走 dompurify 路径（含尾块的每次更新），与 TxMarkdownView 同一惯例（懒加载、加载完成前不渲染未消毒内容）。
- 可插拔块渲染器：围栏代码块按语言分派到注册的块组件（内置 `mermaid` → TxMermaidBlock、其余 → TxCodeBlock），消费方可注册自定义语言渲染器。
- 主题：沿用 `--tx-*` token + 回退值；`auto` 跟随 `data-theme`/`.dark`（与 TxMarkdownView 现有探测一致）。

### TxCodeBlock

- 语言标签、复制按钮（复用 copy-button 能力或惯例）、横向滚动、行高与内边距对齐现有 markdown-view 的 pre 样式。
- 语法高亮懒加载：高亮器动态 import，未就绪时先渲染无高亮的 escaped 文本，不阻塞流式输出；高亮只在块闭合后执行，流式中的尾部代码块保持纯文本。
- 高亮器选型（shiki vs CodeMirror 复用）在 design.md 定案（父任务开放决策 2、3）。

### TxMermaidBlock

- 只在围栏**闭合后**渲染：流式中显示带 shimmer 的占位骨架 + 原文代码；闭合后动态 import mermaid 出图。
- 渲染失败回退为普通代码块展示原文并给出错误提示行，不抛异常、不产生空白区。
- 出图后支持点击放大预览（可复用 image-gallery 灯箱或等价轻量实现，design 定案）。
- mermaid 主题跟随浅/深主题。

### 通用约束

- mermaid 与高亮器不得进 tuffex 初始 chunk；无 `document` 环境（SSR/测试）不崩溃。
- 新目录 `stream-markdown/`（或 design 定案的等价结构），导出进 `components.ts` 与分包入口，模式对齐既有组件。
- 不修改、不破坏现有 `TxMarkdownView` 的对外行为（保持独立组件，供非流式场景继续使用）。

## Acceptance Criteria

- [ ] 以 20ms/delta 速率注入 5000+ 字符含 10+ 块的文档：已完成块 DOM 节点在后续 delta 中保持同一引用（单测以节点 identity 断言）
- [ ] 流式中尾块带光标，`streaming=false` 后光标消失
- [ ] ```mermaid 围栏：流式中为骨架 + 原文，闭合后出图；非法 mermaid 源回退代码展示且有错误提示
- [ ] 代码块：闭合后高亮、语言标签正确、复制按钮可用；高亮器 chunk 不出现在初始加载
- [ ] `sanitize` 默认开启，注入 `<script>`/`onerror` 的流式内容不落入 DOM（单测覆盖）
- [ ] `prefers-reduced-motion` 下无位移/模糊动画
- [ ] 浅/深主题下渲染正确；无 `document` 环境 import 不报错
- [ ] 新组件单测齐备，tuffex build 通过，`pnpm lint` 通过

## Notes

- 复杂任务：`design.md`（增量解析策略、渲染器注册契约、高亮器选型）与 `implement.md` 齐备后方可 `task.py start`。
- TxAiMessage / TxToolCallCard（子任务 ③）后续以 TxStreamMarkdown 为内容渲染器，API 设计时预留 `parts` 场景的复用性，但本件不做消息层。
