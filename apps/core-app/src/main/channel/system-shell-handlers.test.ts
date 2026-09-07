import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { registerSystemShellHandlers } from './system-shell-handlers'

const { fsStatMock, shellOpenExternalMock, shellOpenPathMock, shellShowItemInFolderMock } =
  vi.hoisted(() => ({
    fsStatMock: vi.fn(),
    shellOpenExternalMock: vi.fn(),
    shellOpenPathMock: vi.fn(async () => ''),
    shellShowItemInFolderMock: vi.fn()
  }))

const { checkPermissionMock, getPermissionModuleMock } = vi.hoisted(() => {
  const checkPermissionMock = vi.fn(
    () => ({ allowed: true }) as { allowed: boolean; reason?: string }
  )
  return {
    checkPermissionMock,
    getPermissionModuleMock: vi.fn(() => ({ checkPermission: checkPermissionMock }))
  }
})

vi.mock('../modules/permission/permission-module-ref', () => ({
  getPermissionModule: getPermissionModuleMock
}))

// withPermission resolves a plugin's declared sdkapi through the plugin module; pulling the
// real one in would boot half the main process for a check these tests do not exercise.
vi.mock('../modules/plugin/plugin-module', () => ({
  pluginModule: { pluginManager: { getPluginByName: () => undefined } }
}))

vi.mock('node:fs/promises', () => ({
  default: {
    stat: fsStatMock
  }
}))

vi.mock('electron', () => ({
  shell: {
    openExternal: shellOpenExternalMock,
    openPath: shellOpenPathMock,
    showItemInFolder: shellShowItemInFolderMock
  }
}))

function createTransport() {
  const handlers = new Map<string, (payload: unknown, context: unknown) => unknown>()
  return {
    handlers,
    transport: {
      on: vi.fn((event: { toEventName: () => string }, handler) => {
        handlers.set(event.toEventName(), handler)
        return vi.fn()
      })
    }
  }
}

function getHandler(
  handlers: Map<string, (payload: unknown, context: unknown) => unknown>,
  eventName: string
) {
  const handler = handlers.get(eventName)
  expect(handler).toBeTypeOf('function')
  if (!handler) {
    throw new Error(`Missing handler for ${eventName}`)
  }
  return handler
}

