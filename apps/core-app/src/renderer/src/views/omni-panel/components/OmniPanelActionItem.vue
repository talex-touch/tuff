<script setup lang="ts">
import type { OmniPanelFeatureItemPayload } from '../../../../../shared/events/omni-panel'
import type { ITuffIcon } from '@talex-touch/utils'
import { TxButton, TxTag } from '@talex-touch/tuffex'
import { computed } from 'vue'
import TuffIcon from '~/components/base/TuffIcon.vue'

const props = defineProps<{
  item: OmniPanelFeatureItemPayload
  index: number
  focused: boolean
  isFirst: boolean
  isLast: boolean
  executingId: string | null
}>()

const emit = defineEmits<{
  (event: 'execute', item: OmniPanelFeatureItemPayload): void
  (event: 'reorder', item: OmniPanelFeatureItemPayload, direction: 'up' | 'down'): void
  (event: 'focus', index: number): void
}>()

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
</script>

<template>
  <div
    class="OmniPanelActionItem"
    :class="{ 'is-focused': focused }"
    @mouseenter="emit('focus', index)"
  >
    <TxButton
      class="OmniPanelActionItem__action"
      variant="bare"
      :disabled="disabled"
      @click="emit('execute', item)"
    >
      <span class="OmniPanelActionItem__icon">
        <TuffIcon :icon="icon" :size="18" />
      </span>
      <span class="OmniPanelActionItem__content">
        <span class="OmniPanelActionItem__title">
          {{ item.title }}
          <TxTag v-if="item.source === 'plugin'" size="sm" color="var(--tx-fill-color)">
            {{ item.pluginName }}
          </TxTag>
        </span>
        <span class="OmniPanelActionItem__subtitle">{{ item.subtitle }}</span>
        <span v-if="item.unavailableReason" class="OmniPanelActionItem__reason">
          {{ item.unavailableReason.message }}
        </span>
      </span>
      <span class="OmniPanelActionItem__meta">
        <span v-if="isExecuting" class="OmniPanelActionItem__executing">...</span>
      </span>
    </TxButton>

    <div class="OmniPanelActionItem__controls">
      <TxButton variant="flat" :disabled="isFirst" @click="emit('reorder', item, 'up')">↑</TxButton>
      <TxButton variant="flat" :disabled="isLast" @click="emit('reorder', item, 'down')"
        >↓</TxButton
      >
    </div>
  </div>
</template>

<style scoped lang="scss">
.OmniPanelActionItem {
  border-radius: 10px;
  border: 1px solid var(--tx-border-color);
  background: var(--tx-fill-color-light);
  overflow: hidden;

  &.is-focused {
    border-color: var(--tx-color-primary);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--tx-color-primary) 40%, transparent) inset;
  }
}

.OmniPanelActionItem__action {
  display: flex;
  align-items: center;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  color: inherit;
}

.OmniPanelActionItem__icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 10px;
  background: var(--tx-fill-color);
  color: var(--tx-color-primary);
}

.OmniPanelActionItem__content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.OmniPanelActionItem__title {
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--tx-text-color-primary);
}

.OmniPanelActionItem__subtitle {
  font-size: 11px;
  color: var(--tx-text-color-secondary);
}

.OmniPanelActionItem__reason {
  font-size: 11px;
  color: color-mix(in srgb, var(--tx-color-warning, #f59e0b) 82%, var(--tx-text-color-primary) 18%);
}

.OmniPanelActionItem__meta {
  font-size: 11px;
  color: var(--tx-text-color-secondary);
}

.OmniPanelActionItem__controls {
  display: flex;
  gap: 6px;
  padding: 0 10px 8px;
}

.OmniPanelActionItem__executing {
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
