# Research: 方案——输入框工具栏统一重做 + 「灵动岛」发送键

- **Query**: 基于 `pilot-composer.md`、`dynamic-island-motion.md`、`current-toolbar.md`、`send-sequence.md`，给出可拍板的重做方案：工具栏统一的视觉结构；发送键状态机（每个转换的形变、时长 / 弹簧、reduced-motion 降级）；拆成哪些独立组件，让 `HomePage.vue` 只做接线。
- **Scope**: mixed（结论基于本目录的调研文件）
- **Date**: 2026-09-26（13:50 修订）

> **修订记录（13:50）**：老板已拍板 D1（停止形态 = 向左长成约 72px 的「■ 停止」胶囊，盖住麦克风位置）、D10（本任务接听写）、D11（「高」接真实推理强度）；D12 已由 `09-26-composer-paste-anywhere` 放开。本次改写：§2 的状态外观、转换与时序全部按现行发送动画「托起」（`useSendChoreography.liftDraft` + `composables/send-lift/`）重对，删掉已废弃的融合分裂钩子（`onPull` / `onBreak` / `onRelease` / `splitting`）；新增 §2.6 胶囊形变的实现约束；§1.5、§3、§4、§5、§6、§7 相应更新。听写与推理强度的细节分别在 `dictation.md`、`reasoning-effort.md`。其余推荐不变。

## 0. 一句话

工具栏五个控件收成**一个家族**：同高 32px、全圆角、无描边、三种材质（无底 / 灰底 / 实心）、悬停立即、按压统一「收缩 + 弹回」；发送键变成**一个常驻的小岛**——有字时主色圆，按下时箭头随托起的消息上移离场，自己向左**长成 72px 的墨色「■ 停止」胶囊**、盖住让了位的麦克风，并亮起与输入框同源的渐变光环，回复结束再收回成箭头圆、麦克风回来。麦克风接上听写（点按切换、电平条、文字进草稿），模型胶囊的「高」换成真实的推理强度。所有新代码放进 `views/base/home/composer/`，`HomePage.vue` 只剩一段组件标签和几行调用。

## 1. 统一的视觉结构

### 1.1 网格与同心

| 项 | 值 | 理由 |
|---|---|---|
| 控件高度 | **32px**（圆键 32×32；胶囊高 32） | 现状 30 / 28 两种；tuffex 对应物都是 32（`TxChatComposer` 发送、`TxIconButton sm`、`TxButton md`） |
| 控件外缘距输入框外缘 | **8px**（1px 描边 + 7px） | 32px 圆的半径 16 + 8 = 24 = 输入框圆角 `--shell-radius-2xl`：角上的 `+` 与发送键和输入框同心（苹果 HIG「concentric placement」，tuffex「Nested radii must be concentric」） |
| 实现 | `.ToolRow` 负外边距：左右 `-9px`、下 `-5px`（输入框内边距 16 / 16 / 12 不动） | 文字仍离角 16px（「Horizontal inset clears the corner radius」） |
| 控件间距 | 8px（两簇内部） | 与现状、`TxChatComposer` 一致；也正好让「麦克风 32 + 间距 8 + 发送 32」= 停止胶囊的 **72px** |

### 1.2 三种材质（静止态；任何控件都不再有描边）

| 材质 | 用于 | 静止 | 悬停（立即，无过渡） | 墨色 / 对比 |
|---|---|---|---|---|
| **无底 quiet** | `+`、麦克风 | 透明 | 底 `--shell-surface-2`，墨升为 `--shell-text-primary` | 图标 `--shell-text-secondary`（亮 5.07 / 暗 8.33，图形需 3:1） |
| **灰底 tonal** | 权限、模型 | 底 `--shell-surface-2` | 底 `color-mix(in srgb, var(--shell-text-primary) 6%, var(--shell-surface-2))` | 文字 `--shell-text-regular`（7.95 / 9.16）；下拉箭头 `--shell-text-secondary`（4.42 / 6.30） |
| **实心 solid** | 发送键 | 见 §2 | 立即加深 `color-mix(in srgb, var(--shell-primary) 88%, var(--shell-text-primary))`，**去掉悬停放大** | 箭头 `--shell-on-primary`（4.09 / 5.24） |

权限胶囊的三档是灰底的色调变体（保留「完全允许」必须一眼可见的要求）：

| 模式 | 底 | 墨（按 `tuffex-design-rules.md` 同色相配方换算到 shell 令牌，实测见 `current-toolbar.md` 第 11 条） | 强调 |
|---|---|---|---|
| 禁用 off | `--shell-surface-2` | `--shell-text-regular` | — |
| 自动审阅 review | `--shell-primary-soft` | `color-mix(in srgb, var(--shell-primary) 75%, var(--shell-text-primary))`（5.17 / 6.60；现状 3.61） | 内描边 `inset 0 0 0 1px var(--shell-primary-border)`（ring，不占布局） |
| 完全允许 full | `--shell-danger-soft` | `color-mix(in srgb, var(--shell-danger) 75%, var(--shell-text-primary))`（6.66 / 6.04） | 内描边 `--shell-danger-border` |

