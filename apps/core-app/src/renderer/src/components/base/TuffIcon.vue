<script lang="ts" name="TuffIcon" setup>
import type { ITuffIcon } from '@talex-touch/utils'

const props = defineProps<{
  icon: ITuffIcon
  alt?: string
  size?: number
}>()

const loading = computed(() => props.icon.status === 'loading')
const error = computed(() => props.icon.status === 'error')

const url = computed(() => {
  if (props.icon.type === 'file') {
    return `tfile://${props.icon.value}`
  }

  return props.icon.value
})

console.log(props)
</script>

<template>
  <span
    :title="alt"
    role="img"
    class="TuffIcon"
    :class="{ 'TuffIcon-Loading': loading }"
    :style="{ fontSize: size ? `${size}px` : undefined }"
  >
    <span v-if="error" class="TuffIcon-Error">
      <i class="i-ri-image-line" />
    </span>

    <span v-else-if="loading" class="TuffIcon-Loading">
      <span class="TuffIcon-Loading-Skeleton">
        <span class="skeleton-shimmer"></span>
      </span>
    </span>

    <span v-else-if="icon.type === 'emoji'" class="emoji">
      {{ icon.value || '⚠️' }}
    </span>

    <template v-else-if="icon.type === 'url' || icon.type === 'file'">
      <img :alt="alt" :src="url" />
    </template>
  </span>
</template>

<style lang="scss" scoped>
.TuffIcon {
  position: relative;
  display: flex;

  align-items: center;
  justify-content: center;

  min-width: 1em;
  min-height: 1em;

  width: 1.2em;
  height: 1.2em;

  aspect-ratio: 1 / 1;

  .emoji {
    display: inline-block;
    font-size: 1em;
    line-height: 1;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .TuffIcon-Loading-Skeleton {
    width: 100%;
    height: 100%;
    border-radius: 4px;
    background: var(--el-color-primary-light-9);
    position: relative;
    overflow: hidden;

    .skeleton-shimmer {
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(205, 205, 205, 0.4), transparent);
      animation: shimmer 1.5s infinite;
    }
  }

  .TuffIcon-Error {
    width: 100%;
    height: 100%;
    border-radius: 4px;
    background: var(--el-fill-color-lighter);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--el-text-color-placeholder);

    i {
      font-size: 1.2rem;
    }
  }
}

@keyframes shimmer {
  0% {
    left: -100%;
  }
  100% {
    left: 100%;
  }
}
</style>
