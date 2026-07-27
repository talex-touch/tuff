import { describe, expect, it } from 'vitest'
import { isDocsPageRecordForRoute } from './docs-page-client-cache'

describe('docs page route ownership', () => {
  it('accepts a record only for the active localized route', () => {
    const english = { path: '/docs/guide/input.en', title: 'Input' }

    expect(isDocsPageRecordForRoute(english, '/docs/guide/input', 'en')).toBe(true)
    expect(isDocsPageRecordForRoute(english, '/docs/guide/input', 'zh')).toBe(false)
    expect(isDocsPageRecordForRoute(english, '/docs/guide/button', 'en')).toBe(false)
  })

  it('accepts locale-neutral records only when their normalized path matches', () => {
    const neutral = { _path: '/docs/index/', title: 'Docs' }

    expect(isDocsPageRecordForRoute(neutral, '/docs/index', 'en')).toBe(true)
    expect(isDocsPageRecordForRoute(neutral, '/docs/index', 'zh')).toBe(true)
    expect(isDocsPageRecordForRoute(null, '/docs/index', 'en')).toBe(false)
  })
})
