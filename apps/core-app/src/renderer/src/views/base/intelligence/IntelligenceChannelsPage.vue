<script lang="ts" name="IntelligenceChannelsPage" setup>
import type {
  IntelligenceProviderConfig,
  IntelligenceProviderSyncPayload,
  IntelligenceProviderSyncRecord,
  TestResult
} from '@talex-touch/utils/types/intelligence'
import { TxButton } from '@talex-touch/tuffex'
import { createIntelligenceClient } from '@talex-touch/utils/intelligence/client'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { IntelligenceProviderType } from '@talex-touch/utils/types/intelligence'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import IntelligenceEmptyState from '~/components/intelligence/layout/IntelligenceEmptyState.vue'
import IntelligenceInfo from '~/components/intelligence/layout/IntelligenceInfo.vue'
import IntelligenceList from '~/components/intelligence/layout/IntelligenceList.vue'
import TuffAsideTemplate from '~/components/tuff/template/TuffAsideTemplate.vue'
import { useKeyboardNavigation } from '~/composables/useKeyboardNavigation'
import { getAuthBaseUrl } from '~/modules/auth/auth-env'
import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'
import { fetchNexusWithAuth } from '~/modules/store/nexus-auth-client'

const { t } = useI18n()
const transport = useTuffTransport()
const aiClient = createIntelligenceClient(transport)
const TUFF_NEXUS_PROVIDER_ID = 'tuff-nexus-default'

const {
  providers,
  selectedProviderId,
  selectedProvider,
  addProvider,
  updateProvider,
  removeProvider
} = useIntelligenceManager()

const testResult = ref<TestResult | null>(null)
const isTesting = ref(false)
const searchQuery = ref('')
const isSyncingFromNexus = ref(false)
const syncError = ref('')
const syncMessage = ref('')

function normalizeProviderType(type: string): IntelligenceProviderType {
  switch (type) {
    case IntelligenceProviderType.OPENAI:
    case IntelligenceProviderType.ANTHROPIC:
    case IntelligenceProviderType.DEEPSEEK:
    case IntelligenceProviderType.SILICONFLOW:
    case IntelligenceProviderType.LOCAL:
      return type
    default:
      return IntelligenceProviderType.CUSTOM
  }
}

function isNexusPreferredProvider(provider: {
  id?: string
  metadata?: Record<string, unknown> | null
}): boolean {
  if (provider.id === TUFF_NEXUS_PROVIDER_ID) {
    return true
  }
  const origin = provider.metadata?.origin
  return typeof origin === 'string' && origin === 'tuff-nexus'
}

function toNexusFallbackProvider(): IntelligenceProviderConfig {
  const baseUrl = `${getAuthBaseUrl().replace(/\/+$/, '')}/v1`
  return {
    id: TUFF_NEXUS_PROVIDER_ID,
    type: IntelligenceProviderType.CUSTOM,
    name: 'Tuff Nexus',
    enabled: true,
    priority: 1,
    baseUrl,
    models: ['gpt-4o-mini'],
    defaultModel: 'gpt-4o-mini',
    timeout: 30000,
    rateLimit: {},
    metadata: {
      origin: 'tuff-nexus',
      source: 'core-fallback',
      syncedFromNexus: true
    }
  }
}

