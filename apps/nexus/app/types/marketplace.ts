import type { PluginCategoryId } from '~/utils/plugin-categories'

export interface MarketplacePluginAuthor {
  name: string
  avatarColor?: string
}

export type PluginChannel = 'SNAPSHOT' | 'BETA' | 'RELEASE'

export interface MarketplacePluginVersion {
  id: string
  channel: PluginChannel
  version: string
  createdAt: string
  signature: string
  packageUrl: string
  packageSize?: number
  changelog?: string | null
  readmeMarkdown?: string | null
}

export interface MarketplacePluginSummary {
  id: string
  slug: string
  name: string
  summary: string
  category: string
  installs: number
  isOfficial: boolean
  badges: string[]
  iconUrl?: string | null
  author?: MarketplacePluginAuthor | null
  latestVersion?: MarketplacePluginVersion | null
}

export interface MarketplacePluginDetail extends MarketplacePluginSummary {
  readmeMarkdown?: string | null
  versions?: MarketplacePluginVersion[]
}

export type FilterCategory = PluginCategoryId | 'all'
