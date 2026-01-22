/**
 * Agent Market Service
 *
 * Provides APIs for browsing, searching and managing agents from external sources.
 */

import type { AgentCapability, AgentDescriptor } from '@talex-touch/utils'
import { createLogger } from '../utils/logger'

const log = createLogger('AgentMarket')

/**
 * Market agent metadata
 */
export interface MarketAgentInfo {
  id: string
  name: string
  description: string
  version: string
  author: string
  category:
    | 'productivity'
    | 'file-management'
    | 'data-processing'
    | 'search'
    | 'automation'
    | 'development'
    | 'custom'
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
  category?: MarketAgentInfo['category']
  source?: MarketAgentInfo['source']
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
 * Agent install options
 */
export interface AgentInstallOptions {
  agentId: string
  version?: string
  force?: boolean
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

// Built-in agents catalog
const BUILTIN_AGENTS: MarketAgentInfo[] = [
  {
    id: 'builtin.file-agent',
    name: 'File Agent',
    description: '智能文件管理助手，支持文件搜索、批量重命名、自动整理和重复检测',
    version: '1.0.0',
    author: 'Tuff Team',
    category: 'file-management',
    capabilities: ['file.search', 'file.organize', 'file.rename', 'file.duplicate'],
    tags: ['file', 'organize', 'rename', 'duplicate'],
    downloads: 0,
    rating: 5,
    ratingCount: 0,
    source: 'official',
    isInstalled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    icon: 'i-carbon-folder'
  },
  {
    id: 'builtin.search-agent',
    name: 'Search Agent',
    description: '智能搜索增强助手，提供语义搜索、搜索建议和结果排序优化',
    version: '1.0.0',
    author: 'Tuff Team',
    category: 'search',
    capabilities: ['search.smart', 'search.semantic', 'search.suggest', 'search.rank'],
    tags: ['search', 'semantic', 'suggest'],
    downloads: 0,
    rating: 5,
    ratingCount: 0,
    source: 'official',
    isInstalled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    icon: 'i-carbon-search'
  },
  {
    id: 'builtin.data-agent',
    name: 'Data Agent',
    description: '数据处理助手，支持数据提取、格式转换、清洗和分析',
    version: '1.0.0',
    author: 'Tuff Team',
    category: 'data-processing',
    capabilities: ['data.extract', 'data.transform', 'data.format', 'data.clean', 'data.analyze'],
    tags: ['data', 'transform', 'json', 'csv', 'yaml'],
    downloads: 0,
    rating: 5,
    ratingCount: 0,
    source: 'official',
    isInstalled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    icon: 'i-carbon-data-base'
  }
]

// Featured/recommended agents for the market
const FEATURED_AGENTS: MarketAgentInfo[] = [
  {
    id: 'community.workflow-agent',
    name: 'Workflow Agent',
    description: '工作流自动化助手，支持创建和执行复杂的自动化任务流程',
    version: '0.1.0',
    author: 'Community',
    category: 'automation',
    capabilities: ['workflow.create', 'workflow.execute', 'workflow.schedule'],
    tags: ['workflow', 'automation', 'schedule'],
    downloads: 150,
    rating: 4.5,
    ratingCount: 12,
    source: 'community',
    isInstalled: false,
    createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
    icon: 'i-carbon-flow'
  },
  {
    id: 'community.code-agent',
    name: 'Code Agent',
    description: '代码辅助助手，支持代码分析、重构建议和文档生成',
    version: '0.2.0',
    author: 'Community',
    category: 'development',
    capabilities: ['code.analyze', 'code.refactor', 'code.document'],
    tags: ['code', 'development', 'refactor'],
    downloads: 89,
    rating: 4.2,
    ratingCount: 8,
    source: 'community',
    isInstalled: false,
    createdAt: Date.now() - 45 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 14 * 24 * 60 * 60 * 1000,
    icon: 'i-carbon-code'
  },
  {
    id: 'community.translator-agent',
    name: 'Translator Agent',
    description: '智能翻译助手，支持多语言翻译、术语管理和翻译记忆',
    version: '0.1.5',
    author: 'Community',
    category: 'productivity',
    capabilities: ['translate.text', 'translate.document', 'translate.batch'],
    tags: ['translate', 'language', 'i18n'],
    downloads: 234,
    rating: 4.7,
    ratingCount: 23,
    source: 'community',
    isInstalled: false,
    createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
    icon: 'i-carbon-translate'
  }
]

/**
 * Agent Market Service
 */
class AgentMarketService {
  private installedAgentIds: Set<string> = new Set([
    'builtin.file-agent',
    'builtin.search-agent',
    'builtin.data-agent'
  ])

  /**
   * Search agents in the market
   */
  async searchAgents(options: AgentSearchOptions = {}): Promise<AgentSearchResult> {
    const {
      keyword,
      category,
      source,
      tags,
      sortBy = 'downloads',
      sortOrder = 'desc',
      limit = 20,
      offset = 0
    } = options

    log.debug(`Searching agents: ${JSON.stringify(options)}`)

    // Combine all agents
    let agents = [...BUILTIN_AGENTS, ...FEATURED_AGENTS]

    // Update installed status
    agents = agents.map((a) => ({
      ...a,
      isInstalled: this.installedAgentIds.has(a.id)
    }))

    // Filter by keyword
    if (keyword) {
      const lowerKeyword = keyword.toLowerCase()
      agents = agents.filter(
        (a) =>
          a.name.toLowerCase().includes(lowerKeyword) ||
          a.description.toLowerCase().includes(lowerKeyword) ||
          a.tags.some((t) => t.toLowerCase().includes(lowerKeyword))
      )
    }

    // Filter by category
    if (category) {
      agents = agents.filter((a) => a.category === category)
    }

    // Filter by source
    if (source) {
      agents = agents.filter((a) => a.source === source)
    }

    // Filter by tags
    if (tags && tags.length > 0) {
      agents = agents.filter((a) => tags.some((t) => a.tags.includes(t)))
    }

    // Sort
    agents.sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'downloads':
          comparison = a.downloads - b.downloads
          break
        case 'rating':
          comparison = a.rating - b.rating
          break
        case 'updated':
          comparison = a.updatedAt - b.updatedAt
          break
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
      }
      return sortOrder === 'desc' ? -comparison : comparison
    })

