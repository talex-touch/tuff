import type {
  IndexedSourceDelta,
  IndexedSourceKind,
  IndexedSourceRecord,
  IndexedSourceRecordBatch
} from '@talex-touch/utils/search'
import path from 'node:path'
import type { SearchIndexItem, SearchIndexKeyword } from './search-index-service'
import { SearchIndexService } from './search-index-service'

export interface IndexStoreAdapter {
  applyBatch(batch: IndexedSourceRecordBatch): Promise<IndexStoreBatchApplySummary | void>
  applyDelta(delta: IndexedSourceDelta): Promise<IndexStoreDeltaApplySummary | void>
  clearSource(sourceId: string): Promise<IndexStoreClearSourceSummary | void>
}

export interface IndexStoreBatchApplySummary {
  sourceId: string
  recordCount: number
  indexedItemCount: number
  done: boolean
  cursor?: string
}

export interface SearchIndexStoreAdapterOptions {
  onBatchApplied?: (summary: IndexStoreBatchApplySummary) => void | Promise<void>
  onDeltaApplied?: (summary: IndexStoreDeltaApplySummary) => void | Promise<void>
  onClearSource?: (summary: IndexStoreClearSourceSummary) => void | Promise<void>
}

export interface IndexStoreClearSourceSummary {
  sourceId: string
  removedIndexedItems: number
}

export interface IndexStoreDeltaApplySummary {
  sourceId: string
  action: IndexedSourceDelta['action']
  indexedItemCount: number
  removedItemCount: number
  applied: boolean
  reason?:
    | 'missing-delete-identity'
    | 'missing-indexed-item'
    | 'missing-record'
    | 'unindexable-record'
}

export class NoopIndexStoreAdapter implements IndexStoreAdapter {
  async applyBatch(_batch: IndexedSourceRecordBatch): Promise<void> {}

  async applyDelta(_delta: IndexedSourceDelta): Promise<void> {}

  async clearSource(_sourceId: string): Promise<void> {}
}

function resolveItemId(
  record: Pick<IndexedSourceRecord, 'recordId' | 'stableKey' | 'path' | 'uri'>
): string {
  return record.recordId || record.stableKey || record.path || record.uri || ''
}

function resolveDeltaItemId(delta: IndexedSourceDelta): string {
  return delta.record ? resolveItemId(delta.record) : delta.stableKey || delta.path || ''
}

function resolveItemPath(record: IndexedSourceRecord): string | null {
  return record.path ?? record.uri ?? null
}

function resolveExtension(record: IndexedSourceRecord): string | null {
  if (typeof record.metadata?.extension === 'string') {
    return record.metadata.extension
  }
  if (!record.path) {
    return null
  }
  return path.extname(record.path).toLowerCase() || null
}

function resolveContent(record: IndexedSourceRecord): string | null {
  return typeof record.metadata?.content === 'string' ? record.metadata.content : null
}

function getStringArrayMetadata(metadata: IndexedSourceRecord['metadata'], key: string): string[] {
  const value = metadata?.[key]
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function buildToolSourceTags(metadata: IndexedSourceRecord['metadata']): string[] {
  return getStringArrayMetadata(metadata, 'toolSources').map((sourceId) =>
    sourceId.startsWith('tool-source:') ? sourceId : `tool-source:${sourceId}`
  )
}

function buildKeywordEntries(keywords: string[] | undefined): SearchIndexKeyword[] | undefined {
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return undefined
  }

  return keywords
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .map((keyword) => ({
      value: keyword,
      priority: 1.1
    }))
}

function toProviderType(kind: IndexedSourceKind): string {
  switch (kind) {
    case 'app':
      return 'application'
    case 'file':
      return 'file'
    case 'browser-bookmark':
    case 'browser-history':
    case 'quicklink':
      return 'plugin'
    case 'system-setting':
      return 'system'
    case 'obsidian-note':
    case 'vscode-workspace':
    case 'vscode-extension':
    case 'plugin-data':
      return 'plugin'
  }
}

