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
  applyBatch(batch: IndexedSourceRecordBatch): Promise<void>
  applyDelta(delta: IndexedSourceDelta): Promise<void>
  clearSource(sourceId: string): Promise<void>
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

  return {
    itemId,
    providerId: record.sourceId,
    type: toProviderType(record.kind),
    name: record.title,
    displayName: record.title,
    description: record.subtitle,
    path: resolveItemPath(record),
    extension: resolveExtension(record),
    aliases: buildKeywordEntries(record.keywords),
    keywords: buildKeywordEntries(record.keywords),
    tags: record.tags,
    content: resolveContent(record)
  }
}

export class SearchIndexStoreAdapter implements IndexStoreAdapter {
  constructor(private readonly searchIndex: SearchIndexService) {}

  async applyBatch(batch: IndexedSourceRecordBatch): Promise<void> {
    const items = batch.records
      .map((record) => mapIndexedSourceRecordToSearchIndexItem(record))
      .filter((item): item is SearchIndexItem => Boolean(item))

    await this.searchIndex.indexItems(items)
  }

  async applyDelta(delta: IndexedSourceDelta): Promise<void> {
    if (delta.action === 'delete') {
      const itemId = resolveDeltaItemId(delta)
      if (itemId) {
        await this.searchIndex.removeItems([itemId])
      }
      return
    }

    if (!delta.record) {
      return
    }

    const item = mapIndexedSourceRecordToSearchIndexItem(delta.record)
    if (item) {
      await this.searchIndex.indexItems([item])
    }
  }

  async clearSource(sourceId: string): Promise<void> {
    await this.searchIndex.removeByProvider(sourceId)
  }
}
