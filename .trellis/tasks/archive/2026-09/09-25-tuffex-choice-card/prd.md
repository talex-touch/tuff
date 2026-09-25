# tuffex 选项卡片组件（图标 + 标题 + 说明，可分步翻页）

父任务：`09-25-home-session-polish`（R5 的前置组件）

## Goal

tuffex 的 AI 套件里加一个「选项卡片」：一张卡，顶部是问题标题，下面是一列富选项（图标 + 标题 + 一行说明），可以分成几步翻页（`1 / 2`，前后箭头）。它是 miko 截图里「我们先从哪件事开始？」那张卡的通用版，主页的开场引导卡与「为你准备」推送列表都用它渲染。

## 参考

- 老板提供的 miko 截图：卡片标题「我们先从哪件事开始？」，五个选项各有图标、标题、灰色说明；左上是 `‹ 1 / 2 ›` 分页。
- 库里相近的组件与它们为什么不够：`TxSuggestionChips`（只有文字，`list` 布局也没有图标与说明、没有分步）、`TxRecommendationCard`（一个主推荐 + 备选抽屉的置信度模型）、`ToolFormCard`（core-app 里的模型表单卡，是表单控件不是选项列表）。

## Requirements

1. **组件**：`TxChoiceCard`（目录 `packages/tuffex/packages/components/src/choice-card/`），归入 `ai` 套件，文档放在 AiChat 分组、紧挨 `suggestion-chips`。
2. **数据**：`steps: ChoiceStep[]`，每步有 `id`、`title`、`options`；每个选项有 `id`、`label`、可选 `description`、可选 `icon`（`TxIcon` 的 `ITuffIcon` 或图标类名）、可选 `disabled`。只有一步时不显示分页。
   - **布局**：`columns: 1 | 2`（默认 1）。两列用于空间紧张的位置（主页英雄区），选项按行从左到右排；卡片宽度不足以放两列时（容器查询）自动退回一列。
3. **交互**：
   - 点选项发 `select({ step, option })`，组件不自己跳步——宿主决定是跳到下一步（`v-model:step`）还是直接完成，因为下一步的内容往往取决于这一步选了什么。
   - 分页箭头在有上一步 / 下一步时可用，`v-model:step` 双向绑定当前步。
   - 键盘：选项是真正的 `<button>`；上下方向键在选项间移动焦点，`Home` / `End` 到首尾；分页箭头有可读标签。
4. **视觉**：选项是填充行（`--tx-fill-color-light` 一类 token），悬停立即变色（不过渡颜色）；图标列、标题、说明的字号遵守设计规范（标题 14px / 说明 12px）；切换步骤时列表内容做一次模糊淡入（有减少动态效果出口）；选项逐项错落出现可关闭（`appear`）。
5. **文案不内置**：分页箭头的无障碍标签、`1 / 2` 的格式都走 props（库不带 i18n）。
6. **状态**：可选 `selected`（高亮已选项，用于回看）、`loading`（选项区骨架屏，镜像选项行的布局）。
7. **注册链与文档**：`components.ts` → `ai/index.ts` → README 清单 → nexus 侧边栏 / 分类脚本 / 画廊格 → `choice-card.{zh,en}.mdc` → demo（单步选择、两步引导、加载态）+ `demo-registry.ts`。

## Acceptance Criteria

- [x] 单测：单步不渲染分页；多步时箭头启用状态正确、`v-model:step` 双向生效；点选项发出带 `step` 与 `option` 的 `select`；禁用项不发事件；方向键 / Home / End 焦点移动；`loading` 渲染骨架且不渲染选项按钮。
- [x] 样式契约：hover 不过渡颜色、所有过渡有减少动态效果出口、只用 `--tx-*` token。
- [x] tuffex 包内测试、`suite-barrels.test.ts`、类型检查、`audit:readme` 通过。
- [x] nexus 四个文档 gate 通过；ego-browser 实测文档页亮 / 暗主题，截图核对与 miko 参考的信息层级一致（标题 → 选项标题 → 说明）。

## 不做

- 不做多选、不做选项里的输入框（那是表单）。
- 不负责「选完之后做什么」，组件只报告选择。

## 落地记录

- 2026-09-26 提交 `792aa7c8e`。实现偏差见 design.md「实现偏差」；检查阶段把样式表从 5.1 KiB 压到 3.9 KiB（渲染逐像素一致），按需 CSS 闸门在不计另一会话未提交的 prism-glow 时为 619.0/620。浏览器实测（ego-browser，亮 / 暗、分步翻页、键盘）通过。
