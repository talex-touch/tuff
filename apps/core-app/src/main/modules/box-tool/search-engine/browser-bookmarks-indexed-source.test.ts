import type { IndexedSourceRecordBatch } from '@talex-touch/utils/search'
import type { BrowserBookmarkFs } from './browser-bookmarks-scanner'
import { readFileSync } from 'node:fs'
import {
  IndexedSourceReconcileReasons,
  IndexedSourceResetReasons,
  IndexedSourceScanReasons,
  isIndexedSourceAdmissionReady
} from '@talex-touch/utils/search'
import { describe, expect, it, vi } from 'vitest'
import {
  BROWSER_BOOKMARKS_DISABLED_REASON,
  BROWSER_BOOKMARKS_INDEXED_SOURCE_ID,
  BROWSER_BOOKMARKS_OFFICIAL_PROVIDER_ID,
  BROWSER_BOOKMARKS_RUNTIME_BRIDGE_REASON,
  buildBrowserBookmarksIndexedSource,
  buildBrowserBookmarksIndexedSourceDescriptor,
  buildBrowserBookmarksOfficialProviderDescriptor
} from './browser-bookmarks-indexed-source'

interface BrowserDataManifestProvider {
  id: string
  kind?: string
  owner?: string
  mode?: string
  priority?: string
  defaultOrder?: number
  permissionScopes?: string[]
  defaultState?: string
  requiresUserConsent?: boolean
  pushesToRootResults?: boolean
  indexedSourceId?: string
}

interface BrowserDataManifestIndexedSource {
  id: string
  template?: string
  admission?: {
    owner?: string
    notes?: string
  }
}

interface BrowserDataManifest {
  permissions?: {
    required?: string[]
  }
  indexedSources?: BrowserDataManifestIndexedSource[]
  searchProviders?: BrowserDataManifestProvider[]
}

