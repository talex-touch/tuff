<script lang="ts" setup>
import type { TxIconConfig, TxIconSource } from './types'
import { computed, inject, ref, watch } from 'vue'
import { shouldRenderSvgAsMask } from './svg-color-mode'
import { TX_ICON_CONFIG_KEY } from './types'

defineOptions({
  name: 'TuffIcon',
})

const props = withDefaults(
  defineProps<{
    icon?: TxIconSource | null
    name?: string
    alt?: string
    size?: number
    empty?: string
    /** Preserve the original color of the svg icon (default: false = use currentColor mask) */
    colorful?: boolean
    /** Override injected URL resolver for this instance */
    urlResolver?: TxIconConfig['urlResolver']
    /** Override injected SVG fetcher for this instance */
    svgFetcher?: TxIconConfig['svgFetcher']
  }>(),
  {
    icon: null,
    name: '',
    alt: '',
    size: undefined,
    empty: '',
    colorful: false,
    urlResolver: undefined,
    svgFetcher: undefined,
  },
)

const injectedConfig = inject(TX_ICON_CONFIG_KEY, {})

const urlResolver = computed(() => props.urlResolver ?? injectedConfig.urlResolver)
const svgFetcher = computed(() => props.svgFetcher ?? injectedConfig.svgFetcher)
const fileProtocol = computed(() => injectedConfig.fileProtocol ?? '')

const builtinIcons = {
  'chevron-down': {
    viewBox: '0 0 24 24',
    path: 'M12 15.0006L7.75732 10.758L9.17154 9.34375L12 12.1722L14.8284 9.34375L16.2426 10.758L12 15.0006Z',
  },
  'close': {
    viewBox: '0 0 24 24',
    path: 'M12 10.586l4.95-4.95 1.414 1.414-4.95 4.95 4.95 4.95-1.414 1.414-4.95-4.95-4.95 4.95-1.414-1.414 4.95-4.95-4.95-4.95L7.05 5.636z',
  },
  'search': {
    viewBox: '0 0 24 24',
    path: 'M10 2a8 8 0 105.293 14.293l4.707 4.707 1.414-1.414-4.707-4.707A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z',
  },
  'user': {
    viewBox: '0 0 24 24',
    path: 'M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5z',
  },
  'star': {
    viewBox: '0 0 24 24',
    path: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z',
  },
  'star-half': {
    viewBox: '0 0 24 24',
    path: 'M12 2v15.77L6.08 21l1.82-7.03L2 9.24l7.19-.62L12 2z',
  },
} as const

const safeIcon = computed<TxIconSource>(() => {
  if (props.icon)
    return props.icon as TxIconSource

  const name = (props.name ?? '').trim()
  if (!name)
    return { type: 'emoji', value: '' }

  if (name.startsWith('i-'))
    return { type: 'class', value: name }

  if (name in builtinIcons)
    return { type: 'builtin', value: name }

  return { type: 'class', value: name }
})

const isLoading = computed(() => safeIcon.value.status === 'loading')
const isError = computed(() => safeIcon.value.status === 'error')
const iconColor = computed(() => safeIcon.value.color || 'var(--icon-color, currentColor)')

const isAddressable = computed(() => safeIcon.value.type === 'url' || safeIcon.value.type === 'file')

const resolvedUrl = computed(() => {
  const icon = safeIcon.value
  const rawValue = icon.value

  if (!isAddressable.value || !rawValue)
    return rawValue

  // Use custom resolver if provided
  if (urlResolver.value) {
    return urlResolver.value(rawValue, icon.type as 'url' | 'file')
  }

  // Default resolution: add file protocol for'file' type
  if (icon.type === 'file' && fileProtocol.value) {
    return `${fileProtocol.value}${rawValue}`
  }

  // For 'url' type with absolute local paths (not API paths)
  if (icon.type === 'url' && rawValue.startsWith('/') && !rawValue.startsWith('/api/') && fileProtocol.value) {
    return `${fileProtocol.value}${rawValue}`
  }

  return rawValue
})

