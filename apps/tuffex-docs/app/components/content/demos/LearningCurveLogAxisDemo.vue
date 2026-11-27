<script setup lang="ts">
import type { LearningCurveRun } from '@talex-touch/tuffex/charts'
import { TxLearningCurve } from '@talex-touch/tuffex/charts'
import { computed } from 'vue'
import { trainingLoss } from './learning-curve-sample'

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? {
      steps: '训练步数（对数）',
      loss: '训练损失',
      labels: {
        chart: '学习曲线',
        step: (step: string) => `第 ${step} 步`,
        raw: '原始',
        instructions: '左右方向键逐步读数，Home 和 End 跳到首尾，Escape 清除。',
        zoomInstructions: '左右方向键逐步读数，加号和减号缩放，Shift 加左右方向键平移，0 显示全部步数，Escape 清除。',
      },
    }
  : { steps: 'Training steps (log)', loss: 'Training loss', labels: {} })

const stepFormat = (step: number) => step.toLocaleString(locale.value, { maximumFractionDigits: 3 })

// A learning-rate sweep, one seed each, logged every 20 steps from step 0.
const runs: LearningCurveRun[] = [
  { name: 'lr 1e-3', data: trainingLoss({ floor: 0.9, height: 4.2, onset: 120, steps: 60_000, every: 20 }, 11) },
  { name: 'lr 3e-4', data: trainingLoss({ floor: 0.62, height: 4.4, onset: 520, steps: 60_000, every: 20 }, 12) },
]
</script>

<template>
  <TxLearningCurve
    :runs="runs"
    x-type="log"
    :x-axis-name="copy.steps"
    :y-axis-name="copy.loss"
    :labels="copy.labels"
    :step-format="stepFormat"
    :height="280"
  />
</template>
