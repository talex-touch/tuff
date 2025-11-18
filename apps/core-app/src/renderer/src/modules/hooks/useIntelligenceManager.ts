import { ref, computed, watch, onMounted, type Ref, type ComputedRef } from 'vue'
import type {
  AISDKCapabilityConfig,
  AiCapabilityProviderBinding,
  TestResult
} from '@talex-touch/utils/types/intelligence'
import {
  aisdkStorage,
  intelligenceSettings,
  type AiProviderConfig,
  type AISDKGlobalConfig
} from '@talex-touch/utils/renderer/storage'

/**
 * Return type for the useIntelligenceManager composable
 */
interface UseIntelligenceManagerReturn {
  /** Array of all AI provider configurations */
  providers: Ref<AiProviderConfig[]>
  /** Currently selected provider ID */
  selectedProviderId: Ref<string | null>
  /** Currently selected provider object (computed for reactive updates) */
  selectedProvider: ComputedRef<AiProviderConfig | null>
  /** Global AISDK configuration */
  globalConfig: Ref<AISDKGlobalConfig>
  /** Capability routing configuration */
  capabilities: Ref<Record<string, AISDKCapabilityConfig>>
  /** Map of test results by provider ID */
  testResults: Ref<Map<string, TestResult>>
  /** Loading state for async operations */
  loading: Ref<boolean>
  /** Computed array of enabled providers */
  enabledProviders: ComputedRef<AiProviderConfig[]>
  /** Computed array of disabled providers */
  disabledProviders: ComputedRef<AiProviderConfig[]>
  /** Function to select a provider by ID */
  selectProvider: (id: string | null) => void
  /** Function to add a new provider */
  addProvider: (provider: AiProviderConfig) => void
  /** Function to remove a provider */
  removeProvider: (id: string) => void
  /** Function to update a provider configuration */
  updateProvider: (id: string, updates: Partial<AiProviderConfig>) => void
  /** Function to toggle provider enabled state */
  toggleProvider: (id: string) => void
  /** Function to update global configuration */
  updateGlobalConfig: (updates: Partial<AISDKGlobalConfig>) => void
  /** Function to update capability metadata */
  updateCapability: (id: string, updates: Partial<AISDKCapabilityConfig>) => void
  /** Function to assign provider bindings for a capability */
  setCapabilityProviders: (id: string, providers: AiCapabilityProviderBinding[]) => void
  /** Function to set test result for a provider */
  setTestResult: (id: string, result: TestResult) => void
  /** Function to clear test result for a provider */
  clearTestResult: (id: string) => void
  /** Function to get a provider by ID */
  getProvider: (id: string) => AiProviderConfig | undefined
}

/**
 * Composable for managing Intelligence provider state and configuration.
 *
 * Features:
 * - Provider selection state management with type-safe provider objects
 * - Automatic grouping of enabled and disabled providers
 * - Provider configuration updates with reactivity
 * - Global AISDK settings management
 * - Test result tracking per provider
 * - Automatic cleanup when selected provider is disabled
 *
 * @returns AISDK management state and control methods
 *
 * @example
 * ```ts
 * const {
 *   providers,
 *   selectedProvider,
 *   enabledProviders,
 *   selectProvider,
 *   updateProvider,
 *   toggleProvider
 * } = useIntelligenceManager()
 *
 * // Select a provider
 * selectProvider('openai-default')
 *
 * // Update provider configuration
 * updateProvider('openai-default', { apiKey: 'sk-...' })
 *
 * // Toggle provider enabled state
 * toggleProvider('openai-default')
 * ```
 */
