# @talex-touch/intelligence-uikit

AI 场景 UI Kit，用于沉淀 Tuff / Pilot 中的会话、生成态、富内容渲染、工具调用卡片与 AI 动效组件。

## 定位

- 组合 `@talex-touch/tuffex` 基础组件，不复制 tuffex 已有源码。
- 承接 Pilot 中可复用的 AI UI 经验，剥离业务 API、页面状态和服务端协议。
- 第一阶段只落地包结构、组件边界与扩展点；复杂特效动画后续逐步增强。

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

Pilot 兼容入口：

```ts
import {
  mapPilotChatBlocksToAiBlocks,
  TxPilotConversation,
} from '@talex-touch/intelligence-uikit/pilot'
```

## 组件矩阵

| 层级 | 组件 | 当前职责 | 后续升级方向 |
| --- | --- | --- | --- |
| Foundation | `TxAiReveal` | 内容渐显容器 | 段落级 reveal、stagger preset、动画 token |
| Foundation | `TxAiStreamText` | 流式文本壳层 | chunk reveal、diff、caret 特效 |
| Foundation | `TxAiThinking` | 思考中提示 | 更精致的 AI loading 动效 |
| Foundation | `TxAiLoadingHint` | 轻量加载语义 | 搜索/工具/总结等状态变体 |
| Conversation | `TxAiConversation` | 会话容器、自动跟随、回到底部、停止生成 | Pilot 主聊天页替换 |
| Conversation | `TxAiMessage` | AI 消息框、blocks 承载 | hover 工具栏、重试、模型信息 |
| Conversation | `TxAiComposer` | 输入框包装 | 工具按钮、附件预览、多模态输入 |
| Conversation | `TxAiSuggestion` | 追问建议 | Pilot suggest-card 动效升级 |
| Content | `TxAiMarkdown` | Markdown 渲染包装 | 流式 Markdown、代码块 header、Mermaid/Mindmap slot |
| Content | `TxAiCodeBlock` | 代码块壳层 | 高亮、copy 状态、render mode |
| Content | `TxAiRichBlock` | text/markdown/image/tool/error/card 分块渲染 | 统一 Pilot blocks 渲染 |
| Tool / Agent | `TxAiToolCall` | 工具调用状态卡 | 工具输入/输出折叠 |
| Tool / Agent | `TxAiResultCard` | 结果卡基类 | 搜索/天气/计算等专用卡 |
| Tool / Agent | `TxAiAgentBadge` | 模型/Agent 标识 | hover 能力说明 |
| Tool / Agent | `TxAiCitation` | 引用来源 | 网页引用、脚注列表 |

## 迁移路径

### Phase 1：落地包结构

- 新增 `packages/intelligence-uikit`。
- 提供 `@talex-touch/intelligence-uikit`、`@talex-touch/intelligence-uikit/pilot`、`@talex-touch/intelligence-uikit/style.css`。
- README 固化组件矩阵、迁移策略、动效扩展规范。
- 只提供组件骨架和稳定扩展点。

### Phase 2：包装 tuffex 现有组件

- 复用 `TxMarkdownView`、`TxChat*`、`TxTypingIndicator`、`TxTransition`、`TxStagger`、`TxTextTransformer`。
- 保持 tuffex 作为基础组件库，`intelligence-uikit` 只承载 AI 场景组合。

### Phase 3：迁移 Pilot 可复用 UI

- 从 `ThChat` 提取滚动跟随、回到底部、停止生成模式。
- 从 `ChatItem` 提取消息分块、建议卡、工具栏模式。
- 从 article renderer 提取富内容壳层，不迁入业务 API。

### Phase 4：Pilot 渐进替换

- 在 `apps/pilot` 增加 `@talex-touch/intelligence-uikit` 依赖。
- 更新 Nuxt alias / transpile。
- 先替换低风险内部组件，再替换主聊天页。

### Phase 5：动画升级

- 由组件自身提供默认可用动画。
- 高级效果通过 `motion` prop、CSS variables、class 与 slot 扩展。
- 默认尊重 `prefers-reduced-motion`。

## 动效扩展规范

- 所有 AI 动效组件必须支持 `motion="none"` 或等效关闭方式。
- 组件样式使用 `tx-ai-*` class 前缀。
- 动画时长、延迟、颜色使用 CSS variables 暴露。
- 默认实现只处理通用体验，不绑定 Pilot 数据结构。

## Pilot mapping 边界

`@talex-touch/intelligence-uikit/pilot` 只提供：

- Pilot block 到 `TxAiRichBlock` 的映射。
- Pilot message 到 `TxAiMessageModel` 的映射。
- `TxPilotConversation` / `TxPilotMessage` 兼容导出。

禁止放入：

- 网络请求。
- 会话持久化。
- 额度、账号、支付、路由等 Pilot 业务逻辑。

## 校验

```bash
pnpm -C "packages/intelligence-uikit" run lint
pnpm -C "packages/intelligence-uikit" run typecheck
pnpm -C "packages/intelligence-uikit" run test
```
