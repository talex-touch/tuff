import type {
  PluginApiUninstallRequest,
  PluginApiUninstallResponse
} from '@talex-touch/utils/transport/events/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPluginDataDispositionCoordinator,
  type PluginDataDispositionOwner,
  type PluginDataDispositionResiduals,
  type PluginDataDispositionStepOutcome
} from './plugin-data-disposition'

const owner: PluginDataDispositionOwner = Object.freeze({
  pluginName: 'touch-fixture',
  folderName: 'touch-fixture-folder',
  pluginInstanceId: 'fixture-instance',
  activationGeneration: 3
})

const request: PluginApiUninstallRequest = Object.freeze({
  version: 1,
  plugin: Object.freeze({
    name: owner.pluginName,
    pluginInstanceId: owner.pluginInstanceId,
    activationGeneration: owner.activationGeneration
  }),
  disposition: Object.freeze({
    confirmation: 'delete-plugin-and-data',
    ordinaryExport: Object.freeze({ enabled: true }),
    portableSecretBackup: Object.freeze({
      enabled: true,
      password: 'correct horse battery staple'
    })
  })
})

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function emptyResiduals(): PluginDataDispositionResiduals {
  return {
    sqliteOwner: false,
    sqliteFile: false,
    secrets: false,
    temp: false,
    cache: false,
    data: false,
    pluginData: false,
    code: false
  }
}

function createHarness() {
  const calls: string[] = []
  let currentOwner: PluginDataDispositionOwner | null = owner
  const step = (name: string) =>
    vi.fn<() => Promise<PluginDataDispositionStepOutcome>>(async () => {
      calls.push(name)
      return 'completed'
    })
  const dependencies = {
    resolveCurrentOwner: vi.fn(() => currentOwner),
    canStart: vi.fn(() => true),
    closeAdmission: step('admission'),
    closeRuntime: step('runtime'),
    closeSqlite: step('sqlite-close'),
    closeLogger: step('logger'),
    exportOrdinary: step('ordinary-export'),
    backupPortableSecrets: step('secret-backup'),
    verifySqliteClosed: step('sqlite-verify'),
    revokePermissions: step('permissions'),
    invalidateAuthority: step('authority'),
    purgeSecrets: step('secrets'),
    deleteTemp: step('temp'),
    deleteCache: step('cache'),
    deleteData: step('data'),
    deletePluginData: step('plugin-data'),
    deleteCode: step('code'),
    inspectResiduals: vi.fn(async () => {
      calls.push('verification')
      return emptyResiduals()
    }),
    finalize: vi.fn(async () => {
      calls.push('finalize')
      currentOwner = null
      return 'completed' as const
    }),
    reportUninstall: vi.fn(async () => {
      calls.push('report')
      return 'completed' as const
    })
  }
  const coordinator = createPluginDataDispositionCoordinator(dependencies)
  return {
    calls,
    coordinator,
    dependencies,
    setCurrentOwner(value: PluginDataDispositionOwner | null) {
      currentOwner = value
    }
  }
}

function expectFailed(result: PluginApiUninstallResponse): void {
  expect(result).toMatchObject({
    version: 1,
    success: false,
    status: 'failed',
    installed: true
  })
}

