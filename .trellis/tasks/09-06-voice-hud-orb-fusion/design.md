# 技术设计 · 语音 HUD 融合 orb

对应 `prd.md`。三层：**协议层**补 `stop` + `level`，**主进程**接线，**渲染层**换视觉。

## 1. 协议层

### 1.1 `stop` 控制消息

`cancel` 是 abort（什么都不收）；`stop` 是「停采集、照常收尾」。两者互斥，`stop` 之后 `final` / `end` 仍会到达。

| 文件 | 改动 |
| --- | --- |
| `transport/sdk/constants.ts` | `STREAM_SUFFIXES` 加 `STOP: ':stream:stop'` |
| `transport/sdk/stream/protocol.ts:83` | `getStreamEventNames` 加 `stop` |
| `transport/types.ts:169` | `StreamController` 加 `stop?: () => void`；`StreamContext` 加 `readonly stopSignal: AbortSignal` |
| `transport/sdk/stream/client-runtime.ts:256` | `stop()` 发 `streamEvents.stop`，**不** `cleanup()`（还要收 `end`），重复调用幂等 |
| `transport/sdk/stream/server-runtime.ts` | `StreamState` 加 `stopController`；`handleStop({streamId, ownerKey})`；`buildContext` 透传 `stopSignal` |
| `transport/sdk/main-transport.ts:1128` | 在 cancel 旁边注册 stop 频道 |

`stop?` 是可选的：不实现它的传输端、不读 `stopSignal` 的 handler 都不受影响。

### 1.2 `level` 事件

```ts
// transport/sdk/domains/voice.ts:89
export interface VoiceAsrStreamPayload {
  // …
  /** 让流额外推送 10Hz 的输入电平，仅供可视化。默认 false。 */
  emitLevel?: boolean
}

// :125
export type VoiceAsrStreamEvent =
  | { type: "partial"; text: string }
  | { type: "level"; rms: number }        // 0..1
  | { type: "final"; /* … */ }
  | { type: "end" }
```

默认关 —— 全局听写等既有调用方的事件序列逐字不变。这是本任务能安全加协议的前提。

## 2. 主进程

### 2.1 `stop` 接线

```ts
// voice-module.ts:114
voiceService.streamDictation(payload, streamContext.signal, streamContext.stopSignal)

// voice-service.ts streamViaProvider 的 pump（约 576 行）
const active = stopSignal?.aborted
  ? false
  : (pollCapture ? pollCapture(session.nativeSessionId).active : Date.now() < deadline)
```

跳出循环后走的是已有路径：`stopCapture` → `connection.end()` → `final` → `polish` → `deliverText` → `end`。**下游一行不改。**

`streamViaWebSocket` / `streamViaChunkedBatch` 接同一个参数；接不上的分支退化成等 VAD 静音，不能因为多了个参数而报错。

### 2.2 `level` 产出 —— `streamViaProvider` 里唯一的结构改动

pump 每 100ms 已经拿到 chunk：

```ts
const chunk = drainCapture(session.nativeSessionId).pcm     // :579
if (chunk.length > 0) await connection!.writePcm(chunk)
```

在这里对 16-bit LE 单声道求 RMS 并归一化到 0..1。问题是 pump 是一个独立的 async IIFE，**不能 `yield`**；而生成器正阻塞在 `for await (const event of connection.events)`。

所以把两路合并成一个队列，生成器只消费队列：

```ts
type Merged = { kind: 'provider'; event: ProviderStreamEvent } | { kind: 'level'; rms: number }

const queue: Merged[] = []
let wake: (() => void) | null = null
const push = (m: Merged): void => { queue.push(m); wake?.(); wake = null }
// pump:                          if (payload.emitLevel) push({ kind: 'level', rms })
// 另起一个 forwarder:            for await (const e of connection.events) push({ kind: 'provider', event: e })
// 生成器：出队；队空则 await new Promise<void>(r => { wake = r })
```

队列有界（丢最旧的 level，provider 事件永不丢）—— 渲染端跟不上时宁可掉帧，也不能把 `final` 排在几百个 level 后面。

`emitLevel` 为 false 时 pump 不 push level，队列里只有 provider 事件，行为与现状等价。

### 2.3 常量