### 1.3 统一的反馈

- **悬停**：只换底色 / 墨色，立即生效；删掉现有四处 `background-color/border-color .15s`（规范 `tuffex-design-rules.md:139-145`）。
- **按压**：所有控件同一段 WAAPI「收缩 + 弹回」（§4 的 `press` / `release`）；指针、空格、Enter 都触发，不依赖 `:active`。
- **状态变化**（权限切档、模型名变化、发送键换态）：颜色过渡只挂在 `.is-morphing` 上，180ms `--tx-ease-out-strong`（`TxModeChip` 的做法）。
- **焦点**：`:focus-visible { outline: 2px solid var(--shell-primary); outline-offset: 2px }`——偏移 2px 让焦点环在主色发送键外面也看得见（现状偏移 0，贴在同色填充上）。停止胶囊的焦点环跟随胶囊外形（§2.6）。
- **禁用**：`aria-disabled="true"` + 拦截点击，不用原生 `disabled`（发送后焦点停在按钮上不丢）。

### 1.4 字与图标

- 胶囊文字 13px（`--shell-fs-body`），值 500、前缀（「权限 ·」）400；行高 18px；胶囊左右内边距 12px，带前置图标一侧 10px。
- 图标：圆键内 16px；胶囊前置图标 14px（`TxIcon :size="14"`）；下拉箭头 14px。全部显式写尺寸，不再跟随按钮字号。

### 1.5 各控件落位

| 控件 | 材质 / 形状 | 内容 | 状态 |
|---|---|---|---|
| `+` 附件 | 无底 / 圆 | `i-ri-add-line` 16 | **流式期间可用**（D12 已放开：`addFiles` 不再拦流式，HomePage WT `:776-780`） |
| 权限 | 灰底色调 / 胶囊 | 盾牌图标 14 + 「权限 · 模式」 | off / review / full；≤520px 容器宽度时只剩图标圆键（保留现有容器查询） |
| 模型 | 灰底 / 胶囊 | 模型图标 14 + 模型名 + **推理强度后缀** + 下拉箭头 | 后缀按 `reasoning-effort.md` §4.5：「自动」或路由不支持时不显示，否则显示实际会发出的档；菜单打开时箭头翻转 |
| 麦克风 | 无底 / 圆 | `i-ri-mic-line` 16；听写中换成 4 根电平条 | `idle / starting / listening / finishing`（`dictation.md` §4.2）；**流式期间让位**（淡出、`inert`，被停止胶囊盖住） |
| 发送 | 实心 / 圆 → 墨色胶囊 | 箭头 / 「■ 停止」+ 渐变光环 | 见 §2 |

与页面其他部分对齐的点：无底键的悬停底色与顶栏图标键相同（`HomeTopBar.vue:271-274`）；「灰底、无描边、立即悬停、选中用内描边」与 `TxChoiceCard` 同一套语言。附带发现（留给 `09-25-home-assistant-push` 第 6 步）：`.HomePage` 把 `--tx-fill-color` 与 `--tx-fill-color-light` 都桥接成 `--shell-surface`（HEAD bb76c8d0a `HomePage.vue:1550-1551`），`TxChoiceCard` 选项的悬停（`fill-light → fill`）在 Home 里将**看不出变化**。

## 2. 发送键：小岛状态机

### 2.1 状态（纯函数派生，不存状态）

```ts
type SendState = 'empty' | 'ready' | 'waiting' | 'streaming' | 'blocked'

deriveSendState({ hasText, streaming, awaitingFirstToken, blocked, dictating }):
  !streaming            → hasText && !dictating ? 'ready' : 'empty'  // 听写中不可发送（dictation.md §4.5）
  blocked               → 'blocked'     // agentTools.pending：模型在等你批准工具调用
  awaitingFirstToken    → 'waiting'     // 与思考球同一条件：status==='streaming' && !content && 无片段
  otherwise             → 'streaming'
```

「起跳」不是状态，是 `ready → waiting` 这一次转换的编排，由 `submit()` 在 t=0 显式调用 `launch()` 触发（鼠标、Enter、快捷键都经过 `submit()`）。

### 2.2 各状态的样子

形状只有两种：**32px 圆**（`empty` / `ready`）与 **72px 胶囊**（`waiting` / `streaming` / `blocked`）。胶囊向左长，右缘始终与圆的右缘重合，盖住「间距 8 + 麦克风 32」。

结构（按压只动按钮、宽度只动按钮本身、皮与内容分层、光环独立；细节见 §2.6）：

