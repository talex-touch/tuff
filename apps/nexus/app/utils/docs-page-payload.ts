export interface DocsLayoutMetaState {
  path?: string
  verified?: boolean
  syncStatus?: string
}

const REDUNDANT_TOP_LEVEL_DOC_KEYS = new Set([
  'rawbody',
  'stem',
  'extension',
  'navigation',
  '__hash__',
])

const REDUNDANT_NESTED_META_KEYS = new Set([
  'body',
  'rawbody',
  'toc',
  '__hash__',
])

function toBooleanFlag(value: unknown): boolean {
  if (value === true)
    return true
  if (typeof value === 'number')
    return value === 1
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return ['1', 'true', 'yes', 'on'].includes(normalized)
  }
  return false
}

/**
 * Trims unused or duplicated `@nuxt/content` fields from a docs page record
 * before Nuxt serializes it into `__NUXT_DATA__`, while preserving `body`,
 * `path`, `title`, `description`, `seo`, `meta`, and timestamp metadata intact
 * for SSR rendering and client hydration.
 */
export function slimDocsPagePayload<T extends Record<string, any> | null | undefined>(record: T): T {
  if (!record || typeof record !== 'object' || Array.isArray(record))
    return record

  const body = record.body
  const hasBodyToc = Boolean(body && typeof body === 'object' && 'toc' in body && (body as Record<string, unknown>).toc)
  const slim: Record<string, any> = {}

  for (const [key, value] of Object.entries(record)) {
    if (REDUNDANT_TOP_LEVEL_DOC_KEYS.has(key))
      continue
    if (key === 'toc' && hasBodyToc)
      continue
    if (key === 'meta' && value && typeof value === 'object' && !Array.isArray(value)) {
      const cleanedMeta: Record<string, any> = {}
      for (const [metaKey, metaValue] of Object.entries(value as Record<string, any>)) {
        if (REDUNDANT_NESTED_META_KEYS.has(metaKey))
          continue
        // Avoid duplicating scalar frontmatter already serialized at the top level.
        if (metaKey in record && record[metaKey] === metaValue)
          continue
        cleanedMeta[metaKey] = metaValue
      }
      if (Object.keys(cleanedMeta).length > 0)
        slim.meta = cleanedMeta
      continue
    }
    slim[key] = value
  }

  return slim as T
}

/**
 * Extracts only the lightweight metadata fields that `layouts/docs.vue` reads
 * from `useState('docs-meta')`, preventing the full document `body` AST from
 * being serialized a second time into `__NUXT_DATA__`.
 */
export function buildDocsMetaState(docMeta: Record<string, any> | null | undefined): DocsLayoutMetaState {
  if (!docMeta || typeof docMeta !== 'object')
    return {}

  const state: DocsLayoutMetaState = {}
  if (typeof docMeta.path === 'string' && docMeta.path)
    state.path = docMeta.path
  if (toBooleanFlag(docMeta.verified))
    state.verified = true
  if (typeof docMeta.syncStatus === 'string' && docMeta.syncStatus.trim())
    state.syncStatus = docMeta.syncStatus.trim()

  return state
}
