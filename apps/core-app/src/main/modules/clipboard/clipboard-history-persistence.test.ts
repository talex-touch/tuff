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
  describe('annotate', () => {
    /**
     * A fake just wide enough for `annotate`: one select-by-id and one update, both recorded.
     */
    function createAnnotateDb(row: IClipboardItem | undefined) {
      const updates: Array<Record<string, unknown>> = []
      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => (row ? [row] : [])
            })
          })
        }),
        update: () => ({
          set: (values: Record<string, unknown>) => ({
            where: async () => {
              updates.push(values)
            }
          })
        })
      }
      return { db, updates }
    }

    function createHistory(row: IClipboardItem | undefined) {
      const { db, updates } = createAnnotateDb(row)
      const history = new ClipboardHistoryPersistence()
      history.setDatabase(db as never)
      if (row) history.updateMemoryCache(row)
      return { history, updates }
    }

    it('writes the note and tags, normalised, into the metadata column', async () => {
      const row = createTextItem({ id: 7, metadata: '{"tags":["api_key"]}' })
      const { history, updates } = createHistory(row)

      const result = await history.annotate({ id: 7, note: '  ego  lite ', tags: ['Prod', 'prod'] })

      expect(result).toEqual({ updated: true, note: 'ego lite', tags: ['Prod'] })
      // 分类器算出来的 tags 必须原样留着：用户标注不是它的替代品。
      expect(JSON.parse(String(updates[0]?.metadata))).toEqual({
        tags: ['api_key'],
        user_note: 'ego lite',
        user_tags: ['Prod']
      })
    })

    it('leaves the field that was not sent alone', async () => {
      const row = createTextItem({
        id: 8,
        metadata: '{"user_note":"keep me","user_tags":["prod"]}'
      })
      const { history, updates } = createHistory(row)

      // 只改标签的调用不该顺手清掉备注——一个只编辑备注的输入框否则必须始终持有最新标签。
      await history.annotate({ id: 8, tags: ['staging'] })
      expect(JSON.parse(String(updates[0]?.metadata))).toEqual({
        user_note: 'keep me',
        user_tags: ['staging']
      })
    })

    it('removes the key rather than storing an empty shell when cleared', async () => {
      const row = createTextItem({ id: 9, metadata: '{"user_note":"gone soon","user_tags":["x"]}' })
      const { history, updates } = createHistory(row)

      const result = await history.annotate({ id: 9, note: '   ', tags: [] })

      expect(result).toEqual({ updated: true, note: null, tags: [] })
      // metadata 整列都进关键词 LIKE：留下 "user_note":null 会让搜「note」命中每一条
      // 被清过备注的记录。
      expect(JSON.parse(String(updates[0]?.metadata))).toEqual({})
    })

    it('reports not-updated for an id that is not there, and writes nothing', async () => {
      const { history, updates } = createHistory(undefined)

      await expect(history.annotate({ id: 404, note: 'hi' })).resolves.toEqual({
        updated: false,
        note: null,
        tags: []
      })
      expect(updates).toHaveLength(0)
    })
  })

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
