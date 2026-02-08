import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const appMock = {
  isPackaged: false,
  quit: vi.fn()
}

const dialogMock = {
  showMessageBox: vi.fn(),
  showErrorBox: vi.fn()
}

vi.mock('electron', () => ({
  app: appMock,
  dialog: dialogMock
}))

vi.mock('../utils/logger', () => ({
  mainLog: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  }
}))

let guard: typeof import('./startup-version-guard')

beforeAll(async () => {
  guard = await import('./startup-version-guard')
})

beforeEach(() => {
  appMock.isPackaged = false
  appMock.quit.mockReset()
  dialogMock.showErrorBox.mockReset()
  dialogMock.showMessageBox.mockReset()
  guard.resetStartupVersionGuardDepsForTest()
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(() => {
  vi.clearAllMocks()
})

describe('startup-version-guard', () => {
  it('parses windows tasklist rows into pids', () => {
    const pids = guard.parsePidsFromOutput(
      [
        '"tuff.exe","1234","Console","1","10,000 K"',
        '"tuff.exe","5678","Console","1","12,000 K"'
      ].join('\n')
    )

    expect(new Set(pids)).toEqual(new Set([1234, 5678]))
  })

  it('parses mixed pid output and removes invalid/duplicate entries', () => {
    const pids = guard.parsePidsFromOutput(
      [
        'INFO: No tasks are running which match the specified criteria.',
        '1234',
        '1234',
        '5678 extra text',
        'invalid-line'
      ].join('\n')
    )

    expect(new Set(pids)).toEqual(new Set([1234, 5678]))
  })

  it('allows startup immediately when running packaged build', async () => {
    guard.setStartupVersionGuardDepsForTest({
      isPackaged: () => true
    })

    const result = await guard.enforceDevReleaseStartupConstraint()

    expect(result).toBe(true)
    expect(appMock.quit).not.toHaveBeenCalled()
  })

  it('allows dev startup when no release process is detected', async () => {
    const findRunningReleasePids = vi.fn().mockResolvedValue([])

    guard.setStartupVersionGuardDepsForTest({
      isPackaged: () => false,
      findRunningReleasePids,
      quit: appMock.quit,
      showErrorBox: dialogMock.showErrorBox
    })

    const result = await guard.enforceDevReleaseStartupConstraint()

    expect(result).toBe(true)
    expect(findRunningReleasePids).toHaveBeenCalledTimes(1)
    expect(appMock.quit).not.toHaveBeenCalled()
  })

  it('quits dev startup when user keeps release build', async () => {
    const promptVersionChoice = vi.fn().mockResolvedValue('keep-release')

    guard.setStartupVersionGuardDepsForTest({
      findRunningReleasePids: vi.fn().mockResolvedValue([2000]),
      promptVersionChoice,
      terminateReleasePids: vi.fn().mockResolvedValue(true),
      quit: appMock.quit,
      showErrorBox: dialogMock.showErrorBox
    })

    const result = await guard.enforceDevReleaseStartupConstraint()

    expect(result).toBe(false)
    expect(promptVersionChoice).toHaveBeenCalledTimes(1)
    expect(appMock.quit).toHaveBeenCalledTimes(1)
  })

  it('continues dev startup when choosing dev and graceful terminate succeeds', async () => {
    const terminateReleasePids = vi.fn().mockResolvedValue(true)

    guard.setStartupVersionGuardDepsForTest({
      findRunningReleasePids: vi.fn().mockResolvedValue([2001]),
      promptVersionChoice: vi.fn().mockResolvedValue('use-dev'),
      terminateReleasePids,
      quit: appMock.quit,
      showErrorBox: dialogMock.showErrorBox
    })

    const result = await guard.enforceDevReleaseStartupConstraint()

    expect(result).toBe(true)
    expect(terminateReleasePids).toHaveBeenCalledWith([2001])
    expect(appMock.quit).not.toHaveBeenCalled()
  })

  it('continues dev startup when choosing dev and force terminate succeeds', async () => {
    const terminateReleasePids = vi.fn().mockResolvedValue(true)

    guard.setStartupVersionGuardDepsForTest({
      findRunningReleasePids: vi.fn().mockResolvedValue([2002]),
      promptVersionChoice: vi.fn().mockResolvedValue('use-dev'),
      terminateReleasePids,
      quit: appMock.quit,
      showErrorBox: dialogMock.showErrorBox
    })

    const result = await guard.enforceDevReleaseStartupConstraint()

    expect(result).toBe(true)
    expect(terminateReleasePids).toHaveBeenCalledWith([2002])
  })

  it('shows error and quits when release process cannot be terminated', async () => {
    guard.setStartupVersionGuardDepsForTest({
      findRunningReleasePids: vi.fn().mockResolvedValue([2003]),
      promptVersionChoice: vi.fn().mockResolvedValue('use-dev'),
      terminateReleasePids: vi.fn().mockResolvedValue(false),
      quit: appMock.quit,
      showErrorBox: dialogMock.showErrorBox
    })

    const result = await guard.enforceDevReleaseStartupConstraint()

    expect(result).toBe(false)
    expect(dialogMock.showErrorBox).toHaveBeenCalledTimes(1)
    expect(appMock.quit).toHaveBeenCalledTimes(1)
  })
})
