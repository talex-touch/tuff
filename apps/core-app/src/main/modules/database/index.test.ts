import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { dbLogMock, scanProgressMigrationMocks, searchIndexWriterMocks } = vi.hoisted(() => ({
  dbLogMock: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  scanProgressMigrationMocks: {
    plan: vi.fn(),
    run: vi.fn()
  },
  searchIndexWriterMocks: {
    getStatus: vi.fn(),
    withPausedAdmission: vi.fn()
  }
}))

vi.mock('@libsql/client', () => ({
  createClient: vi.fn(() => ({
    execute: vi.fn(async () => ({ rows: [] })),
    close: vi.fn()
  }))
}))

vi.mock('drizzle-orm/libsql', () => ({
  drizzle: vi.fn((client) => ({ client }))
}))

vi.mock('drizzle-orm/libsql/migrator', () => ({
  migrate: vi.fn()
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: vi.fn(() => dbLogMock)
}))

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  pollingService: {
    register: vi.fn(),
    unregister: vi.fn()
  }
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: vi.fn(() => '/tmp/tuff-app'),
    getPath: vi.fn(() => '/tmp/tuff-user-data')
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
    getAllWindows: vi.fn(() => [])
  },
  dialog: {
    showMessageBox: vi.fn()
  }
}))

vi.mock('../../../../resources/db/locator.json?commonjs-external&asset', () => ({
  default: '/tmp/db/locator.json'
}))

vi.mock('../../db/scan-progress-schema', () => ({
  planScanProgressSourceScopeMigration: scanProgressMigrationMocks.plan,
  runScanProgressSourceScopeMigration: scanProgressMigrationMocks.run
}))

import { pollingService } from '@talex-touch/utils/common/utils/polling'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import { registerDatabaseWalSearchIndexWriterPort } from './database-ports'
import { DatabaseModule } from './index'

function createModule(client: {
  execute: ReturnType<typeof vi.fn>
  executeMultiple?: ReturnType<typeof vi.fn>
}): DatabaseModule {
  const module = new DatabaseModule()
  ;(module as unknown as { client: typeof client; mainDbPath: string }).client = client
  ;(module as unknown as { client: typeof client; mainDbPath: string }).mainDbPath =
    'C:/tmp/database.db'
  return module
}

async function runWalCheckpoint(
  module: DatabaseModule,
  mode: 'PASSIVE' | 'TRUNCATE'
): Promise<void> {
  await (
    module as unknown as {
      runWalCheckpoint: (mode: 'PASSIVE' | 'TRUNCATE') => Promise<void>
    }
  ).runWalCheckpoint(mode)
}

