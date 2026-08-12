# ③ 附件与工具卡片 技术设计

PRD：`./prd.md`。实勘补充：`TxChatComposer` 现状**无 IME `isComposing` 守卫**（HomePage 手写 composer 反而有），本件顺手补齐——这是修缺口不是回退面；`TxImageGallery` 缩略格无删除/进度 overlay 插槽，托盘不内嵌它。

## 0. 定案

| 决策 | 结论 | 理由 |
|---|---|---|
| 分部模型形态 | `AiElementMessage` 增加**可选** `parts?: AiMessagePart[]`，`content` 保留为纯文本摘要/回退 | 旧消费方零改动（无 parts → 走现有渲染路径）；parts 存在时按序渲染分部 |
| composer 扩展 vs 新组件 | **原地扩展 TxChatComposer**，不新建 TxAiComposer | 要保的行为（Enter/submitting/attachments 槽/paste 事件）全在它身上，新组件反而要复刻；扩展面是纯增量（drop 交互 + 事件 + IME 守卫） |
| 图片预览 | 托盘自渲染缩略（带删除/进度 overlay），预览走 **TxModal 基座的内置查看器**（prev/next），不内嵌 TxImageGallery | gallery 的缩略格与 modal 耦合且无 overlay 插槽；「对齐 image-gallery」以同一 TxModal 基座 + 同款交互达成 |
| TxAiMessage parts 渲染归属 | 本件落地（③），markdown 渲染器**可注入** | ④ 需要能直接用；text 分部默认 TxMarkdownView，④ 经 `markdown-renderer` 注入 TxStreamMarkdown——①③ 保持解耦 |
| Widget 展面契约 | `TxToolCallCard` 的 `result` 具名插槽 + 尺寸约束（`--tx-tool-call-card-result-max-height` 默认 320px，超高内滚动） | tuffex 零 arrow-js import；宿主（core-app）把 Widget 挂进插槽即可，沙箱职责全留宿主侧 |

## 1. 分部模型（`ai-elements/src/types.ts` 增量）

```ts
export interface AiTextPart { type: 'text', text: string }
export interface AiReasoningPart {
  type: 'reasoning'
  text: string
  done?: boolean
  durationMs?: number
}
export interface AiToolCallPart {
  type: 'tool-call'
  id: string
  name: string
  status: 'pending' | 'running' | 'done' | 'error'
  summary?: string   // 折叠头一行摘要
  input?: string     // 入参摘要（已序列化）
  output?: string    // 结果文本（无 Widget 时的回退渲染）
  error?: string
  logs?: string      // running 期流式日志
}
export interface AiAttachmentImage {
  kind: 'image', id: string, url: string, name?: string, width?: number, height?: number
}
export interface AiAttachmentFile {
  kind: 'file', id: string, name: string, size?: number, mime?: string
}
export type AiAttachment = (AiAttachmentImage | AiAttachmentFile) & {
  /** 0–1；仅上传中有意义 */
  progress?: number
  uploading?: boolean
}
export interface AiAttachmentPart { type: 'attachment', attachments: AiAttachment[] }
export type AiMessagePart = AiTextPart | AiReasoningPart | AiToolCallPart | AiAttachmentPart

export interface AiElementMessage {
  // ……现有字段全部不动
  parts?: AiMessagePart[]
}
```

- attachment 分部持**数组**（一条消息的附件成组展示为一个托盘），而非每附件一个分部。
- 判别属性 `type`/`kind` 命名对齐既有 `ChatMessageAttachment` 的 `type: 'image'` 风格。

## 2. TxAiMessage parts 渲染

- `message.parts` 存在 → 内容区按序渲染分部；不存在 → 现有路径原样（typing dots / TxMarkdownView）。既有测试必须全绿。
- 分派：`text` → markdown 渲染器（默认 TxMarkdownView；新增 `markdown-renderer` 具名插槽注入替代，④ 传 TxStreamMarkdown）；`reasoning` → TxReasoningDisclosure；`tool-call` → TxToolCallCard；`attachment` → TxAttachmentTray（只读模式）。
- TxToolCallCard 的 `result` 插槽经 TxAiMessage 透传（`tool-result` 具名插槽，slot props 携带 part），宿主在消息层就能挂 Widget。
- streaming 状态下最后一个 text 分部把 `message.status === 'streaming'` 传给渲染器（注入的 TxStreamMarkdown 才能亮光标）。

## 3. TxAttachmentTray（`attachment-tray/`）

```
TxAttachmentTray.vue   # 网格/行容器 + 图片缩略 + 文件 chip + 预览查看器
TxAttachmentChip.vue   # 文件 chip（图标 + 名称 + 大小 + 删除/取消）
```

