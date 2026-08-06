# A. AI Elements 目录复刻（tuffex ai 系列扩容）

父任务：`.trellis/tasks/08-05-ai-toolchain-suite`。目录清单与已有对应见 `research/ai-elements-catalog.md`。

## Goal

参照 elements.ai-sdk.dev 的交互语义，把工具循环 UI 直接需要的缺口组件 Vue 化落进 tuffex（P0 五件），P1 列候补不在本任务实施。

## Requirements（P0）

- **TxToolConfirmation**：工具执行确认卡——工具名/入参摘要/风险级、允许/拒绝/「本会话记住」，受控组件事件出（`approve/deny` + remember 参数）；嵌在会话流内（非模态），键盘可达
- **TxSources**：来源列表（favicon/标题/域名/序号），折叠头「Used N sources」，与 InlineCitation 序号呼应（P1 才做行内标）
- **TxSuggestionChips**：回复尾部的追问建议 chips，横向滚动，点击派发 `select(text)`
- **TxContextIndicator**：上下文用量环（used/max tokens，百分比环 + hover 明细），对标 AI Elements Context
- **TxChainOfThought**：多步推理时间线（步骤图标/标题/正文/状态），流式追加步骤；与单折叠 TxReasoningDisclosure 并存（后者是轻量态）

## 约束

- 全受控、`--tx-*` token、英文默认文案 props、单测、`components.ts` 注册——沿既有惯例
- 与 parts 模型对齐：新组件消费的数据形状进 `ai-elements/src/types.ts`（如 `AiSourcePart`、`AiSuggestion`），保持向后兼容（可选字段/新 part 类型）
- 交互语义对照 AI Elements，视觉语言归 tuffex（不搬 shadcn 样式）

## P1 候补（不实施，列录）

Task/Plan/Queue、InlineCitation、Artifact、WebPreview、Image、OpenInChat、Checkpoint

## Acceptance Criteria

- [ ] P0 五件带单测落地并注册导出，mock 数据下四态/流式态正确
- [ ] parts 类型扩展零破坏（既有 ai-elements 测试全绿）
- [ ] 浅/深主题 + reduced-motion 正确
- [ ] tuffex test/typecheck/build/lint 全绿

## Notes

- 复杂任务：design.md（每件的 API 面与 parts 类型形状）+ implement.md 过审后 start。
