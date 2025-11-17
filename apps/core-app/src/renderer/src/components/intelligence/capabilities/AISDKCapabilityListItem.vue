<template>
  <TuffBlockSlot
    class="capability-item-slot"
    :title="capability.label || capability.id"
    :description="capability.description || capability.id"
    default-icon="i-carbon-cube"
    active-icon="i-carbon-cube"
    :active="isSelected"
    role="button"
    tabindex="0"
    :aria-pressed="isSelected"
    :aria-label="capability.label || capability.id"
    @click="handleSelect"
    @keydown.enter.prevent="handleSelect"
    @keydown.space.prevent="handleSelect"
  >
    <template #tags>
      <span
        class="badge"
        role="status"
        :aria-label="t('settings.aisdk.capabilityProvidersStat', { count: activeProviderCount })"
      >
        <i class="i-carbon-flow-logs" aria-hidden="true" />
        {{ t('settings.aisdk.capabilityProvidersStat', { count: activeProviderCount }) }}
      </span>
      <span v-if="providerCount > activeProviderCount" class="badge badge-gray text-xs">
        {{ t('settings.aisdk.capabilityProvidersTotal', { count: providerCount }) }}
      </span>
    </template>
  </TuffBlockSlot>
</template>

<script lang="ts" name="AISDKCapabilityListItem" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import type { AISDKCapabilityConfig } from '@talex-touch/utils/types/intelligence'

const props = defineProps<{
  capability: AISDKCapabilityConfig
  isSelected: boolean
}>()

const emits = defineEmits<{
  select: [id: string]
}>()

const { t } = useI18n()

const providerCount = computed(() => props.capability.providers?.length ?? 0)
const activeProviderCount = computed(
  () =>
    props.capability.providers?.filter((binding) => binding.enabled !== false).length ??
    0
)

function handleSelect(): void {
  emits('select', props.capability.id)
}
</script>

<style lang="scss" scoped>
.capability-item-slot {
  border-radius: 12px;
  border: 1px solid transparent;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  padding: 0;
  background: var(--el-bg-color);
  width: 100%;

  &:hover {
    border-color: var(--el-border-color);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
    transform: translateY(-1px);
  }

  &[aria-pressed='true'] {
    border-color: var(--el-color-primary-light-3);
    box-shadow: 0 4px 20px rgba(var(--el-color-primary-rgb), 0.15);
    background: rgba(var(--el-color-primary-rgb), 0.04);
  }

  :deep(.TBlockSlot-Slot) {
    display: none;
  }

  .badge {
    font-size: 0.75rem;
    line-height: 1rem;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .badge-gray {
    color: var(--el-text-color-secondary);
  }
}
</style>
