# 实施计划：主页个人助理推送

## 前置

- `09-25-home-project-badge-dedupe` 已完成；`09-25-tuffex-choice-card` 已在 tuffex dist 中（含 `columns`）。
- 读规范：`component-guidelines.md`（加载态骨架、i18n）、`hook-guidelines.md`、`state-management.md`、`type-safety.md`（新增 operation 常量）、`../guides/cross-layer-thinking-guide.md`（`packages/utils` 常量 + 渲染层 + 主进程审计三端）。

## 步骤

1. `packages/utils/types/intelligence.ts`：新增 `INTELLIGENCE_HOME_OPENING_OPERATION = 'home-opening'`；主进程审计 / 路由如按 operation 做白名单，同步登记（先 `rg "conversation-title"` 找到所有登记点）。
2. `modules/home-push/` 纯函数与状态机 + 单测（PRD 验收的两组单测）。
3. `useHomeConversation`：`send` 的 `lead` 参数；`toProviderMessages` 的前置助理消息转系统提示（文案由调用方传入）；更新 `useHomeConversation.test.ts`。`HomePage.vue` 的 `maybeGenerateTitle` 改取用户消息之后的助理消息。
4. 共享续接函数：把 `ShellConversationList.vue` 的 `continueSession` 抽到 `modules/conversation/`（侧边栏与推送共用）；侧边栏子任务若已先改动这个文件，在其基础上抽取。
5. `uno.config.ts` safelist + `configDeps` 加 `HOME_PUSH_ICON_CLASSES`；图标存在性测试。
6. `HomePage.vue`：英雄区开场白、`TxChoiceCard` 替换快捷胶囊、卡片动作、并入对话；删掉 `quickPills` / `applyPill` 与对应样式和 `home.pill.*` 文案（确认无其他引用）。
7. 语言包 zh-CN / en-US：提示词、模板、引导卡、推送项、骨架无障碍文案。
8. 真实应用走查（带调试端口的 dev，见 `09-25-send-split-fusion` 步骤 1）：PRD 列出的四个场景，亮 / 暗、600px 高窗口；走查用的对话结束后从历史里删除。

## 验证命令

```bash
cd apps/core-app
pnpm exec vitest run \
  src/renderer/src/modules/home-push \
  src/renderer/src/modules/conversation \
  src/renderer/src/modules/lang
npx vue-tsc --noEmit -p tsconfig.web.json --composite false
npx tsc --noEmit -p tsconfig.node.json --composite false      # 若步骤 1 动了主进程登记点
npx eslint --quiet src/renderer/src/modules/home-push src/renderer/src/views/base/home src/renderer/src/modules/conversation
npx prettier --check src/renderer/src/modules/home-push src/renderer/src/views/base/home
curl -s http://127.0.0.1:5173/__uno.css | /usr/bin/grep -a -c "i-ri-"   # safelist 生效抽查
git diff --check
```

## 风险与回滚点

- **成本**：走查期间每次进入空白新对话都会调用模型；2026-09-25 老板确认测试全部走真实提供方。模板兜底路径仍需用不可用路由（或断网）单独验证一次。
- **提供方兼容**：前置助理消息转系统提示后，逐个用老板实际在用的提供方各发一轮确认不报错（尤其 Anthropic 与 pi CLI）。
- **与发送分裂动画同改 `HomePage.vue` / `submit()`**：本任务在分裂动画之后落地，开工前重读最新 `submit()`。
- 回滚点：`useHomeConversation` 的 `lead` 是可选参数，回退 HomePage 即可恢复旧空态；`home-push/` 目录可整体删除。

## Step 6 hand-off（步骤 1–5、7 已落地，HomePage 尚未接入）

步骤 1–5、7 的模块都已就位且有单测；`HomePage.vue` 一行未动。第 6 步只需按下面接线，不必再改 `home-push/` 与 `useHomeConversation`。

### 1. 会话：注入系统提示文案

```ts
import { createOpeningLeadNote } from '~/modules/home-push/opening'

const conversation = useHomeConversation({
  routing: () => modelRouting.value,
  autoContext: () => autoContext.value,
  identity: () => { /* 不变 */ },
  // 首条用户消息之前的助理消息（开场白）在每一轮都以这条系统提示发给模型。
  leadNote: createOpeningLeadNote(t)
})
```

### 2. 推送：放在 `conversationId` / `projectId` 声明之后

`useHomePush` 内部用 `immediate` watcher 立即读 `active()`，放在 `const conversationId = ref(...)`（Persistence 段）之前会撞上 TDZ。

