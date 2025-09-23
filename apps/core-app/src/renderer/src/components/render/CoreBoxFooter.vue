<script lang="ts" name="CoreBoxFooter" setup>
import { computed } from 'vue'
import { TuffItem } from '@talex-touch/utils'
import PluginIcon from '@renderer/components/plugin/PluginIcon.vue'
import DefaultIcon from '~/assets/svg/EmptyAppPlaceholder.svg'

const props = defineProps<{
  item: TuffItem | null
}>()

const displayIcon = computed(() => {
  const icon = props.item?.render?.basic?.icon || props.item?.icon
  if (!icon) return DefaultIcon
  if (typeof icon === 'string') return icon
  if (icon && typeof icon === 'object' && 'value' in icon && icon.value?.length) {
    return icon
  }
  return DefaultIcon
})

const title = computed(() => props.item?.render?.basic?.title || 'CoreBox')
const subtitle = computed(() => props.item?.source?.name || props.item?.source?.type || '')

const keyHints = computed(() => [
  { key: '↵', label: 'Open' },
  { key: '⌘K', label: 'Actions' },
  { key: '⌘1-0', label: 'Quick Select' }
])
</script>

<template>
  <div class="CoreBoxFooter">
    <div class="FooterInfo">
      <PluginIcon :icon="displayIcon" :alt="title" class="FooterIcon" />
      <div class="FooterText">
        <span class="FooterTitle" :title="title">{{ title }}</span>
        <span v-if="subtitle" class="FooterSubtitle" :title="subtitle">{{ subtitle }}</span>
      </div>
    </div>
    <div class="FooterHints">
      <div v-for="hint in keyHints" :key="hint.label" class="FooterHint">
        <span class="HintKey">{{ hint.key }}</span>
        <span class="HintLabel">{{ hint.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.CoreBoxFooter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
  backdrop-filter: blur(12px);
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.FooterInfo {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.FooterIcon {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  flex-shrink: 0;
}

.FooterText {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.2;
}

.FooterTitle {
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.FooterSubtitle {
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.FooterHints {
  display: flex;
  align-items: center;
  gap: 12px;
}

.FooterHint {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.HintKey {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--el-fill-color-dark);
  color: var(--el-text-color-primary);
  font-weight: 600;
  font-size: 12px;
}

.HintLabel {
  font-size: 11px;
}
</style>
