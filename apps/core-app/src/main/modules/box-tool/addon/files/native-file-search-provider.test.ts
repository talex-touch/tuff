import { beforeEach, describe, expect, it, vi } from 'vitest'

const { execFileMock, getMainConfigMock, getPathMock, iconCacheEnsureMock, statMock } = vi.hoisted(
  () => ({
    execFileMock: vi.fn(),
    getMainConfigMock: vi.fn(),
    getPathMock: vi.fn(),
    iconCacheEnsureMock: vi.fn(),
    statMock: vi.fn()
  })
)

vi.mock('electron', () => ({
  app: {
    getPath: getPathMock
  },
  shell: {
    openPath: vi.fn()
  }
}))

vi.mock('node:child_process', () => ({
  execFile: execFileMock
}))

vi.mock('node:fs/promises', () => ({
  default: {
    stat: statMock
  },
  stat: statMock
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: vi.fn(() => ({
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn()
    })),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  }))
}))

vi.mock('../../../storage', () => ({
  getMainConfig: getMainConfigMock
}))

vi.mock('../../search-engine/search-logger', () => ({
  searchLogger: {
    logProviderSearch: vi.fn()
  }
}))

vi.mock('./everything-icon-cache', () => ({
  EverythingIconCache: vi.fn(() => ({
    get: vi.fn((filePath: string) =>
      filePath.includes('cached-icon') ? 'data:image/png;base64,cached' : null
    ),
    ensure: iconCacheEnsureMock,
    clear: vi.fn()
  }))
}))

import { __test__, macSpotlightFileProvider } from './native-file-search-provider'

interface SearchableSpotlightProvider {
  searchNative: (
    text: string,
    signal: AbortSignal
  ) => Promise<Array<{ path: string; name: string; extension: string; isDir: boolean }>>
}

