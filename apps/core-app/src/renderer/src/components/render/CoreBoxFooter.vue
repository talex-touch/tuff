<script lang="ts" name="CoreBoxFooter" setup>
import type { IProviderActivate, ITuffIcon, TuffFooterHints, TuffItem } from '@talex-touch/utils'
import { useDebounce } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import DefaultIcon from '~/assets/svg/EmptyAppPlaceholder.svg'
import TuffIcon from '~/components/base/TuffIcon.vue'
import { useFileIndexMonitor } from '~/composables/useFileIndexMonitor'
import { resolveSourceMeta } from './sourceMeta'

const props = defineProps<{
  display: boolean
  item: TuffItem | null
  /** 当前激活的 providers，用于判断是否在搜索结果模式 */
  activeActivations?: IProviderActivate[] | null
  /** 搜索结果数量，用于判断是否显示快速选择 */
  resultCount?: number
  /** 是否在推荐模式 */
  isRecommendation?: boolean
}>()

const displayValue = computed(() => props.display)
const debouncedDisplay = useDebounce(displayValue, 100)

const { t } = useI18n()

// --- Indexing status ---
const { onProgressUpdate, indexProgress } = useFileIndexMonitor()

const isIndexing = computed(() => {
  const stage = indexProgress.value?.stage
  return stage && stage !== 'idle' && stage !== 'completed'
})

const indexingLabel = computed(() => {
  if (!isIndexing.value || !indexProgress.value) return ''
  const p = indexProgress.value
  const pct = Math.round(p.progress ?? 0)
  return t('coreBox.footer.indexing', { progress: pct })
})

let unsubscribeIndex: (() => void) | null = null
onMounted(() => {
  unsubscribeIndex = onProgressUpdate(() => {})
})
onBeforeUnmount(() => {
  unsubscribeIndex?.()
})

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

const isMacPlatform = process.platform === 'darwin'

/** 获取当前 item 的 footerHints 配置 */
const footerHintsConfig = computed<TuffFooterHints | undefined>(() => {
  return props.item?.meta?.footerHints
})

/** 主操作按钮文案 */
const primaryActionLabel = computed(() => {
  // 优先使用 item 配置的文案
  const customLabel = footerHintsConfig.value?.primary?.label
  if (customLabel) return customLabel

  const item = props.item
  const isPluginFeature =
    item?.kind === 'feature' && (item.source?.type === 'plugin' || item.meta?.pluginName)

  const translationKey = isPluginFeature ? 'coreBox.hints.execute' : 'coreBox.hints.open'
  const translated = t(translationKey)
  return translated === translationKey ? (isPluginFeature ? 'Execute' : 'Open') : translated
})

/** 主操作是否显示 */
const primaryVisible = computed(() => {
  return footerHintsConfig.value?.primary?.visible !== false
})

/** Meta+K 辅助操作是否显示（默认显示，用于操作面板） */
const secondaryVisible = computed(() => {
  // 如果 item 显式配置了，使用配置
  if (footerHintsConfig.value?.secondary?.visible !== undefined) {
    return footerHintsConfig.value.secondary.visible
  }
  // 默认显示（用于固定功能）
  return true
})

/** Meta+K 辅助操作文案 */
const secondaryLabel = computed(() => {
  // 如果 item 有自定义配置，使用配置
  if (footerHintsConfig.value?.secondary?.label) {
    return footerHintsConfig.value.secondary.label
  }
  // 默认显示"操作"
  return t('coreBox.hints.actions', '操作')
})

/**
 * 快速选择是否显示
 * 默认逻辑：
 * - 推荐模式：显示
 * - 搜索结果模式（无激活 provider）：显示
 * - 激活 provider 模式（如 AI）：隐藏
 * - item 显式配置优先级最高
 */
const quickSelectVisible = computed(() => {
  // item 显式配置优先
  const itemConfig = footerHintsConfig.value?.quickSelect?.visible
  if (itemConfig !== undefined) return itemConfig

  // 有激活的 provider 时默认隐藏（如 AI 模式）
  if (props.activeActivations && props.activeActivations.length > 0) {
    return false
  }

  // 推荐模式或有搜索结果时显示
  return props.isRecommendation || (props.resultCount ?? 0) > 0
})

const keyHints = computed(() => {
  const quickSelectLabelKey = 'coreBox.hints.quickSelect'
  const quickSelectLabel = t(quickSelectLabelKey)

  const aiHotkey = isMacPlatform ? '⌘K' : 'Meta+K'
  const quickSelectHotkey = isMacPlatform ? '⌘1-0' : 'Alt+1-0'

  const hints: Array<{ key: string; label: string; visible: boolean }> = []

  // 主操作（回车）
  if (primaryVisible.value) {
    hints.push({ key: '↵', label: primaryActionLabel.value, visible: true })
  }

  // 辅助操作（Meta+K）- 操作面板
  if (secondaryVisible.value) {
    hints.push({
      key: aiHotkey,
      label: secondaryLabel.value,
      visible: true
    })
  }

  // 快速选择（Meta+1-0）
  if (quickSelectVisible.value) {
    hints.push({
      key: quickSelectHotkey,
      label: quickSelectLabel === quickSelectLabelKey ? 'Quick Select' : quickSelectLabel,
      visible: true
    })
  }

  return hints
})
</script>

<template>
  <div
    :class="{ display: debouncedDisplay || isIndexing }"
    class="CoreBoxFooter transition-cubic fake-background flex-shrink-0 absolute overflow-hidden z-0 flex items-center justify-between gap-3 h-44px px-3 border-t border-[var(--el-border-color-lighter)] bg-transparent text-12px text-[color:var(--el-text-color-secondary)]"
  >
    <div class="FooterInfo">
      <!-- Indexing indicator takes priority when no search results -->
      <template v-if="isIndexing && !debouncedDisplay">
        <span class="IndexingDot" />
        <span class="IndexingLabel">{{ indexingLabel }}</span>
      </template>
      <template v-else>
        <TuffIcon
          colorful
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
      </template>
    </div>
    <div class="FooterHints">
      <!-- Show indexing label on the right when search results are visible -->
      <span v-if="isIndexing && debouncedDisplay" class="IndexingHint">
        <span class="IndexingDot" />
        <span>{{ indexingLabel }}</span>
      </span>
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

.IndexingDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-color-primary);
  flex-shrink: 0;
  animation: indexing-pulse 1.5s ease-in-out infinite;
}

.IndexingLabel {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.IndexingHint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

@keyframes indexing-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
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

  backdrop-filter: blur(18px) saturate(180%);
}
</style>
