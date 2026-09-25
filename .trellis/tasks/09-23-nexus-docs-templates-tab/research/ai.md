# Research: AI 分组模板（AgentChat 智能体对话 / Research 研究助手）组件调研

- **Query**: 为「模板 Templates」tab 的 AI 分组（AgentChat、Research）收集真实 tuffex 组件的导入方式、API、动效控制、尺寸、BUI/暗色表现、可借鉴 demo 与坑点，并给出两份组合方案。
- **Scope**: internal（tuffex 源码 + Nexus demo 机制 + 文档页 + spec）；未做外部检索。
- **Date**: 2026-09-23
- **基线**: 全部组件源码与 `packages/tuffex/dist`（2026-09-23 18:07 构建）一致——AI 组件目录下没有比 dist 更新的源文件，Nexus dev 默认吃 dist，读到的行为即页面行为。

---

## 结论速览

1. **组件零 import**：`apps/nexus/modules/tuffex-components.ts` 把每个组件 barrel 里的 `Tx*`/`Tuff*` 导出全局注册；模板里直接写 `<TxAgentTrace>`。类型用 `import type { … } from '@talex-touch/tuffex/<目录>'`；composable（`useStickToBottom` 等）**不会被注册**，要显式 value import。
2. **重置契约**：`TuffDemoWrapper` 按 `resetDemo ?? replayDemo ?? reset ?? replay` 调 demo 实例方法，失败或缺失则 `renderKey++` 整体重挂载。异步组件的 ref 会被 Vue 3.5.39 转发到内层组件，所以 `<script setup>` 里 `defineExpose({ resetDemo })` 即可生效（先例 `ProgressBarUploadDemo.vue:62`）。
3. **所有 AI 组件都是受控原语**：时间轴（逐行、逐字、状态推进）全部由 demo 持有；组件只自带入场/加载动画和少数内部计时（WorkingIndicator 计时、ApprovalCard 自动翻页、ContextChunk 胶囊延迟、MessageActions「已复制」）。
4. **`TxApprovalCard` 不是授权闸门**：它是「澄清问题问卷」。允许/拒绝写文件的闸门是 `TxToolConfirmation`。AgentChat 的「审批」要两者分工。
5. **`TxStreamMarkdown` / `TxMarkdownView` 走 `v-html`**：流式 markdown 里放不进 `TxInlineCitation` 组件；markdown 链接点击会真的导航 docs 页。Research 的「带引用的答案」需要拆成「逐词段落 + 行内引用组件」和「流式 markdown 表格」两段。
6. **尺寸硬约束**：`TxConversationStream`、`TxTabs`、`TxAgentsList` 都是 `height: 100%`，父级必须有确定高度；BUI 卡片自带上限（ToolChips/ApprovalCard 320px，RecommendationCard 380px，ContextCards 默认 380px 可用变量改）。
7. **docs 正文样式会漏进 demo**：docs 正文是 `.docs-prose.markdown-body.prose`，只有 `.not-prose` 子树被排除。模板根节点必须加 `not-prose`，否则 `p/ul/li/code/table/a` 会带上 prose 样式（InsightMetric、CodeStream 都渲染 `<code>`）。
8. **本地化缺口**：组件默认文案全是英文，必须逐个传 zh 文案；少数无法覆盖（ConversationStream 回底按钮 `aria-label`、`TxAiMessage` 的状态标签与 parts 内嵌组件文案、TxTabs 空态、ToolConfirmation 的 `aria-label` 后缀）。
9. **无阻塞项**，但有三处需要主 agent 先定：展开浮层的高度契约（CSS 变量或 `height:100%`）、闸门是否「闲置自动继续」、Research 引用的呈现方式（见各方案）。

---

## Files Found

| 路径 | 说明 |
|---|---|
| `apps/nexus/app/components/content/TuffDemoWrapper.vue` | 窗口外框、重置按钮、视口懒激活、重置分发（:76-110） |
| `apps/nexus/app/components/content/TuffDemoClientRenderer.client.vue` | 异步 demo 渲染、`ref` 采集实例（:100、:109） |
| `apps/nexus/app/components/content/demo-loader.ts` | `defineAsyncComponent`（delay 200 / timeout 15000） |
| `apps/nexus/app/components/content/demo-lazy.ts` | 激活提前量 `DEMO_LAZY_ROOT_MARGIN = '240px 0px'` |
| `apps/nexus/app/components/content/demo-registry.ts` | 字母序注册表 |
| `apps/nexus/modules/tuffex-components.ts` | tuffex 组件全局注册（Nuxt `addComponent`） |
| `apps/nexus/nuxt.config.ts:553-558, 583-588, 666-675` | tuffex 路径别名、TS paths、i18n（`no_prefix`，locale `en`/`zh`） |
| `apps/nexus/build/tuffex-dev-mode.ts` | dev 默认 dist 模式；`NUXT_TUFFEX_SOURCE=true` 切源码 |
| `apps/nexus/uno.config.ts:17-26` | UnoCSS 只扫 `.vue` 等模板文件与 `app/(data|composables|utils)/*.ts` |
| `apps/nexus/build/check-icon-collections.mjs` | 图标集门禁：仅 carbon / cib / logos / twemoji |
| `apps/nexus/app/pages/docs/[...slug].vue:2091, 2618-2740` | 正文容器 `.docs-prose.markdown-body.prose` 与 `:not(:where(.not-prose, .not-prose *))` 规则 |
| `apps/nexus/app/components/content/demos/AiSuiteChatShowcaseDemo.vue` | 先例：380px 聊天卡（FlatRadio + AiMessage + ChainOfThought + ChatComposer） |
| `apps/nexus/app/components/content/demos/AiSuiteStreamingAnswerDemo.vue` | 先例：逐词显影 + 单个行内引用 + Sources 堆叠 + 追问列表；含 reduced-motion 定格写法 |
| `apps/nexus/app/components/content/demos/AiElementsAiConversationDemo.vue` | 先例：3 条消息的 `TxAiConversation` |
| `packages/tuffex/packages/components/src/<slug>/` | 各组件源码（逐个见下文 cheat sheet） |
| `packages/tuffex/packages/components/src/ai/index.ts` | `@talex-touch/tuffex/ai` 套件入口（29 个目录） |
| `packages/tuffex/packages/components/style/bui-tokens.scss` | `--tx-bui-*` 亮/暗两套值（:18-77 / :79-139） |
| `packages/tuffex/packages/components/style/variables.scss:391-470` | tuffex 暗色 ramp；`--tx-fill-color-blank: transparent`（:449） |
| `packages/tuffex/packages/components/style/mixins.scss:182-236, 378-430` | `bui-scope` 局部 reset；BUI 动效 mixin 自带 reduced-motion 保护 |

---

## Import convention

**1. 组件：不 import，直接用全局名。**

- `apps/nexus/modules/tuffex-components.ts:30` 匹配 `^(?:Tx|Tuff)[A-Z]…`，读取每个组件目录 `src/<dir>/index.ts` 的 `export { … }`，并跟随一层 `export *`。`ai` / `base` / `pro` / `utils` 这几个聚合目录会被跳过（:37），每个名字只调用一次 `addComponent`（:88-141）。
- dev（默认 dist 模式）解析到 `@talex-touch/tuffex/<dir>` → `packages/tuffex/dist/es/<dir>/index.js`；生产构建和 `NUXT_TUFFEX_SOURCE=true` 解析到 `@tuffex-components/<dir>` → 源码。
- 现有 AI demo 对组件全部零 import（最多只 import 类型），例如 `AiSuiteChatShowcaseDemo.vue:99-129`、`AgentTraceStepsDemo.vue:92`。
- **组件名以 barrel 为准**，与任务描述里的简称不同：没有 `TxChat` 或 `TxAgents`。实际名字是 `TxChatList` / `TxChatMessage` / `TxChatComposer` / `TxTypingIndicator`（chat 目录），以及 `TxAgentsList` / `TxAgentItem`（agents 目录）。AiElements 对应 `TxAiConversation` / `TxAiMessage`。

**2. 类型：`import type { … } from '@talex-touch/tuffex/<dir>'`（主流写法）。**

- 例子：`ChatChatListDemo.vue:2`（`@talex-touch/tuffex/chat`）、`AiElementsAiConversationDemo.vue:2`（`@talex-touch/tuffex/ai-elements`）、`ComponentsDataOperationsDemo.vue:2`。
- 另有 8 个 demo 用 Nexus 专属别名 `@tuffex-components/<dir>`，例如 `PromptBarPromptBarDemo.vue:2`。它能工作，但这是站内别名，读者抄不走；模板的 mdc `code:` 片段应该写公开子路径 `@talex-touch/tuffex/<dir>`。
- `@talex-touch/tuffex/ai` 也能解析（`dist/es/ai/index.d.ts` 存在），但没有 demo 这样用，只建议拿来引类型。
- 类型散落位置：`AiToolCallPart`、`AiSourceItem`、`AiChainStep`、`AiSuggestion`、`AiElementMessage`、`AiAttachment` 都**只从 `ai-elements` 导出**（tool-call-card、sources、chain-of-thought、suggestion-chips 的 index 故意不再导出）。
- **`CodeDiffRow` 没有公开导出**（`dist/es/code-stream/index.d.ts` 只导出 `CodeStreamProps`），可以用 `type CodeDiffRow = NonNullable<CodeStreamProps['diff']>[number]` 取得。

**3. composable 和函数：必须显式 value import，不会被全局注册**（`.trellis/spec/frontend/bui-component-family.md` 注册链第 3 条）。

- `useStickToBottom` / `createPositionCache` 来自 `@talex-touch/tuffex/conversation-stream`。
- `useTokenMenu` / `parseToken` 来自 `prompt-bar`。
- `useElapsed` / `formatElapsed` 来自 `working-indicator`。
- `createBlockStream` / `completeInlineMarkup` 来自 `stream-markdown`。
- `formatSize` 来自 `attachment-tray`。
- `toast` / `useZIndexAllocator` 来自 `@talex-touch/tuffex/utils`。

**4. 周边约定。**

- **i18n**：
  - 用自动导入的 `useI18n()`，多数 demo 如此；AiSuite 两个 demo 则显式 `from 'vue-i18n'`。
  - locale 码是 `'zh'` / `'en'`，判断写 `locale.value === 'zh'` 或 `startsWith('zh')`。
  - 策略 `no_prefix`（`nuxt.config.ts:674`），切换语言是**原地响应式**的，不能指望页面重挂载。所有文案都放进 `computed` 的 `copy`；时间轴要么只重新取文案，要么 `watch(locale, resetDemo)` 重放（先例 `ToolChipsRunFlowDemo.vue:157`）。
- **reduced-motion 探测**：`import { hasWindow } from '@talex-touch/utils/env'`，写法同 `AiSuiteStreamingAnswerDemo.vue:74-86`。
- **图标**：只能用已安装的 `@iconify-json/{carbon,cib,logos,twemoji}`，class 字面量要写在 `.vue` 文件里，demos 目录下的 helper `.ts` 不会被 Uno 扫到。已核对存在：`i-carbon-plug/paste/document/bot/terminal/stop/ai-generate/scan-alt/translate/image-search/data-view/model/earth/list-checked/chart-bar/idea/renew/maximize`。**不存在**：`i-carbon-clipboard`、`text-recognition`、`ocr`、`sparkles`、`windows`、`command-line`。
- **命名与注册**：`demos/Template<Name>Demo.vue` 加一行字母序注册（`TemplateAgentChatDemo`、`TemplateResearchDemo`）。helper 组件可以放在 demos 旁，但必须被某个 demo 以 `from './X.vue'` 引入，否则会被 `check-demo-registry-orphans.mjs` 判为孤儿。

---

## Demo reset/replay contract

**调用链（已核对源码）**