```
div.SendSlot                 ← 行里的占位，永远 32×32（flex: none），整行布局从不因发送键改变
  button.SendIsland          ← position: absolute; right: 0; top: 0; height: 32; width 32 ↔ 72；overflow: visible
    span.SendIsland-Ring     ← TuffIntelligence 渐变环带：inset -3px，1.5px 环带（mask exclude）+ 3px 模糊淡晕；形状跟随按钮（圆 / 圆角矩形）
    span.SendIsland-Skin     ← inset 0，border-radius 16px，overflow: hidden（长的过程中裁住内容）
      span.SendIsland-Glyphs ← 右对齐叠放：箭头（iconify，位于右侧 32px 方格）｜「■ 停止」（方块 10×10 圆角 2.5 + 「停止」13px/500）
    MetaHintBadge :command="streaming ? 'stop' : 'send'" placement="above"
div.MicSlot                  ← 32×32，在行里；流式时麦克风在此淡出、inert，但位置保留
```

| 状态 | 形 | 皮 | 内容 | 光环 | aria |
|---|---|---|---|---|---|
| `empty` | 圆 | `--shell-surface-2`（与 artboard `AHQQk` 一致） | 箭头，`--shell-text-muted` | 无 | 「发送」，`aria-disabled`（听写中另加说明「先结束听写」） |
| `ready` | 圆 | 主色，左上高光：`linear-gradient(135deg, color-mix(in oklch, var(--shell-primary), white 18%), var(--shell-primary) 65%)`；接触阴影 `1px 2px 6px color-mix(in srgb, var(--shell-primary) 28%, transparent)`（左上光源 x:y=1:2） | 箭头，`--shell-on-primary` | 无 | 「发送」 |
| `waiting` | 胶囊 72 | 墨色 `--shell-text-primary`（亮色近黑、暗色近白——「岛」） | 「■ 停止」，墨 `--shell-bg`；方块呼吸 `scale 0.92↔1`（1.4s） | 旋转 2.4s/圈 + 透明度呼吸 | 「停止生成」 |
| `streaming` | 胶囊 72 | 墨色 | 「■ 停止」，静止 | 旋转 2.4s/圈，满透明 | 「停止生成」 |
| `blocked` | 胶囊 72 | 墨色 | 「■ 停止」 | 暂停旋转、透明度 0.5（在等你批准） | 「停止生成」 |

光环的色标与输入框流式光完全相同（`#0894ff, #c959dd 27%, #ff2e54 52%, #ff9004 74%, #0894ff`，`in oklch`），并把这组色标提成一个自定义属性（例如 `--home-live-stops`）两处共用；透明度乘以从输入框继承的 `--home-glow-on`。**托起没有分裂期的压暗**：`.is-live` 在发送的同一次刷新里挂上（HomePage WT `:1477`、`:2245-2247`），`--home-glow-on` 从 t≈0 起用 0.6s 淡入——胶囊环读同一个变量，不需要任何计时器。圆角矩形环的旋转转的是伪元素里的 conic 渐变（`rotate`，合成线程），环带形状由 mask 决定。

胶囊宽度 72px 的内容核算：内边距 12 + 方块 10 + 间距 6 + 「停止」2×13 + 12 ≈ 66–72；英文「■ Stop」同量级。可访问名「停止生成」包含可见文字「停止」（WCAG label-in-name）。

### 2.3 转换与形变（参数见 §4）

| # | 转换 | 触发 | 编排 |
|---|---|---|---|
| T1 | `empty → ready` | 打出第一个字 / 听写结束且有字 | 皮底色中性→主色、箭头墨色 180ms（`.is-morphing`）；皮 `scale 0.92 → 1` 走 `release` 弹簧（醒来） |
| T2 | `ready → empty` | 清空草稿 / 开始听写 | 只做 180ms 颜色回退，不缩放 |
| T3 | `ready → waiting`（**起跳 + 长成胶囊**） | `submit()` 调 `launch()`，t=0 | ① 指针已按下则从 0.86 放开；Enter / 快捷键则程序化压一下（70ms 到 0.86 再放）；② 箭头随托起的消息向上离场：上移 8px、淡出，140ms `cubic-bezier(0.4, 0, 1, 1)`——托起的气泡是清晰的、不模糊，箭头也不模糊，140ms 与托起的交叉淡化 `LIFT_SCORE.crossfadeMs` 同长；③ t=0 麦克风淡出并缩到 0.85（120ms 缓入），之后 `inert` + `aria-hidden`；④ **t+40ms 按钮宽度 32 → 72**，走 `morph` 弹簧（过冲峰值 74.2px 在起步后 179ms、即 ≈t+220ms；起步后 342ms 落定在 0.25px 内，脚本 `/tmp/composer-controls-probe/capsule-width.mjs`），右缘不动、向左长；⑤ t+60ms 起皮底色主色→墨色 200ms；⑥ **t+120ms「■ 停止」开花**：整体 `scale 0.6 → 1`（`morph`）、透明 0→1（180ms 强缓出）、方块圆角 5→2.5；⑦ 光环不自己计时，随 `--home-glow-on` 从 t≈0 起 0.6s 淡入 |
| T4 | `waiting → streaming` | 首个 token | 方块停止呼吸并轻跳一下（`1 → 1.06 → 1`，240ms）；光环呼吸收到满透明（300ms） |
| T5 | `waiting/streaming → empty/ready` | 回复结束（`isStreaming` 变 false） | ① 「■ 停止」缩小、淡出 120ms 缓入；② t+45ms 宽度 72 → 32（`morph`）；同时箭头从下方 8px 处回到原位（`morph`，「重新上膛」）；③ 皮底色墨色→中性 / 主色 200ms，皮 `0.94 → 1` 走 `release`；④ **t+160ms 麦克风回来**：`0.85 → 1`（`release`）+ 透明度 160ms，解除 `inert`（宽度收回起步后 92ms、即 ≈t+137ms，胶囊已退出麦克风槽）；⑤ 光环随 `--home-glow-on` 0.6s 淡出 |
| T6 | 点停止 | 按下即收缩到 0.95（胶囊的压深比圆浅，72px 压到 0.86 会像塌陷）；`stop()` 同步结束回合 | 等同 T5（从按压态开始） |
| T7 | 很快失败（开始后 <120ms 结束） | `isStreaming` 提前变 false | 「■ 停止」的开花计时被取消，**从不出现**；宽度从当前值收回（`commitStyles()` 后反向）；箭头按 T5 回位；麦克风按 T5 回来——看起来是「张了一下又收回去」，不闪停止文字 |
| T8 | `streaming ↔ blocked` | 工具确认卡出现 / 答复 | 光环 `animation-play-state` 暂停 / 继续，透明度 0.5 ↔ 1（300ms） |

