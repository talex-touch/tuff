<script lang="ts" name="MarketIcon" setup>
import { computed } from 'vue'
import TuffIcon from '~/components/base/TuffIcon.vue'
import type { ITuffIcon } from '@talex-touch/utils'

const NEXUS_URL = import.meta.env.VITE_NEXUS_URL || 'https://tuff.tagzxia.com'

interface MarketIconProps {
  item?: {
    icon?: string
    iconUrl?: string
    metadata?: Record<string, unknown>
  }
  size?: number
  viewTransitionName?: string
}

const props = defineProps<MarketIconProps>()

// Check if there's a direct icon URL (from Nexus API)
const iconUrl = computed(() => {
  if (!props.item) return null

  // Check metadata for icon_url first
  const metadata = props.item.metadata as Record<string, unknown> | undefined
  if (metadata) {
    const metaIconUrl = typeof metadata.icon_url === 'string' ? metadata.icon_url.trim() : ''
    if (metaIconUrl) {
      // If it's a relative URL starting with /api/, prepend NEXUS_URL
      if (metaIconUrl.startsWith('/api/')) {
        return `${NEXUS_URL}${metaIconUrl}`
      }
      return metaIconUrl
    }
  }

  // Check iconUrl prop
  const fromProp = typeof props.item.iconUrl === 'string' ? props.item.iconUrl.trim() : ''
  if (fromProp) {
    // If it's a relative URL starting with /api/, prepend NEXUS_URL
    if (fromProp.startsWith('/api/')) {
      return `${NEXUS_URL}${fromProp}`
    }
    return fromProp
  }

  return null
})

const iconClass = computed(() => {
  if (!props.item) return ''

  const metadata = props.item.metadata as Record<string, unknown> | undefined
  if (metadata) {
    const metaIconClass = typeof metadata.icon_class === 'string' ? metadata.icon_class.trim() : ''
    if (metaIconClass) return metaIconClass

    const metaIcon = typeof metadata.icon === 'string' ? metadata.icon.trim() : ''
    if (metaIcon) return metaIcon.startsWith('i-') ? metaIcon : `i-${metaIcon}`
  }

  const fromProp = typeof props.item.icon === 'string' ? props.item.icon.trim() : ''
  if (fromProp) return fromProp.startsWith('i-') ? fromProp : `i-${fromProp}`

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
    class="market-icon"
    :style="{
      viewTransitionName,
      fontSize: size ? `${size}px` : undefined
    }"
  >
    <TuffIcon :icon="tuffIcon" />
  </div>
</template>

<style lang="scss" scoped>
.market-icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(
    135deg,
    rgba(var(--el-color-primary-rgb), 0.18),
    rgba(var(--el-color-primary-rgb), 0.05)
  );
  border-radius: 14px;
  border: 1px solid rgba(var(--el-color-primary-rgb), 0.15);
  transition: all 0.25s ease;
  font-size: 22px;
  color: var(--el-color-primary);
}
</style>