describe('DatabaseModule background startup tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps primary database available while aux database initializes in background', async () => {
    const module = new DatabaseModule()
    const target = module as unknown as {
      db: unknown
      auxDb: unknown
      auxInitialized: boolean
      scheduleBackgroundStartupTasks: (databaseDirPath: string) => void
      initAuxDatabase: (databaseDirPath: string) => Promise<void>
      registerWalMaintenanceTasks: () => void
      reportDatabaseHealth: (source: 'threshold' | 'periodic') => Promise<void>
      backgroundStartupPromise: Promise<void> | null
      getAuxDb: () => unknown
    }
    const primaryDb = { id: 'primary' }
    const auxDb = { id: 'aux' }

    target.db = primaryDb
    target.auxDb = null
    target.auxInitialized = false
    target.initAuxDatabase = vi.fn(async () => {
      target.auxDb = auxDb
      target.auxInitialized = true
    })
    target.registerWalMaintenanceTasks = vi.fn()
    target.reportDatabaseHealth = vi.fn(async () => undefined)

    target.scheduleBackgroundStartupTasks('/tmp/tuff-db')

    expect(target.getAuxDb()).toBe(primaryDb)

    await target.backgroundStartupPromise

    expect(target.getAuxDb()).toBe(auxDb)
    expect(target.registerWalMaintenanceTasks).toHaveBeenCalledTimes(1)
    expect(target.reportDatabaseHealth).toHaveBeenCalledWith('threshold')
  })

  it('upgrades the auxiliary Clipboard column before creating owner indexes', async () => {
    const execute = vi.fn(async (_statement: unknown) => ({ rows: [] }))
    const module = new DatabaseModule()
    const target = module as unknown as {
      auxClient: { execute: typeof execute }
      ensureAuxTables: () => Promise<void>
    }
    target.auxClient = { execute }

    await target.ensureAuxTables()

    const statements = execute.mock.calls.map(([statement]) => String(statement))
    const alterIndex = statements.findIndex((statement) =>
      statement.includes('ALTER TABLE clipboard_history ADD COLUMN retention_protected')
    )
    const clipboardIndex = statements.findIndex((statement) =>
      statement.includes('CREATE INDEX IF NOT EXISTS clipboard_history_retention_idx')
    )
    expect(alterIndex).toBeGreaterThan(-1)
    expect(clipboardIndex).toBeGreaterThan(alterIndex)
    expect(statements.join('\n')).toContain('ocr_jobs_retention_idx')
    expect(statements.join('\n')).toContain('analytics_snapshots_retention_idx')
    expect(statements.join('\n')).toContain('recommendation_cache_retention_idx')
  })
  it('creates voice recognition records and indexes in the auxiliary database', async () => {
    const execute = vi.fn(async (_statement: unknown) => ({ rows: [] }))
    const module = new DatabaseModule()
    const target = module as unknown as {
      auxClient: { execute: typeof execute }
      ensureAuxTables: () => Promise<void>
    }
    target.auxClient = { execute }

    await target.ensureAuxTables()

    const statements = execute.mock.calls.map(([statement]) => String(statement))
    const create = statements.find((statement) =>
      statement.includes('CREATE TABLE IF NOT EXISTS voice_recognition_records')
    )
    expect(create).toContain('id text PRIMARY KEY NOT NULL')
    expect(create).toContain('captured_at integer NOT NULL')
    expect(create).toContain('status text NOT NULL')
    expect(create).toContain('provider_latency_ms integer')
    expect(create).toContain('recognition_location text')

    expect(statements).toContain(
      'CREATE INDEX IF NOT EXISTS idx_voice_recognition_records_captured_at ON voice_recognition_records (captured_at)'
    )
    expect(statements).toContain(
      'CREATE INDEX IF NOT EXISTS idx_voice_recognition_records_status ON voice_recognition_records (status)'
    )
    // An aux database that already has the table is where the CREATE above is a no-op, so the
    // guarded upgrade is the only thing that gives it the column.
    expect(statements.join('\n')).toContain(
      'ALTER TABLE voice_recognition_records ADD COLUMN provider_latency_ms integer'
    )
    expect(statements.join('\n')).toContain(
      'ALTER TABLE voice_recognition_records ADD COLUMN recognition_location text'
    )
  })
})

