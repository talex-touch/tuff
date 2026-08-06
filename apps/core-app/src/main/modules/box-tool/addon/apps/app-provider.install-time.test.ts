import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  asPrivateProvider,
  getAppInfoByPathMock,
  getWatchPathsMock,
  loadSubject,
  resetAppRuntimeDelegateMocks,
  resolveAppInfoByPathMock
} from './app-provider-test-harness'

const APP_PATH = '/Applications/Fresh.app'
const DAY_MS = 24 * 60 * 60 * 1000
const INSTALLED_AT_KEY = 'installedAt'

type ExtensionRow = { fileId: number; key: string; value: string }
type FileRow = Record<string, unknown> & { id: number; path: string }

function buildAppInfo(overrides: { createdAt?: Date; path?: string } = {}) {
  const appPath = overrides.path ?? APP_PATH
  return {
    name: 'Fresh',
    displayName: 'Fresh',
    path: appPath,
    icon: '',
    bundleId: 'com.example.fresh',
    uniqueId: `bundle:${appPath}`,
    stableId: `bundle:${appPath}`,
    launchKind: 'bundle' as const,
    launchTarget: appPath,
    lastModified: new Date('2026-08-06T00:00:00.000Z'),
    ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {})
  }
}

/**
 * File-extension store that honours the two conflict clauses the provider uses, so a test can tell
 * an overwriting upsert from an insert that yields to what is already stored.
 */
async function createExtensionStore(
  options: {
    files?: FileRow[]
    extensions?: ExtensionRow[]
    withTransaction?: boolean
  } = {}
) {
  const { fileExtensions, files } = await import('../../../../db/schema')
  const rows = new Map<string, ExtensionRow>()
  const fileRows: FileRow[] = [...(options.files ?? [])]
  let nextFileId = fileRows.reduce((max, row) => Math.max(max, row.id), 0) + 1

  const rowKey = (row: ExtensionRow): string => `${row.fileId}:${row.key}`
  for (const row of options.extensions ?? []) rows.set(rowKey(row), { ...row })

  const upsertRows = (incoming: ExtensionRow[]): void => {
    for (const row of incoming) rows.set(rowKey(row), { ...row })
  }
  const insertMissingRows = (incoming: ExtensionRow[]): void => {
    for (const row of incoming) {
      if (!rows.has(rowKey(row))) rows.set(rowKey(row), { ...row })
    }
  }

  const insert = vi.fn((table: unknown) => {
    if (table === fileExtensions) {
      return {
        values: (incoming: ExtensionRow[]) => ({
          onConflictDoUpdate: async () => upsertRows(incoming),
          onConflictDoNothing: async () => insertMissingRows(incoming)
        })
      }
    }

    expect(table).toBe(files)
    return {
      values: (values: Record<string, unknown>) => {
        const write = async (): Promise<FileRow[]> => {
          const existing = fileRows.find((row) => row.path === values.path)
          if (existing) {
            Object.assign(existing, values, { id: existing.id })
            return [existing]
          }
          const row = { ...values, id: nextFileId++ } as FileRow
          fileRows.push(row)
          return [row]
        }
        return { returning: write, onConflictDoUpdate: () => ({ returning: write }) }
      }
    }
  })

  const db: Record<string, unknown> = {
    insert,
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
    delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(async () => []) })) }))
  }
  if (options.withTransaction === true) {
    db.transaction = vi.fn(
      async (run: (tx: unknown, extensionWriter: unknown) => Promise<unknown>) => await run(db, db)
    )
  }

  const existingFile = fileRows[0] ?? null
  return {
    installedAt: (fileId: number): string | undefined =>
      rows.get(`${fileId}:${INSTALLED_AT_KEY}`)?.value,
    dbUtils: {
      getFileByPath: vi.fn(
        async (path: string) => fileRows.find((row) => row.path === path) ?? null
      ),
      getFileExtensions: vi.fn(async (fileId: number) =>
        [...rows.values()].filter((row) => row.fileId === fileId)
      ),
      getFilesByType: vi.fn(async () => []),
      getDb: () => db,
      addFileExtensions: vi.fn(async (incoming: ExtensionRow[]) => upsertRows(incoming))
    },
    existingFile
  }
}

