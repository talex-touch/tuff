<script setup lang="ts">
import { ref } from 'vue'

const sizerRef = ref<any>(null)
const duration = ref(320)
const blurPx = ref(10)
const accent = ref(false)

const title = ref('Daily Report')
const subtitle = ref('Short summary.')

function toggle() {
  void sizerRef.value?.action?.(() => {
    if (title.value === 'Daily Report') {
      title.value = 'Weekly Report (Longer Title)'
      subtitle.value = 'A longer subtitle that spans multiple words.'
    }
    else {
      title.value = 'Daily Report'
      subtitle.value = 'Short summary.'
    }
    accent.value = !accent.value
  })
}
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
      <TxButton @click="toggle">
        Toggle
      </TxButton>
      <div style="width: 220px;">
        <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
          duration (ms)
        </div>
        <TxSlider v-model="duration" :min="160" :max="720" :step="10" :show-value="true" />
      </div>
      <div style="width: 220px;">
        <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
          blur (px)
        </div>
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
      <TxCard variant="plain" background="mask" :padding="14" :radius="14" style="max-width: 420px;">
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="font-size: 14px; font-weight: 700; line-height: 1.3;">
            <TxTextTransformer
              :text="title"
              :duration-ms="duration"
              :blur-px="blurPx"
              :style="{ color: accent ? 'var(--tx-color-primary)' : 'var(--tx-text-color-primary)' }"
            />
          </div>
          <div style="font-size: 12px; opacity: 0.8; line-height: 1.4;">
            <TxTextTransformer
              :text="subtitle"
              :duration-ms="duration"
              :blur-px="blurPx"
              :style="{ color: accent ? 'var(--tx-color-primary)' : 'var(--tx-text-color-secondary)' }"
            />
          </div>
        </div>
      </TxCard>
    </TxAutoSizer>
  </div>
</template>