    const total = agents.length
    const paginated = agents.slice(offset, offset + limit)

    return {
      agents: paginated,
      total,
      hasMore: offset + limit < total
    }
  }

  /**
   * Get agent details by ID
   */
  async getAgentDetails(agentId: string): Promise<MarketAgentInfo | null> {
    const allAgents = [...BUILTIN_AGENTS, ...FEATURED_AGENTS]
    const agent = allAgents.find((a) => a.id === agentId)

    if (agent) {
      return {
        ...agent,
        isInstalled: this.installedAgentIds.has(agent.id)
      }
    }

    return null
  }

  /**
   * Get featured/recommended agents
   */
  async getFeaturedAgents(): Promise<MarketAgentInfo[]> {
    return FEATURED_AGENTS.map((a) => ({
      ...a,
      isInstalled: this.installedAgentIds.has(a.id)
    }))
  }

  /**
   * Get installed agents
   */
  async getInstalledAgents(): Promise<MarketAgentInfo[]> {
    const allAgents = [...BUILTIN_AGENTS, ...FEATURED_AGENTS]
    return allAgents
      .filter((a) => this.installedAgentIds.has(a.id))
      .map((a) => ({ ...a, isInstalled: true }))
  }

  /**
   * Get available categories
   */
  getCategories(): { id: string; name: string; count: number }[] {
    const allAgents = [...BUILTIN_AGENTS, ...FEATURED_AGENTS]
    const categoryMap = new Map<string, number>()

    for (const agent of allAgents) {
      const count = categoryMap.get(agent.category) || 0
      categoryMap.set(agent.category, count + 1)
    }

    const categoryNames: Record<string, string> = {
      productivity: '生产力',
      'file-management': '文件管理',
      'data-processing': '数据处理',
      search: '搜索',
      automation: '自动化',
      development: '开发',
      custom: '自定义'
    }

    return Array.from(categoryMap.entries()).map(([id, count]) => ({
      id,
      name: categoryNames[id] || id,
      count
    }))
  }

  /**
   * Install an agent (placeholder for future implementation)
   */
  async installAgent(options: AgentInstallOptions): Promise<AgentInstallResult> {
    const { agentId, version } = options

    log.info(`Installing agent: ${agentId}@${version || 'latest'}`)

    // Check if agent exists
    const agent = await this.getAgentDetails(agentId)
    if (!agent) {
      return {
        success: false,
        agentId,
        version: version || 'unknown',
        error: `Agent ${agentId} not found`
      }
    }

    // Check if already installed
    if (this.installedAgentIds.has(agentId)) {
      return {
        success: false,
        agentId,
        version: agent.version,
        error: 'Agent already installed'
      }
    }

    // TODO: Actually download and install the agent
    // For now, just mark as installed
    this.installedAgentIds.add(agentId)

    return {
      success: true,
      agentId,
      version: agent.version,
      message: `Agent ${agent.name} installed successfully`
    }
  }

  /**
   * Uninstall an agent
   */
  async uninstallAgent(agentId: string): Promise<AgentInstallResult> {
    log.info(`Uninstalling agent: ${agentId}`)

    // Check if it's a builtin agent
    if (agentId.startsWith('builtin.')) {
      return {
        success: false,
        agentId,
        version: 'unknown',
        error: 'Cannot uninstall builtin agents'
      }
    }

    if (!this.installedAgentIds.has(agentId)) {
      return {
        success: false,
        agentId,
        version: 'unknown',
        error: 'Agent not installed'
      }
    }

    // TODO: Actually remove the agent
    this.installedAgentIds.delete(agentId)

    return {
      success: true,
      agentId,
      version: 'unknown',
      message: 'Agent uninstalled successfully'
    }
  }

  /**
   * Check for agent updates
   */
  async checkUpdates(): Promise<MarketAgentInfo[]> {
    // For now, no updates available
    return []
  }

  /**
   * Convert MarketAgentInfo to AgentDescriptor format
   */
  toDescriptor(agent: MarketAgentInfo): AgentDescriptor {
    const resolveCapabilityType = (capabilityId: string): AgentCapability['type'] => {
      const lowered = capabilityId.toLowerCase()
      if (lowered.includes('workflow')) return 'workflow'
      if (lowered.includes('chat')) return 'chat'
      if (lowered.includes('search') || lowered.includes('query')) return 'query'
      return 'action'
    }

    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      version: agent.version,
      category: agent.category as AgentDescriptor['category'],
      enabled: agent.isInstalled,
      capabilities: agent.capabilities.map((c) => ({
        id: c,
        type: resolveCapabilityType(c),
        name: c,
        description: ''
      })),
      tools: [],
      config: {}
    }
  }
}

// Singleton instance
export const agentMarketService = new AgentMarketService()
