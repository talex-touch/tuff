import type { IndexedSourceRecordBatch } from '@talex-touch/utils/search'
import type { BrowserBookmarkFs } from './browser-bookmarks-scanner'
import {
  IndexedSourceReconcileReasons,
  IndexedSourceResetReasons,
  IndexedSourceScanReasons,
  isIndexedSourceAdmissionReady
} from '@talex-touch/utils/search'
import { describe, expect, it, vi } from 'vitest'
import {
  buildBrowserBookmarksIndexedSource,
  buildBrowserBookmarksIndexedSourceDescriptor
} from './browser-bookmarks-indexed-source'

function createFs(
  files: Record<string, string>,
  dirs: Record<string, string[]> = {}
): BrowserBookmarkFs {
  return {
    existsSync: (filePath) => Object.hasOwn(files, filePath) || Object.hasOwn(dirs, filePath),
    readdirSync: (filePath) =>
      (dirs[filePath] ?? []).map((name) => ({
        name,
        isDirectory: () => true
      })),
    readFileSync: (filePath) => {
      const content = files[filePath]
      if (content === undefined) {
        throw new Error(`ENOENT: ${filePath}`)
      }
      return content
    }
  }
}

describe('browserBookmarksIndexedSource', () => {
  function buildEnabledSource() {
    return buildBrowserBookmarksIndexedSource({
      enabled: true,
      scannerOptions: {
        platform: 'linux',
        fs: createFs(
          {
            '/browser/Default/Bookmarks': JSON.stringify({
              roots: {
                bookmark_bar: {
                  type: 'folder',
                  name: 'Bookmarks Bar',
                  children: [
                    {
                      type: 'url',
                      name: 'Docs',
                      url: 'https://example.com/docs'
                    }
                  ]
                }
              }
            })
          },
          {
            '/browser': ['Default']
          }
        ),
        definitions: [
          {
            id: 'chrome',
            name: 'Chrome',
            root: '/browser'
          }
        ]
      }
    })
  }

  it('describes Browser Bookmarks as a high-privacy official indexed source', () => {
    const descriptor = buildBrowserBookmarksIndexedSourceDescriptor()

    expect(descriptor).toMatchObject({
      id: 'browser-bookmarks',
      kind: 'browser-bookmark',
      storage: 'sqlite-index',
      privacy: 'high',
      admission: {
        owner: 'official-plugin',
        permissionScopes: ['browser-data', 'file-system'],
        defaultState: 'disabled',
        requiresUserConsent: true,
        clearable: true,
        rebuildable: true
      }
    })
    expect(isIndexedSourceAdmissionReady(descriptor)).toBe(true)
  })

  it('reports pending migration diagnostics without changing plugin search behavior', async () => {
    const source = buildBrowserBookmarksIndexedSource()

    await expect(source.getHealth()).resolves.toMatchObject({
      status: 'disabled',
      permissionState: 'promptable',
      watchState: 'pending-permission',
      reason: 'browser-bookmarks-runtime-source-pending-migration'
    })
    await expect(source.getRoots()).resolves.toEqual([])
    await expect(source.getEvidence?.()).resolves.toEqual([
      expect.objectContaining({
        id: 'browser-bookmarks:touch-browser-data',
        status: 'disabled',
        reason: 'chromium-bookmarks-json-plugin-scanner-not-yet-runtime-indexed'
      })
    ])
  })

  it('keeps scan empty and reconcile observable until runtime indexing lands', async () => {
    const source = buildBrowserBookmarksIndexedSource()
    const batches: IndexedSourceRecordBatch[] = []

    for await (const batch of source.scan({
      sourceId: source.descriptor.id,
      reason: IndexedSourceScanReasons.Scheduled
    })) {
      batches.push(batch)
    }

    expect(batches).toEqual([])
    await expect(source.reconcile?.({ sourceId: source.descriptor.id })).resolves.toMatchObject({
      sourceId: 'browser-bookmarks',
      skipped: 1,
      errors: 0,
      reason: 'browser-bookmarks-runtime-source-pending-migration'
    })
  })

  it('can scan Chromium bookmarks when explicitly enabled by runtime settings', async () => {
    const source = buildEnabledSource()
    const batches: IndexedSourceRecordBatch[] = []

    for await (const batch of source.scan({
      sourceId: source.descriptor.id,
      reason: IndexedSourceScanReasons.ManualRebuild
    })) {
      batches.push(batch)
    }

    expect(batches).toEqual([
      expect.objectContaining({
        sourceId: 'browser-bookmarks',
        done: true,
        records: [
          expect.objectContaining({
            stableKey: 'https://example.com/docs',
            kind: 'browser-bookmark',
            title: 'Docs',
            uri: 'https://example.com/docs'
          })
        ]
      })
    ])
    await expect(source.getEvidence?.()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'browser-bookmarks:chrome',
          status: 'ready',
          itemCount: 1
        })
      ])
    )
    await expect(source.getRoots()).resolves.toEqual([
      expect.objectContaining({
        sourceId: 'browser-bookmarks',
        path: '/browser',
        permissionState: 'granted',
        watchDepth: 2
      })
    ])
    await expect(source.getHealth()).resolves.toMatchObject({
      status: 'ready',
      itemCount: 1,
      watchState: 'active',
      reconcileState: 'idle'
    })
  })

  it('reuses one scanner snapshot across diagnostics reads', async () => {
    const readFileSync = vi.fn(() =>
      JSON.stringify({
        roots: {
          bookmark_bar: {
            type: 'folder',
            name: 'Bookmarks Bar',
            children: [
              {
                type: 'url',
                name: 'Docs',
                url: 'https://example.com/docs'
              }
            ]
          }
        }
      })
    )
    const source = buildBrowserBookmarksIndexedSource({
      enabled: true,
      scannerOptions: {
        platform: 'linux',
        fs: {
          existsSync: (filePath) =>
            filePath === '/browser' || filePath === '/browser/Default/Bookmarks',
          readdirSync: () => [{ name: 'Default', isDirectory: () => true }],
          readFileSync
        },
        definitions: [{ id: 'chrome', name: 'Chrome', root: '/browser' }]
      }
    })

    await source.getHealth()
    await source.getRoots()
    await source.getEvidence?.()

    expect(readFileSync).toHaveBeenCalledTimes(1)
  })

  it('re-evaluates runtime enablement before diagnostics and scans', async () => {
    let enabled = false
    const source = buildBrowserBookmarksIndexedSource({
      isEnabled: () => enabled,
      scannerOptions: {
        platform: 'linux',
        fs: createFs(
          {
            '/browser/Default/Bookmarks': JSON.stringify({
              roots: {
                bookmark_bar: {
                  type: 'folder',
                  name: 'Bookmarks Bar',
                  children: [
                    {
                      type: 'url',
                      name: 'Docs',
                      url: 'https://example.com/docs'
                    }
                  ]
                }
              }
            })
          },
          { '/browser': ['Default'] }
        ),
        definitions: [{ id: 'chrome', name: 'Chrome', root: '/browser' }]
      }
    })

    await expect(source.getHealth()).resolves.toMatchObject({
      status: 'disabled',
      reason: 'browser-bookmarks-runtime-source-pending-migration'
    })

    enabled = true

    await expect(source.getHealth()).resolves.toMatchObject({
      status: 'ready',
      itemCount: 1
    })

    const batches: IndexedSourceRecordBatch[] = []
    for await (const batch of source.scan({
      sourceId: source.descriptor.id,
      reason: IndexedSourceScanReasons.ManualRebuild
    })) {
      batches.push(batch)
    }

    expect(batches).toHaveLength(1)
    expect(batches[0].records[0]).toMatchObject({
      stableKey: 'https://example.com/docs',
      title: 'Docs'
    })
  })

  it('reconciles enabled bookmarks through runtime deltas', async () => {
    const source = buildEnabledSource()

    await expect(
      source.reconcile?.({
        sourceId: source.descriptor.id,
        reason: IndexedSourceReconcileReasons.ExternalRefresh
      })
    ).resolves.toMatchObject({
      sourceId: 'browser-bookmarks',
      changed: 1,
      skipped: 0,
      errors: 0,
      reason: IndexedSourceReconcileReasons.ExternalRefresh,
      deltas: [
        expect.objectContaining({
          sourceId: 'browser-bookmarks',
          action: 'change',
          path: 'https://example.com/docs',
          reason: IndexedSourceReconcileReasons.ExternalRefresh,
          record: expect.objectContaining({
            stableKey: 'https://example.com/docs',
            title: 'Docs'
          })
        })
      ]
    })
  })

  it('turns bookmark file watch events into refresh deltas when enabled', async () => {
    const source = buildEnabledSource()

    await expect(
      source.handleWatchEvent?.({
        sourceId: source.descriptor.id,
        action: 'change',
        path: '/browser/Default/Bookmarks',
        occurredAt: 1700000000000
      })
    ).resolves.toEqual([
      expect.objectContaining({
        sourceId: 'browser-bookmarks',
        action: 'change',
        path: 'https://example.com/docs',
        reason: 'browser-bookmarks-watch-refresh',
        record: expect.objectContaining({
          stableKey: 'https://example.com/docs',
          title: 'Docs'
        })
      })
    ])
  })

  it('reports runtime reset state and rejects direct clear without runtime boundary', async () => {
    const source = buildEnabledSource()

    await expect(
      source.resetIndex?.({
        sourceId: source.descriptor.id,
        reason: IndexedSourceResetReasons.UserClear,
        clearSearchIndex: true,
        clearScanProgress: true
      })
    ).resolves.toMatchObject({
      sourceId: 'browser-bookmarks',
      reason: IndexedSourceResetReasons.UserClear,
      clearedSearchIndex: false,
      clearedScanProgress: false,
      scanProgressRows: 0
    })

    await expect(source.clearIndex?.()).rejects.toThrow(
      'browser-bookmarks-clear-requires-runtime-reset'
    )
  })
})
