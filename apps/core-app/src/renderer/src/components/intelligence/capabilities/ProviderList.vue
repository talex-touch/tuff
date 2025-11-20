<script lang="ts" setup>
import type { CapabilityBinding } from './types'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'

const props = defineProps<{
  enabledBindings: CapabilityBinding[]
  disabledBindings: CapabilityBinding[]
  focusedProviderId: string
}>()

const emits = defineEmits<{
  select: [providerId: string]
  reorder: [bindings: CapabilityBinding[]]
}>()

const { t } = useI18n()

const selectedProviderIds = ref<string[]>([])

// 合并所有可用的 provider
const allProviders = computed(() => {
  return [...props.enabledBindings, ...props.disabledBindings]
})

// 提供商摘要文本
const providerSummary = computed(() => {
  const count = selectedProviderIds.value.length
  if (count === 0) {
    return t('settings.intelligence.capabilityActionsEmpty')
  }
  return t('settings.intelligence.capabilityProvidersStat', { count })
})

// 同步选中状态
watch(
  () => props.enabledBindings,
  (list) => {
    selectedProviderIds.value = list.map(binding => binding.providerId)
  },
  { immediate: true, deep: true },
)

function handleSelectionChange(values: string[]): void {
  const oldIds = props.enabledBindings.map(b => b.providerId)
  const oldSet = new Set(oldIds)
  const newSet = new Set(values)

  // 构建新的 bindings 列表
  const newBindings: CapabilityBinding[] = []

  // 保留原有顺序的已选中项
  props.enabledBindings.forEach((binding) => {
    if (newSet.has(binding.providerId)) {
      newBindings.push({
        ...binding,
        enabled: true,
      })
    }
  })

  // 添加新选中的项（按照 values 中的顺序）
  values.forEach((providerId) => {
    if (!oldSet.has(providerId)) {
      // 从 disabledBindings 或 allProviders 中查找
      const disabledProvider = props.disabledBindings.find(p => p.providerId === providerId)
      if (disabledProvider) {
        newBindings.push({
          providerId: disabledProvider.providerId,
          provider: disabledProvider.provider,
          enabled: true,
          priority: newBindings.length + 1,
          models: disabledProvider.models || [],
        })
      }
      else {
        // 如果在 disabledBindings 中找不到，从 allProviders 中查找
        const provider = allProviders.value.find(p => p.providerId === providerId)
        if (provider) {
          newBindings.push({
            providerId: provider.providerId,
            provider: provider.provider,
            enabled: true,
            priority: newBindings.length + 1,
            models: provider.models || [],
          })
        }
      }
    }
  })

  emits('reorder', newBindings)

  // 如果有新选中的，自动聚焦到第一个新选中的
  const newlyAdded = values.find(id => !oldSet.has(id))
  if (newlyAdded) {
    emits('select', newlyAdded)
  }
}

function handleRemoveProvider(providerId: string): void {
  const newValues = selectedProviderIds.value.filter(id => id !== providerId)
  handleSelectionChange(newValues)
}
</script>

<template>
  <TuffBlockSlot
    :title="providerSummary"
    default-icon="i-carbon-api-1"
  >
    <el-select
      v-model="selectedProviderIds"
      multiple
      collapse-tags
      collapse-tags-tooltip
      :max-collapse-tags="3"
      :placeholder="t('settings.intelligence.selectProviderPlaceholder')"
      class="provider-list__select"
      @change="handleSelectionChange"
    >
      <el-option
        v-for="provider in allProviders"
        :key="provider.providerId"
        :label="provider.provider?.name || provider.providerId"
        :value="provider.providerId"
      >
        <div class="provider-option">
          <span class="provider-option__name">{{ provider.provider?.name || provider.providerId }}</span>
          <span class="provider-option__type">{{ provider.provider?.type || provider.providerId }}</span>
        </div>
      </el-option>
    </el-select>
  </TuffBlockSlot>

  <div v-if="enabledBindings.length > 0" class="provider-list__selected">
    <p class="provider-list__label">
      {{ t('settings.intelligence.selectedProviders') }}
    </p>
    <div class="provider-list__tags">
      <el-tag
        v-for="binding in enabledBindings"
        :key="binding.providerId"
        closable
        :type="(focusedProviderId === binding.providerId ? 'primary' : undefined) as any"
        @close="handleRemoveProvider(binding.providerId)"
        @click="$emit('select', binding.providerId)"
      >
        <span class="provider-tag__content">
          {{ binding.provider?.name || binding.providerId }}
          <span v-if="binding.models?.length" class="provider-tag__badge">
            {{ binding.models.length }}
          </span>
        </span>
      </el-tag>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.provider-list__select {
  width: 100%;
}

.provider-option {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.provider-option__name {
  font-weight: 500;
  font-size: 0.9rem;
}

.provider-option__type {
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
}

.provider-list__selected {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1rem;
}

.provider-list__label {
  font-weight: 600;
  font-size: 0.9rem;
  margin: 0 0 0.5rem 0;
  color: var(--el-text-color-primary);
}

.provider-list__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.provider-list__tags :deep(.el-tag) {
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    opacity: 0.8;
  }
}

.provider-tag__content {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.provider-tag__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.25rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.3);
  font-size: 0.7rem;
  font-weight: 600;
}
</style>
