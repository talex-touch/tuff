<script setup lang="ts">
import { ref } from 'vue'

const sizerRef = ref<any>(null)
const duration = ref(280)
const blurPx = ref(10)

const mode = ref<'ok' | 'warn' | 'err'>('ok')

const label = () => {
  if (mode.value === 'ok') return 'Synced'
  if (mode.value === 'warn') return 'Syncing (may take a while)'
  return 'Failed: Network error'
}

const color = () => {
  if (mode.value === 'ok') return 'var(--tx-color-success)'
  if (mode.value === 'warn') return 'var(--tx-color-warning)'
  return 'var(--tx-color-danger)'
}

function toggle() {
  void sizerRef.value?.action?.(() => {
    mode.value = mode.value === 'ok' ? 'warn' : mode.value === 'warn' ? 'err' : 'ok'
  })
}
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
      <TxButton @click="toggle">Toggle</TxButton>
      <div style="width: 220px;">
        <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">duration (ms)</div>
        <TxSlider v-model="duration" :min="120" :max="600" :step="10" :show-value="true" />
      </div>
      <div style="width: 220px;">
        <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">blur (px)</div>
        <TxSlider v-model="blurPx" :min="0" :max="24" :step="1" :show-value="true" />
      </div>
    </div>

    <TxAutoSizer
      ref="sizerRef"
      :width="true"
      :height="true"
      :inline="true"
      :duration-ms="duration"
      easing="cubic-bezier(0.2, 0, 0, 1)"
      outer-class="overflow-hidden"
    >
      <TxCard variant="plain" background="mask" :padding="12" :radius="14">
        <div style="display: inline-flex; align-items: center; gap: 10px;">
          <div
            style="width: 8px; height: 8px; border-radius: 99px;"
            :style="{ background: color() }"
          ></div>
          <TxTextTransformer
            :text="label()"
            :duration-ms="duration"
            :blur-px="blurPx"
            :style="{ color: color() }"
          />
        </div>
      </TxCard>
    </TxAutoSizer>
  </div>
</template>
