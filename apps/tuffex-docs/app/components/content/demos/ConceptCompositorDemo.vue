<script setup lang="ts">
import { useReducedMotion } from '@talex-touch/tuffex/utils'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * Two boxes on one keyframe timing; one animates `left`, the other `translate`.
 *
 * `left` is a layout property: every frame of it needs the main thread to recompute
 * style, lay out and paint. `translate` only moves a layer, which the compositor does
 * on its own thread. Holding the main thread in a busy loop therefore freezes the
 * first box and leaves the second running. JS can measure only the main thread's side
 * of that, how long the loop held it and the frame gap it caused; the compositor's
 * frames show on screen alone.
 */

type Lane = 'left' | 'translate'
type Phase = 'idle' | 'blocking' | 'sampling'

interface BlockResult {
  heldMs: number
  longestGapMs: number | null
  frameMs: number | null
}

const LANES: Lane[] = ['left', 'translate']
/** How long the button holds the main thread. */
const BLOCK_MS = 1200
/** Frames sampled after the block to measure the usual frame interval. */
const SAMPLE_FRAMES = 30
/** Sampling gives up after this long, e.g. when a hidden tab stops rAF. */
const SAMPLE_TIMEOUT_MS = 1500

const { locale } = useI18n()
const reducedMotion = useReducedMotion()

const stageRef = ref<HTMLElement | null>(null)
const playing = ref(false)
const inView = ref(true)
/** Bumped to re-create both boxes, which restarts their animations together. */
const runKey = ref(0)
const phase = ref<Phase>('idle')
const result = shallowRef<BlockResult | null>(null)

const running = computed(() => playing.value && inView.value)

const copy = computed(() => {
  const seconds = String(BLOCK_MS / 1000)
  return locale.value === 'zh'
    ? {
        thread: {
          left: '主线程：每一帧都要重算样式、布局、绘制',
          translate: '合成器：直接移动已经画好的图层',
        },
        lanes: '两条动画轨道',
        play: '播放动画',
        block: `阻塞主线程 ${seconds} 秒`,
        blocking: '阻塞中…',
        statusBlocking: `主线程正被一段 ${seconds} 秒的同步循环占满`,
        statusSampling: '正在测量帧间隔…',
        statusReduced: '已开启「减少动态效果」，动画不自动播放；打开「播放动画」后再试。',
        statusPaused: '动画已暂停；打开「播放动画」后才能对比。',
        statusIdle: '按下按钮，看哪个方块停住、哪个照常移动。',
        held: '循环实际占住主线程',
        gap: '最长帧间隔',
        frame: '平时帧间隔',
        caption: `两个方块跑同一组关键帧，时长、曲线、起点都一样，只是被动画的属性不同：上面改 left，下面改 translate。按下按钮后，脚本在主线程上空转 ${seconds} 秒。left 每一帧都要主线程重算样式、布局和绘制，所以原地卡住，循环一结束就跳到它「本该在」的位置；translate 由合成器移动图层，全程照走。帧间隔用 requestAnimationFrame 实测，量到的是主线程的帧；合成器自己的帧 JS 量不到，只能看画面。`,
      }
    : {
        thread: {
          left: 'Main thread: style, layout and paint on every frame',
          translate: 'Compositor: moves a layer that is already painted',
        },
        lanes: 'Two animation lanes',
        play: 'Play animation',
        block: `Block the main thread for ${seconds} s`,
        blocking: 'Blocking…',
        statusBlocking: `The main thread is stuck in a ${seconds} s synchronous loop`,
        statusSampling: 'Measuring frame intervals…',
        statusReduced: 'Reduced motion is on, so nothing autoplays. Turn on “Play animation” to try it.',
        statusPaused: 'The animation is paused. Turn on “Play animation” to compare.',
        statusIdle: 'Press the button and watch which box stops and which keeps moving.',
        held: 'Main thread held by the loop',
        gap: 'Longest frame gap',
        frame: 'Usual frame interval',
        caption: `Both boxes run one keyframe timing, with the same duration, curve and start; only the animated property differs: the top box changes left, the bottom one translate. The button makes a script spin on the main thread for ${seconds} s. left needs the main thread to recompute style, layout and paint on every frame, so that box freezes, and when the loop ends it jumps to where it should be by now. translate only moves a layer, which the compositor keeps doing throughout. Frame intervals are measured with requestAnimationFrame, which sees the main thread’s frames; the compositor’s own frames are out of JS’s reach, so for those, watch the screen.`,
      }
})