function readBrowserDataManifest(): BrowserDataManifest {
  return JSON.parse(
    readFileSync(
      new URL('../../../../../../../plugins/touch-browser-data/manifest.json', import.meta.url),
      'utf8'
    )
  ) as BrowserDataManifest
}

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
      id: BROWSER_BOOKMARKS_INDEXED_SOURCE_ID,
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

  it('describes the official touch-browser-data provider lifecycle link', () => {
    expect(buildBrowserBookmarksOfficialProviderDescriptor()).toMatchObject({
      id: BROWSER_BOOKMARKS_OFFICIAL_PROVIDER_ID,
      kind: 'browser-bookmark',
      owner: 'official-plugin',
      mode: 'push',
      priority: 'fast',
      policy: {
        owner: 'official-plugin',
        mode: 'push',
        permissionScopes: ['root-results', 'browser-data'],
        defaultState: 'ask',
        requiresUserConsent: true,
        pushesToRootResults: true,
        indexedSourceId: BROWSER_BOOKMARKS_INDEXED_SOURCE_ID
      }
    })
  })

  it('keeps the touch-browser-data manifest aligned with the official provider contract', () => {
    const manifest = readBrowserDataManifest()
    const descriptor = buildBrowserBookmarksOfficialProviderDescriptor()
    const manifestProvider = manifest.searchProviders?.find(
      (provider) => provider.id === descriptor.id
    )
    const manifestSource = manifest.indexedSources?.find(
      (source) => source.id === BROWSER_BOOKMARKS_INDEXED_SOURCE_ID
    )

    expect(manifest.permissions?.required).toEqual(
      expect.arrayContaining(['fs.read', 'fs.index', 'search.root-results'])
    )
    expect(manifestProvider).toMatchObject({
      id: descriptor.id,
      kind: descriptor.kind,
      owner: descriptor.owner,
      mode: descriptor.mode,
      priority: descriptor.priority,
      defaultOrder: descriptor.defaultOrder,
      permissionScopes: descriptor.policy.permissionScopes,
      defaultState: descriptor.policy.defaultState,
      requiresUserConsent: descriptor.policy.requiresUserConsent,
      pushesToRootResults: descriptor.policy.pushesToRootResults,
      indexedSourceId: descriptor.policy.indexedSourceId
    })
    expect(manifestSource).toMatchObject({
      id: BROWSER_BOOKMARKS_INDEXED_SOURCE_ID,
      template: 'browser-bookmarks',
      admission: {
        owner: 'official-plugin'
      }
    })
    expect(manifestSource?.admission?.notes).toContain('does not read browser files by itself')
  })

  it('reports consent-gated diagnostics without changing plugin search behavior', async () => {
    const source = buildBrowserBookmarksIndexedSource()

    await expect(source.getHealth()).resolves.toMatchObject({
      status: 'disabled',
      permissionState: 'promptable',
      watchState: 'pending-permission',
      reason: BROWSER_BOOKMARKS_DISABLED_REASON
    })
    await expect(source.getRoots()).resolves.toEqual([])
    await expect(source.getEvidence?.()).resolves.toEqual([
      expect.objectContaining({
        id: 'browser-bookmarks:touch-browser-data',
        status: 'disabled',
        reason: BROWSER_BOOKMARKS_DISABLED_REASON,
        metadata: expect.objectContaining({
          providerId: BROWSER_BOOKMARKS_OFFICIAL_PROVIDER_ID,
          runtimeBridge: false,
          persistentPluginIndexing: false,
          enablementReason: 'not-configured',
          linkedProviderIds: [
            BROWSER_BOOKMARKS_INDEXED_SOURCE_ID,
            BROWSER_BOOKMARKS_OFFICIAL_PROVIDER_ID
          ],
          configuredProviderIds: []
        })
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
      reason: BROWSER_BOOKMARKS_DISABLED_REASON
    })
  })

  it('does not read browser bookmark files while disabled', async () => {
    const readFileSync = vi.fn(() => {
      throw new Error('should-not-read-bookmarks')
    })
    const source = buildBrowserBookmarksIndexedSource({
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

    const batches: IndexedSourceRecordBatch[] = []
    for await (const batch of source.scan({
      sourceId: source.descriptor.id,
      reason: IndexedSourceScanReasons.Scheduled
    })) {
      batches.push(batch)
    }

    await expect(source.handleWatchEvent?.({
      sourceId: source.descriptor.id,
      action: 'change',
      path: '/browser/Default/Bookmarks',
      occurredAt: 1700000000000
    })).resolves.toEqual([])

    expect(batches).toEqual([])
    expect(readFileSync).not.toHaveBeenCalled()
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
          itemCount: 1,
          metadata: expect.objectContaining({
            scannerOwner: 'touch-browser-data',
            providerId: BROWSER_BOOKMARKS_OFFICIAL_PROVIDER_ID,
            runtimeBridge: true
          })
        }),
        expect.objectContaining({
          id: 'browser-bookmarks:touch-browser-data',
          status: 'warming',
          reason: BROWSER_BOOKMARKS_RUNTIME_BRIDGE_REASON,
          metadata: expect.objectContaining({
            providerId: BROWSER_BOOKMARKS_OFFICIAL_PROVIDER_ID,
            runtimeBridge: true,
            persistentPluginIndexing: false,
            enablementReason: 'explicitly-enabled',
            enabledProviderIds: [BROWSER_BOOKMARKS_OFFICIAL_PROVIDER_ID]
          })
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

  it('reports explicit provider disablement in lifecycle evidence', async () => {
    const source = buildBrowserBookmarksIndexedSource({
      getEnablement: () => ({
        sourceId: 'browser-bookmarks',
        providerIds: [BROWSER_BOOKMARKS_INDEXED_SOURCE_ID, BROWSER_BOOKMARKS_OFFICIAL_PROVIDER_ID],
        configuredProviderIds: [BROWSER_BOOKMARKS_OFFICIAL_PROVIDER_ID],
        enabledProviderIds: [],
        disabledProviderIds: [BROWSER_BOOKMARKS_OFFICIAL_PROVIDER_ID],
        enabled: false,
        reason: 'explicitly-disabled'
      })
    })

    await expect(source.getEvidence?.()).resolves.toEqual([
      expect.objectContaining({
        status: 'disabled',
        reason: BROWSER_BOOKMARKS_DISABLED_REASON,
        metadata: expect.objectContaining({
          enablementReason: 'explicitly-disabled',
          configuredProviderIds: [BROWSER_BOOKMARKS_OFFICIAL_PROVIDER_ID],
          disabledProviderIds: [BROWSER_BOOKMARKS_OFFICIAL_PROVIDER_ID]
        })
      })
    ])
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
      reason: BROWSER_BOOKMARKS_DISABLED_REASON
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

    expect(
      source.shouldHandleWatchEvent?.({
        sourceId: source.descriptor.id,
        action: 'change',
        path: '/browser/Default/Bookmarks',
        occurredAt: 1700000000000
      })
    ).toBe(true)
    expect(
      source.shouldHandleWatchEvent?.({
        sourceId: source.descriptor.id,
        action: 'change',
        path: 'C:\\Users\\demo\\Default\\Bookmarks',
        occurredAt: 1700000000000
      })
    ).toBe(true)

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

  it('filters non-Bookmarks profile watch events after root routing', () => {
    const source = buildEnabledSource()

    expect(
      source.shouldHandleWatchEvent?.({
        sourceId: source.descriptor.id,
        action: 'change',
        path: '/browser/Default/Preferences',
        occurredAt: 1700000000000
      })
    ).toBe(false)
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