describe('registerSystemShellHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fsStatMock.mockReset()
    shellOpenPathMock.mockReset()
    shellOpenPathMock.mockResolvedValue('')
    checkPermissionMock.mockReturnValue({ allowed: true })
  })

  /**
   * These two events are on the plugin-facing allowlist, so a plugin surface can reach them.
   * The allowlist decides who is heard, not who is allowed — `system.shell` is what decides
   * the latter, and it has to hold for the surface exactly as it does for the Prelude's
   * `open-url` capability. Without a plugin context in play the earlier cases would pass on
   * a handler with no gate at all, so the gate needs its own evidence.
   */
  describe('the system.shell gate', () => {
    function registerAndGet(eventName: string) {
      const { handlers, transport } = createTransport()
      registerSystemShellHandlers(transport as never, {
        configRootPath: () => '/tmp/tuff',
        appRootPath: () => '/tmp/tuff',
        logger: { warn: vi.fn() },
        registerSafeHandler: vi.fn(() => vi.fn()) as never
      })
      return getHandler(handlers, eventName)
    }

    it('refuses a plugin without system.shell, for both events', async () => {
      checkPermissionMock.mockReturnValue({ allowed: false, reason: 'not granted' })
      const pluginContext = { plugin: { name: 'com.example.greedy' } }

      await expect(
        registerAndGet(AppEvents.system.openExternal.toEventName())(
          { url: 'https://example.com/docs' },
          pluginContext
        )
      ).rejects.toMatchObject({ code: 'SYSTEM_SHELL_PERMISSION_DENIED' })

      fsStatMock.mockResolvedValue({ isDirectory: () => false })
      await expect(
        registerAndGet(AppEvents.system.showInFolder.toEventName())(
          { path: '/Users/demo/secret.txt' },
          pluginContext
        )
      ).rejects.toMatchObject({ code: 'SYSTEM_SHELL_PERMISSION_DENIED' })

      expect(shellOpenExternalMock).not.toHaveBeenCalled()
      // The reveal path is also an existence oracle, so the stat must not run either.
      expect(fsStatMock).not.toHaveBeenCalled()
      expect(shellShowItemInFolderMock).not.toHaveBeenCalled()
    })

    it('lets a plugin holding system.shell through', async () => {
      fsStatMock.mockResolvedValue({ isDirectory: () => false })
      const pluginContext = { plugin: { name: 'com.tuffex.clipboard-history' } }

      await registerAndGet(AppEvents.system.openExternal.toEventName())(
        { url: 'https://example.com/docs' },
        pluginContext
      )
      await registerAndGet(AppEvents.system.showInFolder.toEventName())(
        { path: '/Users/demo/a.pdf' },
        pluginContext
      )

      expect(checkPermissionMock).toHaveBeenCalledWith(
        'com.tuffex.clipboard-history',
        'system.shell',
        undefined
      )
      expect(shellOpenExternalMock).toHaveBeenCalledWith('https://example.com/docs')
      expect(shellShowItemInFolderMock).toHaveBeenCalledWith('/Users/demo/a.pdf')
    })

    it('still lets the host renderer through, which carries no plugin context', async () => {
      checkPermissionMock.mockReturnValue({ allowed: false, reason: 'not granted' })

      await registerAndGet(AppEvents.system.openExternal.toEventName())(
        { url: 'https://example.com/docs' },
        {}
      )

      expect(shellOpenExternalMock).toHaveBeenCalledWith('https://example.com/docs')
      expect(checkPermissionMock).not.toHaveBeenCalled()
    })
  })

  it('blocks unsafe external URLs before reaching Electron shell', () => {
    const { handlers, transport } = createTransport()
    const logger = { warn: vi.fn() }

    registerSystemShellHandlers(transport as never, {
      configRootPath: () => '/tmp/tuff',
      appRootPath: () => '/tmp/tuff',
      logger,
      registerSafeHandler: vi.fn(() => vi.fn()) as never
    })

    const handler = handlers.get(AppEvents.system.openExternal.toEventName())
    expect(handler).toBeTypeOf('function')

    handler?.({ url: 'javascript:alert(1)' }, {})

    expect(shellOpenExternalMock).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(
      'Blocked external URL open request',
      expect.objectContaining({ meta: expect.objectContaining({ reason: 'blocked-protocol' }) })
    )
  })

  it('opens validated external URLs', () => {
    const { handlers, transport } = createTransport()

    registerSystemShellHandlers(transport as never, {
      configRootPath: () => '/tmp/tuff',
      appRootPath: () => '/tmp/tuff',
      logger: { warn: vi.fn() },
      registerSafeHandler: vi.fn(() => vi.fn()) as never
    })

    handlers.get(AppEvents.system.openExternal.toEventName())?.(
      { url: 'https://example.com/docs' },
      {}
    )

    expect(shellOpenExternalMock).toHaveBeenCalledWith('https://example.com/docs')
  })

  it('opens directories directly', async () => {
    fsStatMock.mockResolvedValueOnce({ isDirectory: () => true })
    const { handlers, transport } = createTransport()

    registerSystemShellHandlers(transport as never, {
      configRootPath: () => '/tmp/tuff',
      appRootPath: () => '/tmp/tuff',
      logger: { warn: vi.fn() },
      registerSafeHandler: vi.fn(() => vi.fn()) as never
    })

    const handler = getHandler(handlers, AppEvents.system.showInFolder.toEventName())
    await handler({ path: '/tmp/tuff/plugins ' }, {})

    expect(fsStatMock).toHaveBeenCalledWith('/tmp/tuff/plugins ')
    expect(shellOpenPathMock).toHaveBeenCalledWith('/tmp/tuff/plugins ')
    expect(shellShowItemInFolderMock).not.toHaveBeenCalled()
  })

  it('rejects when Electron fails to open a directory', async () => {
    fsStatMock.mockResolvedValueOnce({ isDirectory: () => true })
    shellOpenPathMock.mockResolvedValueOnce('Failed to open /Users/private/plugins')
    const { handlers, transport } = createTransport()

    registerSystemShellHandlers(transport as never, {
      configRootPath: () => '/tmp/tuff',
      appRootPath: () => '/tmp/tuff',
      logger: { warn: vi.fn() },
      registerSafeHandler: vi.fn(() => vi.fn()) as never
    })

    const handler = getHandler(handlers, AppEvents.system.showInFolder.toEventName())
    const result = handler({ path: '/Users/private/plugins' }, {})

    await expect(result).rejects.toThrow(/^SYSTEM_SHELL_OPEN_PATH_FAILED$/)
    expect(shellOpenPathMock).toHaveBeenCalledWith('/Users/private/plugins')
    expect(shellShowItemInFolderMock).not.toHaveBeenCalled()
  })

  it('sanitizes rejected Electron directory-open errors', async () => {
    fsStatMock.mockResolvedValueOnce({ isDirectory: () => true })
    shellOpenPathMock.mockRejectedValueOnce(new Error('Cannot open /Users/private/plugins'))
    const { handlers, transport } = createTransport()

    registerSystemShellHandlers(transport as never, {
      configRootPath: () => '/tmp/tuff',
      appRootPath: () => '/tmp/tuff',
      logger: { warn: vi.fn() },
      registerSafeHandler: vi.fn(() => vi.fn()) as never
    })

    const handler = getHandler(handlers, AppEvents.system.showInFolder.toEventName())
    const result = handler({ path: '/Users/private/plugins' }, {})

    await expect(result).rejects.toThrow(/^SYSTEM_SHELL_OPEN_PATH_FAILED$/)
    expect(shellOpenPathMock).toHaveBeenCalledWith('/Users/private/plugins')
    expect(shellShowItemInFolderMock).not.toHaveBeenCalled()
  })

  it('reveals regular files in their containing folder', async () => {
    fsStatMock.mockResolvedValueOnce({ isDirectory: () => false })
    const { handlers, transport } = createTransport()

    registerSystemShellHandlers(transport as never, {
      configRootPath: () => '/tmp/tuff',
      appRootPath: () => '/tmp/tuff',
      logger: { warn: vi.fn() },
      registerSafeHandler: vi.fn(() => vi.fn()) as never
    })

    const handler = getHandler(handlers, AppEvents.system.showInFolder.toEventName())
    await handler({ path: '/tmp/tuff/plugin.json' }, {})

    expect(shellShowItemInFolderMock).toHaveBeenCalledWith('/tmp/tuff/plugin.json')
    expect(shellOpenPathMock).not.toHaveBeenCalled()
  })

  it('rejects empty folder targets', async () => {
    const { handlers, transport } = createTransport()

    registerSystemShellHandlers(transport as never, {
      configRootPath: () => '/tmp/tuff',
      appRootPath: () => '/tmp/tuff',
      logger: { warn: vi.fn() },
      registerSafeHandler: vi.fn(() => vi.fn()) as never
    })

    const handler = getHandler(handlers, AppEvents.system.showInFolder.toEventName())
    const result = handler({ path: '   ' }, {})

    await expect(result).rejects.toThrow(/^SYSTEM_SHELL_PATH_REQUIRED$/)
    expect(fsStatMock).not.toHaveBeenCalled()
    expect(shellOpenPathMock).not.toHaveBeenCalled()
    expect(shellShowItemInFolderMock).not.toHaveBeenCalled()
  })

  it('rejects inaccessible folder targets without exposing the path', async () => {
    fsStatMock.mockRejectedValueOnce(new Error('Path does not exist: /Users/private/missing'))
    const { handlers, transport } = createTransport()

    registerSystemShellHandlers(transport as never, {
      configRootPath: () => '/tmp/tuff',
      appRootPath: () => '/tmp/tuff',
      logger: { warn: vi.fn() },
      registerSafeHandler: vi.fn(() => vi.fn()) as never
    })

    const handler = getHandler(handlers, AppEvents.system.showInFolder.toEventName())
    const result = handler({ path: '/Users/private/missing' }, {})

    await expect(result).rejects.toThrow(/^SYSTEM_SHELL_PATH_UNAVAILABLE$/)
    expect(fsStatMock).toHaveBeenCalledWith('/Users/private/missing')
    expect(shellOpenPathMock).not.toHaveBeenCalled()
    expect(shellShowItemInFolderMock).not.toHaveBeenCalled()
  })

  it('opens the prompt library folder when it exists', async () => {
    fsStatMock.mockResolvedValueOnce({})
    const { handlers, transport } = createTransport()

    registerSystemShellHandlers(transport as never, {
      configRootPath: () => '/tmp/tuff/config',
      appRootPath: () => '/tmp/tuff',
      logger: { warn: vi.fn() },
      registerSafeHandler: vi.fn(() => vi.fn()) as never
    })

    await handlers.get(AppEvents.system.openPromptsFolder.toEventName())?.({}, {})

    expect(shellShowItemInFolderMock).toHaveBeenCalledWith(
      '/tmp/tuff/config/intelligence/prompt-library'
    )
    expect(shellOpenPathMock).not.toHaveBeenCalled()
  })

  it('falls back to the config root when prompt library is missing', async () => {
    fsStatMock.mockRejectedValueOnce(new Error('missing'))
    const { handlers, transport } = createTransport()

    registerSystemShellHandlers(transport as never, {
      configRootPath: () => '/tmp/tuff/config',
      appRootPath: () => '/tmp/tuff',
      logger: { warn: vi.fn() },
      registerSafeHandler: vi.fn(() => vi.fn()) as never
    })

    await handlers.get(AppEvents.system.openPromptsFolder.toEventName())?.({}, {})

    expect(shellOpenPathMock).toHaveBeenCalledWith('/tmp/tuff/config')
  })

  it('registers executeCommand through the provided safe handler', () => {
    const { transport } = createTransport()
    const registerSafeHandler = vi.fn(() => vi.fn())

    registerSystemShellHandlers(transport as never, {
      configRootPath: () => '/tmp/tuff',
      appRootPath: () => '/tmp/tuff',
      logger: { warn: vi.fn() },
      registerSafeHandler: registerSafeHandler as never
    })

    expect(registerSafeHandler).toHaveBeenCalledWith(
      AppEvents.system.executeCommand,
      expect.any(Function)
    )
  })
})

