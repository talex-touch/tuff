export type PluginChannel = 'SNAPSHOT' | 'BETA' | 'RELEASE'

export type PluginStatus = 'draft' | 'pending' | 'approved' | 'rejected'

export type VersionStatus = 'pending' | 'approved' | 'rejected'

export type DashboardArtifactType = 'plugin' | 'layout' | 'theme'

export interface DashboardPluginAuthor {
  name: string
  avatarColor?: string
}

export interface DashboardPluginVersion {
  id: string
  pluginId: string
  channel: PluginChannel
  version: string
  signature: string
  packageUrl: string
  packageKey: string
  packageSize: number
  readmeMarkdown?: string | null
  changelog?: string | null
  manifest?: Record<string, unknown> | null
  status: VersionStatus
  reviewedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface DashboardPlugin {
  id: string
  userId: string
  ownerOrgId?: string | null
  slug: string
  name: string
  summary: string
  category: string
  artifactType?: DashboardArtifactType
  installs: number
  homepage?: string | null
  isOfficial: boolean
  badges: string[]
  author?: DashboardPluginAuthor | null
  status: PluginStatus
  readmeMarkdown?: string | null
  iconUrl?: string | null
  createdAt: string
  updatedAt: string
  versions?: DashboardPluginVersion[]
  latestVersion?: DashboardPluginVersion | null
}

export interface DashboardPluginResponse {
  plugins: DashboardPlugin[]
  featured: DashboardPlugin[]
  total: number
}
