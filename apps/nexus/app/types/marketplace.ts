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

export type MarketplacePluginReviewStatus = 'pending' | 'approved' | 'rejected'

export interface MarketplacePluginReviewAuthor {
  name: string
  avatarUrl?: string | null
}

export interface MarketplacePluginReview {
  id: string
  pluginId: string
  rating: number
  title?: string | null
  content: string
  author: MarketplacePluginReviewAuthor
  status?: MarketplacePluginReviewStatus
  createdAt: string
  updatedAt: string
}

export interface MarketplacePluginReviewListResponse {
  slug: string
  reviews: MarketplacePluginReview[]
  total: number
  limit: number
  offset: number
}

export interface MarketplacePluginRatingSummary {
  average: number
  count: number
}

export interface MarketplacePluginRatingResponse {
  slug: string
  rating: MarketplacePluginRatingSummary
}

export interface MarketplacePluginReviewSubmitResponse {
  review: MarketplacePluginReview
  rating: MarketplacePluginRatingSummary
}

export type FilterCategory = PluginCategoryId | 'all'