describe('DatabaseModule WAL checkpoint maintenance', () => {
  let disposeWriterPort: (() => void) | null = null

  beforeEach(async () => {
    await dbWriteScheduler.drain()
    vi.clearAllMocks()
    disposeWriterPort = registerDatabaseWalSearchIndexWriterPort({
      getStatus: searchIndexWriterMocks.getStatus,
      withPausedAdmission: searchIndexWriterMocks.withPausedAdmission
    })
    searchIndexWriterMocks.getStatus.mockReturnValue({
      readiness: 'ready',
      admissionPaused: true,
      activeAdmissions: 0,
      pending: 0
    })
    searchIndexWriterMocks.withPausedAdmission.mockImplementation(async (_reason, operation) =>
      operation({
        readiness: 'ready',
        admissionPaused: true,
        activeAdmissions: 0,
        pending: 0
      })
    )
  })

  afterEach(() => {
    disposeWriterPort?.()
    disposeWriterPort = null
  })

  it('skips checkpoint when the writer is not quiescent', async () => {
    searchIndexWriterMocks.withPausedAdmission.mockImplementation(async (_reason, operation) =>
      operation({
        readiness: 'ready',
        admissionPaused: true,
        activeAdmissions: 0,
        pending: 1
      })
    )
    const client = {
      execute: vi.fn(async () => ({ rows: [{ busy: 0, log: 1, checkpointed: 1 }] }))
    }
    const module = createModule(client)

    await runWalCheckpoint(module, 'PASSIVE')

    expect(client.execute).not.toHaveBeenCalled()
    expect(dbLogMock.info).toHaveBeenCalledWith(
      'DB_WAL_CHECKPOINT_SKIPPED_BUSY',
      expect.objectContaining({
        meta: expect.objectContaining({
          mode: 'PASSIVE',
          reason: 'search-index-writer-not-quiescent',
          busyQueueDepth: 1,
          busyProcessing: false,
          admissionPaused: true
        })
      })
    )
  })

  it('runs checkpoint after pausing and draining writer admission', async () => {
    const order: string[] = []
    searchIndexWriterMocks.withPausedAdmission.mockImplementation(async (_reason, operation) => {
      order.push('writer-admission-paused-and-drained')
      return operation({
        readiness: 'ready',
        admissionPaused: true,
        activeAdmissions: 0,
        pending: 0
      })
    })
    searchIndexWriterMocks.getStatus.mockImplementation(() => {
      order.push('writer-quiescence-rechecked')
      return {
        readiness: 'ready',
        admissionPaused: true,
        activeAdmissions: 0,
        pending: 0
      }
    })
    const client = {
      execute: vi.fn(async (statement: string) => {
        order.push(statement)
        return { rows: [{ busy: 0, log: 2, checkpointed: 2 }] }
      })
    }
    const module = createModule(client)

    await runWalCheckpoint(module, 'PASSIVE')

    expect(searchIndexWriterMocks.withPausedAdmission).toHaveBeenCalledWith(
      'database.wal-checkpoint.passive',
      expect.any(Function),
      expect.any(Number)
    )
    expect(order).toEqual([
      'writer-admission-paused-and-drained',
      'writer-quiescence-rechecked',
      'PRAGMA wal_checkpoint(PASSIVE)'
    ])
    expect(client.execute).toHaveBeenCalledWith('PRAGMA wal_checkpoint(PASSIVE)')
    expect(dbLogMock.info).toHaveBeenCalledWith(
      'WAL checkpoint PASSIVE complete',
      expect.objectContaining({
        meta: expect.objectContaining({
          mode: 'PASSIVE',
          logFrames: 2,
          checkpointedFrames: 2
        })
      })
    )
  })

  it('skips periodic WAL TRUNCATE when WAL file is below 16 MiB threshold', async () => {
    const client = {
      execute: vi.fn(async () => ({ rows: [{ busy: 0, log: 1, checkpointed: 1 }] }))
    }
    const module = createModule(client)
    const internals = module as unknown as {
      registerWalMaintenanceTasks: () => void
      getWalSizeBytes: () => Promise<number>
      runWalCheckpoint: (mode: 'PASSIVE' | 'TRUNCATE') => Promise<void>
    }
    internals.getWalSizeBytes = vi.fn(async () => 4 * 1024 * 1024)
    const checkpointSpy = vi.spyOn(internals, 'runWalCheckpoint').mockResolvedValue(undefined)

    internals.registerWalMaintenanceTasks()
    const truncateCall = vi
      .mocked(pollingService.register)
      .mock.calls.find(([id]) => id === 'database_wal_checkpoint_truncate')
    expect(truncateCall).toBeDefined()
    await (truncateCall?.[1] as () => Promise<void>)()
    expect(checkpointSpy).not.toHaveBeenCalled()

    internals.getWalSizeBytes = vi.fn(async () => 20 * 1024 * 1024)
    await (truncateCall?.[1] as () => Promise<void>)()
    expect(checkpointSpy).toHaveBeenCalledWith('TRUNCATE')
  })

  it('runs bounded PRAGMA incremental_vacuum(256) before WAL TRUNCATE when auto_vacuum=2 and freelist>=256', async () => {
    const order: string[] = []
    const execute = vi.fn(async (statement: string) => {
      order.push(statement)
      if (statement === 'PRAGMA auto_vacuum') {
        return { rows: [{ auto_vacuum: 2 }] }
      }
      if (statement === 'PRAGMA freelist_count') {
        return { rows: [{ freelist_count: 400 }] }
      }
      return { rows: [{ busy: 0, log: 3, checkpointed: 3 }] }
    })
    const executeMultiple = vi.fn(async (statement: string) => {
      order.push(statement)
    })
    const module = createModule({ execute, executeMultiple })

    await runWalCheckpoint(module, 'TRUNCATE')

    expect(order).toEqual([
      'PRAGMA auto_vacuum',
      'PRAGMA freelist_count',
      'PRAGMA incremental_vacuum(256);',
      'PRAGMA wal_checkpoint(TRUNCATE)'
    ])
    expect(dbLogMock.info).toHaveBeenCalledWith(
      'WAL checkpoint TRUNCATE complete',
      expect.objectContaining({
        meta: expect.objectContaining({
          mode: 'TRUNCATE',
          reclaimedFreePages: 256
        })
      })
    )
  })

  it('skips PRAGMA incremental_vacuum before WAL TRUNCATE when freelist is below 256 pages', async () => {
    const execute = vi.fn(async (statement: string) => {
      if (statement === 'PRAGMA auto_vacuum') {
        return { rows: [{ auto_vacuum: 2 }] }
      }
      if (statement === 'PRAGMA freelist_count') {
        return { rows: [{ freelist_count: 120 }] }
      }
      return { rows: [{ busy: 0, log: 2, checkpointed: 2 }] }
    })
    const executeMultiple = vi.fn(async () => undefined)
    const module = createModule({ execute, executeMultiple })

    await runWalCheckpoint(module, 'TRUNCATE')

    expect(executeMultiple).not.toHaveBeenCalled()
    expect(execute).toHaveBeenCalledWith('PRAGMA wal_checkpoint(TRUNCATE)')
  })

  it('reclaimFreePages runs incremental_vacuum through dbWriteScheduler when pages are free', async () => {
    const execute = vi.fn(async (statement: string) => {
      if (statement === 'PRAGMA auto_vacuum') {
        return { rows: [{ auto_vacuum: 2 }] }
      }
      if (statement === 'PRAGMA freelist_count') {
        return { rows: [{ freelist_count: 90 }] }
      }
      return { rows: [] }
    })
    const executeMultiple = vi.fn(async () => undefined)
    const module = createModule({ execute, executeMultiple })

    const reclaimed = await module.reclaimFreePages(64)

    expect(reclaimed).toBe(64)
    expect(executeMultiple).toHaveBeenCalledWith('PRAGMA incremental_vacuum(64);')
  })
})

