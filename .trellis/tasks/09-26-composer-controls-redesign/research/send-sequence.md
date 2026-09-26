# Research: 发送键在「按下 → 分裂 → 回复流式 → 结束」期间的状态序列与可同步的时间点

- **Query**: 发送键在一次发送里的状态序列：按下 → 分裂动画（`composables/send-split/`、`useSendChoreography.ts`）→ 回复流式（停止键）→ 结束；列出发送键可以对齐的时序钩子。
- **Scope**: internal（工作区代码，`09-25-send-split-fusion` 进行中、未提交；时间点用 score 常量 + 同一弹簧积分器估算）
- **Date**: 2026-09-26

## Findings

### Files Found

| File Path | Description |
|---|---|
| `apps/core-app/src/renderer/src/views/base/home/HomePage.vue`（工作区） | `submit()`（09:14 时在 `:637-767`）：分裂 / 旧飞行的编排与各钩子接线 |
| `apps/core-app/src/renderer/src/composables/useSendChoreography.ts`（工作区） | `playSplit`、`playDraftGhost`、`playComposerFlip`（`delay` + `release()` + `edgeOffset()`）、`recoilComposer`、`knockRows`、涟漪；对外句柄只有 `{ impact: Promise<void> }` |
| `apps/core-app/src/renderer/src/composables/send-split/score.ts`（工作区，09:16 仍在改） | `SPLIT_SCORE`：所有时长 / 弹簧 / 距离 |
| `apps/core-app/src/renderer/src/composables/send-split/split-driver.ts`（工作区） | 逐帧驱动器；钩子 `onBreak / onRelease / onPull? / onKnock / onImpact(landing) / onLand / readLanding` |
| `apps/core-app/src/renderer/src/modules/conversation/useHomeConversation.ts` | `isStreaming` 何时变、`stop()` 语义 |
| `.trellis/tasks/09-25-send-split-fusion/design.md` | 总谱（§1）、层级（§2）、模块划分（§3） |

### 现状：发送键在一次发送里经历的事（代码事实）

1. **按下**：鼠标 `click`（松开时触发）或 Enter（`handleKeydown`，`isComposing` 时不发）或快捷键 `send` → `submit()`。发送键**没有**任何按下反馈以外的动画；Enter / 快捷键发送连按压缩放都没有（`:active` 只对指针按下生效）。
2. `submit()` 同步段：`choreography.invalidate()`（先让上一次还在飞的分裂落位）→ `playDraftGhost()`（草稿原位上升 14px、模糊 8px、淡出，170ms，`cubic-bezier(0.4, 0, 1, 1)`）→ `splitting = true`（输入框 `.is-splitting`：描边回常态色、流式光 `--home-glow-on` 压成 0、placeholder 透明）→ `draft = ''` → `await nextTick()`。
3. `conversation.send(text, attachments)`：同步推入 `[用户消息, 空的助手占位]` 并置 `streaming = true`（`useHomeConversation.ts:623-637`）。下一次渲染时，**发送键被 `v-if` 换成停止键**——这发生在分裂真正开始之前。
4. 分裂（`playSplit`）：等 `settleFrames: 2` 帧（新行渲染 + 虚拟列表测高）后一次性测量，交给 `SendSplitDriver` 逐帧推进；有附件的发送改走旧的克隆飞行 `playSend`；reduced motion 下 `playSplit` 直接返回 `null`、消息原位出现。
5. 回复：助手占位在 `flight.impact` 之后 +80ms 用 `playEntrance` 揭开（思考球）；首个 token 到达后思考球换成流式文本。
6. 结束：`conclude()` 置 `streaming = false`（完成 / 失败 / 取消都走这里），停止键被换回发送键；此时草稿通常为空，发送键是禁用的中性灰。
7. 停止：`conversation.stop()` → `activeTurn.cancel()` **同步**完成：已有内容则标记完成，没有内容则删掉占位行，`streaming` 当帧变 false。

### 时间线（首次发送与停靠后发送共用；毫秒从 `submit()` 起算）

分裂内部时刻按 `SPLIT_SCORE` 与 tuffex `springSteps` 同一积分器估算（脚本 `/tmp/composer-controls-probe/split-timeline.mjs`、`retract.mjs`；60Hz 帧量化，落点距离 120–600px 结果相同，因为线性弹簧的首次到达时间与幅度无关）：

