import { beforeEach, describe, expect, it, vi } from 'vitest'

const { execFileMock, getMainConfigMock, getPathMock, statMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  getMainConfigMock: vi.fn(),
  getPathMock: vi.fn(),
  statMock: vi.fn()
}))

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

  it('detects macOS application bundle paths by path segment', () => {
    expect(__test__.isMacApplicationBundlePath('/Applications/QQ.app')).toBe(true)
    expect(__test__.isMacApplicationBundlePath('/Applications/QQ.app/Contents/Info.plist')).toBe(
      true
    )
    expect(__test__.isMacApplicationBundlePath('/Users/demo/Apps/ChatApp.APP')).toBe(true)
    expect(__test__.isMacApplicationBundlePath('/Users/demo/qq-notes.txt')).toBe(false)
    expect(__test__.isMacApplicationBundlePath('/Users/demo/My.app.backup/file.txt')).toBe(false)
  })

  it('filters application bundles from Spotlight file search results', async () => {
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      callback(null, {
        stdout:
          '/Applications/QQ.app\0' +
          '/Applications/QQ.app/Contents/Info.plist\0' +
          '/System/Library/PrivateFrameworks/MapsUI.framework/safari.svg\0' +
          '/Users/demo/Documents/qq-notes.txt\0'
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

    expect(results.map((result) => result.path)).toEqual(['/Users/demo/Documents/qq-notes.txt'])
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
    expect(statMock).toHaveBeenCalledTimes(1)
    expect(statMock).toHaveBeenCalledWith('/Users/demo/Documents/qq-notes.txt')
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
