<script setup lang="ts">
import type { StreamRevealPreset, StreamState, TxStreamTextInstance } from '@talex-touch/tuffex/stream-text'
import { STREAM_PACING_DEFAULTS, STREAM_REVEAL_DURATION_MS } from '@talex-touch/tuffex/stream-text'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, triggerRef, watch } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * One scripted, bursty answer fed to two panes at the same moments: the left appends
 * each packet to the DOM as it lands, the right hands the same growing string to a real
 * TxStreamText. While it runs, every frame samples how many characters each pane shows,
 * which draws the timeline and gives the measured readouts. The script itself (first
 * packet, the stalls, a burst big enough to outrun `maxLagMs / wordMs` words) is the only
 * typed-in data; nothing loops, and the clock stops once the paced pane is done.
 */

interface Packet {
  at: number
  text: string
}

interface Sample {
  t: number
  arrived: number
  shown: number
}

const PRESETS: StreamRevealPreset[] = ['aurora', 'blur', 'hue', 'languid', 'none']
// Timeline layout in viewBox units.
const W = 600
const H = 168
const PLOT = { left: 44, right: 10, top: 12, bottom: 128 }
const LANE = { top: 146, height: 16 }

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const copy = computed(() => zh.value
  ? {
      packets: [
        { at: 600, text: '节拍器' },
        { at: 670, text: '不会改变' },
        { at: 740, text: '模型说了' },
        { at: 830, text: '什么，' },
        { at: 900, text: '只改变文字' },
        { at: 980, text: '出现的节奏。' },
        { at: 1900, text: '网络把几十个字一次性倒进来时，它不会让整段文字瞬间砸到屏幕上，而是把这一批摊开成连续、均匀的字流，同时保证积压不会拖得太久。' },
        { at: 2050, text: '服务端' },
        { at: 2120, text: '停顿时，' },
        { at: 2200, text: '光标停在原地等待；' },
        { at: 4000, text: '下一批到达后，写入点从原地继续向前，读者的视线只需要跟着一条平稳的线移动。' },
      ] as Packet[],
      start: '开始',
      replay: '重播',
      reveal: '渐显预设',
      rawTitle: '直接写入 DOM',
      rawNote: '每个网络包到达时整块追加到文本末尾。',
      pacedTitle: 'TxStreamText',
      idle: '点击「开始」，模拟一次带首包延迟、突发与长停顿的流式回答。',
      chart: '网络包到达与文字呈现随时间的累计字数',
      arrived: '到达（直接写入）',
      shown: '呈现（TxStreamText）',
      packetsLane: '网络包',
      axisChars: '字数',
      ttft: '首包延迟',
      stall: '最长停顿',
      frameJump: '单帧最多新增（直接写入 → 节拍器）',
      wait: '最老未显示字的最长等待',
      finish: '末包到达后收尾',
      revealDuration: '当前预设入场时长',
      chars: (n: number) => `${n} 字`,
      reduced: '系统开启了「减弱动态效果」：TxStreamText 会旁路节拍与渐显，两栏看起来相同。',
      caption: '左右两栏在同一时刻收到同一批网络包。时间轴里，灰线是累计到达的字数（也就是左栏），蓝线是 TxStreamText 实际呈现的字数，每帧从 DOM 读取；下方色条是每个网络包的大小。读数中除首包延迟与停顿取自脚本外，其余都是本次播放实测。',
    }
  : {
      packets: [
        { at: 600, text: 'A pacer ' },
        { at: 670, text: 'never changes ' },
        { at: 740, text: 'what the model ' },
        { at: 830, text: 'says, ' },
        { at: 900, text: 'only the rhythm ' },
        { at: 980, text: 'of its words. ' },
        { at: 1900, text: 'When the network dumps dozens of words in one packet, the pacer does not slam the whole batch onto the screen; it spreads it into an even, continuous flow and still keeps the backlog from lagging for long. ' },
        { at: 2050, text: 'If the ' },
        { at: 2120, text: 'server stalls, ' },
        { at: 2200, text: 'the caret holds its place; ' },
        { at: 4000, text: 'once the next batch lands, the write head carries on from where it stopped, so the reader\'s eye follows one calm line.' },
      ] as Packet[],
      start: 'Start',
      replay: 'Replay',
      reveal: 'Reveal preset',
      rawTitle: 'Appended to the DOM',
      rawNote: 'Each network packet is appended whole the moment it lands.',
      pacedTitle: 'TxStreamText',
      idle: 'Press Start to simulate a streamed answer with a first-token delay, a burst and a long stall.',
      chart: 'Cumulative characters arrived and shown over time',
      arrived: 'Arrived (appended)',
      shown: 'Shown (TxStreamText)',
      packetsLane: 'Packets',
      axisChars: 'chars',
      ttft: 'First packet',
      stall: 'Longest stall',
      frameJump: 'Most characters added in one frame (appended → paced)',
      wait: 'Longest wait of the oldest unshown character',
      finish: 'Finish after the last packet',
      revealDuration: 'Entrance of this preset',
      chars: (n: number) => `${n} chars`,
      reduced: 'Reduced motion is on: TxStreamText bypasses pacing and reveals, so both panes look the same.',
      caption: 'Both panes receive the same packets at the same moments. On the timeline the grey line is the characters arrived so far (the left pane) and the blue line the characters TxStreamText shows, read from the DOM every frame; the bars below are each packet\'s size. The first packet and the stall come from the script; every other readout is measured on this run.',
    })

