<script setup lang="ts" name="ImagePreview">
import type { TuffItem } from '@talex-touch/utils'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  item: TuffItem
  resourceUrl: string
}>()

const imageError = ref(false)
const imageLoading = ref(true)
const dimensions = ref('')
const hostRef = ref<HTMLElement | null>(null)
const imageRef = ref<HTMLImageElement | null>(null)

/**
 * The label is anchored to the picture's own bottom-left corner rather than the stage's: a
 * portrait screenshot leaves most of the 280px stage empty, and a stage-anchored badge would
 * float in that gap instead of sitting on the picture. The rendered image box is only known
 * after layout, so the corner is measured instead of derived from the flex centring.
 */
const badgeOffset = ref<{ left: number; bottom: number } | null>(null)

const imageSrc = computed(() => props.resourceUrl)

function syncBadgeOffset(): void {
  const host = hostRef.value
  const image = imageRef.value
  if (!host || !image || !dimensions.value) {
    badgeOffset.value = null
    return
  }

  const hostRect = host.getBoundingClientRect()
  const imageRect = image.getBoundingClientRect()
  if (imageRect.width <= 0 || imageRect.height <= 0) {
    badgeOffset.value = null
    return
  }

  badgeOffset.value = {
    left: Math.round(imageRect.left - hostRect.left),
    bottom: Math.round(hostRect.bottom - imageRect.bottom)
  }
}

const badgeStyle = computed(() => {
  const offset = badgeOffset.value
  if (!offset) return { display: 'none' }
  return { left: `${offset.left}px`, bottom: `${offset.bottom}px` }
})

function handleError() {
  imageError.value = true
  imageLoading.value = false
  dimensions.value = ''
  badgeOffset.value = null
}

function handleLoad(event: Event) {
  imageLoading.value = false
  const image = event.currentTarget as HTMLImageElement | null
  const width = image?.naturalWidth ?? 0
  const height = image?.naturalHeight ?? 0
  dimensions.value = width > 0 && height > 0 ? `${width} × ${height}` : ''
  syncBadgeOffset()
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (typeof ResizeObserver === 'function' && hostRef.value) {
    resizeObserver = new ResizeObserver(() => syncBadgeOffset())
    resizeObserver.observe(hostRef.value)
  }
  window.addEventListener('resize', syncBadgeOffset)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', syncBadgeOffset)
})

watch(
  () => props.resourceUrl,
  () => {
    imageError.value = false
    imageLoading.value = true
    dimensions.value = ''
    badgeOffset.value = null
  }
)
</script>

<template>
  <div ref="hostRef" class="ImagePreview">
    <div v-if="imageLoading && !imageError" class="loading-overlay">
      <div class="loading-spinner" />
    </div>
    <div v-if="imageError" class="error-state">
      <i class="i-ri-image-line error-icon" />
      <span class="error-text">Failed to load image</span>
    </div>
    <img
      v-show="!imageError"
      ref="imageRef"
      :src="imageSrc"
      :alt="t('common.imagePreviewAlt', '图片预览')"
      @error="handleError"
      @load="handleLoad"
    />
    <span v-if="dimensions" class="dimension-badge" :style="badgeStyle">{{ dimensions }}</span>
  </div>
</template>

<style lang="scss" scoped>
.ImagePreview {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
  }

  .dimension-badge {
    position: absolute;
    z-index: 1;
    padding: 1px 5px;
    border-radius: 5px;
    background-color: rgb(0 0 0 / 55%);
    color: #fff;
    font-size: 10px;
    line-height: 1.5;
    pointer-events: none;
  }

  .loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;

    .loading-spinner {
      width: 24px;
      height: 24px;
      border: 2px solid var(--tx-border-color);
      border-top: 2px solid var(--tx-color-primary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
  }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 0.5rem;
    color: var(--tx-text-color-placeholder);

    .error-icon {
      font-size: 2rem;
    }

    .error-text {
      font-size: 12px;
    }
  }
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
