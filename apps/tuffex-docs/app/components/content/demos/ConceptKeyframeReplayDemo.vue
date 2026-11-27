<script setup lang="ts">
import { useReducedMotion } from '@talex-touch/tuffex/utils'
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * Replaying one pulse on demand, two ways, with the article's keyframes.
 *
 * The swap box alternates between `is-pulse-a` and `is-pulse-b`, whose keyframes share a
 * body under different names, so every click changes `animation-name` and the browser
 * starts the animation over. The naive box removes and re-adds `is-pulse` within one
 * task: by the time style is recomputed the class is back, nothing has changed, and
 * only the first click plays. Neither reads layout to force a reflow. Starts are
 * counted from `animationstart`, so they are what the browser did, not what was asked.
 */

type Box = 'swap' | 'naive'

const BOXES: Box[] = ['swap', 'naive']
/** How long a click waits for its `animationstart` before it counts as missed. */
const SETTLE_MS = 150

const { locale } = useI18n()
const reducedMotion = useReducedMotion()

const flip = ref<'a' | 'b' | null>(null)
/** Bumped to re-create both boxes, which drops any class added by hand. */
const generation = ref(0)
const clicks = reactive<Record<Box, number>>({ swap: 0, naive: 0 })
const starts = reactive<Record<Box, number>>({ swap: 0, naive: 0 })
/** Clicks old enough that their animation, if any, has started. */
const settled = reactive<Record<Box, number>>({ swap: 0, naive: 0 })
const settleTimers: Record<Box, number> = { swap: 0, naive: 0 }

const copy = computed(() => locale.value === 'zh'
  ? {
      titles: { swap: '交替两组同样的关键帧', naive: '同一个类名删了再加' },
      press: '点我',
      clicks: '点击次数',
      starts: '动画开始次数',
      idle: '点几下上面的方块。',
      allPlayed: '每次点击都重新播放了。',
      missed: (count: number) => `有 ${count} 次点击没能让动画重新开始。`,
      reduced: '已开启「减少动态效果」：脉冲换成不位移的透明度闪烁，重播的道理不变。',
      caption: '两个方块用的都是正文里那段脉冲关键帧。左边每次点击在 is-pulse-a 和 is-pulse-b 之间换一次：两组关键帧内容相同、名字不同，animation-name 一变，浏览器就从头再播。右边在同一个任务里先删后加 is-pulse，也没读 offsetWidth 强制回流：等样式重算时类名已经回来了，浏览器看到的是「没变」，所以只有第一次会播。「动画开始次数」数的是 animationstart 事件，也就是浏览器真正启动动画的次数。',
    }
  : {
      titles: { swap: 'Alternate two identical keyframes', naive: 'Remove and re-add one class' },
      press: 'Click',
      clicks: 'Clicks',
      starts: 'Animation starts',
      idle: 'Click the box above a few times.',
      allPlayed: 'Every click replayed the pulse.',
      missed: (count: number) => `${count} ${count === 1 ? 'click' : 'clicks'} did not restart the animation.`,
      reduced: 'Reduced motion is on: the pulse becomes an opacity flash that does not move; the replay logic is the same.',
      caption: 'Both boxes use the pulse keyframes from the article. The left one switches between is-pulse-a and is-pulse-b on every click: the two keyframes share a body under different names, so animation-name changes and the browser starts the animation over. The right one removes is-pulse and adds it back in the same task, without reading offsetWidth to force a reflow: by the time style is recomputed the class is back, the browser sees no change, and only the first click plays. “Animation starts” counts animationstart events, the times the browser actually started an animation.',
    })

function count(box: Box) {
  clicks[box] += 1
  window.clearTimeout(settleTimers[box])
  settleTimers[box] = window.setTimeout(() => {
    settled[box] = clicks[box]
  }, SETTLE_MS)
}

function replaySwap() {
  count('swap')
  flip.value = flip.value === 'a' ? 'b' : 'a'
}

function replayNaive(event: MouseEvent) {
  count('naive')
  const box = event.currentTarget as HTMLElement
  // Both in one task: style never sees the class missing, so nothing restarts.
  box.classList.remove('is-pulse')
  box.classList.add('is-pulse')
}

function verdictClass(box: Box) {
  if (!settled[box])
    return ''
  return starts[box] >= settled[box] ? 'is-pass' : 'is-fail'
}