const packets = computed(() => copy.value.packets)
const fullText = computed(() => packets.value.map(packet => packet.text).join(''))
const total = computed(() => fullText.value.length)
const lastAt = computed(() => packets.value[packets.value.length - 1]?.at ?? 0)

const reveal = ref<StreamRevealPreset>('aurora')
const started = ref(false)
const running = ref(false)
const runId = ref(0)
const raw = ref('')
const paced = ref('')
const streaming = ref(false)
const pacedState = ref<StreamState>('idle')
const elapsed = ref(0)
const doneAt = ref<number | null>(null)
const samples = shallowRef<Sample[]>([])
const reducedMotion = ref(false)

const rawRef = ref<HTMLElement | null>(null)
const pacedRef = ref<TxStreamTextInstance | null>(null)

let timers: ReturnType<typeof setTimeout>[] = []
let frame = 0
let startedAt = 0
/** When each character actually landed, in ms since start (timers can run late). */
let landedAt: number[] = []

function shownCount() {
  const el = pacedRef.value?.$el as HTMLElement | undefined
  // The live layer only, should a reserve copy ever sit beside it.
  return (el?.querySelector('.tx-stream-text__live') ?? el)?.textContent?.length ?? 0
}

function stopClock() {
  timers.forEach(clearTimeout)
  timers = []
  if (frame)
    cancelAnimationFrame(frame)
  frame = 0
  running.value = false
}

function sample() {
  frame = 0
  const t = performance.now() - startedAt
  const shown = shownCount()
  samples.value.push({ t, arrived: rawRef.value?.textContent?.length ?? 0, shown })
  triggerRef(samples)
  elapsed.value = t
  const finished = doneAt.value !== null && shown >= total.value
  // A guard in case the paced pane never reports done: stop well past the script.
  if (finished || t > timelineEnd.value + 4000) {
    running.value = false
    return
  }
  frame = requestAnimationFrame(sample)
}

function start() {
  stopClock()
  runId.value++
  raw.value = ''
  paced.value = ''
  streaming.value = true
  pacedState.value = 'streaming'
  samples.value = []
  landedAt = []
  doneAt.value = null
  elapsed.value = 0
  started.value = true
  running.value = true
  startedAt = performance.now()
  const list = packets.value
  list.forEach((packet, index) => {
    timers.push(setTimeout(() => {
      const at = performance.now() - startedAt
      for (let i = 0; i < packet.text.length; i++)
        landedAt.push(at)
      raw.value += packet.text
      paced.value += packet.text
      // The source closes with its last packet; the pacer drains what is left.
      if (index === list.length - 1)
        streaming.value = false
    }, packet.at))
  })
  frame = requestAnimationFrame(sample)
}

function onPacedState(state: StreamState) {
  pacedState.value = state
  if (state === 'done' && running.value && doneAt.value === null)
    doneAt.value = performance.now() - startedAt
}

function resetDemo() {
  stopClock()
  runId.value++
  raw.value = ''
  paced.value = ''
  streaming.value = false
  pacedState.value = 'idle'
  samples.value = []
  landedAt = []
  doneAt.value = null
  elapsed.value = 0
  started.value = false
  reveal.value = 'aurora'
}

defineExpose({ resetDemo })

let motionQuery: MediaQueryList | null = null
function onMotionChange() {
  reducedMotion.value = Boolean(motionQuery?.matches)
}

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  onMotionChange()
  motionQuery.addEventListener('change', onMotionChange)
})

onBeforeUnmount(() => {
  stopClock()
  motionQuery?.removeEventListener('change', onMotionChange)
  motionQuery = null
})

// The script is per language: a new language starts from scratch.
watch(locale, resetDemo)

// Script facts.
const ttft = computed(() => packets.value[0]?.at ?? 0)
const longestStall = computed(() => packets.value.reduce((longest, packet, index, list) =>
  index === 0 ? longest : Math.max(longest, packet.at - list[index - 1]!.at), 0))
const largestPacket = computed(() => Math.max(...packets.value.map(packet => packet.text.length)))

