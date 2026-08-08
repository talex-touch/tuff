import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The service registered one touchEventBus listener and seven transport handlers and discarded
 * every disposer. onDestroy released only the unrelated uninstall invalidator, so all eight
 * survived module teardown (#533).
 */

const eventBusMock = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn()
}))

vi.mock('../core/eventbus/touch-event', () => ({
  touchEventBus: eventBusMock,
  TalexEvents: { PLUGIN_LOG_APPEND: 'plugin-log-append' }
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn()
}))

// plugin-log.service imports `shell` at module scope. Without this the suite loads the real
// electron entry point, which throws outside a packaged Electron install and reports as
// "Tests: no tests" rather than a failure — a guard that cannot run.
vi.mock('electron', () => ({ shell: { openPath: vi.fn(), showItemInFolder: vi.fn() } }))

// plugin-log.service imports `shell` at module scope. Without this the suite loads the real
// electron entry point, which throws outside a packaged Electron install and reports as
// "Tests: no tests" rather than a failure — a guard that cannot run.
vi.mock('electron', () => ({ shell: { openPath: vi.fn(), showItemInFolder: vi.fn() } }))

vi.mock('../modules/plugin/plugin-module', () => ({
  pluginModule: { registerUninstallAuthorityInvalidator: vi.fn(() => vi.fn()) }
}))

const { PluginLogModule } = await import('./plugin-log.service')

/** The slice of the module these cases drive; mirrors the pattern in common.test.ts. */
type PluginLogModuleTestInstance = {
  listenToLogEvents: () => void
  setupIpcHandlers: (transport: { on: (...args: unknown[]) => unknown }) => void
  onDestroy: () => Promise<void>
}

function createTransport() {
  const disposers: Array<ReturnType<typeof vi.fn>> = []
  const transport = {
    on: vi.fn(() => {
      const dispose = vi.fn()
      disposers.push(dispose)
      return dispose
    })
  }
  return { transport, disposers }
}

describe('PluginLogModule handler lifecycle', () => {
  beforeEach(() => {
    eventBusMock.on.mockClear()
    eventBusMock.off.mockClear()
  })

  it('releases every transport handler it registered', async () => {
    const { transport, disposers } = createTransport()
    const service = new PluginLogModule() as unknown as PluginLogModuleTestInstance

    service.listenToLogEvents()
    service.setupIpcHandlers(transport)

    expect(disposers).toHaveLength(7)
    expect(disposers.every((d) => d.mock.calls.length === 0)).toBe(true)

    await service.onDestroy()

    // The defect: all seven stayed attached.
    expect(disposers.every((d) => d.mock.calls.length === 1)).toBe(true)
  })

  it('removes the event-bus listener with the same handler reference', async () => {
    const { transport } = createTransport()
    const service = new PluginLogModule() as unknown as PluginLogModuleTestInstance

    service.listenToLogEvents()
    service.setupIpcHandlers(transport)
    await service.onDestroy()

    // touchEventBus.on returns boolean|void rather than a disposer, so removal goes through
    // off() -- and off() with a different closure is a silent no-op, so identity is the thing
    // that decides whether this works.
    expect(eventBusMock.off).toHaveBeenCalledTimes(1)
    expect(eventBusMock.off.mock.calls[0]![1]).toBe(eventBusMock.on.mock.calls[0]![1])
  })

  it('does not release the same disposer twice on a repeated destroy', async () => {
    const { transport, disposers } = createTransport()
    const service = new PluginLogModule() as unknown as PluginLogModuleTestInstance

    service.listenToLogEvents()
    service.setupIpcHandlers(transport)
    await service.onDestroy()
    await service.onDestroy()

    expect(disposers.every((d) => d.mock.calls.length === 1)).toBe(true)
  })
})
