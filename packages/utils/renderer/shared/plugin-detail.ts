export type SharedPluginTrustLevel = 'official' | 'verified' | 'unverified'

export interface SharedPluginAuthor {
  name: string
  avatarUrl?: string
  avatarColor?: string
}

export interface SharedPluginCategory {
  id?: string
  label?: string
}

export interface SharedPluginVersion {
  id?: string
  version: string
  channel?: string
  createdAt?: string | number | Date
  packageSize?: number
  changelog?: string | null
  packageUrl?: string
  signature?: string
  readmeMarkdown?: string | null
}

export interface SharedPluginReadme {
  markdown?: string | null
  url?: string
}

export interface SharedPluginMetaItem {
  label: string
  value: string
  icon?: string
  highlight?: 'upgrade' | 'installed' | 'info'
}

export interface SharedPluginProvider {
  id?: string
  name?: string
  type?: string
}

export interface SharedPluginDetail {
  id: string
  name: string
  summary?: string
  author?: SharedPluginAuthor
  category?: SharedPluginCategory
  badges?: string[]
  installs?: number
  official?: boolean
  trustLevel?: SharedPluginTrustLevel
  icon?: string
  iconUrl?: string | null
  latestVersion?: SharedPluginVersion
  versions?: SharedPluginVersion[]
  readme?: SharedPluginReadme
  metaItems?: SharedPluginMetaItem[]
  provider?: SharedPluginProvider
  updatedAt?: string | number | Date
}
