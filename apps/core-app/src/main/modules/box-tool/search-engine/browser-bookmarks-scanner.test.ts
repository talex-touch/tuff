import type { BrowserBookmarkDefinition, BrowserBookmarkFs } from './browser-bookmarks-scanner'
import { describe, expect, it } from 'vitest'
import {
  discoverBrowserBookmarkFiles,
  getBrowserBookmarkDefinitions,
  mapBrowserBookmarkToIndexedSourceRecord,
  parseChromiumBookmarks,
  scanBrowserBookmarks
} from './browser-bookmarks-scanner'

function dirent(name: string, directory = true) {
  return {
    name,
    isDirectory: () => directory
  }
}

function createFs(
  files: Record<string, string>,
  dirs: Record<string, string[]> = {}
): BrowserBookmarkFs {
  return {
    existsSync: (filePath) => Object.hasOwn(files, filePath) || Object.hasOwn(dirs, filePath),
    readdirSync: (filePath) => (dirs[filePath] ?? []).map((name) => dirent(name)),
    readFileSync: (filePath) => {
      const content = files[filePath]
      if (content === undefined) {
        throw new Error(`ENOENT: ${filePath}`)
      }
      return content
    }
  }
}

const chromeDefinition: BrowserBookmarkDefinition = {
  id: 'chrome',
  name: 'Chrome',
  root: '/home/test/.config/google-chrome'
}

describe('browserBookmarksScanner', () => {
  it('resolves platform browser roots', () => {
    expect(getBrowserBookmarkDefinitions('linux', '/home/test', {}).map((item) => item.id)).toEqual(
      ['chrome', 'edge', 'brave']
    )
    expect(
      getBrowserBookmarkDefinitions('win32', 'C:/Users/test', {
        LOCALAPPDATA: 'C:/Users/test/AppData/Local'
      }).map((item) => item.id)
    ).toContain('arc')
  })

  it('discovers Chromium bookmark files from profile directories', () => {
    const fsImpl = createFs(
      {
        '/home/test/.config/google-chrome/Default/Bookmarks': '{}',
        '/home/test/.config/google-chrome/Profile 1/Bookmarks': '{}'
      },
      {
        '/home/test/.config/google-chrome': ['Default', 'Profile 1', 'Crashpad']
      }
    )

    expect(discoverBrowserBookmarkFiles(chromeDefinition, fsImpl)).toEqual([
      expect.objectContaining({ profile: 'Default' }),
      expect.objectContaining({ profile: 'Profile 1' })
    ])
  })

  it('parses Chromium bookmarks and ignores non-http URLs', () => {
    const bookmarks = parseChromiumBookmarks(
      {
        roots: {
          bookmark_bar: {
            type: 'folder',
            name: 'Bookmarks Bar',
            children: [
              {
                type: 'url',
                name: 'Docs',
                url: 'https://example.com/docs',
                date_added: '1337'
              },
              {
                type: 'url',
                name: 'Local',
                url: 'file:///tmp/local.html'
              }
            ]
          }
        }
      },
      {
        browserId: 'chrome',
        browserName: 'Chrome',
        profile: 'Default',
        path: '/bookmarks'
      }
    )

    expect(bookmarks).toEqual([
      expect.objectContaining({
        title: 'Docs',
        url: 'https://example.com/docs',
        folder: 'Bookmarks Bar',
        sourcePath: '/bookmarks'
      })
    ])
  })

  it('scans readable bookmark files and dedupes by URL', () => {
    const payload = JSON.stringify({
      roots: {
        bookmark_bar: {
          type: 'folder',
          name: 'Bookmarks Bar',
          children: [
            { type: 'url', name: 'Docs', url: 'https://example.com/docs' },
            { type: 'url', name: 'Docs Duplicate', url: 'https://example.com/docs' }
          ]
        }
      }
    })
    const fsImpl = createFs(
      {
        '/home/test/.config/google-chrome/Default/Bookmarks': payload
      },
      {
        '/home/test/.config/google-chrome': ['Default']
      }
    )

    const result = scanBrowserBookmarks({
      platform: 'linux',
      fs: fsImpl,
      definitions: [chromeDefinition]
    })

    expect(result.items).toHaveLength(1)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        browserId: 'chrome',
        status: 'available',
        profileCount: 1
      }),
      expect.objectContaining({ browserId: 'edge', status: 'unsupported' }),
      expect.objectContaining({ browserId: 'brave', status: 'unsupported' }),
      expect.objectContaining({ browserId: 'arc', status: 'unsupported' })
    ])
  })

  it('reports read failures without throwing the whole scan', () => {
    const fsImpl = createFs(
      {
        '/home/test/.config/google-chrome/Default/Bookmarks': '{not-json'
      },
      {
        '/home/test/.config/google-chrome': ['Default']
      }
    )

    const result = scanBrowserBookmarks({
      platform: 'linux',
      fs: fsImpl,
      definitions: [chromeDefinition]
    })

    expect(result.items).toEqual([])
    expect(result.diagnostics[0]).toMatchObject({
      browserId: 'chrome',
      status: 'read-failed',
      failedProfile: 'Default'
    })
  })

  it('maps bookmarks to stable indexed source records', () => {
    const record = mapBrowserBookmarkToIndexedSourceRecord('browser-bookmarks', {
      id: 'chrome:Default:https://example.com/docs',
      browserId: 'chrome',
      browserName: 'Chrome',
      profile: 'Default',
      title: 'Docs',
      url: 'https://example.com/docs',
      folder: 'Bookmarks Bar',
      dateAdded: '1337',
      sourcePath: '/bookmarks'
    })

    expect(record).toMatchObject({
      sourceId: 'browser-bookmarks',
      stableKey: 'https://example.com/docs',
      kind: 'browser-bookmark',
      title: 'Docs',
      uri: 'https://example.com/docs',
      metadata: {
        browserId: 'chrome',
        profile: 'Default',
        sourcePath: '/bookmarks'
      }
    })
    expect(record.recordId).toMatch(/^browser-bookmarks:[a-f0-9]{16}$/)
  })
})