| t（约） | 事件 | 来源 | 发送键可以做什么 |
|---|---|---|---|
| 0 | `submit()`：草稿幽灵 170ms 开始；`splitting = true`；`isStreaming → true` | `submit()`、`useHomeConversation.send` | **起跳**：按压回弹 + 箭头随消息向上「射出」（与草稿幽灵同向同曲线）；这是唯一必须由按钮自己演的一拍 |
| 0–170 | 草稿幽灵上升、模糊、淡出 | `SPLIT_SCORE.ghostMs / ghostRisePx / ghostBlurPx` | 箭头离场可直接复用这三组数（或按 32px 键等比缩小） |
| ≈33 | 分裂启动（两帧测量后）；凸起按 `smooth` 长出 | `settleFrames: 2` | — |
| ≈183 | 开始拉扯（`pullDelayMs: 150`）；**`onPull`**：首次发送的输入框在这一刻开始下沉（R16） | `split-driver.ts` `onPull?.()` → `dock.release()` | 停止形态的图标可在此前后完整就位（输入框开始移动，按钮随它走） |
| ≈316 | **断开**（颈部 pinch 到阈值，`breakAt: 40` 的约 96%）：`onBreak` → 输入框回弹 `recoilComposer`（深度 `recoilScale: 0.97`，420ms，`composite: 'add'`）；多行草稿 180ms 收缩 | `onBreak` | 按钮在输入框里，**自动继承**这次回弹；不需要再叠一次，否则像抖 |
| ≈433 | 敲击上方消息（落地前 `knockLeadMs: 110`） | `onKnock` | — |
| ≈470–500 | 输入框上的残尖缩回（`retract: 'snappy'`，断开后约 150–185ms）：**`onRelease`** → `splitting = false` → `.is-splitting` 撤掉 → 输入框流式光 `--home-glow-on` 用 0.6s 淡入 | `onRelease` | **停止键的渐变光环在这一刻开始淡入**——读同一个 `--home-glow-on` 就自动对齐 |
| ≈550 | 首次触及落点：**`onImpact(landing)`** → 涟漪（`ripple`：2 环、900ms）；`flight.impact` resolve → +80ms 揭开思考球占位 | `onImpact`、`submit()` 里 `flight.impact.then(...)` | 可选：光环亮一下（与涟漪同拍）；默认不做，避免抢戏 |
| ≈720–800 | 水滴停稳、校验后换成真实行：`onLand` | `verify()` → `finish()` | — |
| ≤1600 | 分裂超时兜底（`timeoutMs`）；首次发送的下沉最多等 900ms（`flipHoldMaxMs`）；隐藏行最迟 2000ms 被揭开（`ENTRANCE_WATCHDOG_MS`） | score / choreography | 按钮不应依赖这些兜底 |
| 首 token | 占位里的思考球换成文本（没有事件，只有数据变化） | 模板条件 `status==='streaming' && !content && !segments.length` | 「等待中」→「生成中」：只换节奏，不换形态 |
| 结束 | `isStreaming → false` | `conclude()` | **回收**：停止形态收回发送形态（草稿空→中性，非空→主色） |

有附件的发送（旧克隆飞行）：`FLIGHT_MS = 460`、`FLIGHT_SPLIT_MS = 253`（输入框回弹）、`FLIGHT_IMPACT_MS = 324`（撞击）（`useSendChoreography.ts` 顶部常量）；`splitting` 始终为 false，输入框流式光在 `isStreaming` 变 true 时直接淡入。

### 视图层能拿到的钩子（不需要改分裂内部）

| 钩子 | 在哪 | 何时 | 备注 |
|---|---|---|---|
| `submit()` 开头 | `HomePage.vue` | t=0 | 鼠标、Enter、快捷键三条路径都经过这里——按钮的「起跳」应该在这里被调用，而不是只挂在 `:active` 上 |
| `splitting` ref | `HomePage.vue` | t=0 → `onRelease`（≈500ms） | 已经驱动输入框 `.is-splitting` |
| `--home-glow-on`（`@property`，`inherits: true`） | 输入框样式 | `.is-live` 时 1、`.is-splitting` 时 0，0.6s 过渡 | 放在输入框里的元素直接继承；最省事的同步方式 |
| `onPull` / `onBreak` / `onRelease` / `edgeOffset` | `playSplit(sentId, {...})` 的参数 | 见上表 | 这几个都已经被 `submit()` 占用（下沉、收缩、解锁）；要加按钮逻辑就在同一回调里顺手调用 |
| `flight.impact` | `playSplit` / `playSend` 返回值 | 首次触及 | 已用于揭开思考球 |
| `choreography.scheduleForCurrentSend(fn, ms)` | `useSendChoreography` | 任意延时，被新发送 / 卸载取消 | 需要「新发送让旧节拍作废」语义时用它，不要裸 `setTimeout` |
| `isStreaming` / 首 token 条件 | `useHomeConversation` / 模板 | 见上 | 纯数据，按钮用 computed 派生 |

### 需要按钮自己处理的边界

- **很快失败**：没有可用提供方时 `runTurn` 很快走到 `fail → conclude`，`isStreaming` 可能在分裂还没断开时就变回 false；按钮会在几十到几百毫秒内经历「发送 → 停止 → 发送」。
- **连发**：第一条还在飞时发第二条，`invalidate()` 先让第一条落位；但第二条要等回复结束（`canSend` 在流式期间为 false），所以连发只发生在上一轮已结束、分裂尚未落地的窗口里——按钮此时可能正从停止收回发送，又被按下。
- **停止在首 token 之前**：占位行被删除（`dropMessage`），如果此时分裂还在飞，用户消息照常落地。
- **切换对话 / 卸载**：`choreography.cancel()` 让分裂立即落位；按钮状态随 `isStreaming` 立即回到发送。
- **reduced motion**：分裂不跑、消息直接出现；按钮也应直接落到各状态终态。
- **焦点**：停止键 → 发送键如果仍是两个元素互换，键盘焦点会丢；换成常驻单元素才能保住（禁用态用 `aria-disabled` 而不是原生 `disabled`）。

## Caveats / Not Found

- 分裂是进行中的任务：`score.ts` 在 09:16 仍在改（涟漪参数已与 `design.md` 初值不同），`split-driver.ts` 的钩子在本次调研期间新增了 `onPull` 与 `onImpact(landing)` 参数。上面的时刻只由「拉扯 / 断开 / 飞行」三根弹簧决定，这几项常量目前未变；改了就要重算。
- 时刻是用同一积分器离线估算的，不是录帧；真实窗口里主线程繁忙会让 rAF 帧变长（驱动器按墙钟推进，落点时刻大体不变，但单帧会跳）。按约束本次没有对运行中的应用做 CDP。
- 首个 token 何时到达取决于提供方，无法给出固定时刻。
