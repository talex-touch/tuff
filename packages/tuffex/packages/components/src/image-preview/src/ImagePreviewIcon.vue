<script setup lang="ts">
// Internal: an icon of TxImagePreview, drawn in strokes of the text's colour (see icons). Not exported.
defineOptions({ name: 'TxImagePreviewIcon' })

defineProps<{
  /** Its strokes, one path each. */
  paths: readonly string[]
}>()
</script>

<template>
  <svg class="tx-image-preview__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-for="d in paths" :key="d" :d="d" />
  </svg>
</template>

<style lang="scss">
.tx-image-preview__icon {
  position: relative;
  z-index: 2;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
}
</style>
