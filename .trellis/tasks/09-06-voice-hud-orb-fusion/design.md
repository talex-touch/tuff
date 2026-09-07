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
