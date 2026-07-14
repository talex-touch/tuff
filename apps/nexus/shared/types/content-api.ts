export interface DocsSearchItem {
  id: string
  path: string
  locale: 'en' | 'zh'
  title: string
  description: string
  tags: string[]
}

export interface DocsSearchResponse {
  items: DocsSearchItem[]
}

export interface SidebarComponentItem {
  title: string
  description: string
  tags: string[]
  path: string
  normalizedPath: string
  locale: 'en' | 'zh'
  category: string | null
  syncStatus: 'not_started' | 'in_progress' | 'migrated' | 'verified'
  verified: boolean
}

export interface PolicyContentDocument extends Record<string, unknown> {
  path?: string
  title?: string
  description?: string
  body?: unknown
}

export interface PolicyContentResponse {
  doc: PolicyContentDocument | null
}
