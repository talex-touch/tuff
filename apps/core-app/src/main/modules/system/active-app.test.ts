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

import { activeAppService } from './active-app'

function mockExecFileSuccess(stdout: string) {
  execFilePromiseMock.mockResolvedValueOnce({ stdout, stderr: '' })
}

afterEach(() => {
  vi.clearAllMocks()
  ;(
    activeAppService as unknown as {
      cacheWithIcon: unknown
      cacheWithoutIcon: unknown
      macosResolveInFlight: unknown
      macosPermissionBackoffUntil: number
      macosEbadfBackoffUntil: number
    }
  ).cacheWithIcon = null
  ;(
    activeAppService as unknown as {
      cacheWithIcon: unknown
      cacheWithoutIcon: unknown
      macosResolveInFlight: unknown
      macosPermissionBackoffUntil: number
      macosEbadfBackoffUntil: number
    }
  ).cacheWithoutIcon = null
  ;(
    activeAppService as unknown as {
      cacheWithIcon: unknown
      cacheWithoutIcon: unknown
      macosResolveInFlight: unknown
      macosPermissionBackoffUntil: number
      macosEbadfBackoffUntil: number
    }
  ).macosResolveInFlight = null
  ;(
    activeAppService as unknown as {
      cacheWithIcon: unknown
      cacheWithoutIcon: unknown
      macosResolveInFlight: unknown
      macosPermissionBackoffUntil: number
      macosEbadfBackoffUntil: number
    }
  ).macosPermissionBackoffUntil = 0
  ;(
    activeAppService as unknown as {
      cacheWithIcon: unknown
      cacheWithoutIcon: unknown
      macosResolveInFlight: unknown
      macosPermissionBackoffUntil: number
      macosEbadfBackoffUntil: number
    }
  ).macosEbadfBackoffUntil = 0
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

  it('does not resolve app icons by default', async () => {
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

    const result = await activeAppService.getActiveApp(true)

    expect(result).toMatchObject({
      displayName: 'Code',
      icon: null
    })
    expect(getFileIconMock).not.toHaveBeenCalled()
  })

  it('resolves app icons only when includeIcon is true', async () => {
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

    const result = await activeAppService.getActiveApp({ forceRefresh: true, includeIcon: true })

    expect(result).toMatchObject({
      displayName: 'Code',
      icon: 'data:image/png;base64,icon'
    })
    expect(getFileIconMock).toHaveBeenCalledWith('C:\\Program Files\\Code.exe', { size: 'small' })
  })

  it('parses Windows foreground JSON when PowerShell emits warning lines first', async () => {
    withOSAdapterMock.mockImplementation(
      async (options: Record<string, () => Promise<unknown>>) => {
        return await options.win32()
      }
    )
    mockExecFileSuccess(
      [
        'WARNING: native module already loaded',
        JSON.stringify({
          processId: 404,
          displayName: 'Code',
          executablePath: 'C:\\Program Files\\Code.exe',
          windowTitle: 'workspace'
        })
      ].join('\n')
    )

    const result = await activeAppService.getActiveApp({ forceRefresh: true, includeIcon: false })

    expect(result).toMatchObject({
      displayName: 'Code',
      processId: 404,
      executablePath: 'C:\\Program Files\\Code.exe'
    })
  })

  it('logs compact Windows command failure diagnostics', async () => {
    withOSAdapterMock.mockImplementation(
      async (options: Record<string, () => Promise<unknown>>) => {
        return await options.win32()
      }
    )
    execFilePromiseMock.mockRejectedValueOnce(
      Object.assign(
        new Error(`Command failed: powershell -NoProfile -Command
$ErrorActionPreference = 'Stop'
Add-Type "..."
ConvertTo-Json -Compress`),
        {
          code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
        }
      )
    )

    await expect(
      activeAppService.getActiveApp({ forceRefresh: true, includeIcon: false })
    ).resolves.toBeNull()

    expect(activeAppLoggerMock.warn).toHaveBeenCalledWith(
      'Windows active-app resolution failed',
      expect.objectContaining({
        meta: expect.objectContaining({
          code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
          message: 'Command failed: powershell -NoProfile -Command <script>'
        })
      })
    )
  })

  it('prefers stderr for compact Windows command failure diagnostics', async () => {
    withOSAdapterMock.mockImplementation(
      async (options: Record<string, () => Promise<unknown>>) => {
        return await options.win32()
      }
    )
    execFilePromiseMock.mockRejectedValueOnce(
      Object.assign(new Error('Command failed: powershell -Command <script>'), {
        stderr: 'Access denied\r\nat line:1',
        code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
      })
    )

    await expect(
      activeAppService.getActiveApp({ forceRefresh: true, includeIcon: false })
    ).resolves.toBeNull()

    expect(activeAppLoggerMock.warn).toHaveBeenCalledWith(
      'Windows active-app resolution failed',
      expect.objectContaining({
        meta: expect.objectContaining({
          code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
          message: 'Access denied'
        })
      })
    )
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

  it('backs off after repeated macOS EBADF spawn failures', async () => {
    withOSAdapterMock.mockImplementation(
      async (options: Record<string, () => Promise<unknown>>) => {
        return await options.darwin()
      }
    )
    const ebadfError = Object.assign(new Error('spawn EBADF'), { code: 'EBADF' })
    execFilePromiseMock.mockRejectedValueOnce(ebadfError)
    execFilePromiseMock.mockRejectedValueOnce(ebadfError)

    await expect(
      activeAppService.getActiveApp({ forceRefresh: true, includeIcon: false })
    ).resolves.toBeNull()

    expect(activeAppLoggerMock.warn).toHaveBeenCalledWith(
      'macOS resolution hit EBADF, retrying once',
      expect.objectContaining({
        meta: expect.objectContaining({ delayMs: 80 })
      })
    )
    expect(activeAppLoggerMock.warn).toHaveBeenCalledWith(
      'macOS active-app lookup temporarily unavailable after EBADF',
      expect.objectContaining({
        meta: expect.objectContaining({
          backoffMs: 10_000,
          message: 'spawn EBADF'
        })
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
