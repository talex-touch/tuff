<script lang="ts" name="StoreIcon" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import { computed, ref, watch } from 'vue'
import { TxIcon as TuffIcon } from '@talex-touch/tuffex/icon'
import { normalizeStoreIcon } from '~/modules/store/providers/store-icon-normalizer'
import {
  fetchStoreSvgDataUrl,
  getCachedStoreSvgDataUrl,
  isRemoteSvgIconUrl
} from '~/modules/store/store-svg-icon'

interface StoreIconProps {
  item?: {
    icon?: string
    iconUrl?: string
    metadata?: Record<string, unknown>
  }
  size?: number
  viewTransitionName?: string
}

const props = defineProps<StoreIconProps>()
const failedIconUrl = ref('')
const hydratedSvgDataUrl = ref('')
const hydratingSvgUrl = ref('')

// Icon URL is already fully constructed at source (nexus-store-provider / tpex-api-provider)
const rawIconUrl = computed(() => {
  if (!props.item) return null
  const fromProp = typeof props.item.iconUrl === 'string' ? props.item.iconUrl.trim() : ''
  if (fromProp && fromProp !== failedIconUrl.value) return fromProp

  const normalizedIcon = normalizeStoreIcon(props.item.icon)
  if (normalizedIcon.iconUrl && normalizedIcon.iconUrl !== failedIconUrl.value) {
    return normalizedIcon.iconUrl
  }

  return null
})

const iconUrl = computed(() => {
  const url = rawIconUrl.value
  if (!url) return null
  if (!isRemoteSvgIconUrl(url)) return url
  return hydratedSvgDataUrl.value || getCachedStoreSvgDataUrl(url) || null
})

const isHydratingSvg = computed(() => {
  const url = rawIconUrl.value
  return Boolean(url && isRemoteSvgIconUrl(url) && !iconUrl.value && hydratingSvgUrl.value === url)
})

const iconClass = computed(() => {
  if (!props.item) return ''

  const metadata = props.item.metadata as Record<string, unknown> | undefined
  if (metadata) {
    const normalizedMetaIconClass = normalizeStoreIcon(metadata.icon_class)
    if (normalizedMetaIconClass.icon) return normalizedMetaIconClass.icon

    const normalizedMetaIcon = normalizeStoreIcon(metadata.icon)
    if (normalizedMetaIcon.icon) return normalizedMetaIcon.icon
  }

  const normalizedIcon = normalizeStoreIcon(props.item.icon)
  if (normalizedIcon.icon) return normalizedIcon.icon

  return ''
})

const tuffIcon = computed<ITuffIcon>(() => {
  // Priority: iconUrl > hydrating skeleton > iconClass > default
  if (iconUrl.value) {
    return {
      type: 'url',
      value: iconUrl.value,
      status: 'normal'
    }
  }

  const icon = iconClass.value || 'i-ri-puzzle-line'
  if (isHydratingSvg.value) {
    return {
      type: 'class',
      value: icon,
      status: 'loading'
    }
  }

  return {
    type: 'class',
    value: icon,
    status: 'normal'
  }
})

const shouldPreserveIconColor = computed(() => {
  const value = iconUrl.value?.trim().toLowerCase()
  if (!value) return false
  if (value.startsWith('data:image/svg+xml')) return false

  const [path] = value.split(/[?#]/)
  return !path.endsWith('.svg')
})

async function hydrateRemoteSvg(url: string | null): Promise<void> {
  if (!url || !isRemoteSvgIconUrl(url)) {
    hydratedSvgDataUrl.value = ''
    hydratingSvgUrl.value = ''
    return
  }

  const cached = getCachedStoreSvgDataUrl(url)
  if (cached) {
    hydratedSvgDataUrl.value = cached
    hydratingSvgUrl.value = ''
    return
  }

  hydratedSvgDataUrl.value = ''
  hydratingSvgUrl.value = url

  const dataUrl = await fetchStoreSvgDataUrl(url)
  if (rawIconUrl.value !== url) {
    return
  }

  hydratingSvgUrl.value = ''
  if (dataUrl) {
    hydratedSvgDataUrl.value = dataUrl
    return
  }

  failedIconUrl.value = url
}

watch(
  () => [props.item?.iconUrl, props.item?.icon] as const,
  () => {
    failedIconUrl.value = ''
  }
)

watch(
  rawIconUrl,
  (url) => {
    void hydrateRemoteSvg(url)
  },
  { immediate: true }
)

function handleIconError(): void {
  if (rawIconUrl.value) {
    failedIconUrl.value = rawIconUrl.value
  }
}
</script>

<template>
  <div
    class="store-icon"
    :style="{
      viewTransitionName,
      fontSize: size ? `${size}px` : undefined
    }"
    @error.capture="handleIconError"
  >
    <TuffIcon :colorful="shouldPreserveIconColor" :icon="tuffIcon" />
  </div>
</template>

<style lang="scss" scoped>
.store-icon {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--tx-fill-color-light, #eef1f5) 88%, var(--tx-bg-color, #fff)),
    color-mix(in srgb, var(--tx-fill-color-lighter, #f5f7fa) 72%, var(--tx-bg-color, #fff))
  );
  border-radius: 16px;
  border: 1px solid rgba(var(--tx-color-primary-rgb), 0.18);
  transition: all 0.25s ease;
  font-size: 30px;
  color: var(--tx-text-color, currentColor);
  --icon-color: var(--tx-text-color, currentColor);
}
</style>
