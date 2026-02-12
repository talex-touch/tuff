<script lang="ts" name="TuffIcon" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useSvgContent } from '~/modules/hooks/useSvgContent'
import { buildTfileUrl } from '~/utils/tfile-url'

const props = defineProps<{
  icon?: ITuffIcon | null
  alt?: string
  size?: number
  empty?: string
  /** Preserve the original color of the svg icon */
  colorful?: boolean
}>()

const safeIcon = computed<ITuffIcon>(() => {
  return (props.icon ?? { type: 'emoji', value: '' }) as ITuffIcon
})

const isElectron = isElectronRenderer()

const loading = computed(() => safeIcon.value.status === 'loading')
const unsupported = computed(() => {
  if (isElectron) return false
  if (safeIcon.value.type === 'file') return true
  if (safeIcon.value.type === 'url' && safeIcon.value.value?.startsWith('tfile:')) return true
  return false
})
const error = computed(() => safeIcon.value.status === 'error' || unsupported.value)

const addressable = computed(() => safeIcon.value.type === 'url' || safeIcon.value.type === 'file')

const url = computed(() => {
  if (safeIcon.value.type === 'file') {
    if (!isElectron) {
      return ''
    }
    return buildTfileUrl(safeIcon.value.value)
  }

  if (safeIcon.value.type === 'url') {
    let urlPath = safeIcon.value.value
    if (urlPath.startsWith('i-/api/')) {
      urlPath = urlPath.slice(2) // => '/api/...'
    }
    // Only use tfile:// for local file paths (absolute paths starting with /)
    // but NOT for API paths like /api/... which should be HTTP URLs
    if (isElectron && urlPath.startsWith('/') && !urlPath.startsWith('/api/')) {
      return buildTfileUrl(urlPath)
    }
    if (!isElectron && urlPath.startsWith('tfile:')) {
      return ''
    }
    return urlPath
  }

  return safeIcon.value.value
})

const {
  content: svgContent,
  resolvedUrl: svgResolvedUrl,
  loading: svgLoading,
  error: svgError,
  setUrl
} = useSvgContent()

const effectiveUrl = computed(() => svgResolvedUrl.value || url.value)
const isSvg = computed(() => url.value?.endsWith('.svg'))

// Track runtime image load failures (e.g. tfile:// 404, broken path)
const imgError = ref(false)

// Combine icon status error with SVG fetch error and runtime img error
const combinedError = computed(() => error.value || !!svgError.value || imgError.value)
const combinedLoading = computed(() => loading.value || svgLoading.value)

const dataurl = computed(() => {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgContent.value ?? '')}`
})

watch(
  () => url.value,
  (nextUrl) => {
    imgError.value = false
    if (nextUrl && nextUrl.endsWith('.svg')) {
      setUrl(nextUrl)
      return
    }
    setUrl('')
  },
  { immediate: true }
)
</script>

<template>
  <span
    :title="alt"
    role="img"
    class="TuffIcon"
    :data-icon-type="safeIcon.type"
    :data-icon-value="safeIcon.value"
    :class="{ 'TuffIcon-Loading': combinedLoading }"
    :style="{ fontSize: size ? `${size}px` : undefined }"
  >
    <span v-if="!safeIcon?.value" class="TuffIcon-Empty">
      <slot name="empty">
        <img v-if="empty" :alt="alt" :src="empty" />
      </slot>
    </span>

    <span v-else-if="combinedError" class="TuffIcon-Error">
      <i class="i-ri-image-line" />
    </span>

    <span v-else-if="combinedLoading" class="TuffIcon-Loading">
      <span class="TuffIcon-Loading-Skeleton">
        <span class="skeleton-shimmer" />
      </span>
    </span>

    <span v-else-if="safeIcon.type === 'emoji'" class="emoji">
      {{ safeIcon.value || '⚠️' }}
    </span>

    <span v-else-if="safeIcon.type === 'class'" class="class">
      <i :class="safeIcon.value" />
    </span>

    <template v-else-if="addressable && effectiveUrl && !combinedError && !combinedLoading">
      <template v-if="isSvg && colorful && svgContent">
        <i class="TuffIcon-Svg colorful" :alt="alt" :style="{ '--un-icon': `url('${dataurl}')` }" />
      </template>
      <template v-else-if="!isSvg || !colorful">
        <img :alt="alt" :src="effectiveUrl" @error="imgError = true" />
      </template>
    </template>

    <!-- Fallback: if icon type is unknown or invalid, show error state -->
    <span v-else class="TuffIcon-Error">
      <i class="i-ri-image-line" />
    </span>
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
  color: var(--icon-color, currentColor);
  background-color: var(--icon-color, currentColor);
}

.TuffIcon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  min-width: 1em;
  min-height: 1em;
  max-width: 1em;
  max-height: 1em;

  width: 1em;
  height: 1em;

  aspect-ratio: 1 / 1;
  overflow: hidden;

  .emoji {
    display: inline-block;
    font-size: 1em;
    line-height: 1;
  }

  .class {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;

    i {
      font-size: 1em;
      line-height: 1;
      display: block;
    }
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
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
