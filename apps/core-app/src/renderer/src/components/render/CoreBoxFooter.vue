<script lang="ts" name="CoreBoxFooter" setup>
import { computed } from 'vue'
import { TuffItem, ITuffIcon } from '@talex-touch/utils'
import DefaultIcon from '~/assets/svg/EmptyAppPlaceholder.svg'
import { useDebounce } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { resolveSourceMeta } from './sourceMeta'
import TuffIcon from '~/components/base/TuffIcon.vue'

const props = defineProps<{
  display: boolean
  item: TuffItem | null
}>()

const displayValue = computed(() => props.display)
const debouncedDisplay = useDebounce(displayValue, 100)

const { t } = useI18n()

const displayIcon = computed(() => {
  const icon = props.item?.render?.basic?.icon
  const defaultIcon = {
    type: 'url',
    value: '',
    status: 'normal'
  } as ITuffIcon

  if (typeof icon === 'string') {
    defaultIcon.value = icon
  }

  if (icon && typeof icon === 'object' && 'value' in icon) {
    if (icon.value?.length) {
      defaultIcon.value = icon.value
    }
  }

  return defaultIcon
})

const title = computed(() => props.item?.render?.basic?.title || 'CoreBox')
const subtitleMeta = computed(() => resolveSourceMeta(props.item || undefined, t))

const primaryActionLabel = computed(() => {
  const item = props.item
  const isPluginFeature =
    item?.kind === 'feature' && (item.source?.type === 'plugin' || item.meta?.pluginName)

  const translationKey = isPluginFeature ? 'coreBox.hints.execute' : 'coreBox.hints.open'
  const translated = t(translationKey)
  return translated === translationKey ? (isPluginFeature ? 'Execute' : 'Open') : translated
})

const keyHints = computed(() => {
  const actionsLabelKey = 'coreBox.hints.actions'
  const quickSelectLabelKey = 'coreBox.hints.quickSelect'

  const actionsLabel = t(actionsLabelKey)
  const quickSelectLabel = t(quickSelectLabelKey)

  return [
    { key: '↵', label: primaryActionLabel.value },
    {
      key: '⌘K',
      label: actionsLabel === actionsLabelKey ? 'Actions' : actionsLabel
    },
    {
      key: '⌘1-0',
      label: quickSelectLabel === quickSelectLabelKey ? 'Quick Select' : quickSelectLabel
    }
  ]
})
</script>

<template>
  <div
    :class="{ display: debouncedDisplay }"
    class="CoreBoxFooter transition-cubic fake-background flex-shrink-0 absolute overflow-hidden z-0 flex items-center justify-between gap-3 h-44px px-3 border-t border-[var(--el-border-color-lighter)] bg-transparent text-12px text-[color:var(--el-text-color-secondary)]"
  >
    <div class="FooterInfo">
      <TuffIcon
        :icon="displayIcon"
        :alt="title"
        :empty="DefaultIcon"
        :size="20"
        class="FooterIcon"
      />
      <div class="FooterText">
        <span class="FooterTitle" :title="title">{{ title }}</span>
        <span v-if="subtitleMeta" class="FooterSubtitle" :title="subtitleMeta.label">
          <i :class="subtitleMeta.icon" class="FooterSubtitleIcon" />
          <span>{{ subtitleMeta.label }}</span>
        </span>
      </div>
      <template v-if="item?.kind === 'feature'">
        <span v-if="item.meta?.interaction" class="InteractionType">
          {{ item.meta.interaction.type }}
        </span>
      </template>
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
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.FooterSubtitleIcon {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.InteractionType {
  padding: 2px 6px;
  border-radius: 4px;
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
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

.CoreBoxFooter {
  &.display {
    transform: translateY(0%);

    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  transition: none;
  transform: translateY(100%);

  --fake-inner-opacity: 0.95;
  --fake-radius: 0;
}
</style>
