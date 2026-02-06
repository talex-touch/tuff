<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const blurPx = ref('')
const duration = ref('')
const label = ref('')
const toggle = () => {}
</script>

<template>
  <div v-if="locale === 'zh'">
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
          <TxCard variant="plain" background="mask" :padding="12" :radius="14" style="max-width: 360px;">
            <div style="font-size: 13px; line-height: 1.4;">
              <TxTextTransformer
                :text="label"
                :duration-ms="duration"
                :blur-px="blurPx"
                :style="{ color: accent ? 'var(--tx-color-primary)' : 'var(--tx-text-color-primary)' }"
              />
            </div>
          </TxCard>
        </TxAutoSizer>
      </div>
  </div>
  <div v-else>
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
          <TxCard variant="plain" background="mask" :padding="12" :radius="14" style="max-width: 360px;">
            <div style="font-size: 13px; line-height: 1.4;">
              <TxTextTransformer
                :text="label"
                :duration-ms="duration"
                :blur-px="blurPx"
                :style="{ color: accent ? 'var(--tx-color-primary)' : 'var(--tx-text-color-primary)' }"
              />
            </div>
          </TxCard>
        </TxAutoSizer>
      </div>
  </div>
</template>
