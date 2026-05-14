import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fileProviderBusyMock, dbLogMock } = vi.hoisted(() => ({
  fileProviderBusyMock: vi.fn(() => false),
  dbLogMock: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('@libsql/client', () => ({
  createClient: vi.fn()
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
    getAppPath: vi.fn(() => '/tmp/app'),
    getPath: vi.fn(() => '/tmp/userData')
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(),
    getAllWindows: vi.fn(() => [])
  },
  dialog: {
    showMessageBox: vi.fn()
  }
}))

vi.mock('../../../../resources/db/locator.json?commonjs-external&asset', () => ({
  default: '/tmp/resources/db/locator.json'
}))

vi.mock('../box-tool/addon/files/file-provider', () => ({
  fileProvider: {
    isSearchIndexWorkerBusy: fileProviderBusyMock
  }
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
