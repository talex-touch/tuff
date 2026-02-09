<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const blurPx = ref('')
const duration = ref('')
const text = ref('')
const toggle = () => {}
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <TxButton @click="toggle">
            Toggle chapter
          </TxButton>

          <div style="width: 220px;">
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              duration (ms)
            </div>
            <TxSlider v-model="duration" :min="180" :max="900" :step="10" :show-value="true" />
          </div>

          <div style="width: 220px;">
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              blur (px)
            </div>
            <TxSlider v-model="blurPx" :min="0" :max="28" :step="1" :show-value="true" />
          </div>
        </div>

        <TxAutoSizer
          ref="sizerRef"
          :width="true"
          :height="true"
          :duration-ms="duration"
          easing="cubic-bezier(0.2, 0, 0, 1)"
          outer-class="overflow-hidden"
          style="max-width: 720px;"
        >
          <TxCard variant="plain" background="mask" :padding="14" :radius="14">
            <div style="font-size: 13px; line-height: 1.6; max-width: 640px;">
              <TxTextTransformer :text="text" :duration-ms="duration" :blur-px="blurPx" wrap />
            </div>
          </TxCard>
        </TxAutoSizer>

        <div style="font-size: 12px; opacity: 0.65;">
          Tip: this component is designed for occasional transitions. Avoid using it for high-frequency real-time updates.
        </div>
      </div>
  </div>
  <div v-else>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <TxButton @click="toggle">
            Toggle chapter
          </TxButton>

          <div style="width: 220px;">
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              duration (ms)
            </div>
            <TxSlider v-model="duration" :min="180" :max="900" :step="10" :show-value="true" />
          </div>

          <div style="width: 220px;">
            <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
              blur (px)
            </div>
            <TxSlider v-model="blurPx" :min="0" :max="28" :step="1" :show-value="true" />
          </div>
        </div>

        <TxAutoSizer
          ref="sizerRef"
          :width="true"
          :height="true"
          :duration-ms="duration"
          easing="cubic-bezier(0.2, 0, 0, 1)"
          outer-class="overflow-hidden"
          style="max-width: 720px;"
        >
          <TxCard variant="plain" background="mask" :padding="14" :radius="14">
            <div style="font-size: 13px; line-height: 1.6; max-width: 640px;">
              <TxTextTransformer :text="text" :duration-ms="duration" :blur-px="blurPx" wrap />
            </div>
          </TxCard>
        </TxAutoSizer>

        <div style="font-size: 12px; opacity: 0.65;">
          Tip: this component is designed for occasional transitions. Avoid using it for high-frequency real-time updates.
        </div>
      </div>
  </div>
</template>
