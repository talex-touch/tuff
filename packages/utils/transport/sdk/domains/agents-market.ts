import type {
  AgentsMarketCategoriesResponse,
  AgentsMarketInfo,
  AgentsMarketInstallResponse,
  AgentsMarketSearchRequest,
  AgentsMarketSearchResponse,
} from '../../events/types'
import type { ITuffTransport } from '../../types'
import { AgentsEvents } from '../../events'

export type MarketAgentInfo = AgentsMarketInfo
export type AgentSearchOptions = AgentsMarketSearchRequest
export type AgentSearchResult = AgentsMarketSearchResponse
export type AgentInstallResult = AgentsMarketInstallResponse
export type AgentCategory = AgentsMarketCategoriesResponse[number]

export interface AgentMarketSdk {
  searchAgents: (options?: AgentSearchOptions) => Promise<AgentSearchResult>
  getAgentDetails: (agentId: string) => Promise<MarketAgentInfo | null>
  getFeaturedAgents: () => Promise<MarketAgentInfo[]>
  getInstalledAgents: () => Promise<MarketAgentInfo[]>
  getCategories: () => Promise<AgentCategory[]>
  installAgent: (agentId: string, version?: string) => Promise<AgentInstallResult>
  uninstallAgent: (agentId: string) => Promise<AgentInstallResult>
  checkUpdates: () => Promise<MarketAgentInfo[]>
}

export function createAgentMarketSdk(transport: ITuffTransport): AgentMarketSdk {
  return {
    searchAgents: options => transport.send(AgentsEvents.market.search, options),

    getAgentDetails: agentId => transport.send(AgentsEvents.market.get, { agentId }),

    getFeaturedAgents: () => transport.send(AgentsEvents.market.featured),

    getInstalledAgents: () => transport.send(AgentsEvents.market.installed),

    getCategories: () => transport.send(AgentsEvents.market.categories),

    installAgent: (agentId, version) =>
      transport.send(AgentsEvents.market.install, { agentId, version }),

    uninstallAgent: agentId => transport.send(AgentsEvents.market.uninstall, { agentId }),

    checkUpdates: () => transport.send(AgentsEvents.market.checkUpdates),
  }
}
