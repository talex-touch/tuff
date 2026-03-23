import type {
  SearchIndexItem,
  SearchIndexKeyword
} from '../../../search-engine/search-index-service'
import type { FileTypeTag } from '../constants'
import path from 'node:path'
import type { files as filesSchema } from '../../../../../db/schema'
import { TYPE_ALIAS_MAP } from '../../../../../utils/file-types'
import { KEYWORD_MAP, TYPE_TAG_EXTENSION_MAP, getTypeTagsForExtension } from '../constants'

export function buildSearchIndexItem(
  file: typeof filesSchema.$inferSelect,
  providerId: string,
  providerType: string
): SearchIndexItem {
  const extension = (file.extension || path.extname(file.name) || '').toLowerCase()
  const extensionKeywords = KEYWORD_MAP[extension] || []
  const keywords: SearchIndexKeyword[] = extensionKeywords.map((keyword) => ({
    value: keyword,
    priority: 1.05
  }))

  const baseName = path.basename(file.name, extension)
  const nameTokens = baseName
    .split(/[-_.\s]+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 1)
  for (const token of nameTokens) {
    keywords.push({ value: token, priority: 1.1 })
  }

  if (file.path) {
    const dirPath = path.dirname(file.path)
    const segments = dirPath
      .split(/[\\/]+/)
      .map((segment) => segment.trim().toLowerCase())
      .filter((segment) => segment.length > 1)
    const relevantSegments = segments.slice(-3)
    for (const segment of relevantSegments) {
      keywords.push({ value: segment, priority: 0.8 })
    }
  }

  const tags = new Set<string>()
  if (extension) {
    tags.add(extension.replace(/^\./, ''))
  }
  for (const tag of getTypeTagsForExtension(extension)) {
    tags.add(tag)
  }

  return {
    itemId: file.path,
    providerId,
    type: providerType,
    name: file.name,
    displayName: file.displayName ?? undefined,
    path: file.path,
    extension,
    content: file.content ?? undefined,
    keywords,
    tags: tags.size > 0 ? Array.from(tags) : undefined
  }
}

export function buildFtsQuery(terms: string[]): string {
  const tokens: string[] = []
  for (const term of terms) {
    const cleaned = term.replace(/[^a-z0-9\u4E00-\u9FA5]+/gi, ' ').trim()
    if (!cleaned) continue
    tokens.push(...cleaned.split(/\s+/))
  }

  if (tokens.length === 0) {
    return ''
  }

  return tokens.slice(0, 5).join(' ')
}

export function resolveTypeTag(raw: string): FileTypeTag | null {
  if (!raw) return null
  const normalized = raw.toLowerCase()
  if (TYPE_ALIAS_MAP[normalized]) {
    return TYPE_ALIAS_MAP[normalized]
  }

  if (normalized.endsWith('s')) {
    const singular = normalized.replace(/s$/i, '')
    if (TYPE_ALIAS_MAP[singular]) {
      return TYPE_ALIAS_MAP[singular]
    }
  }

  if (normalized.endsWith('es')) {
    const singular = normalized.replace(/es$/i, '')
    if (TYPE_ALIAS_MAP[singular]) {
      return TYPE_ALIAS_MAP[singular]
    }
  }

  return null
}

export function resolveExtensionsForTypeFilters(typeFilters: Set<FileTypeTag>): string[] {
  const extensions = new Set<string>()
  for (const tag of typeFilters) {
    const mapped = TYPE_TAG_EXTENSION_MAP[tag]
    if (!mapped) continue
    for (const ext of mapped) {
      extensions.add(ext)
    }
  }
  return Array.from(extensions)
}