describe('plugin data disposition coordinator RED 4', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('runs the exact owner-bound teardown, export, deletion, verification, and reporting order', async () => {
    const harness = createHarness()

    await expect(harness.coordinator.uninstall(request)).resolves.toMatchObject({
      version: 1,
      success: true,
      status: 'completed',
      code: 'PLUGIN_UNINSTALL_COMPLETED',
      installed: false
    })
    expect(harness.calls).toEqual([
      'admission',
      'runtime',
      'logger',
      'temp',
      'sqlite-close',
      'sqlite-verify',
      'ordinary-export',
      'secret-backup',
      'permissions',
      'authority',
      'secrets',
      'data',
      'cache',
      'plugin-data',
      'code',
      'verification',
      'finalize',
      'report'
    ])
  })

  it('closes runtime, logger, and SQLite before starting any export', async () => {
    const harness = createHarness()
    const runtime = deferred()
    const ordinaryExport = deferred()
    const logger = deferred()
    const sqlite = deferred()
    harness.dependencies.closeRuntime.mockImplementationOnce(async () => {
      harness.calls.push('runtime')
      await runtime.promise
      return 'completed'
    })
    harness.dependencies.exportOrdinary.mockImplementationOnce(async () => {
      harness.calls.push('ordinary-export')
      await ordinaryExport.promise
      return 'completed'
    })
    harness.dependencies.closeLogger.mockImplementationOnce(async () => {
      harness.calls.push('logger')
      await logger.promise
      return 'completed'
    })
    harness.dependencies.closeSqlite.mockImplementationOnce(async () => {
      harness.calls.push('sqlite-close')
      await sqlite.promise
      return 'completed'
    })

    const operation = harness.coordinator.uninstall(request)
    await vi.waitFor(() => expect(harness.calls).toEqual(['admission', 'runtime']))
    runtime.resolve()
    await vi.waitFor(() => expect(harness.calls).toContain('logger'))
    expect(harness.calls).not.toContain('sqlite-close')
    expect(harness.calls).not.toContain('ordinary-export')
    logger.resolve()
    await vi.waitFor(() => expect(harness.calls).toContain('sqlite-close'))
    expect(harness.calls).not.toContain('ordinary-export')
    expect(harness.calls).not.toContain('secrets')
    sqlite.resolve()
    await vi.waitFor(() => expect(harness.calls).toContain('ordinary-export'))
    expect(harness.calls).not.toContain('secrets')
    ordinaryExport.resolve()
    await expect(operation).resolves.toMatchObject({ success: true })
  })

  it('preserves the installed stopped owner when ordinary export is cancelled', async () => {
    const harness = createHarness()
    harness.dependencies.exportOrdinary.mockResolvedValueOnce('cancelled')

    await expect(harness.coordinator.uninstall(request)).resolves.toMatchObject({
      success: false,
      status: 'cancelled',
      code: 'PLUGIN_UNINSTALL_CANCELLED',
      installed: true,
      stages: expect.arrayContaining([
        {
          stage: 'ordinary-export',
          status: 'cancelled',
          code: 'PLUGIN_UNINSTALL_ORDINARY_EXPORT_CANCELLED',
          retryable: true
        }
      ])
    })
    expect(harness.calls).not.toContain('secrets')
    expect(harness.calls).not.toContain('code')
    expect(harness.dependencies.finalize).not.toHaveBeenCalled()
    expect(harness.coordinator.isBlocked(owner.pluginName)).toBe(true)
    expect(harness.coordinator.isBlocked(owner.folderName)).toBe(true)
  })

  it('attempts the other safe export after one export fails but starts no deletion', async () => {
    const harness = createHarness()
    harness.dependencies.exportOrdinary.mockImplementationOnce(async () => {
      harness.calls.push('ordinary-export')
      throw new Error('synthetic export failure')
    })

    const result = await harness.coordinator.uninstall(request)
    expectFailed(result)
    expect(harness.dependencies.backupPortableSecrets).toHaveBeenCalledOnce()
    expect(harness.calls).not.toContain('secrets')
    expect(JSON.stringify(result)).not.toContain('synthetic export failure')
  })

  it('preserves the installed owner when portable Secret backup fails', async () => {
    const harness = createHarness()
    harness.dependencies.backupPortableSecrets.mockImplementationOnce(async () => {
      harness.calls.push('secret-backup')
      throw new Error('synthetic backup native failure')
    })

    const result = await harness.coordinator.uninstall(request)
    expectFailed(result)
    expect(result.code).toBe('PLUGIN_UNINSTALL_EXPORT_FAILED')
    expect(result.stages).toContainEqual({
      stage: 'secret-backup',
      status: 'failed',
      code: 'PLUGIN_UNINSTALL_SECRET_BACKUP_FAILED',
      retryable: true
    })
    expect(harness.calls).not.toContain('secrets')
    expect(harness.calls).not.toContain('code')
    expect(JSON.stringify(result)).not.toContain('synthetic backup native failure')
  })

  it('treats a portable backup with no allowlisted entries as a stable non-failure', async () => {
    const harness = createHarness()
    harness.dependencies.backupPortableSecrets.mockResolvedValueOnce('no-data')

    const result = await harness.coordinator.uninstall(request)
    expect(result).toMatchObject({ success: true, installed: false })
    expect(result.stages).toContainEqual({
      stage: 'secret-backup',
      status: 'skipped',
      code: 'PLUGIN_UNINSTALL_SECRET_BACKUP_NO_DATA',
      retryable: false
    })
    expect(JSON.stringify(result)).not.toContain(
      request.disposition.portableSecretBackup.enabled
        ? request.disposition.portableSecretBackup.password
        : ''
    )
  })

  it('attempts safe teardown owners but starts no export or deletion when runtime fails', async () => {
    const harness = createHarness()
    harness.dependencies.closeRuntime.mockImplementationOnce(async () => {
      harness.calls.push('runtime')
      throw new Error('runtime native detail')
    })

    const result = await harness.coordinator.uninstall(request)
    expectFailed(result)
    expect(result.stages.filter((stage) => stage.status === 'failed')).toHaveLength(1)
    expect(harness.calls).toContain('logger')
    expect(harness.calls).toContain('sqlite-close')
    expect(harness.calls).not.toContain('ordinary-export')
    expect(harness.calls).not.toContain('secrets')
    expect(JSON.stringify(result)).not.toMatch(/native detail/i)
  })

  it('blocks export and persistent deletion when temporary resource teardown fails', async () => {
    const harness = createHarness()
    harness.dependencies.deleteTemp.mockImplementationOnce(async () => {
      harness.calls.push('temp')
      throw new Error('synthetic temporary resource failure')
    })

    const result = await harness.coordinator.uninstall(request)

    expectFailed(result)
    expect(result.code).toBe('PLUGIN_UNINSTALL_TEARDOWN_FAILED')
    expect(result.stages).toContainEqual({
      stage: 'temp',
      status: 'failed',
      code: 'PLUGIN_UNINSTALL_TEMP_DELETE_FAILED',
      retryable: true
    })
    expect(harness.calls).toContain('sqlite-close')
    expect(harness.calls).not.toContain('ordinary-export')
    expect(harness.calls).not.toContain('secrets')
  })

  it.each([
    ['purgeSecrets', 'secrets'],
    ['deleteCache', 'cache'],
    ['deleteData', 'data'],
    ['deletePluginData', 'plugin-data'],
    ['deleteCode', 'code']
  ] as const)(
    'does not report success when %s fails and still attempts later safe cleanup stages',
    async (dependency, expectedStage) => {
      const harness = createHarness()
      harness.dependencies[dependency].mockImplementationOnce(async () => {
        harness.calls.push(expectedStage)
        throw new Error('synthetic native failure')
      })

      const result = await harness.coordinator.uninstall(request)
      expectFailed(result)
      expect(result.stages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ stage: expectedStage, status: 'failed' })
        ])
      )
      expect(harness.calls).toContain('plugin-data')
      if (expectedStage === 'code') {
        expect(harness.calls).toContain('code')
      } else {
        expect(harness.calls).not.toContain('code')
      }
      expect(harness.calls).toContain('verification')
      expect(harness.dependencies.reportUninstall).not.toHaveBeenCalled()
      expect(harness.coordinator.isBlocked(owner.pluginName)).toBe(true)
    }
  )

  it('fails closed when SQLite remains owned after close', async () => {
    const harness = createHarness()
    harness.dependencies.verifySqliteClosed.mockResolvedValueOnce('residual')

    const result = await harness.coordinator.uninstall(request)
    expectFailed(result)
    expect(result.stages).toContainEqual({
      stage: 'sqlite',
      status: 'failed',
      code: 'PLUGIN_UNINSTALL_SQLITE_RESIDUAL',
      retryable: true
    })
    expect(harness.calls).not.toContain('secrets')
  })

  it('fails verification when any exact-generation residual remains', async () => {
    const harness = createHarness()
    harness.dependencies.inspectResiduals.mockImplementationOnce(async () => {
      harness.calls.push('verification')
      return { ...emptyResiduals(), sqliteFile: true, cache: true }
    })

    const result = await harness.coordinator.uninstall(request)
    expectFailed(result)
    expect(result.code).toBe('PLUGIN_UNINSTALL_VERIFICATION_FAILED')
    expect(harness.dependencies.finalize).not.toHaveBeenCalled()
    expect(harness.dependencies.reportUninstall).not.toHaveBeenCalled()
  })

  it('retains retry ownership and resumes completed destructive stages idempotently', async () => {
    const harness = createHarness()
    harness.dependencies.deleteData.mockImplementationOnce(async () => {
      harness.calls.push('data')
      throw new Error('first delete failed')
    })

    const first = await harness.coordinator.uninstall(request)
    expectFailed(first)
    expect(harness.coordinator.isBlocked(owner.pluginName)).toBe(true)

    harness.calls.splice(0)
    const second = await harness.coordinator.uninstall(request)
    expect(second).toMatchObject({ success: true, installed: false })
    expect(harness.dependencies.purgeSecrets).toHaveBeenCalledOnce()
    expect(harness.dependencies.deleteTemp).toHaveBeenCalledOnce()
    expect(harness.dependencies.deleteData).toHaveBeenCalledTimes(2)
    expect(harness.calls).toEqual(['data', 'code', 'verification', 'finalize', 'report'])
  })

  it('rejects enabling ordinary export after destructive retry ownership is established', async () => {
    const harness = createHarness()
    const withoutOrdinaryExport = {
      ...request,
      disposition: {
        ...request.disposition,
        ordinaryExport: { enabled: false }
      }
    } as PluginApiUninstallRequest
    harness.dependencies.deleteData.mockRejectedValueOnce(new Error('first delete failed'))

    await expect(harness.coordinator.uninstall(withoutOrdinaryExport)).resolves.toMatchObject({
      success: false,
      code: 'PLUGIN_UNINSTALL_CLEANUP_FAILED'
    })
    harness.calls.splice(0)

    await expect(harness.coordinator.uninstall(request)).resolves.toMatchObject({
      success: false,
      code: 'PLUGIN_UNINSTALL_OPERATION_BUSY',
      installed: true
    })
    expect(harness.dependencies.exportOrdinary).not.toHaveBeenCalled()
    expect(harness.calls).toEqual([])
  })

  it('rejects enabling Secret backup after destructive retry ownership is established', async () => {
    const harness = createHarness()
    const withoutSecretBackup = {
      ...request,
      disposition: {
        ...request.disposition,
        portableSecretBackup: { enabled: false }
      }
    } as PluginApiUninstallRequest
    harness.dependencies.deleteData.mockRejectedValueOnce(new Error('first delete failed'))

    await expect(harness.coordinator.uninstall(withoutSecretBackup)).resolves.toMatchObject({
      success: false,
      code: 'PLUGIN_UNINSTALL_CLEANUP_FAILED'
    })
    harness.calls.splice(0)

    await expect(harness.coordinator.uninstall(request)).resolves.toMatchObject({
      success: false,
      code: 'PLUGIN_UNINSTALL_OPERATION_BUSY',
      installed: true
    })
    expect(harness.dependencies.backupPortableSecrets).not.toHaveBeenCalled()
    expect(harness.calls).toEqual([])
  })

  it('rejects an already-busy lifecycle before creating retry ownership', async () => {
    const harness = createHarness()
    harness.dependencies.canStart.mockReturnValue(false)

    await expect(harness.coordinator.uninstall(request)).resolves.toMatchObject({
      success: false,
      code: 'PLUGIN_UNINSTALL_OPERATION_BUSY',
      installed: true
    })
    expect(harness.dependencies.closeAdmission).not.toHaveBeenCalled()
    expect(harness.coordinator.isBlocked(owner.pluginName)).toBe(false)
    expect(harness.coordinator.hasBlockedOperations()).toBe(false)
  })

  it('rejects concurrent uninstall and keeps reload/update admission blocked', async () => {
    const harness = createHarness()
    const runtime = deferred()
    harness.dependencies.closeRuntime.mockImplementationOnce(async () => {
      harness.calls.push('runtime')
      await runtime.promise
      return 'completed'
    })

    const first = harness.coordinator.uninstall(request)
    await vi.waitFor(() => expect(harness.coordinator.isBlocked(owner.pluginName)).toBe(true))
    harness.setCurrentOwner(null)
    await expect(harness.coordinator.uninstall(request)).resolves.toMatchObject({
      success: false,
      code: 'PLUGIN_UNINSTALL_OPERATION_BUSY',
      installed: true
    })
    runtime.resolve()
    await first
  })

  it('rejects a stale renderer generation before closing admission', async () => {
    const harness = createHarness()
    const staleRequest = {
      ...request,
      plugin: { ...request.plugin, activationGeneration: 2 }
    } as PluginApiUninstallRequest

    await expect(harness.coordinator.uninstall(staleRequest)).resolves.toMatchObject({
      success: false,
      code: 'PLUGIN_UNINSTALL_STALE_GENERATION',
      installed: true
    })
    expect(harness.dependencies.closeAdmission).not.toHaveBeenCalled()
  })

  it('stops before the next destructive stage when the exact owner generation changes', async () => {
    const harness = createHarness()
    harness.dependencies.purgeSecrets.mockImplementationOnce(async () => {
      harness.calls.push('secrets')
      harness.setCurrentOwner({
        ...owner,
        pluginInstanceId: 'replacement-instance',
        activationGeneration: owner.activationGeneration + 1
      })
      return 'completed'
    })

    const result = await harness.coordinator.uninstall(request)

    expectFailed(result)
    expect(result.code).toBe('PLUGIN_UNINSTALL_CLEANUP_FAILED')
    expect(harness.dependencies.deleteData).not.toHaveBeenCalled()
    expect(harness.dependencies.deleteCache).not.toHaveBeenCalled()
    expect(harness.dependencies.deletePluginData).not.toHaveBeenCalled()
    expect(harness.dependencies.deleteCode).not.toHaveBeenCalled()
    expect(result.stages).toContainEqual({
      stage: 'verification',
      status: 'failed',
      code: 'PLUGIN_UNINSTALL_RESIDUALS_FOUND',
      retryable: true
    })
  })

  it('never reports Store uninstall before complete local success', async () => {
    const harness = createHarness()
    harness.dependencies.finalize.mockImplementationOnce(async () => {
      harness.calls.push('finalize')
      throw new Error('persist enabled state failed')
    })

    const result = await harness.coordinator.uninstall(request)
    expectFailed(result)
    expect(harness.dependencies.reportUninstall).not.toHaveBeenCalled()
  })
})
