<script setup lang="ts">
import { computed, ref } from 'vue'

const stages = ['Connecting', 'Connected', 'Syncing 12 files', 'Syncing 148 files', 'Up to date']
const index = ref(0)
const durationMs = ref(320)
const blurPx = ref(10)

const stage = computed(() => stages[index.value] ?? '')

function next() {
  index.value = (index.value + 1) % stages.length
}
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 14px;">
    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
      <TxButton @click="next">
        Next state
      </TxButton>

      <div style="width: 220px;">
        <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
          duration (ms)
        </div>
        <TxSlider v-model="durationMs" :min="120" :max="720" :step="10" :show-value="true" />
      </div>

      <div style="width: 220px;">
        <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
          blur (px) — fade only
        </div>
        <TxSlider v-model="blurPx" :min="0" :max="24" :step="1" :show-value="true" />
      </div>
    </div>

    <TxCard variant="plain" background="mask" :padding="14" :radius="14">
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; align-items: baseline; gap: 14px;">
          <code style="font-size: 11px; opacity: 0.6; min-width: 110px;">mode="morph"</code>
          <div style="font-size: 16px; font-weight: 600;">
            <TxTextTransformer :text="stage" :duration-ms="durationMs" />
          </div>
        </div>

        <div style="display: flex; align-items: baseline; gap: 14px;">
          <code style="font-size: 11px; opacity: 0.6; min-width: 110px;">mode="fade"</code>
          <div style="font-size: 16px; font-weight: 600;">
            <TxTextTransformer
              :text="stage"
              mode="fade"
              :duration-ms="durationMs"
              :blur-px="blurPx"
            />
          </div>
        </div>
      </div>
    </TxCard>

    <div style="font-size: 12px; opacity: 0.65;">
      <code>morph</code> is the default: shared words hold their position and only the
      changed characters move, and the digit count rolls by place value.
      <code>fade</code> is the original whole-string blur crossfade, and the one
      <code>blurPx</code> applies to.
    </div>
  </div>
</template>
