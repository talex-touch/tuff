import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import type {
  AiProviderConfig,
  AISDKGlobalConfig,
  TestResult
} from '~/types/aisdk'
import { DEFAULT_PROVIDERS, DEFAULT_GLOBAL_CONFIG } from '~/types/aisdk'

/**
 * Return type for the useAISDKManagement composable
 */
interface UseAISDKManagementReturn {
  /** Array of all AI provider configurations */
  providers: Ref<AiProviderConfig[]>
  /** Currently selected provider ID */
  selectedProviderId: Ref<string | null>
  /** Currently selected provider object (computed for reactive updates) */
  selectedProvider: ComputedRef<AiProviderConfig | null>
  /** Global AISDK configuration */
  globalConfig: Ref<AISDKGlobalConfig>
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
  /** Function to update a provider configuration */
  updateProvider: (id: string, updates: Partial<AiProviderConfig>) => void
  /** Function to toggle provider enabled state */
  toggleProvider: (id: string) => void
  /** Function to update global configuration */
  updateGlobalConfig: (updates: Partial<AISDKGlobalConfig>) => void
  /** Function to set test result for a provider */
  setTestResult: (id: string, result: TestResult) => void
  /** Function to clear test result for a provider */
  clearTestResult: (id: string) => void
  /** Function to get a provider by ID */
  getProvider: (id: string) => AiProviderConfig | undefined
}

/**
 * Composable for managing AISDK provider state and configuration.
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
 * } = useAISDKManagement()
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
export function useAISDKManagement(): UseAISDKManagementReturn {
  // Core state
  const providers = ref<AiProviderConfig[]>([...DEFAULT_PROVIDERS])
  const selectedProviderId = ref<string | null>(null)
  const globalConfig = ref<AISDKGlobalConfig>({ ...DEFAULT_GLOBAL_CONFIG })
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
   * Updates a provider's configuration.
   * Merges the updates with the existing configuration.
   *
   * @param id - The unique identifier of the provider to update
   * @param updates - Partial provider configuration to merge
   */
  function updateProvider(id: string, updates: Partial<AiProviderConfig>): void {
    const index = providers.value.findIndex((p) => p.id === id)
    if (index === -1) return

    providers.value[index] = {
      ...providers.value[index],
      ...updates
    }
  }

  /**
   * Toggles a provider's enabled state.
   * If the provider is currently selected and being disabled, clears the selection.
   *
   * @param id - The unique identifier of the provider to toggle
   */
  function toggleProvider(id: string): void {
    const provider = providers.value.find((p) => p.id === id)
    if (!provider) return

    const newEnabledState = !provider.enabled
    updateProvider(id, { enabled: newEnabledState })

    // Clear selection if disabling the currently selected provider
    if (!newEnabledState && selectedProviderId.value === id) {
      selectedProviderId.value = null
    }
  }

  /**
   * Updates the global AISDK configuration.
   * Merges the updates with the existing configuration.
   *
   * @param updates - Partial global configuration to merge
   */
  function updateGlobalConfig(updates: Partial<AISDKGlobalConfig>): void {
    globalConfig.value = {
      ...globalConfig.value,
      ...updates
    }
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
    return providers.value.find((p) => p.id === id)
  }

  return {
    providers,
    selectedProviderId,
    selectedProvider,
    globalConfig,
    testResults,
    loading,
    enabledProviders,
    disabledProviders,
    selectProvider,
    updateProvider,
    toggleProvider,
    updateGlobalConfig,
    setTestResult,
    clearTestResult,
    getProvider
  }
}
