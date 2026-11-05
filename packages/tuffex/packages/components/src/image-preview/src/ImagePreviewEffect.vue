<script setup lang="ts">
import type { Component } from 'vue'
import type { ImagePreviewLoadingPreset } from './types'
import { onErrorCaptured, shallowRef } from 'vue'
import { useLazyComponent } from '../../../../utils/use-lazy-component'

// Internal: loaded on demand so three.js (an optional peer) stays off the static path.
defineOptions({ name: 'TxImagePreviewEffect' })

defineProps<{
  preset: ImagePreviewLoadingPreset
  reduced: boolean
}>()

const failed = shallowRef(false)
const effect = useLazyComponent<Component>(
  () => import('../../image-generation/src/TxImageGeneration.vue').then(module => module.default),
  () => {},
)

onErrorCaptured(() => {
  failed.value = true
  return false
})

effect.load()
</script>

<template>
  <component
    :is="effect.component.value"
    v-if="effect.component.value && !failed"
    class="tx-image-preview__effect"
    :preset="preset"
    theme="dark"
    :paused="reduced"
  />
  <span v-else class="tx-image-preview__shimmer" />
</template>

<style lang="scss">
.tx-image-preview__placeholder > .tx-image-preview__effect,
.tx-image-preview__shimmer {
  position: absolute;
  inset: 0;
  border-radius: inherit;
}
</style>
