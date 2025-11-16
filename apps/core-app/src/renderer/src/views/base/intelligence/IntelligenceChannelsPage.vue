<template>
  <div class="aisdk-page h-full flex flex-col" role="main" aria-label="AI Intelligence Channels">
    <header class="aisdk-hero">
      <div>
        <p class="aisdk-hero__eyebrow">{{ t('flatNavBar.aisdk') }}</p>
        <h1>{{ t('settings.aisdk.channelPageTitle') }}</h1>
        <p class="aisdk-hero__desc">
          {{ t('settings.aisdk.channelPageDesc') }}
        </p>
      </div>
      <div class="aisdk-hero__actions">
        <FlatButton primary @click="handleAddProvider">
          <i class="i-carbon-add" aria-hidden="true" />
          <span>{{ t('settings.aisdk.addChannel') }}</span>
        </FlatButton>
        <FlatButton
          v-if="selectedProvider"
          @click="handleTestProvider"
        >
          <i :class="isTesting ? 'i-carbon-renew animate-spin' : 'i-carbon-connection-signal'" aria-hidden="true" />
          <span>
            {{ isTesting ? t('settings.aisdk.testing') : t('settings.aisdk.test') }}
          </span>
        </FlatButton>
      </div>
    </header>

    <div class="aisdk-body flex-1 flex flex-col gap-4 overflow-hidden">
      <section class="aisdk-section flex flex-col gap-3">
        <div class="aisdk-section__header">
          <div>
            <h2>{{ t('settings.aisdk.channelsSection') }}</h2>
            <p>{{ t('settings.aisdk.selectProviderHint') }}</p>
          </div>
        </div>
        <div class="aisdk-section__content flex flex-1 overflow-hidden rounded-2xl border border-[var(--el-border-color-lighter)] bg-[var(--el-bg-color-page)]">
          <aside
            class="aisdk-sidebar w-76 border-r border-[var(--el-border-color-lighter)]"
            aria-label="AI Provider List"
          >
            <IntelligenceList
              :providers="providers"
              :selected-id="selectedProviderId"
              @select="handleSelectProvider"
              @toggle="handleToggleProvider"
            />
          </aside>
          <section
            class="aisdk-detail flex-1 h-full overflow-hidden"
            :aria-live="selectedProvider ? 'polite' : 'off'"
          >
            <Transition name="fade-slide" mode="out-in">
              <IntelligenceInfo
                v-if="selectedProvider"
                :key="selectedProvider.id"
                :provider="selectedProvider"
                :global-config="globalConfig"
                :test-result="testResult"
                :is-testing="isTesting"
                @update="handleUpdateProvider"
                @test="handleTestProvider"
                @update-global="handleUpdateGlobal"
              />
              <IntelligenceEmptyState v-else />
            </Transition>
          </section>
        </div>
        <p v-if="providers.length === 0" class="aisdk-empty-hint">
          {{ t('settings.aisdk.emptyProviders') }}
        </p>
      </section>
    </div>
  </div>
</template>

<script lang="ts" name="IntelligenceChannelsPage" setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import IntelligenceList from '~/components/intelligence/layout/IntelligenceList.vue'
import IntelligenceInfo from '~/components/intelligence/layout/IntelligenceInfo.vue'
import IntelligenceEmptyState from '~/components/intelligence/layout/IntelligenceEmptyState.vue'
import FlatButton from '~/components/base/button/FlatButton.vue'
import type { AiProviderConfig, AISDKGlobalConfig, TestResult } from '~/types/aisdk'
import { AiProviderType } from '~/types/aisdk'
import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'
import { useKeyboardNavigation } from '~/composables/useKeyboardNavigation'
import { createAiSDKClient } from '@talex-touch/utils/aisdk/client'
import { touchChannel } from '~/modules/channel/channel-core'

const { t } = useI18n()
const aiClient = createAiSDKClient(touchChannel as any)

const {
  providers,
  selectedProviderId,
  selectedProvider,
  globalConfig,
  addProvider,
  updateProvider,
  toggleProvider: toggleProviderState,
  updateGlobalConfig
} = useIntelligenceManager()

const testResult = ref<TestResult | null>(null)
const isTesting = ref(false)

function handleAddProvider(): void {
  const nextIndex = providers.value.length + 1
  const id = `custom-${Date.now()}`
  addProvider({
    id,
    type: AiProviderType.CUSTOM,
    name: t('settings.aisdk.providers') + ` ${nextIndex}`,
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

function handleToggleProvider(provider: AiProviderConfig): void {
  toggleProviderState(provider.id)
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

function handleUpdateGlobal(updatedConfig: AISDKGlobalConfig): void {
  updateGlobalConfig(updatedConfig)
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

<style lang="scss" scoped>
@import './intelligence-shared.scss';
</style>
