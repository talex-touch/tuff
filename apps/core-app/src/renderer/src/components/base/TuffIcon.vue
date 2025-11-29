<script lang="ts" name="TuffIcon" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import { useSvgContent } from '~/modules/hooks/useSvgContent'

const props = defineProps<{
  icon: ITuffIcon
  alt?: string
  size?: number
  empty?: string
  /** Preserve the original color of the svg icon */
  colorful?: boolean
}>()

const loading = computed(() => props.icon.status === 'loading')
const error = computed(() => props.icon.status === 'error')

const addressable = computed(() => props.icon.type === 'url' || props.icon.type === 'file')

const url = computed(() => {
  if (props.icon.type === 'file') {
    const targetPath = `tfile://${props.icon.value}`
    // console.log('fileable', props, props.icon.value, '=', targetPath)
    // File paths are absolute (e.g., "/Users/..."), so tfile://${path} gives tfile:///Users/...
    return targetPath
  }

  if (props.icon.type === 'url') {
    const urlPath = props.icon.value
    if (urlPath.startsWith('/')) {
      return `tfile://${urlPath}`
    }
  }

  return props.icon.value
})

const {
  content: svgContent,
  // loading: svgLoading,
  // error: svgError,
  fetchSvgContent,
  setUrl
} = useSvgContent()

const isSvg = computed(() => url.value?.endsWith('.svg'))

const dataurl = computed(() => {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgContent.value ?? '')}`
})

watch(
  () => isSvg.value,
  (newIsSvg) => {
    if (newIsSvg) {
      setUrl(url.value)
      fetchSvgContent()
    }
  },
  { immediate: true }
)
</script>

<template>
  <span
    :title="alt"
    role="img"
    class="TuffIcon"
    :data-icon-type="icon.type"
    :data-icon-value="icon.value"
    :class="{ 'TuffIcon-Loading': loading }"
    :style="{ fontSize: size ? `${size}px` : undefined }"
  >
    <span v-if="!icon?.value" class="TuffIcon-Empty">
      <slot name="empty">
        <img v-if="empty" :alt="alt" :src="empty" />
      </slot>
    </span>

    <span v-else-if="error" class="TuffIcon-Error">
      <i class="i-ri-image-line" />
    </span>

    <span v-else-if="loading" class="TuffIcon-Loading">
      <span class="TuffIcon-Loading-Skeleton">
        <span class="skeleton-shimmer" />
      </span>
    </span>

    <span v-else-if="icon.type === 'emoji'" class="emoji">
      {{ icon.value || '⚠️' }}
    </span>

    <span v-else-if="icon.type === 'class'" class="class flex">
      <i :class="icon.value" />
    </span>

    <template v-else-if="addressable">
      <template v-if="isSvg && colorful">
        <i class="TuffIcon-Svg colorful" :alt="alt" :style="{ '--un-icon': `url('${dataurl}')` }" />
      </template>
      <template v-else>
        <img :alt="alt" :src="url" />
      </template>
    </template>
  </span>
</template>

<style lang="scss" scoped>
.TuffIcon-Svg {
  -webkit-mask: var(--un-icon) no-repeat;
  mask: var(--un-icon) no-repeat;
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  background-color: currentColor;
  color: inherit;
  width: 1em;
  height: 1em;
}

.TuffIcon-Svg.colorful {
  color: var(--icon-color, unset);
  background-color: var(--icon-color, unset);
}

.TuffIcon {
  position: relative;
  display: flex;

  align-items: center;
  justify-content: center;

  min-width: 1em;
  min-height: 1em;

  width: 1em;
  height: 1em;

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
