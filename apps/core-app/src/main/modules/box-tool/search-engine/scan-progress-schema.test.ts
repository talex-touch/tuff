import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  normalizeScanProgressSourceId,
  planScanProgressSourceScopeMigration,
  resolveScanProgressSchemaShape,
  runScanProgressSourceScopeMigration,
  upsertSourceScopedScanProgress
} from './scan-progress-schema'

describe('scan progress schema helpers', () => {
  it('detects path-only and source-scoped scan_progress schemas', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tuff-scan-progress-shape-'))
    try {
      const client = createClient({ url: `file:${join(dir, 'shape.sqlite')}` })
      const db = drizzle(client)
      await client.execute(
        'CREATE TABLE scan_progress (path text PRIMARY KEY, last_scanned integer NOT NULL)'
      )
      await expect(resolveScanProgressSchemaShape(db)).resolves.toEqual({
        tableExists: true,
        sourceScoped: false,
        sourceIdColumn: false,
        primaryKeyColumns: ['path']
      })

      await client.execute('DROP TABLE scan_progress')
      await client.execute(`
        CREATE TABLE scan_progress (
          source_id text NOT NULL,
          path text NOT NULL,
          last_scanned integer NOT NULL,
          PRIMARY KEY(source_id, path)
        )
      `)
      await expect(resolveScanProgressSchemaShape(db)).resolves.toEqual({
        tableExists: true,
        sourceScoped: true,
        sourceIdColumn: true,
        primaryKeyColumns: ['source_id', 'path']
      })
      client.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('upserts source-scoped scan progress without touching other sources', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tuff-scan-progress-upsert-'))
    try {
      const client = createClient({ url: `file:${join(dir, 'upsert.sqlite')}` })
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
        sql: 'INSERT INTO scan_progress(source_id, path, last_scanned) VALUES (?, ?, ?)',
        args: ['other-provider', '/a', 1]
      })

      await upsertSourceScopedScanProgress(db, {
        sourceId: 'file-provider',
        paths: ['/a', '/b'],
        lastScannedAt: 2
      })

      const rows = await client.execute(
        'SELECT source_id AS sourceId, path, last_scanned AS lastScanned FROM scan_progress ORDER BY source_id, path'
      )
      expect(rows.rows).toEqual([
        { sourceId: 'file-provider', path: '/a', lastScanned: 2 },
        { sourceId: 'file-provider', path: '/b', lastScanned: 2 },
        { sourceId: 'other-provider', path: '/a', lastScanned: 1 }
      ])
      client.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('normalizes missing source ids to the file provider scope', () => {
    expect(normalizeScanProgressSourceId(undefined)).toBe('file-provider')
    expect(normalizeScanProgressSourceId('')).toBe('file-provider')
    expect(normalizeScanProgressSourceId('bookmarks')).toBe('bookmarks')
  })

  it('plans and executes a path-only to source-scoped migration with a backup table', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tuff-scan-progress-migrate-'))
    try {
      const client = createClient({ url: `file:${join(dir, 'migrate.sqlite')}` })
      const db = drizzle(client)
      await client.execute(
        'CREATE TABLE scan_progress (path text PRIMARY KEY, last_scanned integer NOT NULL)'
      )
      await client.execute({
        sql: 'INSERT INTO scan_progress(path, last_scanned) VALUES (?, ?), (?, ?)',
        args: ['/a', 1, '/b', 2]
      })

      await expect(planScanProgressSourceScopeMigration(db)).resolves.toMatchObject({
        status: 'ready',
        sourceId: 'file-provider',
        mode: 'read-only',
        destructiveActions: false,
        requiresApproval: true,
        requiresSchemaChange: true,
        requiresDataRewrite: true,
        tableExists: true,
        sourceScoped: false,
        primaryKeyColumns: ['path'],
        existingRows: 2,
        rowsToMigrate: 2,
        blockers: []
      })

      await expect(runScanProgressSourceScopeMigration(db)).resolves.toMatchObject({
        executed: true,
        migratedRows: 2,
        backupTable: 'scan_progress_path_only_backup'
      })
      await expect(resolveScanProgressSchemaShape(db)).resolves.toEqual({
        tableExists: true,
        sourceScoped: true,
        sourceIdColumn: true,
        primaryKeyColumns: ['source_id', 'path']
      })

      const rows = await client.execute(
        'SELECT source_id AS sourceId, path, last_scanned AS lastScanned FROM scan_progress ORDER BY path'
      )
      expect(rows.rows).toEqual([
        { sourceId: 'file-provider', path: '/a', lastScanned: 1 },
        { sourceId: 'file-provider', path: '/b', lastScanned: 2 }
      ])

      const backupRows = await client.execute(
        'SELECT path, last_scanned AS lastScanned FROM scan_progress_path_only_backup ORDER BY path'
      )
      expect(backupRows.rows).toEqual([
        { path: '/a', lastScanned: 1 },
        { path: '/b', lastScanned: 2 }
      ])

      await expect(planScanProgressSourceScopeMigration(db)).resolves.toMatchObject({
        status: 'not-needed',
        sourceScoped: true,
        rowsToMigrate: 0
      })
      client.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('blocks migration when path-only rows are unsafe', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tuff-scan-progress-blocked-'))
    try {
      const client = createClient({ url: `file:${join(dir, 'blocked.sqlite')}` })
      const db = drizzle(client)
      await client.execute(
        'CREATE TABLE scan_progress (path text PRIMARY KEY, last_scanned integer)'
      )
      await client.execute({
        sql: 'INSERT INTO scan_progress(path, last_scanned) VALUES (?, ?), (?, ?)',
        args: ['', 1, '/invalid', -1]
      })

      await expect(planScanProgressSourceScopeMigration(db)).resolves.toMatchObject({
        status: 'blocked',
        blankPathRows: 1,
        invalidTimestampRows: 1,
        blockers: expect.arrayContaining([
          'scan_progress blank path rows',
          'scan_progress invalid timestamp rows'
        ])
      })
      await expect(runScanProgressSourceScopeMigration(db)).resolves.toMatchObject({
        executed: false,
        migratedRows: 0,
        backupTable: null
      })
      await expect(resolveScanProgressSchemaShape(db)).resolves.toMatchObject({
        sourceScoped: false,
        primaryKeyColumns: ['path']
      })
      client.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('creates a source-scoped scan_progress table for new databases', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tuff-scan-progress-new-'))
    try {
      const client = createClient({ url: `file:${join(dir, 'new.sqlite')}` })
      const db = drizzle(client)

      await expect(planScanProgressSourceScopeMigration(db)).resolves.toMatchObject({
        status: 'ready',
        tableExists: false,
        existingRows: 0,
        rowsToMigrate: 0
      })
      await expect(
        runScanProgressSourceScopeMigration(db, { sourceId: 'bookmarks' })
      ).resolves.toMatchObject({
        executed: true,
        migratedRows: 0,
        backupTable: null
      })
      await expect(resolveScanProgressSchemaShape(db)).resolves.toEqual({
        tableExists: true,
        sourceScoped: true,
        sourceIdColumn: true,
        primaryKeyColumns: ['source_id', 'path']
      })
      client.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
