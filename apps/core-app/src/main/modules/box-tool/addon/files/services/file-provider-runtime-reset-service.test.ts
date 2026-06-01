import { describe, expect, it, vi } from 'vitest'
import { scanProgress } from '../../../../../db/schema'
import { FileProviderRuntimeResetService } from './file-provider-runtime-reset-service'

function createDbUtils(rowCount: number) {
  const deleteResult = Promise.resolve()
  const deleteTable = vi.fn(() => deleteResult)
  const from = vi.fn(async () => [{ cnt: rowCount }])
  const select = vi.fn(() => ({ from }))

  return {
    dbUtils: {
      getDb: vi.fn(() => ({
        select,
        delete: deleteTable
      }))
    },
    deleteResult,
    deleteTable,
    from,
    select
  }
}

function createService(input: {
  dbUtils?: unknown
  removeSearchIndexByProvider?: (providerId: string, reason: string) => Promise<void>
  withDbWrite?: <T>(label: string, operation: () => Promise<T>) => Promise<T>
}) {
  const removeSearchIndexByProvider = vi.fn(
    input.removeSearchIndexByProvider ?? (async () => undefined)
  )
  const withDbWriteSpy = vi.fn()
  const withDbWrite = async <T>(label: string, operation: () => Promise<T>): Promise<T> => {
    withDbWriteSpy(label, operation)
    return input.withDbWrite ? input.withDbWrite(label, operation) : operation()
  }
  const logInfo = vi.fn()

  return {
    logInfo,
    removeSearchIndexByProvider,
    service: new FileProviderRuntimeResetService({
      sourceId: 'file-provider',
      getDbUtils: () => (input.dbUtils ?? null) as never,
      removeSearchIndexByProvider,
      withDbWrite,
      logInfo
    }),
    withDbWrite: withDbWriteSpy
  }
}

describe('file-provider-runtime-reset-service', () => {
  it('clears the search index through the provider worker boundary', async () => {
    const { service, removeSearchIndexByProvider } = createService({})

    const result = await service.reset({
      request: {
        sourceId: 'file-provider',
        reason: 'manual-rebuild',
        clearSearchIndex: true
      },
      operationReasonPrefix: 'file-index.manual-rebuild'
    })

    expect(removeSearchIndexByProvider).toHaveBeenCalledWith(
      'file-provider',
      'file-index.manual-rebuild.remove-by-provider'
    )
    expect(result.clearedSearchIndex).toBe(true)
    expect(result.clearedScanProgress).toBe(false)
    expect(result.scanProgressRows).toBe(0)
    expect(result).toMatchObject({
      sourceId: 'file-provider',
      reason: 'manual-rebuild'
    })
  })

  it('deletes scan progress rows when reset finds pending progress', async () => {
    const { dbUtils, from, deleteTable } = createDbUtils(3)
    const { service, withDbWrite } = createService({ dbUtils })

    const result = await service.reset({
      request: {
        sourceId: 'file-provider',
        reason: 'integrity-repair'
      },
      operationReasonPrefix: 'file-index.integrity-repair'
    })

    expect(from).toHaveBeenCalledWith(scanProgress)
    expect(withDbWrite).toHaveBeenCalledWith(
      'file-index.integrity-repair.scan-progress-reset',
      expect.any(Function)
    )
    expect(deleteTable).toHaveBeenCalledWith(scanProgress)
    expect(result.clearedScanProgress).toBe(true)
    expect(result.scanProgressRows).toBe(3)
  })

  it('does not read or delete scan progress when disabled by request', async () => {
    const { dbUtils, from, deleteTable } = createDbUtils(3)
    const { service, withDbWrite } = createService({ dbUtils })

    const result = await service.reset({
      request: {
        sourceId: 'file-provider',
        reason: 'schema-migration',
        clearScanProgress: false
      },
      operationReasonPrefix: 'file-index.schema-migration'
    })

    expect(from).not.toHaveBeenCalled()
    expect(deleteTable).not.toHaveBeenCalled()
    expect(withDbWrite).not.toHaveBeenCalled()
    expect(result.clearedScanProgress).toBe(false)
    expect(result.scanProgressRows).toBe(0)
  })

  it('returns a no-op scan progress result when database utils are unavailable', async () => {
    const { service, withDbWrite } = createService({})

    const result = await service.reset({
      request: {
        sourceId: 'file-provider',
        reason: 'health-repair'
      },
      operationReasonPrefix: 'file-index.health-repair'
    })

    expect(withDbWrite).not.toHaveBeenCalled()
    expect(result.clearedScanProgress).toBe(false)
    expect(result.scanProgressRows).toBe(0)
  })

  it('builds FileProvider reset operation reasons from its adapter namespace', async () => {
    const { dbUtils } = createDbUtils(2)
    const { service, removeSearchIndexByProvider, withDbWrite } = createService({ dbUtils })

    const result = await service.reset({
      request: {
        sourceId: 'file-provider',
        reason: 'manual-rebuild',
        clearSearchIndex: true,
        clearScanProgress: true
      }
    })

    expect(removeSearchIndexByProvider).toHaveBeenCalledWith(
      'file-provider',
      'file-index.manual-rebuild.remove-by-provider'
    )
    expect(withDbWrite).toHaveBeenCalledWith(
      'file-index.manual-rebuild.scan-progress-reset',
      expect.any(Function)
    )
    expect(result).toMatchObject({
      clearedSearchIndex: true,
      clearedScanProgress: true,
      scanProgressRows: 2
    })
  })
})