describe('DatabaseModule scan_progress source-scope startup migration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    scanProgressMigrationMocks.plan.mockReset()
    scanProgressMigrationMocks.run.mockReset()
  })

  function createMigrationModule() {
    const module = new DatabaseModule()
    const db = { id: 'primary-db' }
    ;(module as unknown as { db: unknown }).db = db
    return { module, db }
  }

  it('runs the controlled scan_progress migration when the plan is ready', async () => {
    const { module, db } = createMigrationModule()
    scanProgressMigrationMocks.plan.mockResolvedValue({
      status: 'ready',
      sourceId: 'file-provider',
      primaryKeyColumns: ['path'],
      existingRows: 2,
      blankPathRows: 0,
      invalidTimestampRows: 0,
      duplicatePathRows: 0,
      blockers: []
    })
    scanProgressMigrationMocks.run.mockResolvedValue({
      executed: true,
      migratedRows: 2,
      backupTable: 'scan_progress_path_only_backup',
      plan: { sourceId: 'file-provider' }
    })

    await (
      module as unknown as {
        ensureScanProgressSourceScopeMigration: () => Promise<void>
      }
    ).ensureScanProgressSourceScopeMigration()

    expect(scanProgressMigrationMocks.plan).toHaveBeenCalledWith(db, { sourceId: 'file-provider' })
    expect(scanProgressMigrationMocks.run).toHaveBeenCalledWith(db, { sourceId: 'file-provider' })
    expect(dbLogMock.info).toHaveBeenCalledWith(
      'scan_progress source-scope migration completed',
      expect.objectContaining({
        meta: expect.objectContaining({
          executed: true,
          migratedRows: 2,
          backupTable: 'scan_progress_path_only_backup',
          sourceId: 'file-provider'
        })
      })
    )
  })

  it('keeps compatibility mode when scan_progress migration is blocked', async () => {
    const { module, db } = createMigrationModule()
    scanProgressMigrationMocks.plan.mockResolvedValue({
      status: 'blocked',
      sourceId: 'file-provider',
      primaryKeyColumns: ['path'],
      existingRows: 1,
      blankPathRows: 1,
      invalidTimestampRows: 0,
      duplicatePathRows: 0,
      blockers: ['scan_progress blank path rows']
    })

    await (
      module as unknown as {
        ensureScanProgressSourceScopeMigration: () => Promise<void>
      }
    ).ensureScanProgressSourceScopeMigration()

    expect(scanProgressMigrationMocks.plan).toHaveBeenCalledWith(db, { sourceId: 'file-provider' })
    expect(scanProgressMigrationMocks.run).not.toHaveBeenCalled()
    expect(dbLogMock.warn).toHaveBeenCalledWith(
      'scan_progress source-scope migration blocked; keeping compatibility mode',
      expect.objectContaining({
        meta: expect.objectContaining({
          blockers: ['scan_progress blank path rows'],
          blankPathRows: 1
        })
      })
    )
  })
})