export function useIntelligenceManager(): UseIntelligenceManagerReturn {
  // Core state - now backed by persistent storage from utils package
  const providers = computed<AiProviderConfig[]>({
    get: () => intelligenceSettings.get().providers,
    set: (value) => {
      const currentData = intelligenceSettings.get()
      intelligenceSettings.set({
        ...currentData,
        providers: value
      })
    }
  })

  const selectedProviderId = ref<string | null>(null)

  const globalConfig = computed<AISDKGlobalConfig>({
    get: () => intelligenceSettings.get().globalConfig,
    set: (value) => {
      const currentData = intelligenceSettings.get()
      intelligenceSettings.set({
        ...currentData,
        globalConfig: value
      })
    }
  })

  const capabilities = computed<Record<string, AISDKCapabilityConfig>>({
    get: () => aisdkStorage.data.capabilities,
    set: (value) => {
      aisdkStorage.data.capabilities = value
    }
  })

  const testResults = ref<Map<string, TestResult>>(new Map())
  const loading = ref(false)

  /**
   * Currently selected provider object.
   * Automatically returns null when:
   * - No provider is selected
   * - Selected provider ID doesn't exist
   */
  const selectedProvider = computed<AiProviderConfig | null>(() => {
    if (!selectedProviderId.value) return null
    return providers.value.find((p) => p.id === selectedProviderId.value) ?? null
  })

  /**
   * Computed array of enabled providers, sorted by priority
   */
  const enabledProviders = computed<AiProviderConfig[]>(() => {
    return providers.value
      .filter((p) => p.enabled)
      .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
  })

  /**
   * Computed array of disabled providers, sorted by name
   */
  const disabledProviders = computed<AiProviderConfig[]>(() => {
    return providers.value
      .filter((p) => !p.enabled)
      .sort((a, b) => a.name.localeCompare(b.name))
  })

  /**
   * Watch for provider changes to clear selection if selected provider is removed
   */
  watch(
    () => providers.value,
    (newProviders) => {
      if (!selectedProviderId.value) return

      const exists = newProviders.some((p) => p.id === selectedProviderId.value)
      if (!exists) {
        selectedProviderId.value = null
      }
    },
    { deep: true }
  )

  /**
   * Selects a provider by ID.
   * Pass null to clear selection.
   *
   * @param id - The unique identifier of the provider to select, or null to clear
   */
  function selectProvider(id: string | null): void {
    if (id === selectedProviderId.value) return
    selectedProviderId.value = id
  }

  /**
   * Adds a provider configuration
   */
  function addProvider(provider: AiProviderConfig): void {
    intelligenceSettings.addProvider(provider)
  }

  /**
   * Removes a provider by id
   */
  function removeProvider(id: string): void {
    intelligenceSettings.removeProvider(id)
    if (selectedProviderId.value === id) {
      selectedProviderId.value = null
    }
  }

  /**
   * Updates a provider's configuration.
   * Merges the updates with the existing configuration.
   * Changes are automatically persisted via TouchStorage auto-save.
   *
   * @param id - The unique identifier of the provider to update
   * @param updates - Partial provider configuration to merge
   */
  function updateProvider(id: string, updates: Partial<AiProviderConfig>): void {
    intelligenceSettings.updateProvider(id, updates)
  }

  /**
   * Toggles a provider's enabled state.
   * If the provider is currently selected and being disabled, clears the selection.
   * Changes are automatically persisted via TouchStorage auto-save.
   *
   * @param id - The unique identifier of the provider to toggle
   */
  function toggleProvider(id: string): void {
    const provider = intelligenceSettings.get().providers.find((p) => p.id === id)
    if (!provider) return

    const newEnabledState = !provider.enabled
    updateProvider(id, { enabled: newEnabledState })

    // Clear selection if disabling the currently selected provider
    if (!newEnabledState && selectedProviderId.value === id) {
      selectedProviderId.value = null
    }
  }

  /**
   * Updates the global Intelligence configuration.
   * Merges the updates with the existing configuration.
   * Changes are automatically persisted via TouchStorage auto-save.
   *
   * @param updates - Partial global configuration to merge
   */
  function updateGlobalConfig(updates: Partial<AISDKGlobalConfig>): void {
    intelligenceSettings.updateGlobalConfig(updates)
  }

  /**
   * Updates capability metadata
   */
  function updateCapability(id: string, updates: Partial<AISDKCapabilityConfig>): void {
    const updated = { ...capabilities.value }
    if (!updated[id]) {
      updated[id] = {
        id,
        label: id,
        providers: [],
        ...updates
      }
    } else {
      updated[id] = {
        ...updated[id],
        ...updates
      }
    }
    capabilities.value = updated
  }

  /**
   * Replaces bindings for a capability
   */
  function setCapabilityProviders(id: string, providers: AiCapabilityProviderBinding[]): void {
    const updated = { ...capabilities.value }
    if (!updated[id]) {
      updated[id] = {
        id,
        label: id,
        providers
      }
    } else {
      updated[id] = {
        ...updated[id],
        providers
      }
    }
    capabilities.value = updated
  }

  /**
   * Sets a test result for a provider.
   *
   * @param id - The unique identifier of the provider
   * @param result - The test result to store
   */
  function setTestResult(id: string, result: TestResult): void {
    testResults.value.set(id, result)
  }

  /**
   * Clears the test result for a provider.
   *
   * @param id - The unique identifier of the provider
   */
  function clearTestResult(id: string): void {
    testResults.value.delete(id)
  }

  /**
   * Gets a provider by ID.
   *
   * @param id - The unique identifier of the provider
   * @returns The provider configuration or undefined if not found
   */
  function getProvider(id: string): AiProviderConfig | undefined {
    return intelligenceSettings.get().providers.find((p) => p.id === id)
  }

  return {
    providers,
    selectedProviderId,
    selectedProvider,
    globalConfig,
    capabilities,
    testResults,
    loading,
    enabledProviders,
    disabledProviders,
    selectProvider,
    addProvider,
    removeProvider,
    updateProvider,
    toggleProvider,
    updateGlobalConfig,
    updateCapability,
    setCapabilityProviders,
    setTestResult,
    clearTestResult,
    getProvider
  }
}
