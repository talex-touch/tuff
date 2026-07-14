import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import { simulateSearchIndexFtsOwnership } from './search-index-fts-ownership-simulation'

const repoRoot = path.resolve(__dirname, '../../..')
const scriptPath = path.join(__dirname, 'search-index-fts-ownership-simulation.ts')

async function createBaseDb(dbPath: string): Promise<void> {
  const client = createClient({ url: `file:${dbPath}` })
  try {
    await client.execute(
      'CREATE TABLE keyword_mappings (provider_id TEXT, item_id TEXT, keyword TEXT)'
    )
  } finally {
    client.close()
  }
}

async function createLegacySearchIndexDb(dbPath: string): Promise<void> {
  const client = createClient({ url: `file:${dbPath}` })
  try {
    await client.execute(
      'CREATE TABLE keyword_mappings (provider_id TEXT, item_id TEXT, keyword TEXT)'
    )
    await client.execute(`
      CREATE VIRTUAL TABLE search_index USING fts5(
        item_id UNINDEXED,
        provider UNINDEXED,
        type UNINDEXED,
        title,
        keywords
      )
    `)
    await client.execute({
      sql: 'INSERT INTO search_index(item_id, provider, type, title, keywords) VALUES (?, ?, ?, ?, ?)',
      args: ['file-1', 'file-provider', 'file', 'Old file', 'old']
    })
    await client.execute('CREATE VIRTUAL TABLE file_fts USING fts5(name)')
    await client.execute({ sql: 'INSERT INTO file_fts(name) VALUES (?)', args: ['Old file'] })
  } finally {
    client.close()
  }
}

async function readSearchIndexColumns(dbPath: string): Promise<string[]> {
  const client = createClient({ url: `file:${dbPath}` })
  try {
    const rows = await client.execute("SELECT name FROM pragma_table_xinfo('search_index')")
    return rows.rows.map((row) => String(row.name))
  } finally {
    client.close()
  }
}

describe('search index fts ownership simulation', () => {
  it('creates the durable FTS shape on a simulation copy when search_index is missing', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'search-index-fts-sim-missing-'))
    try {
      const dbPath = path.join(dir, 'source.sqlite')
      const copyPath = path.join(dir, 'copy.sqlite')
      await createBaseDb(dbPath)

      const report = await simulateSearchIndexFtsOwnership({
        db: dbPath,
        copy: copyPath,
        keepCopy: true
      })

      expect(report).toMatchObject({
        destructiveActions: false,
        simulationMutatesCopy: true,
        sourceMutationPolicy: 'source-not-mutated-copy-execute',
        sourceSnapshotUnchanged: true,
        evidenceSource: {
          scope: 'isolated-controlled',
          detection: 'auto',
          dbPathClass: 'temporary',
          realProfileRequired: false
        },
        before: {
          searchIndexExists: false
        },
        after: {
          searchIndexExists: true,
          searchIndexHasRequiredColumns: true,
          searchIndexMetaExists: true
        },
        impact: {
          rebuildRequired: false,
          rowsDiscardedInSimulation: 0,
          legacyFileFtsPolicy: 'not-present'
        },
        gate: {
          passed: true,
          blockers: []
        }
      })
      await expect(readSearchIndexColumns(copyPath)).resolves.toEqual(
        expect.arrayContaining(['item_id', 'provider', 'title_compact', 'content'])
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports rebuild impact when legacy search_index lacks content column', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'search-index-fts-sim-legacy-'))
    try {
      const dbPath = path.join(dir, 'source.sqlite')
      const copyPath = path.join(dir, 'copy.sqlite')
      await createLegacySearchIndexDb(dbPath)

      const report = await simulateSearchIndexFtsOwnership({
        db: dbPath,
        copy: copyPath,
        keepCopy: true
      })

      expect(report.before).toMatchObject({
        searchIndexExists: true,
        searchIndexHasRequiredColumns: false,
        searchIndexRows: 1,
        legacyFileFtsExists: true,
        legacyFileFtsRows: 1
      })
      expect(report.after).toMatchObject({
        searchIndexExists: true,
        searchIndexHasRequiredColumns: true,
        searchIndexRows: 0
      })
      expect(report.impact).toMatchObject({
        rebuildRequired: true,
        rowsDiscardedInSimulation: 1,
        fullReindexRequired: true,
        legacyFileFtsPolicy: 'retain-unchanged'
      })
      expect(report.gate.passed).toBe(true)
      expect(report.gate.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('rows discarded in simulation: 1'),
          expect.stringContaining('retained unchanged')
        ])
      )
      await expect(readSearchIndexColumns(dbPath)).resolves.not.toContain('content')
      await expect(readSearchIndexColumns(copyPath)).resolves.toContain('content')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects temporary SQLite paths when real profile evidence is required', async () => {
    const dir = mkdtempSync(path.join('/tmp', 'search-index-fts-sim-real-profile-'))
    try {
      const dbPath = path.join(dir, 'source.sqlite')
      await createBaseDb(dbPath)

      await expect(
        simulateSearchIndexFtsOwnership({
          db: dbPath,
          evidenceScope: 'real-profile',
          requireRealProfileEvidence: true
        })
      ).rejects.toThrow('Temporary SQLite DB paths cannot be marked as real-profile evidence')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('writes a JSON report from the CLI', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'search-index-fts-sim-cli-'))
    try {
      const dbPath = path.join(dir, 'source.sqlite')
      const copyPath = path.join(dir, 'artifact', 'copy.sqlite')
      const outputPath = path.join(dir, 'artifact', 'fts-simulation.json')
      mkdirSync(path.dirname(dbPath), { recursive: true })
      await createBaseDb(dbPath)

      const stdout = execFileSync(
        'corepack',
        [
          'pnpm',
          'exec',
          'tsx',
          scriptPath,
          '--db',
          dbPath,
          '--copy',
          copyPath,
          '--output',
          outputPath,
          '--compact'
        ],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe']
        }
      )
      const stdoutReport = JSON.parse(stdout)
      const fileReport = JSON.parse(readFileSync(outputPath, 'utf8'))

      expect(fileReport).toEqual(stdoutReport)
      expect(fileReport.kind).toBe('search-index-fts-ownership-simulation')
      expect(fileReport.evidenceSource).toMatchObject({
        scope: 'isolated-controlled',
        dbPathClass: 'temporary',
        realProfileRequired: false
      })
      expect(fileReport.evidenceSource.dbIdentity).toMatch(/^sha256-realpath-v1:[a-f0-9]{64}$/)
      expect(fileReport.sourceMutationPolicy).toBe('source-not-mutated-copy-execute')
      expect(fileReport.sourceSnapshotUnchanged).toBe(true)
      expect(fileReport.gate.passed).toBe(true)
      await expect(readSearchIndexColumns(copyPath)).resolves.toContain('content')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
