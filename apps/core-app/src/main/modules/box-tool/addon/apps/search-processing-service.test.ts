import { describe, expect, it } from 'vitest'
import { processSearchResults } from './search-processing-service'

describe('search-processing-service', () => {
  it('falls back to clean app name when displayName contains replacement chars', async () => {
    const items = await processSearchResults(
      [
        {
          id: 80,
          path: 'D:/Weixin/Weixin.exe',
          name: '\u5FAE\u4FE1',
          displayName: '\u03A2\uFFFD\uFFFD',
          type: 'app',
          mtime: new Date(),
          ctime: new Date(),
          lastIndexedAt: new Date(0),
          isDir: false,
          embeddingStatus: 'none',
          extensions: {}
        }
      ] as never,
      { text: '\u5FAE' } as never,
      false,
      {}
    )

    expect(items).toHaveLength(1)
    const [item] = items
    expect(item?.render).toMatchObject({
      basic: {
        title: '\u5FAE\u4FE1'
      }
    })
  })
})
