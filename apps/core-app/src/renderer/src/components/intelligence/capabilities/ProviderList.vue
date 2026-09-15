<script lang="ts" setup name="ProviderList">
import type { ITuffIcon } from '@talex-touch/utils'
import type { CapabilityBinding } from './types'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { getVoiceCapabilityRecommendedModels } from '@talex-touch/utils/intelligence/voice-asr'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import {
  isNexusManagedProvider,
  TUFF_NEXUS_PROVIDER_ICON
} from '~/modules/intelligence/nexus-provider'
import { getProviderChannelType } from '~/modules/intelligence/provider-channel-type'
import { resolveProviderIcon } from '~/modules/intelligence/provider-icon-override'

const props = defineProps<{
  capabilityId?: string
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

/** A binding whose provider left the config still needs a glyph. */
const FALLBACK_CHANNEL_ICON: ITuffIcon = { type: 'class', value: 'i-carbon-api-1' }

/**
 * The mark a channel row shows: Nexus branding for the managed route, otherwise the icon of the
 * adapter the channel runs on. Both come from the shared tables the channels page already uses,
 * so a channel cannot look like one adapter here and another there.
 */
function channelIcon(binding: CapabilityBinding): ITuffIcon {
  const provider = binding.provider
  if (!provider) return FALLBACK_CHANNEL_ICON
  if (isNexusManagedProvider(provider)) return TUFF_NEXUS_PROVIDER_ICON
  return resolveProviderIcon(provider, getProviderChannelType(provider))
}

/** The channel's own name — what the user called this credentials instance. */
function channelName(binding: CapabilityBinding): string {
  return binding.provider?.name || binding.providerId
}

/**
 * The adapter behind the channel. Without it two channels of the same brand are
 * indistinguishable; with it, "兼容" reads as what actually answers the request.
 */
function channelTypeLabel(binding: CapabilityBinding): string {
  if (!binding.provider) return binding.providerId
  return t(`settings.intelligence.providerTypeOptions.${getProviderChannelType(binding.provider)}`)
}

function isNexusChannel(binding: CapabilityBinding): boolean {
  return !!binding.provider && isNexusManagedProvider(binding.provider)
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

  const providerConfig = provider.provider
  const recommendedModels = providerConfig
    ? getVoiceCapabilityRecommendedModels(props.capabilityId ?? '', {
        ...(providerConfig.metadata ?? {}),
        baseUrl: providerConfig.baseUrl,
        channelType: getProviderChannelType(providerConfig)
      })
    : []

  emits('reorder', [
    ...props.enabledBindings,
    {
      providerId: provider.providerId,
      provider: provider.provider,
      enabled: true,
      priority: props.enabledBindings.length + 1,
      models: provider.models?.length ? provider.models : recommendedModels
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
      :title="channelName(provider)"
      :description="channelTypeLabel(provider)"
      :default-icon="channelIcon(provider)"
      :active="isProviderEnabled(provider.providerId)"
      @click="handleProviderFocus(provider.providerId)"
    >
      <template v-if="isNexusChannel(provider)" #tags>
        <span class="provider-list__official" :title="t('intelligence.item.nexusOfficial')">
          <i class="i-ri-verified-badge-fill" aria-hidden="true" />
          <span>{{ t('intelligence.item.nexusOfficial') }}</span>
        </span>
      </template>
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

.provider-list__official {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.0625rem 0.375rem;
  border-radius: 999px;
  background: var(--tx-color-primary-light-9);
  color: var(--tx-color-primary);
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.5;
}

.provider-list__official > i {
  font-size: 0.75rem;
}
</style>
