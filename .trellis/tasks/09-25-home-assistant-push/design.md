# 设计：主页个人助理推送

## 1. 模块

```
apps/core-app/src/renderer/src/modules/home-push/
  signals.ts          # 纯函数：从对话历史 / 项目 / 本机会话 / 剪贴板条目 / 当前项目 → HomeSignals
  summary.ts          # 纯函数：HomeSignals → 发给模型的摘要文本（只含标题、名称、计数）+ 摘要指纹
  opening.ts          # 开场白状态机：skeleton → streaming → done | fallback；10 分钟同指纹复用
  guide.ts            # 引导卡两步的数据（类别 → 起手任务，带本地名字）；导出 HOME_PUSH_ICON_CLASSES
  feed.ts             # 「为你准备」推送项（优先级、上限 4、动作描述）
  useHomePush.ts      # 组合：进入空白新对话时采集信号、启动开场白、给出 mode / steps / items / actions
  *.test.ts
```

- 纯函数与状态机都不碰 Vue 组件树，测试不需要挂载 HomePage。
- `useHomePush` 只在「空白新对话」（`isEmpty && conversationId === null` 且 Home 路由可见）时工作；离开空态立即取消未完成的调用。

## 2. 开场白状态机（`opening.ts`）

```
idle ──enter blank──▶ pending(skeleton)
pending ──first token──▶ streaming ──end──▶ done
pending ──2.5s / no provider / error──▶ fallback（模板，取消调用）
streaming ──error──▶ done（保留已到的文字；空则 fallback）
任意 ──leave blank / send while pending|streaming──▶ cancelled（不并入对话）
```

- 调用：`sdk.stream('text.chat', { messages: [system(prompt), user(summary)], temperature: 0.7, maxTokens: 160 }, handlers, { timeout: 8000, metadata: { operation: INTELLIGENCE_HOME_OPENING_OPERATION } })`；`stream` 抛错且无任何活动时不做非流式回退（开场白不值得第二次计费），直接模板。
- 复用：模块级缓存 `{ fingerprint, text, at }`，同指纹 10 分钟内直接进入 `done`。
- 输出清洗：去掉首尾引号、限制最多 3 句 / 160 个字符，超出截断到句末；清洗后为空走模板。
- 模板：由信号决定用哪一句（有未完成对话 / 有本机会话 / 什么都没有），全部来自语言包插值。

## 3. 推送与引导（`feed.ts` / `guide.ts`）

- 推送项结构直接对齐 `TxChoiceCard` 的 `ChoiceOption`（`id` / `label` / `description` / `icon`），外加一个本地 `action` 判别联合：`open-conversation` / `continue-session` / `prefill` / `enter-project`。
- 引导卡：第 1 步五个类别写死在 `guide.ts`；第 2 步由 `(category, signals)` 生成，有项目时插入「梳理 某项目 最近的进展」这类带真实名字的任务；最后一项固定「我自己说」（动作 `focus-composer`）。
- 图标类名集中导出为 `HOME_PUSH_ICON_CLASSES`，加入 `apps/core-app/uno.config.ts` 的 safelist 与 `configDeps`（与 `MAIN_WINDOW_COMMAND_ICON_CLASSES` 同一做法），并加一个测试断言每个类名都能在已安装的图标集里找到。

## 4. HomePage 改动

```
.HomePage-Head
  AppLogo（48px，给英雄区腾高度）
  h1 问候语
  .HomePage-Opening        ← 固定 3 行高度；pending 时 TxSkeleton 两行，其余渲染文本
.HomePage-ComposerGroup
  （输入框不变）
  TxChoiceCard :columns="2"  ← 替换 .HomePage-Pills；mode = guide | feed
```

- 卡片动作：
  - `open-conversation` → `router.push('/home/c/:id')`；`continue-session` → 复用侧边栏同一个续接函数（抽到 `modules/conversation/` 下共享，不复制）；`enter-project` → `enterConversation(projectId)`；`prefill` → 写 `draft` 并聚焦；起手任务 → 写 `draft` 后调用 `submit()`（与手动发送同一路径，分裂动画照常）。
- 并入对话：`submit()` 发送前若开场白为 `done`，把它作为 `lead` 交给 `conversation.send(text, attachments, { lead })`；`useHomeConversation.send` 新增可选 `lead`，仅在线程为空时先压入一条 `status: 'complete'` 的助理消息，其余语义不变。
- 离场：卡片与开场白随问候语一起离场（沿用 `home-head` / `home-pills` 的离场过渡），不新增动画体系。

## 5. 发给模型的兼容处理（`useHomeConversation.toProviderMessages`）

- 规则：已完成消息列表里，第一条用户消息之前的所有助理消息合并成一条 `system` 消息：`对话开始时你对用户说过：「…」`（文案走语言包，由调用方注入，保持模块纯净，与标题生成的做法一致）。
- 不新增存储字段：判定完全基于位置（只有开场白会出现在第一条用户消息之前），重新加载的对话同样成立。
- 标题：`maybeGenerateTitle` 改为取第一条用户消息之后的第一条已完成助理消息。

## 6. 取舍记录

- **为什么开场白不用 home surface**：带 surface 会触发技能注入，pi CLI 还会以 `conversationId` 建原生会话；开场白发生在对话 id 分配之前，也不该在用户没开口时占用原生会话。
- **为什么剪贴板只填不发**：剪贴板正文是最敏感的本地数据；只在用户点了之后放进输入框，发不发由用户看过之后决定，也保证「发给模型的摘要不含剪贴板正文」这条约束在推送路径上同样成立。
- **为什么 10 分钟复用**：连续点几次「新建对话」时每次都调用模型，花钱却换不来新信息；摘要一变（新对话、新会话、切项目）立即重新生成，老板要求的「每次打开新对话都由模型开场」在信息有变化时依然成立。2026-09-25 评审时老板确认采用。
