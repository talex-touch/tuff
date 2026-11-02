# @talex-touch/intelligence-uikit

AI 场景 UI Kit，用于沉淀 Tuff / AI 场景中的会话、生成态、富内容渲染、工具调用卡片与 AI 动效组件。

## 定位

- 组合 `@talex-touch/tuffex` 基础组件，不复制 tuffex 已有源码。
- 承接 AI 场景中可复用的 AI UI 经验，剥离业务 API、页面状态和服务端协议。
- 会话展示已用于 CoreApp Home：宿主提供消息映射、翻译和副作用，组件负责有序片段、工具交互界面、错误和页脚。

## 入口

```ts
import {
  TxAiConversation,
  TxAiMarkdown,
  TxAiMessage,
  TxAiThinking,
} from '@talex-touch/intelligence-uikit'

import '@talex-touch/intelligence-uikit/style.css'
```

AI 对话组件（从包根导入，注意 `TxAiConversation` 的大小写）：

```ts
import { TxAiConversation } from '@talex-touch/intelligence-uikit'
```

## 组件矩阵

| 层级 | 组件 | 当前职责 | 后续升级方向 |
| --- | --- | --- | --- |
| Foundation | `TxAiReveal` | 内容渐显容器 | 段落级 reveal、stagger preset、动画 token |
| Foundation | `TxAiStreamText` | 流式文本壳层 | chunk reveal、diff、caret 特效 |
| Foundation | `TxAiThinking` | 思考中提示 | 更精致的 AI loading 动效 |
| Foundation | `TxAiLoadingHint` | 轻量加载语义 | 搜索/工具/总结等状态变体 |
| Conversation | `TxAiConversation` | 会话容器、自动跟随、回到底部、停止生成 | AI 主聊天页替换 |
| Conversation | `TxAiMessage` | AI 消息框、blocks 承载 | hover 工具栏、重试、模型信息 |
| Conversation | `TxAiComposer` | 输入框包装 | 工具按钮、附件预览、多模态输入 |
| Conversation | `TxAiSuggestion` | 追问建议 | AI suggest-card 动效升级 |
| Conversation | `TxAiAssistantTurn` | 有序推理/正文/工具片段、内置工具界面、等待/压缩状态、错误和页脚 | `tool` / `footer` / `error` 插槽覆盖 |
| Conversation | `TxAiTurnFooter` | 复制/重生成/朗读/分支操作与生成指标 | 所有副作用通过事件交还宿主 |
| Conversation | `TxAiErrorBlock` | 已解析的错误文案、报告行、恢复/重试按钮 | 宿主负责错误分类与导航 |
| Content | `TxAiMarkdown` | Markdown 渲染包装 | 流式 Markdown、代码块 header、Mermaid/Mindmap slot |
| Content | `TxAiCodeBlock` | 代码块壳层 | 高亮、copy 状态、render mode |
| Content | `TxAiRichBlock` | text/markdown/image/tool/error/card 分块渲染 | 统一 AI blocks 渲染 |
| Tool / Agent | `TxAiToolCall` | 工具调用状态卡 | 工具输入/输出折叠 |
| Tool / Agent | `TxAiResultCard` | 结果卡基类 | 搜索/天气/计算等专用卡 |
| Tool / Agent | `TxAiAgentBadge` | 模型/Agent 标识 | hover 能力说明 |
| Tool / Agent | `TxAiCitation` | 引用来源 | 网页引用、脚注列表 |
| Tool / Agent | `TxAiToolChart` | ECharts 声明式图表、系列/视图切换、FlipOverlay 数据编辑 | 不修改宿主原始 spec |
| Tool / Agent | `TxAiToolForm` | 声明式表单、必填校验、提交锁与虚拟化草稿 | `submit` / `change` 事件 |
| Tool / Agent | `TxAiToolWidget` | AI 来源标记、隔离 iframe、失败信息 | 必须注入宿主 sandbox 能力 |

## 会话展示 API

