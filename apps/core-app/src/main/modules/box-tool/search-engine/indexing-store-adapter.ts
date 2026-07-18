import type {
  IndexedSourceDelta,
  IndexedSourceKind,
  IndexedSourceRecord,
  IndexedSourceSearchTerm,
  IndexedSourceRecordBatch
} from '@talex-touch/utils/search'
import path from 'node:path'
import type { SearchIndexItem, SearchIndexKeyword } from './search-index-service'
import type { SearchIndexMutationWriter } from './search-index-writer'

export interface IndexStoreAdapter {
  applyBatch(batch: IndexedSourceRecordBatch): Promise<IndexStoreBatchApplySummary | void>
  applyDelta(delta: IndexedSourceDelta): Promise<IndexStoreDeltaApplySummary | void>
  replaceSource(
    sourceId: string,
    records: readonly IndexedSourceRecord[]
  ): Promise<IndexStoreReplaceSourceSummary | void>
  beginSourceReplacement(sourceId: string): Promise<IndexStoreSourceReplacementSession>
  stageSourceReplacement(
    session: IndexStoreSourceReplacementSession,
    records: readonly IndexedSourceRecord[]
  ): Promise<number>
  commitSourceReplacement(
    session: IndexStoreSourceReplacementSession,
    totals: { recordCount: number; indexedItemCount: number }
  ): Promise<IndexStoreReplaceSourceSummary>
  abortSourceReplacement(session: IndexStoreSourceReplacementSession): Promise<void>
  clearSource(sourceId: string): Promise<IndexStoreClearSourceSummary | void>
  cleanupSource(sourceId: string): Promise<IndexStoreCleanupSourceSummary | void>
  countSource(sourceId: string): Promise<number>
}

export interface IndexStoreBatchApplySummary {
  sourceId: string
  recordCount: number
  indexedItemCount: number
  done: boolean
  cursor?: string
}

export interface SearchIndexStoreAdapterOptions {
  onBatchApplied?: (
    summary: IndexStoreBatchApplySummary,
    batch?: IndexedSourceRecordBatch
  ) => void | Promise<void>
  onDeltaApplied?: (
    summary: IndexStoreDeltaApplySummary,
    delta: IndexedSourceDelta
  ) => void | Promise<void>
  onClearSource?: (summary: IndexStoreClearSourceSummary) => void | Promise<void>
  onCleanupSource?: (summary: IndexStoreCleanupSourceSummary) => void | Promise<void>
}

export interface IndexStoreClearSourceSummary {
  sourceId: string
  removedIndexedItems: number
}

export interface IndexStoreSourceReplacementSession {
  sourceId: string
  replacementId: string
}

export interface IndexStoreReplaceSourceSummary {
  sourceId: string
  recordCount: number
  indexedItemCount: number
  removedIndexedItems: number
}
export interface IndexStoreCleanupSourceSummary {
  sourceId: string
  removedOrphanedKeywords: number
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

  async replaceSource(_sourceId: string, _records: readonly IndexedSourceRecord[]): Promise<void> {}

  async beginSourceReplacement(sourceId: string): Promise<IndexStoreSourceReplacementSession> {
    return { sourceId, replacementId: 'noop' }
  }

  async stageSourceReplacement(
    _session: IndexStoreSourceReplacementSession,
    _records: readonly IndexedSourceRecord[]
  ): Promise<number> {
    return 0
  }

  async commitSourceReplacement(
    session: IndexStoreSourceReplacementSession,
    totals: { recordCount: number; indexedItemCount: number }
  ): Promise<IndexStoreReplaceSourceSummary> {
    return {
      sourceId: session.sourceId,
      recordCount: totals.recordCount,
      indexedItemCount: totals.indexedItemCount,
      removedIndexedItems: 0
    }
  }

  async abortSourceReplacement(_session: IndexStoreSourceReplacementSession): Promise<void> {}

  async clearSource(_sourceId: string): Promise<void> {}

  async cleanupSource(_sourceId: string): Promise<void> {}

  async countSource(_sourceId: string): Promise<number> {
    return 0
  }
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

function buildWeightedEntries(
  terms: IndexedSourceSearchTerm[] | undefined
): SearchIndexKeyword[] | undefined {
  if (!terms?.length) return undefined
  const entries = terms
    .map((term) => ({ value: term.value.trim(), priority: term.priority }))
    .filter((term) => term.value.length > 0 && Number.isFinite(term.priority) && term.priority > 0)
  return entries.length > 0 ? entries : undefined
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
  const fallbackTerms = [
    ...(record.keywords ?? []),
    ...getStringArrayMetadata(record.metadata, 'aliases')
  ]
  const aliases = buildWeightedEntries(record.search?.aliases) ?? buildKeywordEntries(fallbackTerms)
  const keywords =
    buildWeightedEntries(record.search?.keywords) ?? buildKeywordEntries(fallbackTerms)
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
    aliases,
    keywords,
    tags,
    content: resolveContent(record)
  }
}

export class SearchIndexStoreAdapter implements IndexStoreAdapter {
  constructor(
    private readonly searchIndex: SearchIndexMutationWriter,
    private readonly options: SearchIndexStoreAdapterOptions = {}
  ) {}

  async applyBatch(batch: IndexedSourceRecordBatch): Promise<IndexStoreBatchApplySummary> {
    const items = batch.records
      .map((record) => mapIndexedSourceRecordToSearchIndexItem(record))
      .filter((item): item is SearchIndexItem => Boolean(item))
    const legacyItemIds = Array.from(
      new Set(
        batch.records.flatMap((record) =>
          (record.search?.legacyItemIds ?? []).filter((itemId) => itemId !== resolveItemId(record))
        )
      )
    )

    if (items.length > 0 || legacyItemIds.length > 0) {
      await this.searchIndex.indexItems(batch.sourceId, items, { legacyItemIds })
    }

    const summary: IndexStoreBatchApplySummary = {
      sourceId: batch.sourceId,
      recordCount: batch.records.length,
      indexedItemCount: items.length,
      done: batch.done === true,
      cursor: batch.cursor
    }

    await this.options.onBatchApplied?.(summary, batch)
    return summary
  }

