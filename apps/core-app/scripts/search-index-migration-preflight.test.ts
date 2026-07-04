import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '../../..')
const scriptPath = path.join(__dirname, 'search-index-migration-preflight.ts')

async function createMinimalSearchIndexDb(dbPath: string): Promise<void> {
  const client = createClient({ url: `file:${dbPath}` })
  try {
    await client.execute('CREATE TABLE files (id TEXT PRIMARY KEY)')
    await client.execute(
      'CREATE TABLE scan_progress (path TEXT PRIMARY KEY, last_scanned INTEGER NOT NULL)'
    )
    await client.execute(
      'CREATE TABLE search_index (provider TEXT NOT NULL, item_id TEXT NOT NULL)'
    )
    await client.execute(
      'CREATE TABLE search_index_meta (provider_id TEXT NOT NULL, item_id TEXT NOT NULL)'
    )
    await client.execute(
      'CREATE TABLE keyword_mappings (provider_id TEXT NOT NULL, item_id TEXT NOT NULL)'
    )
  } finally {
    client.close()
  }
}

describe('search index migration preflight cli', () => {
  it('writes a read-only evidence report when --output is provided', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'search-index-preflight-'))
    try {
      const dbPath = path.join(dir, 'index.sqlite')
      const outputPath = path.join(dir, 'nested', 'preflight-report.json')
      mkdirSync(path.dirname(dbPath), { recursive: true })
      await createMinimalSearchIndexDb(dbPath)

      const stdout = execFileSync(
        'corepack',
        ['pnpm', 'exec', 'tsx', scriptPath, '--db', dbPath, '--output', outputPath, '--compact'],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe']
        }
      )

      const stdoutReport = JSON.parse(stdout)
      const fileReport = JSON.parse(readFileSync(outputPath, 'utf8'))

      expect(fileReport).toEqual(stdoutReport)
      expect(fileReport.destructiveActions).toBe(false)
      expect(fileReport.migrationDryRun.destructiveActions).toBe(false)
      expect(fileReport.migrationDryRun.mode).toBe('read-only')
      expect(fileReport.evidenceSource).toEqual({
        scope: 'isolated-controlled',
        detection: 'auto',
        dbPathClass: 'temporary',
        realProfileRequired: false
      })
      expect(fileReport.migrationReadiness.scanProgressSourceScope).toBe('needs-migration')
      expect(fileReport.snapshot.sqliteRuntime).toMatchObject({
        journalMode: expect.any(String),
        busyTimeoutMs: expect.any(Number),
        pageSize: expect.any(Number),
        pageCount: expect.any(Number),
        freelistCount: expect.any(Number),
        queryOnly: true
      })
      expect(fileReport.checks).toContainEqual(
        expect.objectContaining({
          id: 'sqlite-runtime-profile',
          status: 'info'
        })
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects temporary SQLite paths when real profile evidence is required', async () => {
    const dir = mkdtempSync(path.join('/tmp', 'search-index-preflight-real-profile-'))
    try {
      const dbPath = path.join(dir, 'index.sqlite')
      mkdirSync(path.dirname(dbPath), { recursive: true })
      await createMinimalSearchIndexDb(dbPath)

      expect(() =>
        execFileSync(
          'corepack',
          [
            'pnpm',
            'exec',
            'tsx',
            scriptPath,
            '--db',
            dbPath,
            '--evidenceScope',
            'real-profile',
            '--requireRealProfileEvidence',
            '--compact'
          ],
          {
            cwd: repoRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
          }
        )
      ).toThrow(/Temporary SQLite DB paths cannot be marked as real-profile evidence/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