describe('native-file-search-provider', () => {
  beforeEach(() => {
    execFileMock.mockReset()
    getMainConfigMock.mockReset()
    getPathMock.mockReset()
    iconCacheEnsureMock.mockReset()
    statMock.mockReset()
    getMainConfigMock.mockReturnValue({ extraPaths: [] })
    getPathMock.mockImplementation((name: string) => {
      const pathByName: Record<string, string> = {
        documents: '/Users/demo/Documents',
        downloads: '/Users/demo/Downloads',
        desktop: '/Users/demo/Desktop',
        music: '/Users/demo/Music',
        pictures: '/Users/demo/Pictures',
        videos: '/Users/demo/Videos'
      }
      return pathByName[name] || `/Users/demo/${name}`
    })
  })

  it('filters application metadata before Spotlight stat and preserves user files', async () => {
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      callback(null, {
        stdout:
          '/Users/demo/Documents/QQ.app/Contents/Info.plist\0' +
          '/Users/demo/Music/Music Library.musiclibrary/Genius.itdb\0' +
          '/Users/demo/Music/Media.localized\0' +
          '/Users/demo/Documents/qq-notes.txt\0' +
          '/Users/demo/Downloads/WeTypeInstaller_3000.zip\0' +
          '/Users/demo/Pictures/Screenshot.png\0'
      })
    })
    statMock.mockResolvedValue({
      size: 12,
      mtime: new Date('2026-05-12T00:00:00.000Z'),
      ctime: new Date('2026-05-12T00:00:00.000Z'),
      isDirectory: () => false
    })

    const provider = macSpotlightFileProvider as unknown as SearchableSpotlightProvider
    const results = await provider.searchNative('qq', new AbortController().signal)

    expect(results.map((result) => result.path)).toEqual([
      '/Users/demo/Documents/qq-notes.txt',
      '/Users/demo/Downloads/WeTypeInstaller_3000.zip',
      '/Users/demo/Pictures/Screenshot.png'
    ])
    expect(execFileMock).toHaveBeenCalledWith(
      'mdfind',
      expect.arrayContaining([
        '-onlyin',
        '/Users/demo/Documents',
        '-onlyin',
        '/Users/demo/Downloads'
      ]),
      expect.objectContaining({ timeout: 1200 }),
      expect.any(Function)
    )
    expect(statMock).toHaveBeenCalledTimes(3)
    expect(statMock).not.toHaveBeenCalledWith(
      '/Users/demo/Music/Music Library.musiclibrary/Genius.itdb'
    )
  })

  it('includes deduped file index extra paths in Spotlight search roots', async () => {
    getMainConfigMock.mockReturnValue({
      extraPaths: ['/Users/demo/Projects', '/users/demo/projects', '  /Users/demo/Notes  ']
    })
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      callback(null, {
        stdout: '/Users/demo/Projects/readme.md\0/Users/demo/Notes/todo.md\0'
      })
    })
    statMock.mockResolvedValue({
      size: 12,
      mtime: new Date('2026-05-12T00:00:00.000Z'),
      ctime: new Date('2026-05-12T00:00:00.000Z'),
      isDirectory: () => false
    })

    const provider = macSpotlightFileProvider as unknown as SearchableSpotlightProvider
    const results = await provider.searchNative('readme', new AbortController().signal)
    const args = execFileMock.mock.calls[0]?.[1] as string[]

    expect(args).toContain('/Users/demo/Projects')
    expect(args).toContain('/Users/demo/Notes')
    expect(args.filter((arg) => arg.toLowerCase() === '/users/demo/projects')).toHaveLength(1)
    expect(results.map((result) => result.path)).toEqual([
      '/Users/demo/Projects/readme.md',
      '/Users/demo/Notes/todo.md'
    ])
  })

  it('returns empty results without running all-disk mdfind when no search roots are available', async () => {
    getPathMock.mockImplementation(() => {
      throw new Error('path unavailable')
    })
    getMainConfigMock.mockReturnValue({ extraPaths: [] })

    const provider = macSpotlightFileProvider as unknown as SearchableSpotlightProvider
    const results = await provider.searchNative('safari', new AbortController().signal)

    expect(results).toEqual([])
    expect(execFileMock).not.toHaveBeenCalled()
    expect(statMock).not.toHaveBeenCalled()
  })

  it('uses cached file icons and warms missing icons for Spotlight results', async () => {
    execFileMock.mockImplementation((_command, args, _options, callback) => {
      if (Array.isArray(args) && args.includes('-version')) {
        callback(null, { stdout: 'mdfind test' })
        return
      }
      callback(null, {
        stdout: '/Users/demo/Documents/cached-icon.docx\0/Users/demo/Documents/missing-icon.pdf\0'
      })
    })
    statMock.mockResolvedValue({
      size: 12,
      mtime: new Date('2026-05-12T00:00:00.000Z'),
      ctime: new Date('2026-05-12T00:00:00.000Z'),
      isDirectory: () => false
    })

    await macSpotlightFileProvider.onLoad()
    const result = await macSpotlightFileProvider.onSearch(
      { text: 'icon' },
      new AbortController().signal
    )

    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        render: expect.objectContaining({
          basic: expect.objectContaining({
            icon: { type: 'url', value: 'data:image/png;base64,cached' }
          })
        })
      })
    )
    expect(result.items[1]).toEqual(
      expect.objectContaining({
        render: expect.objectContaining({
          basic: expect.objectContaining({
            icon: { type: 'class', value: 'i-ri-file-line' }
          })
        })
      })
    )
    expect(iconCacheEnsureMock).toHaveBeenCalledWith('/Users/demo/Documents/missing-icon.pdf')
  })

  it('checks Spotlight result containment using case-insensitive root keys', () => {
    const roots = __test__.createMacSpotlightSearchRoots([
      '/Users/demo/Documents',
      '/users/demo/documents/',
      '/Users/demo/Projects'
    ])

    expect(roots.map((root) => root.path)).toEqual([
      '/Users/demo/Documents',
      '/Users/demo/Projects'
    ])
    expect(__test__.isWithinMacSpotlightSearchRoots('/users/demo/documents/a.txt', roots)).toBe(
      true
    )
    expect(
      __test__.isWithinMacSpotlightSearchRoots('/System/Library/PrivateFrameworks/a.svg', roots)
    ).toBe(false)
  })
})