打断：任何转换进行中来了新状态，先 `commitStyles()` 再 `cancel()` 旧动画，从当前样子接着走（每段都短，速度归零可接受；见决策 D3）。

与听写的交接（`dictation.md` §4.5）：听写中发送键停在 `empty` 外观；听写进行中若回复开始流式（表单卡提交、重试等入口），听写先优雅结束（`stop()`，final 仍落进草稿），麦克风随 T3 的③让位。

### 2.4 与托起 / 流式的对齐（全部用视图层已有的钩子）

时刻按 `send-lift/score.ts` 的弹簧与 `lift-driver.ts` 的判定、用同一积分器离线算出（脚本 `/tmp/composer-controls-probe/lift-timeline.mjs`，60Hz 帧；单行草稿，气泡高约 42px、起点在输入框顶边下方约 6px，所以要上移约 49px 才算「离开输入框」）。「普通」= `LIFT_SCORE.spring`（0.40s 响应、ζ 0.84）；「首条」= `openingSpring`（0.62s、ζ 0.86）+ 320ms 起步斜坡（从 6% 拉力渐入）。线性弹簧的到达时刻与距离无关，所以 `impact` 只随弹簧变；`onClear` 随落点距离变。

| t（约） | 钩子 / 事实 | 来源 | 发送键 / 胶囊 | 麦克风 |
|---|---|---|---|---|
| 0 | `submit()`：`canSend` 守卫之后第一行调 `toolbarRef.launch()`；同一段同步代码里 `choreography.liftDraft({ …, onClear })` 把气泡盖在草稿上、`lifting = true`；`draft = ''`；`await nextTick()` 后 `conversation.send()` 推入两行并置 `isStreaming = true` | HomePage WT `:608-656`；`useSendChoreography.ts:649-715` | T3 ①②开始 | T3 ③开始 |
| ≈0–16 | 下一帧渲染：`sendState` 变 `waiting`；输入框挂 `.is-live`，`--home-glow-on` 开始 0.6s 淡入 | `useHomeConversation.ts:637`；HomePage WT `:1477` | 光环随之淡入 | — |
| ≈33 | `lift.fly(sentId)` 等 `settleFrames: 2` 两帧后发射驱动器 | `useSendChoreography.ts:799-806`；`score.ts:17` | — | — |
| 40 | — | — | 宽度 32→72 起步 | — |
| 60 | — | — | 皮色主色→墨色 | — |
| 120 | — | — | 「■ 停止」开花（此前已结束回合则跳过，T7） | 已淡出、`inert` |
| 普通 ≈67–117 ／ 首条 ≈167–300 | **`onClear`**：气泡整体越过输入框顶边 → `lifting = false`，placeholder 回来（落点越远越早） | `lift-driver.ts:194-197` → HomePage WT `:631-633` | 无 | — |
| ≈220 | — | — | 宽度过冲峰值 ≈74.2px，≈t+380ms 落定在 72 | — |
| 普通 ≈367 ／ 首条 ≈717–750 | **首次触地 `impact`**（`flight.impact` resolve；或驱动器超时 / 提前落位时由 `finish()` 补发） | `lift-driver.ts:198-202`、`:147-150` | 默认不做（D14 的轻跳留给首 token） | — |
| 普通 ≈447 ／ 首条 ≈797–830 | **占位揭开** = `impact + 80ms`：`scheduleForCurrentSend(reveal, 80)` 让助手占位（思考球）入场 | HomePage WT `:711-716` | 仍是 `waiting`（方块呼吸） | — |
| 普通 ≈533–633 ／ 首条 ≈717–1117 | 气泡停稳、核对落点后换成真实行（`onLand`） | `lift-driver.ts:215-247` | — | — |
| ≤1600 | 托起超时兜底（`LIFT_SCORE.timeoutMs`）；隐藏行最迟 2000ms 被揭开（`ENTRANCE_WATCHDOG_MS`） | `score.ts:63` | 不依赖这些兜底 | — |
| 首 token | 占位里的思考球换成文本（没有事件，只有数据变化） | 模板条件 `status==='streaming' && !content && !segments.length` | T4 | — |
| 结束 | `isStreaming → false` | `conclude()` | T5 | T5 ④（+160ms） |

