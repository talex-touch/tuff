import type { Ref } from 'vue'
import type {
  AgentCategory,
  AgentInstallResult,
  AgentSearchOptions,
  AgentSearchResult,
  StoreAgentInfo,
} from '../../transport/sdk/domains/agents-store'
import { ref } from 'vue'
import { useAgentStoreSdk } from './use-agent-store-sdk'

export type {
  AgentCategory,
  AgentInstallResult,
  AgentSearchOptions,
  AgentSearchResult,
  StoreAgentInfo,
}

interface AgentStoreComposable {
  // Search and browse
  searchAgents: (options?: AgentSearchOptions) => Promise<AgentSearchResult>
  getAgentDetails: (agentId: string) => Promise<StoreAgentInfo | null>
  getFeaturedAgents: () => Promise<StoreAgentInfo[]>
  getInstalledAgents: () => Promise<StoreAgentInfo[]>
  getCategories: () => Promise<AgentCategory[]>

  // Install/Uninstall
  installAgent: (agentId: string, version?: string) => Promise<AgentInstallResult>
  uninstallAgent: (agentId: string) => Promise<AgentInstallResult>
  checkUpdates: () => Promise<StoreAgentInfo[]>

  // State
  isLoading: Ref<boolean>
  lastError: Ref<string | null>
}

/**
 * Agent Market Composable
 *
 * Provides access to the agent marketplace for browsing, searching,
 * and installing agents.
 *
 * @example
 * ```ts
 * const { searchAgents, installAgent, isLoading } = useAgentStore()
 *
 * // Search agents
 * const result = await searchAgents({ keyword: 'file', category: 'productivity' })
 *
 * // Install an agent
 * const installResult = await installAgent('community.workflow-agent')
 * ```
 */
/**
 * @deprecated 请优先使用 useAgentStoreSdk() 直接调用 typed domain SDK，该 hook 仅保留兼容壳。
 */
export function useAgentStore(): AgentStoreComposable {
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)
  const agentStoreSdk = useAgentStoreSdk()

  async function withLoading<T>(fn: () => Promise<T>): Promise<T> {
    isLoading.value = true
    lastError.value = null
    try {
      return await fn()
    }
    catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      throw error
    }
    finally {
      isLoading.value = false
    }
  }

  return {
    searchAgents: (options?: AgentSearchOptions) =>
      withLoading(() => agentStoreSdk.searchAgents(options)),

    getAgentDetails: (agentId: string) =>
      withLoading(() => agentStoreSdk.getAgentDetails(agentId)),

    getFeaturedAgents: () =>
      withLoading(() => agentStoreSdk.getFeaturedAgents()),

    getInstalledAgents: () =>
      withLoading(() => agentStoreSdk.getInstalledAgents()),

    getCategories: () =>
      withLoading(() => agentStoreSdk.getCategories()),

    installAgent: (agentId: string, version?: string) =>
      withLoading(() => agentStoreSdk.installAgent(agentId, version)),

    uninstallAgent: (agentId: string) =>
      withLoading(() => agentStoreSdk.uninstallAgent(agentId)),

    checkUpdates: () =>
      withLoading(() => agentStoreSdk.checkUpdates()),

    isLoading,
    lastError,
  }
}
