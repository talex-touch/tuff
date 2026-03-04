<script setup lang="ts">
import type { OmniPanelFeatureItemPayload } from '../../../../../shared/events/omni-panel'
import type { ITuffIcon } from '@talex-touch/utils'
import { TxButton } from '@talex-touch/tuffex'
import { computed } from 'vue'
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
      <span class="OmniPanelActionItem__body">
        <span class="OmniPanelActionItem__icon">
          <TuffIcon :icon="icon" :size="24" />
        </span>
      </span>
      <span class="OmniPanelActionItem__title">{{ item.title }}</span>
    </TxButton>
    <span v-if="isExecuting" class="OmniPanelActionItem__executing">...</span>
  </div>
</template>

<style scoped lang="scss">
.OmniPanelActionItem {
  position: relative;
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
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 8px 6px;
}

.OmniPanelActionItem__icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--tx-fill-color);
  color: var(--tx-color-primary);
}

.OmniPanelActionItem__title {
  width: 100%;
  margin: 0;
  padding: 8px 8px 9px;
  border-top: 1px solid color-mix(in srgb, var(--tx-border-color) 76%, transparent);
  background: color-mix(in srgb, var(--tx-fill-color-light) 82%, transparent);
  font-size: 12px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
  text-align: center;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.OmniPanelActionItem__executing {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 11px;
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
