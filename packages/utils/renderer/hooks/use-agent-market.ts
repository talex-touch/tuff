import type { Ref } from 'vue'
import { ref } from 'vue'
import { useChannel } from './use-channel'

/**
 * Market agent info
 */
export interface MarketAgentInfo {
  id: string
  name: string
  description: string
  version: string
  author: string
  category: string
  capabilities: string[]
  tags: string[]
  downloads: number
  rating: number
  ratingCount: number
  source: 'official' | 'community' | 'local'
  isInstalled: boolean
  installedVersion?: string
  hasUpdate?: boolean
  createdAt: number
  updatedAt: number
  icon?: string
  homepage?: string
  repository?: string
}

/**
 * Agent search options
 */
export interface AgentSearchOptions {
  keyword?: string
  category?: string
  source?: 'official' | 'community' | 'local'
  tags?: string[]
  sortBy?: 'downloads' | 'rating' | 'updated' | 'name'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

/**
 * Agent search result
 */
export interface AgentSearchResult {
  agents: MarketAgentInfo[]
  total: number
  hasMore: boolean
}

/**
 * Agent install result
 */
export interface AgentInstallResult {
  success: boolean
  agentId: string
  version: string
  message?: string
  error?: string
}

/**
 * Category info
 */
export interface AgentCategory {
  id: string
  name: string
  count: number
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
export function useAgentMarket(): AgentMarketComposable {
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)
  const channel = useChannel()

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
      withLoading(() => channel.send<AgentSearchOptions, AgentSearchResult>('agents:market:search', options)),

    getAgentDetails: (agentId: string) =>
      withLoading(() => channel.send<{ agentId: string }, MarketAgentInfo | null>('agents:market:get', { agentId })),

    getFeaturedAgents: () =>
      withLoading(() => channel.send<void, MarketAgentInfo[]>('agents:market:featured')),

    getInstalledAgents: () =>
      withLoading(() => channel.send<void, MarketAgentInfo[]>('agents:market:installed')),

    getCategories: () =>
      withLoading(() => channel.send<void, AgentCategory[]>('agents:market:categories')),

    installAgent: (agentId: string, version?: string) =>
      withLoading(() =>
        channel.send<{ agentId: string, version?: string }, AgentInstallResult>(
          'agents:market:install',
          { agentId, version },
        ),
      ),

    uninstallAgent: (agentId: string) =>
      withLoading(() =>
        channel.send<{ agentId: string }, AgentInstallResult>(
          'agents:market:uninstall',
          { agentId },
        ),
      ),

    checkUpdates: () =>
      withLoading(() => channel.send<void, MarketAgentInfo[]>('agents:market:check-updates')),

    isLoading,
    lastError,
  }
}
