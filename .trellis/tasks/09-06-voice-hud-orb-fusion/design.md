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

### 7.4.2 卡片的版式：上文下钮

```scss
.voice-dock--expanded { align-items: flex-end; }              /* 两枚圆钮沉到底边 */
.voice-dock--expanded .voice-dock__slot { align-self: flex-start; }  /* 文字压顶 */
```

88 高的面上把控件继续垂直居中，它们会浮在一片已经被文字让开的空白中间，整张卡看着像一颗没填满的胶囊。**上半是发生了什么，下半是你能做什么。**

钮保持正圆，不跟着变成圆角矩形：控件跟着容器变形，就不再是同一个控件了——用户认的是那两个圆。角落里放得下：卡片圆角 24，钮心距角弧心 √2，20 + 1.41 < 24，圆完整落在弧内。

### 7.4.3 麦克风图标只给麦克风的问题

`Notice` 加 `icon?: string`，`classifyFailure` 只在三条设备/权限分支上挂 `i-carbon-microphone-off`（`microphoneDenied` / `microphoneMissing` / 首帧超时的 `microphoneUnresponsive`）。

额度、拥塞、兜底**都不给**。一个划了杠的麦克风画在「额度用完了」旁边，指的是错的元凶——图标比句子先被读到，指错了就是先骗一次。

宽度测量跟着加 `NOTICE_ICON_WIDTH = 26`（图标 + gap），否则带图标的那一档会按没图标的宽度算，正好挤掉最后一个字。
