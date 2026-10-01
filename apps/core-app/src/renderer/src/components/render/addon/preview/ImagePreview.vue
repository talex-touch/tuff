<script setup lang="ts" name="ImagePreview">
import type { TuffItem } from '@talex-touch/utils'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  item: TuffItem
  resourceUrl: string
}>()

const emit = defineEmits<{
  (event: 'dimensionsChange', dimensions: string): void
}>()

const imageError = ref(false)
const imageLoading = ref(true)

const imageSrc = computed(() => props.resourceUrl)

// A retiring image can still dispatch events while the next resource is loading.
// Trust only the element whose source matches the current resource.
function isRetiredImageEvent(event: Event): boolean {
  const image = event.currentTarget as HTMLImageElement | null
  return !image || image.getAttribute('src') !== imageSrc.value
}

function handleError(event: Event): void {
  if (isRetiredImageEvent(event)) return

  imageError.value = true
  imageLoading.value = false
  emit('dimensionsChange', '')
}

function handleLoad(event: Event): void {
  if (isRetiredImageEvent(event)) return

  imageLoading.value = false
  const image = event.currentTarget as HTMLImageElement | null
  const width = image?.naturalWidth ?? 0
  const height = image?.naturalHeight ?? 0
  emit('dimensionsChange', width > 0 && height > 0 ? `${width} × ${height}` : '')
}

watch(
  () => props.resourceUrl,
  () => {
    imageError.value = false
    imageLoading.value = true
    emit('dimensionsChange', '')
  }
)
</script>

<template>
  <div class="ImagePreview">
    <div v-if="imageLoading && !imageError" class="loading-overlay">
      <div class="loading-spinner" />
    </div>
    <div v-if="imageError" class="error-state">
      <i class="i-ri-image-line error-icon" />
      <span class="error-text">Failed to load image</span>
    </div>
    <Transition name="image-switch">
      <img
        v-if="imageSrc && !imageError"
        :key="imageSrc"
        :class="{ 'is-loading': imageLoading }"
        :src="imageSrc"
        :alt="t('common.imagePreviewAlt', '图片预览')"
        @error="handleError"
        @load="handleLoad"
      />
    </Transition>
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
    transition:
      opacity 200ms cubic-bezier(0.22, 1, 0.36, 1),
      filter 200ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .is-loading,
  .image-switch-enter-from,
  .image-switch-leave-to {
    opacity: 0;
    filter: blur(4px);
  }

  .image-switch-leave-active {
    position: absolute;
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

@media (prefers-reduced-motion: reduce) {
  .ImagePreview img {
    transition: none;
    filter: none;
  }
}
</style>