  async applyDelta(delta: IndexedSourceDelta): Promise<IndexStoreDeltaApplySummary> {
    if (delta.action === 'delete') {
      const itemId = resolveDeltaItemId(delta)
      if (itemId) {
        const commit = await this.searchIndex.removeProviderItems(delta.sourceId, [itemId])
        if (commit.affectedItems <= 0) {
          const summary: IndexStoreDeltaApplySummary = {
            sourceId: delta.sourceId,
            action: delta.action,
            indexedItemCount: 0,
            removedItemCount: 0,
            applied: false,
            reason: 'missing-indexed-item'
          }
          await this.options.onDeltaApplied?.(summary, delta)
          return summary
        }
        const summary: IndexStoreDeltaApplySummary = {
          sourceId: delta.sourceId,
          action: delta.action,
          indexedItemCount: 0,
          removedItemCount: commit.affectedItems,
          applied: true
        }
        await this.options.onDeltaApplied?.(summary, delta)
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
      await this.options.onDeltaApplied?.(summary, delta)
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
      await this.options.onDeltaApplied?.(summary, delta)
      return summary
    }

    const item = mapIndexedSourceRecordToSearchIndexItem(delta.record)
    if (item) {
      const legacyItemIds = (delta.record.search?.legacyItemIds ?? []).filter(
        (itemId) => itemId !== item.itemId
      )
      const commit = await this.searchIndex.indexItems(delta.sourceId, [item], { legacyItemIds })
      const summary: IndexStoreDeltaApplySummary = {
        sourceId: delta.sourceId,
        action: delta.action,
        indexedItemCount: 1,
        removedItemCount: Math.max(0, commit.affectedItems - 1),
        applied: true
      }
      await this.options.onDeltaApplied?.(summary, delta)
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
    await this.options.onDeltaApplied?.(summary, delta)
    return summary
  }

  async replaceSource(
    sourceId: string,
    records: readonly IndexedSourceRecord[]
  ): Promise<IndexStoreReplaceSourceSummary> {
    const session = await this.beginSourceReplacement(sourceId)
    try {
      const indexedItemCount = await this.stageSourceReplacement(session, records)
      return await this.commitSourceReplacement(session, {
        recordCount: records.length,
        indexedItemCount
      })
    } catch (error) {
      await this.abortSourceReplacement(session).catch(() => undefined)
      throw error
    }
  }

  async beginSourceReplacement(sourceId: string): Promise<IndexStoreSourceReplacementSession> {
    const replacementId = `${sourceId}:${Date.now()}:${Math.random().toString(16).slice(2)}`
    await this.searchIndex.beginSourceReplacement(sourceId, replacementId)
    return { sourceId, replacementId }
  }

  async stageSourceReplacement(
    session: IndexStoreSourceReplacementSession,
    records: readonly IndexedSourceRecord[]
  ): Promise<number> {
    const mismatched = records.find((record) => record.sourceId !== session.sourceId)
    if (mismatched) {
      throw new Error(`INDEX_STORE_SOURCE_MISMATCH:${session.sourceId}:${mismatched.sourceId}`)
    }
    const items = records
      .map((record) => mapIndexedSourceRecordToSearchIndexItem(record))
      .filter((item): item is SearchIndexItem => Boolean(item))
    await this.searchIndex.stageSourceReplacement(session.sourceId, session.replacementId, items)
    return items.length
  }

  async commitSourceReplacement(
    session: IndexStoreSourceReplacementSession,
    totals: { recordCount: number; indexedItemCount: number }
  ): Promise<IndexStoreReplaceSourceSummary> {
    const replacement = await this.searchIndex.commitSourceReplacement(
      session.sourceId,
      session.replacementId
    )
    const summary: IndexStoreReplaceSourceSummary = {
      sourceId: session.sourceId,
      recordCount: totals.recordCount,
      indexedItemCount: replacement.indexedItems,
      removedIndexedItems: replacement.removedItems
    }
    await this.options.onClearSource?.({
      sourceId: session.sourceId,
      removedIndexedItems: replacement.removedItems
    })
    await this.options.onBatchApplied?.({
      sourceId: session.sourceId,
      recordCount: totals.recordCount,
      indexedItemCount: replacement.indexedItems,
      done: true
    })
    return summary
  }

  async abortSourceReplacement(session: IndexStoreSourceReplacementSession): Promise<void> {
    await this.searchIndex.abortSourceReplacement(session.sourceId, session.replacementId)
  }

  async clearSource(sourceId: string): Promise<IndexStoreClearSourceSummary> {
    const commit = await this.searchIndex.clearSource(sourceId)
    const summary: IndexStoreClearSourceSummary = {
      sourceId,
      removedIndexedItems: commit.affectedItems
    }
    await this.options.onClearSource?.(summary)
    return summary
  }

  async cleanupSource(sourceId: string): Promise<IndexStoreCleanupSourceSummary> {
    const commit = await this.searchIndex.cleanupSource(sourceId)
    const summary: IndexStoreCleanupSourceSummary = {
      sourceId,
      removedOrphanedKeywords: commit.affectedItems
    }
    await this.options.onCleanupSource?.(summary)
    return summary
  }

  async countSource(sourceId: string): Promise<number> {
    return await this.searchIndex.countSource(sourceId)
  }
}
