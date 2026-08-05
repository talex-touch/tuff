# TuffEx AI 组件系列与主界面聊天融合

父任务：无（本任务是任务树的根）。
关联任务树：`.trellis/tasks/08-04-home-conversation`（R2 持久化 / R3 侧栏历史，均未开始）——本任务树与其共享首页对话这块阵地，边界见「与 08-04 的分工」。

## 背景

用户原始需求（2026-08-05）：梳理一套 tuffex ai 系列组件并融合主界面聊天——

1. 流式渲染要参考 ChatGPT 网页版，炫酷；
2. 上下文消息支持上拉刷新加载历史与虚拟滚动；
3. 内容做流式 Markdown 渲染并融合 mermaid；现有 arrow-js（插件 Widget 运行时）交给 AI 相关工具调用；
4. 发散项：图片渲染、图片上传附件、附件预览等，动画丝滑炫酷。

现状盘点（2026-08-05 实勘）：

| 资产 | 现状 | 与需求的差距 |
|---|---|---|
| `tuffex/markdown-view` | marked + dompurify 懒加载，每次 content 变更**全文重 parse** | 流式下每个 delta 触发全量重渲染；无代码高亮、无 mermaid、无流式光标 |
| `tuffex/ai-elements` | TxAiMessage/TxAiConversation，四角色、streaming 状态、blur-reveal 动画 | 无消息分部（parts）模型、无工具卡片、无附件、无推理块 |
| `tuffex/chat` | Composer/Message/List/TypingIndicator（6 变体） | 附件仅有 image 类型声明，无粘贴/拖拽/进度/预览 |
| `tuffex/virtual-list` | 仅固定 `itemHeight` | 聊天消息动态高度，不可用 |
| `tuffex/scroll` | better-scroll + pull-down/pull-up 插件已就位 | 接管原生滚动，与虚拟化两套体系，需取舍 |
| 可复用件 | image-gallery、image-uploader、file-uploader、copy-button、code-editor(CodeMirror)、gsap | 直接进附件/代码块/动画 |
| `HomePage.vue` | 纯文本 `<p>{{ content }}</p>` + 手写 stick-to-bottom | 无 Markdown、无虚拟滚动、无历史加载 |
| `useHomeConversation` | 完整流式管线（delta/usage/兜底/retry/stop），消息内存态 | 无消息分部、无附件、无分页接口 |
| arrow-js Widget 运行时 | `widget-registry.ts` 沙箱运行时，已注入 `TuffexAiElements` | 尚无「AI 工具结果 → Widget 卡片」的宿主与契约 |
| `IntelligenceMessage` | `content: string`（`packages/utils/types/intelligence.ts:384`） | **无多模态分部**，图片附件当前到不了 provider |

## 目标

在 tuffex 沉淀一套可独立发布、可被插件 Widget 复用的 AI 组件系列（L1 渲染原语 → L2 消息层 → L3 会话层），并以其重构首页聊天的消息流与 composer，达到 ChatGPT 网页版级别的流式观感。

## 任务图

| 子任务 | 交付物 | 依赖 |
|---|---|---|
| ① `08-05-tuffex-ai-stream-markdown` | TxStreamMarkdown（块级增量解析 + 流式光标 + 逐块淡入）、TxCodeBlock（懒加载高亮 + 复制）、TxMermaidBlock（围栏闭合后渲染） | 无 |
| ② `08-05-tuffex-ai-conversation-stream` | TxConversationStream（动态高度虚拟滚动 + stick-to-bottom + 触顶历史加载 + prepend 视口锚定 + 回底悬浮钮） | 无 |
| ③ `08-05-tuffex-ai-attachments-toolcards` | 消息分部（parts）模型、TxAttachmentTray/Chip + 预览、TxAiComposer 附件升级（粘贴/拖拽/进度）、TxToolCallCard（四态 + arrow-js Widget 展面契约）、TxReasoningDisclosure | 与 ① 弱耦合（工具卡片内文本走 StreamMarkdown） |
| ④ `08-05-home-chat-tuffex-ai-fusion` | HomePage 消息流替换为 ①②③ 组合；useHomeConversation 扩展消息分部与历史 loader 接口；shell token 桥接 | ①②③ |

