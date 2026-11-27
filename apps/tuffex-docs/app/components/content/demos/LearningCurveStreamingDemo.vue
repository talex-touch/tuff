<script setup lang="ts">
import type { LearningCurveRun } from '@talex-touch/tuffex/charts'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxLearningCurve } from '@talex-touch/tuffex/charts'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { seedsOf } from './learning-curve-sample'

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? {
      steps: '环境步数',
      reward: '回合回报',
      pause: '暂停训练',
      resume: '继续训练',
      done: '训练完成',
      view: '窗口：',
      all: '全部步数',
      follow: '跟随最新',
      runs: ['基线', '+ 好奇心'],
      labels: {
        chart: '学习曲线',
        step: (step: string) => `第 ${step} 步`,
        raw: '原始',
        instructions: '左右方向键逐步读数，Home 和 End 跳到首尾，Escape 清除。',
        zoomInstructions: '左右方向键逐步读数，加号和减号缩放，Shift 加左右方向键平移，0 显示全部步数，Escape 清除。',
      },
    }
  : {
      steps: 'Environment steps',
      reward: 'Episode return',
      pause: 'Pause training',
      resume: 'Resume training',
      done: 'Training complete',
      view: 'Window: ',
      all: 'every step',
      follow: 'following the newest step',
      runs: ['baseline', '+ curiosity'],
      labels: {},
    })

const STEPS = 500_000
const EVERY = 2000
const TOTAL = STEPS / EVERY + 1

// The whole run is drawn up front and revealed a logged point at a time.
const finished = [
  seedsOf({ ceiling: 2400, tau: 150_000, steps: STEPS, every: EVERY }, 7),
  seedsOf({ ceiling: 2900, tau: 120_000, steps: STEPS, every: EVERY }, 8),
]

const logged = ref(16)
const running = ref(true)
const view = ref<[number, number] | null>(null)

const runs = computed<LearningCurveRun[]>(() => finished.map((seeds, index) => ({
  name: copy.value.runs[index]!,
  seeds: seeds.map(seed => seed.slice(0, logged.value)),
})))
const stepFormat = (step: number) => step.toLocaleString(locale.value, { maximumFractionDigits: 3 })

const done = computed(() => logged.value >= TOTAL)
const newest = computed(() => (logged.value - 1) * EVERY)

const viewText = computed(() => {
  if (!view.value)
    return copy.value.all
  const [from, to] = view.value
  const range = `${Math.round(from).toLocaleString(locale.value)} – ${Math.round(to).toLocaleString(locale.value)}`
  return to >= newest.value ? `${range} · ${copy.value.follow}` : range
})

let timer: ReturnType<typeof setInterval> | undefined

function stop(): void {
  clearInterval(timer)
  timer = undefined
}

function start(): void {
  stop()
  timer = setInterval(() => {
    logged.value = Math.min(TOTAL, logged.value + 1)
    if (logged.value >= TOTAL) {
      running.value = false
      stop()
    }
  }, 120)
}

function toggle(): void {
  running.value = !running.value
  if (running.value)
    start()
  else
    stop()
}

onMounted(start)
onBeforeUnmount(stop)
</script>

<template>
  <div class="lc-stream-demo">
    <TxLearningCurve
      v-model:window="view"
      :runs="runs"
      :smoothing="0.8"
      :x-axis-name="copy.steps"
      :y-axis-name="copy.reward"
      :labels="copy.labels"
      :step-format="stepFormat"
      :height="280"
    />
    <div class="lc-stream-demo__bar">
      <TxButton size="sm" variant="secondary" :disabled="done" @click="toggle">
        {{ done ? copy.done : running ? copy.pause : copy.resume }}
      </TxButton>
      <span class="lc-stream-demo__view">{{ copy.view }}{{ viewText }}</span>
    </div>
  </div>
</template>

<style scoped>
.lc-stream-demo {
  width: 100%;
}

.lc-stream-demo__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.lc-stream-demo__view {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--tx-text-color-secondary);
}
</style>