function verdict(box: Box) {
  const clicked = settled[box]
  if (!clicked)
    return copy.value.idle
  const missed = clicked - starts[box]
  return missed > 0 ? copy.value.missed(missed) : copy.value.allPlayed
}

function clearTimers() {
  for (const box of BOXES) {
    window.clearTimeout(settleTimers[box])
    settleTimers[box] = 0
  }
}

function resetDemo() {
  clearTimers()
  for (const box of BOXES) {
    clicks[box] = 0
    starts[box] = 0
    settled[box] = 0
  }
  flip.value = null
  generation.value += 1
}

onBeforeUnmount(clearTimers)

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure :caption="copy.caption">
    <div class="krp">
      <p v-if="reducedMotion" class="krp__note">
        {{ copy.reduced }}
      </p>
      <div class="cfig-split">
        <div v-for="box in BOXES" :key="`${box}-${generation}`" class="cfig-panel">
          <div class="cfig-panel__title">
            {{ copy.titles[box] }}
          </div>
          <div class="krp__code cfig-mono">
            <template v-if="box === 'swap'">
              <span :class="{ 'is-active': flip === 'a' }">is-pulse-a</span> ⇄ <span :class="{ 'is-active': flip === 'b' }">is-pulse-b</span>
            </template>
            <template v-else>
              remove('is-pulse') → add('is-pulse')
            </template>
          </div>
          <div class="krp__stage">
            <button
              v-if="box === 'swap'"
              type="button"
              class="krp-box"
              :class="flip ? `is-pulse-${flip}` : ''"
              @click="replaySwap"
              @animationstart="starts.swap += 1"
            >
              {{ copy.press }}
            </button>
            <button
              v-else
              type="button"
              class="krp-box is-naive"
              @click="replayNaive"
              @animationstart="starts.naive += 1"
            >
              {{ copy.press }}
            </button>
          </div>
          <div class="krp__stats">
            <span class="cfig-stat">
              <span class="cfig-stat__label">{{ copy.clicks }}</span>
              <span class="cfig-stat__value">{{ clicks[box] }}</span>
            </span>
            <span class="cfig-stat" :class="verdictClass(box)">
              <span class="cfig-stat__label">{{ copy.starts }}</span>
              <span class="cfig-stat__value">{{ starts[box] }}</span>
            </span>
          </div>
          <div class="cfig-panel__note">
            {{ verdict(box) }}
          </div>
        </div>
      </div>
    </div>
  </ConceptFigure>
</template>

<style scoped>
.krp {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.krp__note {
  margin: 0;
  color: var(--cfig-muted);
  font-size: 12px;
}

.krp__code {
  color: var(--cfig-muted);
  font-size: 12px;
}

.krp__code .is-active {
  color: var(--cfig-accent);
  font-weight: 600;
}

.krp__stage {
  display: grid;
  place-items: center;
  min-height: 112px;
}

.krp-box {
  --krp-tone: var(--tx-color-primary, #409eff);
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  padding: 0;
  border: 0;
  border-radius: 18px;
  background: color-mix(in srgb, var(--krp-tone) 16%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--krp-tone) 40%, transparent);
  color: var(--krp-tone);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.krp-box.is-naive {
  --krp-tone: var(--tx-color-warning, #e6a23c);
}

.krp-box:focus-visible {
  outline: 2px solid var(--krp-tone);
  outline-offset: 3px;
}

.krp__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}

/* The article's keyframes and timing, renamed only. */
.krp-box.is-pulse-a {
  animation: krp-pulse-a 240ms ease-out;
}

.krp-box.is-pulse-b {
  animation: krp-pulse-b 240ms ease-out;
}

.krp-box.is-pulse {
  animation: krp-pulse 240ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .krp-box.is-pulse-a {
    animation-name: krp-flash-a;
  }

  .krp-box.is-pulse-b {
    animation-name: krp-flash-b;
  }

  .krp-box.is-pulse {
    animation-name: krp-flash;
  }
}

@keyframes krp-pulse-a { 30% { scale: 1.1; } }
@keyframes krp-pulse-b { 30% { scale: 1.1; } }
@keyframes krp-pulse { 30% { scale: 1.1; } }
@keyframes krp-flash-a { 30% { opacity: 0.45; } }
@keyframes krp-flash-b { 30% { opacity: 0.45; } }
@keyframes krp-flash { 30% { opacity: 0.45; } }
</style>
