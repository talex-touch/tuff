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
      expect(fileReport.evidenceSource).toMatchObject({
        scope: 'isolated-controlled',
        detection: 'auto',
        dbPathClass: 'temporary',
        realProfileRequired: false
      })
      expect(fileReport.evidenceSource.dbIdentity).toMatch(/^sha256-realpath-v1:[a-f0-9]{64}$/)
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

  it('inspects search_keyword_postings coverage and flags orphan or unmapped postings', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'search-index-preflight-postings-'))
    try {
      const healthyDb = path.join(dir, 'healthy.sqlite')
      const healthyClient = createClient({ url: `file:${healthyDb}` })
      try {
        await healthyClient.execute('CREATE TABLE files (id INTEGER PRIMARY KEY, type TEXT)')
        await healthyClient.execute("INSERT INTO files (id, type) VALUES (1, 'file')")
        await healthyClient.execute(
          'CREATE TABLE scan_progress (source_id TEXT NOT NULL, path TEXT NOT NULL, last_scanned INTEGER NOT NULL, PRIMARY KEY (source_id, path))'
        )
        await healthyClient.execute(
          'CREATE VIRTUAL TABLE search_index USING fts5(item_id UNINDEXED, provider UNINDEXED, title)'
        )
        const inserted = await healthyClient.execute(
          "INSERT INTO search_index (item_id, provider, title) VALUES ('/tmp/a.ts', 'file-provider', 'a')"
        )
        const ftsRowId = Number(inserted.lastInsertRowid)
        await healthyClient.execute(
          'CREATE TABLE search_index_meta (provider_id TEXT NOT NULL, item_id TEXT NOT NULL, keyword_hash TEXT NOT NULL, fts_rowid INTEGER, doc_id INTEGER, PRIMARY KEY (provider_id, item_id))'
        )
        await healthyClient.execute({
          sql: "INSERT INTO search_index_meta (provider_id, item_id, keyword_hash, fts_rowid, doc_id) VALUES ('file-provider', '/tmp/a.ts', 'h1', ?, 10)",
          args: [ftsRowId]
        })
        await healthyClient.execute(
          'CREATE TABLE keyword_mappings (id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id TEXT NOT NULL, item_id TEXT NOT NULL, keyword TEXT NOT NULL, priority REAL NOT NULL DEFAULT 1)'
        )
        await healthyClient.execute(
          'CREATE TABLE search_keyword_postings (provider_id TEXT NOT NULL, keyword TEXT NOT NULL, doc_id INTEGER NOT NULL, priority REAL NOT NULL DEFAULT 1, PRIMARY KEY (provider_id, keyword, doc_id)) WITHOUT ROWID'
        )
        await healthyClient.execute(
          "INSERT INTO search_keyword_postings (provider_id, keyword, doc_id, priority) VALUES ('file-provider', 'alpha', 10, 1.2), ('file-provider', 'ng:al', 10, 0.5)"
        )
      } finally {
        healthyClient.close()
      }

      const healthyOut = execFileSync(
        'corepack',
        ['pnpm', 'exec', 'tsx', scriptPath, '--db', healthyDb, '--compact'],
        { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      )
      const healthyReport = JSON.parse(healthyOut)
      expect(healthyReport.gate.passed).toBe(true)
      expect(healthyReport.snapshot.ftsOwnership).toMatchObject({
        sourceKeywordRows: 2,
        sourceKeywordPostingsRows: 2,
        orphanKeywordRows: 0,
        orphanKeywordPostingsRows: 0,
        keywordRowsMissingMeta: 0,
        keywordPostingsRowsMissingMeta: 0
      })

      const brokenDb = path.join(dir, 'broken.sqlite')
      const brokenClient = createClient({ url: `file:${brokenDb}` })
      try {
        await brokenClient.execute('CREATE TABLE files (id INTEGER PRIMARY KEY, type TEXT)')
        await brokenClient.execute("INSERT INTO files (id, type) VALUES (1, 'file')")
        await brokenClient.execute(
          'CREATE TABLE scan_progress (source_id TEXT NOT NULL, path TEXT NOT NULL, last_scanned INTEGER NOT NULL, PRIMARY KEY (source_id, path))'
        )
        await brokenClient.execute(
          'CREATE VIRTUAL TABLE search_index USING fts5(item_id UNINDEXED, provider UNINDEXED, title)'
        )
        const inserted = await brokenClient.execute(
          "INSERT INTO search_index (item_id, provider, title) VALUES ('/tmp/a.ts', 'file-provider', 'a')"
        )
        const ftsRowId = Number(inserted.lastInsertRowid)
        await brokenClient.execute(
          'CREATE TABLE search_index_meta (provider_id TEXT NOT NULL, item_id TEXT NOT NULL, keyword_hash TEXT NOT NULL, fts_rowid INTEGER, doc_id INTEGER, PRIMARY KEY (provider_id, item_id))'
        )
        await brokenClient.execute({
          sql: "INSERT INTO search_index_meta (provider_id, item_id, keyword_hash, fts_rowid, doc_id) VALUES ('file-provider', '/tmp/a.ts', 'h1', ?, 10), ('file-provider', '/tmp/stale.ts', 'h2', 9999, 20)",
          args: [ftsRowId]
        })
        await brokenClient.execute(
          'CREATE TABLE keyword_mappings (id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id TEXT NOT NULL, item_id TEXT NOT NULL, keyword TEXT NOT NULL, priority REAL NOT NULL DEFAULT 1)'
        )
        await brokenClient.execute(
          'CREATE TABLE search_keyword_postings (provider_id TEXT NOT NULL, keyword TEXT NOT NULL, doc_id INTEGER NOT NULL, priority REAL NOT NULL DEFAULT 1, PRIMARY KEY (provider_id, keyword, doc_id)) WITHOUT ROWID'
        )
        // doc_id 10 = valid, doc_id 20 = meta exists with stale fts_rowid, doc_id 99 = missing meta
        await brokenClient.execute(
          "INSERT INTO search_keyword_postings (provider_id, keyword, doc_id, priority) VALUES ('file-provider', 'ok', 10, 1.0), ('file-provider', 'stalefts', 20, 1.0), ('file-provider', 'nometa', 99, 1.0)"
        )
      } finally {
        brokenClient.close()
      }

      const brokenOutputPath = path.join(dir, 'broken-report.json')
      expect(() =>
        execFileSync(
          'corepack',
          [
            'pnpm',
            'exec',
            'tsx',
            scriptPath,
            '--db',
            brokenDb,
            '--output',
            brokenOutputPath,
            '--compact'
          ],
          { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
        )
      ).toThrow()
      const brokenReport = JSON.parse(readFileSync(brokenOutputPath, 'utf8'))
      expect(brokenReport.gate.passed).toBe(false)
      expect(brokenReport.gate.failedChecks).toEqual(
        expect.arrayContaining(['keyword-orphans', 'search-index-meta-coverage'])
      )
      expect(brokenReport.snapshot.ftsOwnership).toMatchObject({
        sourceKeywordRows: 3,
        sourceKeywordPostingsRows: 3,
        orphanKeywordRows: 2,
        orphanKeywordPostingsRows: 2,
        keywordRowsMissingMeta: 1,
        keywordPostingsRowsMissingMeta: 1
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
