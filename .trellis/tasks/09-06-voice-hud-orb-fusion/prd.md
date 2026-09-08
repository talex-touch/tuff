# 语音 HUD 融合 orb 的形态设计

画板：`DQis6`（深色三态）/ `SJQ8R`（浅色三态）/ `l7Xnp`（V3 完整六态矩阵）/ `VjHpd`（SPEC）

## Goal

语音 dock 改成一条紧凑的无文案动作胶囊：两端 ✕ / ✓ 圆钮，中间一格按相位换视觉 —— **说话时是语音状态（波形），等结果时是 orb thinking**，出提示时整条丝滑展开。顺带修好 ✓ ——它现在是丢弃，不是提交。

## 两张参考

图 1（宽条）中间大片空白不承载信息；图 2（Wispr Flow 式紧凑胶囊）`✕ / 波形 / ✓` 一个字都没有，动作直接长在条上。骨架和尺寸都取图 2。

两张缺的是同一件事：**收音结束之后没有任何表达**，波形在那一刻就变成了不接数据的假动画。补上的正是这一段 —— 那一格换成 orb。

## Requirements

### R1 相位（R4.1 已扩到六个）

悬浮球是助手**阿洛**的在场（`module.ts:96` `DEFAULT_WAKE_WORDS = ['阿洛','aler']`），不是语音按钮 —— 「待命」「收拢」是球的事。这条轨道只有三态：

| # | 相位 | 中间那一格 | ✕ | ✓ |
| --- | --- | --- | --- | --- |
| ① | listening（说话中） | **语音状态**：24 根 2px 条形波形，高度跟真实电平 | 可用 | 可用 |
| ② | thinking（等结果） | **orb thinking**：`TxThinkingOrb`，绑本次会话 `:key` 重掷形态 | 置灰 | 置灰 |
| ③ | error / notice | 单行提示文案，整条按内容展开 | 可用（立即关闭） | 置灰 |

说话和在想必须长得不一样 —— 这是这次融合的要点。listening 那一格**不出 orb**。

② 置灰不移除：移除会让内容居中、整条重排，位置一跳用户就得重新找。

### R2 提示自动丝滑展开

- 胶囊常态宽 **200**。出现提示时按内容测量宽度（上限 **340**），**260ms** 过渡展开；提示退场后收回 200。
- **窗口固定 360×64 且透明**，展开只是胶囊的 CSS 宽度动画 —— 不 resize 窗口。窗口级动画在 Win/Linux 上没有系统平滑，做成 CSS 才三平台一致。
- 透明画布靠 `pointer-events` 分层：根节点 `none`，只有胶囊 `auto`（`VoiceDock.vue` 现有做法照搬）。
- 宽度用 JS 量出来写成内联 px，再交给 CSS 过渡 —— 不依赖 `interpolate-size` / `calc-size()` 这类新特性。
- 展开只改宽度：高度不变、✕ 始终贴左、✓ 始终贴右。
- `prefers-reduced-motion` 下直接跳到目标宽度，不做过渡。

### R3 尺寸

- 窗口 **360×64**（透明画布）—— `VOICE_DOCK_WIDTH` / `VOICE_DOCK_HEIGHT` 从 300×60 改。
- 胶囊常态 **200×44**，`radius 22`，`padding 5`，`gap 8`；提示态按内容展开，上限 340。
- 圆钮 **34×34**；槽位 = 200 − 10 − 68 − 16 = **106**；orb **28** 居中；波形 24 根 × 2px + 23 × 2px gap = 94。
- 球**不动**：`FLOATING_BALL_DEFAULT_SIZE` 保持 56，图标也不改。

球与 dock 是同一个窗口在两组 bounds 之间变形，min/max 必须同时容下两者。现在写死的 `minWidth/minHeight = 56`、`maxHeight = 60` 与球的 `clamp(48, 72)` 本就矛盾，一并改成 `min 48 / maxWidth 360 / maxHeight 72`。

