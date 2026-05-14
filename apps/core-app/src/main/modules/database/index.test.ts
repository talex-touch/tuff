import { beforeEach, describe, expect, it, vi } from 'vitest'

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

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  pollingService: {
    register: vi.fn(),
    unregister: vi.fn()
  }
}))

vi.mock('../../db/db-write-scheduler', () => ({
  dbWriteScheduler: {
    getStats: vi.fn(() => ({ queued: 0 }))
  }
}))

vi.mock('../../db/runtime-flags', () => ({
  DB_AUX_ENABLED: true
}))

vi.mock('../../../../resources/db/locator.json?commonjs-external&asset', () => ({
  default: '/tmp/db/locator.json'
}))

import { DatabaseModule } from './index'

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
})
