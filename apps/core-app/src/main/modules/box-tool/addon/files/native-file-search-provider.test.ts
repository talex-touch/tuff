import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  execFileMock,
  getMainConfigMock,
  getPathMock,
  iconCacheEnsureMock,
  iconCacheGetMock,
  originalPlatform,
  readdirMock,
  statMock
} = vi.hoisted(() => {
  // The filter constants are platform-derived at import time (`~/Library` is a system location
  // only on darwin), so the Spotlight platform is pinned before any module loads, not in
  // beforeAll: otherwise a Linux runner would evaluate them for Linux and the macOS rules under
  // test would silently not apply.
  const platform = process.platform
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  return {
    execFileMock: vi.fn(),
    getMainConfigMock: vi.fn(),
    getPathMock: vi.fn(),
    iconCacheEnsureMock: vi.fn(),
    iconCacheGetMock: vi.fn(),
    originalPlatform: platform,
    readdirMock: vi.fn(),
    statMock: vi.fn()
  }
})

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
    readdir: readdirMock,
    stat: statMock
  },
  readdir: readdirMock,
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
    get: iconCacheGetMock,
    ensure: iconCacheEnsureMock,
    clear: vi.fn()
  }))
}))

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { registerFileAssetBridge } from './file-asset-bridge'
import {
  __test__,
  linuxNativeFileProvider,
  macSpotlightFileProvider
} from './native-file-search-provider'

