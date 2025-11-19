/**
 * Migration Manager Tests
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MigrationManager } from './migration-manager'
import { allMigrations, MigrationRunner } from './migrations'

const TEST_DB_PATH = path.join(__dirname, 'test-migration.db')
const OLD_DB_PATH = path.join(__dirname, 'test-old-downloads.db')
const OLD_CONFIG_PATH = path.join(__dirname, 'test-download-config.json')

describe('migrationManager', () => {
  let migrationManager: MigrationManager

  beforeEach(async () => {
    // Clean up any existing test files
    await cleanupTestFiles()

    migrationManager = new MigrationManager(TEST_DB_PATH)
  })

  afterEach(async () => {
    await cleanupTestFiles()
  })

  it('should detect when migration is not needed', async () => {
    const needed = await migrationManager.needsMigration()
    expect(needed).toBe(false)
  })

  it('should detect when migration is needed', async () => {
    // Create old database
    await createOldDatabase()

    const needed = await migrationManager.needsMigration()
    expect(needed).toBe(true)
  })

  it('should migrate old download tasks', async () => {
    // Create old database with test data
    await createOldDatabase()
    await insertOldTestData()

    const result = await migrationManager.migrate()

    expect(result.success).toBe(true)
    expect(result.migratedTasks).toBeGreaterThan(0)
  })

  it('should emit progress events during migration', async () => {
    await createOldDatabase()

    const progressEvents: any[] = []
    migrationManager.on('progress', (progress) => {
      progressEvents.push(progress)
    })

    await migrationManager.migrate()

    expect(progressEvents.length).toBeGreaterThan(0)
    expect(progressEvents[0]).toHaveProperty('phase')
    expect(progressEvents[0]).toHaveProperty('percentage')
  })

  it('should handle migration errors gracefully', async () => {
    // Create invalid old database
    await fs.writeFile(OLD_DB_PATH, 'invalid data')

    const result = await migrationManager.migrate()

    expect(result.success).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('should not migrate twice', async () => {
    await createOldDatabase()

    // First migration
    const result1 = await migrationManager.migrate()
    expect(result1.success).toBe(true)

    // Second migration should not be needed
    const needed = await migrationManager.needsMigration()
    expect(needed).toBe(false)
  })
})

describe('migrationRunner', () => {
  let migrationRunner: MigrationRunner

  beforeEach(async () => {
    await cleanupTestFiles()
    migrationRunner = new MigrationRunner(TEST_DB_PATH)
  })

  afterEach(async () => {
    await cleanupTestFiles()
  })

  it('should return version 0 for new database', async () => {
    const version = await migrationRunner.getCurrentVersion()
    expect(version).toBe(0)
  })

  it('should run pending migrations', async () => {
    await migrationRunner.runMigrations(allMigrations)

    const version = await migrationRunner.getCurrentVersion()
    expect(version).toBeGreaterThan(0)
  })

  it('should not run already applied migrations', async () => {
    // Run migrations first time
    await migrationRunner.runMigrations(allMigrations)
    const version1 = await migrationRunner.getCurrentVersion()

    // Run migrations second time
    await migrationRunner.runMigrations(allMigrations)
    const version2 = await migrationRunner.getCurrentVersion()

    expect(version1).toBe(version2)
  })

  it('should get list of applied migrations', async () => {
    await migrationRunner.runMigrations(allMigrations)

    const applied = await migrationRunner.getAppliedMigrations()
    expect(applied.length).toBeGreaterThan(0)
    expect(applied[0]).toHaveProperty('version')
    expect(applied[0]).toHaveProperty('name')
    expect(applied[0]).toHaveProperty('appliedAt')
  })

  it('should emit progress events', async () => {
    const progressEvents: any[] = []
    migrationRunner.on('progress', (progress) => {
      progressEvents.push(progress)
    })

    await migrationRunner.runMigrations(allMigrations)

    expect(progressEvents.length).toBeGreaterThan(0)
  })
})

// Helper functions

async function cleanupTestFiles() {
  const files = [TEST_DB_PATH, OLD_DB_PATH, OLD_CONFIG_PATH]

  for (const file of files) {
    try {
      await fs.unlink(file)
    }
    catch {
      // Ignore if file doesn't exist
    }
  }
}

async function createOldDatabase() {
  const client = createClient({ url: `file:${OLD_DB_PATH}` })

  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS downloads (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        path TEXT,
        name TEXT,
        filename TEXT,
        status TEXT,
        size INTEGER,
        downloaded INTEGER,
        createdAt INTEGER,
        completedAt INTEGER,
        error TEXT
      )
    `)
  }
  finally {
    client.close()
  }
}

async function insertOldTestData() {
  const client = createClient({ url: `file:${OLD_DB_PATH}` })

  try {
    await client.execute({
      sql: `INSERT INTO downloads (id, url, filename, status, size, downloaded, createdAt) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'test-1',
        'https://example.com/file1.zip',
        'file1.zip',
        'completed',
        1000000,
        1000000,
        Date.now(),
      ],
    })

    await client.execute({
      sql: `INSERT INTO downloads (id, url, filename, status, size, downloaded, createdAt) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'test-2',
        'https://example.com/file2.zip',
        'file2.zip',
        'pending',
        2000000,
        500000,
        Date.now(),
      ],
    })
  }
  finally {
    client.close()
  }
}
