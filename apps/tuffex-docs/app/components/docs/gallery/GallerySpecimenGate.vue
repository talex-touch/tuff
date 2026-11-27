<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import DocsGallerySpecimen from '../DocsGallerySpecimen.vue'
import { SPECIMEN_QUEUE_KEY, SPECIMEN_VISIBLE_KEY } from './specimen-queue'

const emit = defineEmits<{
  (e: 'visibility-change', visible: boolean): void
}>()

// Viewport-gated specimen boundary bound as `ClientOnly` inside each suite.
// Registers its wrapper element with the gallery's single shared IntersectionObserver
// so offscreen specimens stay as lightweight placeholders (preserving stage min-height)
// until within 320px of the viewport, and exposes reactive visibility so continuous
// loops/RAF pause automatically when scrolled away or when the tab is hidden.
const queue = inject(SPECIMEN_QUEUE_KEY, null)
const gateEl = ref<HTMLElement | null>(null)
const ready = ref(!queue)
const intersecting = ref(!queue)

const isVisible = computed(() =>
  ready.value && intersecting.value && !(queue?.documentHidden.value ?? false),
)

provide(SPECIMEN_VISIBLE_KEY, isVisible)

watch(isVisible, (visible) => {
  if (import.meta.client)
    emit('visibility-change', visible)
})

let stopObserve: (() => void) | null = null

onMounted(() => {
  if (!queue) {
    ready.value = true
    intersecting.value = true
    emit('visibility-change', isVisible.value)
    return
  }

  const el = gateEl.value
  if (!el) {
    stopObserve = queue.admit(() => {
      intersecting.value = true
      ready.value = true
    })
    return
  }

  stopObserve = queue.observe(el, {
    onAdmit: () => {
      ready.value = true
    },
    onVisibilityChange: (next) => {
      intersecting.value = next
    },
  })
})

onBeforeUnmount(() => {
  stopObserve?.()
  stopObserve = null
})
</script>

<template>
  <div ref="gateEl" class="docs-gallery__gate">
    <DocsGallerySpecimen v-if="ready">
      <slot />
      <template #fallback>
        <slot name="fallback" />
      </template>
    </DocsGallerySpecimen>
    <slot v-else name="fallback" />
  </div>
</template>