// Timeline scale: the script, plus the longest a unit may wait once the last packet lands.
const timelineEnd = computed(() => Math.max(lastAt.value + STREAM_PACING_DEFAULTS.maxLagMs, (doneAt.value ?? 0) + 100))

function x(t: number) {
  return PLOT.left + (Math.min(t, timelineEnd.value) / timelineEnd.value) * (W - PLOT.left - PLOT.right)
}

function y(chars: number) {
  return PLOT.bottom - (chars / (total.value || 1)) * (PLOT.bottom - PLOT.top)
}

const arrivedPath = computed(() => {
  const points: string[] = [`${x(0)},${y(0)}`]
  let sum = 0
  for (const packet of packets.value) {
    points.push(`${x(packet.at).toFixed(1)},${y(sum).toFixed(1)}`)
    sum += packet.text.length
    points.push(`${x(packet.at).toFixed(1)},${y(sum).toFixed(1)}`)
  }
  points.push(`${x(timelineEnd.value).toFixed(1)},${y(sum).toFixed(1)}`)
  return points.join(' ')
})

const shownPath = computed(() => samples.value
  .map(point => `${x(point.t).toFixed(1)},${y(point.shown).toFixed(1)}`)
  .join(' '))

const laneBars = computed(() => packets.value.map(packet => ({
  x: x(packet.at),
  height: Math.max(1.5, (packet.text.length / largestPacket.value) * LANE.height),
})))

const timeTicks = computed(() => {
  const ticks: number[] = []
  for (let t = 0; t <= timelineEnd.value; t += 1000)
    ticks.push(t)
  return ticks
})

// Measured on this run.
const measured = computed(() => {
  const list = samples.value
  if (list.length < 2)
    return null
  let rawJump = 0
  let pacedJump = 0
  let wait = 0
  for (let i = 1; i < list.length; i++) {
    rawJump = Math.max(rawJump, list[i]!.arrived - list[i - 1]!.arrived)
    pacedJump = Math.max(pacedJump, list[i]!.shown - list[i - 1]!.shown)
  }
  // The oldest character that has landed but is not shown yet, and how long it has waited.
  for (const point of list) {
    const since = point.shown < point.arrived ? landedAt[point.shown] : undefined
    if (since !== undefined)
      wait = Math.max(wait, point.t - since)
  }
  return { rawJump, pacedJump, wait }
})

const finishLag = computed(() => (doneAt.value === null ? null : doneAt.value - lastAt.value))
</script>

