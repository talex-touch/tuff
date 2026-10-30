<script setup lang="ts" name="PluginSearchProviders">
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import type {
  SearchProviderMode,
  SearchProviderOwner,
  SearchProviderRegistryIssue,
  SearchProviderRuntimeConfig,
  SearchProviderUserConfig
} from '@talex-touch/utils/search'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxEmpty } from '@talex-touch/tuffex/empty'
import { TxTag } from '@talex-touch/tuffex/tag'
import { useSettingsSdk } from '@talex-touch/utils/renderer'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { resolvePermissionDisplayName } from '~/modules/permission/permission-request-card'
import { createRendererLogger } from '~/utils/renderer-log'

const props = defineProps<{
  plugin: ITouchPlugin
}>()

const settingsSdk = useSettingsSdk()
const { t, te, locale } = useI18n()
const pluginSearchProvidersLog = createRendererLogger('PluginSearchProviders')

const providers = ref<SearchProviderRuntimeConfig[]>([])
const issues = ref<SearchProviderRegistryIssue[]>([])
const loading = ref(false)
const savingProviderId = ref<string | null>(null)

const pluginPrefix = computed(() => `${props.plugin.name}.`)
const pluginProviders = computed(() =>
  providers.value.filter((provider) => provider.providerId.startsWith(pluginPrefix.value))
)
const pluginIssues = computed(() =>
  issues.value.filter(
    (issue) =>
      issue.pluginName === props.plugin.name ||
      issue.providerId === props.plugin.name ||
      issue.providerId?.startsWith(pluginPrefix.value)
  )
)
const hasSearchProviders = computed(
  () => pluginProviders.value.length > 0 || pluginIssues.value.length > 0
)
const summaryText = computed(() => {
  if (loading.value) return t('plugin.permissions.searchProviders.loading')

  // Each count is worded on its own, so the sources and the issues each take their own plural.
  return t('plugin.permissions.searchProviders.summary', {
    total: t('plugin.permissions.searchProviders.sourceCount', {
      count: pluginProviders.value.length
    }),
    enabled: pluginProviders.value.filter((provider) => provider.enabled).length,
    issues: t('plugin.permissions.searchProviders.issueCount', { count: pluginIssues.value.length })
  })
})

function toSearchProviderUserConfigs(nextProviders = providers.value): SearchProviderUserConfig[] {
  return nextProviders.map((provider, index) => ({
    providerId: provider.providerId,
    enabled: provider.enabled,
    order: index + 1,
    updatedAt: Date.now()
  }))
}

/** A word Main reports as an identifier, in the interface language when there is one for it. */
function wordFor(group: string, value: string): string {
  const key = `plugin.permissions.searchProviders.${group}.${value}`
  return te(key) ? t(key) : value
}

function modeLabel(mode: SearchProviderMode): string {
  return wordFor('modes', mode)
}

function ownerLabel(owner: SearchProviderOwner): string {
  return wordFor('owners', owner)
}

/** Only an indexed source is fed from somewhere; a push or pull source has nothing to name. */
function formatProviderDescription(provider: SearchProviderRuntimeConfig): string {
  const mode = modeLabel(provider.descriptor.mode)
  const source =
    provider.descriptor.policy.indexedSourceId ?? provider.descriptor.policy.indexedSource?.id
  return source ? t('plugin.permissions.searchProviders.providerDesc', { mode, source }) : mode
}