```ts
const VOICE_DOCK_WIDTH = 360            // was 300，透明画布，胶囊在里面动
const VOICE_DOCK_HEIGHT = 64            // was 60
// FLOATING_BALL_DEFAULT_SIZE 保持 56 —— 球是阿洛，不跟着语音改
```

球与 dock 是同一个窗口在两组 bounds 之间变形，min/max 必须同时容下两者：

```ts
minWidth: 48, minHeight: 48,   // 球 clamp(48,72) 下限，was 56/56
maxWidth: VOICE_DOCK_WIDTH,    // 360
maxHeight: 72                  // 球 clamp 上限，was VOICE_DOCK_HEIGHT
```

原来的 `min=56` / `maxHeight=60` 与球的 48–72 本就矛盾，这三行必须一起改。

## 4. 失败重试的音频留存契约（2026-09-06 决定：真重试）

「重试」定为**重传同一段音频**，不是重新录。这需要留住 PCM，所以边界必须先写死 —— 这是隐私面，不是实现细节。

### 留什么、留多久

| | |
| --- | --- |
| 存放 | **仅主进程内存**。不落盘、不进数据库、不进日志、不跨进程 |
| 内容 | 本次会话已采集的 16kHz 单声道 16-bit PCM |
| 上限 | 由既有 `maxDurationMs`（默认 15s）天然封顶 ≈ 480KB；另设 `MAX_RETRY_BUFFER_BYTES` 硬上限，超了就停止累积并放弃重试能力（宁可没有重试，也不无限吃内存） |
| 槽位 | **全局一个**。新会话开始即覆盖旧的 |
| 成功后 | **立即清** —— 唯一即清的路径 |
| 取消后 | 保留 `RECOVERY_GRACE_MS`，供「撤销」真恢复（2026-09-06 修订：原为即清） |
| 失败后 | 保留 `RECOVERY_GRACE_MS`，供「重试」 |
| 服务 dispose | 清 |
| 插件可见性 | **不可见**。`narrowVoiceStreamForPlugins` 已经把插件面收在四种事件上，重试不进插件 SDK |

### 为什么是这些数

- **成功是唯一即清的路径**：留存的唯一理由是「这段话还可能被再用一次」。文本已经投递到前台应用，这个理由就消失了，继续留就是无理由留存。
- **取消也留（2026-09-06 修订）**：原设计按「取消 = 明确的我不要了」即清。但既然要给「撤销」，撤销就必须能真恢复那段话，否则那个按钮只能是「重新录」——名字会骗人。所以取消与失败同档。
- **一个数、两条路**：取消和失败用同一个 `RECOVERY_GRACE_MS`。两条路的用户诉求不同，但「还能不能捞回来」这件事对用户是一个概念，分成两个时长只会让文案没法写。

### 这个洞怎么闭合的（2026-09-06 定：出路 2）

胶囊上的「撤销 / 重试」只停 5s，之后收回球态。**5s 之后音频还在，但用户已经够不着它了** —— 那段时间的留存没有对应的可达入口，就是无理由留存。

三条出路，需要定：

1. 把宽限期压到与 UI 停留一致（5–8s）—— 最干净，但「先去看一眼网络再回来点」就来不及。
2. 给收回后的球一个入口：宽限期内再次唤起 dock，先显示「恢复上次」。**闭合这个洞的最小改动**。
3. 等 #1880 的历史面落地，由历史列表提供入口 —— 那时 60s 才有意义。

**选定出路 2。** `voiceApiEvents.recoveryStatus` 让 dock 在重新唤起时先问一句「还有没有能恢复的」，有就先显示「恢复上次」。窗口保持 **30s**：现在它每一秒都有可达入口，不再是无理由留存。

返回的是剩余毫秒而不是布尔 —— **一个点下去就过期的动作比没有动作更糟**，UI 要能显示倒计时。同时返回 `kind`（`cancelled` / `failed`），因为「恢复刚才取消的」和「重试失败的那次」对用户是两句话。

### 接口形状

不走 token 传递 —— 错误经 `context.error()` 投递，`projectStreamError` 只保留 `message` 与 `code`，塞不下 token，硬塞就得改错误通道。改用「重试最近一次失败」：

```ts
export interface VoiceRetryPayload { language?: string; delivery?: VoiceDeliveryMode }
export interface VoiceRetryResult {
  text: string
  language?: string
  delivery?: VoiceDeliveryResult
  /** 缓冲已过期或已被清 —— UI 必须据此说实话，不能假装在重试 */
  expired?: boolean
}
voiceApiEvents.retryLastFailure
```

