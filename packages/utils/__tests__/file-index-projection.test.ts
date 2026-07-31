import { describe, expect, it, vi } from 'vitest'
import { AppEvents } from '../transport/events'
import {
  projectFileIndexAddPathResult,
  projectFileIndexBatteryStatus,
  projectFileIndexFailedFile,
  projectFileIndexFailedFiles,
  projectFileIndexRebuildResult,
  projectFileIndexStats,
  projectFileIndexStatus,
} from '../transport/sdk/domains/file-index-projection'
import { createSettingsSdk } from '../transport/sdk/domains/settings'

const SQL_CANARY = 'Failed query: update "files" set "name" = ? where "files"."id" = ?'
const PARAMS_CANARY = 'params: locked.md,.md,2,3,2,4,0,file,1'
const POSIX_PATH_CANARY = '/Users/alice/Private/report.txt'
const WINDOWS_PATH_CANARY = 'C:\\Users\\alice\\Private\\report.txt'
const STACK_CANARY = 'CANARY_STACK at Object.<anonymous>'
const CAUSE_CANARY = 'CANARY_CAUSE SQLITE_BUSY'

const ALL_CANARIES = [SQL_CANARY, PARAMS_CANARY, POSIX_PATH_CANARY, WINDOWS_PATH_CANARY, STACK_CANARY, CAUSE_CANARY]

function expectNoCanary(payload: unknown): void {
  const serialized = JSON.stringify(payload) ?? ''
  for (const canary of ALL_CANARIES) {
    expect(serialized).not.toContain(canary)
  }
  expect(serialized).not.toContain('Failed query:')
  expect(serialized).not.toContain('params:')
}

function rawStatusPayload() {
  return {
    isInitializing: false,
    initializationFailed: true,
    error: `${SQL_CANARY}\n${PARAMS_CANARY}\n${STACK_CANARY}`,
    message: SQL_CANARY,
    startupError: `${POSIX_PATH_CANARY} ${CAUSE_CANARY}`,
    errorCode: 'FILE_INDEX_DATABASE_BUSY',
    retryable: true,
    reportId: 'report-123',
    startupReady: true,
    startupPending: false,
    startupErrorCode: 'FILE_INDEX_SCAN_FAILED',
    progress: { stage: 'idle', current: 1, total: 2 },
    startTime: 10,
    estimatedCompletion: 20,
    estimatedRemainingMs: 30,
    averageItemsPerSecond: 4,
    estimateStatus: 'estimated',
    speedSampleCount: 3,
    estimateBasis: 'stage-speed',
    stack: STACK_CANARY,
    cause: CAUSE_CANARY,
  }
}

