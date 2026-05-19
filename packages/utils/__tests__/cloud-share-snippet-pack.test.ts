import { describe, expect, it, vi } from 'vitest'
import {
  containsSensitiveContent,
  createSnippetPack,
  importSnippetPack,
  normalizeSnippetPack,
  SNIPPET_PACK_FORMAT,
  TOUCH_SNIPPETS_PLUGIN_ID,
} from '../cloud-share/snippet-pack'

describe('cloud share snippet pack helpers', () => {
  it('filters sensitive snippets from shareable packs by default', () => {
    const pack = createSnippetPack(
      [
        { id: 'safe', title: 'Safe', content: 'hello' },
        { id: 'secret', title: 'Secret', content: 'api_key = "hidden"' },
      ],
      { title: 'Team pack' },
      { now: 123 },
    )

    expect(pack.format).toBe(SNIPPET_PACK_FORMAT)
    expect(pack.pluginId).toBe(TOUCH_SNIPPETS_PLUGIN_ID)
    expect(pack.title).toBe('Team pack')
    expect(pack.snippets).toHaveLength(1)
    expect(pack.snippets[0].id).toBe('safe')
    expect(pack.skippedSensitiveCount).toBe(1)
    expect(containsSensitiveContent('password: test')).toBe(true)
  })

  it('normalizes CloudShare content package payloads with contentInline snippets', () => {
    const pack = normalizeSnippetPack({
      title: 'Cloud pack',
      contentInline: {
        snippets: [{ id: 'one', title: 'One', content: 'first' }],
      },
    })

    expect(pack.title).toBe('Cloud pack')
    expect(pack.snippets).toHaveLength(1)
    expect(pack.snippets[0]).toMatchObject({
      id: 'one',
      title: 'One',
      content: 'first',
    })
  })

  it('merges snippet packs and renames duplicate ids', () => {
    vi.useFakeTimers()
    vi.setSystemTime(456)

    try {
      const imported = importSnippetPack(
        [{ id: 'one', title: 'Existing', content: 'old' }],
        {
          format: SNIPPET_PACK_FORMAT,
          snippets: [
            { id: 'one', title: 'Imported', content: 'new' },
            { id: 'two', title: 'Two', content: 'second' },
          ],
        },
      )

      expect(imported.importedCount).toBe(2)
      expect(imported.snippets).toHaveLength(3)
      expect(imported.snippets[0].id).toBe('one-imported-456-0')
      expect(imported.snippets[1].id).toBe('two')
      expect(imported.snippets[2].id).toBe('one')
    }
    finally {
      vi.useRealTimers()
    }
  })
})