1. `TuffDemoWrapper.vue:94-110`：`resetDemo()` 仅在 `isDemoActive` 且未在重置中时执行。`tryInvokeDemoReset()`（:81-92）按 `instance.resetDemo ?? instance.replayDemo ?? instance.reset ?? instance.replay` 取第一个，然后 `await handler.call(instance)`。没有方法或抛错时走 `hardResetDemo()`：`demoRenderKey += 1`，整块重挂载（:76-79、:104-106）。
2. 实例来源：`TuffDemoClientRenderer.client.vue:109` `<component :is="demoComponent" :key="props.renderKey" ref="demoInstanceRef" />`；:100 在 `flush: 'post'` 时 `emit('instance-change')` 回传给 wrapper（:112-114）。
3. `demoComponent` 是 `defineAsyncComponent`（`demo-loader.ts:9-17`）。Vue 3.5.39 的 `createInnerComp` 会 `vnode.ref = ref` 把模板 ref 转发给内层组件（`node_modules/.pnpm/@vue+runtime-core@3.5.39/.../runtime-core.cjs.js:2815-2822`），`setRef` 对 async wrapper 直接跳过（:1754-1758）。因此 ref 拿到的是 **demo 自身的 expose 代理**。
4. `<script setup>` 默认闭合：**必须 `defineExpose({ resetDemo })`**，否则拿不到方法，只能退化成整块重挂载。先例：`ProgressBarUploadDemo.vue:62` `defineExpose({ replayDemo: start })`，以及 `BaseAnchorBeadDemo.vue:37`、`BaseAnchorDripDemo.vue:37`。

**激活时机**

- `TuffDemoWrapper.vue:137-155` 用 IntersectionObserver，`rootMargin` 为 `'240px 0px'`（`demo-lazy.ts:15`）。进入视口前 240px 就挂载 demo，之后 `activateDemo` 立刻断开观察。
- 「激活即自动播放一次」= 在 demo 的 `onMounted` 里启动脚本，不能放在 setup 里（`AgentTraceStepsDemo.vue:79-81` 注释说明：prerender 时 setup 也会跑，计时器无人清理）。
- 注意提前 240px 挂载：15 秒的剧本可能在读者看到时已经播了一截。可选做法：模板内部再加一个 IO，在 ≥35% 可见时才 `start()`，属于体验取舍。

**推荐骨架**（与现有写法一致；`tuffex-docs-sync.md:72` 要求在 `onBeforeUnmount` 清理计时器）

```ts
const generation = ref(0)            // 绑到有内部状态的子树上：:key="generation"
let timers: ReturnType<typeof setTimeout>[] = []
function later(ms: number, fn: () => void) { timers.push(setTimeout(fn, ms)) }
function stopAll() { timers.forEach(clearTimeout); timers = [] /* + setInterval */ }

function start() {
  if (still) { settleAll(); return }   // reduced motion：直接落到终态
  runScript()
}
function resetDemo() {
  stopAll()
  Object.assign(state, initialState())
  generation.value += 1               // 重建 TxToolCallCard / TxSources 等只认 default* 的内部状态与入场动画
  void nextTick(start)
}
onMounted(start)
onBeforeUnmount(stopAll)
watch(locale, resetDemo)              // 或只重新取文案
defineExpose({ resetDemo })
```

- 为什么还要 `generation`：不少组件的展开状态只在初始化时读取 `default*`，之后不再受控（`TxToolCallCard` `expanded`、`TxSources` `open`、`TxReasoningDisclosure` `open`、`TxToolConfirmation` `remember`、`TxApprovalCard` 非受控时的答案）。CSS 入场动画也只在元素创建时播放（`ContextCardsContextCardsDemo.vue` 注释：「Remounting is what replays a CSS entrance」）。
- 展开浮层（D6）搬运的是同一个实例，重置按钮需要在浮层里也能调到同一实例的 `resetDemo`。这一点属于 wrapper 侧的实现，这里只记录需求。

---

## Component cheat sheets

### 总览：谁驱动动画、谁是 BUI、尺寸

| 组件 | 驱动方式（demo 负责） | 组件自带动效 / 计时 | reduced motion | BUI | 尺寸要点 |
|---|---|---|---|---|---|
| TxConversationStream | `items` 追加、`streaming` | 弹簧吸底（rAF） | 回底按钮动画关；**JS 吸底不受保护** | 否 | `height:100%`，父级要有确定高度 |
| TxChatMessage / List | 数据 | List 默认 `TxStagger` 入场 | **无**（TxStagger 没有 reduced-motion 处理） | 否 | 100% 宽 |
| TxChatComposer | `v-model` | — | — | 否 | 100% 宽 |
| TxTypingIndicator | 显示/隐藏 | 自转 | 有 | 否 | inline |
| TxPromptBar | `v-model`、`submitting`、`v-model:model` | 菜单弹入 | 有 | 是 | 100% 宽；菜单向上绝对定位 |
| TxAgentTrace | `rows`、`working`、`defaultOpen`/`userOpen` | 行 fade-up 错峰 120ms/行，shimmer，spinner | 有 | 是 | 100% 宽 |
| TxToolCallCard | `toolCall.status/logs/output` | spinner；日志自动追尾 | 有 | 否 | 100% 宽 |
| TxToolChips / TxDiffChips | `rows`/`diffs` 追加，`v-model:open/expandedRows` | 行 fade-up，chip pop-in 错峰 80ms | 有 | 是 | ToolChips `max-width:320px` |
| TxToolConfirmation | 显示/隐藏 | — | — | 否 | 100% 宽 |
| TxApprovalCard | `v-model` / `index` / `sent` / `open` | **单选后 480ms 自动翻页（内部计时）** | 自动翻页被抑制 | 是 | `max-width:320px`，`min-height:196px` |
| TxTaskRows | `rows[].status`、`openIds` | 行 fade-up 80ms/行、环转、徽章 pop | 有 | 是 | list 变体 `align-self:flex-start` |
| TxWorkingIndicator | 挂载/卸载、`startedAt` | 像素波 + **100ms 计时器** | 波形关，计时继续 | 是 | `width:fit-content` |
| TxThinkingOrb | `state`、`paused` | canvas rAF（离屏/隐藏页暂停） | 静态一帧 | 否 | `size` 20/64，`displaySize` |
| TxContextIndicator | `usedTokens` | 弧线 transition | 有 | 否 | inline |
| TxCodeStream | `revealedLines` | caret、逐行过渡 | 有（节奏仍是 demo 计时） | 是 | 100% 宽；默认预留整段高度 |
| TxMessageActions | 显示 | 0.9s 模糊浮现；「已复制」1.2s | 有 | 否 | inline |
| TxAgentsList / Item | `agents`、`selectedId` | — | — | 否 | `height:100%; overflow:auto` |
| TxAgentScreen | `state`、`cursor` | loading 骨架 shimmer；**光标无过渡** | 骨架关 | 是 | `aspect-ratio`（默认 2964/1856） |
| TxStreamMarkdown | `content` 增长、`streaming` | 块揭示、新字模糊、光标球 | JS `motionless()` + CSS | 否 | 100% 宽；`v-html` |
| TxInlineCitation | 挂载 | pop-in（`appear`） | 有 | 是（无 bui-scope） | inline 18px 高 |
| TxSources | `sources` | 展开过渡 | 有 | 否 | 100% 宽 |
| TxContextCards / Chunk | `chunks` | 卡片错峰 100ms，胶囊延迟 700ms（**内部计时**） | 延迟清零 | 是 | 默认 `max-width:380px`（可改变量） |
| TxSuggestionChips | `suggestions` | list 布局 fade-up 90ms/行 | 有 | 否 | wrap 横滚 / list 纵排 |
| TxChainOfThought | `steps[].status/body`、`streaming` | 思考球、shimmer、spinner、活跃步骤体追尾 | 有 | 否 | 活跃体 `max-height:140px` |
| TxReasoningDisclosure | `text`、`streaming` | 思考球、shimmer | 有 | 否 | 文本 `max-height:200px` |
| TxInsightCards / Metric | `pages`、`v-model:activeIndex` | — | 有 | 是 | 100% 宽 |
| TxRecommendationCard | `options`、`v-model` / `open` / `accepted` | 抽屉 | 有 | 是 | `max-width:380px` |
| TxSignalMeter | `value` | 填充过渡 | 有 | 是（token） | 默认 3 格 × 4×10px |
| TxAiConversation / Message | `messages`（可含 `parts`） | 打字点、回复揭示 | **无保护** | 否 | 100% 宽 |
| TxMarkdownView | `content` | — | — | 否 | 100% 宽；`v-html` |
| TxTabs | `v-model` | 指示条、内容、高度动画 | **无保护**（需手动关 `animation`） | 否 | `height:100%`，带边框 |
| TxSkeleton 家族 | `loading` | shimmer | 有 | 否 | 按 props |

BUI 组件 = 根类 `tx-bui-*`，颜色走 `--tx-bui-*`。暗色值在 `bui-tokens.scss:79-139`：page `#181818`、surface `#242424`、line `#303030`、ink `#f3f3f3`；触发条件是 `.dark` 或 `[data-theme='dark']`，Nuxt color-mode 的 `classSuffix: ''` 会给 `html` 加 `.dark`。非 BUI 组件走 `--tx-*`，暗色下 `--tx-bg-color:#141414`、`--tx-fill-color:#303030`，并且 **`--tx-fill-color-blank: transparent`**（`variables.scss:449`）。后果是用 `fill-color-blank` 作底色的组件在暗色下变透明：聊天气泡、SuggestionChips、ChatComposer、回底按钮、CardSkeleton。模板面板必须自己给不透明底色。

---

### TxConversationStream

- **导出**：`TxConversationStream`（泛型 SFC `<script setup generic="T">`），以及 `useStickToBottom`、`createPositionCache`；类型 `ConversationStreamProps<T>`、`TxConversationStreamInstance`（`conversation-stream/index.ts:12-41`）。
- **Props**（`src/types.ts:16-29`，默认值见 `TxConversationStream.vue:9-16`）：

  | 名称 | 类型 | 默认 | 说明 |
  |---|---|---|---|
  | `items` | `T[]` | 必填 | |
  | `itemKey` | `string \| (item, i) => key` | 必填 | |
  | `estimatedItemHeight` | `number` | 96 | |
  | `overscan` | `number` | 4 | |
  | `loadOlder` | `() => Promise<{ hasMore }>` | — | 不传就没有顶部区 |
  | `hasMoreInitial` | `boolean` | `undefined` | |
  | `streaming` | `boolean` | false | |

- **Events**：`at-bottom-change(atBottom)`、`load-error(err)`。
- **Slots**：`item({ item, index })`、`empty`、`top-loading`、`top-error({ retry })`、`top-done`、`scroll-to-bottom({ streaming })`（替换回底按钮内容）。
- **Expose**（:461-469）：`scrollToBottom(behavior?)`、`scrollToIndex(i)`、`tweenToBottom(ms = 280) → Promise<boolean>`、`atBottom`。
- **行为**：
  - 最后一项是「live」项，不参与虚拟化（:84-89）；其余项绝对定位并用 `translateY` 排布，由 ResizeObserver 实测高度。
  - 吸底阈值 80px（`use-stick-to-bottom.ts:26`）。用户在底部时，内容增长会跟随；`streaming` 为真时用弹簧平滑跟随（:204-205）；向上滚轮立即放弃跟随。
  - 挂载时 `scrollToBottom()`（:440）。只改自身 `scrollTop`，**不会滚动 docs 页面**。
- **尺寸**：根和 scroller 都是 `height:100%`（:547-560），父级必须有确定高度（先例 `ConversationStreamConversationStreamDemo.vue:80` 用 `h-72`）。项之间的间距用项内 padding（先例 `px-3 py-2`）。
- **动效**：回底按钮入场有 reduced-motion 保护；弹簧/tween 是 JS rAF，**没有 matchMedia 保护**。
- **坑**：
  - 虚拟窗口外的项会被卸载，项内组件的内部状态丢失，入场动画会重播。脚本化的短会话建议 `:overscan="24"`，并尽量用受控 props（`userOpen`、`v-model:*`、`startedAt`）。
  - 硬编码英文：回底按钮 `aria-label="Scroll to bottom"`（:536，不可覆盖）；有 `loadOlder` 时还有 `Failed to load history — retry`（可用 `top-error` 插槽覆盖）。
  - 回底按钮背景是 `var(--tx-fill-color-blank)`，暗色下透明、会压在文字上。建议在模板里加 `:deep(.tx-conversation-stream__pill) { background: var(--tx-bui-surface) }`。
- **可借数据**：`ConversationStreamConversationStreamDemo.vue`（逐字追加写法）。

### TxChatList / TxChatMessage（chat 目录）