const status = computed(() => {
  const text = copy.value
  if (phase.value === 'blocking')
    return text.statusBlocking
  if (phase.value === 'sampling')
    return text.statusSampling
  if (!playing.value)
    return reducedMotion.value ? text.statusReduced : text.statusPaused
  return text.statusIdle
})

const frameText = computed(() => {
  const frameMs = result.value?.frameMs
  return frameMs ? `${formatMs(frameMs)} · ${Math.round(1000 / frameMs)} Hz` : '—'
})

let frame = 0
let spinTimer = 0
let sampleTimer = 0
let observer: IntersectionObserver | null = null
let beforeBlock = 0
let held = 0
let stamps: number[] = []

function formatMs(value: number) {
  if (value === 0)
    return '0 ms'
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ms`
}

/** The median frame interval, averaged with its neighbours so a coarse clock still reads true. */
function typicalInterval(intervals: number[]) {
  const sorted = [...intervals].sort((a, b) => a - b)
  const median = sorted[sorted.length >> 1]
  if (!median)
    return null
  const near = sorted.filter(value => value > median / 2 && value < median * 1.5)
  return near.reduce((sum, value) => sum + value, 0) / near.length
}

function cancelPending() {
  if (frame)
    cancelAnimationFrame(frame)
  frame = 0
  window.clearTimeout(spinTimer)
  spinTimer = 0
  window.clearTimeout(sampleTimer)
  sampleTimer = 0
}

function block() {
  if (phase.value !== 'idle' || !playing.value)
    return
  phase.value = 'blocking'
  result.value = null
  // Spin only after the frame that shows the blocked state has gone out.
  frame = requestAnimationFrame((stamp) => {
    frame = 0
    beforeBlock = stamp
    spinTimer = window.setTimeout(spin, 0)
  })
}

function spin() {
  spinTimer = 0
  const start = performance.now()
  let now = start
  // Bounded: whatever happens, the loop ends after BLOCK_MS.
  while (now - start < BLOCK_MS)
    now = performance.now()
  held = now - start
  phase.value = 'sampling'
  stamps = []
  sampleTimer = window.setTimeout(finish, SAMPLE_TIMEOUT_MS)
  frame = requestAnimationFrame(sampleFrame)
}

function sampleFrame(stamp: number) {
  stamps.push(stamp)
  if (stamps.length > SAMPLE_FRAMES) {
    finish()
    return
  }
  frame = requestAnimationFrame(sampleFrame)
}

function finish() {
  cancelPending()
  // The first gap runs from the last frame before the loop to the first one after it.
  const gaps = stamps.map((stamp, index) => stamp - (index ? stamps[index - 1]! : beforeBlock))
  result.value = {
    heldMs: held,
    longestGapMs: gaps.length ? Math.max(...gaps) : null,
    frameMs: typicalInterval(gaps.slice(1)),
  }
  phase.value = 'idle'
}

function resetDemo() {
  cancelPending()
  phase.value = 'idle'
  result.value = null
  playing.value = !reducedMotion.value
  runKey.value += 1
}

watch(reducedMotion, (reduced) => {
  if (reduced)
    playing.value = false
})

onMounted(() => {
  playing.value = !reducedMotion.value
  if (stageRef.value && typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (entry)
        inView.value = entry.isIntersecting
    })
    observer.observe(stageRef.value)
  }
})

onBeforeUnmount(() => {
  cancelPending()
  observer?.disconnect()
  observer = null
})

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure :caption="copy.caption">
    <div ref="stageRef" class="cmp" :class="{ 'is-paused': !running }">
      <div class="cmp__lanes" role="group" :aria-label="copy.lanes">
        <div v-for="lane in LANES" :key="`${lane}-${runKey}`" class="cmp-lane" :class="`is-${lane}`">
          <div class="cmp-lane__head">
            <span class="cfig-badge cfig-mono">{{ lane }}</span>
            <span>{{ copy.thread[lane] }}</span>
          </div>
          <div class="cmp-track">
            <span v-if="lane === 'left'" class="cmp-box" />
            <span v-else class="cmp-rail"><span class="cmp-box" /></span>
          </div>
        </div>
      </div>
      <p class="cmp__status" :class="{ 'is-blocking': phase === 'blocking' }" role="status">
        {{ status }}
      </p>
    </div>

    <template #controls>
      <TxSwitch v-model="playing" :label="copy.play" />
      <TxButton size="sm" :disabled="phase !== 'idle' || !playing" @click="block">
        {{ phase === 'blocking' ? copy.blocking : copy.block }}
      </TxButton>
    </template>

    <template #readout>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.held }}</span>
        <span class="cfig-stat__value">{{ result ? formatMs(result.heldMs) : '—' }}</span>
      </span>
      <span class="cfig-stat" :class="result?.longestGapMs != null ? 'is-fail' : ''">
        <span class="cfig-stat__label">{{ copy.gap }}</span>
        <span class="cfig-stat__value">{{ result?.longestGapMs != null ? formatMs(result.longestGapMs) : '—' }}</span>
      </span>
      <span class="cfig-stat" :class="result?.frameMs ? 'is-accent' : ''">
        <span class="cfig-stat__label">{{ copy.frame }}</span>
        <span class="cfig-stat__value">{{ frameText }}</span>
      </span>
    </template>
  </ConceptFigure>
</template>

<style scoped>
.cmp {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

.cmp__lanes {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cmp-lane {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cmp-lane__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  color: var(--cfig-muted);
  font-size: 12px;
}

.cmp-track {
  position: relative;
  height: 48px;
  overflow: hidden;
  border-radius: 10px;
  background: var(--tx-bg-color, #fff);
  box-shadow: inset 0 0 0 1px var(--cfig-line);
}

/* Box 28px, inset 10px. The keyframes repeat these as literals. */
.cmp-box {
  position: absolute;
  top: 10px;
  left: 10px;
  width: 28px;
  height: 28px;
  border-radius: 8px;
}

.cmp-lane.is-left .cmp-box {
  background: var(--tx-color-warning, #e6a23c);
  animation: cmp-left 1.6s ease-in-out infinite alternate;
}

/* The rail is exactly as wide as the travel, so translate: 100% carries the box end to end. */
.cmp-rail {
  position: absolute;
  inset-block: 0;
  left: 10px;
  width: calc(100% - 48px);
  animation: cmp-translate 1.6s ease-in-out infinite alternate;
}

.cmp-rail .cmp-box {
  left: 0;
  background: var(--tx-color-primary, #409eff);
}

.cmp.is-paused .cmp-lane.is-left .cmp-box,
.cmp.is-paused .cmp-rail {
  animation-play-state: paused;
}

.cmp__status {
  margin: 0;
  color: var(--cfig-muted);
  font-size: 12px;
}

.cmp__status.is-blocking {
  color: var(--cfig-fail);
  font-weight: 600;
}

@keyframes cmp-left {
  from {
    left: 10px;
  }
  to {
    left: calc(100% - 38px);
  }
}

@keyframes cmp-translate {
  from {
    translate: 0;
  }
  to {
    translate: 100% 0;
  }
}
</style>
