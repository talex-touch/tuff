import { PluginStatus, SdkApi } from '@talex-touch/utils/plugin'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import { createTrustedTestPluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { registerPluginStorageTransportHandlers } from './plugin-storage-transport-service'

const permissionState = vi.hoisted(() => ({
  current: null as null | { checkPermission: ReturnType<typeof vi.fn> }
}))

const secureStoreMock = vi.hoisted(() => ({
  getSecureStoreHealth: vi.fn(async () => ({
    backend: 'local-secret',
    available: true,
    degraded: false
  })),
  getSecureStoreValue: vi.fn(async () => null),
  isSecureStoreAvailable: vi.fn(() => true),
  setSecureStoreValue: vi.fn(async () => true)
}))

vi.mock('../../permission', () => ({
  getPermissionModule: () => permissionState.current
}))

vi.mock('../../../utils/secure-store', () => secureStoreMock)

vi.mock('electron', () => ({
  shell: { openPath: vi.fn(async () => '') }
}))

type Handler = (payload: any, context: any) => Promise<any>

function createHarness() {
  const handlers = new Map<unknown, Handler>()
  const activation = {
    name: 'alpha',
    pluginInstanceId: 'instance-alpha',
    activationGeneration: 1,
    key: 'activation-key'
  }
  const plugin = {
    name: 'alpha',
    status: PluginStatus.ENABLED,
    sdkapi: SdkApi.V260215,
    getActivationIdentity: vi.fn(() => activation),
    getDataPath: vi.fn(() => '/tmp/tuff/plugins/alpha/data')
  }
  const sqliteClient = {
    execute: vi.fn(async () => ({ rowsAffected: 1, lastInsertRowId: null })),
    query: vi.fn(async () => ({ rows: [{ id: 1 }], columns: ['id'] })),
    transaction: vi.fn(async () => ({ results: [] })),
    close: vi.fn()
  }
  const pluginSqliteResources = {
    acquire: vi.fn(async () => sqliteClient)
  }
  const transport = {
    on: vi.fn((event: unknown, handler: Handler) => {
      handlers.set(event, handler)
      return vi.fn()
    })
  }

  registerPluginStorageTransportHandlers({
    manager: {
      getPluginByName: vi.fn((name: string) => (name === 'alpha' ? plugin : undefined)),
      plugins: new Map([['alpha', plugin]])
    } as never,
    transport: transport as never,
    secureStoreRootPath: '/tmp/tuff',
    pluginSqliteResources: pluginSqliteResources as never,
    isRecord: (value): value is Record<string, unknown> =>
      Boolean(value) && typeof value === 'object' && !Array.isArray(value),
    ipcLog: { warn: vi.fn() },
    logHandlerError: vi.fn(),
    toErrorMessage: (error) => (error instanceof Error ? error.message : String(error))
  })

  const trusted = createTrustedTestPluginContext({
    name: 'alpha',
    pluginInstanceId: activation.pluginInstanceId,
    activationGeneration: activation.activationGeneration,
    uniqueKey: activation.key
  })
  return {
    activation,
    plugin,
    sqliteClient,
    pluginSqliteResources,
    trusted,
    handler: (event: unknown) => handlers.get(event)!
  }
}

describe('plugin privileged storage transport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permissionState.current = {
      checkPermission: vi.fn(() => ({
        allowed: true,
        permissionId: 'storage.sqlite'
      }))
    }
  })

  it('rejects forged, mismatched, and stale SQLite callers before resource acquisition', async () => {
    const harness = createHarness()
    const execute = harness.handler(PluginEvents.sqlite.execute)

    await expect(
      execute(
        { pluginName: 'alpha', sql: 'DELETE FROM notes' },
        { plugin: { name: 'alpha', verified: true } }
      )
    ).resolves.toMatchObject({
      success: false,
      code: 'PLUGIN_STORAGE_CALLER_UNVERIFIED'
    })
    await expect(
      execute({ pluginName: 'beta', sql: 'DELETE FROM notes' }, { plugin: harness.trusted })
    ).resolves.toMatchObject({
      success: false,
      code: 'PLUGIN_STORAGE_CALLER_UNVERIFIED'
    })

    harness.activation.activationGeneration = 2
    await expect(
      execute({ pluginName: 'alpha', sql: 'DELETE FROM notes' }, { plugin: harness.trusted })
    ).resolves.toMatchObject({
      success: false,
      code: 'PLUGIN_STORAGE_PLUGIN_UNAVAILABLE'
    })
    expect(harness.pluginSqliteResources.acquire).not.toHaveBeenCalled()
  })

  it('fails closed when permission runtime is unavailable, permission is denied, or SDK mismatches', async () => {
    const harness = createHarness()
    const execute = harness.handler(PluginEvents.sqlite.execute)

    permissionState.current = null
    await expect(
      execute({ sql: 'DELETE FROM notes' }, { plugin: harness.trusted })
    ).resolves.toMatchObject({ code: 'PLUGIN_STORAGE_PERMISSION_UNAVAILABLE' })

    permissionState.current = {
      checkPermission: vi.fn(() => ({ allowed: false, permissionId: 'storage.sqlite' }))
    }
    await expect(
      execute({ sql: 'DELETE FROM notes' }, { plugin: harness.trusted })
    ).resolves.toMatchObject({ code: 'PLUGIN_STORAGE_PERMISSION_DENIED' })

    harness.plugin.sdkapi = SdkApi.V251212
    await expect(
      execute({ sql: 'DELETE FROM notes' }, { plugin: harness.trusted })
    ).resolves.toMatchObject({ code: 'PLUGIN_STORAGE_SDKAPI_MISMATCH' })
  })

  it('applies SQL policy before dispatch and strips the terminal semicolon', async () => {
    const harness = createHarness()
    const execute = harness.handler(PluginEvents.sqlite.execute)

    await expect(
      execute({ sql: "ATTACH DATABASE '/tmp/other.db' AS other" }, { plugin: harness.trusted })
    ).resolves.toMatchObject({ code: 'PLUGIN_SQLITE_STATEMENT_DENIED' })
    expect(harness.sqliteClient.execute).not.toHaveBeenCalled()

    await expect(
      execute({ sql: 'DELETE FROM notes; -- done', params: [] }, { plugin: harness.trusted })
    ).resolves.toMatchObject({ success: true, rowsAffected: 1 })
    expect(harness.sqliteClient.execute).toHaveBeenCalledWith('DELETE FROM notes', [])
  })

  it('requires authoritative identity and fail-closed permission for secret health', async () => {
    const harness = createHarness()
    const health = harness.handler(PluginEvents.storage.getSecretHealth)

    await expect(health(undefined, {})).resolves.toMatchObject({
      success: false,
      code: 'PLUGIN_STORAGE_CALLER_UNVERIFIED'
    })

    permissionState.current = null
    await expect(health(undefined, { plugin: harness.trusted })).resolves.toMatchObject({
      success: false,
      code: 'PLUGIN_STORAGE_PERMISSION_UNAVAILABLE'
    })
  })
})