- **导出**：`TxChatList`、`TxChatMessage`、`TxChatComposer`、`TxTypingIndicator`；类型 `ChatMessageModel`、`ChatMessageRole`（`'user'|'assistant'|'system'`）等（`chat/index.ts`）。
- **类型**：`ChatMessageModel { id; role; content; createdAt?; avatarUrl?; attachments?: { type:'image'; url; name? }[] }`（`src/types.ts:11-18`）。
- **TxChatList** props：`messages`、`markdown=true`、`stagger=true`；emit `imageClick`。**不转发插槽**，自定义内容只能直接用 TxChatMessage（`TxChatList.vue:36-57`）。
- **TxChatMessage** props：`message`、`markdown=true`（内容用 TxMarkdownView 渲染，需要异步加载 sanitizer）、`attachmentLabel`。插槽：`avatar({ message })`、`header({ message })`、`content({ message })`（`TxChatMessage.vue:57-100`）。用户消息镜像排列，带主色浅底。
- **建议**：AgentChat 的用户气泡直接用 `TxChatMessage` 并设 `:markdown="false"`（避免 sanitizer 首帧空白），头像放进 `#avatar` 插槽。TxChatList 与 ConversationStream 职责重叠（没有吸底和虚拟化），不建议用。

### TxChatComposer

- **Props 默认值**（`TxChatComposer.vue:10-25`）：`placeholder 'Message…'`、`minRows 3`、`maxRows 6`、`sendOnEnter true`、`sendOnMetaEnter true`、`sendButtonText 'Send'`、`showAttachmentButton false`、`attachments []`。
- **Events**：`send({ text })`、`attachmentAdd(files)`、`paste`、`focus`、`blur`、`update:modelValue`。
- **Slots**：`attachments`、`toolbar({ send, disabled, attachmentClick })`、`toolbar-left`、`actions({ send, disabled })`、`footer`。
- **坑**：默认 **Enter 不发送，Cmd/Ctrl+Enter 才发送**（:158-184）。非 BUI，发送按钮是 TxButton。先例 AiSuiteChatShowcase 已经用过它；模板改用 TxPromptBar 能与先例拉开差异，ChatComposer 只作为备选。

### TxTypingIndicator

- **Props**（`TxTypingIndicator.vue:9-24`）：`variant 'dots'|'ai'|'pure'|'ring'|'circle-dash'|'bars'`（默认 dots）、`text 'Typing…'`、`showText true`、`ariaLabel`、尺寸若干。`role="status"`。颜色变量 `--tx-typing-indicator-color`。
- **用途**：AgentChat 在最终总结开始流出前显示约 600ms（「正在整理结论…」）；Research 在追问回复前使用。

### TxPromptBar

- **导出**：`TxPromptBar`、`useTokenMenu`、`parseToken`；类型 `PromptBarSource`、`PromptBarCommand`、`PromptBarModel`、`PromptBarSendPayload`、`PromptBarVariant`（`prompt-bar/index.ts`）。
- **类型**（`src/types.ts:11-38`）：
  - `PromptBarSource { key; name; desc?; attach?; connectable?; connected? }`
  - `PromptBarCommand { key; name /* 自带斜杠 */; desc? }`
  - `PromptBarModel { key; name; tag? }`
- **Props 默认值**（`TxPromptBar.vue:18-41`）：
  - 形态与行为：`variant 'rounded'`（或 `'pill'`）、`placeholder 'Write a message…'`、`sendOnEnter true`、`minHeight 28`、`maxHeight 100`、`dictatable false`、`listening undefined`。
  - 数据：`sources` / `commands` / `models` / `attachments`（AiAttachment[]）。
  - `submitting`：阻止发送，但仍可输入。
  - 另有全部英文文案 props：`sendLabel`、`attachLabel`、`modelLabel`、`sourcesHintText`、`commandsHintText`、`emptyTextFormatter`、`connectText` 等。
- **Events**：`send({ text, attachments })`（发送后组件只清空文字，附件由宿主清）、`update:modelValue`、`update:model`、`update:listening`、`attach`、`attachmentRemove`、`attachmentAdd`、`sourceSelect`、`commandSelect`、`connectToggle`。
- **Slots**：`source-icon({ source })`、`attachments({ attachments })`、`actions({ send, canSend })`（放在发送键前，可放「停止」按钮）。
- **Expose**（:413-424）：`focus()`、`insert(text)`、`closeMenus()`、`menuOpen`。
- **尺寸与定位**：100% 宽。`@` 和 `/` 菜单是**向上绝对定位**的（`TxPromptBarMenu.vue:129-131`，`bottom:100%`，z-index 10，每行 36px、无最高限），会被祖先的 `overflow:hidden` 裁掉，靠近视口边缘也不会翻转（文档 `prompt-bar.zh.mdc:163`）。输入条上方要留出约 220px 的不裁剪空间，或者把它放在滚动容器之外。
- **BUI**：发送键是墨色，不是品牌蓝（设计签名）。
- **坑**：
  - 中文必须覆盖所有文案 props。
  - 不要在自动播放期间调用 `focus()`：焦点变化会让浏览器把 docs 页滚到 demo 处。
- **可借数据**：`PromptBarPromptBarDemo.vue`（sources / commands / models / 模拟听写）。

### TxAgentTrace

- **导出**：`TxAgentTrace`（没有无前缀别名）；类型 `AgentTraceRow`、`AgentTraceRowStatus`、`AgentTraceVariant`、`AgentTraceProps`。
- **类型**（`src/types.ts:3-51`）：`AgentTraceRow { id; primary; secondary?; mono?; added?; removed?; href?; status?: 'pending'|'active'|'done'|'error' }`；变体 `'steps'|'reasoning'|'search'|'coding'`。
- **Props**：`variant 'steps'`、`rows`、`query`（search 变体）、`working false`、`activeLabel`/`doneLabel`（默认英文：Thinking/Thought、Searching the web、Running tools，见 :37-42）、`moreLabel`、`defaultOpen`、`userOpen`、`selectedId`（coding 变体）。
- **Events**：`toggle(open)`、`open(row)`（search 行链接，从不自行导航）、`select(id|null)`（coding）。
- **Slots**：`icon({ working })`、`label({ working })`、`row({ row, index })`。
- **展开逻辑**（:59-61）：`open = userOpen ?? 用户点击 ?? defaultOpen ?? working`。不传 `defaultOpen` 时，运行中自动展开，结束后自动收起；可以像 `AgentTraceStepsDemo.vue:77` 那样用一个随阶段变化的 computed 驱动 `default-open`。
- **状态图标**（:110-121）：`status:'active'` 转圈、`'error'` 打叉、其余打勾；不传 status 时，`working` 期间最后一行转圈。
- **动效**：行 fade-up，延迟为 `index×120ms`。逐行追加时，第 n 行会等 n×120ms 才出现，建议像先例那样分两批追加。reduced motion 下全部关闭。
- **可借**：`AgentTraceStepsDemo.vue`（阶段数组 800/600/1800/2600ms）、`AgentTraceVariantsDemo.vue`（coding 变体带 `+74 −41` 的行）。

### TxToolCallCard

- **Props**（`TxToolCallCard.vue:7-27`）：`toolCall: AiToolCallPart`、`defaultExpanded false`，以及 `retryLabel`/`pendingLabel`/`runningLabel`/`doneLabel`/`errorLabel`/`inputLabel`（默认 Retry/Queued/Running/Done/Failed/Input）。
- **数据类型**：`AiToolCallPart { type:'tool-call'; id; name; status:'pending'|'running'|'done'|'error'; summary?; input?; output?; error?; logs?; submitted? }`（`ai-elements/src/types.ts:21-41`）。
- **Events**：`retry(id)`、`toggle(expanded)`。
- **Slots**：`summary({ toolCall })`、`result({ toolCall })`（done 时的结果区）、`icon({ status })`。
- **行为**：
  - `expanded` 是**内部状态**，只在初始化时读 `defaultExpanded`（:41），之后不受控。
  - running 且有 `logs` 时在展开区显示日志，并自动滚到末尾（:62-73）。**要让读者看到流式日志，就必须 `:default-expanded="true"`。**
  - done 显示 `output`，error 显示错误与 Retry。
- **样式**：非 BUI（`--tx-*`），按状态着色：running 主色、done 成功色、error 危险色。
- **可借**：`ToolCallCardToolCallCardDemo.vue`（日志每 350ms 追加一行的写法）。

### TxToolChips / TxDiffChips

- **类型**（`tool-chips/src/types.ts:4-31`）：
  - `ToolChipRow { id; label; chip?; icon?: 'think'|'write'|'run'|'read'|string; mono?; detailMono?; detail?: { text; tone?:'add'|'del' }[] }`
  - `ToolChipDiff { file; add; del }`
- **TxToolChips props**（:9-19）：`rows`、`diffs []`、`summary`、`summaryFormatter`（默认 `'N tool call(s)'`）、`open`/`defaultOpen true`、`expandedRows`/`defaultExpandedRows`、`moreCount 0`、`moreLabelFormatter`（默认 `'+N more'`）。
- **TxToolChips events**：`update:open`、`update:expandedRows`、`toggle(id, expanded)`、`rowClick(row)`、`diffClick(diff)`、`more`。
- **TxToolChips slots**：`row-icon`、`chip`、`detail`、`diffs`。**Expose**：`expand(id)`、`collapse(id)`、`expandAll()`、`collapseAll()`。
- **TxDiffChips** props：`diffs`、`moreCount`、`moreLabelFormatter`、`staggerStep 80`；emits `select(diff)`、`more`；slot `chip({ diff })`。
- **尺寸**：**TxToolChips 根 `max-width: 320px`**（`TxToolChips.vue:213-218`）；TxDiffChips 自动换行、100% 宽，可以单独放在侧栏。
- **可借**：`ToolChipsRunFlowDemo.vue`（每 700ms 一行，末尾出 diffs；`watch(locale, replay)`）。

### TxToolConfirmation（允许/拒绝闸门）

- **Props**（`TxToolConfirmation.vue:6-24`）：`toolName`、`summary`、`input`（预格式化文本）、`risk 'read'|'write'|'execute'`（默认 read）、`allowLabel 'Allow'`、`denyLabel 'Deny'`、`rememberLabel 'Remember for this session'`、`riskLabels`（默认 Read-only/Writes data/Executes）。
- **Events**：`approve({ remember })`、`deny({ remember })`。
- **行为**：
  - `risk !== 'read'` 时左边框和「允许」按钮变成危险色。
  - 组件**没有已决状态**，决定后要由 demo 替换成一行结论（例如 TxStatusBadge「已允许」或一段文字）。
  - `remember` 是内部状态。
  - `aria-label` 是 `` `${toolName} confirmation` ``，英文后缀不可改。
- **样式**：非 BUI，没有动效。
- **可借**：`ToolConfirmationToolConfirmationDemo.vue`。

### TxApprovalCard（澄清问卷，不是闸门）

- **定位**：`approval-card/index.ts:13-17` 与文档「它不是授权闸门」都明确说了：闸门请用 TxToolConfirmation。
- **类型**（`src/types.ts:3-32`）：
  - `ApprovalQuestion { id; question; type?:'radio'|'check'; options:{ value; label }[]; allowCustom?=true; customPlaceholder? }`
  - `ApprovalAnswer { questionId; values:string[]; custom? }`
  - `ApprovalAnswerMap = Record<id, ApprovalAnswer>`
- **Props**（`TxApprovalCard.vue:8-30`）：
  - 状态：`questions`、`modelValue`、`index`、`sent`、`open`，全部可选受控（`v-model`、`v-model:index`、`v-model:sent`、`v-model:open`）。
  - 行为：`autoAdvance true`、`autoAdvanceDelay 480`、`dismissible true`、`skippable false`。
  - 文案 props 13 个，默认英文。
- **Events**：`update:*`、`answer(answer)`、`submit(answers[])`、`skip`、`dismiss`、`reopen`。
- **Slots**：`question({ question, index })`、`sent({ answers })`、`footer-extra`。**Expose**：`next`、`prev`、`goTo`、`submit`、`reset`。
- **行为**：
  - 单选后 480ms 自动翻页，最后一题会自动 `sent`。这是组件**内部计时**；reduced motion 下被抑制（:103-121）。
  - 多选不会自动前进，要点发送键。
- **尺寸**：`max-width:320px`、`min-height:196px`，发送态固定高 148px（:426-452）。
- **建议**：放在虚拟化列表里时，全部状态走受控（v-model 系列），这样卸载、重挂载后答案还在。
- **可借**：`ApprovalCardWalkthroughDemo.vue`（三题文案 + 全部 zh 文案 props）。

### TxTaskRows

