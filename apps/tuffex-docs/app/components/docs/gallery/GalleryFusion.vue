<script setup lang="ts">
import { ref } from 'vue'
import { useGalleryLoop } from './use-gallery-loop'

// The effect is the neck the two shapes grow while they travel together, so
// the specimen fuses and parts on its own. It used to wait for a hover over
// two 32px buttons, which the goo threshold erased entirely: at σ 19 a 32px
// disc blurs to a peak alpha of 0.30, under the 0.345 the matrix needs.
const fused = ref(false)
useGalleryLoop(() => (fused.value = !fused.value), 1700, 900)
</script>

<template>
  <TxFusion
    :model-value="fused"
    trigger="manual"
    :gap="72"
    :duration="640"
    :blur="10"
    :alpha="18"
    :alpha-offset="-7"
  >
    <template #a>
      <span class="docs-gallery__blob docs-gallery__blob--a" />
    </template>
    <template #b>
      <span class="docs-gallery__blob docs-gallery__blob--b" />
    </template>
  </TxFusion>
</template>
