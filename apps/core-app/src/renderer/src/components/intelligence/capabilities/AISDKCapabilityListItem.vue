<template>
  <div
    class="capability-item group relative my-3 flex cursor-pointer items-center rounded-xl border-2 border-transparent p-3 transition-all duration-200"
    :class="{ selected: isSelected }"
    role="button"
    :tabindex="0"
    :aria-pressed="isSelected"
    :aria-label="capability.label || capability.id"
    @click="handleSelect"
    @keydown.enter.prevent="handleSelect"
    @keydown.space.prevent="handleSelect"
  >
    <div class="capability-icon" aria-hidden="true">
      <i class="i-carbon-cube text-xl" />
    </div>

    <div class="ml-3 min-w-0 flex-1">
      <p class="text-sm font-semibold text-[var(--el-text-color-primary)] truncate">
        {{ capability.label || capability.id }}
      </p>
      <p class="mt-1 text-xs text-[var(--el-text-color-secondary)] truncate">
        {{ capability.description || capability.id }}
      </p>
    </div>

    <div class="ml-auto flex flex-col items-end gap-1">
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
    </div>
  </div>
</template>

<script lang="ts" name="AISDKCapabilityListItem" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AISDKCapabilityConfig } from '~/types/aisdk'

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
.capability-item {
  background: var(--el-bg-color);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);

  &:hover {
    border-color: var(--el-border-color);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
    transform: translateY(-1px);
  }

  &.selected {
    border-color: var(--el-color-primary-light-3);
    box-shadow: 0 4px 20px rgba(var(--el-color-primary-rgb), 0.15);
    background: rgba(var(--el-color-primary-rgb), 0.04);
  }
}

.capability-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color);
  color: var(--el-color-primary);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
}
</style>