async function loadProvider() {
  const { appProvider } = await loadSubject()
  const provider = asPrivateProvider(appProvider)
  provider.searchIndex = {}
  provider._waitForItemStable = vi.fn(async () => true)
  provider.scheduleAppIconHydration = vi.fn()
  return provider
}

describe('app install time (installedAt extension)', () => {
  // The provider's module graph is expensive to transform, and every test re-imports it after
  // `vi.resetModules()`; paying that once here keeps the first test from absorbing the cost.
  beforeAll(async () => {
    await loadSubject()
  }, 60_000)

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resetAppRuntimeDelegateMocks()
    getWatchPathsMock.mockReturnValue([])
    getAppInfoByPathMock.mockResolvedValue(buildAppInfo())
    resolveAppInfoByPathMock.mockImplementation(async () => ({ ok: true, appInfo: buildAppInfo() }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('insert', () => {
    it('stores the scanned birth time for a newly indexed app', async () => {
      const createdAt = new Date(Date.now() - 2 * DAY_MS)
      resolveAppInfoByPathMock.mockImplementation(async () => ({
        ok: true,
        appInfo: buildAppInfo({ createdAt })
      }))
      const provider = await loadProvider()
      const store = await createExtensionStore()
      provider.dbUtils = store.dbUtils

      const result = await provider.processAppPath(APP_PATH, { discovery: 'watch' })

      expect(result.success).toBe(true)
      expect(store.installedAt(1)).toBe(String(createdAt.getTime()))
    })

    it('falls back to the event time when a watch event finds no birth time', async () => {
      const provider = await loadProvider()
      const store = await createExtensionStore()
      provider.dbUtils = store.dbUtils
      const before = Date.now()

      await provider.processAppPath(APP_PATH, { discovery: 'watch' })

      const stored = Number(store.installedAt(1))
      expect(stored).toBeGreaterThanOrEqual(before)
      expect(stored).toBeLessThanOrEqual(Date.now())
    })

    it('records nothing when a scan finds no birth time', async () => {
      const provider = await loadProvider()
      const store = await createExtensionStore()
      provider.dbUtils = store.dbUtils

      await provider.processAppPath(APP_PATH)

      expect(store.installedAt(1)).toBeUndefined()
    })

    it('routes watch events through the watch discovery kind', async () => {
      const provider = await loadProvider()
      const store = await createExtensionStore()
      provider.dbUtils = store.dbUtils
      provider.mapScannedAppToIndexedSourceRecord = vi.fn(async () => ({
        sourceId: 'app-provider',
        recordId: APP_PATH,
        stableKey: APP_PATH,
        kind: 'app',
        title: 'Fresh'
      }))
      const before = Date.now()

      const deltas = await provider.handleIndexedSourceWatchEvent({
        action: 'add',
        path: APP_PATH,
        occurredAt: before
      })

      expect(deltas).toHaveLength(1)
      // No birth time reached the provider, so only a watch-discovered insert can explain a value
      // here at all.
      expect(Number(store.installedAt(1))).toBeGreaterThanOrEqual(before)
    })
  })

  describe('update', () => {
    it('keeps the original install time when an app rebuilds its bundle in place', async () => {
      const originalInstalledAt = new Date('2025-01-01T00:00:00.000Z').getTime()
      resolveAppInfoByPathMock.mockImplementation(async () => ({
        ok: true,
        appInfo: buildAppInfo({ createdAt: new Date() })
      }))
      const provider = await loadProvider()
      const store = await createExtensionStore({
        files: [{ id: 5, path: APP_PATH, name: 'Fresh' }],
        extensions: [
          { fileId: 5, key: INSTALLED_AT_KEY, value: String(originalInstalledAt) },
          { fileId: 5, key: 'bundleId', value: 'com.example.fresh' }
        ]
      })
      provider.dbUtils = store.dbUtils

      await provider.processAppPath(APP_PATH, { discovery: 'watch' })

      expect(store.installedAt(5)).toBe(String(originalInstalledAt))
    })

    it('backfills a missing install time from the birth time', async () => {
      const createdAt = new Date('2026-07-01T00:00:00.000Z')
      resolveAppInfoByPathMock.mockImplementation(async () => ({
        ok: true,
        appInfo: buildAppInfo({ createdAt })
      }))
      const provider = await loadProvider()
      const store = await createExtensionStore({
        files: [{ id: 5, path: APP_PATH, name: 'Fresh' }],
        extensions: [{ fileId: 5, key: 'bundleId', value: 'com.example.fresh' }]
      })
      provider.dbUtils = store.dbUtils

      await provider.processAppPath(APP_PATH)

      expect(store.installedAt(5)).toBe(String(createdAt.getTime()))
    })

    it('does not date a long-indexed app to a watch change event', async () => {
      const provider = await loadProvider()
      const store = await createExtensionStore({
        files: [{ id: 5, path: APP_PATH, name: 'Fresh' }],
        extensions: [{ fileId: 5, key: 'bundleId', value: 'com.example.fresh' }]
      })
      provider.dbUtils = store.dbUtils

      await provider.processAppPath(APP_PATH, { discovery: 'watch' })

      expect(store.installedAt(5)).toBeUndefined()
    })
  })

  describe('batch additions', () => {
    it('never overwrites an install time, even though the batch reports no existing extensions', async () => {
      const originalInstalledAt = new Date('2025-01-01T00:00:00.000Z').getTime()
      const provider = await loadProvider()
      const store = await createExtensionStore({
        files: [{ id: 5, path: APP_PATH, name: 'Fresh' }],
        extensions: [{ fileId: 5, key: INSTALLED_AT_KEY, value: String(originalInstalledAt) }],
        withTransaction: true
      })
      provider.dbUtils = store.dbUtils

      await provider.persistScannedAppAdditions('app-provider.test-add', [
        { ...buildAppInfo({ createdAt: new Date() }), displayName: 'Fresh' }
      ])

      expect(store.installedAt(5)).toBe(String(originalInstalledAt))
    })

    it('records the birth time for a row the batch actually creates', async () => {
      const createdAt = new Date('2026-08-04T00:00:00.000Z')
      const provider = await loadProvider()
      const store = await createExtensionStore({ withTransaction: true })
      provider.dbUtils = store.dbUtils

      await provider.persistScannedAppAdditions('app-provider.test-add', [
        { ...buildAppInfo({ createdAt }), displayName: 'Fresh' }
      ])

      expect(store.installedAt(1)).toBe(String(createdAt.getTime()))
    })
  })

  it('keeps installedAt out of the stale scanned-extension sweep', async () => {
    const [
      { APP_SCANNED_OPTIONAL_EXTENSION_KEYS, buildAppExtensions },
      { resolveMissingScannedExtensionKeys }
    ] = await Promise.all([import('./app-index-metadata'), import('./app-provider-metadata-sync')])

    // The sweep only ever deletes keys drawn from this list, so an install time can never be
    // mistaken for metadata a later scan failed to re-derive.
    expect([...APP_SCANNED_OPTIONAL_EXTENSION_KEYS]).not.toContain(INSTALLED_AT_KEY)
    expect(
      resolveMissingScannedExtensionKeys(
        buildAppExtensions(5, {
          bundleId: 'com.example.fresh',
          icon: '',
          stableId: APP_PATH,
          uniqueId: APP_PATH,
          launchKind: 'path',
          launchTarget: APP_PATH
        }),
        APP_SCANNED_OPTIONAL_EXTENSION_KEYS
      )
    ).not.toContain(INSTALLED_AT_KEY)
  })
})
