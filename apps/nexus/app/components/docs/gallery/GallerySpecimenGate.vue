<script setup lang="ts">
import { inject, onBeforeUnmount, ref } from 'vue'
import DocsGallerySpecimen from '../DocsGallerySpecimen.vue'
import { SPECIMEN_QUEUE_KEY } from './specimen-queue'

// The `<ClientOnly>` that DocsComponentsGallery binds to each cell's stage. The specimen mounts
// when the gallery's queue admits it, so a suite page does not mount every specimen in one long
// task. Until then the cell shows its own placeholder, which the stage already reserves room for.
const queue = inject(SPECIMEN_QUEUE_KEY, null)
const ready = ref(!queue)
const cancelAdmission = queue?.admit(() => {
  ready.value = true
})
onBeforeUnmount(() => cancelAdmission?.())
</script>

<template>
  <DocsGallerySpecimen v-if="ready">
    <slot />
    <template #fallback>
      <slot name="fallback" />
    </template>
  </DocsGallerySpecimen>
  <slot v-else name="fallback" />
</template>