/**
 * A real 1x1 PNG. A generated icon reaches the renderer as the cache path it was written to, and the
 * item pipeline drops a path that cannot be read, so icon fixtures have to exist on disk.
 */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
  'base64'
)

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
    iconCacheGetMock.mockReset()
    iconCacheGetMock.mockReturnValue(null)
    readdirMock.mockReset()
    readdirMock.mockResolvedValue([])
    statMock.mockReset()
    getMainConfigMock.mockReturnValue({ extraPaths: [] })
    getPathMock.mockImplementation((name: string) => {
      const pathByName: Record<string, string> = {
        home: '/Users/demo',
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
      expect.arrayContaining(['-onlyin', '/Users/demo']),
      expect.objectContaining({ timeout: 1200 }),
      expect.any(Function)
    )
    // The display-name clause tripled mdfind's wall time on a real library (900-1245ms vs
    // 300-350ms) for an identical result set: file search matches file names.
    const predicate = (execFileMock.mock.calls[0]?.[1] as string[]).at(-1) ?? ''
    expect(predicate).toBe('kMDItemFSName == "*qq*"cd')
    expect(predicate).not.toContain('kMDItemDisplayName')
    expect(statMock).toHaveBeenCalledTimes(3)
    expect(statMock).not.toHaveBeenCalledWith(
      '/Users/demo/Music/Music Library.musiclibrary/Genius.itdb'
    )
  })

  it('answers from the deferred layer so an ~900ms mdfind never holds the fast-layer budget', () => {
    // As a fast provider Spotlight missed the 80ms window on every keystroke and landed a second
    // later as a late result, collapsing the window on the snapshot and growing it back again.
    expect(macSpotlightFileProvider.priority).toBe('deferred')
  })

  it('subsumes persisted extra paths under the home Spotlight root', async () => {
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

    // The home root already covers every in-home extra path, so mdfind is handed exactly one
    // `-onlyin` root instead of a duplicate or nested set.
    const onlyInRoots = args.reduce<string[]>((roots, arg, index) => {
      if (arg === '-onlyin') roots.push(args[index + 1]!)
      return roots
    }, [])
    expect(onlyInRoots).toEqual(['/Users/demo'])
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
    // The cached value is the path of a generated icon: it reaches the renderer as the tfile: URL
    // that will actually load, which requires the file to be there.
    const iconDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spotlight-icons-'))
    const cachedIcon = path.join(iconDir, 'cached.png')
    fs.writeFileSync(cachedIcon, ONE_PIXEL_PNG)
    iconCacheGetMock.mockImplementation((filePath: string) =>
      filePath === '/Users/demo/Documents/cached-icon.docx' ? cachedIcon : null
    )

    try {
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
              icon: { type: 'url', value: `tfile://${cachedIcon}` }
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
      // The warm-up carries the version of the file it is for, so a stale entry cannot be reused.
      expect(iconCacheEnsureMock).toHaveBeenCalledWith(
        '/Users/demo/Documents/missing-icon.pdf',
        expect.objectContaining({ size: 12 })
      )
    } finally {
      fs.rmSync(iconDir, { recursive: true, force: true })
    }
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
      expect(iconCacheEnsureMock).toHaveBeenCalledWith(
        '/Users/demo/Pictures/stray.png',
        expect.objectContaining({ size: 12 })
      )
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
      '/Users/demo/Projects',
      '/Users/demo/Projects/2026'
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

  describe('file-index directory rule (D-b)', () => {
    const stubStat = (directories: readonly string[] = []): void => {
      statMock.mockImplementation(async (filePath: string) => ({
        size: 12,
        mtime: new Date('2026-09-25T19:07:00.000Z'),
        ctime: new Date('2026-09-25T19:07:00.000Z'),
        isDirectory: () => directories.includes(filePath)
      }))
    }
    const stubMdfind = (paths: readonly string[]): void => {
      execFileMock.mockImplementation((_command, _args, _options, callback) => {
        callback(null, { stdout: paths.map((entry) => `${entry}\0`).join('') })
      })
    }
    /** A readdir that answers from a fixed map of folder -> entries. */
    const stubFolders = (folders: Record<string, string[]>): void => {
      readdirMock.mockImplementation(async (directoryPath: string) => {
        const entries = folders[directoryPath]
        if (!entries) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        return entries
      })
    }

    it('hides build output, dependencies and ~/Library the way the file index does', async () => {
      // What mdfind answered for "wx" on the machine the refresh storm was reported on.
      stubFolders({
        '/Users/demo/Workspace/talex-touch/apps/core-app': ['package.json', 'src', 'out'],
        '/Users/demo/Workspace/mikobot/nanobot/web': ['package.json', 'dist', 'src'],
        // Not a project: `build` here is a user's folder, as #1727 intends.
        '/Users/demo/Documents': ['build', 'notes.md']
      })
      stubMdfind([
        '/Users/demo/Workspace/talex-touch/apps/core-app/out/renderer/assets/KaTeX_Caligraphic-Regular-wX97UBjC.ttf',
        '/Users/demo/Workspace/mikobot/nanobot/web/dist/assets/KaTeX_Caligraphic-Regular-wX97UBjC.ttf',
        '/Users/demo/Workspace/mikobot-run/webui/node_modules/wx-sdk/index.js',
        '/Users/demo/Library/Application Support/WeChat/wx-cache.json',
        '/Users/demo/Documents/build/2026/wx-report.pdf',
        '/Users/demo/Documents/wx-notes.md'
      ])
      stubStat()

      const provider = macSpotlightFileProvider as unknown as SearchableSpotlightProvider
      const results = await provider.searchNative('wx', new AbortController().signal)

      expect(results.map((result) => result.path)).toEqual([
        '/Users/demo/Documents/build/2026/wx-report.pdf',
        '/Users/demo/Documents/wx-notes.md'
      ])
      // Hidden candidates are decided before any stat.
      expect(statMock).toHaveBeenCalledTimes(2)
    })

    it('keeps iCloud Drive, which lives under ~/Library, and still hides the rest of ~/Library', async () => {
      const cloud = '/Users/demo/Library/Mobile Documents'
      stubFolders({
        [`${cloud}/com~apple~CloudDocs/proj`]: ['package.json', 'node_modules', 'src']
      })
      stubMdfind([
        `${cloud}/com~apple~CloudDocs/Plans/wx-plan.md`,
        `${cloud}/iCloud~com~apple~Pages/Documents/wx-brief.pages`,
        `${cloud}/com~apple~CloudDocs/proj/node_modules/wx/index.js`,
        '/Users/demo/Library/Application Support/WeChat/wx-cache.json'
      ])
      stubStat()

      const provider = macSpotlightFileProvider as unknown as SearchableSpotlightProvider
      const results = await provider.searchNative('wx', new AbortController().signal)

      // Documents in iCloud Drive and in an app's iCloud container stay; dependencies inside
      // iCloud Drive and ordinary ~/Library data do not.
      expect(results.map((result) => result.path)).toEqual([
        `${cloud}/com~apple~CloudDocs/Plans/wx-plan.md`,
        `${cloud}/iCloud~com~apple~Pages/Documents/wx-brief.pages`
      ])
    })

    it('scopes the iCloud Drive exception to that one folder, so no other ~/Library path leaks', async () => {
      const cloud = '/Users/demo/Library/Mobile Documents'
      const cases: Array<[path: string, expected: 'visible' | 'hidden']> = [
        [`${cloud}/com~apple~CloudDocs/Plans/wx-plan.md`, 'visible'],
        // The same folder on a case-insensitive APFS volume.
        ['/Users/demo/library/mobile documents/com~apple~CloudDocs/wx-case.md', 'visible'],
        // A user's own folder named Library inside iCloud Drive.
        [`${cloud}/com~apple~CloudDocs/Library/wx-user-folder.md`, 'visible'],
        // `build` with no project marker beside it is a user's folder.
        [`${cloud}/com~apple~CloudDocs/build/2026/wx-report.pdf`, 'visible'],
        [`${cloud}/com~apple~CloudDocs/.secret/wx-dot.md`, 'hidden'],
        [`${cloud}/com~apple~CloudDocs/proj/node_modules/wx/index.js`, 'hidden'],
        // Siblings that only share the prefix.
        [`${cloud} Backup/wx-sibling.md`, 'hidden'],
        [`${cloud}Old/wx-sibling2.md`, 'hidden'],
        [`${cloud}/../Application Support/WeChat/wx-dotdot.json`, 'hidden'],
        ['/Users/demo/Library/Application Support/WeChat/wx-cache.json', 'hidden'],
        // The iCloud sync agent's own container is ~/Library data, not iCloud Drive.
        [
          '/Users/demo/Library/Containers/com.apple.CloudDocs.MobileDocumentsFileProvider/Data/wx-fp.db',
          'hidden'
        ],
        ['/Users/demo/Library/wx-direct.md', 'hidden'],
        ['/Users/demo/LIBRARY/Caches/wx-upper.bin', 'hidden'],
        ['/Users/demo/Documents/wx-notes.md', 'visible']
      ]
      // iCloud Drive's root holds no project marker, so its `build` folder is a user's folder;
      // `proj` is a project, so its `node_modules` is a dependency folder.
      stubFolders({
        [`${cloud}/com~apple~CloudDocs`]: ['Plans', 'Library', 'build', '.secret', 'proj'],
        [`${cloud}/com~apple~CloudDocs/proj`]: ['package.json', 'node_modules']
      })
      stubMdfind(cases.map(([path]) => path))
      stubStat()

      const provider = macSpotlightFileProvider as unknown as SearchableSpotlightProvider
      const visible = new Set(
        (await provider.searchNative('wx', new AbortController().signal)).map(
          (result) => result.path
        )
      )

      const mismatches = cases.filter(
        ([path, expected]) => (visible.has(path) ? 'visible' : 'hidden') !== expected
      )
      expect(mismatches).toEqual([])
    })

    it('fills the visible list from a wider pool when build output leads the answer', async () => {
      stubFolders({ '/Users/demo/Workspace/pool-app': ['package.json', 'out'] })
      const buildOutput = Array.from(
        { length: 60 },
        (_, index) => `/Users/demo/Workspace/pool-app/out/assets/wx-${index}.js`
      )
      const documents = Array.from(
        { length: 10 },
        (_, index) => `/Users/demo/Documents/pool-wx-${index}.md`
      )
      stubMdfind([...buildOutput, ...documents])
      stubStat()

      const provider = macSpotlightFileProvider as unknown as SearchableSpotlightProvider
      const results = await provider.searchNative('wx', new AbortController().signal)

      // Truncating to 50 before filtering would have kept only build output.
      expect(results.map((result) => result.path)).toEqual(documents)
    })

    it('still caps the visible list at 50', async () => {
      const documents = Array.from(
        { length: 80 },
        (_, index) => `/Users/demo/Documents/cap-wx-${index}.md`
      )
      stubMdfind(documents)
      stubStat()

      const provider = macSpotlightFileProvider as unknown as SearchableSpotlightProvider
      const results = await provider.searchNative('wx', new AbortController().signal)

      expect(results.map((result) => result.path)).toEqual(documents.slice(0, 50))
    })

    it('reads a folder once for all its results and reuses the verdict on the next query', async () => {
      stubFolders({ '/Users/demo/Workspace/cache-app': ['package.json', 'dist'] })
      stubMdfind([
        '/Users/demo/Workspace/cache-app/dist/a-wx.js',
        '/Users/demo/Workspace/cache-app/dist/b-wx.js',
        '/Users/demo/Workspace/cache-app/dist/nested/c-wx.js'
      ])
      stubStat()

      const provider = macSpotlightFileProvider as unknown as SearchableSpotlightProvider
      await expect(provider.searchNative('wx', new AbortController().signal)).resolves.toEqual([])
      await expect(provider.searchNative('wx', new AbortController().signal)).resolves.toEqual([])

      const projectReads = readdirMock.mock.calls.filter(
        ([directoryPath]) => directoryPath === '/Users/demo/Workspace/cache-app'
      )
      expect(projectReads).toHaveLength(1)
    })

    it('drops a folder result that is itself build output or a dependency folder', async () => {
      stubFolders({ '/Users/demo/Workspace/self-app': ['package.json', 'dist', 'wx-docs'] })
      stubMdfind([
        '/Users/demo/Workspace/self-app/node_modules',
        '/Users/demo/Workspace/self-app/dist',
        '/Users/demo/Workspace/self-app/wx-docs'
      ])
      stubStat([
        '/Users/demo/Workspace/self-app/node_modules',
        '/Users/demo/Workspace/self-app/dist',
        '/Users/demo/Workspace/self-app/wx-docs'
      ])

      const provider = macSpotlightFileProvider as unknown as SearchableSpotlightProvider
      const results = await provider.searchNative('wx', new AbortController().signal)

      expect(results.map((result) => result.path)).toEqual([
        '/Users/demo/Workspace/self-app/wx-docs'
      ])
    })

    it('applies the same rule to the Linux native backends and asks them for the wider pool', async () => {
      const provider = linuxNativeFileProvider as unknown as SearchableSpotlightProvider & {
        backend: string | null
      }
      provider.backend = 'locate'
      stubFolders({ '/home/demo/app': ['package.json', 'build'] })
      execFileMock.mockImplementation((_command, _args, _options, callback) => {
        callback(null, {
          stdout: [
            '/home/demo/app/node_modules/wx/index.js',
            '/home/demo/app/build/wx.bundle.js',
            '/home/demo/docs/wx-notes.md'
          ].join('\n')
        })
      })
      stubStat()

      try {
        const results = await provider.searchNative('wx', new AbortController().signal)

        expect(results.map((result) => result.path)).toEqual(['/home/demo/docs/wx-notes.md'])
        expect(execFileMock).toHaveBeenCalledWith(
          'locate',
          ['-i', '-l', '150', 'wx'],
          expect.any(Object),
          expect.any(Function)
        )
      } finally {
        provider.backend = null
      }
    })
  })
})
