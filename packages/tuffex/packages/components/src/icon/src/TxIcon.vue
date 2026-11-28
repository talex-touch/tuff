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
  // TxStep's default `completedIcon` is 'check'; keep this entry or completed
  // steps render an empty circle.
  'check': {
    viewBox: '0 0 24 24',
    path: 'M10 15.172L19.192 5.979L20.607 7.393L10 18L3.636 11.636L5.05 10.222L10 15.172Z',
  },
  // Drawn as a stroke, not a filled wedge: every consumer is a disclosure
  // affordance rendered at 12–14px, and a filled chevron at that size reads as
  // a heavy blob next to the 500-weight label it trails.
  'chevron-down': {
    viewBox: '0 0 24 24',
    path: 'M6 9.5 12 15.5 18 9.5',
    stroke: 1.75,
  },
  // The other directions, and `plus`, take the same stroke: they are the
  // chrome TuffEx's own components draw (TxTransfer's move buttons, TxNavBar's
  // back, TxBlockSwitch's guidance, TxImageUploader's add), so they have to
  // render where the host ships no icon collection.
  'chevron-right': {
    viewBox: '0 0 24 24',
    path: 'M9.5 6 15.5 12 9.5 18',
    stroke: 1.75,
  },
  'chevron-left': {
    viewBox: '0 0 24 24',
    path: 'M14.5 6 8.5 12 14.5 18',
    stroke: 1.75,
  },
  'arrow-left': {
    viewBox: '0 0 24 24',
    path: 'M19 12H5M11 6 5 12 11 18',
    stroke: 1.75,
  },
  'arrow-up': {
    viewBox: '0 0 24 24',
    path: 'M12 19V5M6 11 12 5 18 11',
    stroke: 1.75,
  },
  'arrow-down': {
    viewBox: '0 0 24 24',
    path: 'M12 5V19M6 13 12 19 18 13',
    stroke: 1.75,
  },
  'plus': {
    viewBox: '0 0 24 24',
    path: 'M12 5V19M5 12H19',
    stroke: 1.75,
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
  // Status glyphs for TxAlert and anything else reporting an outcome. Drawn as
  // rings rather than solid discs so they sit at the same visual weight as the
  // 500-weight title beside them instead of becoming the loudest thing in the
  // row. The hole is the two-subpath trick already used by 'search': the inner
  // arc runs the opposite sweep, so the nonzero fill rule punches it out.
  'info': {
    viewBox: '0 0 24 24',
    path: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm-1 3h2v2h-2V7zm0 4h2v6h-2v-6z',
  },
  'check-circle': {
    viewBox: '0 0 24 24',
    path: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm-1.3 12.3L6.4 12l1.4-1.4 2.9 2.9 5.6-5.6 1.4 1.4z',
  },
  'x-circle': {
    viewBox: '0 0 24 24',
    path: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm3.5 4.1L12 11.6 8.5 8.1 7.1 9.5l3.5 3.5-3.5 3.5 1.4 1.4 3.5-3.5 3.5 3.5 1.4-1.4-3.5-3.5 3.5-3.5z',
  },
  'alert-triangle': {
    viewBox: '0 0 24 24',
    path: 'M12 2 1.5 20.5h21zm0 4.2L19 18.5H5zm-1 3.8h2v4.5h-2zm0 5.8h2v2h-2z',
  },
  // Chrome stroke icons shared by AI reasoning/tool cards so they stay
  // self-contained without requiring a host icon collection.
  'lightbulb': {
    viewBox: '0 0 24 24',
    path: 'M12 3a6 6 0 0 1 6 6c0 2.2-1.2 3.6-2.4 4.8-.7.7-1.1 1.4-1.3 2.2h-4.6c-.2-.8-.6-1.5-1.3-2.2C7.2 12.6 6 11.2 6 9a6 6 0 0 1 6-6ZM9.5 19.5h5M10.5 22h3',
    stroke: 1.85,
  },
  'wrench': {
    viewBox: '0 0 24 24',
    path: 'M14.7 6.3a4.5 4.5 0 0 0-6 5.7L3 17.7V21h3.3l5.7-5.7a4.5 4.5 0 0 0 5.7-6l-3 3-2.7-.6-.6-2.7 3.3-2.7Z',
    stroke: 1.85,
  },
  'clock': {
    viewBox: '0 0 24 24',
    path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 3',
    stroke: 1.85,
  },
  'refresh': {
    viewBox: '0 0 24 24',
    path: 'M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16M16 21h5v-5',
    stroke: 1.85,
  },
} as const

