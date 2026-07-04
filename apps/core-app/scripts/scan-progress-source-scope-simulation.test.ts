import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import { simulateScanProgressSourceScopeMigration } from './scan-progress-source-scope-simulation'

const repoRoot = path.resolve(__dirname, '../../..')
const scriptPath = path.join(__dirname, 'scan-progress-source-scope-simulation.ts')

async function createPathOnlyDb(dbPath: string): Promise<void> {
  const client = createClient({ url: `file:${dbPath}` })
  try {
    await client.execute(
      'CREATE TABLE scan_progress (path TEXT PRIMARY KEY, last_scanned INTEGER NOT NULL)'
    )
    await client.execute({
      sql: 'INSERT INTO scan_progress(path, last_scanned) VALUES (?, ?), (?, ?)',
      args: ['/a', 1, '/b', 2]
    })
  } finally {
    client.close()
  }
}

async function createBlockedDb(dbPath: string): Promise<void> {
  const client = createClient({ url: `file:${dbPath}` })
  try {
    await client.execute('CREATE TABLE scan_progress (path TEXT PRIMARY KEY, last_scanned INTEGER)')
    await client.execute({
      sql: 'INSERT INTO scan_progress(path, last_scanned) VALUES (?, ?)',
      args: ['', -1]
    })
  } finally {
    client.close()
  }
}

async function readSourceColumns(dbPath: string): Promise<string[]> {
  const client = createClient({ url: `file:${dbPath}` })
  try {
    const rows = await client.execute('PRAGMA table_info(scan_progress)')
    return rows.rows.map((row) => String(row.name))
  } finally {
    client.close()
  }
}

describe('scan progress source-scope simulation cli', () => {
  it('runs migration on a copied database and leaves the source path-only', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scan-progress-sim-ok-'))
    try {
      const dbPath = path.join(dir, 'source.sqlite')
      const copyPath = path.join(dir, 'copy.sqlite')
      await createPathOnlyDb(dbPath)

      const report = await simulateScanProgressSourceScopeMigration({
        db: dbPath,
        copy: copyPath,
        sourceId: 'file-provider',
        keepCopy: true
      })

      expect(report).toMatchObject({
        destructiveActions: false,
        mode: 'copy-execute',
        sourceMutationPolicy: 'source-not-mutated-copy-execute',
        sourceSnapshotUnchanged: true,
        evidenceSource: {
          scope: 'isolated-controlled',
          detection: 'auto',
          dbPathClass: 'temporary',
          realProfileRequired: false
        },
        simulationDbKept: true,
        before: {
          plan: {
            status: 'ready',
            rowsToMigrate: 2
          }
        },
        execution: {
          executed: true,
          migratedRows: 2,
          backupTable: 'scan_progress_path_only_backup'
        },
        after: {
          plan: {
            status: 'not-needed'
          },
          snapshot: {
            sourceScoped: true,
            rowCount: 2,
            backupRows: 2
          }
        },
        gate: {
          passed: true,
          blockers: []
        }
      })

      await expect(readSourceColumns(dbPath)).resolves.toEqual(['path', 'last_scanned'])
      await expect(readSourceColumns(copyPath)).resolves.toEqual([
        'source_id',
        'path',
        'last_scanned'
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports blocked source data without mutating the source', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scan-progress-sim-blocked-'))
    try {
      const dbPath = path.join(dir, 'source.sqlite')
      await createBlockedDb(dbPath)

      const report = await simulateScanProgressSourceScopeMigration({ db: dbPath })

      expect(report.execution.executed).toBe(false)
      expect(report.gate.passed).toBe(false)
      expect(report.gate.blockers).toEqual(
        expect.arrayContaining([
          'scan_progress blank path rows',
          'scan_progress invalid timestamp rows',
          'pre-migration plan is blocked'
        ])
      )
      await expect(readSourceColumns(dbPath)).resolves.toEqual(['path', 'last_scanned'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects temporary SQLite paths when real profile evidence is required', async () => {
    const dir = mkdtempSync(path.join('/tmp', 'scan-progress-sim-real-profile-'))
    try {
      const dbPath = path.join(dir, 'source.sqlite')
      await createPathOnlyDb(dbPath)

      await expect(
        simulateScanProgressSourceScopeMigration({
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
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scan-progress-sim-cli-'))
    try {
      const dbPath = path.join(dir, 'source.sqlite')
      const copyPath = path.join(dir, 'artifact', 'copy.sqlite')
      const outputPath = path.join(dir, 'artifact', 'simulation.json')
      mkdirSync(path.dirname(dbPath), { recursive: true })
      await createPathOnlyDb(dbPath)

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
      expect(fileReport.kind).toBe('scan-progress-source-scope-simulation')
      expect(fileReport.evidenceSource).toMatchObject({
        scope: 'isolated-controlled',
        dbPathClass: 'temporary',
        realProfileRequired: false
      })
      expect(fileReport.sourceMutationPolicy).toBe('source-not-mutated-copy-execute')
      expect(fileReport.sourceSnapshotUnchanged).toBe(true)
      expect(fileReport.gate.passed).toBe(true)
      await expect(readSourceColumns(dbPath)).resolves.toEqual(['path', 'last_scanned'])
      await expect(readSourceColumns(copyPath)).resolves.toEqual([
        'source_id',
        'path',
        'last_scanned'
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