### R4 两条协议增量

**① `level` 事件（喂波形）。** `VoiceAsrStreamEvent`（`voice.ts:125`）只有 `partial | final | end`，不带电平，渲染进程手里没有可画的数据。而主进程的采集 pump（`voice-service.ts:579`）每 100ms 就已经拿到 PCM chunk 再写给 provider —— 在那里算 RMS 即可。

```ts
| { type: "level"; rms: number }      // 0..1，10Hz
```

由 `VoiceAsrStreamPayload.emitLevel?: boolean` 开关，默认关 —— 全局听写等既有调用方零影响。渲染侧维护 24 格滚动缓冲，每来一个 rms 推进一格，等于一个 2.4 秒窗口的真表。

**② `stop` 控制消息（修 ✓）。** ✓ 现在是丢弃，不是提交，逐跳查证：

```
finishVoiceInput() → controller.cancel()
  → sdk/stream/client-runtime.ts:262  发 <event>:stream:cancel
  → sdk/stream/server-runtime.ts:93   state.abortController.abort()
  → voice-service.ts streamViaProvider 的 throwIfCancelled(signal) 抛出
```

`final` 不会到达，`polish` 与 `deliverText` 都不会跑。Command 的 stop 手势（`35b2ae35c`）走同一条路。对照组：全局听写正常，因为 `global-dictation.ts:98` 调的是 `voiceService.stopSession(id, { cleanup: true })` —— **主进程的 finalize 原语一直都在（`voice-service.ts:251`），只是 stream SDK 从没暴露给渲染进程。**

补一条 stream 级 `stop`（停采集、照常收 `final` / `end`；与 `cancel` 互斥），一次修好两件：✓ 真提交、thinking 变成停在 `end` 的真状态。

### R4.1 六个相位（2026-09-06 追加）

原来的三态不够用：取消没有键盘入口也没有回执，失败全是一种红，而 thinking 那格把一个按不动的 ✓ 留在用户刚点过的位置上。改成六个：

| 相位 | 中间 | 右槽 | 宽度 | 语气 |
| --- | --- | --- | --- | --- |
| listening | 电平波形 | ✓ 可按 | 200 | — |
| thinking | shimmer 文案 | **orb**（不再是钮） | 按文案测 | — |
| cancelled | 「已取消」 | ✓ 置灰 | 按文案测 | muted / 700ms |
| quota | 「AI 额度已用完」 | ✓ 置灰 | 按文案测 | warning / 1600ms |
| busy | 「服务繁忙，请稍后重试」 | ✓ 置灰 | 按文案测 | warning / 1600ms |
| error | 具体错误 | ✓ 置灰 | 按文案测 | danger / 900ms |

- **Esc = ✕**，同一条路径。cancel 在 `listening` 与 `transcribing` 期间都可用 —— 主进程在 polish 前和 deliver 前都查 abort signal，所以文本落地之前 Esc 必须一直有效。
- **额度与繁忙是 warning，不是 danger。** 它们不是坏了：一个是账户状态、一个是天气，都会自己好或者去设置里解决。停留也更长（1600ms），因为要读。未归类的失败留在 danger —— 不认识的失败才是值得打断的那种。
- **取消停留最短（700ms）**：用户刚做完这个动作，不需要被告知两遍。
- 语气只染描边和文字，不染底 —— 底一染，文字对比度就掉。
- **只有 thinking 的文案 shimmer。** 提示是结果，结果应该站住不动。
- 分类依据是错误码与消息（`QUOTA|CREDIT|INSUFFICIENT_BALANCE` / `RATE_LIMIT|OVERLOAD|HIGH_DEMAND|429|503|529`），不是新造的枚举。

### R5 orb 接入

```vue
<TxThinkingOrb :key="sessionId" :size="64" :display-size="28" theme="auto" :label="orbLabel" />
```