- `TxAiAssistantTurn`: 必填 `segments: TxAiSegment[]`；支持 `streaming`、`elementProps`、`toolCallProps`、`chartProps`、`formProps`、`widgetProps`、`widgetSandbox`、`submittedForms`、`formDrafts`、`showToolPayload` / `payloadLabel`、`waiting` / `thinkingVerb` / `thinkingLabel`、`compacting` / `compactingLabel`、`footer`、`error`、`motion`。`tool` 插槽默认覆盖所有工具，可通过 `hasToolFace(part)` 限制；`footer`、`error` 和默认插槽用于展示扩展。
- 工具注册表识别 `tuff_render_chart` / `tuff_render_form` / `tuff_render_widget` 及 agent-tools 的结果前缀。只解析 `done` 结果；缺少 widget sandbox 时保留普通工具输出，不运行模型代码。事件：`form-submit(part, values)`、`form-change(part, values)`、`payload(part)`、`copy(text)`、`regenerate`、`speak`、`branch`、`retry`、`error-action`。
- `TxAiToolChart`: `spec: TxAiToolChartSpec`、`animate?`、`motion?: 'none' | 'fade'`、`labels?`。`labels` 键为 `line`、`bar`、`area`、`edit`、`done`、`label`、`remove`、`addPlaceholder`、`add`、`failed`、`close`。图表本地编辑不发送请求或写回 spec。
- `TxAiToolForm`: `spec: FormSpec`、`submitted?`、`initialValues?`、`submitLabel?`、`resetLabel?`、`requiredHint?`、`submittedLabel?`、`selectPlaceholder?`；发出 `submit(values)` 和 `change(values)`。宿主保管跨虚拟化卸载的草稿和提交结果。
- `TxAiToolWidget`: `source`、`sandbox: TxAiWidgetSandbox` 必填；`title?`、`fallback?`、`labels?`、`blockedLabel?(directive)`。`labels` 键为 `generated`、`sandboxed`、`loading`、`failed`、`timedOut`。`sandbox(sourceRef, frameRef)` 返回只读 `status`、`failure`、`height`、`srcdoc` refs；宿主负责 CSP、运行时、来源校验、超时与清理，组件不加载执行运行时。
- `TxAiTurnFooter`: `content?`、`metrics?: TxAiTurnMetrics`、`resting?`、`regenerable?`、`speakState?: TxAiSpeakState`、`branchable?`、`branching?`、`showMetrics?`、`labels?`、`motion?`；发出 `copy(text)`、`regenerate`、`speak`、`branch`。复制、TTS、分支和重生成均由宿主执行。`labels` 支持操作名称、`model` / `coordinator` / `coordinatorFallback`、`cache` / `cacheTitle`、`input` / `output` / `total` / `latency` / `totalLatency` / `ttft`。
- `TxAiErrorBlock`: `title` 必填，`detail?`、`reportCode?`、`reportDetail?`、`codeLabel?`、`tone?: 'danger' | 'warning'`、`actionLabel?`、`retryable?`、`retryLabel?`；发出 `action` / `retry`。组件不识别账户、额度或路由。

组件文案均提供英文默认值。宿主通过 labels 或独立文案 prop 本地化，不向包中注入 i18n 实例。

纯展示工具也从包根导出：`toMessageSegments(parts, streaming, labels)`、`toolFaceOf(part)`、`parseToolResult(part, prefix)`、`INTERRUPTED_TOOL_CALL_ERROR`、`describeToolCallError(error, translate)`、`THINKING_VERBS`、`rollThinkingVerb`、`rollNextThinkingVerb`、`useThinkingTicker`、`useTurnFooterState`、`formatMetricLatency`、`formatTokenCount`、`calculateTokenSpeed`、`metricTokensTitle`、`metricLatencyTitle`。宿主保留业务消息类型转换、错误恢复分类、设置、提交、导航和音频生命周期。

仅需纯逻辑的调用方使用 `@talex-touch/intelligence-uikit/utils`，避免导入组件、样式及富内容渲染依赖。

`motion="none"` 关闭组件自有过渡，CSS 动效也遵守 `prefers-reduced-motion`。

## OpenUI 生成式界面

`TxAiAssistantTurn` 会把文本段里的 ` ```openui ` 围栏交给 `TxAiOpenUI` 渲染（其余仍走 `TxStreamElement`），动作通过 `openui-action` 事件交给宿主：`continue_conversation` 作为下一条用户消息，`open_url` / `copy_to_clipboard` 由宿主执行。`openui` prop 设为 `false` 可关闭围栏渲染；`openuiLabels`、`resolveOpenuiImage` 由宿主提供文案和 `SearchImage` 的图片解析。

模型端提示词从纯入口 `@talex-touch/intelligence-uikit/openui-prompt` 取（无 Vue / echarts 依赖，主进程可用）。已实现：Col、Row、Box、Grid、Card、Carousel、Divider、Spacer、Title、Text、Caption、Label、Badge、Link、List、ListItem、Markdown、Quote、Code、Button、IconButton、Input、TextArea、Select、SegmentedControl、Slider、Checkbox、RadioGroup、Form、Image、SearchImage、Icon、Table、Chart。未实现：Map、Svg、HtmlView、Math、YouTube、Flashcard、Celebration、DatePicker、Timer、Popover、Query / Mutation。

## 动效扩展规范

- 所有 AI 动效组件必须支持 `motion="none"` 或等效关闭方式。
- 组件样式使用 `tx-ai-*` class 前缀。
- 动画时长、延迟、颜色使用 CSS variables 暴露。
- 默认实现只处理通用体验，不绑定 业务数据结构。

## AI block mapping 边界

`@talex-touch/intelligence-uikit` 的对话组件只提供：

- AI block 到 `TxAiRichBlock` 的映射。
- AI message 到 `TxAiMessageModel` 的映射。
- `TxAiConversation` / `TxAiMessage` 组件导出。

禁止放入：

- 网络请求。
- 会话持久化。
- 额度、账号、支付、路由等 业务逻辑。

## 校验

```bash
pnpm -C "packages/intelligence-uikit" run lint
pnpm -C "packages/intelligence-uikit" run typecheck
pnpm -C "packages/intelligence-uikit" run test
```
