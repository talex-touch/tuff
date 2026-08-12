# A. AI Elements P0 复刻 技术设计

PRD：`./prd.md`。清单：`research/ai-elements-catalog.md`。

## 0. 定案

| 决策 | 结论 |
|---|---|
| ChainOfThought 是否组合 TxTimeline | **独立实现**：Timeline 只有 title/icon/color 面，无流式正文/状态机/折叠；视觉借鉴其竖线语言 |
| Sources 是否进 parts | **进**：`AiSourcesPart { type:'sources', sources: AiSourceItem[] }` 加入联合（可选、零破坏），TxAiMessage 分派渲染；Confirmation/Suggestion/Context 为会话层 UI，**不进 parts** |
| Confirmation 形态 | 会话流内嵌卡（非模态）：工具执行是会话叙事的一部分，模态会打断流式阅读 |
| 记忆粒度（父任务开放决策 3） | 组件只报意愿：`approve/deny` 事件携 `remember: boolean`（label「本会话记住」）；持久化策略归 B 的会话层 |

## 1. 类型扩展（ai-elements/src/types.ts，全部可选/新增）

```ts
export interface AiSourceItem { id: string, url: string, title?: string, favicon?: string }
export interface AiSourcesPart { type: 'sources', sources: AiSourceItem[] }
export type AiMessagePart = ... | AiSourcesPart          // 联合扩一员
export interface AiSuggestion { id: string, text: string }
export interface AiChainStep {
  id: string
  kind: 'thinking' | 'tool'
  title: string
  body?: string
  status: 'active' | 'done' | 'error'
}
```

- AiChainStep 由消费方（B）从 parts 序列派生（thinking 段 + tool 调用天然成步骤），组件不自行读 parts。

## 2. 组件面（各自 kebab 目录，惯例齐套）

### TxToolConfirmation（tool-confirmation/）
- props：`toolName`、`summary?`、`input?`（等宽预格式）、`risk?: 'read' | 'write' | 'execute'`（色条与图标分级）、文案 props（allowLabel='Allow' / denyLabel='Deny' / rememberLabel='Remember for this session'）
- emits：`approve: [{ remember: boolean }]`、`deny: [{ remember: boolean }]`
- remember 为内部 checkbox 状态；两按钮真 button、键盘可达；risk=write/execute 时 Allow 按钮走 danger 色

### TxSources（sources/）
- props：`sources: AiSourceItem[]`、`label?`（默认 "Used {n} sources"，函数 prop `labelFormatter?` 覆盖）、`defaultOpen?=false`
- 折叠沿 grid-rows 0fr↔1fr；条目：序号 + favicon(img, onerror 隐藏) + title(缺省用域名) + 域名 muted；条目为 `<a>` 派发 `open(source)` 事件并 preventDefault（打开行为归宿主）

### TxSuggestionChips（suggestion-chips/）
- props：`suggestions: AiSuggestion[]`；emits：`select: [AiSuggestion]`
- 单行横向滚动（overflow-x auto + 两端 CSS mask 渐隐），chip 真 button

### TxContextIndicator（context-indicator/）
- props：`usedTokens: number`、`maxTokens: number`、`label?`、`formatter?: (used, max) => string`（默认 "12.3K / 200K"）
- SVG 进度环（复用 attachment-tray 的 stroke-dashoffset 模式）+ 百分比数字；>80% warning 色、>95% danger 色；`title` 原生提示 + `detail` 具名插槽

### TxChainOfThought（chain-of-thought/）
- props：`steps: AiChainStep[]`、`streaming?`、`defaultOpen?=true`、`label?='Chain of Thought'`
- 结构：折叠头（label + 步数）+ 竖线时间线；步骤图标按 kind/status（thinking=灯泡、tool=扳手；active=旋转、error=danger）；active 步骤 body 流式追加自动滚底（复用 reasoning 的 tail-follow 模式）
- 尾步 active 时头部 label shimmer（对齐 TxReasoningDisclosure 观感）

## 3. 测试与注册

- 每件 `__tests__` 覆盖：状态/事件/键盘/文案 props/主题类；Sources 的 parts 分派进 ai-elements 测试（TxAiMessage 渲染 AiSourcesPart）
- `components.ts` 字母序注册 ×5；类型出口经 ai-elements（parts 相关）与各自 index

## 4. 回滚

新目录 ×5 + types 可选扩展 + components.ts 五行，逐件可弃。
