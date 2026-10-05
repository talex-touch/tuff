import type { Client } from '@libsql/client'
import type { Shortcut } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import type { StorageCache } from './storage-cache'
import type { StorageLRUManager } from './storage-lru-manager'
import { mkdtempSync, readFileSync as readNodeFileSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { StorageList } from '@talex-touch/utils'
import { createClient } from '@libsql/client'
import { ShortcutType } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import { StorageEvents } from '@talex-touch/utils/transport/events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StorageModule } from './index'
import { databaseModule } from '../database'
import { buildFeatureShortcutId } from '../plugin/services/feature-shortcut-id'
import { ApplicationConfigRepository } from './app-config-repository'

const readFileSyncSpy = vi.hoisted(() => vi.fn())
const transportMocks = vi.hoisted(() => ({
  on: vi.fn(() => vi.fn()),
  onStream: vi.fn(() => vi.fn())
}))

vi.mock('fs-extra', async () => {
  const actual = await vi.importActual<typeof import('fs-extra')>('fs-extra')
  const actualModule = actual as typeof actual & { default?: typeof actual }
  const actualDefault = actualModule.default ?? actual
  return {
    ...actual,
    default: {
      ...actualDefault,
      readFileSync: readFileSyncSpy
    },
    readFileSync: readFileSyncSpy
  }
})

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: () => transportMocks
}))