/**
 * What executeCommand is allowed to open (#909).
 *
 * shell.openPath does not run a command — it hands the path to the OS association, so a
 * .command, .bat or .app is executed. The handler accepted any caller-supplied string, which
 * meant a plugin could write a script through the download handler and then ask the main
 * process to launch it.
 *
 * The only caller in the app is Settings > About opening the application folder, so the
 * surface it needs is a directory inside the app's own root.
 */
describe('executeCommand path restriction', () => {
  const APP_ROOT = '/tmp/tuff'

  function executeCommandHandler(): (payload: { command?: string }) => Promise<void> {
    const { transport } = createTransport()
    let captured: ((payload: { command?: string }) => Promise<void>) | null = null
    registerSystemShellHandlers(transport as never, {
      configRootPath: () => '/tmp/tuff/config',
      appRootPath: () => APP_ROOT,
      logger: { warn: vi.fn() },
      registerSafeHandler: ((event: { toEventName: () => string }, handler: unknown) => {
        if (event.toEventName() === AppEvents.system.executeCommand.toEventName()) {
          captured = handler as (payload: { command?: string }) => Promise<void>
        }
        return vi.fn()
      }) as never
    })
    if (!captured) throw new Error('executeCommand handler was not registered')
    return captured
  }

  beforeEach(() => {
    fsStatMock.mockReset()
    shellOpenPathMock.mockReset()
    shellOpenPathMock.mockResolvedValue('')
  })

  function asDirectory(): void {
    fsStatMock.mockResolvedValue({ isDirectory: () => true } as never)
  }

  function asFile(): void {
    fsStatMock.mockResolvedValue({ isDirectory: () => false } as never)
  }

  it('opens the application folder, which is the one real caller', async () => {
    // Positive control: Settings > About sends touchApp.rootPath verbatim.
    asDirectory()
    await executeCommandHandler()({ command: APP_ROOT })
    expect(shellOpenPathMock).toHaveBeenCalledWith(APP_ROOT)
  })

  it('opens a directory beneath the app root', async () => {
    asDirectory()
    await executeCommandHandler()({ command: `${APP_ROOT}/plugins` })
    expect(shellOpenPathMock).toHaveBeenCalledWith(`${APP_ROOT}/plugins`)
  })

  it('refuses a path outside the app root', async () => {
    asDirectory()
    await expect(executeCommandHandler()({ command: '/tmp/evil' })).rejects.toThrow(
      'SYSTEM_SHELL_PATH_OUTSIDE_APP_ROOT'
    )
    expect(shellOpenPathMock).not.toHaveBeenCalled()
  })

  it('refuses a sibling directory that merely shares the root prefix', async () => {
    asDirectory()
    await expect(executeCommandHandler()({ command: `${APP_ROOT}-backup/x` })).rejects.toThrow(
      'SYSTEM_SHELL_PATH_OUTSIDE_APP_ROOT'
    )
  })

  it('refuses a traversal that climbs out of the root', async () => {
    asDirectory()
    await expect(
      executeCommandHandler()({ command: `${APP_ROOT}/../../etc/passwd` })
    ).rejects.toThrow('SYSTEM_SHELL_PATH_OUTSIDE_APP_ROOT')
  })

  it('refuses a script file even inside the app root', async () => {
    // The download handler can write into app storage, so "inside the root" alone is not safe.
    asFile()
    await expect(
      executeCommandHandler()({ command: `${APP_ROOT}/payload.command` })
    ).rejects.toThrow('SYSTEM_SHELL_PATH_NOT_A_DIRECTORY')
    expect(shellOpenPathMock).not.toHaveBeenCalled()
  })

  it('refuses a .app bundle inside the app root, which is a directory that executes', async () => {
    asDirectory()
    await expect(executeCommandHandler()({ command: `${APP_ROOT}/Evil.app` })).rejects.toThrow(
      'SYSTEM_SHELL_PATH_NOT_A_DIRECTORY'
    )
    expect(shellOpenPathMock).not.toHaveBeenCalled()
  })

  it('refuses a path that does not exist', async () => {
    fsStatMock.mockRejectedValue(new Error('ENOENT'))
    await expect(executeCommandHandler()({ command: `${APP_ROOT}/missing` })).rejects.toThrow(
      'SYSTEM_SHELL_PATH_UNAVAILABLE'
    )
  })

  it('still rejects an empty command', async () => {
    await expect(executeCommandHandler()({ command: '' })).rejects.toThrow('No command provided')
  })
})