function mergeProviderFromNexus(record: IntelligenceProviderSyncRecord): void {
  const normalizedType = normalizeProviderType(record.type)
  const nexusPreferred = isNexusPreferredProvider(record)
  const resolvedProviderId = nexusPreferred ? TUFF_NEXUS_PROVIDER_ID : record.id
  const existing = providers.value.find((item) => item.id === resolvedProviderId)
  const hasCredential =
    normalizedType === IntelligenceProviderType.LOCAL || nexusPreferred || Boolean(existing?.apiKey)

  const nextProvider: IntelligenceProviderConfig = {
    id: resolvedProviderId,
    type: normalizedType,
    name: record.name || record.id,
    enabled: record.enabled && hasCredential,
    apiKey: existing?.apiKey,
    baseUrl: record.baseUrl || undefined,
    models: Array.isArray(record.models) ? record.models : [],
    defaultModel: record.defaultModel || undefined,
    instructions: record.instructions || undefined,
    timeout: typeof record.timeout === 'number' ? record.timeout : 30000,
    priority: nexusPreferred ? 1 : typeof record.priority === 'number' ? record.priority : 3,
    rateLimit: record.rateLimit || {},
    capabilities: Array.isArray(record.capabilities) ? record.capabilities : [],
    metadata: {
      ...(record.metadata || {}),
      source: 'nexus-dashboard',
      syncedFromNexus: true,
      hasApiKey: record.hasApiKey,
      nexusPreferred,
      syncedAt: Date.now()
    }
  }

  if (nexusPreferred) {
    nextProvider.enabled = true
    nextProvider.priority = 1
    nextProvider.metadata = {
      ...(nextProvider.metadata || {}),
      origin: 'tuff-nexus'
    }
  }

  if (existing) {
    updateProvider(nextProvider.id, nextProvider)
    return
  }

  addProvider(nextProvider)
}

function ensureNexusPreferredProvider(): void {
  const existing = providers.value.find((item) => item.id === TUFF_NEXUS_PROVIDER_ID)
  if (!existing) {
    addProvider(toNexusFallbackProvider())
    return
  }
  updateProvider(TUFF_NEXUS_PROVIDER_ID, {
    enabled: true,
    priority: 1,
    metadata: {
      ...(existing.metadata || {}),
      origin: 'tuff-nexus',
      syncedFromNexus: true,
      syncedAt: Date.now()
    }
  })
}

async function syncProvidersFromNexus(): Promise<void> {
  if (isSyncingFromNexus.value) return
  isSyncingFromNexus.value = true
  syncError.value = ''
  syncMessage.value = ''

  try {
    const response = await fetchNexusWithAuth(
      '/api/dashboard/intelligence/providers/sync',
      {
        method: 'GET',
        headers: { Accept: 'application/json' }
      },
      'intelligence:sync-providers'
    )

    if (!response) {
      throw new Error(t('settings.intelligence.syncFromNexusAuthRequired'))
    }

    if (!response.ok) {
      throw new Error(`${t('settings.intelligence.syncFromNexusFailed')} (HTTP ${response.status})`)
    }

    const payload = await response.json<IntelligenceProviderSyncPayload>()
    const incomingProviders = Array.isArray(payload.providers) ? payload.providers : []
    for (const provider of incomingProviders) {
      mergeProviderFromNexus(provider)
    }
    ensureNexusPreferredProvider()
    if (!selectedProviderId.value) {
      selectedProviderId.value = TUFF_NEXUS_PROVIDER_ID
    }

    syncMessage.value = t('settings.intelligence.syncFromNexusSuccess', {
      count: incomingProviders.length
    })
  } catch (error) {
    syncError.value =
      error instanceof Error ? error.message : t('settings.intelligence.syncFromNexusFailed')
  } finally {
    isSyncingFromNexus.value = false
  }
}

function handleAddProvider(): void {
  const nextIndex = providers.value.length + 1
  const id = `custom-${Date.now()}`
  addProvider({
    id,
    type: IntelligenceProviderType.CUSTOM,
    name: `${t('settings.intelligence.providers')} ${nextIndex}`,
    enabled: false,
    priority: 3,
    models: [],
    timeout: 30000,
    rateLimit: {}
  })
  selectedProviderId.value = id
}

function handleSelectProvider(id: string): void {
  selectedProviderId.value = id
  testResult.value = null
}

function handleUpdateProvider(updatedProvider: IntelligenceProviderConfig): void {
  updateProvider(updatedProvider.id, updatedProvider)
}

async function handleTestProvider(): Promise<void> {
  if (!selectedProvider.value || isTesting.value) return
  isTesting.value = true
  testResult.value = null
  try {
    const response = (await aiClient.testProvider(selectedProvider.value)) as TestResult
    testResult.value = response
  } catch (error) {
    testResult.value = {
      success: false,
      message:
        error instanceof Error ? error.message : t('settings.intelligence.connectionTestFailed'),
      timestamp: Date.now()
    }
  } finally {
    isTesting.value = false
  }
}

