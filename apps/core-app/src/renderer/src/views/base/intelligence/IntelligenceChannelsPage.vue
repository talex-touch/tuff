<template>
  <div class="flex h-full flex-col" role="main" aria-label="AI Intelligence Channels">
    <div
      class="flex flex-1 overflow-hidden border border-[var(--el-border-color-lighter)] bg-[var(--el-bg-color-page)]"
    >
      <IntelligenceList
        class="h-full w-76 flex-shrink-0 overflow-hidden border-r border-[var(--el-border-color-lighter)] bg-[var(--el-bg-color)]"
        aria-label="AI Provider List"
        :providers="providers"
        :selected-id="selectedProviderId"
        @select="handleSelectProvider"
        @add-provider="handleAddProvider"
      />
      <section
        class="h-full flex-1 overflow-hidden"
        :aria-live="selectedProvider ? 'polite' : 'off'"
      >
        <Transition name="fade-slide" mode="out-in">
          <IntelligenceInfo
            v-if="selectedProvider"
            :key="selectedProvider.id"
            :provider="selectedProvider"
            :test-result="testResult"
            :is-testing="isTesting"
            @update="handleUpdateProvider"
            @test="handleTestProvider"
            @delete="handleDeleteProvider"
          />
          <IntelligenceEmptyState v-else />
        </Transition>
      </section>
    </div>
    <p v-if="providers.length === 0" class="text-sm text-[var(--el-text-color-secondary)]">
      {{ t('settings.intelligence.emptyProviders') }}
    </p>
  </div>
</template>

<script lang="ts" name="IntelligenceChannelsPage" setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import IntelligenceList from '~/components/intelligence/layout/IntelligenceList.vue'
import IntelligenceInfo from '~/components/intelligence/layout/IntelligenceInfo.vue'
import IntelligenceEmptyState from '~/components/intelligence/layout/IntelligenceEmptyState.vue'
import type { AiProviderConfig, AISDKGlobalConfig, TestResult } from '@talex-touch/utils/types/intelligence'
import { AiProviderType } from '@talex-touch/utils/types/intelligence'
import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'
import { useKeyboardNavigation } from '~/composables/useKeyboardNavigation'
import { createIntelligenceClient } from '@talex-touch/utils/intelligence/client'
import { touchChannel } from '~/modules/channel/channel-core'

const { t } = useI18n()
const aiClient = createIntelligenceClient(touchChannel as any)

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

function handleAddProvider(): void {
  const nextIndex = providers.value.length + 1
  const id = `custom-${Date.now()}`
  addProvider({
    id,
    type: AiProviderType.CUSTOM,
    name: t('settings.intelligence.providers') + ` ${nextIndex}`,
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

function handleUpdateProvider(updatedProvider: AiProviderConfig): void {
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
      message: error instanceof Error ? error.message : '连接测试失败',
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
  const currentIndex = providers.value.findIndex(p => p.id === deletedId)

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

// Debug: Log providers data on mount
onMounted(() => {
  console.log('[IntelligenceChannels] Providers loaded:', providers.value)
  console.log('[IntelligenceChannels] Providers count:', providers.value.length)
})
</script>
