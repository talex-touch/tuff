<script setup lang="ts" name="ImagePreview">
import type { TuffItem } from '@talex-touch/utils'
import { computed, ref } from 'vue'
import { buildTfileUrl } from '~/utils/tfile-url'

const props = defineProps<{
  item: TuffItem
}>()

const imageError = ref(false)
const imageLoading = ref(true)

const imageSrc = computed(() => buildTfileUrl(props.item.meta?.file?.path ?? ''))

function handleError() {
  imageError.value = true
  imageLoading.value = false
}

function handleLoad() {
  imageLoading.value = false
}
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
    <img v-show="!imageError" :src="imageSrc" @error="handleError" @load="handleLoad" />
  </div>
</template>

<style lang="scss" scoped>
.ImagePreview {
  width: 100%;
  height: 100%;
  position: relative;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
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
      border: 2px solid var(--el-border-color);
      border-top: 2px solid var(--el-color-primary);
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
    color: var(--el-text-color-placeholder);

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
