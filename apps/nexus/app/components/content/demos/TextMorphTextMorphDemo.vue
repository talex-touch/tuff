<script setup lang="ts">
import { computed, ref } from 'vue'

const phrases = [
  'Hello world',
  'Hello there',
  'Goodbye there',
  'Goodbye and thanks for all the fish',
]

const index = ref(0)
const durationMs = ref(400)
const scale = ref(true)
const debug = ref(false)

const phrase = computed(() => phrases[index.value] ?? '')

function next() {
  index.value = (index.value + 1) % phrases.length
}
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 14px;">
    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
      <TxButton @click="next">
        Next phrase
      </TxButton>

      <div style="width: 220px;">
        <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
          durationMs
        </div>
        <TxSlider v-model="durationMs" :min="120" :max="1200" :step="20" :show-value="true" />
      </div>

      <TxSwitch v-model="scale" label="scale" />
      <TxSwitch v-model="debug" label="debug" />
    </div>

    <TxCard variant="plain" background="mask" :padding="16" :radius="14">
      <div style="font-size: 20px; font-weight: 600; line-height: 1.4;">
        <TxTextMorph
          :text="phrase"
          :duration-ms="durationMs"
          :scale="scale"
          :debug="debug"
        />
      </div>
    </TxCard>

    <div style="font-size: 12px; opacity: 0.65;">
      Only the characters that actually changed animate. Words that survive keep their
      elements and slide to their new position; the rest fade in from the nearest
      surviving neighbour.
    </div>
  </div>
</template>
