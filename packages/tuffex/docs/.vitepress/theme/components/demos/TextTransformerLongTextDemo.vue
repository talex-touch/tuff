<script setup lang="ts">
import { ref } from 'vue'

const sizerRef = ref<any>(null)
const long = ref(false)
const duration = ref(380)
const blurPx = ref(12)

const chapterA = `Chapter A\n\nThis is a longer paragraph of text used to simulate chapter content changes.\nIt includes multiple lines so you can observe both width and height transitions.\n\n- Bullet A\n- Bullet B\n- Bullet C\n\nEnd.`

const chapterB = `Chapter B\n\nA different chapter with different length.\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit.\nSed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\n\nUt enim ad minim veniam, quis nostrud exercitation ullamco laboris.\n\nEnd.`

const text = ref(chapterA)

function toggle() {
  void sizerRef.value?.action?.(() => {
    long.value = !long.value
    text.value = long.value ? chapterB : chapterA
  })
}
</script>

<template>
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
</template>