- props：`attachments: AiAttachment[]`、`removable?: boolean（默认 false）`、文案 props（英文默认，无 i18n 惯例）。
- emits：`remove(id)`、`cancel(id)`（uploading 中）、`open(attachment)`（文件 chip 点击，打开行为归消费方）。
- 图片缩略：`object-fit: cover` 方格，hover 出删除钮（removable 时）；`uploading` 显示进度环（SVG stroke-dashoffset，`progress` 驱动）+ 取消钮；加载失败占位图标。
- 预览查看器：点击缩略开 TxModal，单图 + prev/next（多图时），Esc/遮罩关闭；只预览 image 类。
- 文件大小格式化：内置 `formatSize`（B/KB/MB，1 位小数），可被 `sizeFormatter` prop 覆盖。

## 4. TxChatComposer 扩展（原地）

- 新 emit：`attachmentAdd: [files: File[]]`。来源两处——
  - paste：`clipboardData.items` 中 `kind === 'file'` 的项转 File；命中时 `preventDefault` 阻止 dataURL 落入 textarea，**原有 `paste` 事件照发**（兼容）；
  - drop：根节点 `@dragover.prevent`/`@dragleave`/`@drop.prevent`，`dataTransfer.files` 转数组派发。
- drop 高亮：`is-dragover` 类 + 虚线边框态；dragleave 用计数器防子元素抖动（enter/leave 成对计数）。
- IME 守卫：`onKeydown` 起手 `if (e.isComposing) return`（补缺口）。
- 其余 props/emits/slots/样式零改动；既有 chat-composer 测试必须全绿。

## 5. TxToolCallCard（`tool-call-card/`）

- props：`toolCall: AiToolCallPart`、`defaultExpanded?: boolean（默认 false）`、文案 props（Retry/状态标签，英文默认）。
- emits：`retry(id)`、`toggle(expanded)`。
- slots：`summary`（折叠头自定义）、`result`（**Widget 展面**，slot props `{ toolCall }`）、`icon`。
- 折叠头：真按钮（`aria-expanded`/`aria-controls`），状态图标（pending 时钟 / running 旋转 / done 对勾 / error 叹号）+ 工具名 + summary + 状态 chip。
- 展开体：入参区（`input`，等宽字体）、running 期 `logs` 流式区（自动滚底、max-height 内滚）、done 结果区（`result` 插槽优先，无插槽回退 `output` 纯文本）、error 区（错误信息 + Retry 按钮）。
- 结果区尺寸约束：`max-height: var(--tx-tool-call-card-result-max-height, 320px); overflow: auto`。
- 展开动画：`grid-template-rows 0fr↔1fr` 过渡（免 JS 测高），状态图标切换 0.15s；`prefers-reduced-motion` 全禁。

## 6. TxReasoningDisclosure（`reasoning-disclosure/`）

- props：`text: string`、`streaming?: boolean`、`durationMs?: number`、`defaultOpen?: boolean（默认 false）`、`label?（'Reasoning'）`、`thinkingLabel?（'Thinking…'）`、`durationFormatter?: (ms) => string`（默认 `Thought for X.Xs`）。
- streaming：折叠头 label 走 shimmer（背景渐变扫过），展开可见已产出文本（`white-space: pre-wrap`，自动滚底）。
- 完结：头部显示时长，默认折叠；同 `grid-template-rows` 动画。
- 真按钮 + `aria-expanded`；文本区 v1 纯文本（PRD 允许替身，markdown 化留给后续接 TxStreamMarkdown 的消费方）。

## 7. 目录与导出

```
ai-elements/src/types.ts        # parts 模型增量
ai-elements/src/TxAiMessage.vue # parts 渲染分支
attachment-tray/                # TxAttachmentTray + TxAttachmentChip
tool-call-card/                 # TxToolCallCard
reasoning-disclosure/           # TxReasoningDisclosure
```

- `components.ts` 增 3 行（attachment-tray / reasoning-disclosure / tool-call-card，字母序）；ai-elements 既有出口顺势导出新类型。
- 实现修订：tool-call-card 的 index **不**再 re-export `AiToolCallPart`——barrel 对同名类型的双源 `export *` 会静默歧义化，该类型唯一出口留在 ai-elements。
- 零新依赖；全部受控组件（props 进、事件出），组件内不发请求。
- 文案全走 props + 英文默认（tuffex 无 i18n 惯例）；深浅主题 `--tx-*` token + 回退值。

## 8. 测试策略

- ai-elements：旧用例不动全绿 + parts 分派用例（四类分部各就位、streaming 传递、tool-result 透传）。
- attachment-tray：图片/文件混排、removable 两态、进度环 + cancel、预览开合、`open` 事件。
- chat-composer：新增 paste 图片 → `attachmentAdd` + 原 `paste` 照发、drop 文件 → 事件 + 高亮计数器、`isComposing` Enter 不发送；既有用例全绿。
- tool-call-card：mock 事件序列走四态、展开折叠 aria、error retry、result 插槽渲染 + 回退 output。
- reasoning-disclosure：streaming/完结两态、duration 格式化、展开保持。

## 9. 回滚

新目录 ×3 + components.ts 3 行 + ai-elements/chat 两处增量（各自独立可 revert，types 增量为纯可选字段）。
