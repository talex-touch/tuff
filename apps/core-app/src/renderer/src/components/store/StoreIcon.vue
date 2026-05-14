<script lang="ts" name="StoreIcon" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import { computed } from 'vue'
import TuffIcon from '~/components/base/TuffIcon.vue'
import { normalizeStoreIcon } from '~/modules/store/providers/store-icon-normalizer'

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

// Icon URL is already fully constructed at source (nexus-store-provider)
const iconUrl = computed(() => {
  if (!props.item) return null
  const fromProp = typeof props.item.iconUrl === 'string' ? props.item.iconUrl.trim() : ''
  if (fromProp) return fromProp

  const normalizedIcon = normalizeStoreIcon(props.item.icon)
  if (normalizedIcon.iconUrl) return normalizedIcon.iconUrl

  return null
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
  // Priority: iconUrl > iconClass > default
  if (iconUrl.value) {
    return {
      type: 'url',
      value: iconUrl.value,
      status: 'normal'
    }
  }

  const icon = iconClass.value || 'i-ri-puzzle-line'
  return {
    type: 'class',
    value: icon,
    status: 'normal'
  }
})
</script>

<template>
  <div
    class="store-icon"
    :style="{
      viewTransitionName,
      fontSize: size ? `${size}px` : undefined
    }"
  >
    <TuffIcon colorful :icon="tuffIcon" />
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
  color: var(--tx-color-primary);
}
</style>
