<script setup lang="ts">
import { computed, ref } from 'vue'

type Palette = 'spectrum' | 'accent'
type Placement = 'bottom' | 'top'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const active = ref(true)
const palette = ref<Palette>('spectrum')
const placement = ref<Placement>('bottom')
const intensity = ref(1)
const duration = ref(6)

// The controls are named after the props they drive, so only the card copy is translated.
const copy = computed(() => zh.value
  ? { title: '正在生成画布', body: '根据提示词生成 3 个图层' }
  : { title: 'Generating canvas', body: 'Building 3 layers from your prompt' })
</script>

<template>
  <div class="prism-showcase not-prose">
    <!-- The root is the card: the light paints over its background and under the text.
         The text moves to the edge the light is not rising from. -->
    <TxPrismGlow
      class="prism-showcase__card"
      :class="{ 'is-light-top': placement === 'top' }"
      :active="active"
      :palette="palette"
      :placement="placement"
      :intensity="intensity"
      :duration="duration"
    >
      <span class="prism-showcase__title">{{ copy.title }}</span>
      <span class="prism-showcase__body">{{ copy.body }}</span>
    </TxPrismGlow>

    <div class="prism-showcase__controls">
      <span class="prism-showcase__name">active</span>
      <div class="prism-showcase__control">
        <TxSwitch v-model="active" aria-label="active" />
      </div>

      <span class="prism-showcase__name">palette</span>
      <div class="prism-showcase__control">
        <TxFlatRadio v-model="palette" size="sm" aria-label="palette">
          <TxFlatRadioItem value="spectrum" label="spectrum" />
          <TxFlatRadioItem value="accent" label="accent" />
        </TxFlatRadio>
      </div>

      <span class="prism-showcase__name">placement</span>
      <div class="prism-showcase__control">
        <TxFlatRadio v-model="placement" size="sm" aria-label="placement">
          <TxFlatRadioItem value="bottom" label="bottom" />
          <TxFlatRadioItem value="top" label="top" />
        </TxFlatRadio>
      </div>

      <span class="prism-showcase__name">intensity <span class="prism-showcase__value">{{ intensity.toFixed(2) }}</span></span>
      <TxSlider v-model="intensity" :min="0" :max="1" :step="0.05" aria-label="intensity" />

      <span class="prism-showcase__name">duration <span class="prism-showcase__value">{{ duration }}s</span></span>
      <TxSlider v-model="duration" :min="2" :max="12" :step="0.5" aria-label="duration" />
    </div>
  </div>
</template>

<style scoped>
.prism-showcase {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
}

.prism-showcase__card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 200px;
  padding: 18px 20px;
  border-radius: 16px;
  background: var(--tx-bg-color-overlay, #fff);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
}

.prism-showcase__card.is-light-top {
  justify-content: flex-end;
}

.prism-showcase__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--tx-text-color-primary, #303133);
}

.prism-showcase__body {
  font-size: 13px;
  color: var(--tx-text-color-regular, #606266);
}

.prism-showcase__controls {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: center;
  gap: 12px 16px;
}

.prism-showcase__name {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--tx-text-color-regular, #606266);
}

.prism-showcase__value {
  margin-left: 4px;
  color: var(--tx-text-color-secondary, #909399);
  font-variant-numeric: tabular-nums;
}

.prism-showcase__control {
  display: flex;
  align-items: center;
}
</style>
