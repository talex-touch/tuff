<script setup lang="ts">
import type { LearningCurveRun } from '@talex-touch/tuffex/charts/src/learning-curve'
import { TxLearningCurve } from '@talex-touch/tuffex/charts/src/learning-curve'
import { computed } from 'vue'
import { seedsOf } from '../../content/demos/learning-curve-sample'

const { locale } = useI18n()
const labels = computed(() => locale.value === 'zh'
  ? {
      chart: '学习曲线',
      step: (step: string) => `第 ${step} 步`,
      raw: '原始',
      instructions: '左右方向键逐步读数，Home 和 End 跳到首尾，Escape 清除。',
      zoomInstructions: '左右方向键逐步读数，加号和减号缩放，Shift 加左右方向键平移，0 显示全部步数，Escape 清除。',
    }
  : {})

const stepFormat = (step: number) => step.toLocaleString(locale.value, { maximumFractionDigits: 3 })

// Two algorithms on one task, three seeds each, logged every 10,000 steps.
const runs: LearningCurveRun[] = [
  { name: 'SAC', seeds: seedsOf({ ceiling: 3200, tau: 160_000, steps: 1_000_000, every: 10_000 }, 1) },
  { name: 'PPO', seeds: seedsOf({ ceiling: 1900, tau: 360_000, steps: 1_000_000, every: 10_000 }, 3) },
]
</script>

<template>
  <div class="docs-gallery__block">
    <TxLearningCurve :runs="runs" :smoothing="0.8" :labels="labels" :step-format="stepFormat" :height="150" />
  </div>
</template>