// Remix `image-line`, drawn here so the error state needs no icon collection
// (Nexus ships no `ri`, so the old `i-ri-image-line` rendered nothing there).
const ERROR_GLYPH = 'M2.992 21A.993.993 0 0 1 2 20.007V3.993A1 1 0 0 1 2.992 3h18.016c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993zM20 15V5H4v14L14 9zm0 2.828l-6-6L6.828 19H20zM8 11a2 2 0 1 1 0-4a2 2 0 0 1 0 4'

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
const imageLoaded = ref(false)
const imageLoadFailed = ref(false)

// colorful logic aligned with core-app:
// colorful=true -> render as <img> (preserve original colors)
// colorful=false -> render monochrome SVGs as mask (use currentColor)
const shouldPreserveColor = computed(() => props.colorful || safeIcon.value.colorful === true)
const shouldInspectSvgColor = computed(() => isSvg.value && !shouldPreserveColor.value)
const shouldUseMask = computed(
  () => shouldInspectSvgColor.value && shouldRenderSvgAsMask(svgContent.value),
)
// Asked on every evaluation rather than once: a resolver serving lazily loaded
// path data reads reactive state, and this is what redraws the icon when the
// data lands.
const classGlyph = computed(() => {
  if (safeIcon.value.type !== 'class')
    return null
  return injectedConfig.classGlyph?.(safeIcon.value.value) ?? null
})


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

/**
 * Guards against a stale fetch winning the race: when the url changes while a
 * request is in flight, only the newest one may assign. Same pattern as
 * TxCodeBlock and TxMermaidBlock.
 */
let fetchToken = 0

async function fetchSvg(url: string) {
  const token = ++fetchToken

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
    const content = await svgFetcher.value(url)
    if (token === fetchToken)
      svgContent.value = content
  }
  catch {
    if (token === fetchToken)
      svgContent.value = ''
  }
}

function handleImageLoad() {
  imageLoaded.value = true
  imageLoadFailed.value = false
}

function handleImageError() {
  imageLoaded.value = false
  imageLoadFailed.value = true
}

watch(
  resolvedUrl,
  () => {
    imageLoaded.value = false
    imageLoadFailed.value = false
  },
  { immediate: true },
)

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
    :title="alt || undefined"
    :role="alt ? 'img' : undefined"
    :aria-hidden="alt ? undefined : true"
    :data-icon-type="safeIcon.type"
    :data-icon-value="safeIcon.value"
    :style="{ fontSize: size ? `${size}px` : undefined, color: iconColor }"
  >
    <span v-if="!safeIcon.value || (isAddressable && imageLoadFailed)" class="tuff-icon__empty"><slot name="empty">
      <img v-if="empty" :alt="alt" :src="empty">
    </slot>
    </span>

    <span v-else-if="isError" class="tuff-icon__error">
      <svg viewBox="0 0 24 24" width="1em" height="1em" xmlns="http://www.w3.org/2000/svg">
        <path :d="ERROR_GLYPH" fill="currentColor" />
      </svg>
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
      <svg v-if="classGlyph" :viewBox="classGlyph.viewBox || '0 0 24 24'" width="1em" height="1em" xmlns="http://www.w3.org/2000/svg">
        <path v-if="classGlyph.d" :d="classGlyph.d" fill="currentColor" />
      </svg>
      <i v-else :class="safeIcon.value" />
    </span>

    <span v-else-if="safeIcon.type === 'builtin' && builtin" class="tuff-icon__builtin">
      <svg :viewBox="builtin.viewBox" width="1em" height="1em" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Entries carrying a `stroke` width are open paths; the rest are
             closed silhouettes that only make sense filled. -->
        <path
          v-if="builtin.stroke"
          :d="builtin.path"
          fill="none"
          stroke="currentColor"
          :stroke-width="builtin.stroke"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path v-else :d="builtin.path" fill="currentColor" />
      </svg>
    </span>

    <template v-else-if="isAddressable">
      <!-- Mask mode: use currentColor (colorful=false) -->
      <template v-if="shouldUseMask && svgContent">
        <span class="tuff-icon__svg-mask" :style="{ WebkitMaskImage: `url('${svgDataUrl}')`, maskImage: `url('${svgDataUrl}')` }" />
      </template>
      <!-- Colorful mode: render as img (colorful=true) -->
      <template v-else>
        <span v-if="!imageLoaded" class="tuff-icon__loading" aria-hidden="true">
          <span class="tuff-icon__loading-skeleton">
            <span class="tuff-icon__loading-shimmer" />
          </span>
        </span>
        <img
          v-show="imageLoaded"
          :alt="alt"
          :src="resolvedUrl"
          @load="handleImageLoad"
          @error="handleImageError"
        >
      </template>
    </template>

    <!-- Fallback: if icon type is unknown or invalid, show error state -->
    <span v-else class="tuff-icon__error">
      <svg viewBox="0 0 24 24" width="1em" height="1em" xmlns="http://www.w3.org/2000/svg">
        <path :d="ERROR_GLYPH" fill="currentColor" />
      </svg>
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
  display: block;
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
