import type { Ref } from 'vue'
import type {
  AgentCategory,
  AgentInstallResult,
  AgentSearchOptions,
  AgentSearchResult,
  MarketAgentInfo,
} from '../../transport/sdk/domains/agents-market'
import { ref } from 'vue'
import { useAgentMarketSdk } from './use-agent-market-sdk'

export type {
  AgentCategory,
  AgentInstallResult,
  AgentSearchOptions,
  AgentSearchResult,
  MarketAgentInfo,
}

interface AgentMarketComposable {
  // Search and browse
  searchAgents: (options?: AgentSearchOptions) => Promise<AgentSearchResult>
  getAgentDetails: (agentId: string) => Promise<MarketAgentInfo | null>
  getFeaturedAgents: () => Promise<MarketAgentInfo[]>
  getInstalledAgents: () => Promise<MarketAgentInfo[]>
  getCategories: () => Promise<AgentCategory[]>

  // Install/Uninstall
  installAgent: (agentId: string, version?: string) => Promise<AgentInstallResult>
  uninstallAgent: (agentId: string) => Promise<AgentInstallResult>
  checkUpdates: () => Promise<MarketAgentInfo[]>

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
 * const { searchAgents, installAgent, isLoading } = useAgentMarket()
 *
 * // Search agents
 * const result = await searchAgents({ keyword: 'file', category: 'productivity' })
 *
 * // Install an agent
 * const installResult = await installAgent('community.workflow-agent')
 * ```
 */
/**
 * @deprecated 请优先使用 useAgentMarketSdk() 直接调用 typed domain SDK，该 hook 仅保留兼容壳。
 */
export function useAgentMarket(): AgentMarketComposable {
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)
  const agentMarketSdk = useAgentMarketSdk()

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
      withLoading(() => agentMarketSdk.searchAgents(options)),

    getAgentDetails: (agentId: string) =>
      withLoading(() => agentMarketSdk.getAgentDetails(agentId)),

    getFeaturedAgents: () =>
      withLoading(() => agentMarketSdk.getFeaturedAgents()),

    getInstalledAgents: () =>
      withLoading(() => agentMarketSdk.getInstalledAgents()),

    getCategories: () =>
      withLoading(() => agentMarketSdk.getCategories()),

    installAgent: (agentId: string, version?: string) =>
      withLoading(() => agentMarketSdk.installAgent(agentId, version)),

    uninstallAgent: (agentId: string) =>
      withLoading(() => agentMarketSdk.uninstallAgent(agentId)),

    checkUpdates: () =>
      withLoading(() => agentMarketSdk.checkUpdates()),

    isLoading,
    lastError,
  }
}