`expired: true` 是这个设计的诚实出口：宽限窗过了就明说「录音已过期，请重新说一次」，而不是静默失败或假装重试。

### 重试走的路

缓冲 PCM 套 44 字节 WAV 头 → 复用已有的 `transcribe()` → `polish()` → `deliverText()`。**不新开转写实现**，与一次性听写同一条路。


## 5. 渲染层

| 文件 | 改动 |
| --- | --- |
| `views/assistant/VoicePanel.vue` | 重写模板与样式；`finishVoiceInput` 改走 `stop`；加 `sessionSeq`、`levels`、宽度测量 |
| `views/assistant/VoiceDock.vue` | 删 `processing` 相位与 spinner |
| `views/assistant/FloatingBall.vue` | **不动**（球是阿洛） |
| `main/modules/assistant/module.ts` | §2.3 常量 |
| `modules/lang/{zh-CN,en-US}.json` | 加 `cancelSession` |

### 3.1 相位

```ts
const sessionSeq = ref(0)                  // startVoiceSession 每次 +1，作 orb 的 :key
const transcribing = ref(false)
const levels = ref<number[]>(Array(24).fill(0))   // 滚动缓冲，10Hz 推进一格

const hasNotice  = computed(() => !!errorMessage.value)
const canCancel  = computed(() => listening.value || hasNotice.value)
const canConfirm = computed(() => listening.value && !hasNotice.value)
```

三个相位互斥地占据槽位：`hasNotice` → 文案；`listening` → 波形；否则 → orb。

```ts
function finishVoiceInput(): void {
  if (finished || !listening.value) return
  keepListening = false
  listening.value = false
  transcribing.value = true
  voiceStreamController?.stop?.()        // 不清 controller —— 还要收 final / end
}
```

`emitFinished()` 只由 `end` / `onEnd` / 错误分支触发；**thinking 的时长 = 真实转写时长，没有计时器**。✕ 仍走 `cancelVoiceSession()`（abort + 立即 finish）。

`asrStream` 的 payload 加 `emitLevel: true`；`handleVoiceSessionEvent` 加 `level` 分支：`levels.value = [...levels.value.slice(1), event.rms]`。

`VoiceDock` 删掉 `processing` / `processingTimer` / `clearProcessingTimer` / `showFloatingBallAfterProcessing` / `.voice-dock-processing` / `@keyframes voice-dock-processing-spin`；两个 handler 只置 `expanded = false`。

### 3.2 DOM

```html
<div class="voice-dock-root">                       <!-- 360×64 透明画布，pointer-events:none -->
  <div ref="pill" class="voice-dock" :class="{ 'voice-dock--notice': hasNotice }"
       :style="{ width: pillWidth + 'px' }"
       role="status" aria-live="polite" :aria-busy="voiceActive">
    <button class="voice-dock__btn voice-dock__btn--cancel" type="button"
            data-testid="voice-cancel" :disabled="!canCancel"
            :aria-label="t('assistant.voicePanel.cancelSession')" @click="handleCancel">
      <span class="i-carbon-close" aria-hidden="true" />
    </button>

    <div class="voice-dock__slot">
      <p v-if="hasNotice" ref="notice" class="voice-dock__notice" data-testid="voice-notice">{{ errorMessage }}</p>
      <div v-else-if="listening" class="voice-dock__wave" data-testid="voice-wave" aria-hidden="true">
        <span v-for="(v, i) in levels" :key="i" :style="{ height: barHeight(v) + 'px' }" />
      </div>
      <TxThinkingOrb v-else :key="sessionSeq" :size="64" :display-size="28"
                     theme="auto" :label="t('assistant.voicePanel.voiceTranscribingShort')"
                     data-testid="voice-orb" />
    </div>

    <button class="voice-dock__btn voice-dock__btn--confirm" type="button"
            data-testid="voice-confirm" :disabled="!canConfirm"
            :aria-label="t('assistant.voicePanel.stopAndTranscribe')" @click="handleConfirm">
      <span class="i-carbon-checkmark" aria-hidden="true" />
    </button>
  </div>
</div>
```

`:disabled` 而不是 `v-if` —— DOM 不重排，位置不跳。原生 `disabled` 已带 `aria-disabled` 语义。