describe('file index public projection', () => {
  it('projects status to exact safe fields and drops raw diagnostics', () => {
    const status = projectFileIndexStatus(rawStatusPayload())

    expect(status).toEqual({
      isInitializing: false,
      initializationFailed: true,
      errorCode: 'FILE_INDEX_DATABASE_BUSY',
      retryable: true,
      reportId: 'report-123',
      startupReady: true,
      startupPending: false,
      startupErrorCode: 'FILE_INDEX_SCAN_FAILED',
      progress: { stage: 'idle', current: 1, total: 2 },
      startTime: 10,
      estimatedCompletion: 20,
      estimatedRemainingMs: 30,
      averageItemsPerSecond: 4,
      estimateStatus: 'estimated',
      speedSampleCount: 3,
      estimateBasis: 'stage-speed',
    })
    expect(status).not.toHaveProperty('error')
    expect(status).not.toHaveProperty('startupError')
    expect(status).not.toHaveProperty('message')
    expectNoCanary(status)
  })

  it('projects rebuild results without raw error/message fields', () => {
    const result = projectFileIndexRebuildResult({
      success: false,
      error: `${SQL_CANARY} ${POSIX_PATH_CANARY}`,
      message: `${PARAMS_CANARY} ${WINDOWS_PATH_CANARY}`,
      reason: 'battery-low',
      errorCode: 'FILE_INDEX_DATABASE_BUSY',
      retryable: true,
      reportId: 'report-9',
      requiresConfirm: false,
      battery: { level: 12, charging: false },
      threshold: 20,
      stack: STACK_CANARY,
    })

    expect(result).toEqual({
      success: false,
      errorCode: 'FILE_INDEX_DATABASE_BUSY',
      retryable: true,
      reportId: 'report-9',
      requiresConfirm: false,
      reason: 'battery-low',
      battery: { level: 12, charging: false },
      threshold: 20,
    })
    expect(result).not.toHaveProperty('error')
    expect(result).not.toHaveProperty('message')
    expectNoCanary(result)
  })

  it('drops unknown rebuild reason values instead of forwarding raw text', () => {
    const result = projectFileIndexRebuildResult({
      success: false,
      reason: `${SQL_CANARY} raw-reason`,
    })

    expect(result).toEqual({ success: false })
    expectNoCanary(result)
  })

  it('projects failed files to basename plus stable code only', () => {
    const legacy = projectFileIndexFailedFile({
      fileId: 7,
      path: POSIX_PATH_CANARY,
      lastError: `${SQL_CANARY}\n${PARAMS_CANARY}`,
      updatedAt: '2026-07-30T00:00:00.000Z',
    })

    expect(legacy).toEqual({
      fileId: 7,
      fileName: 'report.txt',
      errorCode: null,
      updatedAt: '2026-07-30T00:00:00.000Z',
    })
    expect(legacy).not.toHaveProperty('path')
    expect(legacy).not.toHaveProperty('lastError')
    expectNoCanary(legacy)

    const windows = projectFileIndexFailedFile({
      fileId: 8,
      path: WINDOWS_PATH_CANARY,
      lastError: CAUSE_CANARY,
      updatedAt: null,
    })
    expect(windows?.fileName).toBe('report.txt')
    expectNoCanary(windows)
  })

  it('projects failed-file envelopes and tolerates legacy bare arrays', () => {
    const envelope = projectFileIndexFailedFiles({
      files: [
        {
          fileId: 1,
          fileName: 'alpha.txt',
          errorCode: 'FILE_INDEX_ITEM_FAILED',
          updatedAt: '2026-07-30T00:00:00.000Z',
          path: POSIX_PATH_CANARY,
          lastError: SQL_CANARY,
        },
      ],
      errorCode: 'FILE_INDEX_DATABASE_BUSY',
      retryable: true,
      reportId: 'report-5',
    })

    expect(envelope).toEqual({
      files: [
        {
          fileId: 1,
          fileName: 'alpha.txt',
          errorCode: 'FILE_INDEX_ITEM_FAILED',
          updatedAt: '2026-07-30T00:00:00.000Z',
        },
      ],
      errorCode: 'FILE_INDEX_DATABASE_BUSY',
      retryable: true,
      reportId: 'report-5',
    })
    expectNoCanary(envelope)

    const legacyArray = projectFileIndexFailedFiles([
      {
        fileId: 2,
        path: POSIX_PATH_CANARY,
        lastError: PARAMS_CANARY,
        updatedAt: null,
      },
    ])
    expect(legacyArray.files).toEqual([{ fileId: 2, fileName: 'report.txt', errorCode: null, updatedAt: null }])
    expectNoCanary(legacyArray)
  })

  it('projects stats, battery, and add-path results with coercion', () => {
    expect(
      projectFileIndexStats({
        totalFiles: 3,
        failedFiles: 1,
        skippedFiles: 0,
        completedFiles: 2,
        embeddingCompletedFiles: 2,
        embeddingRows: 2,
        error: SQL_CANARY,
      }),
    ).toEqual({
      totalFiles: 3,
      failedFiles: 1,
      skippedFiles: 0,
      completedFiles: 2,
      embeddingCompletedFiles: 2,
      embeddingRows: 2,
    })

    expect(projectFileIndexBatteryStatus({ level: 55, charging: true, path: POSIX_PATH_CANARY })).toEqual({
      level: 55,
      charging: true,
    })
    expect(projectFileIndexBatteryStatus(null)).toBeNull()
    expect(projectFileIndexBatteryStatus({ level: 'high' })).toBeNull()

    const addPath = projectFileIndexAddPathResult({
      success: false,
      status: 'error',
      reason: 'path-not-found',
      errorCode: 'FILE_INDEX_ADD_PATH_FAILED',
      reportId: 'report-7',
      error: SQL_CANARY,
    })
    expect(addPath).toEqual({
      success: false,
      status: 'error',
      reason: 'path-not-found',
      errorCode: 'FILE_INDEX_ADD_PATH_FAILED',
      reportId: 'report-7',
    })
    expectNoCanary(addPath)
  })

  it('rejects canaries placed directly in every projected public string slot', () => {
    const status = projectFileIndexStatus({
      errorCode: SQL_CANARY,
      reportId: POSIX_PATH_CANARY,
      startupErrorCode: PARAMS_CANARY,
      progress: { stage: STACK_CANARY, current: 0, total: 0 },
      estimateStatus: WINDOWS_PATH_CANARY,
      estimateBasis: CAUSE_CANARY,
    })
    expect(status).toEqual(
      expect.objectContaining({
        errorCode: null,
        reportId: null,
        startupErrorCode: null,
        progress: { stage: null, current: 0, total: 0 },
        estimateStatus: undefined,
        estimateBasis: undefined,
      }),
    )
    expectNoCanary(status)

    const stats = projectFileIndexStats({ errorCode: SQL_CANARY, reportId: STACK_CANARY })
    expect(stats).not.toHaveProperty('errorCode')
    expect(stats).not.toHaveProperty('reportId')
    expectNoCanary(stats)

    const rebuild = projectFileIndexRebuildResult({
      reason: SQL_CANARY,
      errorCode: PARAMS_CANARY,
      reportId: POSIX_PATH_CANARY,
    })
    expect(rebuild).toEqual({ success: false })
    expectNoCanary(rebuild)

    const failedFile = projectFileIndexFailedFile({
      fileId: 10,
      fileName: WINDOWS_PATH_CANARY,
      errorCode: SQL_CANARY,
      updatedAt: STACK_CANARY,
    })
    expect(failedFile).toEqual({
      fileId: 10,
      fileName: 'report.txt',
      errorCode: null,
      updatedAt: null,
    })
    expectNoCanary(failedFile)

    const failedFiles = projectFileIndexFailedFiles({
      files: [],
      errorCode: SQL_CANARY,
      reportId: WINDOWS_PATH_CANARY,
    })
    expect(failedFiles).toEqual({ files: [] })
    expectNoCanary(failedFiles)

    const addPath = projectFileIndexAddPathResult({
      status: STACK_CANARY,
      reason: SQL_CANARY,
      errorCode: PARAMS_CANARY,
      reportId: POSIX_PATH_CANARY,
    })
    expect(addPath).toEqual({ success: false, status: 'error' })
    expectNoCanary(addPath)
  })

  it('returns safe defaults for malformed status payloads', () => {
    expect(projectFileIndexStatus(undefined)).toEqual({
      isInitializing: false,
      initializationFailed: false,
      errorCode: null,
      retryable: undefined,
      reportId: null,
      startupReady: undefined,
      startupPending: undefined,
      startupErrorCode: null,
      progress: { stage: null, current: 0, total: 0 },
      startTime: null,
      estimatedCompletion: null,
      estimatedRemainingMs: null,
      averageItemsPerSecond: 0,
      estimateStatus: undefined,
      speedSampleCount: undefined,
      estimateBasis: undefined,
    })
    expect(projectFileIndexRebuildResult(null)).toEqual({ success: false })
    expect(projectFileIndexFailedFiles(undefined)).toEqual({ files: [] })
  })
})

