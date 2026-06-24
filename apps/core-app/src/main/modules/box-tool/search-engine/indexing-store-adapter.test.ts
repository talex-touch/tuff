import type { IndexedSourceDelta, IndexedSourceRecordBatch } from '@talex-touch/utils/search'
import { describe, expect, it, vi } from 'vitest'
import {
  mapIndexedSourceRecordToSearchIndexItem,
  SearchIndexStoreAdapter
} from './indexing-store-adapter'

function buildSearchIndex() {
  return {
    indexItems: vi.fn(async () => {}),
    removeItems: vi.fn(async () => {}),
    removeProviderItems: vi.fn(async () => 1),
    removeByProvider: vi.fn(async () => 0),
    countByProvider: vi.fn(async () => 0)
  }
}

describe('SearchIndexStoreAdapter', () => {
  it('maps indexed source records to SearchIndexItem documents', () => {
    expect(
      mapIndexedSourceRecordToSearchIndexItem({
        sourceId: 'browser-bookmark',
        recordId: 'bookmark-1',
        stableKey: 'https://example.com',
        kind: 'browser-bookmark',
        title: 'Example',
        subtitle: 'Docs',
        uri: 'https://example.com',
        keywords: ['example', 'docs'],
        tags: ['bookmark'],
        metadata: { content: 'Example docs content', extension: '.url' }
      })
    ).toEqual(
      expect.objectContaining({
        itemId: 'bookmark-1',
        providerId: 'browser-bookmark',
        type: 'plugin',
        name: 'Example',
        path: 'https://example.com',
        extension: '.url',
        content: 'Example docs content'
      })
    )
  })

  it('maps tool source aliases and source tags from indexed record metadata', () => {
    expect(
      mapIndexedSourceRecordToSearchIndexItem({
        sourceId: 'app-provider',
        recordId: '/Applications/Adobe Photoshop 2026.app',
        stableKey: '/Applications/Adobe Photoshop 2026.app',
        kind: 'app',
        title: 'Adobe Photoshop 2026',
        path: '/Applications/Adobe Photoshop 2026.app',
        keywords: ['Adobe Photoshop 2026', 'ps', 'design'],
        tags: ['com.adobe.Photoshop'],
        metadata: {
          aliases: ['creative', 'graphics'],
          toolSources: ['design']
        }
      })
    ).toEqual(
      expect.objectContaining({
        itemId: '/Applications/Adobe Photoshop 2026.app',
        providerId: 'app-provider',
        type: 'application',
        aliases: expect.arrayContaining([
          expect.objectContaining({ value: 'ps' }),
          expect.objectContaining({ value: 'design' }),
          expect.objectContaining({ value: 'creative' })
        ]),
        keywords: expect.arrayContaining([expect.objectContaining({ value: 'graphics' })]),
        tags: ['com.adobe.Photoshop', 'tool-source:design']
      })
    )
  })

  it('indexes batches through SearchIndexService', async () => {
    const searchIndex = buildSearchIndex()
    const onBatchApplied = vi.fn(async () => {})
    const adapter = new SearchIndexStoreAdapter(searchIndex as never, { onBatchApplied })
    const batch: IndexedSourceRecordBatch = {
      sourceId: 'quicklink',
      records: [
        {
          sourceId: 'quicklink',
          recordId: 'quicklink-1',
          stableKey: 'quicklink-1',
          kind: 'quicklink',
          title: 'Open Docs',
          uri: 'https://docs.example.com'
        }
      ],
      done: true
    }

    await adapter.applyBatch(batch)

    expect(searchIndex.indexItems).toHaveBeenCalledWith([
      expect.objectContaining({
        itemId: 'quicklink-1',
        providerId: 'quicklink',
        type: 'plugin',
        name: 'Open Docs'
      })
    ])
    expect(onBatchApplied).toHaveBeenCalledWith({
      sourceId: 'quicklink',
      recordCount: 1,
      indexedItemCount: 1,
      done: true,
      cursor: undefined
    })
  })

  it('keeps empty done scan batches observable at the store boundary', async () => {
    const searchIndex = buildSearchIndex()
    const onBatchApplied = vi.fn(async () => {})
    const adapter = new SearchIndexStoreAdapter(searchIndex as never, { onBatchApplied })
    const batch: IndexedSourceRecordBatch = {
      sourceId: 'file-provider',
      records: [],
      done: true,
      cursor: 'scan-complete'
    }

    await adapter.applyBatch(batch)

    expect(searchIndex.indexItems).not.toHaveBeenCalled()
    expect(onBatchApplied).toHaveBeenCalledWith({
      sourceId: 'file-provider',
      recordCount: 0,
      indexedItemCount: 0,
      done: true,
      cursor: 'scan-complete'
    })
  })

  it('reports scanned records separately from indexable records', async () => {
    const searchIndex = buildSearchIndex()
    const onBatchApplied = vi.fn(async () => {})
    const adapter = new SearchIndexStoreAdapter(searchIndex as never, { onBatchApplied })
    const batch: IndexedSourceRecordBatch = {
      sourceId: 'quicklink',
      records: [
        {
          sourceId: 'quicklink',
          recordId: '',
          stableKey: '',
          kind: 'quicklink',
          title: 'Missing identity',
          uri: ''
        },
        {
          sourceId: 'quicklink',
          recordId: 'quicklink-1',
          stableKey: 'quicklink-1',
          kind: 'quicklink',
          title: 'Open Docs',
          uri: 'https://docs.example.com'
        }
      ],
      done: true
    }

    await expect(adapter.applyBatch(batch)).resolves.toEqual({
      sourceId: 'quicklink',
      recordCount: 2,
      indexedItemCount: 1,
      done: true,
      cursor: undefined
    })

    expect(searchIndex.indexItems).toHaveBeenCalledWith([
      expect.objectContaining({
        itemId: 'quicklink-1',
        providerId: 'quicklink',
        name: 'Open Docs'
      })
    ])
    expect(onBatchApplied).toHaveBeenCalledWith({
      sourceId: 'quicklink',
      recordCount: 2,
      indexedItemCount: 1,
      done: true,
      cursor: undefined
    })
  })

  it('applies add/change/delete deltas through SearchIndexService', async () => {
    const searchIndex = buildSearchIndex()
    const onDeltaApplied = vi.fn(async () => {})
    const adapter = new SearchIndexStoreAdapter(searchIndex as never, { onDeltaApplied })
    const changeDelta: IndexedSourceDelta = {
      sourceId: 'obsidian-note',
      action: 'change',
      record: {
        sourceId: 'obsidian-note',
        recordId: 'note-1',
        stableKey: 'note-1',
        kind: 'obsidian-note',
        title: 'Daily Note',
        path: '/vault/daily.md'
      }
    }

    await expect(adapter.applyDelta(changeDelta)).resolves.toEqual({
      sourceId: 'obsidian-note',
      action: 'change',
      indexedItemCount: 1,
      removedItemCount: 0,
      applied: true
    })
    await expect(
      adapter.applyDelta({
        sourceId: 'obsidian-note',
        action: 'delete',
        stableKey: 'note-1'
      })
    ).resolves.toEqual({
      sourceId: 'obsidian-note',
      action: 'delete',
      indexedItemCount: 0,
      removedItemCount: 1,
      applied: true
    })

    expect(searchIndex.indexItems).toHaveBeenCalledWith([
      expect.objectContaining({ itemId: 'note-1', providerId: 'obsidian-note' })
    ])
    expect(searchIndex.removeProviderItems).toHaveBeenCalledWith('obsidian-note', ['note-1'])
    expect(onDeltaApplied).toHaveBeenNthCalledWith(1, {
      sourceId: 'obsidian-note',
      action: 'change',
      indexedItemCount: 1,
      removedItemCount: 0,
      applied: true
    })
    expect(onDeltaApplied).toHaveBeenNthCalledWith(2, {
      sourceId: 'obsidian-note',
      action: 'delete',
      indexedItemCount: 0,
      removedItemCount: 1,
      applied: true
    })
  })

  it('reports provider-scoped delete misses as skipped store deltas', async () => {
    const searchIndex = buildSearchIndex()
    searchIndex.removeProviderItems.mockResolvedValueOnce(0)
    const onDeltaApplied = vi.fn(async () => {})
    const adapter = new SearchIndexStoreAdapter(searchIndex as never, { onDeltaApplied })

    await expect(
      adapter.applyDelta({
        sourceId: 'quicklink',
        action: 'delete',
        stableKey: 'shared-key'
      })
    ).resolves.toEqual({
      sourceId: 'quicklink',
      action: 'delete',
      indexedItemCount: 0,
      removedItemCount: 0,
      applied: false,
      reason: 'missing-indexed-item'
    })

    expect(searchIndex.removeProviderItems).toHaveBeenCalledWith('quicklink', ['shared-key'])
    expect(searchIndex.removeItems).not.toHaveBeenCalled()
    expect(onDeltaApplied).toHaveBeenCalledWith({
      sourceId: 'quicklink',
      action: 'delete',
      indexedItemCount: 0,
      removedItemCount: 0,
      applied: false,
      reason: 'missing-indexed-item'
    })
  })

  it('keeps skipped deltas observable without mutating the index', async () => {
    const searchIndex = buildSearchIndex()
    const onDeltaApplied = vi.fn(async () => {})
    const adapter = new SearchIndexStoreAdapter(searchIndex as never, { onDeltaApplied })

    await expect(
      adapter.applyDelta({
        sourceId: 'quicklink',
        action: 'change'
      })
    ).resolves.toEqual({
      sourceId: 'quicklink',
      action: 'change',
      indexedItemCount: 0,
      removedItemCount: 0,
      applied: false,
      reason: 'missing-record'
    })
    await expect(
      adapter.applyDelta({
        sourceId: 'quicklink',
        action: 'add',
        record: {
          sourceId: 'quicklink',
          recordId: '',
          stableKey: '',
          kind: 'quicklink',
          title: 'Missing identity'
        }
      })
    ).resolves.toEqual({
      sourceId: 'quicklink',
      action: 'add',
      indexedItemCount: 0,
      removedItemCount: 0,
      applied: false,
      reason: 'unindexable-record'
    })
    await expect(
      adapter.applyDelta({
        sourceId: 'quicklink',
        action: 'delete'
      })
    ).resolves.toEqual({
      sourceId: 'quicklink',
      action: 'delete',
      indexedItemCount: 0,
      removedItemCount: 0,
      applied: false,
      reason: 'missing-delete-identity'
    })

    expect(searchIndex.indexItems).not.toHaveBeenCalled()
    expect(searchIndex.removeItems).not.toHaveBeenCalled()
    expect(searchIndex.removeProviderItems).not.toHaveBeenCalled()
    expect(onDeltaApplied).toHaveBeenCalledTimes(3)
  })

  it('clears a source through provider-level removal', async () => {
    const searchIndex = buildSearchIndex()
    searchIndex.removeByProvider.mockResolvedValueOnce(3)
    const onClearSource = vi.fn(async () => {})
    const adapter = new SearchIndexStoreAdapter(searchIndex as never, { onClearSource })

    await expect(adapter.clearSource('browser-bookmark')).resolves.toEqual({
      sourceId: 'browser-bookmark',
      removedIndexedItems: 3
    })

    expect(searchIndex.removeByProvider).toHaveBeenCalledWith('browser-bookmark')
    expect(searchIndex.countByProvider).not.toHaveBeenCalled()
    expect(onClearSource).toHaveBeenCalledWith({
      sourceId: 'browser-bookmark',
      removedIndexedItems: 3
    })
  })
})
