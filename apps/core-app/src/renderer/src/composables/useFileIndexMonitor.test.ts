import { beforeEach, describe, expect, it, vi } from 'vitest'

const SQL_CANARY = 'Failed query: update "files" set "name" = ?'
const PARAMS_CANARY = 'params: locked.md,.md,2,3'
const PATH_CANARY = '/Users/alice/Private/report.txt'
const STACK_CANARY = 'CANARY_STACK at Object.<anonymous>'
const ALL_CANARIES = [SQL_CANARY, PARAMS_CANARY, PATH_CANARY, STACK_CANARY]

const mocks = vi.hoisted(() => ({
  sdk: {
    getStatus: vi.fn(),
    getStats: vi.fn(),
    getBatteryLevel: vi.fn(),
    rebuild: vi.fn(),
    getFailedFiles: vi.fn(),
    streamProgress: vi.fn()
  },
  loggerError: vi.fn(),
  loggerWarn: vi.fn()
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useSettingsSdk: () => ({
    fileIndex: mocks.sdk
  })
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: mocks.loggerWarn,
    error: mocks.loggerError
  })
}))

vi.mock('~/utils/dev-log', () => ({
  devLog: vi.fn(),
  isDev: false
}))

import { useFileIndexMonitor } from './useFileIndexMonitor'

function canaryError(): Error {
  const error = new Error(`${SQL_CANARY}\n${PARAMS_CANARY}\n${PATH_CANARY}`)
  error.stack = STACK_CANARY
  return error
}

function expectNoCanaryInLogs(): void {
  const loggedArgs = [...mocks.loggerError.mock.calls.flat(), ...mocks.loggerWarn.mock.calls.flat()]
  const serialized = JSON.stringify(loggedArgs) ?? ''
  for (const canary of ALL_CANARIES) {
    expect(serialized).not.toContain(canary)
  }
  expect(serialized).not.toContain('Failed query:')
  expect(serialized).not.toContain('params:')
  // 不允许把捕获的 Error 对象或 transport payload 传给 logger。
  for (const arg of loggedArgs) {
    expect(arg).not.toBeInstanceOf(Error)
  }
}

describe('useFileIndexMonitor redaction (issue #476)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('logs only stable operation metadata when status queries fail', async () => {
    mocks.sdk.getStatus.mockRejectedValue(canaryError())
    mocks.sdk.getBatteryLevel.mockRejectedValue(canaryError())
    mocks.sdk.getFailedFiles.mockRejectedValue(canaryError())
    mocks.sdk.getStats.mockRejectedValue(canaryError())

    const monitor = useFileIndexMonitor()
    await expect(monitor.getIndexStatus()).resolves.toBeNull()
    await expect(monitor.getBatteryLevel()).resolves.toBeNull()
    await expect(monitor.getFailedFiles()).resolves.toEqual({ files: [] })
    await expect(monitor.getIndexStats()).resolves.toBeNull()

    expect(mocks.loggerError).toHaveBeenCalledTimes(4)
    expectNoCanaryInLogs()
  })

  it('normalizes transport rebuild failures into a stable result without raw logging', async () => {
    mocks.sdk.rebuild.mockRejectedValue(canaryError())

    const monitor = useFileIndexMonitor()
    const result = await monitor.handleRebuild()

    expect(result).toEqual({ success: false, errorCode: 'FILE_INDEX_REBUILD_TRANSPORT_FAILED' })
    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
    expectNoCanaryInLogs()
  })

  it('logs only errorCode/reportId for projected rebuild failures', async () => {
    mocks.sdk.rebuild.mockResolvedValue({
      success: false,
      errorCode: 'FILE_INDEX_DATABASE_BUSY',
      retryable: true,
      reportId: 'report-1'
    })

    const monitor = useFileIndexMonitor()
    const result = await monitor.handleRebuild({ force: true })

    expect(result).toEqual({
      success: false,
      errorCode: 'FILE_INDEX_DATABASE_BUSY',
      retryable: true,
      reportId: 'report-1'
    })
    expect(mocks.loggerWarn).toHaveBeenCalledWith('Rebuild failed', {
      errorCode: 'FILE_INDEX_DATABASE_BUSY',
      reportId: 'report-1'
    })
    expectNoCanaryInLogs()
  })

  it('keeps progress stream errors out of the renderer log payload', async () => {
    let errorCallback: (() => void) | undefined
    mocks.sdk.streamProgress.mockImplementation(async (options: { onError?: () => void }) => {
      errorCallback = options.onError
      return { cancel: vi.fn() }
    })

    const monitor = useFileIndexMonitor()
    const unsubscribe = monitor.onProgressUpdate(vi.fn())
    await vi.waitFor(() => expect(errorCallback).toBeDefined())

    errorCallback!()
    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
    expectNoCanaryInLogs()
    unsubscribe()
  })

  it('normalizes startup stats timeouts without inspecting raw error text', async () => {
    mocks.sdk.getStats.mockRejectedValue(new Error('request timed out'))

    const monitor = useFileIndexMonitor()
    await expect(monitor.getIndexStats()).resolves.toBeNull()
    expect(mocks.loggerError).toHaveBeenCalledWith('Failed to get index stats', {
      operation: 'getStats'
    })
    expectNoCanaryInLogs()
  })
})
