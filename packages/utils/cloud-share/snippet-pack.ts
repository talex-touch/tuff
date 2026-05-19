export const TOUCH_SNIPPETS_PLUGIN_ID = 'touch-snippets'
export const SNIPPET_PACK_FORMAT = 'tuff.snippet-pack+json'
export const SNIPPET_PACK_KIND = 'snippet-pack'

export type TuffSnippetType = 'text' | 'code' | 'prompt' | 'template'

export interface TuffSnippet {
  id: string
  type: TuffSnippetType
  title: string
  language: string
  tags: string[]
  content: string
  createdAt: number
  updatedAt: number
  lastUsedAt?: number
  useCount: number
}

export interface TuffSnippetStore {
  version: number
  snippets: TuffSnippet[]
}

export interface TuffSnippetPack {
  format: typeof SNIPPET_PACK_FORMAT
  version: number
  title: string
  summary: string
  pluginId: typeof TOUCH_SNIPPETS_PLUGIN_ID
  kind: typeof SNIPPET_PACK_KIND
  schemaVersion: number
  createdAt: number
  snippets: TuffSnippet[]
  skippedSensitiveCount: number
}

export interface ImportSnippetPackResult extends TuffSnippetStore {
  importedCount: number
  pack: TuffSnippetPack
}

const SENSITIVE_CONTENT_PATTERNS = [
  /(?:api[_-]?key|secret|password|passwd|token|private[_-]?key)\s*[:=]/i,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/,
  /\bsk-[\w-]{20,}\b/,
  /\bghp_\w{20,}\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
]

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeType(value: unknown): TuffSnippetType {
  const type = normalizeText(value).toLowerCase()
  if (type === 'code' || type === 'prompt' || type === 'template')
    return type
  return 'text'
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags))
    return []
  return tags.map(tag => normalizeText(tag)).filter(Boolean)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function parseSnippets(raw: unknown): TuffSnippetStore {
  if (!raw)
    return { version: 1, snippets: [] }
  if (typeof raw === 'string') {
    try {
      return parseSnippets(JSON.parse(raw))
    }
    catch {
      return { version: 1, snippets: [] }
    }
  }
  if (typeof raw === 'object') {
    const value = raw as { version?: unknown, snippets?: unknown }
    return {
      version: isFiniteNumber(value.version) ? value.version : 1,
      snippets: Array.isArray(value.snippets) ? value.snippets.map(normalizeSnippet) : [],
    }
  }
  return { version: 1, snippets: [] }
}

export function normalizeSnippet(snippet: unknown, index = 0): TuffSnippet {
  const value = snippet && typeof snippet === 'object' ? snippet as Record<string, unknown> : {}
  const rawId = normalizeText(value.id)
  const now = Date.now()
  return {
    id: rawId || `snippet-${index}`,
    type: normalizeType(value.type),
    title: normalizeText(value.title) || '未命名片段',
    language: normalizeText(value.language),
    tags: normalizeTags(value.tags),
    content: String(value.content ?? ''),
    createdAt: isFiniteNumber(value.createdAt) ? value.createdAt : now,
    updatedAt: isFiniteNumber(value.updatedAt) ? value.updatedAt : now,
    lastUsedAt: isFiniteNumber(value.lastUsedAt) ? value.lastUsedAt : undefined,
    useCount: isFiniteNumber(value.useCount) ? value.useCount : 0,
  }
}

export function serializeSnippets(snippets: unknown): TuffSnippetStore {
  return {
    version: 1,
    snippets: Array.isArray(snippets) ? snippets.map(normalizeSnippet) : [],
  }
}

export function containsSensitiveContent(value: unknown): boolean {
  const text = String(value ?? '')
  return SENSITIVE_CONTENT_PATTERNS.some(pattern => pattern.test(text))
}

export function isShareableSnippet(snippet: unknown): boolean {
  const value = snippet && typeof snippet === 'object' ? snippet as Record<string, unknown> : {}
  const text = [
    value.title,
    value.language,
    value.content,
    ...(Array.isArray(value.tags) ? value.tags : []),
  ].join('\n')
  return !containsSensitiveContent(text)
}

export function createSnippetPack(
  snippets: unknown,
  meta: { title?: unknown, summary?: unknown } = {},
  options: { excludeSensitive?: boolean, now?: number } = {},
): TuffSnippetPack {
  const normalized = serializeSnippets(snippets).snippets
  const shouldFilterSensitive = options.excludeSensitive !== false
  const shareableSnippets = shouldFilterSensitive
    ? normalized.filter(isShareableSnippet)
    : normalized
  const now = options.now || Date.now()

  return {
    format: SNIPPET_PACK_FORMAT,
    version: 1,
    title: normalizeText(meta.title) || 'Touch Snippets Pack',
    summary: normalizeText(meta.summary),
    pluginId: TOUCH_SNIPPETS_PLUGIN_ID,
    kind: SNIPPET_PACK_KIND,
    schemaVersion: 1,
    createdAt: now,
    snippets: shareableSnippets,
    skippedSensitiveCount: normalized.length - shareableSnippets.length,
  }
}

export function normalizeSnippetPack(raw: unknown): TuffSnippetPack {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!value || typeof value !== 'object')
    throw new Error('Invalid snippet pack')

  const record = value as Record<string, unknown>
  if (record.format && record.format !== SNIPPET_PACK_FORMAT)
    throw new Error('Unsupported snippet pack format')

  const content = record.content && typeof record.content === 'object'
    ? record.content as Record<string, unknown>
    : {}
  const contentInline = record.contentInline && typeof record.contentInline === 'object'
    ? record.contentInline as Record<string, unknown>
    : {}

  const snippets = Array.isArray(record.snippets)
    ? record.snippets
    : Array.isArray(content.snippets)
      ? content.snippets
      : Array.isArray(contentInline.snippets)
        ? contentInline.snippets
        : []

  return {
    format: SNIPPET_PACK_FORMAT,
    version: isFiniteNumber(record.version) ? record.version : 1,
    title: normalizeText(record.title) || 'Touch Snippets Pack',
    summary: normalizeText(record.summary),
    pluginId: TOUCH_SNIPPETS_PLUGIN_ID,
    kind: SNIPPET_PACK_KIND,
    schemaVersion: isFiniteNumber(record.schemaVersion) ? record.schemaVersion : 1,
    createdAt: isFiniteNumber(record.createdAt) ? record.createdAt : Date.now(),
    snippets: snippets.map(normalizeSnippet),
    skippedSensitiveCount: isFiniteNumber(record.skippedSensitiveCount)
      ? record.skippedSensitiveCount
      : 0,
  }
}

export function importSnippetPack(
  currentSnippets: unknown,
  rawPack: unknown,
  options: { now?: number } = {},
): ImportSnippetPackResult {
  const pack = normalizeSnippetPack(rawPack)
  const now = options.now || Date.now()
  const existing = serializeSnippets(currentSnippets).snippets
  const existingIds = new Set(existing.map(snippet => snippet.id))
  const imported = pack.snippets.map((snippet, index) => {
    const normalized = normalizeSnippet(snippet, index)
    let id = normalized.id
    if (existingIds.has(id))
      id = `${id}-imported-${now}-${index}`
    existingIds.add(id)
    return {
      ...normalized,
      id,
      createdAt: normalized.createdAt || now,
      updatedAt: now,
    }
  })

  return {
    version: 1,
    snippets: [...imported, ...existing],
    importedCount: imported.length,
    pack,
  }
}
