import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

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

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { registerFileAssetBridge } from './file-asset-bridge'
import { __test__, macSpotlightFileProvider } from './native-file-search-provider'

interface SearchableSpotlightProvider {
  searchNative: (
    text: string,
    signal: AbortSignal
  ) => Promise<Array<{ path: string; name: string; extension: string; isDir: boolean }>>
}

// The Spotlight path is macOS-only: the provider gates on
// `process.platform !== this.capabilities.platform`, so on a Linux runner it
// reports unavailable and warms no icons, and the failure reads as a broken
// icon cache. Pinned so the macOS behaviour is asserted explicitly.
const originalPlatform = process.platform

beforeAll(() => {
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
})

afterAll(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
})

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

  it('shows the index thumbnail for an image Spotlight found and asks for a missing one', async () => {
    // Spotlight hands back paths under ~/Pictures. Sent out as their own path those are refused by
    // tfile and the row shows the renderer's "image failed" square; the index already holds a
    // thumbnail for one of them, and the other can have one generated the way search results do.
    const thumbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spotlight-thumbs-'))
    const thumbnail = path.join(thumbDir, 'shot.jpg')
    fs.writeFileSync(thumbnail, 'jpg')
    const indexedRow = (id: number, filePath: string) => ({
      id,
      path: filePath,
      name: path.basename(filePath),
      displayName: null,
      extension: '.png',
      size: 12,
      mtime: new Date('2026-05-12T00:00:00.000Z'),
      ctime: new Date('2026-05-12T00:00:00.000Z'),
      lastIndexedAt: new Date(),
      isDir: false,
      type: 'file' as const,
      content: null,
      embeddingStatus: 'none' as const
    })
    const ensureThumbnail = vi.fn(
      async (_file: { id: number }, _extensions: Record<string, string>) => undefined
    )
    const lookupIndexedFiles = vi.fn(async () => {
      const assets = new Map()
      assets.set('/Users/demo/Pictures/shot.png', {
        file: indexedRow(7, '/Users/demo/Pictures/shot.png'),
        extensions: { thumbnail }
      })
      assets.set('/Users/demo/Pictures/fresh.png', {
        file: indexedRow(8, '/Users/demo/Pictures/fresh.png'),
        extensions: {}
      })
      return assets
    })
    const disposeBridge = registerFileAssetBridge({ lookupIndexedFiles, ensureThumbnail })

    try {
      execFileMock.mockImplementation((_command, args, _options, callback) => {
        if (Array.isArray(args) && args.includes('-version')) {
          callback(null, { stdout: 'mdfind test' })
          return
        }
        callback(null, {
          stdout:
            '/Users/demo/Pictures/shot.png\0/Users/demo/Pictures/fresh.png\0/Users/demo/Pictures/stray.png\0'
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
        { text: 'png' },
        new AbortController().signal
      )

      expect(lookupIndexedFiles).toHaveBeenCalledWith([
        '/Users/demo/Pictures/shot.png',
        '/Users/demo/Pictures/fresh.png',
        '/Users/demo/Pictures/stray.png'
      ])
      const icons = result.items.map((item) => item.render.basic?.icon)
      // Indexed with a thumbnail: the picture, served from the thumbnail cache.
      expect(icons[0]?.type).toBe('url')
      expect(icons[0]?.value.startsWith('tfile://')).toBe(true)
      expect(icons[0]?.value).not.toContain('Pictures')
      // Indexed without one: the image glyph now, and a generation request under the index id.
      expect(icons[1]).toEqual({ type: 'class', value: 'i-ri-image-line' })
      expect(ensureThumbnail).toHaveBeenCalledTimes(1)
      expect(ensureThumbnail.mock.calls[0][0]).toMatchObject({ id: 8 })
      // Not indexed at all: never its own (refused) path — the file glyph, with an icon warm-up.
      expect(icons[2]).toEqual({ type: 'class', value: 'i-ri-file-line' })
      expect(iconCacheEnsureMock).toHaveBeenCalledWith('/Users/demo/Pictures/stray.png')
      expect(result.items[0]?.id).toBe('/Users/demo/Pictures/shot.png')
    } finally {
      disposeBridge()
      fs.rmSync(thumbDir, { recursive: true, force: true })
    }
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
