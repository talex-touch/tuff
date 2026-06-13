<script lang="ts" setup name="ProviderList">
import type { CapabilityBinding } from './types'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'

const props = defineProps<{
  enabledBindings: CapabilityBinding[]
  disabledBindings: CapabilityBinding[]
}>()

const emits = defineEmits<{
  focus: [providerId: string]
  reorder: [bindings: CapabilityBinding[]]
}>()

const { t } = useI18n()

const allProviders = computed(() => {
  return [...props.enabledBindings, ...props.disabledBindings]
})

const enabledProviderIds = computed(() => {
  return new Set(props.enabledBindings.map((binding) => binding.providerId))
})

function isProviderEnabled(providerId: string): boolean {
  return enabledProviderIds.value.has(providerId)
}

function handleProviderFocus(providerId: string): void {
  if (isProviderEnabled(providerId)) {
    emits('focus', providerId)
  }
}

function handleProviderToggle(providerId: string, enabled: boolean): void {
  if (!enabled) {
    emits(
      'reorder',
      props.enabledBindings.filter((binding) => binding.providerId !== providerId)
    )
    return
  }

  if (isProviderEnabled(providerId)) {
    emits('focus', providerId)
    return
  }

  const provider = allProviders.value.find((binding) => binding.providerId === providerId)
  if (!provider) return

  emits('reorder', [
    ...props.enabledBindings,
    {
      providerId: provider.providerId,
      provider: provider.provider,
      enabled: true,
      priority: props.enabledBindings.length + 1,
      models: provider.models || []
    }
  ])
  emits('focus', providerId)
}
</script>

<template>
  <div class="provider-list">
    <TuffBlockSlot
      v-for="provider in allProviders"
      :key="provider.providerId"
      :title="provider.provider?.name || provider.providerId"
      :description="provider.provider?.type || provider.providerId"
      default-icon="i-carbon-api-1"
      active-icon="i-carbon-api-1"
      :active="isProviderEnabled(provider.providerId)"
      @click="handleProviderFocus(provider.providerId)"
    >
      <TxSwitch
        size="small"
        :model-value="isProviderEnabled(provider.providerId)"
        :aria-label="provider.provider?.name || provider.providerId"
        @click.stop
        @change="(value) => handleProviderToggle(provider.providerId, value)"
      />
    </TuffBlockSlot>
    <div v-if="allProviders.length === 0" class="provider-list__empty">
      {{ t('settings.intelligence.emptyProviders') }}
    </div>
  </div>
</template>

<style lang="scss" scoped>
.provider-list {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.provider-list__empty {
  padding: 0.75rem 1rem;
  color: var(--tx-text-color-secondary);
  font-size: 0.875rem;
}
</style>