<template>
  <ConceptFigure class="spd-root" stage="plain" :caption="copy.caption">
    <div class="spd">
      <div class="cfig-split">
        <div class="cfig-panel">
          <span class="cfig-panel__title">{{ copy.rawTitle }}</span>
          <div class="spd__hold">
            <span class="spd__ghost" aria-hidden="true">{{ fullText }}</span>
            <span ref="rawRef" class="spd__text">{{ raw }}</span>
            <span v-if="!started" class="spd__idle">{{ copy.idle }}</span>
          </div>
          <span class="cfig-panel__note">{{ copy.rawNote }}</span>
        </div>
        <div class="cfig-panel">
          <span class="cfig-panel__title">
            {{ copy.pacedTitle }}
            <span class="cfig-badge cfig-mono" :class="{ 'is-pass': pacedState === 'done' }">{{ pacedState }}</span>
          </span>
          <div class="spd__hold">
            <span class="spd__ghost" aria-hidden="true">{{ fullText }}</span>
            <TxStreamText
              :key="runId"
              ref="pacedRef"
              class="spd__text"
              :content="paced"
              :streaming="streaming"
              :reveal="reveal"
              :locale="zh ? 'zh' : 'en'"
              @state-change="onPacedState"
            />
          </div>
          <span class="cfig-panel__note cfig-mono">
            wordMs {{ STREAM_PACING_DEFAULTS.wordMs }} · maxLagMs {{ STREAM_PACING_DEFAULTS.maxLagMs }} · drainMs {{ STREAM_PACING_DEFAULTS.drainMs }} · pauseMs {{ STREAM_PACING_DEFAULTS.pauseMs }}
          </span>
        </div>
      </div>

      <svg class="spd__chart" :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="copy.chart">
        <line class="spd__axis" :x1="PLOT.left" :y1="PLOT.bottom" :x2="W - PLOT.right" :y2="PLOT.bottom" />
        <line class="spd__axis" :x1="PLOT.left" :y1="PLOT.top" :x2="PLOT.left" :y2="PLOT.bottom" />
        <text class="spd__tick" :x="PLOT.left - 5" :y="PLOT.top + 4" text-anchor="end">{{ total }}</text>
        <text class="spd__tick" :x="PLOT.left - 5" :y="PLOT.bottom" text-anchor="end">0</text>
        <text class="spd__tick is-axis" :x="PLOT.left + 4" :y="PLOT.top + 4">{{ copy.axisChars }}</text>
        <text
          v-for="tick in timeTicks"
          :key="tick"
          class="spd__tick"
          :x="x(tick)"
          :y="PLOT.bottom + 12"
          text-anchor="middle"
        >
          {{ tick / 1000 }}s
        </text>
        <text class="spd__tick is-axis" :x="PLOT.left - 5" :y="LANE.top + LANE.height - 2" text-anchor="end">{{ copy.packetsLane }}</text>
        <line
          v-for="(bar, index) in laneBars"
          :key="`p${index}`"
          class="spd__bar"
          :x1="bar.x"
          :y1="LANE.top + LANE.height"
          :x2="bar.x"
          :y2="LANE.top + LANE.height - bar.height"
        />
        <polyline class="spd__line is-arrived" :points="arrivedPath" />
        <polyline v-if="samples.length > 1" class="spd__line is-shown" :points="shownPath" />
        <line
          v-if="running"
          class="spd__playhead"
          :x1="x(elapsed)"
          :y1="PLOT.top"
          :x2="x(elapsed)"
          :y2="LANE.top + LANE.height"
        />
      </svg>
    </div>

    <template #controls>
      <TxButton size="sm" variant="primary" @click="start">
        {{ started ? copy.replay : copy.start }}
      </TxButton>
      <div class="cfig-control">
        <span class="cfig-control__label">{{ copy.reveal }}</span>
        <TxRadioGroup v-model="reveal">
          <TxRadio v-for="preset in PRESETS" :key="preset" :value="preset">
            {{ preset }}
          </TxRadio>
        </TxRadioGroup>
      </div>
      <div class="cfig-legend">
        <span class="cfig-legend__item" style="--swatch: var(--spd-arrived)"><span class="cfig-legend__swatch" />{{ copy.arrived }}</span>
        <span class="cfig-legend__item" style="--swatch: var(--spd-shown)"><span class="cfig-legend__swatch" />{{ copy.shown }}</span>
      </div>
      <p v-if="reducedMotion" class="cfig-panel__note spd__reduced">
        {{ copy.reduced }}
      </p>
    </template>

    <template #readout>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.ttft }}</span>
        <span class="cfig-stat__value">{{ ttft }} ms</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.stall }}</span>
        <span class="cfig-stat__value">{{ longestStall }} ms</span>
      </span>
      <span class="cfig-stat is-accent">
        <span class="cfig-stat__label">{{ copy.frameJump }}</span>
        <span class="cfig-stat__value">{{ measured ? `${copy.chars(measured.rawJump)} → ${copy.chars(measured.pacedJump)}` : '—' }}</span>
      </span>
      <span class="cfig-stat is-accent">
        <span class="cfig-stat__label">{{ copy.wait }}</span>
        <span class="cfig-stat__value">{{ measured ? `${Math.round(measured.wait)} ms` : '—' }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.finish }}</span>
        <span class="cfig-stat__value">{{ finishLag === null ? '—' : `${Math.round(finishLag)} ms` }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.revealDuration }}</span>
        <span class="cfig-stat__value">{{ reveal }} · {{ STREAM_REVEAL_DURATION_MS[reveal] }} ms</span>
      </span>
    </template>
  </ConceptFigure>
</template>

<style scoped>
.spd-root {
  --spd-arrived: var(--cfig-muted);
  --spd-shown: var(--cfig-accent);
}

.spd {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
}

/* Both panes hold the finished answer's height from the start, so the figure does not
   grow while it plays. */
.spd__hold {
  display: grid;
  font-size: 14px;
  line-height: 1.7;
}

.spd__hold > * {
  grid-area: 1 / 1;
  min-width: 0;
}

.spd__ghost {
  visibility: hidden;
}

.spd__idle {
  align-self: center;
  color: var(--cfig-muted);
  font-size: 12px;
  text-align: center;
}

.spd__chart {
  display: block;
  width: 100%;
  height: auto;
}

.spd__axis {
  stroke: var(--cfig-line-strong);
  stroke-width: 1;
}

.spd__tick {
  fill: var(--cfig-muted);
  font-family: var(--cfig-mono);
  font-size: 9px;
}

.spd__tick.is-axis {
  font-family: inherit;
}

.spd__bar {
  stroke: var(--spd-arrived);
  stroke-width: 3;
  stroke-linecap: round;
  opacity: 0.6;
}

.spd__line {
  fill: none;
  stroke-width: 1.8;
  stroke-linejoin: round;
}

.spd__line.is-arrived {
  stroke: var(--spd-arrived);
}

.spd__line.is-shown {
  stroke: var(--spd-shown);
}

.spd__playhead {
  stroke: var(--cfig-accent);
  stroke-width: 1;
  stroke-dasharray: 2 3;
  opacity: 0.7;
}

.spd__reduced {
  flex-basis: 100%;
  margin: 0;
}
</style>