另外两条路径：

- **首条消息**：输入框整组用首条弹簧的曲线向下停靠（`playComposerFlip(deltaY, { opening: true })`，约 1s，`useSendChoreography.ts:850-867`）；胶囊在输入框里，随祖先的 `transform` 一起走，不需要额外处理。普通发送只有多行草稿收起、位移超过 8px 时才有这段 FLIP。
- **带附件的发送**：不托起，走旧的克隆飞行 `playSend`（`FLIGHT_MS = 460`、`FLIGHT_IMPACT_MS = 324`，占位揭开 ≈404ms，`useSendChoreography.ts:160-164`）；胶囊的编排从 t=0 开始、与飞行无关，照常。
- **reduced motion**：`liftable` 为假，不托起、不飞行，消息原位出现；胶囊直接到终态（§2.5）。

### 2.5 reduced-motion（`prefers-reduced-motion: reduce`）

| 转换 | 降级 |
|---|---|
| 按压（所有控件） | 不缩放；只保留立即的悬停 / 按下底色 |
| T1 / T2 | 颜色瞬切，无缩放 |
| T3 / T5 / T6 / T7 | 宽度 32 ↔ 72 瞬变、皮色与内容瞬换；无离场、无开花；麦克风瞬时隐藏 / 出现（`inert` 同步切换） |
| T4 / T8 | 无轻跳、无呼吸；光环 `blocked` 时仍是 0.5 透明 |
| 光环 | **常亮不转**（与输入框「The light holds still but stays on」同一策略），透明度仍由 `--home-glow-on` 决定 |
| 胶囊文字 / 宽度 | 文字瞬换、宽度瞬变 |
| 麦克风电平 | 不画跳动的条，改静态实心麦克风 + 主色浅底（`dictation.md` §4.8） |

实现：CSS 里所有 `animation` 只写在 `@media (prefers-reduced-motion: no-preference)` 内（`TxChoiceCard` / `TxStatCard` 的「反向写法」，静止样式即终态）；WAAPI 调用前查 `prefersReducedMotion()`，为真则不调用。

### 2.6 胶囊形变的实现约束（老板要求：发送那一刻不能每帧重排撑动整行）

- **行里只有固定尺寸的占位**：`SendSlot` 与 `MicSlot` 都是 32×32、`flex: none`，任何状态下都不改变尺寸；模型胶囊、权限胶囊、`+` 的位置在整个 T3 / T5 里**一像素都不动**。
- **变的只有脱离文档流的按钮**：`button.SendIsland` 绝对定位、`right: 0`，宽度 32 ↔ 72 用 WAAPI 的 `width` 关键帧 + 编译好的 `linear()` 弹簧曲线（D3 / D4）。每帧只布局这一个 72×32 的盒子，不回流父行；圆角 16px 与焦点环（`outline` + `outline-offset: 2px`）天然跟随真实外形。
- **盖住麦克风靠层级，不靠挤占**：`ToolRight` 内 `SendSlot` 的 `z-index` 高于 `MicSlot`；流式期间麦克风同时 `inert`，点击不会穿到它。
- **不用的写法**：`transform: scaleX()` 拉宽圆会把 16px 圆角压成椭圆角；在流内改 `width` / `margin` 会推动左边的模型胶囊。
- **零布局的备选**（若实机在发送那一刻主线程吃紧再换）：按钮常驻 72px，用 `clip-path: inset(-4px -4px -4px 36px round 20px) → inset(-4px round 20px)` 揭开——负值给焦点环留出 4px；代价是空闲时要保证被裁掉的左侧不接收点击（Chromium 的 `clip-path` 会裁命中区域，需实测），以及快捷键徽标不能放在被裁的元素里。
- **验收**：T3 / T5 期间逐帧采样模型胶囊、`+`、权限胶囊的矩形，位移 ≤ 0.5px（§7）。

## 3. 其它控件的形变

