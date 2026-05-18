import type { PluginCategoryId } from '~/utils/plugin-categories'

export interface StorePluginAuthor {
  name: string
  avatarColor?: string
}

export type PluginChannel = 'SNAPSHOT' | 'BETA' | 'RELEASE'

export interface StorePluginVersion {
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

export interface StorePluginSummary {
  id: string
  slug: string
  name: string
  summary: string
  category: string
  installs: number
  isOfficial: boolean
  badges: string[]
  iconUrl?: string | null
  author?: StorePluginAuthor | null
  latestVersion?: StorePluginVersion | null
}

export interface StorePluginDetail extends StorePluginSummary {
  readmeMarkdown?: string | null
  versions?: StorePluginVersion[]
}

export interface StorePluginContentPackage {
  id: string
  pluginId: string
  kind: string
  title: string
  summary?: string | null
  schemaVersion: number
  visibility: 'private' | 'unlisted' | 'team' | 'public'
  manifest: {
    importTarget: string
    format: string
    minPluginVersion?: string
    [key: string]: unknown
  }
  contentRef?: string | null
  contentInline?: unknown
  createdBy: string
  status: 'draft' | 'pending' | 'published' | 'rejected'
  installCount: number
  createdAt: string
  updatedAt: string
  publishedAt?: string | null
}

export interface StorePluginContentListResponse {
  packages: StorePluginContentPackage[]
  total: number
  limit: number
  offset: number
}

export type StorePluginReviewStatus = 'pending' | 'approved' | 'rejected'

export interface StorePluginReviewAuthor {
  name: string
  avatarUrl?: string | null
}

export interface StorePluginReview {
  id: string
  pluginId: string
  rating: number
  title?: string | null
  content: string
  author: StorePluginReviewAuthor
  status?: StorePluginReviewStatus
  createdAt: string
  updatedAt: string
}

export interface StorePluginReviewListResponse {
  slug: string
  reviews: StorePluginReview[]
  total: number
  limit: number
  offset: number
}

export interface StorePluginRatingSummary {
  average: number
  count: number
}

export interface StorePluginRatingResponse {
  slug: string
  rating: StorePluginRatingSummary
}

export interface StorePluginReviewSubmitResponse {
  review: StorePluginReview
  rating: StorePluginRatingSummary
}

export type FilterCategory = PluginCategoryId | 'all'
