<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  iconUrl?: string | null
  title: string
  alt?: string
}>(), {
  iconUrl: '',
  alt: '',
})

const imageState = ref<'unknown' | 'normal' | 'dark-monochrome'>('unknown')

const fallbackText = computed(() => props.title.trim().charAt(0).toUpperCase() || '?')
const hasIcon = computed(() => Boolean(props.iconUrl?.trim()))

watch(() => props.iconUrl, () => {
  imageState.value = 'unknown'
})

function handleImageLoad(event: Event) {
  const image = event.target
  if (!(image instanceof HTMLImageElement)) {
    imageState.value = 'normal'
    return
  }

  imageState.value = isDarkMonochromeImage(image) ? 'dark-monochrome' : 'normal'
}

function handleImageError() {
  imageState.value = 'normal'
}

function isDarkMonochromeImage(image: HTMLImageElement) {
  const naturalWidth = image.naturalWidth
  const naturalHeight = image.naturalHeight
  if (!naturalWidth || !naturalHeight)
    return false

  const sampleSize = 32
  const canvas = document.createElement('canvas')
  canvas.width = sampleSize
  canvas.height = sampleSize
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context)
    return false

  try {
    context.drawImage(image, 0, 0, sampleSize, sampleSize)
    const pixels = context.getImageData(0, 0, sampleSize, sampleSize).data
    let count = 0
    let lumaTotal = 0
    let chromaTotal = 0

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] ?? 0
      if (alpha < 24)
        continue

      const red = pixels[index] ?? 0
      const green = pixels[index + 1] ?? 0
      const blue = pixels[index + 2] ?? 0
      const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
      const channelMax = Math.max(red, green, blue)
      const channelMin = Math.min(red, green, blue)

      count += 1
      lumaTotal += luma
      chromaTotal += channelMax - channelMin
    }

    if (count < 12)
      return false

    return lumaTotal / count < 92 && chromaTotal / count < 18
  }
  catch {
    return false
  }
}
</script>

<template>
  <span
    class="DashboardAssetIcon"
    :class="{ 'is-dark-monochrome': imageState === 'dark-monochrome' }"
  >
    <img
      v-if="hasIcon"
      :src="iconUrl!"
      :alt="alt || title"
      class="DashboardAssetIcon-Image"
      loading="lazy"
      decoding="async"
      @load="handleImageLoad"
      @error="handleImageError"
    >
    <span v-else class="DashboardAssetIcon-Fallback" aria-hidden="true">
      {{ fallbackText }}
    </span>
  </span>
</template>

<style scoped>
.DashboardAssetIcon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-size: 30px;
  font-weight: 700;
  color: color-mix(in srgb, var(--tx-text-color-placeholder, #9ca3af) 92%, transparent);
}

.DashboardAssetIcon-Image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: filter 160ms ease;
}

.DashboardAssetIcon-Fallback {
  line-height: 1;
}

:global(.dark) .DashboardAssetIcon.is-dark-monochrome .DashboardAssetIcon-Image {
  filter: brightness(0) invert(1);
}
</style>