- **权限胶囊**（切档、同步失败回滚都算）：照搬 `TxModeChip` 已实测的编排——图标 blur-replace（缩到 0.5 互换，240ms，领先文字 50ms）；文字用 `TxTextTransformer` 的 `fade`（旧的约 80ms 消失，新的 280ms 由糊变清，模糊 6px）；宽度用 WAAPI FLIP 300ms `--tx-ease-out-strong`；底色 / 墨色只在 `.is-morphing` 期间过渡 240ms。
- **模型胶囊**：模型名或推理强度后缀变化（加载完成、手动切换、档位被夹取）走同一套文字 + 宽度编排；模型图标 blur-replace；菜单打开时下拉箭头翻转 180°，走 tuffex `snappy`（400ms、1.4% 过冲）。菜单里新增「推理强度」分段控件，路由不支持时整行禁用并写原因（`reasoning-effort.md` §4.5）。
- **`+`**：只有按压；流式期间照常可用（D12）。
- **麦克风**（本任务接线，`dictation.md` §4）：点按切换；听写中底色 `--shell-primary-soft`，图标换成 4 根电平条（`transform: scaleY`，10Hz 帧之间 100ms 线性插值，不引起布局）；收尾中三点静止呼吸；流式期间让位（T3 ③ / T5 ④）。听写期间输入框只读、partial 写在光标处、final 固化，Esc 取消并还原。

## 4. 参数表（`composer-motion.ts`，改参数只改这里）

| 键 | 值 | 备注 |
|---|---|---|
| `press.scale` / `press.islandScale` / `press.capsuleScale` | 0.9 / 0.86 / 0.95 | 发送圆压得更深；72px 胶囊压浅 |
| `press.inMs` / `press.inEasing` | 90ms / `cubic-bezier(0.23, 1, 0.32, 1)` | 跟手 |
| `release` | 弹簧 `{ stiffness: 900, damping: 30 }` | 446ms，过冲 15%（从 0.86 回弹峰值约 1.02） |
| `morph` | 弹簧 `{ stiffness: 520, damping: 30 }` | 462ms，过冲 5.5%；胶囊宽度、开花、回位都用它 |
| `squash` | `scaleX 1.14 / scaleY 0.88` | 只用于圆态的程序化按压；长成胶囊时不再叠加挤压（宽度本身就是冲量） |
| `wake.fromScale` | 0.92 | T1 |
| `glyphOut` | 140ms、上移 8px、无模糊、`cubic-bezier(0.4, 0, 1, 1)` | 托起不模糊；时长 = `LIFT_SCORE.crossfadeMs` |
| `glyphIn` | 延迟 45ms、自下方 8px、`morph` | T5 |
| `capsule.width` | 72px（= 麦克风 32 + 间距 8 + 发送 32） | 与 §1.1 的 8px 间距绑定，改间距要一起改 |
| `capsule.growDelayMs` / `capsule.retractDelayMs` | 40ms / 45ms | 先让箭头离场、先让文字收起 |
| `stopBloomDelayMs` | 120ms | 快速失败不闪停止文字（T7） |
| `stopBloom` | `scale 0.6 → 1`（`morph`）、透明 180ms 强缓出、方块圆角 5 → 2.5 | T3 ⑥ |
| `micYield.outMs` / `micYield.scale` / `micYield.backDelayMs` | 120ms / 0.85 / 160ms | T3 ③、T5 ④ |
| `tone` | 180ms `--tx-ease-out-strong`（胶囊 240ms；岛的主色→墨色 200ms） | 仅 `.is-morphing` |
| `chip` | 文字延迟 50ms、淡入 280ms、模糊 6px、宽度 300ms | = `TxModeChip` |
| `firstTokenTick` | 1.06、240ms | T4 |
| `ring` | 2.4s/圈；等待态呼吸 1.4s（0.55↔1）；淡入淡出 = `--home-glow-on` 的 0.6s，从 t≈0 开始 | 托起没有分裂期的压暗 |
| `mic.levelBars` / `mic.levelInterpMs` / `mic.captureWatchdogMs` | 4 根 / 100ms / 2000ms | `dictation.md` §4.4、§4.6 |

单拍最长约 0.6s（胶囊宽度 462ms），远低于 HIG 对 Live Activity 动画「最多 2 秒」的上限。弹簧编译成 `linear()` 后交给 WAAPI（D4）。

## 5. 组件拆分（全部新文件，`HomePage.vue` 只接线）

目录 `apps/core-app/src/renderer/src/views/base/home/composer/`：