describe('StorageModule', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    readFileSyncSpy.mockReset()
    transportMocks.on.mockClear()
    transportMocks.onStream.mockClear()
  })

  it('warms account storage during init so later reads use cache', async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), 'tuff-storage-'))
    const accountPath = path.join(configDir, StorageList.ACCOUNT)
    const accountContent = JSON.stringify({
      user: { id: 1, username: 'demo', email: 'demo@example.test' }
    })

    writeFileSync(accountPath, accountContent, 'utf-8')
    readFileSyncSpy.mockImplementation((filePath: string, encoding: BufferEncoding) =>
      readNodeFileSync(filePath, encoding)
    )

    const storage = new StorageModule()

    await storage.init({
      app: { channel: {} },
      file: { create: true, dirName: 'config', dirPath: configDir }
    } as unknown as Parameters<StorageModule['init']>[0])

    expect(readFileSyncSpy).toHaveBeenCalledTimes(1)
    expect(readFileSyncSpy).toHaveBeenCalledWith(accountPath, 'utf-8')

    const result = storage.getConfig(StorageList.ACCOUNT)

    expect(result).toEqual({
      user: { id: 1, username: 'demo', email: 'demo@example.test' }
    })
    expect(readFileSyncSpy).toHaveBeenCalledTimes(1)

    await storage.onDestroy()
  })

  it('keeps the auth recovery marker main-owned across renderer storage handlers', async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), 'tuff-storage-auth-marker-'))
    const storage = new StorageModule()
    await storage.init({
      app: { channel: {} },
      file: { create: true, dirName: 'config', dirPath: configDir }
    } as unknown as Parameters<StorageModule['init']>[0])

    storage.saveConfig(
      StorageList.APP_SETTING,
      {
        auth: {
          deviceId: 'main-device',
          requiresReauthenticationOnNextStartup: true
        }
      },
      false,
      true
    )

    const registrations = transportMocks.on.mock.calls as unknown as Array<
      readonly [unknown, unknown]
    >
    const getHandler = registrations.find(([event]) => event === StorageEvents.app.get)?.[1] as
      | ((request: { key: string }) => object)
      | undefined
    const getVersionedHandler = registrations.find(
      ([event]) => event === StorageEvents.app.getVersioned
    )?.[1] as ((request: { key: string }) => { data: object; version: number } | null) | undefined
    const setHandler = registrations.find(([event]) => event === StorageEvents.app.set)?.[1] as
      | ((request: { key: string; value: object }) => void)
      | undefined
    const saveHandler = registrations.find(([event]) => event === StorageEvents.app.save)?.[1] as
      | ((request: {
          key: string
          value: object
        }) => Promise<{ success: boolean; version: number }>)
      | undefined
    const deleteHandler = registrations.find(
      ([event]) => event === StorageEvents.app.delete
    )?.[1] as ((request: { key: string }) => void) | undefined

    const rendererProjection = getHandler?.({ key: StorageList.APP_SETTING })
    const rendererVersionedProjection = getVersionedHandler?.({ key: StorageList.APP_SETTING })
    expect(rendererProjection).toMatchObject({
      auth: { deviceId: 'main-device' }
    })
    expect(rendererVersionedProjection?.data).toMatchObject({
      auth: { deviceId: 'main-device' }
    })
    expect(rendererProjection).not.toHaveProperty('auth.requiresReauthenticationOnNextStartup')
    expect(rendererVersionedProjection?.data).not.toHaveProperty(
      'auth.requiresReauthenticationOnNextStartup'
    )

    setHandler?.({
      key: StorageList.APP_SETTING,
      value: {
        auth: {
          deviceId: 'renderer-set',
          requiresReauthenticationOnNextStartup: false,
          useSecureStorage: false
        }
      }
    })
    await saveHandler?.({
      key: StorageList.APP_SETTING,
      value: {
        auth: {
          deviceId: 'renderer-save',
          requiresReauthenticationOnNextStartup: false,
          secureStorageUserOverridden: true
        }
      }
    })
    deleteHandler?.({ key: StorageList.APP_SETTING })

    expect(storage.getConfig(StorageList.APP_SETTING)).toMatchObject({
      auth: {
        deviceId: 'renderer-save',
        requiresReauthenticationOnNextStartup: true
      }
    })
    expect(storage.getConfig(StorageList.APP_SETTING)).not.toHaveProperty('auth.useSecureStorage')
    expect(storage.getConfig(StorageList.APP_SETTING)).not.toHaveProperty(
      'auth.secureStorageUserOverridden'
    )

    await storage.onDestroy()
  })

  it('persists an accepted lifecycle-critical save before replying', async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), 'tuff-storage-persist-'))
    const storage = new StorageModule()

    await storage.init({
      app: { channel: {} },
      file: { create: true, dirName: 'config', dirPath: configDir }
    } as unknown as Parameters<StorageModule['init']>[0])

    const persist = vi.spyOn(storage, 'persistConfigNow').mockResolvedValue(undefined)
    const registration = (
      transportMocks.on.mock.calls as unknown as Array<readonly [unknown, unknown]>
    ).find(([event]) => event === StorageEvents.app.save)
    const handler = registration?.[1] as
      | ((request: {
          key: string
          value: object
          persist?: boolean
        }) => Promise<{ success: boolean; version: number }>)
      | undefined

    await expect(
      handler?.({
        key: StorageList.APP_SETTING,
        value: { beginner: { init: true } },
        persist: true
      })
    ).resolves.toMatchObject({ success: true })
    expect(persist).toHaveBeenCalledWith(StorageList.APP_SETTING)

    await storage.onDestroy()
  })

  it('restores the previous gate value when durable persistence fails', async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), 'tuff-storage-rollback-'))
    const storage = new StorageModule()

    await storage.init({
      app: { channel: {} },
      file: { create: true, dirName: 'config', dirPath: configDir }
    } as unknown as Parameters<StorageModule['init']>[0])

    vi.spyOn(storage, 'persistConfigNow').mockRejectedValue(new Error('disk unavailable'))
    const registration = (
      transportMocks.on.mock.calls as unknown as Array<readonly [unknown, unknown]>
    ).find(([event]) => event === StorageEvents.app.save)
    const handler = registration?.[1] as
      | ((request: {
          key: string
          value: object
          persist?: boolean
        }) => Promise<{ success: boolean; version: number }>)
      | undefined

    await handler?.({
      key: StorageList.APP_SETTING,
      value: { beginner: { init: false } }
    })

    await expect(
      handler?.({
        key: StorageList.APP_SETTING,
        value: { beginner: { init: true } },
        persist: true
      })
    ).resolves.toMatchObject({ success: false, reason: 'persist-failed' })

    const restored = storage.getConfig(StorageList.APP_SETTING) as {
      beginner?: { init?: boolean }
    }
    expect(restored.beginner?.init).toBe(false)

    await storage.onDestroy()
  })

  it('rejects direct and nested provider credentials from ordinary Intelligence storage', async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), 'tuff-storage-provider-secret-'))
    const storage = new StorageModule()
    await storage.init({
      app: { channel: {} },
      file: { create: true, dirName: 'config', dirPath: configDir }
    } as unknown as Parameters<StorageModule['init']>[0])

    const registration = (
      transportMocks.on.mock.calls as unknown as Array<readonly [unknown, unknown]>
    ).find(([event]) => event === StorageEvents.app.save)
    const handler = registration?.[1] as
      | ((request: {
          key: string
          value: object
          persist?: boolean
        }) => Promise<{ success: boolean; error?: string }>)
      | undefined
    const baseProvider = {
      id: 'openai-default',
      type: 'openai',
      name: 'OpenAI',
      enabled: true
    }

    for (const provider of [
      { ...baseProvider, apiKey: 'synthetic-provider-secret' },
      { ...baseProvider, metadata: { token: 'synthetic-provider-secret' } }
    ]) {
      await expect(
        handler?.({
          key: StorageList.IntelligenceConfig,
          value: { providers: [provider] },
          persist: true
        })
      ).resolves.toMatchObject({ success: false, version: 0 })
    }

    await storage.onDestroy()
  })

  it('labels a save whose key is missing or not a string as invalid-key', async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), 'tuff-storage-invalid-key-'))
    const storage = new StorageModule()
    await storage.init({
      app: { channel: {} },
      file: { create: true, dirName: 'config', dirPath: configDir }
    } as unknown as Parameters<StorageModule['init']>[0])

    const registration = (
      transportMocks.on.mock.calls as unknown as Array<readonly [unknown, unknown]>
    ).find(([event]) => event === StorageEvents.app.save)
    const handler = registration?.[1] as
      | ((request: { key?: unknown; value?: unknown }) => Promise<{
          success: boolean
          reason?: string
        }>)
      | undefined

    for (const key of [undefined, 42]) {
      await expect(handler?.({ key, value: { beginner: { init: true } } })).resolves.toMatchObject({
        success: false,
        reason: 'invalid-key'
      })
    }

    await storage.onDestroy()
  })

  it('labels a serialized credential-bearing save as credential-rejected', async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), 'tuff-storage-content-secret-'))
    const storage = new StorageModule()
    await storage.init({
      app: { channel: {} },
      file: { create: true, dirName: 'config', dirPath: configDir }
    } as unknown as Parameters<StorageModule['init']>[0])

    const registration = (
      transportMocks.on.mock.calls as unknown as Array<readonly [unknown, unknown]>
    ).find(([event]) => event === StorageEvents.app.save)
    const handler = registration?.[1] as
      | ((request: { key: string; content: string }) => Promise<{
          success: boolean
          reason?: string
        }>)
      | undefined

    await expect(
      handler?.({
        key: StorageList.IntelligenceConfig,
        content: JSON.stringify({
          providers: [
            {
              id: 'openai-default',
              type: 'openai',
              name: 'OpenAI',
              enabled: true,
              apiKey: 'synthetic-provider-secret'
            }
          ]
        })
      })
    ).resolves.toMatchObject({ success: false, reason: 'credential-rejected' })

    await storage.onDestroy()
  })

  it('serializes durable writes per key so a stale revision cannot overwrite the latest value', async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), 'tuff-storage-race-'))
    const storage = new StorageModule()
    await storage.init({
      app: { channel: {} },
      file: { create: true, dirName: 'config', dirPath: configDir }
    } as unknown as Parameters<StorageModule['init']>[0])

    let releaseFirst: (() => void) | undefined
    const firstBarrier = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const repository = (
      storage as unknown as {
        configRepository: {
          persist: (record: { revision: number; serialized: string }) => Promise<void>
        }
      }
    ).configRepository
    const persisted: Array<{ revision: number; serialized: string }> = []
    vi.spyOn(repository, 'persist').mockImplementation(async (record) => {
      persisted.push({ revision: record.revision, serialized: record.serialized })
      if (persisted.length === 1) await firstBarrier
    })

    const key = 'privacy-retention-race.json'
    storage.saveConfig(key, { value: 1 }, false, true)
    const first = storage.persistConfigNow(key)
    await vi.waitFor(() => expect(persisted).toHaveLength(1))
    storage.saveConfig(key, { value: 2 }, false, true)
    const second = storage.persistConfigNow(key)
    await Promise.resolve()
    expect(persisted).toHaveLength(1)

    releaseFirst?.()
    await Promise.all([first, second])
    expect(persisted.map((entry) => JSON.parse(entry.serialized))).toEqual([
      { value: 1 },
      { value: 2 }
    ])
    expect(persisted[1]?.revision).toBeGreaterThan(persisted[0]?.revision ?? 0)

    await storage.onDestroy()
  })
})