function handleDeleteProvider(): void {
  if (!selectedProvider.value) return
  const deletedId = selectedProvider.value.id

  // Find current index before deletion
  const currentIndex = providers.value.findIndex((p) => p.id === deletedId)

  // Remove the provider
  removeProvider(deletedId)

  // Smoothly select next provider after deletion
  const remainingProviders = providers.value
  if (remainingProviders.length > 0) {
    // Try to select the provider at the same index, or the last one if index is out of bounds
    const newIndex = Math.min(currentIndex, remainingProviders.length - 1)
    selectedProviderId.value = remainingProviders[newIndex].id
  } else {
    selectedProviderId.value = null
  }

  // Clear test result when switching
  testResult.value = null
}

function navigateToNextProvider(): void {
  const currentIndex = providers.value.findIndex((p) => p.id === selectedProviderId.value)
  if (currentIndex < providers.value.length - 1) {
    selectedProviderId.value = providers.value[currentIndex + 1].id
    testResult.value = null
  }
}

function navigateToPreviousProvider(): void {
  const currentIndex = providers.value.findIndex((p) => p.id === selectedProviderId.value)
  if (currentIndex > 0) {
    selectedProviderId.value = providers.value[currentIndex - 1].id
    testResult.value = null
  }
}

useKeyboardNavigation({
  onNavigateDown: navigateToNextProvider,
  onNavigateUp: navigateToPreviousProvider
})
</script>

<template>
  <div class="flex h-full flex-col" role="main" aria-label="AI Intelligence Channels">
    <TuffAsideTemplate
      v-model="searchQuery"
      class="flex-1"
      :search-placeholder="t('intelligence.search.placeholder')"
      :clear-label="t('intelligence.search.clear')"
      :main-aria-live="selectedProvider ? 'polite' : 'off'"
    >
      <template #default>
        <IntelligenceList
          class="h-full w-full"
          aria-label="AI Provider List"
          :providers="providers"
          :selected-id="selectedProviderId"
          :search-query="searchQuery"
          @select="handleSelectProvider"
        />
      </template>

      <template #footer>
        <div class="space-y-2">
          <TxButton
            variant="flat"
            class="w-full"
            native-type="button"
            :aria-label="t('settings.intelligence.addChannel')"
            @click="handleAddProvider"
          >
            <i class="i-carbon-add" aria-hidden="true" />
            <span>{{ t('settings.intelligence.addChannel') }}</span>
          </TxButton>
          <TxButton
            variant="secondary"
            class="w-full"
            native-type="button"
            :loading="isSyncingFromNexus"
            :disabled="isSyncingFromNexus"
            :aria-label="t('settings.intelligence.syncFromNexus')"
            @click="syncProvidersFromNexus"
          >
            <i v-if="!isSyncingFromNexus" class="i-carbon-cloud-download" aria-hidden="true" />
            <span>
              {{
                isSyncingFromNexus
                  ? t('settings.intelligence.syncingFromNexus')
                  : t('settings.intelligence.syncFromNexus')
              }}
            </span>
          </TxButton>
          <p v-if="syncMessage" class="text-xs text-[var(--tx-color-success)]">
            {{ syncMessage }}
          </p>
          <p v-if="syncError" class="text-xs text-[var(--tx-color-danger)]">
            {{ syncError }}
          </p>
        </div>
      </template>

      <template #main>
        <div :key="selectedProvider ? selectedProvider.id : 'empty'" class="h-full overflow-hidden">
          <IntelligenceInfo
            v-if="selectedProvider"
            :provider="selectedProvider"
            :test-result="testResult"
            :is-testing="isTesting"
            @update="handleUpdateProvider"
            @test="handleTestProvider"
            @delete="handleDeleteProvider"
          />
          <IntelligenceEmptyState v-else />
        </div>
      </template>
    </TuffAsideTemplate>

    <p v-if="providers.length === 0" class="text-sm text-[var(--tx-text-color-secondary)]">
      {{ t('settings.intelligence.emptyProviders') }}
    </p>
  </div>
</template>
