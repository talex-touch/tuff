# ③ 附件与工具卡片（TxAttachmentTray + TxToolCallCard + arrow-js Widget 展面）

父任务：`.trellis/tasks/08-05-tuffex-ai-suite`
依赖：与 ①（stream-markdown）弱耦合——工具卡片/推理块内的文本内容最终走 TxStreamMarkdown，但本件验收可用纯文本替身先行。

## 背景

现有 `chat/types.ts` 的附件仅有 `{ type: 'image', url }` 声明，composer 无粘贴/拖拽/进度/预览；`ai-elements` 的消息模型是单一 `content: string`，装不下工具调用、推理过程、附件等异构内容。arrow-js Widget 沙箱运行时（core-app `widget-registry.ts`）已能渲染插件 Widget，但没有「AI 工具结果 → 会话内卡片」的宿主组件与契约。

## Goal

在 tuffex 建立 AI 消息的**分部（parts）模型**与对应 L2 组件：附件托盘与预览、composer 附件交互、工具调用卡片（含可嵌 Widget 的展面槽）、推理折叠块。全部以受控 props + 事件交付，不内嵌业务数据流。

## Requirements

### 消息分部模型（types）

- `ai-elements` 的消息类型扩展为分部数组（形态 design 定案），至少涵盖：`text`、`reasoning`、`tool-call`、`attachment`；保持对旧 `content: string` 形态的向后兼容（既有消费方不改代码不破坏）。
- 附件分部至少支持 image（url/dataURL + 尺寸/名称）与 file（名称、大小、mime）；工具分部含 `name`、`status: 'pending' | 'running' | 'done' | 'error'`、入参摘要、结果载荷。

### TxAttachmentTray / TxAttachmentChip

- 图片附件：缩略图网格，点击进灯箱预览（复用/对齐 image-gallery），加载失败有占位。
- 文件附件：chip 形态（图标 + 名称 + 大小），点击派发事件由消费方决定打开行为。
- 可删除模式（composer 场景）与只读模式（消息内场景）。
- 上传中状态：进度环/条 + 取消事件。

### TxAiComposer 附件交互

- 粘贴图片（ClipboardEvent）与拖拽文件进入输入区 → 派发 `attachment-add` 事件（携带 File），附件展示与删除走 TxAttachmentTray；composer 自身不做上传。
- 拖拽悬停有明确的 drop 高亮态。
- 现有 TxChatComposer 行为不回退（Enter 发送、IME 保护、submitting 态）；以扩展或新组件交付由 design 定案。

### TxToolCallCard

- 四态呈现：pending（排队）、running（执行中，流式参数/日志区）、done（结果区）、error（错误信息 + 重试事件）。
- 折叠/展开：默认折叠为一行摘要（工具名 + 状态），展开见入参与结果。
- **Widget 展面槽**：结果区提供具名插槽/渲染函数出口，宿主（core-app）可将 arrow-js Widget 挂载其中；tuffex 侧只定义容器与尺寸约束（最大高度 + 内滚动），不 import arrow-js、不触碰沙箱。
- 状态切换动画平滑（高度过渡 + 状态图标变换），尊重 `prefers-reduced-motion`。

### TxReasoningDisclosure

- 流式中：折叠头带 shimmer「思考中」态，可展开看已产出的推理文本增量。
- 结束后：折叠头显示耗时（由 props 传入），默认折叠。

### 通用约束

- 全部受控组件：数据进 props、交互出事件，组件内不发请求、不持久化。
- `--tx-*` token + 回退值；浅/深主题正确。
- 每组件带单测；导出进 `components.ts` 与分包入口。

## Acceptance Criteria

- [ ] 分部模型类型落地且旧 `content: string` 消费方（TxAiMessage/TxAiConversation 既有用法）零改动通过既有测试
- [ ] 图片附件缩略 → 灯箱预览链路可用；文件 chip 点击派发事件；上传中显示进度并可取消（mock）
- [ ] composer 粘贴图片 / 拖拽文件均派发 `attachment-add` 且有 drop 高亮；Enter/IME 行为不回退
- [ ] TxToolCallCard 用 mock 事件序列完整走四态，展开/折叠动画平滑，error 态可派发重试
- [ ] Widget 展面槽：插入任意外部渲染的 DOM/组件后尺寸受控（超高出现内滚动），tuffex 源码无 arrow-js import
- [ ] TxReasoningDisclosure 流式/完结两态正确
- [ ] `prefers-reduced-motion` 下无位移动画；浅/深主题正确
- [ ] 单测齐备，tuffex build 通过，`pnpm lint` 通过

## Notes

- 复杂任务：`design.md`（分部模型形态、兼容策略、Widget 槽契约）与 `implement.md` 齐备后方可 `task.py start`。
- core-app 侧「工具结果驱动 Widget 渲染」的实际接线属于 ④ 及后续 AI 工具链任务；本件交付组件与契约 + mock 验收。
- composer 弹出层职责维持现状：模型 + 推理强度归弹出层，工具启停归设置页（CoreBox v2.5 既定决策），本件不往 composer 加工具开关。
