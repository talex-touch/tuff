<script setup lang="ts">
import { ref } from 'vue'
import { useGalleryLoop } from './use-gallery-loop'

const props = defineProps<{
  states: [string, string]
}>()

const presets = ['fade', 'slide-fade', 'rebound'] as const

// The three presets swap the same content side by side, so the difference
// between them is the only thing that varies. Each lane holds a fixed box:
// `out-in` empties the wrapper between the two states, and a lane sized by
// its content collapsed and dragged the caption up with it.
const flipped = ref(false)
useGalleryLoop(() => (flipped.value = !flipped.value), 1800, 1200)
</script>

<template>
  <div class="docs-gallery__row docs-gallery__row--loose">
    <div v-for="preset in presets" :key="preset" class="docs-gallery__meter">
      <TxTransition :preset="preset" :duration="320" class="docs-gallery__lane">
        <div :key="flipped ? 'b' : 'a'" class="docs-gallery__tile docs-gallery__lane-tile">
          <span class="docs-gallery__lane-dot" :class="flipped ? 'is-busy' : 'is-ok'" aria-hidden="true" />
          {{ flipped ? props.states[1] : props.states[0] }}
        </div>
      </TxTransition>
      <span class="docs-gallery__meter-text">{{ preset }}</span>
    </div>
  </div>
</template>
