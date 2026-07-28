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
  })

  it('blocks unsafe external URLs before reaching Electron shell', () => {
    const { handlers, transport } = createTransport()
    const logger = { warn: vi.fn() }

    registerSystemShellHandlers(transport as never, {
      configRootPath: () => '/tmp/tuff',
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
      logger: { warn: vi.fn() },
      registerSafeHandler: registerSafeHandler as never
    })

    expect(registerSafeHandler).toHaveBeenCalledWith(
      AppEvents.system.executeCommand,
      expect.any(Function)
    )
  })
})
