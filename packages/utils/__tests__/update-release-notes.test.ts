import { describe, expect, it } from 'vitest'
import { normalizeBundledReleaseNotesCatalog } from '../types/update'

const summary = {
  zh: ['摘要一', '摘要二', '摘要三'],
  en: ['Summary one', 'Summary two', 'Summary three'],
}

describe('update release notes contracts', () => {
  it('normalizes a bundled bilingual summary catalog', () => {
    const catalog = normalizeBundledReleaseNotesCatalog({
      schemaVersion: 1,
      generatedForVersion: '2.4.14',
      entries: [
        {
          version: '2.4.14',
          tag: 'v2.4.14',
          channel: 'RELEASE',
          summary,
        },
      ],
    })

    expect(catalog).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        generatedForVersion: '2.4.14',
      }),
    )
    expect(catalog?.entries[0]?.summary.zh).toEqual(summary.zh)
  })

  it.each([
    { generatedForVersion: '2.4.14', entries: 'invalid' },
    {
      generatedForVersion: '2.4.14',
      entries: [{ version: '2.4.14', tag: 'v2.4.13', channel: 'RELEASE', summary }],
    },
    {
      generatedForVersion: '2.4.14',
      entries: [{ version: '2.4.14', tag: 'v2.4.14', channel: 'SNAPSHOT', summary }],
    },
  ])('rejects malformed bundled catalogs %#', (input) => {
    expect(
      normalizeBundledReleaseNotesCatalog({
        schemaVersion: 1,
        ...input,
      }),
    ).toBeNull()
  })
})
