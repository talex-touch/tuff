import { describe, expect, it } from 'vitest'
import {
  projectFileIndexDashboardErrorCode,
  projectFileIndexDashboardFileName,
  projectFileIndexDashboardWorkerSnapshot
} from './file-index-dashboard-projection'

const SQL_CANARY = 'Failed query: UPDATE files SET name = ?'
const PARAMS_CANARY = 'params: canary.md,.md,2,3'
const POSIX_PATH_CANARY = '/Users/alice/Private/report.txt'
const WINDOWS_PATH_CANARY = 'C:\\Users\\alice\\Private\\report.txt'
const STACK_CANARY = 'CANARY_STACK at Object.<anonymous>'
const CANARIES = [SQL_CANARY, PARAMS_CANARY, POSIX_PATH_CANARY, WINDOWS_PATH_CANARY, STACK_CANARY]

function expectNoCanary(value: unknown): void {
  const serialized = JSON.stringify(value)
  for (const canary of CANARIES) expect(serialized).not.toContain(canary)
  expect(serialized).not.toContain('Failed query:')
  expect(serialized).not.toContain('params:')
}

describe('file index dashboard public projection', () => {
  it('reduces POSIX and Windows paths to basename only', () => {
    expect(projectFileIndexDashboardFileName(POSIX_PATH_CANARY)).toBe('report.txt')
    expect(projectFileIndexDashboardFileName(WINDOWS_PATH_CANARY)).toBe('report.txt')
    expect(projectFileIndexDashboardFileName(undefined)).toBe('')
  })

  it('maps raw worker and item errors to stable classifications', () => {
    expect(projectFileIndexDashboardErrorCode(`${SQL_CANARY}: SQLITE_BUSY`)).toBe(
      'FILE_INDEX_DATABASE_BUSY'
    )
    expect(projectFileIndexDashboardErrorCode(`${PARAMS_CANARY} ${STACK_CANARY}`)).toBe(
      'FILE_INDEX_ITEM_FAILED'
    )
    expect(projectFileIndexDashboardErrorCode(null)).toBeNull()
  })

  it('rebuilds worker snapshots from an exact safe allowlist', () => {
    const projected = projectFileIndexDashboardWorkerSnapshot({
      summary: { total: 1, busy: 0, idle: 0, offline: 1 },
      workers: [
        {
          name: SQL_CANARY,
          threadId: null,
          state: 'offline',
          pending: 0,
          lastTask: {
            id: POSIX_PATH_CANARY,
            startedAt: PARAMS_CANARY,
            finishedAt: '2026-07-31T00:00:00.000Z',
            durationMs: 12,
            error: `${SQL_CANARY}\n${PARAMS_CANARY}`
          },
          lastError: `${STACK_CANARY}: SQLITE_BUSY`,
          uptimeMs: 25,
          metrics: {
            capturedAt: 10,
            memory: { rss: 1, heapUsed: 2, heapTotal: 3, external: 4, arrayBuffers: 5 },
            cpu: { user: 6, system: 7, percent: 8 },
            eventLoop: { active: 9, idle: 10, utilization: 0.5 }
          }
        }
      ]
    })

    expect(projected).toEqual({
      summary: { total: 1, busy: 0, idle: 0, offline: 1 },
      workers: [
        {
          name: 'file-index-worker',
          threadId: null,
          state: 'offline',
          pending: 0,
          lastTask: {
            id: 'unknown-task',
            startedAt: null,
            finishedAt: '2026-07-31T00:00:00.000Z',
            durationMs: 12,
            errorCode: 'FILE_INDEX_WORKER_TASK_FAILED'
          },
          errorCode: 'FILE_INDEX_DATABASE_BUSY',
          uptimeMs: 25,
          metrics: {
            capturedAt: 10,
            memory: { rss: 1, heapUsed: 2, heapTotal: 3, external: 4, arrayBuffers: 5 },
            cpu: { user: 6, system: 7, percent: 8 },
            eventLoop: { active: 9, idle: 10, utilization: 0.5 }
          }
        }
      ]
    })
    expectNoCanary(projected)
  })
})