`barHeight(v)`：`3 + Math.round(v * 25)`，值域 3–28，落在 34 高的槽位里。

### 3.3 宽度展开

```ts
const PILL_BASE_WIDTH = 200
const PILL_MAX_WIDTH = 340
const pillWidth = ref(PILL_BASE_WIDTH)

watch([hasNotice, errorMessage], async () => {
  if (!hasNotice.value) { pillWidth.value = PILL_BASE_WIDTH; return }
  await nextTick()
  const text = noticeRef.value?.scrollWidth ?? 0
  // 10(padding) + 68(两钮) + 16(gap) = 94 的固定开销
  pillWidth.value = Math.min(PILL_MAX_WIDTH, Math.max(PILL_BASE_WIDTH, text + 94))
})
```

量出来的 px 写成内联样式，过渡交给 CSS —— 不依赖 `interpolate-size` / `calc-size()`。窗口 bounds 全程不动。

### 3.4 样式

```scss
.voice-dock-root {                  // 360×64 透明画布
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}

.voice-dock {
  pointer-events: auto;
  display: flex; align-items: center;
  height: 44px; box-sizing: border-box;
  padding: 5px; gap: 8px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-full);
  background: var(--shell-surface);
  box-shadow: 0 5px 12px var(--shell-shadow);
  transition: width 260ms cubic-bezier(0.22, 1, 0.36, 1), border-color 160ms ease-out;
}
.voice-dock--notice { border-color: var(--shell-danger-border); }

.voice-dock__btn {
  flex: 0 0 auto;
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; font-size: 15px;
  border: 0; border-radius: var(--shell-radius-full); cursor: pointer;
  transition: opacity 160ms ease-out, background 160ms ease-out;
}
.voice-dock__btn:disabled { cursor: default; opacity: 0.45; }
.voice-dock__btn--cancel  { background: var(--shell-surface-2); color: var(--shell-text-secondary); }
.voice-dock__btn--confirm { background: var(--shell-primary);   color: var(--shell-on-primary); font-size: 17px; }

.voice-dock__slot {
  flex: 1; min-width: 0; height: 34px;
  display: flex; align-items: center; justify-content: center;
}

.voice-dock__wave { display: flex; align-items: center; gap: 2px; }
.voice-dock__wave span {
  width: 2px; border-radius: 1px;
  background: var(--shell-primary);
  transition: height 100ms linear;      // 跟 level 的 10Hz 对齐，正好接上下一帧
}

.voice-dock__notice {
  margin: 0; font-size: var(--shell-fs-caption); line-height: 1.3;
  color: var(--shell-danger);
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}

@media (prefers-reduced-motion: reduce) {
  .voice-dock { transition: border-color 160ms ease-out; }   // 宽度直接跳
  .voice-dock__wave span { transition: none; }               // 画最后一次电平，不补间
}
```

配色全走 shell token；orb `theme="auto"` 跟随环境。`.voice-signal` 整段（5 个静态 span + `@keyframes voice-signal-pulse` + 它的 reduced-motion 分支）删除 —— 那正是要否掉的假动画。

## 6. 回滚

协议层是纯增量（新后缀 + 可选方法 + 新 signal + 默认关的 `emitLevel`），旧调用方不受影响，可单独 revert。渲染层集中在两个 `.vue` + 一个常量文件 + 两个 locale JSON。三层各自一个提交。

## 7. 设备就绪与展开（2026-09-06 第六轮，来自两张实机截图）

### 7.1 采集未开始 ≠ 在听

`listening` 只表示「流已开」，第一帧 PCM 到达前它什么也没听到。原来这段时间画的是一条静止的波形——一条不动的波形是在说「你没出声」，而真相是「设备还没开」。

```ts
const preparing = computed(() => listening.value && !hasLevel.value && !hasNotice.value)
```

`preparing` 期间：中间显示 `capturingDevice`，胶囊外圈跑呼吸辉光（`.voice-dock--preparing` 的 box-shadow 动画，`prefers-reduced-motion` 下关掉），**不画波形**。首帧 `level` 到达即切走。

同一个门还兜住了死设备：`CAPTURE_START_TIMEOUT_MS = 2000` 内没有任何 `level`，说明设备没在送数据，弹 `microphoneUnresponsive`（warning，不终止会话）。没有这条，麦克风被别的应用独占时 UI 会一直显示「在听」，永远不出错。