/**
 * The openApp handler's side of the installed-application check (#908).
 *
 * evaluateInstalledAppPath is unit-tested next to itself; these two assert the handler
 * consults it at all, which is the part a refactor can silently drop.
 */
describe('openApp target validation', () => {
  function openAppHandler(): (payload: { appName?: string; path?: string }) => unknown {
    const { transport, handlers } = createTransport()
    registerSystemShellHandlers(transport as never, {
      configRootPath: () => '/tmp/tuff/config',
      appRootPath: () => '/tmp/tuff',
      logger: { warn: vi.fn() },
      registerSafeHandler: (() => vi.fn()) as never
    })
    const handler = handlers.get(AppEvents.system.openApp.toEventName())
    if (!handler) throw new Error('openApp handler was not registered')
    return handler as (payload: { appName?: string; path?: string }) => unknown
  }

  beforeEach(() => {
    shellOpenPathMock.mockClear()
  })

  it('does not open a file the caller dropped outside the application roots', () => {
    openAppHandler()({ path: `${os.homedir()}/Library/Caches/payload.command` })
    expect(shellOpenPathMock).not.toHaveBeenCalled()
  })

  it('does not open a bare application name', () => {
    openAppHandler()({ appName: 'Safari' })
    expect(shellOpenPathMock).not.toHaveBeenCalled()
  })

  it('opens an installed application', () => {
    // Platform-specific so the positive control is meaningful wherever CI runs.
    const app =
      process.platform === 'darwin'
        ? '/Applications/Example.app'
        : process.platform === 'win32'
          ? path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'x.exe')
          : '/usr/share/applications/example.desktop'
    openAppHandler()({ path: app })
    expect(shellOpenPathMock).toHaveBeenCalledWith(app)
  })
})
