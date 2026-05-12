import { describe, expect, it, vi } from 'vitest'

vi.mock('../../utils/logger', () => ({
  createLogger: () => {
    const logger = {
      child: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
    logger.child.mockReturnValue(logger)
    return logger
  }
}))

vi.mock('../../utils/perf-monitor', () => ({
  perfMonitor: {
    recordMainReport: vi.fn()
  }
}))

import {
  ClipboardHistoryPersistence,
  mergeClipboardMetadataString,
  type IClipboardItem
} from './clipboard-history-persistence'

function createTextItem(overrides: Partial<IClipboardItem> = {}): IClipboardItem {
  return {
    id: overrides.id ?? 1,
    type: 'text',
    content: overrides.content ?? 'hello',
    timestamp: overrides.timestamp ?? new Date(),
    metadata: overrides.metadata ?? null,
    meta: overrides.meta ?? null,
    ...overrides
  }
}

describe('clipboard-history-persistence', () => {
  it('merges metadata strings without dropping existing keys', () => {
    expect(mergeClipboardMetadataString('{"source":"custom"}', { category: 'ai-chat' })).toBe(
      '{"source":"custom","category":"ai-chat"}'
    )
  })

  it('updates cache and forgets freshness when old entries fall out', () => {
    const forgotten: number[] = []
    const history = new ClipboardHistoryPersistence({
      onForgetFreshness: (id) => forgotten.push(id)
    })

    for (let id = 1; id <= 21; id += 1) {
      history.updateMemoryCache(createTextItem({ id }))
    }

    expect(history.getMemoryItemsCount()).toBe(20)
    expect(forgotten).toEqual([1])
    expect(history.getLatestItem()?.id).toBe(21)
  })

  it('patches cached metadata and source without replacing the item', () => {
    const history = new ClipboardHistoryPersistence()
    history.updateMemoryCache(
      createTextItem({
        id: 7,
        metadata: '{"source":"custom"}',
        meta: { source: 'custom' }
      })
    )

    history.patchCachedMeta(7, { category: 'preview' })
    history.updateCachedSource(7, 'Talex Touch')

    const item = history.getCachedItemById(7)
    expect(item?.sourceApp).toBe('Talex Touch')
    expect(item?.meta).toEqual({ source: 'custom', category: 'preview' })
    expect(item?.metadata).toBe('{"source":"custom","category":"preview"}')
  })

  it('extracts tags from hydrated meta before falling back to metadata JSON', () => {
    const history = new ClipboardHistoryPersistence()

    expect(history.extractTags(createTextItem({ meta: { tags: ['url', 'code'] } }))).toEqual([
      'url',
      'code'
    ])
    expect(history.extractTags(createTextItem({ metadata: '{"tags":["fallback"]}' }))).toEqual([
      'fallback'
    ])
  })

  it('normalizes image client items to thumbnails and renderable metadata', () => {
    const history = new ClipboardHistoryPersistence({
      normalizeRenderableSource: (source) => ({ value: source })
    })
    const item = history.toClientItem({
      id: 9,
      type: 'image',
      content: 'data:image/png;base64,raw',
      thumbnail: 'data:image/png;base64,thumb',
      timestamp: new Date(),
      meta: { image_preview_url: 'tfile:///tmp/preview.png' }
    })

    expect(item?.content).toBe('data:image/png;base64,thumb')
    expect(item?.meta?.image_content_kind).toBe('preview')
    expect(item?.meta?.image_preview_url).toBe('tfile:///tmp/preview.png')
  })

  it('notifies on favorite/delete operations through injected callbacks when no db is available', async () => {
    const onChange = vi.fn()
    const history = new ClipboardHistoryPersistence({ onChange })

    await history.setFavorite({ id: 1, isFavorite: true })
    await history.deleteItem({ id: 1 })

    expect(onChange).not.toHaveBeenCalled()
  })
})
