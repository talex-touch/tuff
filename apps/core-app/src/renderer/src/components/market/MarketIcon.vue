<script lang="ts" name="MarketIcon" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import { computed } from 'vue'
import TuffIcon from '~/components/base/TuffIcon.vue'

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

// Icon URL is already fully constructed at source (nexus-store-provider)
const iconUrl = computed(() => {
  if (!props.item) return null
  const fromProp = typeof props.item.iconUrl === 'string' ? props.item.iconUrl.trim() : ''
  if (fromProp) return fromProp

  const icon = typeof props.item.icon === 'string' ? props.item.icon.trim() : ''
  if (/^https?:\/\//i.test(icon)) return icon

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
    <TuffIcon colorful :icon="tuffIcon" />
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
  // background: linear-gradient(
  //   135deg,
  //   rgba(var(--el-color-primary-rgb), 0.18),
  //   rgba(var(--el-color-primary-rgb), 0.05)
  // );
  border-radius: 14px;
  border: 1px solid rgba(var(--el-color-primary-rgb), 0.15);
  transition: all 0.25s ease;
  font-size: 22px;
  color: var(--el-color-primary);
}
</style>
