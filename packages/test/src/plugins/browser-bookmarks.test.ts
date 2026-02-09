import { describe, expect, it } from 'vitest'
import { loadPluginModule } from './plugin-loader'

const bookmarksPlugin = loadPluginModule(new URL('../../../../plugins/touch-browser-bookmarks/index.js', import.meta.url))
const { __test: bookmarksTest } = bookmarksPlugin

describe('browser bookmarks plugin', () => {
  it('normalizes url input', () => {
    expect(bookmarksTest.normalizeUrlInput('example.com')).toBe('https://example.com/')
    expect(bookmarksTest.normalizeUrlInput('https://example.com/path')).toBe('https://example.com/path')
    expect(bookmarksTest.normalizeUrlInput('not a url')).toBeNull()
  })

  it('upserts bookmark by url', () => {
    const now = 1_700_000_000_000
    const first = bookmarksTest.upsertBookmark([], {
      url: 'example.com',
      title: 'Example',
      tags: ['news'],
    }, now)

    const second = bookmarksTest.upsertBookmark(first, {
      url: 'https://example.com',
      title: 'Example Updated',
      tags: ['daily'],
      pinned: true,
    }, now + 1000)

    expect(second.length).toBe(1)
    expect(second[0].title).toBe('Example Updated')
    expect(second[0].pinned).toBe(true)
    expect(second[0].tags).toContain('news')
    expect(second[0].tags).toContain('daily')
  })

  it('cleans recent items and removes expired/duplicate entries', () => {
    const now = Date.now()
    const tooOld = now - (31 * 24 * 60 * 60 * 1000)
    const cleaned = bookmarksTest.cleanupRecent([
      { url: 'https://a.com', title: 'A old', lastUsedAt: tooOld },
      { url: 'https://a.com', title: 'A new', lastUsedAt: now - 1000 },
      { url: 'https://b.com', title: 'B', lastUsedAt: now - 500 },
    ], now)

    expect(cleaned.length).toBe(2)
    expect(cleaned[0].url).toBe('https://b.com/')
    expect(cleaned[1].url).toBe('https://a.com/')
    expect(cleaned[1].title).toBe('A new')
  })

  it('merges recent display by excluding bookmarks', () => {
    const recent = [
      { url: 'https://a.com/', title: 'A', lastUsedAt: 3 },
      { url: 'https://b.com/', title: 'B', lastUsedAt: 2 },
      { url: 'https://c.com/', title: 'C', lastUsedAt: 1 },
    ]
    const bookmarks = [
      { url: 'https://b.com/' },
    ]

    const merged = bookmarksTest.mergeRecentForDisplay(recent, bookmarks)
    expect(merged.length).toBe(2)
    expect(merged[0].url).toBe('https://a.com/')
    expect(merged[1].url).toBe('https://c.com/')
  })
})
