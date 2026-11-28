import type { Client } from '@libsql/client'
import type { getLogger } from '@talex-touch/utils/common/logger'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import { operationalErrorService } from '../observability'
import {
  getDatabaseWalSearchIndexWriterPort,
  registerDatabaseWalSearchIndexWriterPort,
  type DatabaseWalSearchIndexWriterPort
} from './database-ports'
import { DatabaseWalMaintenance, DB_WAL_CHECKPOINT_SKIPPED_BUSY } from './wal-maintenance'

function createMockLogger(): ReturnType<typeof getLogger> {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } as unknown as ReturnType<typeof getLogger>
}

describe('database-ports and DatabaseWalMaintenance port coordination', () => {
  let disposePort: (() => void) | null = null

  beforeEach(async () => {
    await dbWriteScheduler.drain()
    registerDatabaseWalSearchIndexWriterPort(null)
    vi.restoreAllMocks()
  })

  afterEach(() => {
    disposePort?.()
    disposePort = null
    registerDatabaseWalSearchIndexWriterPort(null)
  })

  it('registers, replaces, and safely disposes the search-index writer port', () => {
    const firstPort: DatabaseWalSearchIndexWriterPort = {
      getStatus: vi.fn(() => ({ admissionPaused: false, activeAdmissions: 0, pending: 0 })),
      withPausedAdmission: vi.fn(async (_reason, op) =>
        op({ admissionPaused: true, activeAdmissions: 0, pending: 0 })
      )
    }
    const secondPort: DatabaseWalSearchIndexWriterPort = {
      getStatus: vi.fn(() => ({ admissionPaused: false, activeAdmissions: 1, pending: 2 })),
      withPausedAdmission: vi.fn(async (_reason, op) =>
        op({ admissionPaused: true, activeAdmissions: 0, pending: 0 })
      )
    }

    const disposeFirst = registerDatabaseWalSearchIndexWriterPort(firstPort)
    expect(getDatabaseWalSearchIndexWriterPort()).toBe(firstPort)

    const disposeSecond = registerDatabaseWalSearchIndexWriterPort(secondPort)
    expect(getDatabaseWalSearchIndexWriterPort()).toBe(secondPort)

    // Disposing a superseded registration must not clobber the active port.
    disposeFirst()
    expect(getDatabaseWalSearchIndexWriterPort()).toBe(secondPort)

    disposeSecond()
    expect(getDatabaseWalSearchIndexWriterPort()).toBeNull()
  })

  it('runs WAL checkpoints directly when no external search-index writer port is registered', async () => {
    const execute = vi.fn(async () => ({ rows: [{ busy: 0, log: 3, checkpointed: 3 }] }))
    const log = createMockLogger()
    const maintenance = new DatabaseWalMaintenance({
      getClient: () => ({ execute }) as unknown as Client,
      getWalSizeBytes: async () => 1024,
      getOpenFdCount: async () => 12,
      runWalCheckpoint: async () => undefined,
      reportDatabaseHealth: async () => undefined,
      log
    })

    await maintenance.runWalCheckpoint('PASSIVE')

    expect(execute).toHaveBeenCalledWith('PRAGMA wal_checkpoint(PASSIVE)')
    expect(log.info).toHaveBeenCalledWith(
      'WAL checkpoint PASSIVE complete',
      expect.objectContaining({
        meta: expect.objectContaining({
          mode: 'PASSIVE',
          logFrames: 3,
          checkpointedFrames: 3
        })
      })
    )
  })

  it('logs skip reason when registered writer port times out draining admission', async () => {
    const execute = vi.fn(async () => ({ rows: [{ busy: 0, log: 1, checkpointed: 1 }] }))
    const log = createMockLogger()
    disposePort = registerDatabaseWalSearchIndexWriterPort({
      getStatus: () => ({
        readiness: 'ready',
        admissionPaused: true,
        activeAdmissions: 1,
        pending: 4
      }),
      withPausedAdmission: async () => {
        throw new Error('SEARCH_INDEX_WRITER_ADMISSION_DRAIN_TIMEOUT')
      }
    })
    const maintenance = new DatabaseWalMaintenance({
      getClient: () => ({ execute }) as unknown as Client,
      getWalSizeBytes: async () => 1024,
      getOpenFdCount: async () => 12,
      runWalCheckpoint: async () => undefined,
      reportDatabaseHealth: async () => undefined,
      log
    })

    await maintenance.runWalCheckpoint('PASSIVE')

    expect(execute).not.toHaveBeenCalled()
    expect(log.info).toHaveBeenCalledWith(
      DB_WAL_CHECKPOINT_SKIPPED_BUSY,
      expect.objectContaining({
        meta: expect.objectContaining({
          mode: 'PASSIVE',
          reason: 'search-index-writer-drain-timeout',
          busyQueueDepth: 4,
          busyProcessing: true,
          admissionPaused: true
        })
      })
    )
  })

  it('reports healthy default writer telemetry when unregistered and contention when registered port is backlogged', async () => {
    const reportSpy = vi
      .spyOn(operationalErrorService, 'report')
      .mockReturnValue({} as ReturnType<typeof operationalErrorService.report>)
    const log = createMockLogger()
    const maintenance = new DatabaseWalMaintenance({
      getClient: () => null,
      getWalSizeBytes: async () => 1024,
      getOpenFdCount: async () => 12,
      runWalCheckpoint: async () => undefined,
      reportDatabaseHealth: async () => undefined,
      log
    })

    await maintenance.reportDatabaseHealth('periodic')
    expect(reportSpy).not.toHaveBeenCalled()
    expect(log.info).toHaveBeenCalledWith(
      'Database health snapshot',
      expect.objectContaining({
        meta: expect.objectContaining({
          writerPending: 0,
          writerActive: 0,
          writerAdmissionPaused: false
        })
      })
    )

    disposePort = registerDatabaseWalSearchIndexWriterPort({
      getStatus: () => ({
        readiness: 'ready',
        admissionPaused: false,
        activeAdmissions: 1,
        pending: 25
      }),
      withPausedAdmission: async (_reason, op) =>
        op({ readiness: 'ready', admissionPaused: true, activeAdmissions: 0, pending: 0 })
    })

    await maintenance.reportDatabaseHealth('threshold')
    expect(reportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'database',
        code: 'DATABASE_CONTENTION',
        context: expect.objectContaining({
          writerPending: 25,
          writerActive: 1,
          writerAdmissionPaused: false
        })
      })
    )
  })
})
