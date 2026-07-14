import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '../../..')
const scriptPath = path.join(__dirname, 'scan-progress-source-scope-migration.ts')

async function createPathOnlyScanProgressDb(dbPath: string): Promise<void> {
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

function runCli(args: string[], cwd = repoRoot): string {
  return execFileSync('corepack', ['pnpm', 'exec', 'tsx', scriptPath, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

function captureFailure(args: string[]): string {
  try {
    runCli(args)
    return ''
  } catch (error) {
    const processError = error as Partial<{
      message: string
      stderr: Buffer | string
      stdout: Buffer | string
    }>
    return [processError.message, processError.stdout?.toString(), processError.stderr?.toString()]
      .filter(Boolean)
      .join('\n')
  }
}

describe('scan progress source-scope migration cli', () => {
  it('prints a read-only plan by default', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scan-progress-plan-'))
    try {
      const dbPath = path.join(dir, 'index.sqlite')
      await createPathOnlyScanProgressDb(dbPath)

      const plan = JSON.parse(runCli(['--db', dbPath, '--compact']))
      expect(plan).toMatchObject({
        mode: 'plan',
        executed: false,
        queryOnly: true,
        evidenceSource: {
          scope: 'isolated-controlled',
          detection: 'auto',
          dbPathClass: 'temporary',
          realProfileRequired: false
        },
        plan: {
          status: 'ready',
          mode: 'read-only',
          destructiveActions: false,
          requiresApproval: true,
          rowsToMigrate: 2
        }
      })
      expect(plan.evidenceSource.dbIdentity).toMatch(/^sha256-realpath-v1:[a-f0-9]{64}$/)

      const client = createClient({ url: `file:${dbPath}` })
      try {
        const columns = await client.execute('PRAGMA table_info(scan_progress)')
        expect(columns.rows.map((row) => row.name)).toEqual(['path', 'last_scanned'])
      } finally {
        client.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects temporary SQLite paths when real profile evidence is required', async () => {
    const dir = mkdtempSync(path.join('/tmp', 'scan-progress-real-profile-'))
    try {
      const dbPath = path.join(dir, 'index.sqlite')
      await createPathOnlyScanProgressDb(dbPath)

      expect(
        captureFailure([
          '--db',
          dbPath,
          '--evidenceScope',
          'real-profile',
          '--requireRealProfileEvidence'
        ])
      ).toContain('Temporary SQLite DB paths cannot be marked as real-profile evidence')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses execute mode without explicit confirmation', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scan-progress-refuse-'))
    try {
      const dbPath = path.join(dir, 'index.sqlite')
      await createPathOnlyScanProgressDb(dbPath)

      expect(captureFailure(['--db', dbPath, '--execute'])).toContain(
        'Refusing to execute without --confirm-source-scope-migration'
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('executes only with confirmation and writes an evidence result', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scan-progress-execute-'))
    try {
      const dbPath = path.join(dir, 'index.sqlite')
      const outputPath = path.join(dir, 'evidence', 'result.json')
      mkdirSync(path.dirname(dbPath), { recursive: true })
      await createPathOnlyScanProgressDb(dbPath)

      const stdout = runCli([
        '--db',
        dbPath,
        '--execute',
        '--confirm-source-scope-migration',
        '--output',
        outputPath,
        '--compact'
      ])
      const result = JSON.parse(stdout)
      const fileResult = JSON.parse(readFileSync(outputPath, 'utf8'))
      expect(fileResult).toEqual(result)
      expect(result).toMatchObject({
        mode: 'execute',
        evidenceSource: {
          scope: 'isolated-controlled',
          detection: 'auto',
          dbPathClass: 'temporary',
          realProfileRequired: false
        },
        executed: true,
        migratedRows: 2,
        backupTable: 'scan_progress_path_only_backup'
      })
      expect(result.evidenceSource.dbIdentity).toMatch(/^sha256-realpath-v1:[a-f0-9]{64}$/)

      const client = createClient({ url: `file:${dbPath}` })
      try {
        const rows = await client.execute(
          'SELECT source_id AS sourceId, path, last_scanned AS lastScanned FROM scan_progress ORDER BY path'
        )
        expect(rows.rows).toEqual([
          { sourceId: 'file-provider', path: '/a', lastScanned: 1 },
          { sourceId: 'file-provider', path: '/b', lastScanned: 2 }
        ])

        const backupRows = await client.execute(
          'SELECT count(*) AS count FROM scan_progress_path_only_backup'
        )
        expect(Number(backupRows.rows[0].count)).toBe(2)
      } finally {
        client.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
