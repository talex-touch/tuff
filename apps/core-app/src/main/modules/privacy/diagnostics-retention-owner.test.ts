import type { Client } from '@libsql/client'
import fs, { mkdir, readdir, symlink, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sanitizeTelemetryFailureCode } from '../sentry/telemetry-upload-stats-store'
import { createDiagnosticsRetentionOwner } from './owners/diagnostics-retention-owner'
import { DEFAULT_PRIVACY_RETENTION_POLICY, PRIVACY_RETENTION_DAY_MS } from './retention-policy'
import { createPrivacyTestClient } from './retention-test-utils'

const NOW_MS = Date.UTC(2026, 6, 30, 12)
const CUTOFF_MS = NOW_MS - 30 * PRIVACY_RETENTION_DAY_MS

async function createDiagnosticsTables(client: Client): Promise<void> {
  const statements = [
    `CREATE TABLE analytics_snapshots (id INTEGER PRIMARY KEY, window_type TEXT NOT NULL, timestamp INTEGER NOT NULL, metrics TEXT NOT NULL, created_at INTEGER)`,
    `CREATE TABLE plugin_analytics (id INTEGER PRIMARY KEY, plugin_name TEXT NOT NULL, plugin_version TEXT, feature_id TEXT, event_type TEXT NOT NULL, count INTEGER, metadata TEXT, timestamp INTEGER NOT NULL)`,
    `CREATE TABLE analytics_report_queue (id INTEGER PRIMARY KEY, endpoint TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL, retry_count INTEGER NOT NULL, last_attempt_at INTEGER, last_error TEXT)`,
    `CREATE TABLE telemetry_upload_stats (id INTEGER PRIMARY KEY, search_count INTEGER NOT NULL, total_uploads INTEGER NOT NULL, failed_uploads INTEGER NOT NULL, last_upload_time INTEGER, last_failure_at INTEGER, last_failure_message TEXT, updated_at INTEGER NOT NULL)`
  ]
  for (const statement of statements) await client.execute(statement)
}

async function count(client: Client, table: string): Promise<number> {
  const result = await client.execute(`SELECT COUNT(*) AS count FROM ${table}`)
  return Number(result.rows[0].count)
}