### 7.2 设备类失败要分开说

`classifyFailure` 原来只分 quota / 拥塞 / 兜底。权限没给和设备不存在都会落进兜底那句「转写失败」，而这两种恰恰是用户能自己修的：

| 匹配 | 文案 |
| --- | --- |
| `PERMISSION`/`DENIED`/`NOT_?AUTHORIZED`/`UNAUTHORIZED` | `microphoneDenied` — 去系统设置里允许 |
| `NO_?(INPUT\|AUDIO\|MIC)`/`DEVICE_?NOT_?FOUND`/`NO_?DEFAULT_?DEVICE` | `microphoneMissing` — 检查系统输入设备 |

顺序在 quota 之前：权限串里也可能出现 `LIMIT` 之类的词，先判更具体的。

### 7.3 长文案：灵动岛式展开

一行放不下时旧行为是 `text-overflow: ellipsis`——把「该怎么办」那半句吃掉，只留「失败了」。宽度先吃满到 `PILL_MAX_WIDTH = 340`，还溢出才长高：

```ts
// 宽度定死之后再量溢出，否则量到的是上一帧的宽度
pillHeight.value = el && el.scrollWidth > el.clientWidth ? PILL_TALL_HEIGHT : PILL_BASE_HEIGHT
```

`PILL_TALL_HEIGHT = 88`，文字 `-webkit-line-clamp: 2`。不是两行严格需要的 64——那个高度上文字块顶满卡片，读起来像一颗被拉长的胶囊，卡片是可以有余量的；88 才够放下「上文下钮」这套版式。窗口高度随之从 64 抬到 112（§2.3 的常量同步改），多出来的是投影和呼吸光晕的余量，它们画在面外，窗口边一刀切会露馅。

### 7.4 长高之后不再是胶囊

```ts
const PILL_TALL_RADIUS = 24
const expanded = computed(() => pillHeight.value > PILL_BASE_HEIGHT)
const pillRadius = computed(() => (expanded.value ? PILL_TALL_RADIUS : PILL_BASE_HEIGHT / 2))
```

胶囊的圆角是高度的一半。高度到 88 还保持全圆角，两端各吃掉 44px——正好吃在第二行要用的地方，而且看着像个被拉长的药丸，不像一张卡。所以一行是胶囊（22），两行是圆角矩形（24），`border-radius` 进过渡曲线，`TxBorderBeam` 吃同一个 `pillRadius`（原来写死 22，长高后光带会从卡片角上跑出去）。

### 7.4.1 圆钮跟着长，但不等比例

```ts
const CONTROL_BASE_SIZE = 34
const CONTROL_TALL_SIZE = 40
const controlSize = computed(() => (expanded.value ? CONTROL_TALL_SIZE : CONTROL_BASE_SIZE))
```

胶囊里 34 = 44 减两侧 5px padding —— **控件就是这根条**。照这个比例放到 88 高的卡片上是 68，荒谬。卡片比任何控件都高，所以那里换一条规则：控件对齐旁边的两行文字块（≈38），取 40。**控件跟内容走，不跟容器走。**

尺寸写在脚本里而不是 CSS 里：它是形态的函数，而且要能被测试读到（jsdom 不跑 SFC 的 scoped 样式，写在 CSS 里就等于没有守卫）。宽度测量不会因此震荡——展开后 chrome 从 94 变 106，文字更挤，只会更溢出，判定仍然是「展开」，二值状态稳定。

展开态另加 `.voice-dock--expanded`：文字左对齐（两行居中读起来是海报不是通知），两枚圆钮仍垂直居中。

### 7.5 锁这一轮的测试

六条负控制逐条验过：删掉半径联动 / 删掉长高 / 删掉 `preparing` 门 / 删掉设备分类 / 兜底改回甩原文 / 删掉首帧超时——各自都能让对应用例转红。

### 7.4.2 卡片的版式：两排，不是把钮往下推的一排

第一版只把两枚钮 `align-items: flex-end` 沉到底，文字仍留在中间那一列 —— 底下空出一条 250px 的带子，整张卡一半是空气。**沉底只有在版式真的变成两排时才成立。**