function isSvgSource(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized)
    return false
  if (normalized.startsWith('data:image/svg+xml'))
    return true

  let decoded = normalized
  try {
    decoded = decodeURIComponent(normalized)
  }
  catch {}

  const [path] = decoded.split(/[?#]/)
  return path?.endsWith('.svg') ?? false
}

const isSvg = computed(() => {
  const v = resolvedUrl.value
  return typeof v === 'string' && isSvgSource(v)
})

const svgContent = ref<string>('')

// colorful logic aligned with core-app:
// colorful=true -> render as <img> (preserve original colors)
// colorful=false -> render monochrome SVGs as mask (use currentColor)
const shouldPreserveColor = computed(() => props.colorful || safeIcon.value.colorful === true)
const shouldInspectSvgColor = computed(() => isSvg.value && !shouldPreserveColor.value)
const shouldUseMask = computed(
  () => shouldInspectSvgColor.value && shouldRenderSvgAsMask(svgContent.value),
)

const builtin = computed(() => {
  if (safeIcon.value.type !== 'builtin')
    return null
  return (builtinIcons as any)[safeIcon.value.value] ?? null
})

function encodeSvgDataUrlContent(content: string): string {
  return encodeURIComponent(content).replace(/'/g, '%27')
}

const svgDataUrl = computed(() => {
  return `data:image/svg+xml;utf8,${encodeSvgDataUrlContent(svgContent.value ?? '')}`
})

function decodeSvgDataUrl(url: string): string | null {
  const match = /^data:image\/svg\+xml(?:;[^,]*)?,(.*)$/i.exec(url)
  if (!match?.[1])
    return null

  try {
    if (/^data:image\/svg\+xml(?:;[^,]*)?;base64,/i.test(url))
      return atob(match[1])
    return decodeURIComponent(match[1])
  }
  catch {
    return match[1]
  }
}

async function fetchSvg(url: string) {
  const dataSvg = decodeSvgDataUrl(url)
  if (dataSvg !== null) {
    svgContent.value = dataSvg
    return
  }

  if (!svgFetcher.value) {
    svgContent.value = ''
    return
  }

  try {
    svgContent.value = await svgFetcher.value(url)
  }
  catch {
    svgContent.value = ''
  }
}

watch(
  () => ({
    url: resolvedUrl.value,
    shouldInspectSvgColor: shouldInspectSvgColor.value,
    type: safeIcon.value.type,
  }),
  (v) => {
    // Fetch SVG content only when theme-color mode may need a mask.
    if (isAddressable.value && v.shouldInspectSvgColor && v.url) {
      fetchSvg(v.url)
      return
    }
    svgContent.value = ''
  },
  { immediate: true },
)
</script>

<template>
  <span
    class="tuff-icon"
    :title="alt"
    role="img"
    :data-icon-type="safeIcon.type"
    :data-icon-value="safeIcon.value"
    :style="{ fontSize: size ? `${size}px` : undefined, color: iconColor }"
  >
    <span v-if="!safeIcon.value" class="tuff-icon__empty"><slot name="empty">
      <img v-if="empty" :alt="alt" :src="empty">
    </slot>
    </span>

    <span v-else-if="isError" class="tuff-icon__error">
      <i class="i-ri-image-line" />
    </span>

    <span v-else-if="isLoading" class="tuff-icon__loading">
      <span class="tuff-icon__loading-skeleton">
        <span class="tuff-icon__loading-shimmer" />
      </span>
    </span>

    <span v-else-if="safeIcon.type === 'emoji'" class="tuff-icon__emoji">
      {{ safeIcon.value || '⚠️' }}
    </span>

    <span v-else-if="safeIcon.type === 'class'" class="tuff-icon__class">
      <i :class="safeIcon.value" />
    </span>

    <span v-else-if="safeIcon.type === 'builtin' && builtin" class="tuff-icon__builtin">
      <svg :viewBox="builtin.viewBox" width="1em" height="1em" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path :d="builtin.path" fill="currentColor" />
      </svg>
    </span>

    <template v-else-if="isAddressable">
      <!-- Mask mode: use currentColor (colorful=false) -->
      <template v-if="shouldUseMask && svgContent">
        <span class="tuff-icon__svg-mask" :style="{ WebkitMaskImage: `url('${svgDataUrl}')`, maskImage: `url('${svgDataUrl}')` }" />
      </template>
      <!-- Colorful mode: render as img (colorful=true) -->
      <template v-else>
        <img :alt="alt" :src="resolvedUrl">
      </template>
    </template>

    <!-- Fallback: if icon type is unknown or invalid, show error state -->
    <span v-else class="tuff-icon__error">
      <i class="i-ri-image-line" />
    </span>
  </span>
</template>

<style lang="scss" scoped>
.tuff-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  flex-shrink: 0;
  overflow: hidden;
  max-width: 1em;
  max-height: 1em;

  img {
    display: block;
    width: 1em;
    height: 1em;
    object-fit: contain;
  }
}

.tuff-icon__class {
  width: 1em;
  height: 1em;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  i {
    font-size: 1em;
    line-height: 1;
    display: block;
    color: currentColor;
    background-color: currentColor;
  }

  i::before,
  i::after {
    color: currentColor;
    background-color: currentColor;
  }
}

.tuff-icon__emoji {
  display: inline-block;
  font-size: 1em;
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 1em;
}

.tuff-icon__svg-mask {
  width: 1em;
  height: 1em;
  display: block;
  background-color: currentColor;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: contain;
  mask-size: contain;
}

.tuff-icon__builtin {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tuff-icon__loading-skeleton {
  width: 1em;
  height: 1em;
  border-radius: 6px;
  overflow: hidden;
  background: var(--tx-fill-color-light, #f5f7fa);
  position: relative;
}

.tuff-icon__loading-shimmer {
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.7),
    transparent
  );
  animation: tx-icon-shimmer 1.2s infinite;
}

@keyframes tx-icon-shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
</style>