function joinList(items: string[]): string {
  try {
    return new Intl.ListFormat(locale.value, { style: 'long', type: 'conjunction' }).format(items)
  } catch {
    return items.join(', ')
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
}

/**
 * The sentence for one registration issue, built from the fields Main reports with it. Main's
 * `message` is the plugin developer's English; it is shown only for an issue this window has no
 * words for, or one that arrived without the fields its sentence needs.
 */
function issueSentence(issue: SearchProviderRegistryIssue): string | null {
  const meta = issue.meta ?? {}
  const provider = issue.providerId || issue.pluginName || ''
  const words = 'plugin.permissions.searchProviders.issues'

  switch (issue.code) {
    case 'SEARCH_PROVIDER_DERIVED_FROM_PUSH_FEATURE':
    case 'SEARCH_PROVIDER_PARTIAL_PUSH_FEATURE_COVERAGE': {
      const features = stringList(meta.featureIds)
      if (features.length === 0) return null
      const key =
        issue.code === 'SEARCH_PROVIDER_DERIVED_FROM_PUSH_FEATURE' ? 'derived' : 'uncovered'
      return t(`${words}.${key}`, { features: joinList(features) })
    }
    case 'SEARCH_PROVIDER_INVALID':
      return typeof meta.index === 'number'
        ? t(`${words}.invalidEntry`, { position: meta.index + 1 })
        : t(`${words}.invalidList`)
    case 'SEARCH_PROVIDER_POLICY_BLOCKED': {
      const reasons = stringList(meta.issues).map((reason) => wordFor('blockReasons', reason))
      if (!provider || reasons.length === 0) return null
      return t(`${words}.blocked`, { provider, reasons: joinList(reasons) })
    }
    case 'SEARCH_PROVIDER_PERMISSION_MISSING': {
      const permissions = stringList(meta.missingPermissionIds).map((id) =>
        resolvePermissionDisplayName(id, t)
      )
      if (!provider || permissions.length === 0) return null
      return t(`${words}.permissionMissing`, { provider, permissions: joinList(permissions) })
    }
    case 'SEARCH_PROVIDER_ID_COLLISION':
      return provider ? t(`${words}.idCollision`, { provider }) : null
    default:
      return null
  }
}

function formatIssue(issue: SearchProviderRegistryIssue): string {
  return (
    issueSentence(issue) ??
    t('settings.settingFileIndex.providerConfigIssue', {
      provider: issue.providerId || issue.pluginName || issue.source || issue.code,
      code: issue.code,
      message: issue.message
    })
  )
}

async function loadProviderConfig() {
  if (loading.value) return

  loading.value = true
  try {
    const response = await settingsSdk.indexedSource.getProviderConfig()
    providers.value = response.providers
    issues.value = response.issues ?? []
  } catch (error) {
    pluginSearchProvidersLog.error('Failed to load plugin search providers', error)
    providers.value = []
    issues.value = []
    toast.error(t('settings.settingFileIndex.providerConfigLoadFailed'))
  } finally {
    loading.value = false
  }
}

async function toggleProvider(providerId: string, enabled: boolean) {
  if (savingProviderId.value) return

  savingProviderId.value = providerId
  const nextProviders = providers.value.map((provider) =>
    provider.providerId === providerId ? { ...provider, enabled } : provider
  )
  providers.value = nextProviders

  try {
    const response = await settingsSdk.indexedSource.updateProviderConfig({
      providers: toSearchProviderUserConfigs(nextProviders)
    })
    providers.value = response.providers
    issues.value = response.issues ?? []
    toast.success(t('settings.settingFileIndex.providerConfigSaved'))
  } catch (error) {
    pluginSearchProvidersLog.error('Failed to save plugin search provider config', error)
    toast.error(t('settings.settingFileIndex.providerConfigSaveFailed'))
    await loadProviderConfig()
  } finally {
    savingProviderId.value = null
  }
}

watch(
  () => props.plugin.name,
  () => {
    void loadProviderConfig()
  }
)

onMounted(() => {
  void loadProviderConfig()
})
</script>

<template>
  <TuffGroupBlock
    :name="t('plugin.permissions.searchProviders.title')"
    :description="summaryText"
    default-icon="i-carbon-search"
    active-icon="i-carbon-search"
    memory-name="plugin-permissions-search-providers"
  >
    <TuffBlockSlot
      :title="t('plugin.permissions.searchProviders.statusTitle')"
      :description="t('plugin.permissions.searchProviders.statusDesc')"
      default-icon="i-carbon-list-boxes"
      active-icon="i-carbon-list-boxes"
      :active="loading"
    >
      <TxButton variant="flat" size="sm" :disabled="loading" @click="loadProviderConfig">
        <span class="i-carbon-renew text-12px" />
        <span>{{ t('plugin.permissions.actions.refresh') }}</span>
      </TxButton>
    </TuffBlockSlot>

    <TxEmpty
      v-if="!loading && !hasSearchProviders"
      :title="t('plugin.permissions.searchProviders.empty')"
      compact
    />

    <TuffBlockSlot
      v-if="pluginIssues.length > 0"
      :title="t('settings.settingFileIndex.providerConfigIssues')"
      :description="
        t('plugin.permissions.searchProviders.issueCount', { count: pluginIssues.length })
      "
      default-icon="i-carbon-warning-alt"
      active-icon="i-carbon-warning-alt-filled"
    >
      <div class="PluginSearchProviders-Issues">
        <TxTag
          v-for="(issue, index) in pluginIssues"
          :key="`${index}:${issue.code}:${issue.providerId ?? issue.pluginName ?? ''}`"
          :color="issue.type === 'error' ? 'var(--tx-color-danger)' : 'var(--tx-color-warning)'"
          size="sm"
        >
          {{ formatIssue(issue) }}
        </TxTag>
      </div>
    </TuffBlockSlot>

    <TuffBlockSwitch
      v-for="provider in pluginProviders"
      :key="provider.providerId"
      :model-value="provider.enabled"
      :title="provider.descriptor.displayName"
      :description="formatProviderDescription(provider)"
      default-icon="i-carbon-search"
      active-icon="i-carbon-search"
      :loading="savingProviderId === provider.providerId"
      :disabled="Boolean(savingProviderId && savingProviderId !== provider.providerId)"
      @change="(enabled) => toggleProvider(provider.providerId, enabled)"
    >
      <template #tags>
        <TxTag color="var(--tx-color-info)" size="sm">
          {{ ownerLabel(provider.descriptor.owner) }}
        </TxTag>
        <TxTag
          v-if="provider.descriptor.policy.requiresUserConsent"
          color="var(--tx-color-warning)"
          size="sm"
        >
          {{ t('plugin.permissions.searchProviders.consentRequired') }}
        </TxTag>
      </template>
    </TuffBlockSwitch>
  </TuffGroupBlock>
</template>

<style scoped lang="scss">
.PluginSearchProviders-Issues {
  display: inline-flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  max-width: 520px;
}
</style>