```scss
.voice-dock--expanded {
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-rows: auto 1fr;      /* 第二排吃掉剩下的，钮在任何高度都贴地 */
  column-gap: 8px;
  row-gap: 4px;
}
.voice-dock--expanded .voice-dock__slot        { grid-area: 1 / 1 / 2 / 4; align-self: start; }
.voice-dock--expanded .voice-dock__btn--cancel { grid-area: 2 / 1 / 3 / 2; align-self: end; }
.voice-dock--expanded > *:last-child           { grid-area: 2 / 3 / 3 / 4; align-self: end; }
```

用 grid 而不是改 DOM：尾槽是 confirm / 恢复动作 / orb 三选一，`> *:last-child` 一条规则全覆盖，模板一行不动。

文字因此拿到整排 330 宽（原来中列只有 234）——**很多句子在这里根本不需要第二行**。上排是发生了什么，下排是你能做什么。

### 7.4.2.1 高度跟着量出来的文字

```ts
pillHeight.value = PILL_TALL_HEIGHT          // 先长成卡片，版式才会变
await nextTick()
const textHeight = centerTextRef.value?.scrollHeight ?? 0
pillHeight.value = Math.min(PILL_TALL_HEIGHT, PILL_TALL_PADDING + textHeight + PILL_ROW_GAP + CONTROL_TALL_SIZE)
```

一行 71、两行封顶 88。溢出判定是在**胶囊的中列**上做的，而卡片给的是整排宽度 —— 所以「装不下」之后到底占几行，只有在版式换完之后才知道。照两行的高度一律画，就是把那条空带竖过来。不会震荡：`expanded` 只看 `> PILL_BASE_HEIGHT`，71 和 88 都还在卡片态里。

**上半是发生了什么，下半是你能做什么。**

钮保持正圆，不跟着变成圆角矩形：控件跟着容器变形，就不再是同一个控件了——用户认的是那两个圆。角落里放得下：卡片圆角 24，钮心距角弧心 √2，20 + 1.41 < 24，圆完整落在弧内。

### 7.4.3 麦克风图标只给麦克风的问题

`Notice` 加 `icon?: string`，`classifyFailure` 只在三条设备/权限分支上挂 `i-carbon-microphone-off`（`microphoneDenied` / `microphoneMissing` / 首帧超时的 `microphoneUnresponsive`）。

额度、拥塞、兜底**都不给**。一个划了杠的麦克风画在「额度用完了」旁边，指的是错的元凶——图标比句子先被读到，指错了就是先骗一次。

宽度测量跟着加 `NOTICE_ICON_WIDTH = 26`（图标 + gap），否则带图标的那一档会按没图标的宽度算，正好挤掉最后一个字。

### 7.5 BorderBeam 之前根本没画出来

`TxBorderBeam` 是**包裹型**组件：它把光带画在自己的 border box 上，内容走 `<slot>`。而这里把它当成空的兄弟节点塞在 flex 行里 —— 没有内容就没有尺寸，塌成 0×0，什么都没画，还白吃一个 8px 的 gap。

```scss
.voice-dock :deep([data-beam]) {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
}
```

注意它的根节点上没有 `.tx-border-beam` 类（只有 `[data-beam="<id>"]`），所以原来那条 `:deep(.tx-border-beam)` 规则一个元素都没匹配到 —— 这是它一直没被发现的原因。

顺带把 `PILL_CHROME_WIDTH = 94`（padding 10 + 双钮 68 + **两个** gap 16）算对了：在流里时实际是三个 gap，24。

### 7.6 宽度量的是「想多宽」，不是「现在多宽」

`scrollWidth` 读的是**已经换行之后**的宽度，而那个宽度正是上一轮这段测量算出来的 —— 一句短文案在 200 的基础宽里换了行，它就报告「我装得下」，胶囊于是永远停在 200，文字永远是两行。截图里的「语音转写失败，请重试」就是这么卡住的。

```ts
function measureNaturalWidth(element: HTMLElement): number {
  const previous = element.style.whiteSpace
  element.style.whiteSpace = 'nowrap'
  const width = element.scrollWidth
  element.style.whiteSpace = previous
  return width
}
```

强制单行的那一瞬间才问得出第二个问题。有了自然宽度，展开判定也不必再拿 `scrollWidth > clientWidth` 绕一圈：`needed = 自然宽 + chrome`，`needed > PILL_MAX_WIDTH` 就换卡片版式，一个数说了算。

