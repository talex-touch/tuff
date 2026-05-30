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
    removeByProvider: vi.fn(async () => {})
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

  it('indexes batches through SearchIndexService', async () => {
    const searchIndex = buildSearchIndex()
    const adapter = new SearchIndexStoreAdapter(searchIndex as never)
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
  })

  it('applies add/change/delete deltas through SearchIndexService', async () => {
    const searchIndex = buildSearchIndex()
    const adapter = new SearchIndexStoreAdapter(searchIndex as never)
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

    await adapter.applyDelta(changeDelta)
    await adapter.applyDelta({
      sourceId: 'obsidian-note',
      action: 'delete',
      stableKey: 'note-1'
    })

    expect(searchIndex.indexItems).toHaveBeenCalledWith([
      expect.objectContaining({ itemId: 'note-1', providerId: 'obsidian-note' })
    ])
    expect(searchIndex.removeItems).toHaveBeenCalledWith(['note-1'])
  })

  it('clears a source through provider-level removal', async () => {
    const searchIndex = buildSearchIndex()
    const adapter = new SearchIndexStoreAdapter(searchIndex as never)

    await adapter.clearSource('browser-bookmark')

    expect(searchIndex.removeByProvider).toHaveBeenCalledWith('browser-bookmark')
  })
})