- **类型**（`src/types.ts:4-30`）：`TaskRowItem { id; label; status:'pending'|'running'|'done'|'error'; amount?; index?; statusText?; details?:{ label; meta? }[]; retryable? }`。
- **Props**：`rows`、`variant 'capsules'|'list'`、`defaultOpenIds`、`openIds`（受控）、`doneText 'Completed'`、`errorText 'Failed'`、`runningText`/`pendingText`（无默认，不传就不显示状态药丸）。
- **Events / Slots**：emit `toggle(id, open)`、`update:openIds`；slots `badge({ row })`、`detail({ row, detail, index })`、`trailing({ row })`（行旁的宿主控件）。
- **行为**：
  - 徽章按 status 设 key，状态变化时会重播 pop；running 显示转动的环，pending/running 的环中显示 `index`。
  - 行 fade-up，延迟 80ms×index。
- **坑**：`list` 变体的根是 `align-self:flex-start`（`TxTaskRows.vue:244-250`），放在 flex 列里会缩成内容宽。外面包一个块级 div 或给它显式宽度。
- **可借**：`TaskRowsListDemo.vue`、`TaskRowsCapsulesDemo.vue`。

### TxWorkingIndicator

- **Props**（`src/types.ts:5-29`）：`label 'Working'`（shimmer 文字）、`variant 'drive'|'dots'|'orbit'`、`startedAt`（epoch ms；传入后重挂载不会重置计时）、`showElapsed true`、`elapsedFormatter`（默认 `12.3s`，超过 1 分钟为 `2m 3.0s`）、`ariaLabel`。slot `label`。
- **计时**：`use-elapsed.ts` 每 100ms 读取 `Date.now() - origin`。这是组件合法的内部计时（spec 把它列为例外），demo 不用自己驱动。
- **尺寸**：inline、`fit-content`，像素网格 3×3，每格 4px。

### TxThinkingOrb

- **Props**（`TxThinkingOrb.vue:12-33`）：
  - `state`：`OrbState | 'random'`，默认 `'random'`，**只在挂载时掷一次**。
  - `size 20|64`、`displaySize`、`speed 1`、`paused false`、`theme 'auto'`、`label`（默认按 state 给英文）。
  - `OrbState` 共 9 种：`working`、`searching`、`solving`、`listening`、`connecting`、`weaving`、`composing`、`breathing`、`shaping`。
- **行为**：
  - canvas + rAF；离屏（IntersectionObserver）或页面隐藏时暂停；所有球共用时钟，同相位。
  - reduced motion 下只画一帧静止画面（:130-134）。
  - `theme:'auto'` 读 `html.dark`，并用 MutationObserver 跟随主题切换。
- **建议**：固定 `state`（例如规划 `solving`、检索 `searching`、写码 `composing`、测试 `working`），避免每次重放长得不一样。改 `state` prop 会重建绘制，是安全的。

### TxContextIndicator

- **Props**（`TxContextIndicator.vue:6-18`）：`usedTokens`、`maxTokens`、`label 'Context usage'`、`formatter(used, max)`（默认 `12.3K / 200K`）。slot `detail({ ratio, used, max })`。
- **行为**：超过 80% 变警告色，超过 95% 变危险色（:31-37）；弧线有 0.25s 过渡。`role="meter"`，`title` 里显示百分比。

### TxCodeStream

- **Props**（`src/types.ts:32-71`，默认值见 `TxCodeStream.vue:11-22`）：
  - 内容：`code`（必填；复制按钮复制的就是它）、`lang`（shiki 语言 id，空则不高亮）、`filename`、`langLabel`。
  - `diff: CodeDiffRow[]`：`{ content; kind?:'context'|'added'|'removed'; number? }`。传了就进入 diff 模式，头部显示 +/− 统计。
  - `revealedLines`：显示前 N 行；不传或 −1 显示全部。
  - 其余：`caret true`、`lineNumbers true`、`theme 'auto'`、`copyable true`、`copyLabel 'Copy'`、`copiedLabel 'Copied'`、`minHeight`。
- **Events**：`copy(code)`；`complete`——`revealedLines` 抵达末行时触发（:158-161），可用来接下一幕。
- **Slots**：`header`、`actions`。
- **行为**：
  - 默认按「总行数 × 1.7em + 20px」预留高度（:173-184），显现过程不会把布局往下推。
  - shiki 懒加载、异步上色，先显示纯文本。
- **可借**：`CodeStreamStreamingDemo.vue`（开头 400ms、每行 240ms、结尾停 3200ms）；`CodeStreamDiffDemo.vue`（diff 行写法：删除行和替换它的新增行共用同一个行号）。

### TxMessageActions

- **Props**（`TxMessageActions.vue:6-38`）：`copyText`（传了才出复制键，写入 `navigator.clipboard`）、`regenerable`、`speakable`、`speakState`、`appear true`（0.9s 模糊浮现），以及 `copyLabel`/`copiedLabel`/`regenerateLabel`/`label`/`speakLabel`/`stopSpeakLabel`（默认英文）。
- **Events / Slot**：emits `copy(text)`、`regenerate`、`speak`；默认 slot 追加自定义按钮（会加入 roving tabindex）。
- **用途**：AgentChat 最终总结下方（复制 / 重新生成），Research「笔记」页签（复制）。

### TxAgentsList / TxAgentItem（agents 目录）

- **Props**：`agents: AgentItemProps[]`、`selectedId`、`loading`（显示 4 个 TxListItemSkeleton）、`enabledTitle 'Enabled'`、`disabledTitle 'Disabled'`、`emptyText 'No agents'`；emit `select(id)`（`TxAgentsList.vue:11-24`）。
- **类型**：`AgentItemProps { id; name; description?; iconClass?（默认 i-carbon-bot）; selected?; disabled?; badgeText? }`。
- **行为**：自动分成「启用 / 停用」两组并显示计数（:29-53）；每项是 `TxCardItem`，34px 图标块。
- **尺寸**：`height:100%; overflow:auto`，适合固定宽的侧栏（展开态左栏 220px）。
- **可借**：`AgentsAgentsListDemo.vue`（zh 文案、`i-carbon-chat`/`code`/`search`）。

### TxAgentScreen

- **Props**（`src/types.ts:41-83`）：`src`、`alt`、`label`（帧下方说明）、`state 'working'|'loading'`、`cursor { x; y（0-100%）; label? }`、`ratio '2964 / 1856'`、`ariaLabel 'Agent screen'`、`loadingLabel`（英文默认）。
- **Slots**：`default`（优先于 `src`，可以放手绘的界面）、`overlay`、`label`。
- **行为**：
  - loading 时显示骨架 shimmer，并 `role=status` 播报。
  - **光标定位没有 CSS 过渡**（`TxAgentScreen.vue:146-156`），光标会瞬移。想做滑动要在模板里加 `:deep(.tx-bui-agent-screen__cursor){ transition: left .5s, top .5s }`，并补 reduced-motion 保护。
- **可借**：`AgentScreenAgentScreenDemo.vue`（手绘桌面的写法，不打包 PNG）。

### TxStreamMarkdown

- **Props**（`src/types.ts:42-66`，默认值见 `TxStreamMarkdown.vue:22-32`）：`content`、`streaming false`、`sanitize true`（异步 import dompurify，未就绪前不渲染）、`theme 'auto'`、`renderers`（按语言覆盖代码块渲染器）、`blockRemoteImages true`，以及 5 个英文占位文案（`copyTableText 'Copy CSV'` 等）。
- **导出**：另有 `TxCodeBlock`、`TxMermaidBlock`、`createBlockStream`。
- **行为**：
  - 分块渲染，追加内容不会整篇重排。
  - `streaming` 时：尾部未闭合的代码围栏推迟渲染；新增文字从模糊中显影（JS 用 `motionless()` 在 reduced motion 下跳过，见 :228-251）；尾部显示光标球。
  - 表格外包滚动容器，并带「复制 CSV」按钮。
- **限制**：
  - 块内容走 `v-html`（:301-310）：**不能在 markdown 里嵌 Vue 组件**，TxInlineCitation 放不进去。
  - 链接渲染成 `<a href rel="noopener noreferrer">`，没有 target，也没有 `preventDefault`（`harden-html.ts:127-134`）。在 docs 页点击会真的导航。流式文本里避免写链接，或者在外层 `@click.capture` 对 `a` 调用 `preventDefault`。
- **节奏参考**：`StreamMarkdownStreamMarkdownDemo.vue`（每 30ms 追加 4 个字符）；结束后要把 `streaming` 置回 false，否则光标永远留在末尾。

### TxInlineCitation

- **Props**（`src/types.ts:5-16`）：`source: AiSourceItem { id; url; title?; favicon? }`、`label`（默认 `title ?? 去掉 www 的域名`）、`appear true`（pop-in 动画）。emit `open(source)`；链接保留 href，但点击会 `preventDefault`（:37-43）。slots：`default({ source, label })`、`icon({ source })`。
- **样式**：18px 高、10.5px 等宽字体；属于 BUI，但没有 `bui-scope`。暗色下头像描边用单独的变量。
- **用法**：只能在「普通 DOM 段落」里与文字交错，先例是 `AiSuiteStreamingAnswerDemo.vue:112-122` 的 token 数组。编号式引用可以传 `label="1"`，或者把 domain 当 label。favicon 建议用 data-URI SVG（先例 :21-28），避免请求第三方网站。

### TxSources

- **Props**（`TxSources.vue:7-24`）：`sources: AiSourceItem[]`、`labelFormatter`（默认 `Used N source(s)`）、`defaultOpen false`、`variant 'default'|'stack'`（stack 用前 3 个能加载的 favicon 叠放）。emit `open(source)`（不导航）。
- **行为**：
  - `open` 是内部状态，只读一次 `defaultOpen`，**不可受控**。
  - 列表是 `<ol>`，序号取渲染顺序（index+1），正好对应编号引用。
- **坑**：
  - 行格式固定（序号 / favicon / 标题 / 域名），**没有行插槽**：相关度 meter 放不进去，也没有「高亮某条」的 prop。
  - 堆叠头像的描边是 `--tx-sources-stack-ring`（默认页面底色），放在非页面底色的面板上时要改这个变量。

### TxContextCards / TxContextChunk

- **类型**（`src/types.ts:7-84`）：
  - `ContextChunk { id; title; body?; chars?; source?: ContextChunkSource }`
  - `ContextChunkSource { name; badge?; tone?: 'neutral'|'ink'|'accent'|'green'|'orange'|'red'; href? }`
- **TxContextCards props**（`TxContextCards.vue:8-14`）：`chunks`、`title 'All chunks'`、`total`（语料总数，不是 `chunks.length`）、`appear true`、`staggerStep 100`、`chipDelay 700`、`chipStaggerStep 80`。emit `open({ chunk, source })`。
- **TxContextCards slots**：`header`、`chunk({ chunk, index })`（整卡替换）、`chunk-title`、`chunk-body`、`chunk-source`。
- **TxContextChunk props**：`chunk`、`appear`、`enterDelay`、`chipDelay`。
- **行为**：
  - 只有挂载时就在的那一批卡片参与错峰（:28-39），流式追加的卡片直接出现。
  - 来源胶囊在卡片之后约 700ms 才出现，是组件**内部计时**；reduced motion 下延迟清零。
  - 想重播入场，就改 `:key` 重挂载（先例 `ContextCardsContextCardsDemo.vue`）。
- **尺寸**：`max-width: var(--tx-bui-context-cards-max-width, 380px)`（:86-94）。侧栏里可以在外层设 `--tx-bui-context-cards-max-width: 100%`。
- **用途**：Research 的「片段」页签。用 `#chunk` 插槽包一层 div，由 demo 加高亮环，响应点击的引用；也可以在 `#chunk-title` 里放 TxSignalMeter 表示相关度。

### TxSuggestionChips

- **Props**：`suggestions: AiSuggestion[] { id; text }`、`layout 'wrap'|'list'`；emit `select(suggestion)`（`TxSuggestionChips.vue:6-23`）。
- **行为**：wrap 布局是横向滚动（两端带渐隐遮罩）；list 布局是分隔线纵排，每行 fade-up，延迟 90ms×index。背景用 `--tx-fill-color-blank`，暗色下透明。

### TxChainOfThought

