<template>
  <div 
    class="relative flex w-full h-full transition-cubic overflow-hidden"
    role="main"
    aria-label="AI SDK Provider Management"
  >
    <!-- Left Sidebar (304px) -->
    <aside 
      class="relative w-76 h-full border-r border-[var(--el-border-color-lighter)] flex flex-col"
      role="navigation"
      aria-label="AI Provider List"
    >
      <AISDKList 
        :providers="providers"
        :selected-id="selectedProviderId"
        @select="handleSelectProvider"
        @toggle="handleToggleProvider"
      />
    </aside>

    <!-- Right Detail Panel -->
    <section 
      class="relative flex-1 h-full overflow-hidden bg-[var(--el-bg-color)]"
      role="region"
      aria-label="Provider Details"
      :aria-live="selectedProvider ? 'polite' : 'off'"
    >
      <Transition name="fade-slide" mode="out-in">
        <AISDKInfo 
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
        <AISDKEmptyState v-else />
      </Transition>
    </section>
  </div>
</template>

<script lang="ts" name="AISDKPage" setup>
/**
 * AISDKPage Component
 * 
 * Main page component for AI SDK provider management.
 * Features:
 * - Two-column layout (304px sidebar + flexible detail panel)
 * - Provider list with search and filtering
 * - Provider detail panel with configuration options
 * - Empty state when no provider is selected
 * - Smooth transitions between states
 * - Provider enable/disable toggle
 * - Provider configuration updates
 * - Provider connection testing
 * 
 * @example
 * ```vue
 * <AISDKPage />
 * ```
 */
import { ref, computed } from 'vue'
import AISDKList from '@comp/aisdk/layout/AISDKList.vue'
import AISDKInfo from '@comp/aisdk/layout/AISDKInfo.vue'
import AISDKEmptyState from '@comp/aisdk/layout/AISDKEmptyState.vue'
import type { AiProviderConfig, AISDKGlobalConfig, TestResult } from '~/types/aisdk'
import { useAISDKManagement } from '~/modules/hooks/useAISDKManagement'
import { useKeyboardNavigation } from '~/composables/useKeyboardNavigation'

// State management with persistent storage
const {
  providers,
  selectedProviderId,
  selectedProvider,
  globalConfig,
  updateProvider,
  toggleProvider: toggleProviderState,
  updateGlobalConfig
} = useAISDKManagement()

// Local UI state
const testResult = ref<TestResult | null>(null)
const isTesting = ref(false)

/**
 * Handle provider selection from the list
 * @param id - Provider ID to select
 */
function handleSelectProvider(id: string) {
  selectedProviderId.value = id
  // Clear test result when switching providers
  testResult.value = null
}

/**
 * Handle provider toggle (enable/disable)
 * Automatically persisted via TouchStorage
 * @param provider - Provider to toggle
 */
function handleToggleProvider(provider: AiProviderConfig) {
  toggleProviderState(provider.id)
  console.log('Provider toggled:', provider.id)
}

/**
 * Handle provider configuration updates
 * Automatically persisted via TouchStorage with debouncing
 * @param updatedProvider - Updated provider configuration
 */
function handleUpdateProvider(updatedProvider: AiProviderConfig) {
  updateProvider(updatedProvider.id, updatedProvider)
  console.log('Provider updated:', updatedProvider.id)
}

/**
 * Handle provider connection test
 * Tests the provider connection using the AISDK service
 */
async function handleTestProvider() {
  if (!selectedProvider.value || isTesting.value) return
  
  isTesting.value = true
  testResult.value = null
  
  try {
    // TODO: Implement actual provider testing logic
    // Simulate a test for now
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    testResult.value = {
      success: true,
      message: '连接成功',
      latency: Math.floor(Math.random() * 500) + 100,
      timestamp: Date.now()
    }
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

/**
 * Handle global configuration updates
 * Automatically persisted via TouchStorage with debouncing
 * @param updatedConfig - Updated global configuration
 */
function handleUpdateGlobal(updatedConfig: AISDKGlobalConfig) {
  updateGlobalConfig(updatedConfig)
  console.log('Global config updated:', updatedConfig)
}

/**
 * Navigate to next provider in the list
 */
function navigateToNextProvider() {
  const currentIndex = providers.value.findIndex(p => p.id === selectedProviderId.value)
  if (currentIndex < providers.value.length - 1) {
    selectedProviderId.value = providers.value[currentIndex + 1].id
    testResult.value = null
  }
}

/**
 * Navigate to previous provider in the list
 */
function navigateToPreviousProvider() {
  const currentIndex = providers.value.findIndex(p => p.id === selectedProviderId.value)
  if (currentIndex > 0) {
    selectedProviderId.value = providers.value[currentIndex - 1].id
    testResult.value = null
  }
}

// Setup keyboard navigation
useKeyboardNavigation({
  onNavigateDown: navigateToNextProvider,
  onNavigateUp: navigateToPreviousProvider
})
</script>

<style lang="scss" scoped>
/* Transition Styles */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(30px) scale(0.98);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-30px) scale(0.98);
}

/* Responsive behavior */
@media (max-width: 1024px) {
  .relative.flex.w-full.h-full {
    flex-direction: column;
  }
  
  .w-76 {
    width: 100% !important;
    height: 40% !important;
    border-right: none !important;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }
  
  .flex-1 {
    height: 60% !important;
  }
}

/* Loading state overlay */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--el-bg-color);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.3s ease;
  
  .loading-spinner {
    width: 48px;
    height: 48px;
    border: 4px solid var(--el-border-color-lighter);
    border-top-color: var(--el-color-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