```ts
import { useHomePush } from '~/modules/home-push/useHomePush'

const push = useHomePush({
  // 只认纯 `/home`：`isHomeRoute` 含 `/home/c/:id`，恢复旧对话时 `history.load` 返回前
  // conversationId 仍是 null、isEmpty 仍为 true，会白白起一次开场白调用。
  active: () => route.path === '/home' && isEmpty.value && conversationId.value === null,
  projectId: () => projectId.value,
  composer: {
    // 剪贴板项：只写入并聚焦，绝不发送。
    prefill: async (text) => {
      draft.value = text
      await nextTick()
      autoGrow()
      inputRef.value?.focus()
    },
    // 起手任务：写入后走与手动发送同一条 submit()（分裂动画照常）。
    send: async (text) => {
      draft.value = text
      await nextTick()
      autoGrow()
      await submit()
    },
    // 「我自己说」
    focus: () => inputRef.value?.focus()
  }
})
const { step: pushStep } = push // 给 v-model:step 用（模板里不会自动解包对象内的 ref）
```

返回值（`UseHomePushReturn`）：

| 字段 | 用途 |
| --- | --- |
| `mode` | `'guide' \| 'feed'` |
| `steps` / `step` / `selected` | `TxChoiceCard` 的 `steps`、`v-model:step`、`selected` |
| `loading` / `loadingRows` | `TxChoiceCard` 的 `loading`、`loading-rows`（本次进入空态的本地读取未落地前为 true） |
| `feed` | 「为你准备」原始行（带 action），一般用不到 |
| `opening.phase` / `opening.text` / `opening.source` | `pending` 显示两行骨架（进入空态即为 pending，含本地读取）；`streaming` / `interim` / `done` / `fallback` 显示 `text`（`interim` 是模板顶着，`source` 从 `template` 变 `model` 时整段换场）；`idle` / `cancelled` 留空但保留高度。`useHomePush` 另收 `routing`（输入框路由 getter）与 `routingReady`（模型列表加载） |
| `labels` | `prev` / `next`（翻页按钮）、`openingLoading`（骨架的无障碍文字） |
| `choose(payload)` | `TxChoiceCard` 的 `@select`，自行执行动作，不抛错 |
| `takeLead()` | 发送时调用：开场白已 `done` 则返回文本（仅一次）；生成中则取消并返回 null；模板返回 null |
| `leadNote` | 与 `createOpeningLeadNote(t)` 等价 |

### 3. `submit()`：在 `canSend` 守卫之后、任何 await 之前取开场白

```ts
const lead = push.takeLead() ?? undefined
// …
const turn = conversation.send(text, attachments, { lead })
```

注意：带 lead 的发送会在同一次 flush 里追加 `[开场白, 用户消息, 占位]` 三行。现有的 `messages.length` watcher 会把三行都 `markEntering`，而认领的发送（含用户消息）直接 return，只有用户消息（分裂）与占位（`playEntrance`）会被揭示——开场白那行会停在 `HomePage-Message--enter`（opacity 0）。第 6 步需要为它单独 `playEntrance`，或把它排除在 `markEntering` 之外。

### 4. `maybeGenerateTitle()`：跳过开场白（步骤 3 欠的 HomePage 部分）

```ts
import { findTitleExchange } from '~/modules/conversation/conversation-title'

const firstAssistant = findTitleExchange(messages.value).firstAssistantContent
```

替换现在的 `messages.value.find((m) => m.role === 'assistant' && m.status === 'complete')?.content`。`firstUserContent` computed 不用改（它本来就取第一条用户消息）。

### 5. 模板

- `.HomePage-Head` 内问候语下加开场白区：固定 3 行高度；`opening.phase === 'pending'` 时放两行 `TxSkeleton`（`aria-hidden`，区域本身 `aria-busy` + `labels.openingLoading`），其余渲染 `opening.text`。
- 用 `TxChoiceCard :columns="2"` 替换 `.HomePage-Pills`：`:steps="push.steps.value"`、`v-model:step="pushStep"`、`:selected="push.selected.value"`、`:loading="push.loading.value"`、`:loading-rows="push.loadingRows.value"`、`:prev-label` / `:next-label`、`@select="push.choose"`。
- 删掉 `quickPills` / `applyPill`、对应样式，以及语言包里的 `home.pill.*`（确认无其他引用后）。

### 6. 打包验收脚本（check 阶段已处理）

`apps/core-app/scripts/coreapp-packaged-ai-provider-acceptance.ts` 已登记 `INTELLIGENCE_HOME_OPENING_OPERATION`：`home-opening` 审计行按 id 纳入窗口（可早于窗口开始），计入 `audit.homeOpeningRequests`，与其他行一样要求唯一 trace、验收提供方、成功并参与用量对账，但不属于期望行；首轮 / 次轮的原始行数比较与取消窗口的账本比较都加上这个数。`coreapp-packaged-ai-evidence-verify.ts` 同步接受该字段（`matched = expected + homeOpeningRequests`）。`runHomeStream` 取「最后一条新助理消息」作为回复，开场白并入时不会被误认成未流式的回复。

同一轮还修了 `providers/anthropic-provider.ts`：多条 system 消息（主进程技能 / 规则注入 + 开场白系统提示）按顺序合并成一条前置 system，否则 LangChain 的 Anthropic 适配器会对第二条 system 抛错，带开场白的对话在 Anthropic 上每一轮都会失败。
