<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import type { TxIconSource } from './types'

defineOptions({
  name: 'TuffIcon',
})

const props = withDefaults(
  defineProps<{
    icon?: TxIconSource | null
    alt?: string
    size?: number
    empty?: string
    colorful?: boolean
  }>(),
  {
    icon: null,
    alt: '',
    size: undefined,
    empty: '',
    colorful: false,
  },
)

const safeIcon = computed<TxIconSource>(() => {
  return (props.icon ?? { type: 'emoji', value: '' }) as TxIconSource
})

const isLoading = computed(() => safeIcon.value.status === 'loading')
const isError = computed(() => safeIcon.value.status === 'error')

const isAddressable = computed(() => safeIcon.value.type === 'url' || safeIcon.value.type === 'file')

const resolvedUrl = computed(() => {
  return safeIcon.value.value
})

const isSvg = computed(() => {
  const v = resolvedUrl.value
  return typeof v === 'string' && v.toLowerCase().endsWith('.svg')
})

const svgContent = ref<string>('')

const svgDataUrl = computed(() => {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgContent.value ?? '')}`
})

async function fetchSvg(url: string) {
  try {
    const res = await fetch(url)
    if (!res.ok) {
      svgContent.value = ''
      return
    }
    svgContent.value = await res.text()
  } catch {
    svgContent.value = ''
  }
}

watch(
  () => ({ url: resolvedUrl.value, isSvg: isSvg.value, colorful: props.colorful, type: safeIcon.value.type }),
  (v) => {
    if (v.type === 'url' && v.isSvg && !v.colorful && v.url) {
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
    :style="{ fontSize: size ? `${size}px` : undefined }"
  >
    <span v-if="!safeIcon.value" class="tuff-icon__empty">
      <slot name="empty">
        <img v-if="empty" :alt="alt" :src="empty" />
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

    <template v-else-if="isAddressable">
      <template v-if="isSvg && !colorful && svgContent">
        <span class="tuff-icon__svg-mask" :style="{ WebkitMaskImage: `url('${svgDataUrl}')`, maskImage: `url('${svgDataUrl}')` }" />
      </template>
      <template v-else>
        <img :alt="alt" :src="resolvedUrl" />
      </template>
    </template>
  </span>
</template>

<style lang="scss" scoped>
.tuff-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;

  img {
    display: block;
    width: 1em;
    height: 1em;
    object-fit: contain;
  }
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
