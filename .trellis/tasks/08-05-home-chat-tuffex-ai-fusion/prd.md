# ④ 主界面聊天融合（HomePage 接入 tuffex/ai 系列）

父任务：`.trellis/tasks/08-05-tuffex-ai-suite`
依赖：①（stream-markdown）、②（conversation-stream）、③（attachments-toolcards）；并与 `.trellis/tasks/08-04-home-conversation`（R2/R3）协同，见「边界」。

## 背景

HomePage 当前的消息流是纯文本 `<p>` + 手写 stick-to-bottom；`useHomeConversation` 的消息模型是单一 `content: string`。①②③ 交付后，首页要整体切到 tuffex AI 系列：流式 Markdown、虚拟滚动、附件、（渲染层面的）工具卡片。

## Goal

HomePage 的消息流与 composer 全面接入 tuffex AI 组件系列，达到 ChatGPT 网页版级别的流式观感，且 08-04 R1/R1.5 全部既有行为不回退。

## Requirements

### 消息流替换

- `HomePage-Stream` 区域替换为 `TxConversationStream`，消息项用 ai-elements 系（助手消息内容走 TxStreamMarkdown，用户消息保持气泡）。
- 流式期间：逐块淡入、尾部光标、代码高亮、mermaid 闭合出图——①的能力在真实 `useHomeConversation` 流上全部生效。
- 历史 loader 接线：08-04 R2 未落地前接「无更多历史」（`hasMore: false`）；接口形态与 R2 的 conversation transport 对齐，R2 落地后仅换数据源不改 UI。
- 现有错误呈现（provider 未配置引导、重试、错误气泡）、TxTypingIndicator 等待态、stop/retry 语义全部保留。

### composer 升级

- 附件交互接入（粘贴/拖拽图片、附件托盘、删除）；「+」按钮从死按钮变为文件选择入口。
- 附件的**发送降级**：`IntelligenceMessage.content` 仅支持 string（多模态扩展在父任务「明确不做」），附件本轮到 UI 为止——发送时附件不进 provider payload，UI 上要给出明确的「当前模型不接收附件」提示态，不静默丢弃。
- 模型胶囊、Auto Context、语音占位等既有 affordance 不动；工具启停继续归设置页。

### 视觉与主题

- `--shell-*` ↔ `--tx-*` token 桥接：tuffex 组件在首页呈现 shell 设计语言（文字、边框、圆角、危险色），桥接写在 core-app 侧样式，不改 tuffex。
- 消息列宽维持 720px 列与 composer 同列的既有版式；浮动 composer 的测高联动（`--home-composer-height`）机制保留或由 TxConversationStream 的等价能力替代。
- 深浅主题切换即时正确（mermaid/代码高亮主题跟随）。

### 行为不回退清单（08-04 R1/R1.5）

- 流式不可用时兜底非流式，兜底对用户不可见
- 停止键取消流、已产出增量保留；空回复气泡按失败态处理
- provider 未配置时给出通往 `/intelligence/channels` 的可操作引导
- Enter 发送 + Shift+Enter 换行 + IME composing 保护
- 空态 ↔ 会话态同路由切换、首发不丢输入焦点
- 组合式单测（useHomeConversation 既有 11 例及后续新增）全绿

## Acceptance Criteria

- [ ] 真实流式回复含长文 + 代码块 + mermaid：逐块淡入、光标、闭合出图，滚动全程不整页重排
- [ ] 注入 500 条内存历史后滚动流畅、DOM 有界；触顶显示「无更多历史」（R2 前）且无跳动
- [ ] 粘贴/拖拽图片出现附件缩略并可预览删除；发送时有明确降级提示，不静默丢弃
- [ ] 「行为不回退清单」逐项人工核验 + 既有单测全绿
- [ ] 浅/深主题下首页会话整体渲染正确
- [ ] `apps/core-app` `npm run typecheck` 与 `pnpm lint` 通过

## Notes

- 复杂任务：`design.md`（token 桥接映射表、消息模型适配层、loader 接口对齐 R2）与 `implement.md` 齐备后方可 `task.py start`。
- 若实施期间 08-04 R2 已落地，历史 loader 直接接 conversation transport，验收改为真实分页；以当时 `task.py list` 状态为准。
- 工具卡片在首页的真实触发（tool loop）不在本件：首页对话仍 `--no-tools`，本件只保证渲染管线就位（mock 数据可展示）。
