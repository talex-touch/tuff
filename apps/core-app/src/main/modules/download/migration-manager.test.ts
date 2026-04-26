/**
 * Download migration runner tests
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, MigrationRunner } from './migrations'

type MigrationProgressEvent = {
  version: number
  name: string
  progress: number
}

vi.mock('electron', () => ({
  app: {
    getPath(name: string) {
      switch (name) {
        case 'userData':
        case 'downloads':
        case 'temp':
        case 'exe':
        default:
          return __dirname
      }
    }
  }
}))

const TEST_DB_PATH = path.join(__dirname, 'test-migration.db')

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
    const progressEvents: MigrationProgressEvent[] = []
    migrationRunner.on('progress', (progress) => {
      progressEvents.push(progress)
    })

    await migrationRunner.runMigrations(allMigrations)

    expect(progressEvents.length).toBeGreaterThan(0)
  })
})

// Helper functions

async function cleanupTestFiles() {
  const files = [TEST_DB_PATH]

  for (const file of files) {
    try {
      await fs.unlink(file)
    } catch {
      // Ignore if file doesn't exist
    }
  }
}
