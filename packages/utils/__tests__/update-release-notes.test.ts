import { describe, expect, it } from 'vitest'
import { normalizeBundledReleaseNotesCatalog, normalizeReleaseNotesEntry } from '../types/update'

const summary = {
  zh: ['摘要一', '摘要二', '摘要三'],
  en: ['Summary one', 'Summary two', 'Summary three'],
}

const notes = {
  zh: '# 中文\n',
  en: '# English\n',
}

describe('update release notes contracts', () => {
  it('normalizes a bundled bilingual catalog', () => {
    const catalog = normalizeBundledReleaseNotesCatalog({
      schemaVersion: 1,
      generatedForVersion: '2.4.14',
      legacyThrough: {
        RELEASE: '2.4.13',
        BETA: '2.4.13-beta.23',
      },
      entries: [
        {
          version: '2.4.14',
          tag: 'v2.4.14',
          channel: 'RELEASE',
          summary,
          currentNotes: notes,
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
  ])('rejects malformed bundled catalogs %#', input => {
    expect(
      normalizeBundledReleaseNotesCatalog({
        schemaVersion: 1,
        legacyThrough: { RELEASE: '2.4.13', BETA: '2.4.13-beta.23' },
        ...input,
      }),
    ).toBeNull()
  })

  it('normalizes a Nexus history entry without consuming notesHtml', () => {
    expect(
      normalizeReleaseNotesEntry(
        {
          tag: 'v2.4.14-beta.1',
          version: '2.4.14-beta.1',
          name: 'Release v2.4.14-beta.1',
          channel: 'BETA',
          notes,
          notesHtml: { zh: '<script>bad</script>', en: '<script>bad</script>' },
          status: 'published',
          publishedAt: '2026-07-28T00:00:00.000Z',
          createdAt: '2026-07-28T00:00:00.000Z',
        },
        { legacy: false },
      ),
    ).toEqual({
      tag: 'v2.4.14-beta.1',
      version: '2.4.14-beta.1',
      name: 'Release v2.4.14-beta.1',
      channel: 'BETA',
      notes,
      publishedAt: '2026-07-28T00:00:00.000Z',
      legacy: false,
    })
  })

  it('rejects a history entry without both Markdown locales', () => {
    expect(
      normalizeReleaseNotesEntry(
        {
          tag: 'v2.4.14',
          version: '2.4.14',
          channel: 'RELEASE',
          notes: { zh: '# 中文', en: '' },
          status: 'published',
          createdAt: '2026-07-28T00:00:00.000Z',
        },
        { legacy: false },
      ),
    ).toBeNull()
  })
})
