import type { IndexedFileSourceRecordRow, IndexedSourceRecord } from '@talex-touch/utils/search'
import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import path from 'node:path'
import { mapIndexedFileSourceRecord } from '@talex-touch/utils/search'
import { getTypeTagsForExtension, KEYWORD_MAP } from '../constants'

/**
 * Pure record-mapping and classification helpers extracted from `file-provider.ts` (F1).
 * Keeps FTS tags, extension keywords, `type = 'file'` semantics, and publication tags unchanged.
 */
export function mapFileToIndexedSourceRecord(
  file: IndexedFileSourceRecordRow,
  sourceId: string
): IndexedSourceRecord {
  const record = mapIndexedFileSourceRecord(file, { sourceId })
  record.metadata = { ...record.metadata, runtimePublication: 'base' }
  const extension = (file.extension || path.extname(file.name)).toLowerCase()
  const keywords = KEYWORD_MAP[extension] ?? []
  const tags = new Set<string>(getTypeTagsForExtension(extension))
  if (extension) tags.add(extension.replace(/^\./, ''))
  return {
    ...record,
    keywords,
    tags: tags.size > 0 ? [...tags] : undefined,
    search: {
      keywords: keywords.map((value) => ({ value, priority: 1.05 }))
    }
  }
}

export function mapWorkerResultToIndexedSourceRecord(
  result: IndexWorkerFileResult,
  sourceId: string
): IndexedSourceRecord {
  const item = result.indexItem
  const mapTerms = (terms: typeof item.keywords, priority: number) =>
    terms
      ?.filter((term) => term.value.length > 0)
      .map((term) => ({
        value: term.value,
        priority: term.priority ?? priority
      }))
  const legacyItemIdsValue = (item as unknown as { legacyItemIds?: unknown }).legacyItemIds
  const legacyItemIds = Array.isArray(legacyItemIdsValue)
    ? legacyItemIdsValue.filter(
        (value): value is string => typeof value === 'string' && value.length > 0
      )
    : undefined
  return {
    sourceId,
    recordId: item.itemId,
    stableKey: item.itemId,
    kind: 'file',
    title: item.displayName || item.name,
    subtitle: item.description ?? item.path ?? undefined,
    path: item.path ?? undefined,
    keywords: item.keywords?.map((term) => term.value),
    tags: item.tags,
    metadata: {
      content: item.content ?? undefined,
      extension: item.extension ?? undefined,
      type: item.type,
      runtimePublication: 'worker-enrichment'
    },
    search: {
      aliases: mapTerms(item.aliases, 1.5),
      keywords: mapTerms(item.keywords, 1.1),
      legacyItemIds
    }
  }
}

/**
 * Normalizes a Date, numeric epoch ms, or date string into an epoch millisecond timestamp.
 */
export function toFileTimestamp(value: Date | number | string | null | undefined): number | null {
  if (!value) {
    return null
  }
  if (value instanceof Date) {
    return value.getTime()
  }
  if (typeof value === 'number') {
    return value
  }
  const parsed = new Date(value)
  const time = parsed.getTime()
  return Number.isNaN(time) ? null : time
}

/**
 * Stable public classification for a failed indexed file. The raw parser or
 * SQLite error text stays in main-process diagnostics; only the code crosses.
 */
export function classifyFailedFileIndexError(lastError: string | null): string | null {
  if (!lastError) return null
  return lastError.includes('SQLITE_BUSY') ? 'FILE_INDEX_DATABASE_BUSY' : 'FILE_INDEX_ITEM_FAILED'
}
