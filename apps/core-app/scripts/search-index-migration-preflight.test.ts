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
      expect(fileReport.migrationReadiness.scanProgressSourceScope).toBe('needs-migration')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
