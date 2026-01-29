<script setup lang="ts">
import { ref } from 'vue'

const text = ref('Hello')
const duration = ref(320)
const blurPx = ref(10)
const accent = ref(false)
const sizerRef = ref<any>(null)

function toggle() {
  void sizerRef.value?.action?.(() => {
    text.value = text.value === 'Hello'
      ? 'Goodbye (blur + fade) - a longer title that will be clipped while resizing'
      : 'Hello'
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

      <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
        <div style="width: 220px;">
          <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
            duration (ms)
          </div>
          <TxSlider v-model="duration" :min="120" :max="720" :step="10" :show-value="true" />
        </div>

        <div style="width: 220px;">
          <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
            blur (px)
          </div>
          <TxSlider v-model="blurPx" :min="0" :max="24" :step="1" :show-value="true" />
        </div>
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
        <div style="font-size: 14px; font-weight: 600; line-height: 1.4;">
          <TxTextTransformer
            :text="text"
            :duration-ms="duration"
            :blur-px="blurPx"
            :style="{ color: accent ? 'var(--tx-color-primary)' : 'var(--tx-text-color-primary)' }"
          />
        </div>
        <div style="font-size: 12px; opacity: 0.75; margin-top: 6px;">
          text: {{ text }}
        </div>
      </TxCard>
    </TxAutoSizer>
  </div>
</template>
