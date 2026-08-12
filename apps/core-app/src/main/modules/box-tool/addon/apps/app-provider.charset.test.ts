import { beforeEach, describe, expect, it, vi } from 'vitest'
import { asPrivateProvider, loadSubject, pinyinMock } from './app-provider-test-harness'

type FtsQueryBuilder = { buildFtsQuery: (terms: string[]) => string }

async function loadBuildFtsQuery(): Promise<(terms: string[]) => string> {
  const { appProvider } = await loadSubject()
  const builder = appProvider as unknown as FtsQueryBuilder
  return (terms: string[]) => builder.buildFtsQuery(terms)
}

describe('appProvider keyword charset', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    pinyinMock.mockImplementation((value: string, options?: { pattern?: string }) => {
      if (options?.pattern === 'first') {
        return value === '聊天应用' ? 'LTYY' : value
      }
      return value === '聊天应用' ? 'LIAO TIAN YING YONG' : value
    })
  })

  it('keeps non-latin and accented query terms in the fts query', async () => {
    const buildFtsQuery = await loadBuildFtsQuery()

    expect(buildFtsQuery(['ひらがな'])).toBe('ひらがな')
    expect(buildFtsQuery(['한글'])).toBe('한글')
    expect(buildFtsQuery(['привет'])).toBe('привет')
    expect(buildFtsQuery(['übersicht'])).toBe('übersicht')
    expect(buildFtsQuery(['微信'])).toBe('微信')
  })

  it('splits separators into tokens and caps the query at 5 tokens', async () => {
    const buildFtsQuery = await loadBuildFtsQuery()

    expect(buildFtsQuery(['7-zip'])).toBe('7 zip')
    expect(buildFtsQuery(['one two three four five six'])).toBe('one two three four five')
    expect(buildFtsQuery(['---'])).toBe('')
  })

  it('indexes multi-word aliases and accented names as keywords', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)

    const keywords = await privateProvider._generateKeywordsForApp({
      name: 'Visual Studio Code',
      displayName: 'Visual Studio Code',
      fileName: 'Visual Studio Code',
      alternateNames: ['Café Übersicht'],
      path: '/Applications/Visual Studio Code.app',
      launchKind: 'path',
      launchTarget: '/Applications/Visual Studio Code.app',
      stableId: '/Applications/Visual Studio Code.app',
      icon: '',
      lastModified: new Date(0)
    })

    expect(keywords).toContain('visual studio code')
    expect(keywords).toContain('visualstudiocode')
    expect(keywords).toContain('vsc')
    expect(keywords).toContain('café übersicht')
  })
})
