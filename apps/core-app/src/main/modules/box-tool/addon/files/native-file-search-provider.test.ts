import { describe, expect, it, vi } from 'vitest'

const { execFileMock, statMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  statMock: vi.fn()
}))

vi.mock('electron', () => ({
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
  it('detects macOS application bundle paths by path segment', () => {
    expect(__test__.isMacApplicationBundlePath('/Applications/QQ.app')).toBe(true)
    expect(__test__.isMacApplicationBundlePath('/Applications/QQ.app/Contents/Info.plist')).toBe(
      true
    )
    expect(__test__.isMacApplicationBundlePath('/Users/demo/Apps/WeChat.APP')).toBe(true)
    expect(__test__.isMacApplicationBundlePath('/Users/demo/qq-notes.txt')).toBe(false)
    expect(__test__.isMacApplicationBundlePath('/Users/demo/My.app.backup/file.txt')).toBe(false)
  })

  it('filters application bundles from Spotlight file search results', async () => {
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      callback(null, {
        stdout:
          '/Applications/QQ.app\0' +
          '/Applications/QQ.app/Contents/Info.plist\0' +
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
    expect(statMock).toHaveBeenCalledTimes(1)
    expect(statMock).toHaveBeenCalledWith('/Users/demo/Documents/qq-notes.txt')
  })
})
