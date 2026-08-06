import type { TuffItem, TuffQuery } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import {
  FileProviderSearchResultService,
  type FileProviderSearchResultServiceDeps
} from './file-provider-search-result-service'

const RESUME_NFC = 'résumé'.normalize('NFC')
const RESUME_NFD = 'résumé'.normalize('NFD')
const RESUME_PATH = `/home/me/${RESUME_NFC}.pdf`
const ALPHA_PATH = '/home/me/project alpha.txt'

/**
 * Keyword mappings as `prepareDocument` writes them: cleaned form (so
 * `project-alpha` is stored as `project alpha`) plus the diacritic-folded twin.
 */
const KEYWORD_INDEX: Record<string, string[]> = {
  'project alpha': [ALPHA_PATH],
  [RESUME_NFC]: [RESUME_PATH],
  resume: [RESUME_PATH]
}

function makeService(): {
  service: FileProviderSearchResultService
  lookupTerms: string[][]
} {
  const lookupTerms: string[][] = []
  const paths = Array.from(new Set(Object.values(KEYWORD_INDEX).flat()))
  const dbRows = paths.map((path, index) => ({
    file: {
      id: index + 1,
      path,
      name: path.split('/').at(-1) ?? path,
      type: 'file',
      extension: `.${path.split('.').at(-1) ?? 'txt'}`,
      isDir: false,
      mtime: new Date(0)
    },
    extensionKey: null,
    extensionValue: null
  }))

  const getDb = (): unknown => ({
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => Promise.resolve(dbRows)
        })
      })
    })
  })

  const deps: FileProviderSearchResultServiceDeps = {
    providerId: 'files',
    getDbUtils: () => ({ getDb, getFileIndexReadDb: getDb }) as never,
    getSearchIndex: () =>
      ({
        lookupByKeywords: async (_providerId: string, terms: string[]) => {
          lookupTerms.push(terms)
          return new Map(
            terms
              .filter((term) => KEYWORD_INDEX[term])
              .map((term) => [
                term,
                (KEYWORD_INDEX[term] ?? []).map((itemId) => ({ itemId, priority: 1.1 }))
              ])
          )
        },
        lookupByKeywordPrefix: async () => [],
        search: async () => []
      }) as never,
    buildItem: (file) =>
      ({
        id: file.path,
        kind: 'file',
        source: { type: 'file', id: 'files', name: 'Files' },
        render: { mode: 'default', basic: { title: file.path } },
        meta: {}
      }) as TuffItem,
    normalizeItem: (item) => item,
    sanitizeExtensions: (extensions) => extensions,
    cleanupStaleCandidates: () => {},
    semanticSearch: async () => [],
    logDebug: () => {},
    formatDuration: (ms) => `${ms}ms`,
    now: () => 0
  }

  return { service: new FileProviderSearchResultService(deps), lookupTerms }
}

async function searchIds(text: string): Promise<{ ids: string[]; lookupTerms: string[] }> {
  const { service, lookupTerms } = makeService()
  const result = await service.search({ text } as TuffQuery, new AbortController().signal)
  return { ids: result.items.map((item) => item.id), lookupTerms: lookupTerms[0] ?? [] }
}

describe('FileProviderSearchResultService keyword charset', () => {
  it('reaches a cleaned spaced keyword from a single hyphenated term', async () => {
    // One base term, so the phrase branch never runs: only the cleaned variant
    // of the term itself can reach the stored `project alpha` keyword.
    const { ids, lookupTerms } = await searchIds('project-alpha')

    expect(lookupTerms).toEqual(['project-alpha', 'project alpha'])
    expect(ids).toContain(ALPHA_PATH)
  })

  it('matches an NFD-typed query against the NFC keyword', async () => {
    const { ids, lookupTerms } = await searchIds(RESUME_NFD)

    expect(lookupTerms).toEqual([RESUME_NFC, 'resume'])
    expect(ids).toContain(RESUME_PATH)
  })

  it('matches an accented file through either spelling', async () => {
    await expect(searchIds(RESUME_NFC).then((result) => result.ids)).resolves.toContain(RESUME_PATH)
    await expect(searchIds('resume').then((result) => result.ids)).resolves.toContain(RESUME_PATH)
  })

  it('does not grow the lookup list for plain ascii queries', async () => {
    await expect(searchIds('report').then((result) => result.lookupTerms)).resolves.toEqual([
      'report'
    ])
    await expect(searchIds('project alpha').then((result) => result.lookupTerms)).resolves.toEqual([
      'project',
      'alpha',
      'project alpha'
    ])
  })
})
