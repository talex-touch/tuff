import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fileProviderBusyMock, dbLogMock, scanProgressMigrationMocks } = vi.hoisted(() => ({
  fileProviderBusyMock: vi.fn(() => false),
  dbLogMock: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  scanProgressMigrationMocks: {
    plan: vi.fn(),
    run: vi.fn()
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

vi.mock('../box-tool/addon/files/file-provider', () => ({
  fileProvider: {
    isSearchIndexWorkerBusy: fileProviderBusyMock
  }
}))

vi.mock('../box-tool/search-engine/scan-progress-schema', () => ({
  planScanProgressSourceScopeMigration: scanProgressMigrationMocks.plan,
  runScanProgressSourceScopeMigration: scanProgressMigrationMocks.run
}))

import { dbWriteScheduler } from '../../db/db-write-scheduler'
import { DatabaseModule } from './index'

function createModule(client: { execute: ReturnType<typeof vi.fn> }): DatabaseModule {
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
    fileProviderBusyMock.mockReturnValue(false)
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
})

describe('DatabaseModule WAL checkpoint maintenance', () => {
  beforeEach(async () => {
    await dbWriteScheduler.drain()
    vi.clearAllMocks()
    fileProviderBusyMock.mockReturnValue(false)
  })

  it('skips checkpoint when search index worker is busy', async () => {
    fileProviderBusyMock.mockReturnValue(true)
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
          reason: 'search-index-worker'
        })
      })
    )
  })

  it('runs checkpoint through the maintenance queue when idle', async () => {
    const client = {
      execute: vi.fn(async () => ({ rows: [{ busy: 0, log: 2, checkpointed: 2 }] }))
    }
    const module = createModule(client)

    await runWalCheckpoint(module, 'PASSIVE')

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