- **Props**（`TxChainOfThought.vue:10-32`）：`steps: AiChainStep[]`、`streaming false`、`defaultOpen true`、`label 'Chain of thought'`、`userOpen`。emit `toggle(open)`。
- **类型**：`AiChainStep { id; kind:'thinking'|'tool'; title; body?; status:'active'|'done'|'error'; durationMs? }`（`ai-elements/src/types.ts:97-105`）。
- **行为**：
  - 展开逻辑：`userOpen ?? 用户点击 ?? (streaming ? 有 active 步骤 : defaultOpen)`（:49-54）。**注意：`streaming` 翻回 false 后回到 `defaultOpen`（默认 true），面板会重新展开。**想在结束后保持收起，就传 `:default-open="false"`。
  - 头部图标在 streaming 且存在 active 步骤时换成 TxThinkingOrb（随机形态）。
  - thinking 类步骤的 body 按 markdown 渲染（marked + DOMPurify），tool 类原样显示。
  - active 步骤的 body 最高 140px，自动追尾。
  - done 且有 `durationMs` 时显示 `· 1.2s`。
- **最佳实践**：同一时刻只保留一个 active 步骤；`id` 要稳定。
- **可借**：`ChainOfThoughtChainOfThoughtDemo.vue`（流完要把步骤改成 done，否则 spinner 会一直转）。

### TxReasoningDisclosure

- **Props**（`TxReasoningDisclosure.vue:7-27`）：`text`、`streaming`、`durationMs`、`defaultOpen false`、`label 'Reasoning'`、`thinkingLabel 'Thinking…'`、`durationFormatter`（默认 `Thought for X.Xs`）。emit `toggle`。
- **行为**：`open` 只在内部，不可受控；文本最高 200px，`pre-wrap`，streaming 时自动追尾；streaming 时头部显示思考球。
- **用途**：Research 追问回复里的「思考」折叠。TxAiMessage 的 reasoning part 内部也用它，但那条路径不会传 zh 文案（见 AiElements 条目）。

### TxInsightCards / TxInsightMetric

- **类型**（`src/types.ts:3-56`）：`InsightPage { key; prose?; suggestion? }`。
- **TxInsightCards props**：`pages`、`activeIndex`（受控，`v-model:active-index`）、`title 'Insights'`、`showCount true`、`loop true`、`previousLabel`、`nextLabel`。emits `update:activeIndex`、`change(page, i)`、`followUp(page)`。slots：`default({ page, index })`（卡片主体）、`prose`、`follow-up`。**Expose**：`previous`、`next`、`goTo`。
- **TxInsightMetric props**：`label`、`color`（圆点）、`value`（有符号数，用 U+2212 负号）、`delta`（预格式化字符串，优先于 value）、`unit '%'`、`precision 2`、`detail`（渲染在 `<code>` 里）、`tone`、`formatter`。
- **可借**：`InsightCardsInsightCardsDemo.vue`（三页：对比、异常、分配，配 TxSparkChart / TxAllocationBar）。

### TxRecommendationCard

- **类型**（`src/types.ts:3-58`）：`RecommendationOption { key; text?; short; confidence?:'high'|'medium'|'low'|'none'; signal?; tone?; label; cta?; ctaTone?:'accent'|'ink'|'danger' }`。
- **Props**：`title`、`options`、`modelValue`（当前推荐的 key，默认第一项）、`open`（替代方案抽屉）、`accepted`，以及 `alternativesLabel`/`otherOptionsLabel`/`acceptedLabel`/`acceptLabel`（英文默认）。
- **Events**：`update:*`、`accept(option)`、`select(option)`。
- **Slots**：`body({ option })`、`meter({ option })`、`footer-extra`。
- **行为**：内置 TxSignalMeter，置信度 high/medium/low/none 对应 3/2/1/0 格，颜色分别为绿/橙/红/灰。
- **尺寸**：`max-width:380px`。
- **可借**：`RecommendationCardConfidenceDemo.vue`（zh 文案齐全）。

### TxSignalMeter

- **Props**（`src/types.ts:3-24`）：`value`、`max 3`、`tone 'currentColor'`（任意 CSS 颜色，例如 `var(--tx-bui-green)`）、`label`（不传时 `aria-hidden`）、`barHeight 10`、`barWidth 4`。
- **用途**：放在 ContextChunk 标题里表示相关度，或放在来源行里表示可靠度。

### AiElements：TxAiConversation / TxAiMessage

- **类型**（`ai-elements/src/types.ts:107-132`）：`AiElementMessage { id; role:'user'|'assistant'|'system'|'tool'; content; createdAt?; name?; avatar?; status?:'pending'|'streaming'|'complete'|'error'; parts?: AiMessagePart[] }`。part 可以是 `text`、`reasoning`、`tool-call`、`attachment`、`sources` 五种。
- **TxAiConversation props**：`messages`、`markdown true`、`compact false`、`emptyText 'No messages yet'`、`showAvatar false`。它会过滤空消息（:26-34），并向每条消息转发 `default`、`avatar`、`markdown-renderer`、`tool-result` 插槽。
- **TxAiMessage props**：`message`、`markdown`、`compact`、`showAvatar`、`typingLabel 'AI is typing'`；emit `open-source`。**TxAiConversation 不转发这个事件。**
- **parts 渲染**（`TxAiMessage.vue:122-177`）：text 用 TxMarkdownView，reasoning 用 TxReasoningDisclosure，tool-call 用 TxToolCallCard，attachment 用 TxAttachmentTray，sources 用 TxSources。
- **本地化坑**：
  - 角色标签的兜底文案是 `AI/Tool/System/You`，可以用 `message.name` 覆盖。
  - 状态药丸 `Pending/Streaming/Error` 无法覆盖（:54-81）。
  - **parts 内嵌组件不传文案 props**：zh 页会冒出 `Reasoning` / `Thought for 1.2s` / `Running` / `Used 3 sources`。
- **建议**：要么只用 `text` part，要么用 `default` 插槽自己组合已本地化的 TxReasoningDisclosure、TxStreamMarkdown、TxSources；流式期间不要设 `status:'streaming'`，改为外置一个 TxTypingIndicator。

### TxMarkdownView

- **Props**：`content`、`sanitize true`、`theme 'auto'|'light'|'dark'`（`markdown-view/src/types.ts`）。同样走 `v-html`；sanitizer 异步就绪前输出为空（`TxMarkdownView.vue:136-142`）。
- **用途**：静态 markdown（非流式），例如 Research「笔记」页签。

### TxTabs / TxTabItem

- **Props 默认值**（`TxTabs.vue:66-77`）：
  - 布局：`placement 'left'`（左侧导航，`navMinWidth` 220px）、`contentPadding 12`、`contentScrollable true`、`borderless false`、`autoHeight false`。
  - 指示条：`indicatorVariant 'line'|'pill'|'block'|'dot'|'outline'`、`indicatorMotion`。
  - 动画：`animation { size, nav, indicator, content }`。
- **v-model**：值是 TxTabItem 的 `name`。
- **TxTabItem**：props `name`、`iconClass`、`disabled`、`activation`（初始激活）；插槽 `icon`、**`name`**。TxTabs 会把 `#name` 插槽转发到导航（`resolveTabNavSlots`，:47-59），所以可以用**稳定的 name 作 key、用 `#name` 插槽放本地化标签**，避免切语言后 v-model 失配（`TabsTabsDemo.vue` 靠切语言时重置 active 来规避这个问题）。
- **行为**：只渲染激活页签的内容，切换时其余页签卸载；另有 `#nav-right` 插槽。
- **尺寸**：根是 `height:100%`，带 1px 边框、12px 圆角和 `overflow:hidden`（可用 `borderless`）。
- **坑**：
  - 组件**没有 reduced-motion 处理**；reduced motion 下传 `:animation="{ size:false, nav:false, indicator:false, content:false }"`。
  - 空态文案 `No tab selected` 写死（:669）。
- **用途**：Research 侧栏的「来源 / 片段 / 笔记」，`placement="top"` 加 `borderless`。

### TxSkeleton 家族

- **导出**：`TxSkeleton { loading true; variant 'text'|'rect'|'circle'; width '100%'; height 12; radius 8; lines 1; gap 10 }`，`loading=false` 时渲染默认 slot（`TxSkeleton.vue:11-19, 47-61`）。另有 `TxCardSkeleton`、`TxListItemSkeleton`、`TxRowSkeleton`（rows/leading/description/trailing/separated）和 `useDeferredLoading`。
- **样式**：shimmer 有 reduced-motion 保护；TxCardSkeleton 底色是 `--tx-fill-color-blank`，暗色下透明。
- **用途**：Research 侧栏在首批来源到达前显示。AgentChat 的预览帧直接用 TxAgentScreen 的 `state="loading"`。

### TxAttachmentTray（可选）

- **Props**：`attachments: AiAttachment[]`、`removable` 及一组英文文案。emits `remove`、`cancel`、`open(file)`。
- **注意**：图片预览会用 **TxModal**，TxModal 通过 teleport 挂到 body，z-index 由分配器发放（种子 2000）。如果展开浮层的层级更高，预览会被压在下面。模板里如果要显示用户附件，**只放 file 类附件**更稳。

### 辅助（先例在用）

- `TxFlatRadio` / `TxFlatRadioItem`：`v-model`、`size 'sm'|'md'|'lg'|'xl'`、`bordered`；item 有 `value`、`label`、`icon`。先例用它做面板切换（`AiSuiteChatShowcaseDemo.vue:99-102`）。
- `TxIconButton`：`icon`、`label`、`size 'xs'|'sm'|'md'|'lg'`、`shape`、`pressed`、`status`、`disabled`（`button/src/icon-button.ts`）。

---

## Template proposals

两个模板共用的外壳约定：

- 根节点 `class="tpl-… not-prose"`，并设 `container: tpl-agent / inline-size`（或 `tpl-research`）。
- 高度：`height: var(--tuff-demo-template-height, 540px)`，展开浮层把这个变量改成确定值（例如 `min(800px, 100dvh - 120px)`）。ConversationStream 和 TxTabs 都依赖确定高度。
- 背景：用不透明的 `var(--tx-bui-page)` / `var(--tx-bui-canvas)`，圆角 16px，边框用 `var(--tx-bui-shadow-card)` 这类 ring 阴影。
- 容器查询断点：`< 620px` 单栏；`620–1039px` 是 784 基准布局；`≥ 1040px` 三栏（展开态）。
- 文案：`computed copy`，zh/en 两套。
- 计时：全部在 `onMounted` 里启动，`defineExpose({ resetDemo })`。
- reduced motion：直接渲染终态，不跑计时器。

### AgentChat 智能体对话

**定位**：一个「插件工程师」智能体接到需求后，依次规划、提澄清问题、查代码、申请写权限、写代码、跑测试、交付总结。与先例的区别：先例是 380px 的单卡、静态推理段；这里是整页 IDE 式工作台，带脚本化运行、人机闸门、侧栏状态联动和展开后的三栏布局。

**布局 · 784×540（容器宽 620–1039）**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◉ 插件工程师 · Tuff Pro      ▦▦ 编写中 6.2s                ◔ 38.7K / 200K  ⋯ │ 44px 头部
├──────────────────────────────────────────────┬───────────────────────────────┤
│ TxConversationStream（flex:1，约 400px）       │ [任务 | 变更 | 预览] TxFlatRadio │
│  ┌ 你 ─────────────────────────────────────┐  │ ┌ TxTaskRows（capsules）────┐ │
│  │ 给 clipboard-history 加隐私模式……         │  │ │ ✓ 读取清单与权限  manifest │ │
│  └─────────────────────────────────────────┘  │ │ ✓ 定位识别逻辑    2 处     │ │
│  ✦ 规划了 4 步 · 2.4 秒 ▾        TxAgentTrace  │ │ ◌3 实现打码与清除 +59 −7   │ │
│  ┌ TxApprovalCard（≤320）┐                     │ │ ◌4 补单测并运行            │ │
│  └───────────────────────┘                     │ └───────────────────────────┘ │
│  ▾ search_repo  查找引用       完成            │ 变更页：TxDiffChips           │
│  ┃ apply_patch 写入文件  [拒绝] [允许]          │ 预览页：TxAgentScreen（16:10）  │
│  ┌ src/utils/clipboard-shapes.ts  +16 −1  ⧉ ┐  │       + 光标「预览打码效果」    │
│  │ 12  export type ClipboardShape = …        │  │                               │
│  └──────────────────────────────────────────┘  │                               │
├──────────────────────────────────────────────┤         侧栏约 280px          │
│ TxPromptBar  [+] 继续给智能体下指令…  Tuff Pro ▾ [■][↑] │                     │
└──────────────────────────────────────────────┴───────────────────────────────┘
```

**展开 · 1280×800（容器宽 ≥ 1040）**

```
┌───────────────┬───────────────────────────────────────────────┬──────────────────────┐
│ 智能体  3      │ ◉ 插件工程师 · Tuff Pro   ▦▦ 测试中 9.8s   ◔ 42K/200K │ 计划                 │
│ TxAgentsList  │ TxConversationStream（约 660px 高，CodeStream 更宽）│ TxTaskRows（list）     │
│ ▸ 插件工程师   │                                                │ 变更                 │
│   剪贴板管家   │                                                │ TxDiffChips          │
│   发布记录员   │                                                │ 预览                 │
│ ─ 不可用 ─     │                                                │ TxAgentScreen        │
│   旧版工作流   │ TxPromptBar                                    │（三块纵排，不用页签）   │
└───────────────┴───────────────────────────────────────────────┴──────────────────────┘
      220px                          1fr                                320px
