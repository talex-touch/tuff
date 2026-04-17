import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  execFilePromiseMock,
  readlinkMock,
  withOSAdapterMock,
  getFileIconMock,
  activeAppLoggerMock
} = vi.hoisted(() => ({
  execFilePromiseMock: vi.fn(),
  readlinkMock: vi.fn(),
  withOSAdapterMock: vi.fn(),
  activeAppLoggerMock: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    child: vi.fn(),
    time: vi.fn(() => ({
      end: vi.fn(),
      split: vi.fn()
    }))
  },
  getFileIconMock: vi.fn(async () => ({
    isEmpty: () => false,
    toDataURL: () => 'data:image/png;base64,icon'
  }))
}))

vi.mock('node:child_process', () => {
  const execFile = vi.fn()
  execFile[Symbol.for('nodejs.util.promisify.custom')] = execFilePromiseMock
  return { execFile }
})

vi.mock('node:fs/promises', () => ({
  default: {
    readlink: readlinkMock
  }
}))

vi.mock('@talex-touch/utils/electron/env-tool', () => ({
  withOSAdapter: withOSAdapterMock
}))

vi.mock('electron', () => ({
  app: {
    getFileIcon: getFileIconMock
  }
}))

vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn(() => activeAppLoggerMock)
}))

import { activeAppService, isActiveAppCapabilityAvailable } from './active-app'

function mockExecFileSuccess(stdout: string) {
  execFilePromiseMock.mockResolvedValueOnce({ stdout, stderr: '' })
}

function mockExecFileFailure(code: string, message = code) {
  execFilePromiseMock.mockRejectedValueOnce(Object.assign(new Error(message), { code }))
}

afterEach(() => {
  vi.clearAllMocks()
  ;(
    activeAppService as unknown as {
      cacheWithIcon: unknown
      cacheWithoutIcon: unknown
      macosResolveInFlight: unknown
      macosPermissionBackoffUntil: number
    }
  ).cacheWithIcon = null
  ;(
    activeAppService as unknown as {
      cacheWithIcon: unknown
      cacheWithoutIcon: unknown
      macosResolveInFlight: unknown
      macosPermissionBackoffUntil: number
    }
  ).cacheWithoutIcon = null
  ;(
    activeAppService as unknown as {
      cacheWithIcon: unknown
      cacheWithoutIcon: unknown
      macosResolveInFlight: unknown
      macosPermissionBackoffUntil: number
    }
  ).macosResolveInFlight = null
  ;(
    activeAppService as unknown as {
      cacheWithIcon: unknown
      cacheWithoutIcon: unknown
      macosResolveInFlight: unknown
      macosPermissionBackoffUntil: number
    }
  ).macosPermissionBackoffUntil = 0
})

describe('active-app capability', () => {
  it('linux capability probe returns true when xdotool is available', async () => {
    mockExecFileSuccess('xdotool version 3.20211022.1')

    await expect(isActiveAppCapabilityAvailable('linux')).resolves.toBe(true)
  })

  it('linux capability probe returns false when xdotool is missing', async () => {
    mockExecFileFailure('ENOENT', 'xdotool missing')

    await expect(isActiveAppCapabilityAvailable('linux')).resolves.toBe(false)
  })
})

describe('active-app resolution', () => {
  it('parses Windows foreground app info', async () => {
    withOSAdapterMock.mockImplementation(
      async (options: Record<string, () => Promise<unknown>>) => {
        return await options.win32()
      }
    )
    mockExecFileSuccess(
      JSON.stringify({
        processId: 404,
        displayName: 'Code',
        executablePath: 'C:\\Program Files\\Code.exe',
        windowTitle: 'workspace'
      })
    )

    const result = await activeAppService.getActiveApp({ forceRefresh: true, includeIcon: false })

    expect(result).toMatchObject({
      displayName: 'Code',
      processId: 404,
      executablePath: 'C:\\Program Files\\Code.exe',
      windowTitle: 'workspace',
      platform: 'windows',
      icon: null
    })
  })

  it('parses Linux foreground app info via xdotool + ps', async () => {
    withOSAdapterMock.mockImplementation(
      async (options: Record<string, () => Promise<unknown>>) => {
        return await options.linux()
      }
    )
    mockExecFileSuccess('91234\n')
    mockExecFileSuccess('2456\n')
    mockExecFileSuccess('Terminal\n')
    mockExecFileSuccess('gnome-terminal\n')
    readlinkMock.mockResolvedValueOnce('/usr/bin/gnome-terminal')

    const result = await activeAppService.getActiveApp({ forceRefresh: true, includeIcon: false })

    expect(result).toMatchObject({
      displayName: 'gnome-terminal',
      processId: 2456,
      executablePath: '/usr/bin/gnome-terminal',
      windowTitle: 'Terminal',
      platform: 'linux',
      icon: null
    })
  })

  it('returns null when platform command output is malformed', async () => {
    withOSAdapterMock.mockImplementation(
      async (options: Record<string, () => Promise<unknown>>) => {
        return await options.win32()
      }
    )
    mockExecFileSuccess('{ invalid json')

    await expect(
      activeAppService.getActiveApp({ forceRefresh: true, includeIcon: false })
    ).resolves.toBeNull()
  })

  it('backs off when macOS automation permission is missing', async () => {
    withOSAdapterMock.mockImplementation(
      async (options: Record<string, () => Promise<unknown>>) => {
        return await options.darwin()
      }
    )
    execFilePromiseMock.mockRejectedValueOnce(
      Object.assign(new Error('Not authorized to send Apple events to System Events. (-1743)'), {
        stderr: 'Not authorized to send Apple events to System Events. (-1743)\n'
      })
    )

    await expect(
      activeAppService.getActiveApp({ forceRefresh: true, includeIcon: false })
    ).resolves.toBeNull()

    expect(activeAppLoggerMock.warn).toHaveBeenCalledWith(
      'macOS automation permission missing, active-app lookup suspended briefly',
      expect.objectContaining({
        meta: expect.objectContaining({ backoffMs: 60_000 })
      })
    )
    expect(activeAppLoggerMock.error).not.toHaveBeenCalled()

    execFilePromiseMock.mockClear()
    activeAppLoggerMock.warn.mockClear()

    await expect(
      activeAppService.getActiveApp({ forceRefresh: true, includeIcon: false })
    ).resolves.toBeNull()

    expect(execFilePromiseMock).not.toHaveBeenCalled()
    expect(activeAppLoggerMock.warn).not.toHaveBeenCalled()
  })
})