| 文件 | 职责 | 接口 |
|---|---|---|
| `ComposerToolbar.vue` | 整行：两簇布局、同心负外边距、`home-composer-tools` 容器、`SendSlot` / `MicSlot` 两个固定槽；内含隐藏的 `<input type=file>` | props `permissionMode`（v-model）、`model: { label, icon, effort? }`、`sendState`、`micState`、`micLevels`；emits `files(File[])`、`send`、`stop`、`mic`、`reset-approvals`；expose `launch()` |
| `ComposerControl.vue` | 圆键原语（无底材质）：尺寸、焦点、禁用、按压 | props `label`、`disabled`；默认插槽放图标 |
| `ComposerChip.vue` | 灰底胶囊原语：色调、图标 blur-replace、`TxTextTransformer` 文字、宽度 FLIP、`.is-morphing` | props `label`、`tone: 'muted'\|'info'\|'danger'`、`disabled`；插槽 `icon`、`trailing` |
| `ComposerSendIsland.vue` | §2 的状态机渲染与编排：圆 ↔ 72px 胶囊、麦克风让位的信号、快捷键徽标 | props `state: SendState`、`sendLabel`、`stopLabel`；emits `send`、`stop`、`yield(boolean)`；expose `launch()` |
| `ComposerModelPill.vue` | `ComposerChip` + 模型图标 + 推理强度后缀 + 下拉箭头翻转 | props `label`、`icon`、`effort?`、`open` |
| `ComposerMic.vue` | 麦克风外观与无障碍：`idle / starting / listening / finishing`、电平条、让位 | props `state`、`levels`、`yielded`；emits `toggle`（`dictation.md` §4.10） |
| `useComposerDictation.ts` | 听写会话逻辑（SDK 可注入）：generation、句柄未到先停、看门狗、草稿快照与还原、错误回调 | `dictation.md` §4.10 |
| `dictation-text.ts` / `voice-level.ts` | 纯函数：光标处拼接与转写合并；电平归一 | 同上 |
| `HomePermissionMenu.vue`（已有，保留） | 菜单逻辑不动，只把胶囊换成 `ComposerChip` | 不变 |
| `HomeModelMenu.vue`（已有） | 加「推理强度」分段控件与禁用原因 | 见 `reasoning-effort.md` §4.5 |
| `useComposerPress.ts` | WAAPI 按下 / 放开 / 程序化 `pulse()`，reduced-motion 下为空操作 | `usePress(el, { scale })` |
| `send-state.ts` | `deriveSendState()`、`isAwaitingFirstToken(message)`（与思考球共用） | 纯函数 |
| `composer-motion.ts` | §4 参数表与编译好的曲线 | 常量 |
| `*.test.ts` | `send-state` 真值表（含 `dictating`）；T7「<120ms 不出现停止文字」；T3 / T5 期间 `SendSlot` 与 `MicSlot` 的尺寸不变；reduced-motion 不调用 `animate`；样式契约（除 `.is-morphing` 外无颜色过渡、所有 `animation` 都在 `no-preference` 块里）；听写与推理强度各自的测试见两份调研 | vitest |

推理强度的非视图部分（utils 类型与常量、主进程决策点与各提供方映射、审计白名单）在 `reasoning-effort.md` §4.1–§4.6，不在本目录。

`HomePage.vue` 里剩下的全部改动：

```vue
<ComposerToolbar
  ref="toolbarRef"
  v-model:permission-mode="agentToolsMode"
  :model="modelPill"
  :send-state="sendState"
  :mic-state="dictation.state.value"
  :mic-levels="dictation.levels.value"
  @files="addFiles"
  @send="submit"
  @stop="conversation.stop()"
  @mic="dictation.toggle()"
  @reset-approvals="resetRememberedApprovals"
/>
```

```ts
const dictation = useComposerDictation({ draft, input: () => inputRef.value, onTextChange: autoGrow, onNotice })
const canSend = computed(
  () => draft.value.trim().length > 0 && !isStreaming.value && !dictation.active.value
)
const sendState = computed(() =>
  deriveSendState({
    hasText: draft.value.trim().length > 0,
    streaming: isStreaming.value,
    awaitingFirstToken: isAwaitingFirstToken(messages.value.at(-1)),
    blocked: Boolean(agentTools.pending.value),
    dictating: dictation.active.value
  })
)
watch(isStreaming, (on) => { if (on) dictation.stop() })
// submit()：canSend 守卫之后第一行
toolbarRef.value?.launch()
// modelPill 增加 effort（reasoning-effort.md §4.5）；useHomeConversation 增加 reasoningEffort getter（§4.3）
```

并删除 `.HomePage-ToolRow` 到 `.HomePage-SendBtn` 的旧样式（HEAD bb76c8d0a `:2130-2248`，工作区 13:50 时在 `:2331-` 一带）与 `fileInputRef` / `onFilePick`，以及写死的 `t('home.effortHigh')`。

## 6. 决策点