- 只在 thinking 那一格出现；不传 `state`（默认 `random`），靠 `:key` 换会话时重掷 —— 改 `state` 想换球是没用的。
- `label` 必须显式传（默认是英文）：`assistant.voicePanel.voiceTranscribingShort`（已存在）。
- `theme="auto"` 跟随 shell 主题，**不写反色分支**。
- `prefers-reduced-motion`：orb 自己画静止帧；波形要我们自己停（不跑动画，画最后一次电平）。

### R6 文案

只有 error / notice 相位出文案（11px 单行）。新增一个 i18n 键 `assistant.voicePanel.cancelSession`（`取消本次` / `Cancel this session`）作 ✕ 的可访问名；✓ 复用已有的 `stopAndTranscribe`。

## 基线（已实测，2026-09-06）

```
apps/core-app$ ./node_modules/.bin/vitest run \
    src/renderer/src/views/assistant src/main/modules/assistant
Test Files  1 failed | 3 passed (4)       Tests  1 failed | 49 passed (50)
```

唯一的红先于本任务存在：`module.screenshot-translate.test.ts:626` 仍断言旧面板的 `520×300` / `{x:140,y:176}`（`cb4e26687` 之后过期）。本任务要改窗口常量，这条无论如何得跟着更新。

## Acceptance Criteria

- [ ] 六个相位在 360×64 窗口内不溢出；胶囊 200×44、圆钮 34、槽位 106、orb 28、波形 24 根与画板一致。
- [ ] listening 那一格**只有波形没有 orb**；thinking 那一格**只有 orb 没有波形**。
- [ ] 波形高度由 `level` 事件驱动：没有 `level` 到达时不跑动画（负控制：断掉 level 后波形静止，而不是继续摆）。
- [ ] `emitLevel` 未开启时流的事件序列与现状逐字相同（全局听写不受影响）。
- [ ] **按 ✓ 之后文本真的被投递**（`stop` 路径跑到 `deliverText`），渲染侧在 `end` 到达前一直停在 thinking。
- [ ] 按 ✕ 仍然是 abort：不投递、不等 `final`。
- [ ] 提示出现时胶囊从 200 展开到测量宽度（≤340），260ms；退场后收回 200。高度与两个圆钮的位置全程不变。
- [ ] 展开期间窗口 bounds 不变（不 resize）。
- [ ] `prefers-reduced-motion` 下无宽度过渡。
- [ ] 除提示相位外没有任何状态渲染文案节点；`VoicePanel.test.ts:123`（不出现「阿洛 / aler」）仍通过。
- [ ] 连续两次会话 orb 的 `:key` 不同（负控制：只改 `state` 时不变）。
- [ ] 浅色与深色下 orb 与波形均可见，无写死反色分支。
- [ ] 球在 48 / 56 / 72 三档下窗口 bounds 都不被 min/max 夹变形。
- [ ] Esc 与 ✕ 走同一条路径；`transcribing` 期间 Esc 仍然有效。
- [ ] 额度 / 繁忙落在 warning 档，未归类失败落在 danger 档，取消落在 muted 档；三档停留时长各不相同。
- [ ] `transcribing` 时右槽是 orb 而**不是**置灰的 ✓（两者不同时存在）。
- [ ] 只有 thinking 的文案 shimmer，提示文案不 shimmer；`prefers-reduced-motion` 下 shimmer 关闭。
- [ ] vitest 与 `vue-tsc --noEmit -p tsconfig.web.json --composite false` 全绿，测试数只增不减。

## 明确不做

- **不动阿洛的球**：不改 `FLOATING_BALL_DEFAULT_SIZE`、不改它的图标。`FloatingBall.vue` 现在挂 `i-carbon-microphone-filled`（早期真机探针里球上是「阿」字），把助手画成了麦克风钮 —— 这一笔单独记，归阿洛的形象处理。
- 不清理 `assistant.voicePanel` 下已不再被 `VoicePanel` 使用的旧文案键（可能被别处引用）。
- 不动语音会话的其余时序、provider 路由、投递策略。