```

**窄屏 < 620px**：隐藏侧栏，在输入条上方加一行状态条（「任务 2/4 · 4 个文件变更」），点击后临时展开 TaskRows。

**组件与角色**

| 组件 | 角色 |
|---|---|
| TxConversationStream | 会话容器；`streaming` 在运行期为真；建议 `:overscan="24"` |
| TxChatMessage | 用户气泡（`:markdown="false"`，头像放 `#avatar`） |
| TxThinkingOrb | 头部的智能体「在场感」；按阶段切换 `state`；完成后 `paused` |
| TxWorkingIndicator | 头部状态：阶段标签 + 计时（`startedAt` 取运行开始时间） |
| TxContextIndicator | 头部 token 用量，随阶段上涨 |
| TxAgentTrace（steps） | 会话内的规划轨迹，结束后自动收起 |
| TxApprovalCard | 澄清问卷（清除时长 radio + 敏感类型 check），全受控 |
| TxToolCallCard | 两个重量级工具调用（`search_repo`、`run_tests`）的流式日志，`default-expanded` |
| TxToolConfirmation | `apply_patch` 写权限闸门，决定后替换为一行结论 |
| TxCodeStream（diff） | 逐行写入 `clipboard-shapes.ts`，`@complete` 进入下一幕 |
| TxTypingIndicator | 总结开始前约 600ms 显示 |
| TxStreamMarkdown | 最终总结（列表 + 行内代码），不写链接 |
| TxToolChips | 总结里的运行摘要（「5 次工具调用」+ diffs），默认收起 |
| TxMessageActions | 总结下方：复制 / 重新生成（重新生成 = 重放总结流） |
| TxTaskRows | 侧栏计划清单，状态与脚本同步（pending → running → done / error） |
| TxDiffChips | 侧栏「变更」：4 个文件；点击后滚到 CodeStream 项（`scrollToIndex`） |
| TxAgentScreen | 侧栏「预览」：手绘的 CoreBox 剪贴板面板；写码前 `loading`，之后 `working` 并移动光标 |
| TxAgentsList | 展开态左栏：切换智能体只改头部名称和 orb，不重跑脚本 |
| TxPromptBar | 输入条：@ 资料、/ 命令、模型选择；运行中 `submitting`，`#actions` 放「停止」 |
| TxFlatRadio / TxIconButton | 侧栏页签、头部更多按钮 |

**会话项模型（建议）**：项只存稳定的 id 和 kind，内容从响应式的剧本状态读取，这样项对象本身不变，虚拟化缓存也就稳定。

```ts
type Row =
  | { id: string, kind: 'user', text: string }
  | { id: 'plan', kind: 'plan' }            // TxAgentTrace
  | { id: 'ask', kind: 'questions' }        // TxApprovalCard
  | { id: string, kind: 'tool', call: 'search' | 'test' }  // TxToolCallCard
  | { id: 'gate', kind: 'gate' }            // TxToolConfirmation → 已决结论
  | { id: 'code', kind: 'code' }            // TxCodeStream diff
  | { id: 'done', kind: 'summary' }         // Typing → StreamMarkdown + ToolChips + MessageActions
```

**脚本时间轴**（从激活开始计时；★ 表示闸门，会暂停）

| 时刻 | 会话区 | 侧栏 / 头部 |
|---|---|---|
| 0.0s | 已预置用户消息；追加 `plan` 项，AgentTrace `working`，标签「正在规划」 | orb `solving`；Working「规划中」；Context 12.4K |
| 0.8s / 1.6s | 规划行分两批出现（2 行 + 2 行） | 1.6s 时 TaskRows 出现 4 行 pending（index 1–4） |
| 2.4s | AgentTrace 结束（doneLabel「规划了 4 步 · 2.4 秒」），自动收起；追加 `questions` 项 | Context 18.9K |
| ★ 问卷 | 闲置 3s 后自动选默认项（Q1 60 秒，480ms 自动翻页；Q2 勾选 API Key、密码、SSH 私钥后提交）；读者任何一次作答都取消自动，改为等待 `submit` | — |
| +0.4s | 追加 `search_repo` 调用：running，日志每 300ms 一行，共 4 行，然后 done | TaskRows #1 → done，#2 → running；orb `searching`；Context 29.3K |
| +1.8s | 追加 `gate`：`apply_patch`（risk write，input 为 4 行文件统计） | Working「等待确认」 |
| ★ 闸门 | 显示「演示模式：6 秒后自动允许 · 点任意按钮接管」；读者可点允许或拒绝 | — |
| 允许 +0.3s | gate 变成「已允许 · 写入 4 个文件」；追加 `code`：CodeStream 每 110ms 一行，约 16 行 | TaskRows #2 done、#3 running；DiffChips 出现；AgentScreen 转 `working`，光标移到被打码的那行；orb `composing` |
| complete +0.3s | 追加 `run_tests` 调用：running，日志每 350ms 一行，共 5 行，然后 done | TaskRows #3 done、#4 running → done；orb `working`；Context 38.7K |
| +0.4s | 追加 `summary`：TypingIndicator 约 600ms，之后 StreamMarkdown 每 30ms 4 字符，约 3s | Working 消失，换成「完成 · 13.8 秒」；Context 46.2K |
| 结束 | ToolChips 摘要与 MessageActions 浮现；`streaming=false` | orb `paused`；PromptBar 退出 `submitting`，placeholder「继续追问…」 |

- **拒绝分支**：gate 变成「已拒绝」，智能体回复「好的，改为只输出补丁，不写入文件」；TaskRows #3 设为 `error`，`statusText`「已跳过」；跳过 CodeStream 和测试，直接进入总结（总结文案换成补丁版）。
- **停止**：清空计时器；把当前 running 行设为 error「已停止」；在会话里追加一行系统消息。
- **总时长**：约 14s，外加闸门等待。

**读者可做的交互**

- 回答问卷；允许或拒绝写入；展开 ToolCallCard 看输入和日志。
- 折叠或展开 AgentTrace；点 TaskRows 看明细。
- 点 DiffChip 跳到代码项；切换侧栏页签。
- 用 `@` 和 `/` 菜单；发送追问：追加用户气泡，并给出固定回复「（演示）这是脚本化会话，点窗口的『重置』可重放完整流程」。
- 停止；复制或重新生成总结；展开态下切换智能体。

**Mock 数据（zh；en 对应文案并列在 copy 里）**

```ts
// 智能体（展开态左栏）
agents = [
  { id: 'builder', name: '插件工程师', description: '读代码、改插件、跑测试', iconClass: 'i-carbon-plug', badgeText: 3 },
  { id: 'curator', name: '剪贴板管家', description: '整理与检索剪贴板历史', iconClass: 'i-carbon-paste' },
  { id: 'scribe', name: '发布记录员', description: '起草更新日志与发布说明', iconClass: 'i-carbon-document' },
  { id: 'legacy', name: '旧版工作流', description: '迁移完成前不可用', iconClass: 'i-carbon-bot', disabled: true },
]
// en: Plugin Builder / Clipboard Curator / Release Scribe / Legacy Workflow

request = '给 clipboard-history 插件加一个隐私模式：复制到的 API Key、密码这类内容在历史里自动打码，60 秒后自动清除。'
// en: 'Add a privacy mode to the clipboard-history plugin: mask API keys and passwords in the history and clear them after 60 seconds.'

plan = [ // AgentTrace 行 + TaskRows 行
  { id: 'manifest', primary: '读取插件清单与权限', secondary: 'manifest.json', mono: true, amount: 'manifest.json' },
  { id: 'locate',   primary: '定位剪贴板形状识别', secondary: 'clipboard-shapes.ts', mono: true, amount: '2 处' },
  { id: 'mask',     primary: '实现打码与定时清除', amount: '+59 −7' },
  { id: 'tests',    primary: '补单测并运行', amount: '6 项' },
]

questions = [
  { id: 'retention', question: '敏感条目多久后从历史里清除？', type: 'radio',
    options: [{ value: '30s', label: '30 秒' }, { value: '60s', label: '60 秒（推荐）' }, { value: '5m', label: '5 分钟' }],
    customPlaceholder: '自定义时长…' },
  { id: 'kinds', question: '哪些内容按敏感处理？', type: 'check', allowCustom: false,
    options: [{ value: 'apiKey', label: 'API Key / Token' }, { value: 'password', label: '密码与口令' },
              { value: 'card', label: '银行卡号' }, { value: 'ssh', label: 'SSH 私钥' }] },
]

search = { type: 'tool-call', id: 'search', name: 'search_repo', summary: '查找 retentionReason 的引用',
  input: '{ "pattern": "retentionReason", "path": "plugins/clipboard-history/src" }',
  logs: ["src/utils/clipboard-items.ts:18   | 'favorite'",
         "src/utils/clipboard-items.ts:608  if (item.retentionReason === 'favorite')",
         'src/utils/clipboard-shapes.ts:459 if (item.isFavorite)',
         '3 matches · 2 files · 41ms'],
  output: '2 个文件、3 处引用' }

gate = { toolName: 'apply_patch', risk: 'write', summary: '修改 3 个文件并新增 1 个测试',
  input: 'M src/utils/clipboard-shapes.ts       +38 −4\nM src/utils/clipboard-items.ts        +12 −1\nM src/components/ClipboardDetail.vue   +9 −2\nA src/utils/sensitive.test.ts         +41',
  riskLabels: { read: '只读', write: '写入文件', execute: '执行命令' },
  allowLabel: '允许', denyLabel: '拒绝', rememberLabel: '本次会话内记住' }

code = { filename: 'src/utils/clipboard-shapes.ts', lang: 'ts', langLabel: 'TypeScript' /* diff 约 16 行，新增 SECRET_PATTERNS / isSensitive() / maskSecret() */ }

tests = { type: 'tool-call', id: 'test', name: 'run_tests', summary: '运行插件单测',
  input: 'pnpm -C plugins/clipboard-history exec vitest run src/utils',
  logs: ['✓ src/utils/clipboard-shapes.test.ts (24 tests) 38ms', '✓ src/utils/clipboard-items.test.ts (31 tests) 52ms',
         '✓ src/utils/sensitive.test.ts (6 tests) 9ms', 'Test Files  3 passed (3)', 'Tests  61 passed (61)'],
  output: '3 个文件 · 61 项测试全部通过' }

diffs = [
  { file: 'clipboard-shapes.ts', add: 38, del: 4 }, { file: 'clipboard-items.ts', add: 12, del: 1 },
  { file: 'ClipboardDetail.vue', add: 9, del: 2 }, { file: 'sensitive.test.ts', add: 41, del: 0 },
]

summary = '已为 **clipboard-history** 加上隐私模式：\n\n- 识别 API Key、Token、SSH 私钥等片段，历史里显示为 `sk-a1••••••9f`\n- 敏感条目 **60 秒**后自动清除，已收藏的不受影响\n- 新增 6 项单测，插件 61 项测试全部通过\n\n要不要顺手在设置页加一个「隐私模式」开关？'

promptBar = {
  sources: [{ key: 'attach', name: '添加截图与文件', desc: '从本机上传', attach: true },
            { key: 'plugin', name: 'clipboard-history', desc: 'plugins/clipboard-history' },
            { key: 'samples', name: '剪贴板样本', desc: '最近 50 条（已脱敏）' },
            { key: 'docs', name: 'Tuff 文档', desc: 'tuff.tagzxia.com/docs' }],
  commands: [{ key: 'plan', name: '/plan', desc: '只出计划不改代码' }, { key: 'test', name: '/test', desc: '运行插件测试' },
             { key: 'review', name: '/review', desc: '审阅当前改动' }, { key: 'release', name: '/release', desc: '起草更新日志' }],
  models: [{ key: 'pro', name: 'Tuff Pro', tag: '推荐' }, { key: 'flash', name: 'Tuff Flash', tag: '快速' }, { key: 'local', name: '本地模型', tag: '离线' }],
}

workingLabels = { plan: '规划中', search: '检索中', gate: '等待确认', code: '编写中', test: '测试中' }
contextSteps = [12_400, 18_900, 29_300, 38_700, 46_200] // / 200_000
screen = { label: '插件预览 · CoreBox', cursor: '预览打码效果' } // 手绘：搜索框「clip」+ 4 行（文本 / 链接 / 图片 / sk-a1••••••9f）
```