| # | 状态 | 采用 | 备选 / 说明 |
|---|---|---|---|
| D1 停止形态 | **已拍板** | 向左长成约 72px 的墨色「■ 停止」胶囊，盖住麦克风位置（流式期间麦克风让位）；绝对定位的按钮改宽度，行里只有固定槽，邻居不动（§2.6） | 原推荐的 32px 圆小岛不再采用 |
| D2 元素 | 按推荐 | 发送 / 停止是同一个常驻按钮（`data-state`） | 保留两个按钮 + `<Transition mode="out-in">`：做不出连续形变，焦点会丢 |
| D3 动效引擎 | 按推荐 | WAAPI + 弹簧编译的 `linear()`（发送时不和托起的逐帧驱动器抢主线程） | 逐帧 `springSteps`：打断时保留速度，但占主线程 |
| D4 弹簧曲线来源 | 按推荐 | tuffex `liquid/index.ts` 导出 `resolveTransition`（一行导出，文档补一句） | core-app 固化 `linear()` 字符串（生成脚本 `/tmp/composer-controls-probe/linear.mjs`），tuffex 不动 |
| D5 图标替换 | 按推荐 | 分层 blur-replace（iconify 箭头 + CSS 方块与文字） | `TxIconMorph` 路径形变（只画描边，停止方块要改成描边） |
| D6 尺寸 | 按推荐 | 32px + 外缘 8px 同心 | 保持 30px 与现有 16 / 12 内边距，只统一材质 |
| D7 胶囊实现 | 按推荐 | core-app `ComposerChip`：照搬 `TxModeChip` 时序，复用 `TxTextTransformer` | 给 `TxModeChip` 加 `size` / `shape` 并在 `.HomePage` 桥接 `--tx-color-*-light-9` |
| D8 组件归属 | 按推荐 | core-app `views/base/home/composer/` | 做成 tuffex 组件（zh/en 文档、demo、注册链、体积门禁） |
| D9 渐变光环 | 按推荐 | 自绘，复用 Home 的色标与 `--home-glow-on` 门控；环带形状跟随胶囊 | `TxBorderBeam size="sm"`：现成，但调色板与输入框的光不同色 |
| D10 麦克风 | **已拍板** | 本任务接听写：`asrStream({ delivery: 'none', emitLevel: true, cleanup: true, deliveryTiming: 'live' })`，点按切换，文字进草稿（`dictation.md`） | 子决策 D10-a…f 见 `dictation.md` §5 |
| D11 「高」 | **已拍板** | 真实推理强度：自动 / 低 / 中 / 高 / 极高，全局存储，随请求传给模型，各提供方按能力映射，不支持时菜单禁用并说明、胶囊不显示后缀（`reasoning-effort.md`） | 子决策 D11-a…f 见 `reasoning-effort.md` §5 |
| D12 流式期间 `+` | **已放开** | 由 `09-26-composer-paste-anywhere` 放开 `addFiles` 守卫，流式期间可预挂附件 | — |
| D13 发送键悬停 | 按推荐 | 去掉放大 1.06，只立即加深 | 保留悬停放大 |
| D14 首 token 轻跳 | 按推荐 | 做（1.06、240ms） | 不做，只靠光环节奏区分 |

## 7. 落地顺序与验证

1. 等 `09-25-send-split-fusion`（现行实现为托起，工作区未提交）与 `09-25-home-assistant-push` 第 6 步落地（三者都改 `HomePage.vue` 的 `submit()` 与模板）。
2. （D4 选推荐时）tuffex 导出 `resolveTransition`，构建 dist（带 `/tmp/tuffex-build.lock`）。
3. `send-state.ts`、`composer-motion.ts`、`useComposerPress.ts` + 单测。
4. `ComposerControl` / `ComposerChip` / `ComposerModelPill` / `ComposerSendIsland`（含胶囊） / `ComposerMic` / `ComposerToolbar`；`HomePermissionMenu` 换胶囊。
5. 听写：`dictation-text.ts`、`voice-level.ts`、`useComposerDictation.ts` + 单测（`dictation.md` §4.11）。
6. 推理强度：utils 类型与设置默认值 → 主进程决策点与提供方映射 → 渲染层菜单、胶囊后缀、回合信息（`reasoning-effort.md` §4.8）。
7. `HomePage.vue` 接线、删旧样式与写死的「高」。
8. 包内 eslint、prettier、`vue-tsc -p tsconfig.web.json --composite false`、`tsconfig.node.json` 类型检查、vitest。
9. 真实窗口（按父任务约定复用带调试端口的 dev；本次调研没有做）：亮 / 暗各录 T1–T8（普通发送与首条发送各一次）；T3 / T5 期间逐帧采样模型胶囊、权限胶囊、`+` 的矩形，位移 ≤ 0.5px；胶囊宽度峰值与回落；发送 → 停止 → 发送全程焦点不丢；听写一轮（开始、partial、结束、光标位置）与拒绝权限的提示；切一次推理强度看回合信息；对计算样式复测 §1.2 的对比度；开「减少动态效果」再走一遍。

## Caveats / Not Found

- §2.4 的时刻是用托起的同一套弹簧与判定离线算出的（`lift-timeline.mjs`），不是录帧；`send-lift/score.ts` 在 12:59 仍被修改，`LIFT_SCORE` 的弹簧或阈值再变就要重跑脚本。`onClear` 取决于草稿行数与落点距离，表里给的是单行草稿、落点 120–600px 的范围。
- 胶囊宽度用 `width` 动画是「每帧只布局一个脱离文档流的小盒子」，没有在真实窗口里测发送那一刻的主线程占用；若与托起驱动器争帧，换 §2.6 的 `clip-path` 备选。
- 设计稿（`.pen`）没有读到；§2.2 的配色（墨色岛、主色高光）与胶囊文字排版是方案提议，需要老板看过再定。
- 等待态同时会有三处动态：消息行的思考球、输入框的流式活光、停止胶囊的光环。是否过满要实机看；最省的收敛是去掉光环与方块的呼吸，只留旋转。
- 听写与推理强度各自的未验证项见两份调研的 Caveats（pi CLI 的 `--thinking` 未在本机实测、Anthropic 自适应 effort 经 LangChain 的透传未实发、听写与 Fn HUD 可能同时采集等）。