describe('StorageModule cold shortcut configuration persistence', () => {
  const key = StorageList.SHORTCUT_SETTING
  const initialRevision = 8
  const systemShortcut: Shortcut = {
    id: 'core.test.cold-save',
    accelerator: 'Control+F17',
    type: ShortcutType.MAIN,
    meta: { creationTime: 1, modificationTime: 1, author: 'system', enabled: true }
  }
  const initialConfig: Shortcut[] = [systemShortcut]
  const featureBinding: Shortcut = {
    id: buildFeatureShortcutId('demo', 'translate'),
    accelerator: 'Control+F18',
    type: ShortcutType.FEATURE,
    meta: {
      creationTime: 2,
      modificationTime: 2,
      author: 'demo',
      enabled: true,
      featureId: 'translate'
    }
  }
  const migrationUrl = new URL(
    '../../../../resources/db/migrations/0029_app_config_sot.sql',
    import.meta.url
  )
  const liveModules = new Set<StorageModule>()
  let directory: string
  let configDir: string
  let databasePath: string
  let client: Client

  beforeEach(async () => {
    vi.stubEnv('TALEX_CONFIG_STORAGE_BACKEND', 'sqlite')
    directory = mkdtempSync(path.join(tmpdir(), 'tuff-storage-cold-save-'))
    configDir = path.join(directory, 'config')
    databasePath = path.join(directory, 'app-config.sqlite')
    await mkdir(configDir)
    client = createClient({ url: `file:${databasePath}` })
    const migration = await readFile(migrationUrl, 'utf8')
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) await client.execute(statement)
    }
    // Only inject the database connection; repository SQL, cache, LRU and flushing stay real.
    vi.spyOn(databaseModule, 'getClient').mockImplementation(() => client)
    readFileSyncSpy.mockImplementation((filePath: string, encoding: BufferEncoding) =>
      readNodeFileSync(filePath, encoding)
    )
    const repository = new ApplicationConfigRepository({ client, legacyRoot: configDir })
    expect((await repository.initialize()).backend).toBe('sqlite')
    await repository.persist({
      key,
      serialized: JSON.stringify(initialConfig),
      revision: initialRevision,
      deleted: false
    })
  })

  afterEach(async () => {
    try {
      for (const storage of liveModules) await storage.onDestroy()
    } finally {
      liveModules.clear()
      client.close()
      await rm(directory, { recursive: true, force: true })
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
      readFileSyncSpy.mockReset()
      transportMocks.on.mockClear()
      transportMocks.onStream.mockClear()
    }
  })

  async function startStorage(): Promise<StorageModule> {
    const storage = new StorageModule()
    liveModules.add(storage)
    await storage.init({
      app: { channel: {} },
      file: { create: true, dirName: 'config', dirPath: configDir }
    } as unknown as Parameters<StorageModule['init']>[0])
    expect(storage.getCacheStats().backend).toBe('sqlite')
    return storage
  }

  async function stopStorage(storage: StorageModule): Promise<void> {
    await storage.onDestroy()
    liveModules.delete(storage)
  }

  async function reopenStorage(): Promise<StorageModule> {
    client.close()
    client = createClient({ url: `file:${databasePath}` })
    return await startStorage()
  }

  async function evictShortcutConfig(storage: StorageModule): Promise<void> {
    // Expose the existing eviction seam without replacing the module's cache or LRU manager.
    const eviction = storage as unknown as { cache: StorageCache; lruManager: StorageLRUManager }
    await eviction.lruManager.forceEvict(key)
    expect(eviction.cache.has(key)).toBe(false)
    expect(storage.getVersion(key)).toBe(0)
  }

  it.each(['persistConfigNow', 'shutdown flush'] as const)(
    'keeps a FEATURE binding and both saved enablement choices after cold writes via %s',
    async (flush) => {
      let storage = await startStorage()
      expect(storage.getConfigWithVersion(key)).toEqual({
        data: initialConfig,
        version: initialRevision
      })
      let previousRevision = initialRevision
      // The shortcut owner retains its own array while StorageModule's LRU entry is absent.
      for (const enabled of [false, true]) {
        const nextConfig: Shortcut[] = [
          { ...systemShortcut, meta: { ...systemShortcut.meta, enabled } },
          featureBinding
        ]
        await evictShortcutConfig(storage)
        const result = storage.saveConfig(key, JSON.stringify(nextConfig))
        expect(result.success).toBe(true)
        expect(result.version).toBeGreaterThan(previousRevision)
        if (flush === 'persistConfigNow') await storage.persistConfigNow(key)
        else await stopStorage(storage)

        // Read the actual SQLite row before any subsequent getConfig can rehydrate the cache.
        const persisted = await client.execute({
          sql: 'SELECT value, revision, deleted FROM app_config_entries WHERE key = ?',
          args: [key]
        })
        const row = persisted.rows[0]!
        expect(JSON.parse(String(row.value))).toEqual(nextConfig)
        expect(Number(row.deleted)).toBe(0)
        expect(Number(row.revision)).toBe(result.version)
        expect(Number(row.revision)).toBeGreaterThan(previousRevision)
        previousRevision = Number(row.revision)

        if (flush === 'persistConfigNow') await stopStorage(storage)
        storage = await reopenStorage()
        expect(storage.getConfigWithVersion(key)).toEqual({
          data: nextConfig,
          version: previousRevision
        })
      }
    }
  )

  it.each(['persistConfigNow', 'shutdown flush'] as const)(
    'persists a tombstone for an evicted high-revision key via %s and reads it cleared after reopening',
    async (flush) => {
      const storage = await startStorage()
      expect(storage.getConfigWithVersion(key)).toEqual({
        data: initialConfig,
        version: initialRevision
      })
      await evictShortcutConfig(storage)
      const result = storage.saveConfig(key, undefined, true)
      expect(result.success).toBe(true)
      expect(result.version).toBeGreaterThan(initialRevision)
      if (flush === 'persistConfigNow') await storage.persistConfigNow(key)
      else await stopStorage(storage)

      const persisted = await client.execute({
        sql: 'SELECT value, revision, deleted FROM app_config_entries WHERE key = ?',
        args: [key]
      })
      const row = persisted.rows[0]!
      expect(JSON.parse(String(row.value))).toEqual({})
      expect(Number(row.deleted)).toBe(1)
      expect(Number(row.revision)).toBe(result.version)
      expect(Number(row.revision)).toBeGreaterThan(initialRevision)

      if (flush === 'persistConfigNow') await stopStorage(storage)
      const restarted = await reopenStorage()
      expect(restarted.getConfigWithVersion(key)).toEqual({ data: {}, version: result.version })
    }
  )
})