测试里的桩按 `style.whiteSpace === 'nowrap'` 返回不同的值（130 / 106）—— 两个问题的差别只在这里，桩不区分就测不出。另有一条断言：量完必须还原，不能在元素上留下 `nowrap`。

## 8. 设备失败：一摞，不是一行（2026-09-07）

前一版把设备失败套进「两排卡片」的规则里，结果是一行长句配一个什么都做不了的禁用 ✓。三处改法：

### 8.1 版式换成竖排

图标居中在上，一句话在下，两枚 40 圆钮仍在下排两端。**这是唯一带图片的通知**——划一杠的麦克风本身就是全部信息，句子只负责说清是哪一种麦克风问题，所以它不该是「一行字前面挂个图标」。

`grid-template-rows` 从 `auto 1fr` 翻成 **`1fr auto`**：前者把所有富余都堆到控件那一排，图标被钉在离 24 圆角只有 5px 的地方，看着挤（用户原话「不然很急」）。翻过来之后那摞内容在控件上方的空间里自己居中，再加 `padding-top: 12px` 让它躲开圆角的弧，而不只是躲开边框。

几何写死 `264 × 120`，不量：这张卡的文案是固定短句，没有可测的自然宽度，也不可能溢出。

### 8.2 文案砍短，出路搬到按钮上

「找不到可用的麦克风」/「麦克风权限未授权」/「麦克风没有响应」—— 后半句「请检查系统输入设备」「请在系统设置中允许」全删。**「去哪里修」不再写在句子里，它现在是那枚 ⚙。**

### 8.3 ⚙ 是主进程拥有的意图，不是渲染层递过来的 URL

```ts
voiceApiEvents.openMicrophoneSettings   // 无 payload
const MICROPHONE_SETTINGS_URL: Partial<Record<NodeJS.Platform, string>> = {
  darwin: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  win32: 'ms-settings:privacy-microphone'
}
```

这两个 scheme **故意不在** `ALLOWED_EXTERNAL_PROTOCOLS`（`http/https/mailto/tel/tuff`）里，而那张白名单是插件面共用的。让渲染层把 scheme 递过来就等于把它重新打开，所以事件不带 payload：调用方只说意图，URL 整串留在主进程。事件也没进 `PLUGIN_FACING_*` 清单，插件够不着。

Linux 没有跨桌面通用的入口 —— 那里 `canOpenMicSettings` 为 false，通知照旧只有句子，不给一枚点了没反应的按钮。

`NoticeAction` 因此扩成 `'undo' | 'retry' | 'settings'`，并且 `classifyFailure` 返回的 action 优先于「danger 才给重试」那条兜底规则：**一次分类过的失败，比色调更清楚自己能怎么办**。

## 9. 内容整块交接（2026-09-07）

盒子已经在动宽、动高、动圆角，里面的句子却是硬切，读起来像两件不相干的事同时发生。

```scss
.voice-swap-enter-from,
.voice-swap-leave-to { opacity: 0; filter: blur(5px); transform: scale(0.86); }
.voice-swap-leave-active { position: absolute; inset: 5px; }   /* 离场那份出流，否则两块抢同一个 grid 格 */
```

`<Transition>` 包的是**整个 `.voice-dock__slot`**，`:key="centerKey"`（按句子取键，所以「还在转写」→「比平时久」也算换内容）。包整块而不是逐个元素，图标和它的句子才会一起动，不会互相赛跑。

**这里埋着一个会坏的点**：过渡期间新旧两块同时在 DOM 里，而旧的那块还挂着上一句话。宽度测量必须只认进来的那块：

```ts
root.querySelector('.voice-dock__slot:not(.voice-swap-leave-active) .voice-dock__text')
```

否则胶囊会按「它正在忘掉的那句话」定宽。测试用真实 `<Transition>`（其余用例吃的是 Test Utils 默认的 transition stub，对此全盲），桩按元素内容返回不同宽度；把选择器换成不带 `:not(...)` 的版本立刻转红。

## 10. 底部系统栏（2026-09-07，第二版推翻第一版）

### 10.1 第一版：留出余量 —— 已撤销

先做的是「系统没给信息就把那条会被盖住的带子提前让出来」：无保留时底部留 24 + 72(mac) / 48(win)。结果是**HUD 被顶得太靠上**，而且每台没有底栏的机器都在白付这份空间。

### 10.2 第二版：不躲，压上去

