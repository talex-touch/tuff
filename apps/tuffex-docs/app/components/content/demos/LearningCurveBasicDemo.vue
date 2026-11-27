<script setup lang="ts">
import type { LearningCurveRun } from '@talex-touch/tuffex/charts'
import { ChartPalette, TxChartLegendItem, TxLearningCurve } from '@talex-touch/tuffex/charts'
import { TxSlider } from '@talex-touch/tuffex/slider'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { computed, ref } from 'vue'
import { seedsOf } from './learning-curve-sample'

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? {
      steps: '环境步数',
      reward: '回合回报',
      smoothing: '平滑',
      raw: '原始值',
      band: '种子区间',
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
      smoothing: 'Smoothing',
      raw: 'Raw values',
      band: 'Seed band',
      labels: {},
    })

// Three algorithms on one task, three seeds each, logged every 5,000 steps.
const runs: LearningCurveRun[] = [
  { name: 'SAC', seeds: seedsOf({ ceiling: 3200, tau: 160_000, steps: 1_000_000, every: 5000 }, 1) },
  { name: 'TD3', seeds: seedsOf({ ceiling: 2700, tau: 240_000, steps: 1_000_000, every: 5000 }, 2) },
  { name: 'PPO', seeds: seedsOf({ ceiling: 1900, tau: 360_000, steps: 1_000_000, every: 5000 }, 3) },
]

const stepFormat = (step: number) => step.toLocaleString(locale.value, { maximumFractionDigits: 3 })
const smoothing = ref(0.6)
const showRaw = ref(true)
const showBand = ref(true)
const hidden = ref<string[]>([])
const highlighted = ref<string | null>(null)

function toggle(name: string): void {
  hidden.value = hidden.value.includes(name)
    ? hidden.value.filter(item => item !== name)
    : [...hidden.value, name]
}
</script>

<template>
  <div class="lc-basic-demo">
    <div class="lc-basic-demo__legend">
      <TxChartLegendItem
        v-for="(run, index) in runs"
        :key="run.name"
        :name="run.name"
        :color="ChartPalette.categoricalVar(index)"
        value=""
        :inactive="hidden.includes(run.name)"
        @click="toggle(run.name)"
        @pointerenter="highlighted = run.name"
        @pointerleave="highlighted = null"
      />
    </div>
    <TxLearningCurve
      v-model:hidden-runs="hidden"
      :runs="runs"
      :smoothing="smoothing"
      :show-raw="showRaw"
      :show-band="showBand"
      :highlighted-run="highlighted"
      :x-axis-name="copy.steps"
      :y-axis-name="copy.reward"
      :labels="copy.labels"
      :step-format="stepFormat"
    />
    <div class="lc-basic-demo__controls">
      <label class="lc-basic-demo__smoothing">
        <span>{{ copy.smoothing }}</span>
        <TxSlider v-model="smoothing" :min="0" :max="0.99" :step="0.01" show-value :aria-label="copy.smoothing" />
      </label>
      <TxSwitch v-model="showRaw" size="small" :label="copy.raw" />
      <TxSwitch v-model="showBand" size="small" :label="copy.band" />
    </div>
  </div>
</template>

<style scoped>
.lc-basic-demo {
  width: 100%;
}

.lc-basic-demo__legend {
  display: flex;
  gap: 16px;
  margin-bottom: 4px;
}

.lc-basic-demo__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 20px;
  margin-top: 12px;
}

.lc-basic-demo__smoothing {
  display: flex;
  flex: 1 1 220px;
  align-items: center;
  gap: 12px;
  max-width: 320px;
  font-size: 13px;
  color: var(--tx-text-color-regular);
}
</style>
