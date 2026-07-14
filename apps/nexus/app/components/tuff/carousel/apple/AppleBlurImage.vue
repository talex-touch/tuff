<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

interface Props {
  height?: number | string
  width?: number | string
  src: string
  class?: string
  alt?: string
  fill?: boolean
  defer?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  height: undefined,
  width: undefined,
  class: '',
  alt: 'Background of a beautiful view',
  fill: false,
  defer: false,
})

const isLoading = ref(true)
const imageRef = ref<HTMLImageElement | null>(null)
const sourceReady = ref(!props.defer)
const resolvedSrc = computed(() => sourceReady.value ? props.src : undefined)
let observer: IntersectionObserver | null = null

function loadSource() {
  sourceReady.value = true
  observer?.disconnect()
  observer = null
}

function handleLoad() {
  isLoading.value = false
}

onMounted(() => {
  if (!props.defer)
    return
  if (!imageRef.value || !('IntersectionObserver' in window)) {
    loadSource()
    return
  }

  observer = new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting))
      loadSource()
  }, {
    rootMargin: '200px 0px',
  })
  observer.observe(imageRef.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <img
    ref="imageRef"
    class="transition duration-300" :class="
      [
        isLoading ? 'blur-sm' : 'blur-0',
        props.class,
        fill ? 'h-full w-full' : '',
      ]
    "
    :src="resolvedSrc"
    :width="width"
    :height="height"
    loading="lazy"
    decoding="async"
    :alt="alt"
    @load="handleLoad"
  >
</template>