**重置、reduced motion 与语言**

- `resetDemo`：清空计时器，恢复初始剧本状态，`generation++`（重建会话区和侧栏），调用 `streamRef.scrollToBottom()`，重新开始。
- reduced motion：直接生成终态会话（问卷已答、闸门已允许、代码全显、测试完成、总结完整），不启动任何计时器。
- 切换语言：`watch(locale, resetDemo)`。

**风险与兜底**

- 虚拟化导致项卸载：`overscan` 设 24；AgentTrace 用 `userOpen`，ApprovalCard 走 `v-model` 系列，WorkingIndicator 传 `startedAt`。
- ToolChips 和 ApprovalCard 的 320px 上限：放在会话列（约 470px）内可以接受，不要强行拉宽。
- 输入条菜单向上约 220px：会话列本身足够高，只要不在会话列上设 `overflow:hidden`（圆角裁剪放到根节点）。
- 闸门自动继续是演示取舍。如果老板不希望「自动允许写入」，改为无限等待，并在闸门旁显示提示（「点允许继续」）。

### Research 研究助手

**定位**：答案引擎式的研究副驾，完整走一遍「问题 → 研究过程 → 带引用的流式结论 → 对比表 → 洞察与推荐 → 追问」，右侧有证据栏。与先例的区别：先例是 380px 的一段结论、一个引用、一组堆叠来源；这里是页面级双栏或三栏布局，有多来源编号引用与证据栏的联动、推荐决策和追问线程。

**布局 · 784×540**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◎ 研究  Tuff 的截图 OCR 该选哪个本地引擎？……                快速回答 ▾   ⋯     │ 48px 头部
├───────────────────────────────────────────────┬──────────────────────────────┤
│ 主列 scroller（useStickToBottom）                 │ TxTabs（top，borderless）     │
│ 💡 研究过程 · 4 ▸           TxChainOfThought     │ [来源 6] [片段 3] [笔记]       │
│ 结论  macOS 与 Windows 优先用系统 OCR [1][2]——     │ 来源：TxSources（defaultOpen）  │
│ 零额外体积、截图不离开本机 [5]；Linux 用            │  1 ◧ Apple Vision   apple…   │
│ PaddleOCR 兜底 [4] ……（逐词 + TxInlineCitation）    │  2 ◧ Windows OCR    micro…   │
│ ┌ TxStreamMarkdown：对比（示例数据）────────────┐ │ 片段：TxContextCards          │
│ │ 引擎 │ 中文 │ 延迟 │ 额外体积 │ 平台          │ │  + #chunk-title SignalMeter  │
│ └───────────────────────────────────────────────┘ │  + 被点的引用：高亮环          │
│ ┌ TxInsightCards 洞察 3 ‹ › ┐                     │ 笔记：TxMarkdownView          │
│ ┌ TxRecommendationCard（≤380）┐                   │  + TxMessageActions（复制）   │
│ 追问 ↳ 竖排与繁体的表现如何？（SuggestionChips list） │ 加载中：TxSkeleton × 3        │
│ （追问线程：TxAiConversation）                    │                              │
├───────────────────────────────────────────────┴──────────────────────────────┤
│ TxPromptBar（通栏）[+] 追问，或输入 @ 引用资料……                 快速回答 ▾ [↑] │
└──────────────────────────────────────────────────────────────────────────────┘
        主列约 500px                                         侧栏约 270px
```

**展开 · 1280×800（≥ 1040）**

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ 头部：问题 + 模式 + 用量                                                                  │
├────────────────────────────────────────┬─────────────────────────────┬───────────────────┤
│ 主列（阅读宽度 ≤ 680px）                  │ 证据栏 320px                 │ 洞察栏 300px        │
│ CoT → 结论（带引用）→ 对比表 → 追问线程    │ TxSources（stack 头 + 列表）  │ TxInsightCards      │
│                                        │ TxContextCards（全部片段）     │ TxRecommendationCard│
│                                        │（不用页签，纵向滚动）          │ TxSuggestionChips   │
├────────────────────────────────────────┴─────────────────────────────┴───────────────────┤
│ TxPromptBar                                                                                │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**窄屏 < 620px**：隐藏侧栏；结论下方插入 `TxSources variant="stack"`；片段和笔记不显示。

**组件与角色**

| 组件 | 角色 |
|---|---|
| TxChainOfThought | 研究过程 4 步：检索（tool）→ 阅读（thinking）→ 跑基准（tool）→ 权衡（thinking）；`streaming` 在研究期为真；**`:default-open="false"`** |
| TxThinkingOrb | 由 CoT 内置提供；头部可以再放一颗 `searching` |
| TxInlineCitation | 结论段里的编号引用（`label="1"`…），`@open` 让侧栏高亮对应条目 |
| TxStreamMarkdown | 对比表 + 两条要点，流式输出；不写链接 |
| TxSources | 「来源」页签的编号列表（`defaultOpen`，`labelFormatter` 输出「参考了 N 个来源」）；窄屏用 stack |
| TxContextCards / Chunk + TxSignalMeter | 「片段」页签：命中片段、出处胶囊、相关度 |
| TxSkeleton / TxCardSkeleton | 首批来源到达前侧栏的占位 |
| TxInsightCards / TxInsightMetric | 3 页洞察：准确率、延迟、体积，每页 2 个指标，并附追问 pill |
| TxRecommendationCard（内置 SignalMeter） | 最终建议与备选；「写入方案」后切到「笔记」页签 |
| TxSuggestionChips（list） | 追问候选 |
| TxAiConversation / TxAiMessage | 追问线程（只用 text part，或用 default 插槽组合本地化组件） |
| TxReasoningDisclosure | 追问回复里的「思考了 1.2 秒」折叠（传 zh 文案） |
| TxMarkdownView + TxMessageActions | 「笔记」页签：采纳后的方案静态稿，带复制 |
| TxTabs / TxTabItem | 侧栏页签（稳定 `name` + `#name` 本地化） |
| TxPromptBar | 追问输入；@ 资料、/ 命令、模式选择 |
| `useStickToBottom`（composable） | 主列流式时平滑跟随，读者向上滚轮即放弃跟随（显式 import） |

**引用的呈现（必须先定）**：TxStreamMarkdown 放不进组件，所以答案拆成两段：

1. **结论段**：普通 `<p>` + token 数组逐词显影，TxInlineCitation 按标记插入（沿用先例的写法，改成多个编号引用）。
2. **对比段**：TxStreamMarkdown 流式输出表格和列表，不含链接。

备选做法是在 markdown 里写 `<sup data-cite="2">2</sup>`，DOMPurify 默认保留 `data-*`，再用委托点击处理。但那样引用就不是 TxInlineCitation 组件了，不推荐。

**脚本时间轴**

| 时刻 | 主列 | 侧栏 |
|---|---|---|
| 0.0s | 头部显示问题；CoT `streaming`，步骤 1（tool）active，body 日志逐行出现 | TxSkeleton × 3 |
| 0.9s | 步骤 1 done（900ms）；步骤 2（thinking）active，body 流式输出 | 来源 6 条就位（TxSources 列表，页签计数「来源 6」） |
| 1.6s | — | 片段 3 张入场（错峰 100ms，胶囊 700ms 后出现） |
| 2.4s | 步骤 3（tool：跑样本集）active，日志 4 行 | — |
| 3.6s | 步骤 4（thinking）active | — |
| 4.4s | 全部 done，CoT 自动收起（依赖 `default-open=false`）；结论段开始逐词显影，约 55ms/词，约 2.5s，3 处引用依次弹入 | 每出现一处引用，对应来源行轻闪一次（demo 的 class） |
| 7.0s | TxStreamMarkdown 输出对比表，约 30ms/4 字符，约 3s；主列跟随 | — |
| 10.2s | InsightCards 与 RecommendationCard 浮现；SuggestionChips 逐行出现；`streaming=false` | 「笔记」页签可用 |

**读者可做的交互**

- 点结论里的引用：侧栏切到「来源」或「片段」，滚动到对应条目并加高亮环。用 `scroller.scrollTo`，**不要用 scrollIntoView**。
- 点来源或片段胶囊：底部状态行显示「宿主会打开：…」，不导航。
- 展开研究过程；翻洞察页；在推荐卡里切换备选或点「写入方案」，之后切到「笔记」页签，显示 TxMarkdownView 方案稿。
- 点追问：追加一问一答（TypingIndicator 600ms，然后用 TxAiMessage 渲染本地化的思考折叠和答案文本）；也可以在 PromptBar 里自己输入，走同一条固定回复流程。

**Mock 数据（zh；数字均标为「示例数据」，避免把未验证的第三方结论写成事实）**

