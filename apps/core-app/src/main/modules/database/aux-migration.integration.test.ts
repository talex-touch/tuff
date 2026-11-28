import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
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

import * as schema from '../../db/schema'
import { scheduleAuxWrite, scheduleDbWrite, setAuxDbResolver } from '../../db/db-write'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import { DatabaseModule } from './index'

describe('DatabaseModule real-SQLite aux migration and fallback re-routing', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    setAuxDbResolver(null)
    await dbWriteScheduler.drain()
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
  })

  it('migrates hot tables including recommendation_exposure_daily with valid PRAGMA coredb.table_info and re-routes queued fallback writes to aux', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-aux-mig-'))
    tempDirs.push(dir)
    const mainDbPath = path.join(dir, 'database.db')
    const auxDbPath = path.join(dir, 'database-aux.db')

    const primaryClient = createClient({ url: `file:${mainDbPath}` })
    const auxClient = createClient({ url: `file:${auxDbPath}` })
    try {
      // Seed primary DB with the same aux table schemas plus sample rows in config & recommendation_exposure_daily.
      const seedModule = new DatabaseModule()
      ;(seedModule as unknown as { auxClient: typeof primaryClient }).auxClient = primaryClient
      await (seedModule as unknown as { ensureAuxTables: () => Promise<void> }).ensureAuxTables()

      await primaryClient.execute({
        sql: `INSERT INTO config (key, value) VALUES (?, ?)`,
        args: ['pre.migration.key', 'from-primary']
      })
      await primaryClient.execute({
        sql: `INSERT INTO recommendation_exposure_daily (day, surface, k, impressions, clicks, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [20261128, 'corebox', 5, 10, 3, 1700000000]
      })

      const primaryDb = drizzle(primaryClient, { schema })
      const auxDb = drizzle(auxClient, { schema })

      const module = new DatabaseModule()
      const internals = module as unknown as {
        client: typeof primaryClient
        db: typeof primaryDb
        auxClient: typeof auxClient
        auxDb: typeof auxDb | null
        auxInitialized: boolean
        mainDbPath: string
        auxDbPath: string
        ensureAuxTables: () => Promise<void>
        migrateHotTablesToAux: () => Promise<void>
      }
      internals.client = primaryClient
      internals.db = primaryDb
      internals.auxClient = auxClient
      internals.auxDb = null
      internals.auxInitialized = false
      internals.mainDbPath = mainDbPath
      internals.auxDbPath = auxDbPath

      await internals.ensureAuxTables()

      setAuxDbResolver(() => ({
        db: module.getAuxDb(),
        isAux: module.isAuxReady()
      }))

      // Block primary lane briefly so a lower-priority fallback aux write is queued BEFORE
      // critical-priority `database.aux.migrate` overtakes it.
      let releaseBlocker!: () => void
      const blockerGate = new Promise<void>((resolve) => {
        releaseBlocker = resolve
      })
      const blocker = scheduleDbWrite(
        'test.primary-blocker',
        async () => {
          await blockerGate
        },
        { lane: 'primary', priority: 'critical' }
      )

      const fallbackWrite = scheduleAuxWrite(
        'test.fallback-aux-write',
        async (targetDb) => {
          await targetDb
            .insert(schema.config)
            .values({ key: 'queued.during.startup', value: 'must-land-in-aux' })
            .onConflictDoUpdate({
              target: schema.config.key,
              set: { value: 'must-land-in-aux' }
            })
        },
        { priority: 'best_effort' }
      )

      const migrationTask = scheduleDbWrite(
        'database.aux.migrate',
        async () => {
          await internals.migrateHotTablesToAux()
          internals.auxDb = auxDb
          internals.auxInitialized = true
        },
        { lane: 'primary', priority: 'critical' }
      )

      releaseBlocker()
      await Promise.all([blocker, migrationTask, fallbackWrite])

      // Verify pre-migration rows copied into aux (proving PRAGMA coredb.table_info succeeded on real SQLite).
      const copiedExposure = await auxClient.execute(
        `SELECT day, surface, k, impressions, clicks FROM recommendation_exposure_daily`
      )
      expect(copiedExposure.rows).toHaveLength(1)
      expect(copiedExposure.rows[0]).toMatchObject({
        day: 20261128,
        surface: 'corebox',
        k: 5,
        impressions: 10,
        clicks: 3
      })

      const copiedConfig = await auxClient.execute(
        `SELECT key, value FROM config WHERE key IN ('pre.migration.key', 'queued.during.startup') ORDER BY key`
      )
      expect(copiedConfig.rows).toEqual([
        expect.objectContaining({ key: 'pre.migration.key', value: 'from-primary' }),
        expect.objectContaining({ key: 'queued.during.startup', value: 'must-land-in-aux' })
      ])

      // Verify the overtaken fallback write was NOT orphaned in primary database.db.
      const orphanedPrimary = await primaryClient.execute(
        `SELECT key FROM config WHERE key = 'queued.during.startup'`
      )
      expect(orphanedPrimary.rows).toHaveLength(0)
    } finally {
      primaryClient.close()
      auxClient.close()
    }
  })
})
