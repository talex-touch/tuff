<script setup lang="ts">
import type { ImagePreviewItem } from './types'
import type { PreviewSize } from './zoom'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

// The same intrinsic canvas is used on the stage, in thumbnails and in the minimap.
// Scaling a small copy, rather than reflowing its children, keeps map navigation aligned.
const props = defineProps<{
  item: ImagePreviewItem
  size?: PreviewSize
  fit?: boolean
}>()
const root = ref<HTMLElement | null>(null)
const bounds = ref({ width: 0, height: 0 })
let observer: ResizeObserver | undefined
watch(root, (element) => {
  observer?.disconnect()
  if (!element || !props.fit)
    return
  const measure = (): void => {
    const rect = element.getBoundingClientRect()
    bounds.value = { width: element.clientWidth || rect.width, height: element.clientHeight || rect.height }
  }
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)
    observer.observe(element)
  }
}, { flush: 'post' })
onBeforeUnmount(() => observer?.disconnect())

const canvasStyle = computed(() => {
  if (!props.fit || !props.size)
    return undefined
  const { width, height } = props.size
  const k = Math.min(bounds.value.width / width, bounds.value.height / height)
  return {
    width: `${width}px`,
    height: `${height}px`,
    transform: `translate(-50%, -50%) scale(${k})`,
  }
})
</script>

<template>
  <div ref="root" class="tx-image-preview__content" :class="{ 'is-fitted': fit }">
    <div class="tx-image-preview__content-canvas" :style="canvasStyle">
      <slot>
        <component :is="item.component" v-if="item.component" :item="item" :payload="item.payload" />
        <!-- Explicitly trusted markup, like v-html: the host owns sanitization. -->
        <div v-else-if="item.svg || item.raw" class="tx-image-preview__markup" v-html="item.svg || item.raw" />
        <img v-else-if="item.url || item.thumbnail" :src="item.url || item.thumbnail" :alt="item.alt ?? item.name ?? ''" draggable="false">
      </slot>
    </div>
  </div>
</template>

<style lang="scss">
.tx-image-preview__content,
.tx-image-preview__content-canvas,
.tx-image-preview__markup {
  width: 100%;
  height: 100%;
}

.tx-image-preview__content.is-fitted {
  position: relative;
  overflow: hidden;

  > .tx-image-preview__content-canvas {
    position: absolute;
    top: 50%;
    left: 50%;
    transform-origin: center;
  }
}

.tx-image-preview__markup > svg,
.tx-image-preview__content-canvas > img {
  display: block;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  object-fit: contain;
}

.tx-image-preview__markup > svg {
  max-width: none !important;
}
</style>
