<script setup lang="ts">
import type { OmniPanelFeatureItemPayload } from '../../../../../shared/events/omni-panel'
import type { ITuffIcon } from '@talex-touch/utils'
import { TxButton } from '@talex-touch/tuffex'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffIcon from '~/components/base/TuffIcon.vue'

const props = defineProps<{
  item: OmniPanelFeatureItemPayload
  index: number
  focused: boolean
  executingId: string | null
}>()

const emit = defineEmits<{
  (event: 'execute', item: OmniPanelFeatureItemPayload): void
  (event: 'focus', index: number): void
}>()

const { t } = useI18n()

const fallbackIcon: ITuffIcon = { type: 'class', value: 'i-ri-apps-2-line' }
const iconTypes = new Set<ITuffIcon['type']>(['emoji', 'url', 'file', 'class', 'builtin'])

const icon = computed<ITuffIcon>(() => {
  if (!props.item.icon) {
    return fallbackIcon
  }

  const iconType = iconTypes.has(props.item.icon.type as ITuffIcon['type'])
    ? (props.item.icon.type as ITuffIcon['type'])
    : 'class'
  const iconValue = props.item.icon.value?.trim() || fallbackIcon.value
  return {
    type: iconType,
    value: iconValue
  }
})

const disabled = computed(() => Boolean(props.executingId) || props.item.unavailable)
const isExecuting = computed(() => props.executingId === props.item.id)
const detailText = computed(() => {
  if (props.item.unavailable) {
    return props.item.unavailableReason?.message || t('corebox.omniPanel.featureUnavailable')
  }
  return props.item.subtitle || t('corebox.omniPanel.ready')
})
const sourceLabel = computed(() => {
  if (props.item.source === 'plugin') {
    return props.item.pluginName || 'plugin'
  }
  return props.item.source
})
</script>

<template>
  <div
    class="OmniPanelActionItem"
    :class="{ 'is-focused': focused, 'is-unavailable': item.unavailable }"
    @mouseenter="emit('focus', index)"
  >
    <TxButton
      class="OmniPanelActionItem__action"
      variant="bare"
      :disabled="disabled"
      :title="detailText"
      @click="emit('execute', item)"
    >
      <span class="OmniPanelActionItem__body">
        <span class="OmniPanelActionItem__icon">
          <TuffIcon :icon="icon" :size="14" />
        </span>
        <span class="OmniPanelActionItem__meta">{{ sourceLabel }}</span>
      </span>
      <span class="OmniPanelActionItem__content">
        <span class="OmniPanelActionItem__title">{{ item.title }}</span>
        <span class="OmniPanelActionItem__detail">{{ detailText }}</span>
      </span>
    </TxButton>
    <span v-if="isExecuting" class="OmniPanelActionItem__executing">...</span>
  </div>
</template>

<style scoped lang="scss">
.OmniPanelActionItem {
  position: relative;
  border-radius: 8px;
  border: 1px solid var(--tx-border-color);
  background: var(--tx-fill-color-light);
  overflow: hidden;

  &.is-focused {
    border-color: var(--tx-color-primary);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--tx-color-primary) 40%, transparent) inset;
  }

  &.is-unavailable {
    border-color: color-mix(in srgb, var(--tx-color-danger) 28%, var(--tx-border-color));
    background: color-mix(in srgb, var(--tx-color-danger) 6%, var(--tx-fill-color-light));
  }
}

.OmniPanelActionItem__action {
  display: flex;
  flex-direction: column;
  aspect-ratio: 1 / 1;
  width: 100%;
  text-align: center;
  padding: 0;
  color: inherit;
}

.OmniPanelActionItem__body {
  flex: 1;
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 5px 5px 4px;
}

.OmniPanelActionItem__icon {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--tx-fill-color);
  color: var(--tx-color-primary);
}

.OmniPanelActionItem__meta {
  max-width: 100%;
  padding: 1px 5px;
  border-radius: 999px;
  font-size: 8px;
  line-height: 12px;
  color: var(--tx-text-color-secondary);
  background: color-mix(in srgb, var(--tx-fill-color) 82%, transparent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.OmniPanelActionItem__content {
  width: 100%;
  padding: 5px 4px 6px;
  border-top: 1px solid color-mix(in srgb, var(--tx-border-color) 76%, transparent);
  background: color-mix(in srgb, var(--tx-fill-color-light) 82%, transparent);
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.OmniPanelActionItem__title,
.OmniPanelActionItem__detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.OmniPanelActionItem__title {
  font-size: 10px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
  text-align: center;
  line-height: 1.2;
}

.OmniPanelActionItem__detail {
  font-size: 8px;
  line-height: 1.2;
  color: var(--tx-text-color-secondary);
}

.OmniPanelActionItem.is-unavailable .OmniPanelActionItem__detail {
  color: var(--tx-color-danger);
}

.OmniPanelActionItem__executing {
  position: absolute;
  top: 4px;
  right: 6px;
  font-size: 9px;
  color: var(--tx-text-color-secondary);
  animation: blink 1.2s infinite;
}

@keyframes blink {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}
</style>
