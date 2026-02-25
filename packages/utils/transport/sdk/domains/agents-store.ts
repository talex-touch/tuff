import type {
  AgentsStoreCategoriesResponse,
  AgentsStoreInfo,
  AgentsStoreInstallResponse,
  AgentsStoreSearchRequest,
  AgentsStoreSearchResponse,
} from '../../events/types'
import type { ITuffTransport } from '../../types'
import { AgentsEvents } from '../../events'

export type StoreAgentInfo = AgentsStoreInfo
export type AgentSearchOptions = AgentsStoreSearchRequest
export type AgentSearchResult = AgentsStoreSearchResponse
export type AgentInstallResult = AgentsStoreInstallResponse
export type AgentCategory = AgentsStoreCategoriesResponse[number]

export interface AgentStoreSdk {
  searchAgents: (options?: AgentSearchOptions) => Promise<AgentSearchResult>
  getAgentDetails: (agentId: string) => Promise<StoreAgentInfo | null>
  getFeaturedAgents: () => Promise<StoreAgentInfo[]>
  getInstalledAgents: () => Promise<StoreAgentInfo[]>
  getCategories: () => Promise<AgentCategory[]>
  installAgent: (agentId: string, version?: string) => Promise<AgentInstallResult>
  uninstallAgent: (agentId: string) => Promise<AgentInstallResult>
  checkUpdates: () => Promise<StoreAgentInfo[]>
}

export function createAgentStoreSdk(transport: ITuffTransport): AgentStoreSdk {
  return {
    searchAgents: options => transport.send(AgentsEvents.store.search, options),

    getAgentDetails: agentId => transport.send(AgentsEvents.store.get, { agentId }),

    getFeaturedAgents: () => transport.send(AgentsEvents.store.featured),

    getInstalledAgents: () => transport.send(AgentsEvents.store.installed),

    getCategories: () => transport.send(AgentsEvents.store.categories),

    installAgent: (agentId, version) =>
      transport.send(AgentsEvents.store.install, { agentId, version }),

    uninstallAgent: agentId => transport.send(AgentsEvents.store.uninstall, { agentId }),

    checkUpdates: () => transport.send(AgentsEvents.store.checkUpdates),
  }
}