窗口本来就是 `type: 'panel'`（NSPanel），盖住它的不是类型而是**层级**：

| | 层级 |
| --- | --- |
| `floating` = NSFloatingWindowLevel | **3** |
| Dock = kCGDockWindowLevel | **20** |
| `status` = NSStatusWindowLevel | **25** |

原来用的是 `floating`(3)，在 Dock(20) 之下，所以 Dock 一滑出来就把 HUD 埋了。改成 **`status`(25)**：HUD 画在栏的上面，滑出来的 Dock 从它下面过。Windows 上 `setAlwaysOnTop(true)` 本身就在任务栏之上，层级参数只对 macOS 生效。

于是底部余量退回**单一的 24**，`bottomGapFor` 和 `AUTO_HIDDEN_BAR_RESERVE` 一起删掉——盖不住就不用躲。

`display-metrics-changed` 那条重新贴边的路保持不变：工作区真变了（任务栏改常驻、换边、分辨率、插拔屏），HUD 照样跟着走。

## 11. 设备卡的第二轮（2026-09-07）

| | 原 | 现 | 理由 |
| --- | --- | --- | --- |
| 图标色 | `--shell-warning` #946210 | **#B57A18** | shell 那个值是为 11px 小字压暗过的（要在 `-soft` 面上过 AA 4.5:1），放到图标尺寸上读起来是棕不是警告。图标是图形，门槛是 3:1，画板原值轻松够。 |
| 文案 | 11px caption | **13px / 500** | 「颜色怪怪的」有一半是 11px 的锅。字号上去之后仍用可访问的深色墨水，AA 不降。 |
| 图标上方留白 | 18px | **22px**（`padding-top` 12→16，卡高 120→124） | +22%。 |
| 通知驻留 | 700 / 900 / 1600 / 5000 | **900 / 1200 / 2100 / 6500** | 一律 +30%。带按钮那档尤其重要：它要活得比伸手去点的反射弧长。 |

窗口高度随卡片到 **148**。

## 12. 录制进度环（2026-09-07，出稿，未实现）

### 12.1 为什么这条能画，转写那条不能

**录制是这块面板上唯一有分母的进度。** 转写没有——provider 只报 partial 和 final，从不报分数——所以 §5 的 BorderBeam 只能表示「还在跑」。录制有：`maxDurationMs` 就是分母。定 **300s**。

所以两者互斥，不是叠加：**录制中画进度环，转写中画 beam**。同一条边上不能同时跑两种含义不同的线，一个说「还剩多少」、一个说「还在跑」，叠在一起两个都读不出来。

### 12.2 画法

SVG 圆角矩形 + dash：

```
stroke-dasharray  = 周长
stroke-dashoffset = 周长 × (1 − elapsed / 300s)
周长 = 2(w − 2r) + 2(h − 2r) + 2πr
```

`w/h/r` 直接取 `pillWidth` / `pillHeight` / `pillRadius`，三者本来就是响应式的，所以胶囊变形时环跟着重算，不需要额外的测量。从直边左上角起顺时针走。

最后 30s 转 warning 色，中槽补一句「还剩 30 秒」。走到 300s 由既有的 max-duration 路径自动停采并**照常收尾**（`final` → polish → deliver），不是取消——录满了不等于不要了。

### 12.3 未决：300s 撞上重试缓冲的硬上限

`maxDurationMs` 现在默认 **15s**，§4 的留存契约正是按这个数算的：≈480KB，稳稳在 `MAX_RETRY_BUFFER_BYTES = 4MB` 之内。

300s 的 16kHz 单声道 16-bit PCM 是 **≈9.6MB**，超上限一倍多。按现有实现，缓冲溢出后会停止累积并放弃重试能力 —— 也就是**超过约 125s 的录音将没有「撤销 / 重试」**。

两条路，必须选一条，不能默默让恢复能力消失：

1. 把 `MAX_RETRY_BUFFER_BYTES` 抬到 10MB。代价是主进程常驻内存多 10MB，而且那 10MB 是用户说过的话，宽限期内一直在内存里。
2. 保持 4MB，但在录音跨过 125s 时**在 UI 上说出来**（比如环上加一个标记，或结束时的通知里说明这次不能撤销）。悄悄失去撤销是最差的一种。

在这条定下来之前不实现——这不是实现细节，是隐私面 + 用户承诺，跟 §4 同级。