describe('settings sdk file index projection wiring', () => {
  function createTransportMock() {
    return {
      send: vi.fn<(...args: any[]) => Promise<any>>(async () => undefined),
      on: vi.fn<(...args: any[]) => any>(() => vi.fn()),
      stream: vi.fn<(...args: any[]) => Promise<any>>(async () => ({
        cancel: vi.fn(),
        cancelled: false,
        streamId: 'mock-stream',
      })),
    }
  }

  it('projects status, rebuild, and failed-files payloads at the SDK boundary', async () => {
    const transport = createTransportMock()
    const sdk = createSettingsSdk(transport as any)

    transport.send.mockResolvedValueOnce(rawStatusPayload())
    const status = await sdk.fileIndex.getStatus()
    expect(transport.send).toHaveBeenNthCalledWith(1, AppEvents.fileIndex.status)
    expect(status.errorCode).toBe('FILE_INDEX_DATABASE_BUSY')
    expect(status).not.toHaveProperty('error')
    expectNoCanary(status)

    transport.send.mockResolvedValueOnce({
      success: false,
      error: SQL_CANARY,
      errorCode: 'FILE_INDEX_REBUILD_FAILED',
      retryable: false,
      reportId: 'report-1',
    })
    const rebuild = await sdk.fileIndex.rebuild({ force: true })
    expect(transport.send).toHaveBeenNthCalledWith(2, AppEvents.fileIndex.rebuild, {
      force: true,
    })
    expect(rebuild).toEqual({
      success: false,
      errorCode: 'FILE_INDEX_REBUILD_FAILED',
      retryable: false,
      reportId: 'report-1',
    })
    expectNoCanary(rebuild)

    transport.send.mockResolvedValueOnce([
      {
        fileId: 3,
        path: POSIX_PATH_CANARY,
        lastError: `${SQL_CANARY} ${STACK_CANARY}`,
        updatedAt: '2026-07-30T00:00:00.000Z',
      },
    ])
    const failedFiles = await sdk.fileIndex.getFailedFiles()
    expect(transport.send).toHaveBeenNthCalledWith(3, AppEvents.fileIndex.failedFiles)
    expect(failedFiles.files).toEqual([
      {
        fileId: 3,
        fileName: 'report.txt',
        errorCode: null,
        updatedAt: '2026-07-30T00:00:00.000Z',
      },
    ])
    expectNoCanary(failedFiles)
  })
})
