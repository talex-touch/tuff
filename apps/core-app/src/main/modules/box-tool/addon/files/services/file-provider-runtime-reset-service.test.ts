import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { inArray } from 'drizzle-orm'
import { scanProgress } from '../../../../../db/schema'
import { FileProviderRuntimeResetService } from './file-provider-runtime-reset-service'

function createDbUtils(rowCount: number) {
  const deleteResult = Promise.resolve()
  const deleteWhere = vi.fn(() => deleteResult)
  const deleteTable = vi.fn(() => ({ where: deleteWhere }))
  const where = vi.fn(async () => [{ cnt: rowCount }])
  const from = vi.fn(() => ({ where }))
  const select = vi.fn(() => ({ from }))
  const all = vi.fn(async () => [{ name: 'path' }, { name: 'last_scanned' }])
  const run = vi.fn(async () => undefined)

  return {
    dbUtils: {
      getDb: vi.fn(() => ({
        all,
        run,
        select,
        delete: deleteTable
      }))
    },
    all,
    run,
    deleteResult,
    deleteTable,
    deleteWhere,
    from,
    select,
    where
  }
}

function createService(input: {
  dbUtils?: unknown
  scanProgressPaths?: string[]
  normalizePath?: (path: string) => string
  withDbWrite?: <T>(label: string, operation: () => Promise<T>) => Promise<T>
}) {
  const withDbWriteSpy = vi.fn()
  const withDbWrite = async <T>(label: string, operation: () => Promise<T>): Promise<T> => {
    withDbWriteSpy(label, operation)
    return input.withDbWrite ? input.withDbWrite(label, operation) : operation()
  }
  const logInfo = vi.fn()

  return {
    logInfo,
    service: new FileProviderRuntimeResetService({
      sourceId: 'file-provider',
      getDbUtils: () => (input.dbUtils ?? null) as never,
      normalizePath: input.normalizePath,
      getScanProgressPaths: () => input.scanProgressPaths ?? ['/a', '/b'],
      withDbWrite,
      logInfo
    }),
    withDbWrite: withDbWriteSpy
  }
}