describe('diagnostics retention owner', () => {
  it('normalizes all native telemetry failure detail to one stable code', () => {
    expect(sanitizeTelemetryFailureCode('CANARY_SECRET')).toBe('TELEMETRY_UPLOAD_FAILED')
    expect(sanitizeTelemetryFailureCode('/CANARY/PATH native error')).toBe(
      'TELEMETRY_UPLOAD_FAILED'
    )
    expect(sanitizeTelemetryFailureCode(null)).toBeNull()
  })

  it('cleans bounded diagnostic metadata and logs without projecting payload or native-error canaries', async () => {
    const { client, directory } = await createPrivacyTestClient('diagnostics')
    await createDiagnosticsTables(client)
    const logDirectory = join(directory, 'logs')
    const crashDirectory = join(logDirectory, 'crashes')
    const nestedCrashDirectory = join(crashDirectory, 'reports')
    await mkdir(nestedCrashDirectory, { recursive: true })
    const oldCrash = join(nestedCrashDirectory, 'CANARY_CRASH.dmp')
    await writeFile(oldCrash, 'CANARY_CRASH_CONTENT')
    await utimes(oldCrash, new Date(CUTOFF_MS - 1), new Date(CUTOFF_MS - 1))
    const unrelatedCrashFile = join(crashDirectory, 'CANARY_CRASH.txt')
    await writeFile(unrelatedCrashFile, 'CANARY_UNOWNED_CRASH_CONTENT')
    await utimes(unrelatedCrashFile, new Date(CUTOFF_MS - 1), new Date(CUTOFF_MS - 1))

    for (const [suffix, timestamp] of [
      ['OLD', CUTOFF_MS - 1],
      ['EQUAL', CUTOFF_MS],
      ['FRESH', CUTOFF_MS + 1]
    ] as const) {
      await client.execute({
        sql: `INSERT INTO analytics_snapshots (window_type, timestamp, metrics, created_at) VALUES ('daily', ?, ?, ?)`,
        args: [timestamp, `CANARY_METRICS_${suffix}`, timestamp]
      })
      await client.execute({
        sql: `INSERT INTO plugin_analytics (plugin_name, plugin_version, feature_id, event_type, count, metadata, timestamp) VALUES ('plugin', '1', 'feature', 'event', 1, ?, ?)`,
        args: [`CANARY_PLUGIN_DATA_${suffix}`, timestamp]
      })
      await client.execute({
        sql: `INSERT INTO analytics_report_queue (endpoint, payload, created_at, retry_count, last_attempt_at, last_error) VALUES ('local', ?, ?, 0, NULL, ?)`,
        args: [`CANARY_REPORT_${suffix}`, timestamp, `CANARY_NATIVE_ERROR_${suffix}`]
      })
      await client.execute({
        sql: `INSERT INTO telemetry_upload_stats (search_count, total_uploads, failed_uploads, last_upload_time, last_failure_at, last_failure_message, updated_at) VALUES (1, 1, 1, ?, ?, ?, ?)`,
        args: [timestamp, timestamp, `CANARY_NATIVE_ERROR_${suffix}`, timestamp]
      })
      const fileName =
        suffix === 'OLD'
          ? 'D2026-01-01.log'
          : suffix === 'EQUAL'
            ? 'D2026-01-02.log'
            : 'E2026-01-03.err'
      const filePath = join(logDirectory, fileName)
      await writeFile(filePath, `CANARY_LOG_CONTENT_${suffix}`)
      await utimes(filePath, new Date(timestamp), new Date(timestamp))
    }
    const unrelatedLog = join(logDirectory, 'download-error.log')
    await writeFile(unrelatedLog, 'CANARY_UNOWNED_LOG')
    await utimes(unrelatedLog, new Date(CUTOFF_MS - 1), new Date(CUTOFF_MS - 1))

    const owner = createDiagnosticsRetentionOwner({ client, logDirectory })
    const request = {
      category: 'diagnostics' as const,
      mode: 'retention' as const,
      policy: DEFAULT_PRIVACY_RETENTION_POLICY.categories.diagnostics,
      nowMs: NOW_MS
    }
    const preview = await owner.previewDelete(request, new AbortController().signal)
    expect(preview).toMatchObject({ ok: true, eligibleItemCount: 6, bounded: false })
    const result = await owner.delete(request, new AbortController().signal)
    expect(result).toMatchObject({
      ok: true,
      code: 'PRIVACY_OWNER_COMPLETED',
      deletedItemCount: 6,
      failedItemCount: 0
    })

    for (const table of ['analytics_snapshots', 'plugin_analytics', 'analytics_report_queue']) {
      expect(await count(client, table)).toBe(2)
    }
    expect(await count(client, 'telemetry_upload_stats')).toBe(3)
    const telemetryFailures = await client.execute(
      `SELECT last_failure_at FROM telemetry_upload_stats ORDER BY id`
    )
    expect(telemetryFailures.rows.map((row) => row.last_failure_at)).toEqual([
      null,
      CUTOFF_MS,
      CUTOFF_MS + 1
    ])
    expect(await readdir(logDirectory)).toEqual([
      'D2026-01-02.log',
      'E2026-01-03.err',
      'crashes',
      'download-error.log'
    ])
    expect(await readdir(crashDirectory)).toEqual(['CANARY_CRASH.txt', 'reports'])
    expect(await readdir(nestedCrashDirectory)).toEqual([])
    expect(JSON.stringify({ preview, result })).not.toContain('CANARY_')

    const idempotent = await owner.delete(request, new AbortController().signal)
    expect(idempotent).toMatchObject({ ok: true, deletedItemCount: 0 })
  })

  it('does not follow a diagnostic subdirectory symlink outside the log owner root', async () => {
    const { client, directory } = await createPrivacyTestClient('diagnostics-symlink')
    await createDiagnosticsTables(client)
    const logDirectory = join(directory, 'logs')
    const outsideDirectory = join(directory, 'outside')
    await mkdir(logDirectory, { recursive: true })
    await mkdir(outsideDirectory, { recursive: true })
    const outsideFile = join(outsideDirectory, 'D2020-01-01.log')
    await writeFile(outsideFile, 'CANARY_OUTSIDE_LOG')
    await utimes(outsideFile, new Date(CUTOFF_MS - 1), new Date(CUTOFF_MS - 1))
    await symlink(outsideDirectory, join(logDirectory, 'crashes'), 'dir')
    const owner = createDiagnosticsRetentionOwner({ client, logDirectory })

    const result = await owner.delete(
      {
        category: 'diagnostics',
        mode: 'retention',
        policy: DEFAULT_PRIVACY_RETENTION_POLICY.categories.diagnostics,
        nowMs: NOW_MS
      },
      new AbortController().signal
    )

    expect(result).toMatchObject({ ok: true, deletedItemCount: 0 })
    expect(await readdir(outsideDirectory)).toEqual(['D2020-01-01.log'])
    expect(JSON.stringify(result)).not.toContain('CANARY_')
  })

  it('preserves a log file replaced after collection and reports the identity mismatch', async () => {
    const { client, directory } = await createPrivacyTestClient('diagnostics-replacement')
    await createDiagnosticsTables(client)
    const logDirectory = join(directory, 'logs')
    await mkdir(logDirectory, { recursive: true })
    const first = join(logDirectory, 'D2020-01-01.log')
    const second = join(logDirectory, 'D2020-01-02.log')
    await writeFile(first, 'first')
    await writeFile(second, 'second-original')
    await utimes(first, new Date(CUTOFF_MS - 1), new Date(CUTOFF_MS - 1))
    await utimes(second, new Date(CUTOFF_MS - 1), new Date(CUTOFF_MS - 1))

    const canonicalFirst = await fs.realpath(first)
    const canonicalSecond = await fs.realpath(second)
    const unlink = fs.unlink.bind(fs)
    const owner = createDiagnosticsRetentionOwner({
      client,
      logDirectory,
      removeLogFile: async (filePath) => {
        await unlink(filePath)
        if (filePath === canonicalFirst) {
          await unlink(canonicalSecond)
          await writeFile(canonicalSecond, 'replacement-must-survive')
          await utimes(canonicalSecond, new Date(CUTOFF_MS - 1), new Date(CUTOFF_MS - 1))
        }
      }
    })
    const result = await owner.delete(
      {
        category: 'diagnostics',
        mode: 'retention',
        policy: DEFAULT_PRIVACY_RETENTION_POLICY.categories.diagnostics,
        nowMs: NOW_MS
      },
      new AbortController().signal
    )

    expect(result).toMatchObject({
      ok: false,
      code: 'PRIVACY_OWNER_RESOURCE_DELETE_FAILED',
      deletedItemCount: 1,
      failedItemCount: 1,
      partial: true
    })
    await expect(fs.readFile(second, 'utf8')).resolves.toBe('replacement-must-survive')
  })

  it('propagates cancellation that occurs inside telemetry cleanup', async () => {
    const { client, directory } = await createPrivacyTestClient('diagnostics-cancel')
    await createDiagnosticsTables(client)
    const logDirectory = join(directory, 'logs')
    await mkdir(logDirectory, { recursive: true })
    const controller = new AbortController()
    const owner = createDiagnosticsRetentionOwner({
      client,
      logDirectory,
      telemetryLifecycle: {
        clearFailureBefore: async () => {
          controller.abort()
          return 0
        }
      }
    })

    const result = await owner.delete(
      {
        category: 'diagnostics',
        mode: 'retention',
        policy: DEFAULT_PRIVACY_RETENTION_POLICY.categories.diagnostics,
        nowMs: NOW_MS
      },
      controller.signal
    )

    expect(result).toMatchObject({
      ok: false,
      code: 'PRIVACY_OWNER_CANCELLED',
      cancelled: true,
      deletedItemCount: 0
    })
  })

  it('delegates telemetry detail cleanup with the strict retention cutoff', async () => {
    const { client, directory } = await createPrivacyTestClient('diagnostics-telemetry-lifecycle')
    await createDiagnosticsTables(client)
    const logDirectory = join(directory, 'logs')
    await mkdir(logDirectory, { recursive: true })
    const cutoffs: number[] = []
    const owner = createDiagnosticsRetentionOwner({
      client,
      logDirectory,
      telemetryLifecycle: {
        clearFailureBefore: async (cutoffMs) => {
          cutoffs.push(cutoffMs)
          return 1
        }
      }
    })

    const result = await owner.delete(
      {
        category: 'diagnostics',
        mode: 'retention',
        policy: DEFAULT_PRIVACY_RETENTION_POLICY.categories.diagnostics,
        nowMs: NOW_MS
      },
      new AbortController().signal
    )

    expect(result).toMatchObject({ ok: true, deletedItemCount: 1 })
    expect(cutoffs).toEqual([CUTOFF_MS])
  })
})