①②③ 均落在 `packages/tuffex`，可并行；④ 落在 `apps/core-app`，收尾集成。

## 与 08-04 的分工

- **持久化与会话路由**（两张表、conversation transport、`/home/c/:id`）归 08-04 R2；本任务树**不建数据层**。
- ② 的触顶历史加载只定义**异步 loader 接口**（`loadOlder(): Promise<Message[]>` 形态），用内存假数据即可验收；④ 在 R2 落地前将 loader 接为「无更多历史」，R2 落地后由 08-04 侧接管接线。
- ④ 不得回退 08-04 R1/R1.5 已验收的行为：流式兜底、stop/retry、provider 未配置引导、IME 回车保护、首发不丢焦点。

## 跨子任务约束

- 新组件一律进 `packages/tuffex/packages/components/src/<kebab-dir>`，命名 `Tx*`，导出与既有 `components.ts` / 分包入口一致。
- 主题只依赖 `--tx-*` token（带回退值）；core-app 侧用 `--shell-*` 桥接，不在 tuffex 内引用 shell token。
- 重依赖（mermaid、代码高亮器）必须动态 import，不得进初始 chunk；SSR/无 `document` 环境安全（沿用 `hasDocument()` 守卫惯例）。
- Markdown 输出保持 dompurify 消毒路径，流式增量不得绕过消毒。
- 动画规格：入场/揭示动画尊重 `prefers-reduced-motion`；已有 gsap 依赖可用，但纯 CSS 能达成的优先 CSS。
- 每个新组件带单测（既有 `__tests__` 惯例）；`pnpm lint` 与 tuffex build、core-app `npm run typecheck` 全绿。

## 跨子任务验收标准（父任务集成审查）

- [ ] 首页发送一条含代码块 + mermaid 围栏的长回复：流式期间逐块淡入、尾部光标闪烁、代码高亮、围栏闭合后 mermaid 出图、全程不整页重排
- [ ] 500 条历史消息注入后：滚动流畅（虚拟化生效，DOM 节点数有界）、触顶拉取更旧消息时视口不跳动、新增流式消息 stick-to-bottom 生效、离底后出现回底悬浮钮
- [ ] composer 粘贴/拖拽图片出现缩略附件，可预览（灯箱）可移除；文件附件显示 chip；不支持多模态的 provider 场景有明确降级表现
- [ ] 工具卡片在 mock 工具事件下完整走 pending → running → done/error 四态，done 态可渲染 arrow-js Widget 展面
- [ ] 08-04 R1/R1.5 验收项全部不回退
- [ ] 所有新组件在浅/深主题下均正确渲染

## 明确不做（本任务树）

- AI 工具调用的**发起链路**（tool loop、工具授权）：首页对话现阶段 `--no-tools`（08-04 R1.5 决策）；本任务树只交付工具卡片的渲染契约与 mock 验收。
- `IntelligenceMessage` 多模态扩展（图片进 provider payload）：牵动主进程 provider 层，另立任务；附件先到 UI 与（R2 后的）持久化为止。
- 会话持久化、历史分桶侧栏（08-04 R2/R3 范围）。
- 语音输入、消息编辑重发、分支对话。

## 开放决策（进入子任务 design 前须定案）

1. **触顶加载机制**：倾向原生滚动 + 顶部 sentinel + scroll anchoring（与虚拟化兼容、桌面直觉）；better-scroll pull-down 仅作为非虚拟短列表的备选。② design 定案。
2. **代码高亮器选型**：shiki（显示级、懒加载、与 CodeMirror 编辑场景分开）vs 复用 CodeMirror。① design 定案。
3. **mermaid/高亮器依赖形态**：tuffex `dependencies`（动态 import 分包）vs optional peer。① design 定案。

## Notes

- `ai-elements-vue@^1.5.0` 挂在 tuffex dependencies 但源码零引用，①~③ 落地时评估移除。
- 流式渲染的「炫酷」以 ChatGPT 网页版为对标：逐 token/块淡入、尾部光标、代码块工具条、平滑高度过渡；不引入整屏粒子类效果。