export function mapIndexedSourceRecordToSearchIndexItem(
  record: IndexedSourceRecord
): SearchIndexItem | null {
  const itemId = resolveItemId(record)
  if (!itemId) {
    return null
  }
  const aliases = [
    ...(record.keywords ?? []),
    ...getStringArrayMetadata(record.metadata, 'aliases')
  ]
  const tags = [...(record.tags ?? []), ...buildToolSourceTags(record.metadata)]

  return {
    itemId,
    providerId: record.sourceId,
    type: toProviderType(record.kind),
    name: record.title,
    displayName: record.title,
    description: record.subtitle,
    path: resolveItemPath(record),
    extension: resolveExtension(record),
    aliases: buildKeywordEntries(aliases),
    keywords: buildKeywordEntries(aliases),
    tags,
    content: resolveContent(record)
  }
}

export class SearchIndexStoreAdapter implements IndexStoreAdapter {
  constructor(
    private readonly searchIndex: SearchIndexService,
    private readonly options: SearchIndexStoreAdapterOptions = {}
  ) {}

  async applyBatch(batch: IndexedSourceRecordBatch): Promise<IndexStoreBatchApplySummary> {
    const items = batch.records
      .map((record) => mapIndexedSourceRecordToSearchIndexItem(record))
      .filter((item): item is SearchIndexItem => Boolean(item))

    if (items.length > 0) {
      await this.searchIndex.indexItems(items)
    }

    const summary: IndexStoreBatchApplySummary = {
      sourceId: batch.sourceId,
      recordCount: batch.records.length,
      indexedItemCount: items.length,
      done: batch.done === true,
      cursor: batch.cursor
    }

    await this.options.onBatchApplied?.(summary)
    return summary
  }

  async applyDelta(delta: IndexedSourceDelta): Promise<IndexStoreDeltaApplySummary> {
    if (delta.action === 'delete') {
      const itemId = resolveDeltaItemId(delta)
      if (itemId) {
        const removedItemCount = await this.searchIndex.removeProviderItems(delta.sourceId, [
          itemId
        ])
        if (removedItemCount <= 0) {
          const summary: IndexStoreDeltaApplySummary = {
            sourceId: delta.sourceId,
            action: delta.action,
            indexedItemCount: 0,
            removedItemCount: 0,
            applied: false,
            reason: 'missing-indexed-item'
          }
          await this.options.onDeltaApplied?.(summary)
          return summary
        }
        const summary: IndexStoreDeltaApplySummary = {
          sourceId: delta.sourceId,
          action: delta.action,
          indexedItemCount: 0,
          removedItemCount,
          applied: true
        }
        await this.options.onDeltaApplied?.(summary)
        return summary
      }
      const summary: IndexStoreDeltaApplySummary = {
        sourceId: delta.sourceId,
        action: delta.action,
        indexedItemCount: 0,
        removedItemCount: 0,
        applied: false,
        reason: 'missing-delete-identity'
      }
      await this.options.onDeltaApplied?.(summary)
      return summary
    }

    if (!delta.record) {
      const summary: IndexStoreDeltaApplySummary = {
        sourceId: delta.sourceId,
        action: delta.action,
        indexedItemCount: 0,
        removedItemCount: 0,
        applied: false,
        reason: 'missing-record'
      }
      await this.options.onDeltaApplied?.(summary)
      return summary
    }

    const item = mapIndexedSourceRecordToSearchIndexItem(delta.record)
    if (item) {
      await this.searchIndex.indexItems([item])
      const summary: IndexStoreDeltaApplySummary = {
        sourceId: delta.sourceId,
        action: delta.action,
        indexedItemCount: 1,
        removedItemCount: 0,
        applied: true
      }
      await this.options.onDeltaApplied?.(summary)
      return summary
    }
    const summary: IndexStoreDeltaApplySummary = {
      sourceId: delta.sourceId,
      action: delta.action,
      indexedItemCount: 0,
      removedItemCount: 0,
      applied: false,
      reason: 'unindexable-record'
    }
    await this.options.onDeltaApplied?.(summary)
    return summary
  }

  async clearSource(sourceId: string): Promise<IndexStoreClearSourceSummary> {
    const removedIndexedItems = await this.searchIndex.removeByProvider(sourceId)
    const summary: IndexStoreClearSourceSummary = {
      sourceId,
      removedIndexedItems
    }
    await this.options.onClearSource?.(summary)
    return summary
  }
}
