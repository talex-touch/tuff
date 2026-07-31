import { PluginStatus, SdkApi } from '@talex-touch/utils/plugin'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import { createTrustedTestPluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { registerPluginStorageTransportHandlers } from './plugin-storage-transport-service'

const permissionState = vi.hoisted(() => ({
  current: null as null | { checkPermission: ReturnType<typeof vi.fn> }
}))

const secureStoreMock = vi.hoisted(() => ({
  applySecureStoreBatch: vi.fn(
    async (
      _rootPath: string,
      _entries: readonly { key: string; value: string | null; purpose: string }[],
      _onFailure: (message: string) => void
    ) => true
  ),
  getSecureStoreHealth: vi.fn(async () => ({
    backend: 'local-secret',
    available: true,
    degraded: false
  })),
  getSecureStoreValue: vi.fn(async () => null),
  getSecureStoreValueStrict: vi.fn(async () => null),
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

type Handler = (payload: unknown, context: unknown) => Promise<unknown>

function createHarness(pluginName = 'alpha') {
  const handlers = new Map<unknown, Handler>()
  const activation = {
    name: pluginName,
    pluginInstanceId: `instance-${pluginName}`,
    activationGeneration: 1,
    key: `activation-key-${pluginName}`
  }
  let pluginFile: unknown
  const plugin = {
    name: pluginName,
    status: PluginStatus.ENABLED,
    sdkapi: SdkApi.V260215,
    getActivationIdentity: vi.fn(() => activation),
    getDataPath: vi.fn(() => `/tmp/tuff/plugins/${pluginName}/data`),
    getPluginFile: vi.fn(() => pluginFile),
    savePluginFile: vi.fn((_fileName: string, value: unknown) => {
      pluginFile = structuredClone(value)
      return { success: true }
    })
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
      getPluginByName: vi.fn((name: string) => (name === pluginName ? plugin : undefined)),
      plugins: new Map([[pluginName, plugin]])
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
    name: pluginName,
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
    setPluginFile: (value: unknown) => {
      pluginFile = structuredClone(value)
    },
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

  it('applies an exact, deduplicated secret batch through one secure-store mutation', async () => {
    const harness = createHarness()
    const setBatch = harness.handler(PluginEvents.storage.setSecretBatch)

    await expect(
      setBatch(
        {
          entries: [
            { key: 'providers.tencent.secretId', value: '  synthetic-id  ' },
            { key: 'providers.tencent.secretKey', value: 'synthetic-key' }
          ]
        },
        { plugin: harness.trusted }
      )
    ).resolves.toEqual({ success: true })

    expect(secureStoreMock.applySecureStoreBatch).toHaveBeenCalledTimes(1)
    expect(secureStoreMock.applySecureStoreBatch).toHaveBeenCalledWith(
      '/tmp/tuff',
      [
        {
          key: 'plugin.alpha.providers.tencent.secretId',
          value: '  synthetic-id  ',
          purpose: 'plugin-secret'
        },
        {
          key: 'plugin.alpha.providers.tencent.secretKey',
          value: 'synthetic-key',
          purpose: 'plugin-secret'
        }
      ],
      expect.any(Function)
    )

    await expect(
      setBatch(
        {
          entries: [
            { key: 'duplicate', value: 'one' },
            { key: 'duplicate', value: 'two' }
          ]
        },
        { plugin: harness.trusted }
      )
    ).resolves.toMatchObject({ success: false, code: 'PLUGIN_SECRET_KEY_INVALID' })

    await expect(
      setBatch(
        {
          entries: [{ key: 'exact', value: 'synthetic', extra: 'forbidden' }]
        },
        { plugin: harness.trusted }
      )
    ).resolves.toMatchObject({ success: false, code: 'PLUGIN_SECRET_KEY_INVALID' })
    const getter = vi.fn(() => 'synthetic')
    const accessorEntry = Object.defineProperty({ key: 'accessor' }, 'value', {
      enumerable: true,
      get: getter
    })
    const proxyOwnKeys = vi.fn(() => [])
    const proxyEntries = new Proxy([], { ownKeys: proxyOwnKeys })
    for (const entries of [
      Array.from({ length: 2 }),
      [accessorEntry],
      proxyEntries,
      [{ key: 'oversized', value: 'x'.repeat(64 * 1024 + 1) }]
    ]) {
      await expect(setBatch({ entries }, { plugin: harness.trusted })).resolves.toMatchObject({
        success: false,
        code: 'PLUGIN_SECRET_KEY_INVALID'
      })
    }
    expect(getter).not.toHaveBeenCalled()
    expect(proxyOwnKeys).not.toHaveBeenCalled()
  })

  it('serializes Translation config writes behind the current activation migration', async () => {
    const harness = createHarness('touch-translation')
    harness.setPluginFile({
      tencent: {
        enabled: true,
        config: {
          region: 'ap-shanghai',
          secretId: 'synthetic-legacy-id',
          secretKey: 'synthetic-legacy-key'
        }
      }
    })
    let releaseSecureWrite: (() => void) | undefined
    const secureWriteGate = new Promise<void>((resolve) => {
      releaseSecureWrite = resolve
    })
    secureStoreMock.applySecureStoreBatch.mockImplementationOnce(async () => {
      await secureWriteGate
      return true
    })
    const getFile = harness.handler(PluginEvents.storage.getFile)
    const setFile = harness.handler(PluginEvents.storage.setFile)

    const migration = getFile({ fileName: 'providers_config' }, { plugin: harness.trusted })
    await vi.waitFor(() => expect(secureStoreMock.applySecureStoreBatch).toHaveBeenCalledTimes(1))
    const write = setFile(
      {
        fileName: 'providers_config',
        content: { google: { enabled: true, config: { target: 'zh-CN' } } }
      },
      { plugin: harness.trusted }
    )
    await Promise.resolve()
    expect(harness.plugin.savePluginFile).not.toHaveBeenCalled()

    releaseSecureWrite?.()
    await expect(migration).resolves.toEqual({
      tencent: { enabled: true, config: { region: 'ap-shanghai' } }
    })
    await expect(write).resolves.toEqual({ success: true })
    expect(harness.plugin.savePluginFile).toHaveBeenCalledTimes(2)
    expect(harness.plugin.savePluginFile).toHaveBeenNthCalledWith(2, 'providers_config', {
      google: { enabled: true, config: { target: 'zh-CN' } }
    })
  })

  it('keeps Secret fallback fail-closed for an activation after migration rollback fails', async () => {
    const harness = createHarness('touch-translation')
    harness.setPluginFile({
      tencent: {
        enabled: true,
        config: {
          secretId: 'synthetic-legacy-id',
          secretKey: 'synthetic-legacy-key'
        }
      }
    })
    secureStoreMock.applySecureStoreBatch.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    harness.plugin.savePluginFile.mockReturnValueOnce({ success: false })
    const getFile = harness.handler(PluginEvents.storage.getFile)
    const getSecret = harness.handler(PluginEvents.storage.getSecret)

    await expect(
      getFile({ fileName: 'providers_config' }, { plugin: harness.trusted })
    ).resolves.toEqual({ tencent: { enabled: true, config: {} } })
    const secret = await getSecret(
      { key: 'providers.tencent.secretKey' },
      { plugin: harness.trusted }
    )

    expect(secret).toMatchObject({ success: false, code: 'PLUGIN_SECRET_UNAVAILABLE' })
    expect(JSON.stringify(secret)).not.toContain('synthetic-legacy-key')
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
