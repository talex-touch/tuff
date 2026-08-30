<script setup lang="ts">
import type { ChartSemanticColorName } from '@talex-touch/tuffex-charts'
import { ChartPalette } from '@talex-touch/tuffex-charts'

const semanticNames: ChartSemanticColorName[] = ['Attention', 'Warning', 'Success', 'Neutral', 'Disabled', 'Skeleton']
const sequential = ChartPalette.sequential('blues')
</script>

<template>
  <div class="chart-colors-demo">
    <div class="chart-colors-demo__group">
      <span class="chart-colors-demo__label">Categorical</span>
      <div class="chart-colors-demo__swatches">
        <span
          v-for="index in 6"
          :key="index"
          class="chart-colors-demo__swatch"
          :style="{ background: ChartPalette.categoricalVar(index - 1) }"
          :title="ChartPalette.categorical(index - 1)"
        />
      </div>
    </div>
    <div class="chart-colors-demo__group">
      <span class="chart-colors-demo__label">Semantic</span>
      <div class="chart-colors-demo__swatches">
        <span
          v-for="name in semanticNames"
          :key="name"
          class="chart-colors-demo__swatch"
          :style="{ background: `var(--tx-chart-semantic-${name.toLowerCase()}, ${ChartPalette.semantic(name)})` }"
          :title="name"
        />
      </div>
    </div>
    <div class="chart-colors-demo__group">
      <span class="chart-colors-demo__label">Sequential (blues)</span>
      <div class="chart-colors-demo__swatches">
        <span
          v-for="(color, index) in sequential"
          :key="index"
          class="chart-colors-demo__swatch"
          :style="{ background: `var(--tx-chart-sequential-blues-${index + 1}, ${color})` }"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.chart-colors-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.chart-colors-demo__group {
  display: flex;
  gap: 12px;
  align-items: center;
}

.chart-colors-demo__label {
  width: 140px;
  font-size: 12px;
  color: var(--tx-chart-text-primary, #6b7280);
}

.chart-colors-demo__swatches {
  display: flex;
  gap: 6px;
}

.chart-colors-demo__swatch {
  width: 28px;
  height: 28px;
  border-radius: 6px;
}
</style>