```ts
question = 'Tuff 的截图 OCR 该选哪个本地引擎？对比 Apple Vision、Windows OCR、Tesseract 5 和 PaddleOCR 的中文识别、速度与体积。'
// en: "Which local OCR engine should power Tuff's screenshot OCR? Compare Apple Vision, Windows OCR, Tesseract 5 and PaddleOCR on Chinese accuracy, speed and footprint."

sources = [ // favicon 用 data-URI SVG（字母色块），与先例一致
  { id: 'vision', title: 'Apple Vision · VNRecognizeTextRequest', url: 'https://developer.apple.com/documentation/vision/vnrecognizetextrequest' },
  { id: 'winocr', title: 'Windows.Media.Ocr', url: 'https://learn.microsoft.com/uwp/api/windows.media.ocr' },
  { id: 'tesseract', title: 'Tesseract OCR', url: 'https://github.com/tesseract-ocr/tesseract' },
  { id: 'paddle', title: 'PaddleOCR', url: 'https://github.com/PaddlePaddle/PaddleOCR' },
  { id: 'native', title: 'tuff-native OCR 接入说明', url: 'https://tuff.tagzxia.com/docs/dev' },
  { id: 'bench', title: '截图样本集 v2（示例）', url: 'https://tuff.tagzxia.com/docs' },
]

steps = [
  { id: 's1', kind: 'tool', title: '检索资料', body: 'search: 本地 OCR 中文 对比 · 6 条结果\nread: tuff-native OCR 接入说明 ✓', durationMs: 900 },
  { id: 's2', kind: 'thinking', title: '阅读并提炼', body: '**关注点**：中文准确率、首帧延迟、额外体积、能否离线。', durationMs: 1500 },
  { id: 's3', kind: 'tool', title: '在样本集上跑基准', body: 'vision     ✓ 200/200\nwinocr     ✓ 200/200\ntesseract  ✓ 200/200\npaddle     ✓ 200/200', durationMs: 1200 },
  { id: 's4', kind: 'thinking', title: '权衡取舍', body: 'Linux 没有系统 OCR，需要一个跨平台兜底；体积要控制在插件可接受的范围。', durationMs: 800 },
]

tldr = ['结论：', 'macOS 与 Windows', '优先用', '系统自带 OCR', {cite:'vision'}, {cite:'winocr'},
        '——零额外体积、延迟最低、', '截图不离开本机', {cite:'native'}, '；Linux 与竖排场景', '用 PaddleOCR 兜底', {cite:'paddle'},
        '，Tesseract', '只在极简部署时考虑', {cite:'tesseract'}, '。'] // 中文按短语切分，不按空格

table = '### 对比（示例数据）\n\n| 引擎 | 中文 | 延迟 | 额外体积 | 平台 |\n| --- | --- | --- | --- | --- |\n| Apple Vision | 高 | 低 | 无 | macOS |\n| Windows OCR | 中 | 低 | 无（需语言包） | Windows |\n| Tesseract 5 | 中 | 中 | 语言数据 | 全平台 |\n| PaddleOCR | 高 | 中 | 模型文件 | 全平台 |\n\n- 竖排与小字号：PaddleOCR 更稳\n- 离线与隐私：四者都能在本机运行'

chunks = [
  { id: 'c1', title: '系统 OCR 走原生绑定', chars: '182 字', relevance: 3,
    body: 'tuff-native 在 macOS 调用 Vision、在 Windows 调用 Windows.Media.Ocr，识别在本机完成，不上传截图。',
    source: { name: 'tuff-native OCR 接入说明.md', badge: 'MD', tone: 'accent', href: '…' } },
  { id: 'c2', title: '中文需要语言包', chars: '96 字', relevance: 2,
    body: 'Windows OCR 依赖系统已安装的语言；没有中文语言包时只能识别已安装的语言。',
    source: { name: 'Windows.Media.Ocr', badge: 'WEB', tone: 'neutral', href: '…' } },
  { id: 'c3', title: '样本集结果（示例）', chars: '1,240 字', relevance: 3,
    body: '200 张 UI 截图：系统原生引擎中位延迟最低；PaddleOCR 在竖排与小字号上更稳。',
    source: { name: '截图样本集 v2.csv', badge: 'CSV', tone: 'green', href: '…' } },
] // TxContextCards title '命中片段' total 32

insights = [
  { key: 'accuracy', prose: '中文样本上，PaddleOCR 与 Apple Vision 并列第一（示例）。', suggestion: '竖排文字谁更稳？' },
  { key: 'latency', prose: '系统原生引擎的中位延迟最低（示例）。', suggestion: '首帧为什么更快？' },
  { key: 'size', prose: '系统 OCR 不增加安装体积；PaddleOCR 需要随插件分发模型（示例）。', suggestion: '模型怎么按需下载？' },
] // 每页 2 个 TxInsightMetric，用 delta 字符串写出示例值

recommendation = { title: '采用这套 OCR 方案？', options: [
  { key: 'hybrid', short: '系统原生优先，PaddleOCR 兜底', text: 'macOS/Windows 走 tuff-native 的系统 OCR；Linux 与竖排场景切到 PaddleOCR（ONNX）。',
    confidence: 'high', label: '高置信', cta: '写入方案', ctaTone: 'accent' },
  { key: 'paddle', short: '全平台统一 PaddleOCR', confidence: 'medium', label: '需要评估体积', cta: '评估体积' },
  { key: 'cloud', short: '统一走云端 AI OCR', confidence: 'low', label: '隐私风险', cta: '仍然采用', ctaTone: 'danger' },
], alternativesLabel: '其他方案', otherOptionsLabel: '其他方案', acceptedLabel: '已写入' }

followUps = [{ id: 'f1', text: '竖排与繁体的识别表现如何？' }, { id: 'f2', text: 'PaddleOCR 模型怎么随插件分发？' }, { id: 'f3', text: '给出 tuff-native 的接入步骤' }]

promptBar = {
  sources: [{ key: 'attach', name: '添加截图', desc: '拖入或粘贴', attach: true },
            { key: 'docs', name: 'Tuff 文档', desc: 'tuff.tagzxia.com' }, { key: 'native', name: 'tuff-native 源码', desc: 'packages/tuff-native' },
            { key: 'bench', name: '截图样本集', desc: '200 张（示例）' }, { key: 'web', name: '网页搜索', desc: '实时结果', connectable: true, connected: true }],
  commands: [{ key: 'compare', name: '/compare', desc: '对比两项' }, { key: 'cite', name: '/cite', desc: '只给有引用的结论' },
             { key: 'bench', name: '/bench', desc: '在样本集上跑基准' }, { key: 'note', name: '/note', desc: '存为笔记' }],
  models: [{ key: 'deep', name: '深度研究', tag: '慢' }, { key: 'quick', name: '快速回答', tag: '快' }],
}
```

**重置、reduced motion 与语言**：与 AgentChat 相同。另外，reduced motion 下 TxTabs 要关掉 `animation`，主列不做跟随，结论和表格一次到位。

**风险与兜底**

- AiElements parts 会冒出英文文案：见上文 AiElements 条目，只用 text part 或走 default 插槽。
- 侧栏 TxSources 无法按 prop 高亮某条：高亮做在「片段」页签（`#chunk` 插槽包一层）；「来源」页签只做滚动定位，可以用 `:nth-child` 选择器加 demo 自己的 class。
- 主列跟随：用 `useStickToBottom(scrollerRef)` 的 `handleScroll`、`handleWheel`、`followIfSticking`，或者只在每一幕开始时 `scrollTo` 到该幕顶部。不要用 `scrollIntoView`。
- RecommendationCard 和 ContextCards 的宽度上限：784 基准布局下主列约 500px，已放得下；展开态放进洞察栏或证据栏。

---

## Risks

按影响排序。都不阻塞，但前 3 条需要主 agent 先拍板。

1. **展开浮层的高度契约**：TxConversationStream、TxTabs、TxAgentsList 都是 `height:100%`，模板根必须拿到确定高度。建议 wrapper 在常规态和浮层态分别设置 `--tuff-demo-template-height`（540px / 浮层高度），模板根读取这个变量。Teleport 搬运同一实例时，ResizeObserver 会自动重新计算并跟随到底部。
2. **闸门自动继续**（ApprovalCard、ToolConfirmation）：要满足「激活后自动播完一次」，必须闲置自动选择；「6 秒后自动允许写入」可能被读成不安全的范例。备选方案是无限等待并显示提示。
3. **Research 引用拆段**：TxStreamMarkdown 和 TxMarkdownView 走 `v-html`，放不进 TxInlineCitation；markdown 链接会真的导航 docs 页（`harden-html.ts:127-134`）。按方案拆成结论段和表格段，并在流式 markdown 里禁用链接。
4. **docs 正文样式泄漏**：模板根必须加 `not-prose`（`pages/docs/[...slug].vue:2091` 的 `.docs-prose.markdown-body.prose`，以及 :2618-2740 的 `p/ul/li/code/pre/h3/strong` 规则）。InsightMetric 的 `<code>`、CodeStream 的 `<code>`、StreamMarkdown 内部的 `.markdown-body` 都会受影响。
5. **本地化缺口**：每个组件都要传 zh 文案 props。无法覆盖的有：
   - ConversationStream 回底按钮的 `aria-label="Scroll to bottom"`（:536）。
   - `TxAiMessage` 的状态药丸，以及 parts 内嵌的 ReasoningDisclosure、ToolCallCard、Sources 文案。
   - `TxTabs` 的 `No tab selected`（:669）。
   - `TxToolConfirmation` 的 `aria-label` 后缀 ` confirmation`。
   - `TxThinkingOrb` 的默认 `label` 是英文，需要传 `label` 覆盖。

   CoT 里的 orb 用的是默认 label，无法覆盖。
6. **暗色透明底**：暗色下 `--tx-fill-color-blank: transparent`（`variables.scss:449`），非 BUI 组件的底色会消失；回底按钮会透明地压在文字上。模板面板要用不透明底（建议 `--tx-bui-page` / `--tx-bui-canvas`），回底按钮用 `:deep` 补 `background`。BUI 卡片在暗色下是 `#242424`，放在 `#141414` 至 `#181818` 的背景上呈抬起感，属于预期效果。
7. **虚拟化与内部状态**：ConversationStream 会卸载窗口外的项，内部状态（ToolCallCard 展开、Sources 展开、Confirmation 勾选）丢失，入场动画重播。用大 `overscan` 加受控 props 规避。只在初始化时读 `default*` 的组件，重置时只能靠 `generation` key 重建。
8. **reduced motion 覆盖不全**：
   - ConversationStream 的 JS 弹簧跟随没有保护。
   - TxTabs 完全没有保护，要手动关 `animation`。
   - TxAiMessage 的打字点和揭示动画没有保护。
   - demo 自己的计时器必须自行判断，并直接落到终态（先例 `AiSuiteStreamingAnswerDemo.vue:74-86`）。
   - 模板自己写的 CSS transition 也要补 `@media (prefers-reduced-motion: reduce)`（`tuffex-design-rules.md` 的「Every transition has a reduced-motion escape」）。
9. **激活提前 240px**：自动播放在进入视口前就开始了，读者可能错过开头。可以在模板内加可见度门槛（IO threshold ≈ 0.35）。
10. **滚动和焦点不能碰 docs 页**：禁止 `scrollIntoView`，自动播放期间禁止 `focus()`（例如 `TxPromptBar.focus()`），它们会把整页滚到 demo 位置。滚动一律用容器的 `scrollTop` / `scrollTo`，或 ConversationStream 暴露的方法。
11. **BUI 宽度上限**：ToolChips 和 ApprovalCard 320px，RecommendationCard 380px，ContextCards 默认 380px（可用 `--tx-bui-context-cards-max-width` 改）。在展开态的宽列里它们不会拉伸，布局要按上限设计，不建议用 `:deep` 去掉上限。
12. **PromptBar 菜单裁剪**：菜单向上绝对定位，没有翻转，也没有最高限。输入条上方需要约 220px 的未裁剪空间，因此圆角裁剪只放在模板根上，不要放在会话列或主列上。
13. **图标与资源**：
    - 图标类名只能写在 `.vue` 里，且只能用 carbon / cib / logos / twemoji 四个图标集；已核对若干 carbon 名称不存在（见 Import convention 第 4 节）。
    - favicon 用 data-URI，避免请求第三方网站。
    - 展示用户附件时避开图片预览：TxAttachmentTray 的预览是挂到 body 的 TxModal，z-index 由分配器发放（种子 2000），可能被展开浮层压住。
14. **TxThinkingOrb 默认随机形态**：要固定 `state`，否则每次重放外观不同。CoT 和 ReasoningDisclosure 内部的 orb 无法固定（`state` 未暴露）。
15. **类型导出缺口**：`CodeDiffRow` 未导出，用 `CodeStreamProps['diff']` 推导；Ai 相关类型统一从 `ai-elements` 导入。
16. **容器查询是 Nexus 首次使用**：仓库内没有 `container-type` 或 `@container` 先例。Vue scoped + scss 的编译需要在真实浏览器里确认。AI 组件内部基本没有 `position: fixed` 或 Teleport 元素，例外有两个：AttachmentTray 的图片预览（TxModal），以及 TxStreamMarkdown 遇到 mermaid 围栏时渲染的 `TxMermaidBlock`，它的全屏查看器 `<Teleport to="body">` 加 `position: fixed`（`TxMermaidBlock.vue:149-169, 255`）。模板里不用这两者，容器 containment 就不会影响定位；流式 markdown 里也不要写 mermaid 围栏。
17. **Mock 数据的真实性**：Research 涉及第三方引擎的准确率、延迟、体积等结论，一律写成定性描述或标注「示例数据」，不要伪造精确指标。

---

## Related Specs

- `.trellis/spec/frontend/bui-component-family.md`：BUI 组件是纯受控原语（时间轴留在 demo 层）、reduced-motion 规则、链接不自行导航、组件注册链（composable 不会被注册）。
- `.trellis/spec/frontend/tuffex-docs-sync.md:68-84`：demo 写法（`useI18n` 加 `copy` computed、`<style scoped>` 放最后、`onBeforeUnmount` 清理计时器），mdc 里的 `code:` 是理想化片段而不是原样源码，以及三道门禁命令。
- `.trellis/spec/frontend/tuffex-design-rules.md`：13–14px 正文、句首大写、600/500 字重、每个 transition 都要有 reduced-motion 出口。
- `.trellis/spec/frontend/nexus-docs-rendering-contract.md`：docs 正文渲染契约（与本任务的 prose 泄漏相关）。

## Caveats / Not Found

- 未在真实浏览器里验证任何组合，结论全部来自源码阅读。容器查询、Teleport 搬运实例、暗色观感都需要实现后用 ego 截图确认。
- `TxFineTuneCard`、`TxFlowchart` 也在 `@talex-touch/tuffex/ai` 入口里，已划给 Automation 模板，本文件没有覆盖。
- 展开浮层（D6）的具体实现（Teleport 目标、z-index 分配）不在本分组范围内，这里只列出 AI 模板对它的需求：确定高度、同一实例、重置可达。
- 第三方 OCR 引擎的真实指标没有做外部检索，mock 数据按「示例」处理。