describe('file-provider-runtime-reset-service', () => {
  it('deletes only current scan progress paths when reset finds pending progress', async () => {
    const { dbUtils, from, where, deleteTable, deleteWhere } = createDbUtils(3)
    const { service, withDbWrite } = createService({ dbUtils })

    const result = await service.reset({
      request: {
        sourceId: 'file-provider',
        reason: 'integrity-repair'
      },
      operationReasonPrefix: 'file-index.integrity-repair'
    })

    expect(from).toHaveBeenCalledWith(scanProgress)
    expect(where).toHaveBeenCalledWith(inArray(scanProgress.path, ['/a', '/b']))
    expect(withDbWrite).toHaveBeenCalledWith(
      'file-index.integrity-repair.scan-progress-reset',
      expect.any(Function)
    )
    expect(deleteTable).toHaveBeenCalledWith(scanProgress)
    expect(deleteWhere).toHaveBeenCalledWith(inArray(scanProgress.path, ['/a', '/b']))
    expect(result.clearedScanProgress).toBe(true)
    expect(result.scanProgressRows).toBe(3)
  })

  it('deletes raw and normalized scan progress paths during reset cleanup', async () => {
    const { dbUtils, where, deleteWhere } = createDbUtils(2)
    const { service } = createService({
      dbUtils,
      scanProgressPaths: ['/Users/me/Documents'],
      normalizePath: (path) => path.toLowerCase()
    })

    const result = await service.reset({
      request: {
        sourceId: 'file-provider',
        reason: 'integrity-repair'
      },
      operationReasonPrefix: 'file-index.integrity-repair'
    })

    const expectedPaths = ['/Users/me/Documents', '/users/me/documents']
    expect(where).toHaveBeenCalledWith(inArray(scanProgress.path, expectedPaths))
    expect(deleteWhere).toHaveBeenCalledWith(inArray(scanProgress.path, expectedPaths))
    expect(result).toMatchObject({
      clearedScanProgress: true,
      scanProgressRows: 2
    })
  })

  it('ignores empty normalized scan progress paths during reset cleanup', async () => {
    const { dbUtils, from, where, deleteTable, deleteWhere } = createDbUtils(1)
    const { service } = createService({
      dbUtils,
      scanProgressPaths: ['/Users/me/Documents', '   ', '/ignored'],
      normalizePath: (path) => (path === '/ignored' ? '' : path.trim().toLowerCase())
    })

    const result = await service.reset({
      request: {
        sourceId: 'file-provider',
        reason: 'integrity-repair'
      },
      operationReasonPrefix: 'file-index.integrity-repair'
    })

    const expectedPaths = ['/Users/me/Documents', '/users/me/documents']
    expect(from).toHaveBeenCalledWith(scanProgress)
    expect(where).toHaveBeenCalledWith(inArray(scanProgress.path, expectedPaths))
    expect(deleteTable).toHaveBeenCalledWith(scanProgress)
    expect(deleteWhere).toHaveBeenCalledWith(inArray(scanProgress.path, expectedPaths))
    expect(result).toMatchObject({
      clearedScanProgress: true,
      scanProgressRows: 1
    })
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

  it('does not read or delete scan progress when no reset paths are available', async () => {
    const { dbUtils, from, deleteTable } = createDbUtils(3)
    const { service, withDbWrite } = createService({ dbUtils, scanProgressPaths: [] })

    const result = await service.reset({
      request: {
        sourceId: 'file-provider',
        reason: 'integrity-repair'
      },
      operationReasonPrefix: 'file-index.integrity-repair'
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

  it('builds FileProvider scan-progress reset operation reasons from its adapter namespace', async () => {
    const { dbUtils } = createDbUtils(2)
    const { service, withDbWrite } = createService({ dbUtils })

    const result = await service.reset({
      request: {
        sourceId: 'file-provider',
        reason: 'manual-rebuild',
        clearScanProgress: true
      }
    })

    expect(withDbWrite).toHaveBeenCalledWith(
      'file-index.manual-rebuild.scan-progress-reset',
      expect.any(Function)
    )
    expect(result).toMatchObject({
      clearedSearchIndex: false,
      clearedScanProgress: true,
      scanProgressRows: 2
    })
  })

  it('keeps source-scoped scan progress rows isolated during reset cleanup', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tuff-runtime-reset-scan-progress-'))
    try {
      const dbPath = join(dir, 'runtime-reset.sqlite')
      const client = createClient({ url: `file:${dbPath}` })
      try {
        const db = drizzle(client)
        await client.execute(`
          CREATE TABLE scan_progress (
            source_id text NOT NULL,
            path text NOT NULL,
            last_scanned integer NOT NULL,
            PRIMARY KEY(source_id, path)
          )
        `)
        await client.execute({
          sql: `
            INSERT INTO scan_progress(source_id, path, last_scanned)
            VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)
          `,
          args: [
            'file-provider',
            '/a',
            1_780_099_200_000,
            'file-provider',
            '/b',
            1_780_099_201_000,
            'other-provider',
            '/a',
            1_780_185_600_000
          ]
        })
        const { service } = createService({
          dbUtils: { getDb: () => db },
          scanProgressPaths: ['/a']
        })

        const result = await service.reset({
          request: {
            sourceId: 'file-provider',
            reason: 'manual-rebuild',
            clearScanProgress: true
          },
          operationReasonPrefix: 'file-index.manual-rebuild'
        })

        expect(result).toMatchObject({
          clearedScanProgress: true,
          scanProgressRows: 1
        })
        const rows = await client.execute(
          'SELECT source_id AS sourceId, path, last_scanned AS lastScanned FROM scan_progress ORDER BY source_id, path'
        )
        expect(rows.rows).toEqual([
          { sourceId: 'file-provider', path: '/b', lastScanned: 1_780_099_201_000 },
          { sourceId: 'other-provider', path: '/a', lastScanned: 1_780_185_600_000 }
        ])
      } finally {
        client.close()
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
