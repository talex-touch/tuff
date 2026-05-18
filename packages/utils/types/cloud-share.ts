export type PluginContentVisibility = 'private' | 'unlisted' | 'team' | 'public'

export type PluginContentStatus = 'draft' | 'pending' | 'published' | 'rejected'

export interface PluginContentManifest {
  importTarget: string
  format: string
  minPluginVersion?: string
  [key: string]: unknown
}

export interface PluginContentPackage {
  id: string
  pluginId: string
  kind: string
  title: string
  summary?: string | null
  schemaVersion: number
  visibility: PluginContentVisibility
  manifest: PluginContentManifest
  contentRef?: string | null
  contentInline?: unknown
  createdBy: string
  status: PluginContentStatus
  installCount: number
  createdAt: string
  updatedAt: string
  publishedAt?: string | null
}

export interface PluginContentPublishInput {
  pluginId: string
  kind: string
  title: string
  summary?: string | null
  schemaVersion: number
  visibility?: PluginContentVisibility
  manifest: PluginContentManifest
  contentRef?: string | null
  contentInline?: unknown
  status?: PluginContentStatus
}

export interface PluginContentListQuery {
  pluginId?: string
  kind?: string
  visibility?: PluginContentVisibility
  status?: PluginContentStatus
  limit?: number
  offset?: number
}

export interface PluginContentListResponse {
  packages: PluginContentPackage[]
  total: number
  limit: number
  offset: number
}

export interface PluginContentPackageResponse {
  package: PluginContentPackage
}

export interface PluginContentInstallResponse {
  package: PluginContentPackage
  installed: true
}

export type CloudShareErrorCode
  = | 'PLUGIN_CONTENT_INVALID_PAYLOAD'
    | 'PLUGIN_CONTENT_NOT_FOUND'
    | 'PLUGIN_CONTENT_FORBIDDEN'
    | 'PLUGIN_CONTENT_UNAVAILABLE'
