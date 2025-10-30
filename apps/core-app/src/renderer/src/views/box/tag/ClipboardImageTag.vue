<script name="ClipboardImageTag" setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  data: any // clipboard data
}>()

// Parse images - content can be single data URL or array
const images = computed(() => {
  if (!props.data?.content) return []

  // If content is array (multiple images)
  if (Array.isArray(props.data.content)) {
    return props.data.content
  }

  // Single image
  return [props.data.content]
})

const imageCount = computed(() => images.value.length)
const displayImages = computed(() => images.value.slice(0, 3)) // Show max 3 images

// Calculate stack width based on number of images
const stackWidth = computed(() => {
  const count = Math.min(displayImages.value.length, 3)
  return 40 + (count - 1) * 12 // 40px base + 12px offset per additional image
})
</script>

<template>
  <div class="ClipboardImageTag">
    <div class="image-stack" :style="{ width: stackWidth + 'px' }">
      <img
        v-for="(img, index) in displayImages"
        :key="index"
        :src="data.thumbnail || img"
        :style="{
          zIndex: displayImages.length - index,
          transform: `translateX(${index * 12}px) rotate(${(index - 1) * 3}deg)`,
          left: 0
        }"
        class="preview-image"
        alt="clipboard image"
      />
    </div>
    <span class="label">{{ imageCount > 1 ? `${imageCount} 张图像` : '图像' }}</span>
  </div>
</template>

<style lang="scss" scoped>
.ClipboardImageTag {
  position: relative;
  display: flex;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  align-items: center;
  border-radius: 8px;
  background: var(--el-fill-color-light);

  .image-stack {
    position: relative;
    display: flex;
    align-items: center;
    height: 40px;
    min-width: 40px;
  }

  .preview-image {
    position: absolute;
    left: 0;
    height: 40px;
    width: 40px;
    object-fit: cover;
    border-radius: 6px;
    border: 2px solid var(--el-bg-color);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    transition: transform 0.2s ease;

    &:hover {
      transform: translateY(-2px) !important;
      z-index: 10 !important;
    }
  }

  .label {
    font-size: 14px;
    color: var(--el-text-color);
    white-space: nowrap;
    padding-left: 0.25rem;
  }
}
</style>