describe('DatabaseModule aux WAL checkpointing and shutdown teardown', () => {
  beforeEach(async () => {
    await dbWriteScheduler.drain()
    vi.clearAllMocks()
  })

  it('checkpoints auxClient alongside primary client during PASSIVE WAL maintenance', async () => {
    const primaryExecute = vi.fn(async () => ({ rows: [{ busy: 0, log: 1, checkpointed: 1 }] }))
    const auxExecute = vi.fn(async () => ({ rows: [{ busy: 0, log: 2, checkpointed: 2 }] }))
    const module = createModule({ execute: primaryExecute })
    ;(module as unknown as { auxClient: { execute: typeof auxExecute } }).auxClient = {
      execute: auxExecute
    }

    await runWalCheckpoint(module, 'PASSIVE')

    expect(auxExecute).toHaveBeenCalledWith('PRAGMA wal_checkpoint(PASSIVE)')
    expect(primaryExecute).toHaveBeenCalledWith('PRAGMA wal_checkpoint(PASSIVE)')
  })

  it('gates aux and primary periodic WAL TRUNCATE independently', async () => {
    const primaryExecute = vi.fn(async () => ({ rows: [{ busy: 0, log: 1, checkpointed: 1 }] }))
    const auxExecute = vi.fn(async () => ({ rows: [{ busy: 0, log: 2, checkpointed: 2 }] }))
    const module = createModule({ execute: primaryExecute })
    const internals = module as unknown as {
      auxClient: { execute: typeof auxExecute }
      registerWalMaintenanceTasks: () => void
      getWalSizeBytes: () => Promise<number>
      getAuxWalSizeBytes: () => Promise<number>
      runWalCheckpoint: (mode: 'PASSIVE' | 'TRUNCATE') => Promise<void>
    }
    internals.auxClient = { execute: auxExecute }
    internals.getWalSizeBytes = vi.fn(async () => 2 * 1024 * 1024)
    internals.getAuxWalSizeBytes = vi.fn(async () => 20 * 1024 * 1024)
    const primaryCheckpointSpy = vi
      .spyOn(internals, 'runWalCheckpoint')
      .mockResolvedValue(undefined)

    internals.registerWalMaintenanceTasks()
    const truncateCall = vi
      .mocked(pollingService.register)
      .mock.calls.find(([id]) => id === 'database_wal_checkpoint_truncate')
    expect(truncateCall).toBeDefined()

    // Large aux WAL with small primary WAL checkpoints aux WITHOUT triggering primary TRUNCATE.
    await (truncateCall?.[1] as () => Promise<void>)()
    expect(auxExecute).toHaveBeenCalledWith('PRAGMA wal_checkpoint(TRUNCATE)')
    expect(primaryCheckpointSpy).not.toHaveBeenCalled()

    // Large aux WAL still checkpoints even while the primary lane has >2 queued writes.
    auxExecute.mockClear()
    const statsSpy = vi.spyOn(dbWriteScheduler, 'getStats').mockReturnValue({
      queued: 5,
      processing: true,
      currentTaskLabel: 'primary.heavy',
      currentTaskPriority: 'background',
      lanes: {
        primary: {
          queued: 5,
          processing: true,
          currentTaskLabel: 'primary.heavy',
          currentTaskPriority: 'background'
        },
        aux: {
          queued: 0,
          processing: false,
          currentTaskLabel: null,
          currentTaskPriority: null
        }
      }
    })
    try {
      await (truncateCall?.[1] as () => Promise<void>)()
      expect(auxExecute).toHaveBeenCalledWith('PRAGMA wal_checkpoint(TRUNCATE)')
      expect(primaryCheckpointSpy).not.toHaveBeenCalled()
    } finally {
      statsSpy.mockRestore()
    }
  })

  it('checkpoints and closes both primary and aux clients and clears handles on onDestroy', async () => {
    const primaryClient = {
      execute: vi.fn(async () => ({ rows: [] })),
      close: vi.fn()
    }
    const auxClient = {
      execute: vi.fn(async () => ({ rows: [] })),
      close: vi.fn()
    }
    const searchClient = {
      execute: vi.fn(async () => ({ rows: [] })),
      close: vi.fn()
    }
    const module = new DatabaseModule()
    const internals = module as unknown as {
      client: typeof primaryClient | null
      auxClient: typeof auxClient | null
      searchClient: typeof searchClient | null
      db: unknown
      auxDb: unknown
      auxInitialized: boolean
      searchDb: unknown
      searchInitialized: boolean
    }
    internals.client = primaryClient
    internals.auxClient = auxClient
    internals.searchClient = searchClient
    internals.db = { id: 'primary' }
    internals.auxDb = { id: 'aux' }
    internals.auxInitialized = true
    internals.searchDb = { id: 'search' }
    internals.searchInitialized = true

    await module.onDestroy()

    expect(primaryClient.execute).toHaveBeenCalledWith('PRAGMA wal_checkpoint(TRUNCATE)')
    expect(auxClient.execute).toHaveBeenCalledWith('PRAGMA wal_checkpoint(TRUNCATE)')
    expect(primaryClient.close).toHaveBeenCalledTimes(1)
    expect(auxClient.close).toHaveBeenCalledTimes(1)
    expect(searchClient.close).toHaveBeenCalledTimes(1)
    expect(module.getClient()).toBeNull()
    expect(module.getAuxClient()).toBeNull()
    expect(module.isAuxReady()).toBe(false)
    expect(module.isSearchDbReady()).toBe(false)
  })
})
