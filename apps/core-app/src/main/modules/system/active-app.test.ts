import type { DarwinFrontmostApplicationResult } from '@talex-touch/tuff-native'
import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  execFilePromiseMock,
  readlinkMock,
  withOSAdapterMock,
  getFileIconMock,
  activeAppLoggerMock,
  getDarwinFrontmostApplicationMock
} = vi.hoisted(() => ({
  execFilePromiseMock: vi.fn(),
  readlinkMock: vi.fn(),
  withOSAdapterMock: vi.fn(),
  getDarwinFrontmostApplicationMock: vi.fn(
    async (): Promise<DarwinFrontmostApplicationResult> => ({
      supported: false,
      available: false,
      reason: 'native-module-not-loaded'
    })
  ),
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
  ;(execFile as unknown as Record<symbol, unknown>)[Symbol.for('nodejs.util.promisify.custom')] =
    execFilePromiseMock
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

vi.mock('@talex-touch/tuff-native', () => ({
  getDarwinFrontmostApplication: getDarwinFrontmostApplicationMock
}))

// resolveActiveWindowLinux probes for xdotool before doing anything else, so
// without this the Linux case depends on the runner having it installed and
// returns null on CI. Spread the real module so only the probe is stubbed.
vi.mock('./linux-desktop-tools', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./linux-desktop-tools')>()),
  ensureXdotoolAvailable: vi.fn(async () => {}),
  isXdotoolAvailable: vi.fn(async () => true)
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
  getDarwinFrontmostApplicationMock.mockResolvedValue({
    supported: false,
    available: false,
    reason: 'native-module-not-loaded'
  })
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
  ;(
    activeAppService as unknown as {
      macosTimeoutBackoffUntil: number
      macosConsecutiveTimeouts: number
      lastMacOSResolveFailureLogAt: number
    }
  ).macosTimeoutBackoffUntil = 0
  ;(
    activeAppService as unknown as {
      macosTimeoutBackoffUntil: number
      macosConsecutiveTimeouts: number
      lastMacOSResolveFailureLogAt: number
    }
  ).macosConsecutiveTimeouts = 0
  ;(
    activeAppService as unknown as {
      macosTimeoutBackoffUntil: number
      macosConsecutiveTimeouts: number
      lastMacOSResolveFailureLogAt: number
    }
  ).lastMacOSResolveFailureLogAt = 0
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

  it('resolves macOS frontmost app and icon via native API without spawning osascript', async () => {
    withOSAdapterMock.mockImplementation(
      async (options: Record<string, () => Promise<unknown>>) => {
        return await options.darwin()
      }
    )
    getDarwinFrontmostApplicationMock.mockResolvedValueOnce({
      supported: true,
      available: true,
      appName: 'Safari',
      bundleId: 'com.apple.Safari',
      processId: 512,
      bundlePath: '/Applications/Safari.app',
      executablePath: '/Applications/Safari.app/Contents/MacOS/Safari',
      windowTitle: 'Apple Developer Documentation'
    })

    const result = await activeAppService.getActiveApp({ forceRefresh: true, includeIcon: true })

    expect(result).toMatchObject({
      identifier: '/Applications/Safari.app',
      displayName: 'Safari',
      bundleId: 'com.apple.Safari',
      processId: 512,
      executablePath: '/Applications/Safari.app',
      windowTitle: 'Apple Developer Documentation',
      platform: 'macos',
      icon: 'data:image/png;base64,icon'
    })
    expect(getFileIconMock).toHaveBeenCalledWith('/Applications/Safari.app', { size: 'small' })
    expect(execFilePromiseMock).not.toHaveBeenCalled()
  })

  it('returns null without spawning osascript when native macOS lookup reports no frontmost app', async () => {
    withOSAdapterMock.mockImplementation(
      async (options: Record<string, () => Promise<unknown>>) => {
        return await options.darwin()
      }
    )
    getDarwinFrontmostApplicationMock.mockResolvedValueOnce({
      supported: true,
      available: false,
      reason: 'no-frontmost-application'
    })

    await expect(
      activeAppService.getActiveApp({ forceRefresh: true, includeIcon: false })
    ).resolves.toBeNull()

    expect(execFilePromiseMock).not.toHaveBeenCalled()
  })

  it('macOS osascript 带超时,卡住的调用不会永久占住 in-flight 去重', async () => {
    // AppleScript's frontmost-process query blocks while the foreground app is beachballing or a
    // TCC prompt is up. Without a timeout the promise never settles, macosResolveInFlight is
    // never cleared, and every later lookup returns that same pending promise (#770).
    withOSAdapterMock.mockImplementation(
      async (options: Record<string, () => Promise<unknown>>) => {
        return await options.darwin()
      }
    )

    // Captured, not asserted inside the mock: the production code catches command failures, so
    // an expect() that throws in there is swallowed and the test passes on the bug.
    let observedOptions: { timeout?: number } | undefined
    execFilePromiseMock.mockImplementationOnce(
      async (_file: string, _args: string[], opts?: { timeout?: number }) => {
        observedOptions = opts
        throw Object.assign(new Error('osascript timed out'), { killed: true, signal: 'SIGTERM' })
      }
    )

    await expect(
      activeAppService.getActiveApp({ forceRefresh: true, includeIcon: false })
    ).resolves.toBeNull()

    // A hung osascript can only be escaped by a timeout, so the option itself is the contract.
    expect(observedOptions?.timeout).toBeGreaterThan(0)

    // A second lookup must actually run again rather than await the first, dead promise.
    execFilePromiseMock.mockImplementationOnce(async () => ({
      stdout: 'Safari||com.apple.Safari||321||Start Page\n',
      stderr: ''
    }))

    await expect(
      activeAppService.getActiveApp({ forceRefresh: true, includeIcon: false })
    ).resolves.toMatchObject({ displayName: 'Safari', processId: 321 })
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

describe('active-app repeated macOS timeouts', () => {
  function timeoutError() {
    return Object.assign(new Error('Command failed: osascript -e'), {
      killed: true,
      signal: 'SIGTERM'
    })
  }

  function useDarwin() {
    withOSAdapterMock.mockImplementation(
      async (options: Record<string, () => Promise<unknown>>) => {
        return await options.darwin()
      }
    )
  }

  it('stops spawning osascript once timeouts become persistent', async () => {
    useDarwin()
    execFilePromiseMock.mockImplementation(async () => {
      throw timeoutError()
    })

    // The refresh poll fires every 1500ms and each attempt burns the full
    // command timeout, so an endpoint that never answers produced a spawn every
    // ~1.5s for the whole session (278 in the log this fix came from).
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        activeAppService.getActiveApp({ forceRefresh: true, includeIcon: false })
      ).resolves.toBeNull()
    }
    expect(execFilePromiseMock).toHaveBeenCalledTimes(3)

    await expect(
      activeAppService.getActiveApp({ forceRefresh: true, includeIcon: false })
    ).resolves.toBeNull()
    await expect(
      activeAppService.getActiveApp({ forceRefresh: true, includeIcon: false })
    ).resolves.toBeNull()

    expect(execFilePromiseMock).toHaveBeenCalledTimes(3)
  })

  it('clears the timeout backoff after a successful resolve', async () => {
    useDarwin()
    execFilePromiseMock.mockImplementation(async () => {
      throw timeoutError()
    })

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await activeAppService.getActiveApp({ forceRefresh: true, includeIcon: false })
    }

    execFilePromiseMock.mockImplementation(async () => ({
      stdout: 'Safari||com.apple.Safari||321||Start Page\n',
      stderr: ''
    }))
    await expect(
      activeAppService.getActiveApp({ forceRefresh: true, includeIcon: false })
    ).resolves.toMatchObject({ displayName: 'Safari' })

    // Counter reset, so the next isolated timeout must not trip the threshold.
    execFilePromiseMock.mockImplementation(async () => {
      throw timeoutError()
    })
    await activeAppService.getActiveApp({ forceRefresh: true, includeIcon: false })

    const state = activeAppService as unknown as {
      macosTimeoutBackoffUntil: number
      macosConsecutiveTimeouts: number
    }
    expect(state.macosConsecutiveTimeouts).toBe(1)
    expect(state.macosTimeoutBackoffUntil).toBe(0)
  })

  it('throttles the generic resolution-failure log', async () => {
    useDarwin()
    execFilePromiseMock.mockImplementation(async () => {
      throw new Error('osascript exploded')
    })

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await activeAppService.getActiveApp({ forceRefresh: true, includeIcon: false })
    }

    // Each of these used to write a full stack trace embedding the AppleScript
    // source to the log file.
    expect(activeAppLoggerMock.error).toHaveBeenCalledTimes(1)
  })
})

describe('active-app macOS native TTL cache reuse', () => {
  it('reuses cached active-app result within TTL across repeated calls without extra native probes', async () => {
    withOSAdapterMock.mockImplementation(
      async (options: Record<string, () => Promise<unknown>>) => {
        return await options.darwin()
      }
    )
    getDarwinFrontmostApplicationMock.mockResolvedValue({
      supported: true,
      available: true,
      appName: 'Terminal',
      bundleId: 'com.apple.Terminal',
      processId: 4201,
      bundlePath: '/System/Applications/Utilities/Terminal.app',
      executablePath: '/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal',
      windowTitle: 'zsh'
    })

    const first = await activeAppService.getActiveApp({ includeIcon: false })
    const second = await activeAppService.getActiveApp({ includeIcon: false })

    expect(first).toBe(second)
    expect(getDarwinFrontmostApplicationMock).toHaveBeenCalledTimes(1)
    expect(execFilePromiseMock).not.toHaveBeenCalled()
  })
})
