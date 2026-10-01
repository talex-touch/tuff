import { PluginEvents } from '@talex-touch/utils/transport/events'
import { describe, expect, it, vi } from 'vitest'
import { registerPluginWindowTransportHandlers } from './plugin-window-transport-service'

vi.mock('../../../core/touch-window', () => ({ TouchWindow: class {} }))
vi.mock('../../../hooks/use-electron-guard', () => ({ useAliveTarget: vi.fn() }))
vi.mock('../../permission', () => ({
  createProtectedRegister:
    (transport: { on: (event: unknown, handler: unknown) => () => void }) =>
    (event: unknown, _options: unknown, handler: unknown) =>
      transport.on(event, handler)
}))
vi.mock('../../storage', () => ({ getMainConfig: vi.fn() }))
vi.mock('../plugin', () => ({ TouchPlugin: class {} }))
vi.mock('../runtime/plugin-injections', () => ({ usePluginInjections: vi.fn() }))
vi.mock('../runtime/plugin-view-security-profile', () => ({
  resolvePluginViewSecurityProfile: vi.fn()
}))
vi.mock('../runtime/plugin-view-registry', () => ({
  registerPluginWebContents: vi.fn(),
  unregisterPluginWebContents: vi.fn()
}))
vi.mock('../runtime/plugin-view-host', () => ({
  buildPluginViewWebPreferences: vi.fn(),
  buildPublicPluginWindowOptions: vi.fn()
}))
vi.mock('../runtime/plugin-window-policy', () => ({
  createPluginViewNavigationPolicy: vi.fn(),
  executePluginWindowCommand: vi.fn(),
  installPluginViewNavigationPolicy: vi.fn(),
  normalizePluginWindowCommand: vi.fn(),
  normalizePluginWindowRequest: vi.fn(),
  resolveLocalPluginWindowTarget: vi.fn(),
  toPluginWindowErrorData: vi.fn(),
  translateLegacyWindowProperty: vi.fn()
}))

function createHarness(onMessage: ReturnType<typeof vi.fn>) {
  const handlers = new Map<unknown, (data: unknown, context: unknown) => Promise<unknown>>()
  const transport = {
    on: vi.fn((event: unknown, handler: (data: unknown, context: unknown) => Promise<unknown>) => {
      handlers.set(event, handler)
      return vi.fn()
    })
  }
  const plugin = {
    getFeatureLifeCycle: vi.fn(() => ({ onMessage }))
  }
  const logHandlerError = vi.fn()
  registerPluginWindowTransportHandlers({
    manager: {
      plugins: new Map([['touch-browser-open', plugin]]),
      getPluginByName: vi.fn(() => plugin)
    } as never,
    transport: transport as never,
    ipcLog: { info: vi.fn(), warn: vi.fn() },
    logHandlerError,
    toErrorMessage: (error) => (error instanceof Error ? error.message : String(error))
  })
  const handler = handlers.get(PluginEvents.communicate.index)
  if (!handler) throw new Error('index:communicate handler was not registered')
  return { handler, logHandlerError }
}

describe('plugin window transport communication', () => {
  it('does not acknowledge a plugin message until the lifecycle handler settles', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const onMessage = vi.fn(() => pending)
    const { handler } = createHarness(onMessage)

    let settled = false
    const response = handler(
      { key: 'browser-open:sync-settings', info: { revision: 4 } },
      { plugin: { name: 'touch-browser-open' } }
    )
    void response.then(() => {
      settled = true
    })
    await Promise.resolve()

    expect(onMessage).toHaveBeenCalledWith('browser-open:sync-settings', { revision: 4 })
    expect(settled).toBe(false)

    release()
    await expect(response).resolves.toEqual({ status: 'message_sent' })
  })

  it('returns the lifecycle rejection as an error instead of a sent acknowledgement', async () => {
    const onMessage = vi.fn(async () => {
      throw new Error('settings sync rejected')
    })
    const { handler, logHandlerError } = createHarness(onMessage)

    const response = await handler(
      { key: 'browser-open:sync-settings' },
      { plugin: { name: 'touch-browser-open' } }
    )

    expect(response).toEqual({ error: 'settings sync rejected' })
    expect(response).not.toHaveProperty('status')
    expect(logHandlerError).toHaveBeenCalledWith('index:communicate', expect.any(Error))
  })
})
